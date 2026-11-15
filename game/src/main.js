// main.js — DUSTLINE entry point: wires input, player, bots, weapons, rounds,
// bomb, economy, HUD and audio into one fixed-step simulation (1/60 s)
// kept apart from rendering. Also owns the deterministic screenshot modes
// (?shot=start|buy|play|end&seed=1) and the window.__game debug hook the
// play test reads.
import * as THREE from 'three';
import { Rng, clamp, damp, fmtClock } from './util.js';
import { PALETTE } from './palette.js';
import { Economy, SHOP, START_MONEY } from './economy.js';
import { Rounds, BUY_TIME } from './rounds.js';
import { Bomb } from './bomb.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { AudioSys } from './audio.js';
import { World } from './world.js';
import { Hud } from './hud.js';
import { WeaponSys, WEAPONS, GRENADE } from './weapons.js';
import { Bots } from './bots.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 0) || Math.floor(Math.random() * 1e9);
const rng = new Rng(SEED);

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 220);
scene.add(camera);

const world = new World(scene, rng);
world.build();

// Sky gradient dome: dusty blue overhead fading to a warm desert horizon,
// so the sky reads as sky instead of flat fog colour. The dome is a plain
// canvas gradient on the inside of a large sphere; it never moves.
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 4;
skyCanvas.height = 256;
const sg = skyCanvas.getContext('2d');
const skyGrad = sg.createLinearGradient(0, 0, 0, 256);
skyGrad.addColorStop(0, '#5f93b0');
skyGrad.addColorStop(0.55, '#c9b183');
skyGrad.addColorStop(1, '#e8c98f');
sg.fillStyle = skyGrad;
sg.fillRect(0, 0, 4, 256);
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(170, 24, 16),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
);
scene.add(skyDome);
const input = new Input();
const audio = new AudioSys();
const player = new Player(camera);
const economy = new Economy();
const rounds = new Rounds();
const bomb = new Bomb();
const weapons = new WeaponSys(scene);
const bots = new Bots(scene, world, rng);
const hud = new Hud(document);

input.shotMode = !!SHOT;
input.attach(renderer.domElement, {
  onKey: () => audio.ensure(),
  onClick: () => {
    audio.ensure();
    input.requestLock(renderer.domElement);
    if (!game.started) startMatch();
    else if (rounds.state.matchOver) startMatch();
    else hud.hideOverlay();
  },
});

// The title screen's button is what a player actually clicks first: it must
// start the match (and lock the pointer), not just sit there. The canvas
// handler above only fires once the overlay is gone.
document.getElementById('play').addEventListener('click', () => {
  audio.ensure();
  input.requestLock(renderer.domElement);
  if (!game.started) startMatch();
  else if (rounds.state.matchOver) startMatch();
  else hud.hideOverlay();
});

// --- Viewmodel gun + muzzle flash (children of the camera) ---
const gunGroup = new THREE.Group();
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.52),
  new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.45, metalness: 0.5 }));
const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.34),
  new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.4, metalness: 0.6 }));
gunBarrel.position.set(0, 0.02, -0.4);
gunGroup.add(gunBody, gunBarrel);
gunGroup.position.set(0.3, -0.26, -0.55);
camera.add(gunGroup);
const flash = new THREE.PointLight(0xffc46b, 0, 10, 1.6);
flash.position.set(0.3, -0.2, -0.9);
camera.add(flash);
const flashQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
  new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, side: THREE.DoubleSide }));
flashQuad.position.set(0.3, -0.24, -0.95);
camera.add(flashQuad);

// --- Grenades ---
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e4a2e, roughness: 0.6, metalness: 0.3 });

const game = {
  started: false,
  buyOpen: false,
  time: 0,
  scoped: false,
  fov: 75,
  hint: '',
};

function faceYaw(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

function startRound() {
  const spawn = world.spawns.ember[0];
  player.reset(spawn[0], spawn[1], faceYaw(spawn[0], spawn[1], 0, 0));
  player.healFull();
  bots.spawnRound(rounds.state.round);
  bomb.reset('player');
  weapons.reset(['pistol']);
  if (economy.money >= 0 && rounds.state.round > 1) {
    // Keep owned guns between rounds; pistol always returns.
    for (const id of game.keptGuns || []) if (WEAPONS[id]) weapons.give(id);
  }
  game.keptGuns = ['pistol'];
  game.buyOpen = false;
  hud.setBuyOpen(false);
  hud.hideBanner();
  hud.kill(`— Round ${rounds.state.round} — EMBER attacks, SABLE defends —`);
  audio.sting();
}

function startMatch() {
  economy.reset();
  rounds.reset();
  game.started = true;
  game.keptGuns = ['pistol'];
  hud.hideOverlay();
  startRound();
}

rounds.onRoundEnd = (winner, title, reason) => {
  economy.awardRound(winner === 'EMBER');
  audio.jingle(winner === 'EMBER');
  hud.banner(title, `${reason}  ·  EMBER ${rounds.state.scoreV} — ${rounds.state.scoreE} SABLE`,
    winner === 'EMBER' ? '#ff8c3a' : '#4fb3a8');
  hud.kill(`— ${title}: ${reason} —`);
  game.buyOpen = false;
  hud.setBuyOpen(false);
  if (rounds.state.matchOver) {
    setTimeout(() => {
      hud.showOverlay(
        rounds.state.winner === 'EMBER' ? 'EMBER takes the match!' : 'SABLE takes the match',
        `Final score EMBER ${rounds.state.scoreV} — ${rounds.state.scoreE} SABLE. Click to play again.`,
      );
    }, 4200);
  }
};

bomb.onPlanted = (site) => {
  hud.kill(`💣 Bomb planted at Site ${site} — 35 seconds to detonation`);
  hud.radio('Ash: bomb is down, hold the site!');
  audio.plantBeep();
};
bomb.onDetonated = (site) => {
  rounds.endRound('EMBER', 'EMBER wins the round', `Bomb detonated at Site ${site}`);
};
bomb.onDefused = (site) => {
  rounds.endRound('SABLE', 'SABLE wins the round', `Bomb defused at Site ${site}`);
};
bomb.onDropped = () => { hud.kill('💣 Bomb dropped — a teammate can pick it up'); };

weapons.onShot = (kind) => {
  audio.shot(kind);
  player.recoil += WEAPONS[weapons.current].kick;
  flash.intensity = 3.2;
  flashQuad.material.opacity = 0.85;
  gunGroup.position.z = -0.48;
};
weapons.onDryFire = () => audio.dryFire();
weapons.onReloadStart = () => audio.reload();
weapons.onHit = (target, dmg, head, killed) => {
  hud.hitmarker(head);
  audio.hit();
  if (killed) audio.kill();
};
weapons.onKill = (target) => {
  economy.awardKill();
  hud.addKill('You', target.name, WEAPONS[weapons.current].name, false);
  hud.kill(`+$${300} kill reward`);
};

bots.onTracer = (from, to, color) => weapons.spawnTracer(from, to, color);
bots.onShotSound = (kind, dist) => { if (dist < 30) audio.shot(kind); };
bots.onRadio = (text) => hud.radio(text);
bots.onBotHit = (bot, target, killed, head) => {
  if (target.id === 'player') {
    audio.hurt();
    if (killed) {
      hud.kill(`💀 ${bot.name} eliminated you`);
      if (bomb.state.mode === 'carried' && bomb.state.carrier === 'player') {
        bomb.drop(player.pos.x, player.pos.z);
      }
    }
    return;
  }
  if (killed) {
    const victim = target.name || 'bot';
    hud.addKill(bot.name, victim, WEAPONS[bot.weaponId].name, head);
    if (bot.team === 'SABLE' && victim !== 'You') {
      // An EMBER teammate died; nothing to pay out.
    }
  }
};

function buyItem(item) {
  if (!game.buyOpen || rounds.phase !== 'buy') return;
  if (item.id === 'armor') {
    if (player.armor >= 100) return;
    if (!economy.buy(item)) return;
    player.armor = 100;
    hud.kill(`Bought body armor — $650`);
    return;
  }
  if (item.id === 'grenade') {
    if (!economy.buy(item)) return;
    weapons.grenades += 1;
    hud.kill(`Bought a frag grenade — $300`);
    return;
  }
  if (weapons.owned[item.id]) return; // already owned: no double charge
  if (!economy.buy(item)) return;
  weapons.give(item.id);
  game.keptGuns.push(item.id);
  hud.kill(`Bought ${item.name} — $${item.price}`);
  audio.reload();
}

function throwGrenade() {
  if (weapons.grenades <= 0 || rounds.phase !== 'live' || !player.alive) return;
  weapons.grenades -= 1;
  audio.grenadeThrow();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.castShadow = true;
  const origin = camera.position.clone();
  mesh.position.copy(origin);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: new THREE.Vector3(dir.x * 17, dir.y * 17 + 3.5, dir.z * 17),
    fuse: GRENADE.fuse,
  });
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  audio.explosion();
  flash.intensity = 5;
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8 }));
  boom.position.copy(g.mesh.position);
  scene.add(boom);
  setTimeout(() => scene.remove(boom), 220);
  const victims = [...bots.bots, {
    id: 'player', name: 'You', team: 'EMBER', pos: player.pos, alive: player.alive,
    takeDamage: (d, h) => player.damage(d, h),
  }];
  for (const v of victims) {
    if (!v.alive) continue;
    const d = Math.hypot(v.pos.x - g.mesh.position.x, v.pos.z - g.mesh.position.z);
    if (d > GRENADE.radius) continue;
    const dmg = Math.round(GRENADE.damage * (1 - (d / GRENADE.radius) * 0.7));
    const killed = v.takeDamage(dmg, false, 'player');
    if (killed && v.id !== 'player') {
      economy.awardKill();
      hud.addKill('You', v.name, 'Frag grenade', false);
    } else if (killed) {
      hud.kill('💀 Your own grenade got you');
      if (bomb.state.mode === 'carried' && bomb.state.carrier === 'player') bomb.drop(player.pos.x, player.pos.z);
    }
  }
}

function sim(dt) {
  // Before the player clicks play the yard waits: the round clock, the
  // bots and the bomb all hold still behind the title screen. Screenshot
  // modes bypass this so their staged scenes simulate immediately.
  if (!game.started && !SHOT) { input.endStep(); return; }
  game.time += dt;
  const phase = rounds.phase;
  // --- One-shot keys ---
  if (input.pressed('KeyB') && phase === 'buy' && player.alive) {
    game.buyOpen = !game.buyOpen;
    hud.setBuyOpen(game.buyOpen);
    audio.ensure();
  }
  if (input.pressed('KeyM')) {
    const muted = audio.toggleMute();
    hud.kill(muted ? '🔇 Sound muted (M to unmute)' : '🔊 Sound on');
  }
  if (game.buyOpen) {
    for (const item of SHOP) {
      if (input.pressed(`Digit${item.key}`)) buyItem(item);
    }
  } else if (player.alive) {
    if (input.pressed('Digit1')) {
      const primary = Object.keys(weapons.owned).find((id) => id !== 'pistol');
      if (primary) weapons.switchTo(primary);
    }
    if (input.pressed('Digit2')) weapons.switchTo('pistol');
    if (input.pressed('Digit3')) {
      const ids = Object.keys(weapons.owned);
      const next = ids[(ids.indexOf(weapons.current) + 1) % ids.length];
      weapons.switchTo(next);
    }
  }
  if (input.pressed('KeyR')) weapons.startReload(game.time);
  if (input.pressed('KeyG')) throwGrenade();

  // --- Look + movement ---
  const look = input.consumeLook();
  if (player.alive && (phase === 'live' || phase === 'buy')) player.look(look.dx, look.dy);
  if (player.alive && (phase === 'live' || phase === 'buy')) player.update(dt, input, world);

  // --- Aim / scope ---
  const aiming = input.aiming && player.alive;
  game.scoped = aiming && weapons.current === 'sniper';
  hud.setScoped(game.scoped);
  const targetFov = game.scoped ? 28 : aiming ? 62 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov = damp(camera.fov, targetFov, 14, dt);
    camera.updateProjectionMatrix();
  }

  // --- Firing ---
  const w = weapons.def;
  const wantFire = input.firing && player.alive && phase === 'live';
  const edge = wantFire && !game._wasFiring;
  game._wasFiring = wantFire;
  if (wantFire && (w.auto || edge) && weapons.canFire(game.time)) {
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const spread = weapons.spreadFor(player.moving, player.crouching, aiming);
    weapons.fire(game.time, origin, dir, bots.targets(), world, { spread, attacker: 'player' });
  }
  weapons.update(game.time, dt);

  // --- Plant / defuse (hold E) ---
  let hint = '';
  if (player.alive && phase === 'live') {
    const site = world.siteAt(player.pos.x, player.pos.z);
    if (bomb.state.mode === 'carried' && bomb.state.carrier === 'player' && site) {
      hint = `Hold E to plant at Site ${site} (${Math.ceil(bomb.state.plantProgress * 40) / 10}s / 2.5s)`;
      if (input.down('KeyE')) {
        if (bomb.tickPlant(dt, true, site)) audio.plantBeep();
      } else bomb.tickPlant(dt, false, site);
    } else if (bomb.state.mode === 'dropped') {
      const d = Math.hypot(player.pos.x - bomb.state.x, player.pos.z - bomb.state.z);
      if (d < 1.6) { bomb.pickup('player'); hud.kill('💣 You picked up the bomb'); }
      else hint = 'Bomb dropped nearby — walk over it to pick it up';
    }
  }
  game.hint = hint;
  hud.setHint(hint);

  // --- Grenades in flight ---
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 16 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.09) { g.mesh.position.y = 0.09; g.vel.y *= -0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    world.collideCircle(g.mesh.position, 0.1, 0.5);
    g.fuse -= dt;
    if (g.fuse <= 0) { explodeGrenade(g); grenades.splice(i, 1); }
  }

  // --- Bots ---
  if (phase === 'live' || phase === 'buy') {
    bots.update(dt, { player, bomb });
  }

  // --- Bomb fuse + beeps ---
  if (bomb.planted) {
    audio.bombBeep(bomb.state.fuse);
    if (bomb.tickFuse(dt)) { /* onDetonated ends the round */ }
  }

  // --- Round clock (frozen while the bomb is planted: the fuse rules) ---
  let ev = null;
  if (!(phase === 'live' && bomb.planted)) ev = rounds.tick(dt);
  if (ev === 'live') {
    game.buyOpen = false;
    hud.setBuyOpen(false);
    audio.sting();
    hud.kill('— Round live — good luck —');
  } else if (ev === 'intermission') {
    startRound();
  } else if (ev === 'round-start') {
    startRound();
  } else if (ev === 'match-over') {
    // Overlay is shown by the onRoundEnd timer; nothing to do here.
  }

  // --- Elimination win conditions (not while the bomb is planted) ---
  if (phase === 'live' && !bomb.planted) {
    if (bots.aliveCount('SABLE') === 0) {
      rounds.endRound('EMBER', 'EMBER wins the round', 'Enemy team eliminated');
    } else if (!player.alive && bots.aliveCount('EMBER') === 0) {
      rounds.endRound('SABLE', 'SABLE wins the round', 'Your team was eliminated');
    }
  }

  // --- Decay muzzle flash / viewmodel ---
  flash.intensity = damp(flash.intensity, 0, 18, dt);
  flashQuad.material.opacity = damp(flashQuad.material.opacity, 0, 18, dt);
  gunGroup.position.z = damp(gunGroup.position.z, -0.55, 10, dt);
  gunGroup.position.y = damp(gunGroup.position.y, weapons.reloading > 0 ? -0.36 : -0.26, 8, dt);
  gunGroup.rotation.x = damp(gunGroup.rotation.x, weapons.reloading > 0 ? 0.5 : 0, 8, dt);

  world.update(dt);
  input.endStep();
}

// --- HUD refresh (cheap, cached writes) ---
function refreshHud() {
  const st = weapons.state || { mag: 0, reserve: 0 };
  const roster = [
    { name: 'You', team: 'EMBER', alive: player.alive },
    ...bots.bots.map((b) => ({ name: b.name, team: b.team, alive: b.alive })),
  ];
  hud.update({
    dt: STEP,
    health: player.health,
    armor: player.armor,
    money: economy.money,
    mag: st.mag,
    reserve: st.reserve,
    reloading: weapons.reloading > 0,
    weaponName: WEAPONS[weapons.current].name.toUpperCase(),
    grenades: weapons.grenades,
    timerText: rounds.phase === 'buy' ? `BUY ${fmtClock(rounds.state.timer)}` : fmtClock(rounds.state.timer),
    round: rounds.state.round,
    scoreV: rounds.state.scoreV,
    scoreE: rounds.state.scoreE,
    bombLine: bomb.statusLine(),
    bombPlanted: bomb.planted,
    roster,
  });
  const spread = weapons.spreadFor(player.moving, player.crouching, input.aiming);
  hud.setCrosshair(game.scoped ? 0 : spread * 900);
  if (game.buyOpen) hud.renderBuy(SHOP, economy.money, weapons.owned);
}

// --- Deterministic screenshot modes ---
function applyShotMode() {
  input.shotMode = true;
  if (SHOT === 'start') {
    hud.showOverlay('DUSTLINE', 'A round-based tactical FPS. EMBER attacks, SABLE defends. Plant the bomb or eliminate the enemy team.');
    document.getElementById('overlay').style.background = 'rgba(10, 12, 10, 0.45)';
    // Bots visible in the yard behind the title panel.
    const spots = [[-8, 2], [-2, -4], [4, 4]];
    bots.bots.forEach((b, i) => {
      const s = spots[i % spots.length];
      b.pos.set(s[0] + i, 0, s[1] - i);
      b.mesh.position.set(b.pos.x, 0, b.pos.z);
      b.mesh.rotation.y = faceYaw(b.pos.x, b.pos.z, player.pos.x, player.pos.z);
    });
    player.reset(-27, 15, faceYaw(-27, 15, 0, 0));
    player.update(0.016, input, world);
    return;
  }
  hud.hideOverlay();
  if (SHOT === 'buy') {
    economy.money = 2800;
    game.buyOpen = true;
    hud.setBuyOpen(true);
    hud.buildBuy(SHOP);
    hud.renderBuy(SHOP, economy.money, weapons.owned);
    return;
  }
  if (SHOT === 'play') {
    rounds.state.phase = 'live';
    rounds.state.timer = 64;
    player.reset(-6, 6, faceYaw(-6, 6, -18, -12));
    player.update(0.016, input, world);
    // Stage a mid-fight: SABLE bots ahead toward Site A, EMBER bots flanking.
    const sableSpots = [[-14, -6], [-18, -10], [-10, -12], [-22, -4], [-8, -14]];
    const emberSpots = [[-10, 2], [-2, 8], [-12, 10], [-4, -2]];
    let si = 0, ei = 0;
    for (const b of bots.bots) {
      if (b.team === 'SABLE') {
        const s = sableSpots[si++ % sableSpots.length];
        b.pos.set(s[0], 0, s[1]);
      } else {
        const s = emberSpots[ei++ % emberSpots.length];
        b.pos.set(s[0], 0, s[1]);
      }
      b.state = 'combat';
      b.mesh.position.set(b.pos.x, 0, b.pos.z);
      b.mesh.rotation.y = faceYaw(b.pos.x, b.pos.z, player.pos.x, player.pos.z);
    }
    // A tracer across the lane so the fight reads in one frame.
    weapons.spawnTracer(new THREE.Vector3(-14, 1.4, -6), new THREE.Vector3(-6, 1.3, 4), 0xffe08a);
    return;
  }
  if (SHOT === 'end') {
    rounds.state.phase = 'end';
    rounds.state.timer = 4.5;
    rounds.state.scoreV = 1;
    rounds.state.scoreE = 0;
    rounds.state.endTitle = 'EMBER wins the round';
    rounds.state.endReason = 'Bomb detonated at Site A';
    // The bomb really did go off: show the detonated state in the HUD line.
    bomb.state.mode = 'detonated';
    bomb.state.site = 'A';
    bomb.state.fuse = 0;
    hud.banner('EMBER wins the round', 'Bomb detonated at Site A  ·  EMBER 1 — 0 SABLE', '#ff8c3a');
    player.reset(-12, -8, faceYaw(-12, -8, -20, -14));
    player.update(0.016, input, world);
    const spots = [[-16, -10], [-18, -6], [-14, -12]];
    bots.bots.forEach((b, i) => {
      const s = spots[i % spots.length];
      b.pos.set(s[0], 0, s[1]);
      b.mesh.position.set(b.pos.x, 0, b.pos.z);
    });
  }
}

// --- Boot ---
hud.buildBuy(SHOP);
economy.money = START_MONEY;
weapons.reset(['pistol']);
bots.spawnRound(1);
bomb.reset('player');
rounds.state.phase = 'buy';
rounds.state.timer = BUY_TIME;
if (SHOT) applyShotMode();
else hud.showOverlay('DUSTLINE', 'A round-based tactical FPS. EMBER attacks, SABLE defends. Plant the bomb or eliminate the enemy team. Click to play.');

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hook the play test reads: plain values, no live THREE objects.
window.__game = {
  get phase() { return rounds.phase; },
  rounds,
  economy,
  get playerHealth() { return player.health; },
  get playerPos() { return [player.pos.x, player.pos.y, player.pos.z]; },
  get bots() {
    return {
      bots: bots.bots.map((b) => ({
        name: b.name, team: b.team,
        pos: { x: b.pos.x, y: b.pos.y, z: b.pos.z },
        health: b.health, alive: b.alive, state: b.state,
        pathIndex: b.pathIndex,
        path: b.path.map((i) => world.waypoints[i]),
      })),
    };
  },
  bomb,
  player,
  weapons,
  world,
};

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // Clamp the step so a stalled tab never has to catch up a whole second;
  // 15 steps cover the clamp, so even a slow software renderer keeps the
  // simulation on wall-clock time instead of falling behind it.
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  // In screenshot modes the scene is staged; still simulate so bots move.
  while (acc >= STEP && steps < 15) {
    sim(STEP);
    acc -= STEP;
    steps += 1;
  }
  if (steps === 15) acc = 0;
  refreshHud();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
