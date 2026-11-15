// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. DUSTLINE is a round-based tactical FPS: VANGUARD (the player
// + 3 bots) attacks, EMBER (4 bots) defends two bomb sites. Win a round by
// elimination, by planting the bomb and letting it blow, or by stopping the
// plant. Money between rounds buys weapons, grenades and armor.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createBotManager } from './bots.js';
import { createBomb, PLANT_TIME, BOMB_TIMER } from './bomb.js';
import { createEconomy, KILL_REWARD, PLANT_REWARD } from './economy.js';
import { createRounds, BUY_TIME, ROUND_TIME, END_TIME, WIN_ROUNDS, MAX_ROUNDS } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { clamp, mulberry32 } from './util.js';

const FIXED_STEP = 1 / 60;
const FOV = 74;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 1);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 62);

const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const economy = createEconomy();
const rounds = createRounds();
const bomb = createBomb(scene);
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const input = createInput(canvas, (locked) => {
  if (!locked && rounds.state.phase !== 'menu' && !shot) hud.showOverlay('paused');
});

// The player as an enemy for bots: a live reference to the player state.
const playerProxy = { isPlayer: true, alive: true, pos: player.state.position, name: 'YOU' };

// Raycasting: world meshes block sight and stop bullets; bot bodies stop bullets.
const shootables = [...world.meshes];
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const tmpDir = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();

function shootRay(from, dir, maxDist) {
  raycaster.set(from, dir);
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(shootables, false);
  if (hits.length === 0) return null;
  const hit = hits[0];
  return {
    point: hit.point.clone(),
    distance: hit.distance,
    object: hit.object,
    botName: hit.object.userData.botName || null,
    objectName: hit.object.name || '',
  };
}

function hasLineOfSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  dir.normalize();
  raycaster.set(from, dir);
  raycaster.far = dist - 0.05;
  return raycaster.intersectObjects(world.meshes, false).length === 0;
}

function botByName(name) {
  return bots.bots.find((b) => b.name === name) || null;
}

// Tracers and impact puffs, pooled so firing never allocates.
const tracers = [];
for (let i = 0; i < 12; i += 1) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  line.visible = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function spawnTracer(from, to) {
  const t = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  t.line.geometry.setFromPoints([from, to]);
  t.line.material.opacity = 0.85;
  t.line.visible = true;
  t.life = 0.07;
}
const puffs = [];
for (let i = 0; i < 10; i += 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.sand), transparent: true, opacity: 0 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  puffs.push({ mesh, life: 0 });
}
let puffIndex = 0;
function spawnPuff(point) {
  const p = puffs[puffIndex];
  puffIndex = (puffIndex + 1) % puffs.length;
  p.mesh.position.copy(point);
  p.mesh.scale.setScalar(1);
  p.mesh.material.opacity = 0.8;
  p.mesh.visible = true;
  p.life = 0.3;
}

// Grenades and explosions.
const grenades = [];
const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(PALETTE.teamRed),
  roughness: 0.5,
  metalness: 0.4,
});
function throwGrenade(from, dir) {
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(from);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 5.5, 0)),
    fuse: 1.6,
    fromPlayer: true,
  });
  audio.grenadeThrow();
  weapons.state.grenades -= 1;
}
const explosionLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 26);
scene.add(explosionLight);
const explosionMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
);
explosionMesh.visible = false;
scene.add(explosionMesh);
let explosionLife = 0;
let shake = 0;

function explode(pos, radius, maxDamage, source) {
  explosionMesh.position.copy(pos);
  explosionMesh.visible = true;
  explosionLife = 0.5;
  explosionLight.position.copy(pos);
  explosionLight.intensity = 60;
  audio.explosion();
  shake = Math.max(shake, 0.6);
  const victims = [...bots.bots, playerProxy];
  for (const victim of victims) {
    if (!victim.alive) continue;
    const d = Math.hypot(victim.pos.x - pos.x, victim.pos.z - pos.z);
    if (d > radius) continue;
    const damage = Math.round(maxDamage * (1 - (d / radius) * 0.75));
    const self = source === victim;
    applyDamage(victim, self ? Math.round(damage * 0.3) : damage, false, source, 'HE');
  }
}

function applyDamage(target, damage, headshot, attacker, weaponName) {
  if (!target.alive) return;
  if (target.isPlayer) {
    const final = weapons.state.armor ? Math.round(damage * 0.5) : damage;
    playerHealth -= final;
    audio.hurt();
    if (attacker && !attacker.isPlayer) {
      const dx = attacker.pos.x - player.state.position.x;
      const dz = attacker.pos.z - player.state.position.z;
      const worldAngle = Math.atan2(dx, dz);
      const rel = worldAngle - player.state.yaw;
      hud.damageFrom((rel * 180) / Math.PI);
    }
    if (playerHealth <= 0) {
      playerHealth = 0;
      playerDies(attacker, weaponName, headshot);
    }
    return;
  }
  target.health -= damage;
  if (target.health <= 0) {
    target.health = 0;
    bots.kill(target);
    const attackerName = attacker && attacker.isPlayer ? 'YOU' : attacker ? attacker.name : '—';
    hud.addKill(attackerName, weaponName || target.weapon.name, target.name, headshot);
    if (attacker && attacker.isPlayer) {
      economy.add(KILL_REWARD);
      audio.kill();
    }
    if (target.carriesBomb) {
      bomb.dropAt(target.pos.clone());
      bots.dropBomb(target);
    }
    checkRoundEnd();
  }
}

// Bots: creation, perception and shooting callbacks live here.
const botCtx = {
  seed,
  get now() {
    return now;
  },
  get playerSpeed() {
    return player.groundSpeed();
  },
  registerShootable(mesh) {
    shootables.push(mesh);
  },
  unregisterShootable(mesh) {
    const i = shootables.indexOf(mesh);
    if (i >= 0) shootables.splice(i, 1);
  },
  hasLineOfSight,
  raycast: shootRay,
  onDamage(target, damage, headshot, attacker) {
    applyDamage(target, damage, headshot, attacker, attacker ? attacker.weapon.name : 'AR-77');
  },
  onBotShot(bot, muzzle, dir, dist) {
    spawnTracer(muzzle, muzzle.clone().add(dir.clone().multiplyScalar(Math.min(dist + 8, 40))));
    if (dist < 30) audio.enemyShot(dist);
    botCtx.hearNoiseFor(bot, muzzle);
  },
  hearNoiseFor(bot, pos) {
    bots.hearNoise(pos, bot.team);
  },
  onStep(pos, speed) {
    const d = Math.hypot(pos.x - player.state.position.x, pos.z - player.state.position.z);
    if (d < 12) audio.step(speed > 4);
  },
  onPlant(bot) {
    bomb.plantAt(bot.site, bot.pos.clone());
    bots.rotateToSite(bot.site);
    bots.sendDefuser(bomb.state.pos);
    hud.setBomb(`BOMB PLANTED at ${bot.site} — ${formatTime(bomb.state.timer)}`, bomb.state.timer < 10);
  },
  onDefuse() {
    bomb.state.mode = 'defused';
    endRound('EMBER', 'defuse');
  },
};
const bots = createBotManager(scene, world, botCtx);

let now = 0;
let playerHealth = 100;
let spectateTarget = null;
let prevFiring = false;
let stepAt = 0;

const ATTACKERS = [
  { name: 'VEX', spawn: world.attackerSpawns[1], site: 'A', weaponId: 'rifle' },
  { name: 'JUNO', spawn: world.attackerSpawns[2], site: 'A', weaponId: 'smg' },
  { name: 'KAI', spawn: world.attackerSpawns[3], site: 'B', weaponId: 'rifle' },
];
const DEFENDERS = [
  { name: 'RUST', spawn: world.defenderSpawns[0], site: 'A' },
  { name: 'COAL', spawn: world.defenderSpawns[1], site: 'A' },
  { name: 'ASH', spawn: world.defenderSpawns[2], site: 'B' },
  { name: 'SMOKE', spawn: world.defenderSpawns[3], site: 'B' },
];

function formatTime(s) {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

function siteAt(pos) {
  for (const [key, site] of Object.entries(world.sites)) {
    if (Math.hypot(pos.x - site.x, pos.z - site.z) <= site.r) return key;
  }
  return null;
}

function startMatch() {
  economy.reset();
  weapons.resetMatch();
  rounds.startMatch();
  startRound();
}

function startRound() {
  rounds.startRound();
  playerHealth = 100;
  playerProxy.alive = true;
  spectateTarget = null;
  const spawn = world.attackerSpawns[0];
  player.state.position.set(spawn.x, 0, spawn.z);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = 0;
  player.state.pitch = 0;
  weapons.refillRound();
  bomb.reset();
  bomb.giveTo('player');
  bots.spawnRound(ATTACKERS, DEFENDERS, null);
  hud.hideBanner();
  hud.hideAction();
  hud.setBomb('BOMB — plant it at A or B (hold E on site)', false);
  showBuyMenu();
  audio.roundStart();
}

function beginLive() {
  rounds.beginLive();
  hud.hideBuy();
}

function endRound(winner, reason) {
  if (!rounds.endRound(winner, reason)) return;
  economy.roundEnd(winner === 'VANGUARD');
  hud.hideAction();
  hud.hideBuy();
  hud.setBomb('', false);
  const reasonText = {
    elimination: winner === 'VANGUARD' ? 'EMBER team eliminated' : 'VANGUARD team eliminated',
    bomb: 'Bomb detonated',
    defuse: 'Bomb defused',
    time: 'Time expired — no plant',
  }[reason] || reason;
  const won = winner === 'VANGUARD';
  hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', reasonText);
  if (won) audio.roundWin();
  else audio.roundLose();
}

function endMatch() {
  rounds.endMatch();
  const won = rounds.state.scoreV > rounds.state.scoreE;
  hud.showOverlay(won ? 'matchWin' : 'matchLose');
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const vAlive = bots.aliveCount('VANGUARD') + (playerProxy.alive ? 1 : 0);
  const eAlive = bots.aliveCount('EMBER');
  if (eAlive === 0) {
    endRound('VANGUARD', 'elimination');
    return;
  }
  if (vAlive === 0) {
    if (bomb.state.mode === 'planted') return; // defenders still have to defuse
    endRound('EMBER', 'elimination');
  }
}

function playerDies(attacker, weaponName, headshot) {
  playerProxy.alive = false;
  weapons.onDeath();
  if (bomb.state.mode === 'carried' && bomb.state.carrier === 'player') {
    bomb.dropAt(player.state.position.clone());
  }
  const attackerName = attacker && !attacker.isPlayer ? attacker.name : '—';
  hud.addKill(attackerName, weaponName || 'AR-77', 'YOU', headshot);
  // A friendly bot picks the bomb up if one is close; otherwise it stays dropped.
  const carrier = bots.bots.find(
    (b) => b.alive && b.team === 'VANGUARD' &&
      Math.hypot(b.pos.x - bomb.state.pos.x, b.pos.z - bomb.state.pos.z) < 6,
  );
  if (carrier && bomb.state.mode === 'dropped') {
    bomb.giveTo(carrier);
    bots.giveBomb(carrier);
  }
  spectateTarget = bots.bots.find((b) => b.alive && b.team === 'VANGUARD') || null;
  hud.showBanner('YOU DIED', 'Spectating your team');
  checkRoundEnd();
}

function showBuyMenu() {
  const items = [
    { id: 'rifle', key: '1', name: 'AR-77 Rifle', desc: '34 dmg, 30 rounds, reliable', price: WEAPONS.rifle.price, owned: weapons.state.owned.rifle, affordable: economy.money >= WEAPONS.rifle.price },
    { id: 'smg', key: '2', name: 'VULCAN-9 SMG', desc: '22 dmg, very fast fire', price: WEAPONS.smg.price, owned: weapons.state.owned.smg, affordable: economy.money >= WEAPONS.smg.price },
    { id: 'sniper', key: '3', name: 'LONGSHOT Sniper', desc: '90 dmg, right-click to zoom', price: WEAPONS.sniper.price, owned: weapons.state.owned.sniper, affordable: economy.money >= WEAPONS.sniper.price },
    { id: 'grenade', key: '4', name: 'HE Grenade', desc: 'Throw with G, 1.6s fuse', price: GRENADE_PRICE, owned: false, affordable: economy.money >= GRENADE_PRICE },
    { id: 'armor', key: '5', name: 'Kevlar Armor', desc: 'Halves damage taken', price: ARMOR_PRICE, owned: weapons.state.armor, affordable: economy.money >= ARMOR_PRICE },
  ];
  hud.showBuy(items);
  hud.setMoney(economy.money);
}

function buyItem(id) {
  let price = -1;
  if (id === 'grenade') price = weapons.buyGrenade(economy.money);
  else if (id === 'armor') price = weapons.buyArmor(economy.money);
  else price = weapons.buy(id, economy.money);
  if (price >= 0) {
    economy.spend(price);
    audio.buy();
    showBuyMenu();
  } else {
    audio.denied();
  }
}

hud.onBuy((id) => {
  if (rounds.state.phase !== 'buy') return;
  buyItem(id);
});

hud.onPlay(() => {
  audio.unlock();
  input.requestLock();
  if (rounds.state.phase === 'menu' || rounds.state.phase === 'matchEnd') {
    hud.hideOverlay();
    startMatch();
  } else {
    hud.hideOverlay();
  }
});

function playerShoot() {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryFire();
    weapons.reload();
    return;
  }
  weapons.pullTrigger();
  audio.shot(def.kind);
  player.recoil(def.id === 'sniper' ? 0.028 : 0.011, (Math.random() - 0.5) * 0.004);
  const speed = player.groundSpeed();
  const spread = weapons.spread(speed, input.state.aiming);
  camera.getWorldDirection(tmpDir);
  tmpDir.x += (Math.random() - 0.5) * 2 * spread;
  tmpDir.y += (Math.random() - 0.5) * 2 * spread;
  tmpDir.z += (Math.random() - 0.5) * 2 * spread;
  tmpDir.normalize();
  camera.getWorldPosition(tmpFrom);
  tmpFrom.add(tmpDir.clone().multiplyScalar(0.6));
  const hit = shootRay(tmpFrom, tmpDir, 90);
  const end = hit ? hit.point : tmpFrom.clone().add(tmpDir.clone().multiplyScalar(60));
  spawnTracer(tmpFrom, end);
  if (hit && hit.botName) {
    const target = botByName(hit.botName);
    const headshot = hit.objectName.startsWith('head:');
    let damage = headshot ? def.headDamage : def.damage;
    if (hit.distance > 30) damage = Math.round(damage * 0.8);
    if (hit.distance > 45) damage = Math.round(damage * 0.6);
    const wasAlive = target && target.alive;
    applyDamage(target, damage, headshot, playerProxy, def.name);
    if (wasAlive) {
      hud.hitMarker(target && !target.alive, headshot);
      audio.hit(headshot);
    }
  } else if (hit) {
    spawnPuff(hit.point);
  }
  bots.hearNoise(tmpFrom, 'VANGUARD');
}

function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 20 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    const p = g.mesh.position;
    for (const box of world.colliders) {
      if (p.x > box.min.x && p.x < box.max.x && p.y > box.min.y && p.y < box.max.y && p.z > box.min.z && p.z < box.max.z) {
        // Bounce: push out along the smallest penetration and dampen.
        const dxl = p.x - box.min.x;
        const dxr = box.max.x - p.x;
        const dzl = p.z - box.min.z;
        const dzr = box.max.z - p.z;
        const dyl = p.y - box.min.y;
        const dyr = box.max.y - p.y;
        const m = Math.min(dxl, dxr, dzl, dzr, dyl, dyr);
        if (m === dxl) { p.x = box.min.x - 0.01; g.vel.x = -Math.abs(g.vel.x) * 0.4; }
        else if (m === dxr) { p.x = box.max.x + 0.01; g.vel.x = Math.abs(g.vel.x) * 0.4; }
        else if (m === dzl) { p.z = box.min.z - 0.01; g.vel.z = -Math.abs(g.vel.z) * 0.4; }
        else if (m === dzr) { p.z = box.max.z + 0.01; g.vel.z = Math.abs(g.vel.z) * 0.4; }
        else if (m === dyl) { p.y = box.min.y - 0.01; g.vel.y = -Math.abs(g.vel.y) * 0.4; }
        else { p.y = box.max.y + 0.01; g.vel.y = Math.abs(g.vel.y) * 0.4; }
      }
    }
    if (p.y < 0.09) {
      p.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    if (g.fuse <= 0) {
      explode(p.clone(), 5.5, 110, playerProxy);
      scene.remove(g.mesh);
      grenades.splice(i, 1);
    }
  }
}

function updatePlayer(dt) {
  const look = input.takeLook();
  player.look(look.x, look.y);
  player.step(dt, input.state.keys);
  const speed = player.groundSpeed();
  if (player.state.onGround && speed > 1.5 && now - stepAt > 0.38) {
    stepAt = now;
    audio.step(speed > 4);
  }
  // Aim: the sniper zooms with right mouse.
  const wantFov = input.state.aiming && weapons.def().id === 'sniper' ? FOV / WEAPONS.sniper.zoom : FOV;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  // Fire.
  const firing = input.state.firing;
  const def = weapons.def();
  if (firing && weapons.ready()) {
    if (def.auto || !prevFiring) playerShoot();
  }
  prevFiring = firing;
  // Reload and weapon switching.
  for (const action of input.takePressed()) {
    if (action === 'reload') {
      if (weapons.reload()) audio.reload();
    } else if (action === 'grenade') {
      if (rounds.state.phase === 'live' && weapons.state.grenades > 0) {
        camera.getWorldDirection(tmpDir);
        camera.getWorldPosition(tmpFrom);
        throwGrenade(tmpFrom.clone().add(tmpDir.clone().multiplyScalar(0.8)), tmpDir.clone());
      }
    } else if (action === 'cycle') {
      const order = ['pistol', 'rifle', 'smg', 'sniper'].filter((id) => weapons.state.owned[id]);
      const next = order[(order.indexOf(weapons.state.current) + 1) % order.length];
      if (weapons.switchTo(next)) audio.click();
    } else if (action.startsWith('slot')) {
      const buyOpen = rounds.state.phase === 'buy' && !document.getElementById('buy-menu').hidden;
      if (buyOpen) {
        // In the buy menu the same keys buy instead of switching weapons.
        const buyIds = ['rifle', 'smg', 'sniper', 'grenade', 'armor'];
        const id = buyIds[Number(action.slice(4)) - 1];
        if (id) buyItem(id);
        continue;
      }
      const order = ['pistol', 'rifle', 'smg', 'sniper'];
      const id = order[Number(action.slice(4)) - 1];
      if (id && weapons.switchTo(id)) audio.click();
    } else if (action === 'buy') {
      if (rounds.state.phase === 'buy') {
        const menuOpen = !document.getElementById('buy-menu').hidden;
        if (menuOpen) hud.hideBuy();
        else showBuyMenu();
      }
    }
  }
  // Planting: hold E on a site while carrying the bomb.
  if (bomb.state.mode === 'carried' && bomb.state.carrier === 'player') {
    const site = siteAt(player.state.position);
    const holding = input.state.keys.has('KeyE');
    const still = speed < 1;
    if (site && holding && still && rounds.state.phase === 'live') {
      bomb.state.plantProgress += dt;
      hud.showAction(`PLANTING AT ${site} — hold E`, bomb.state.plantProgress / PLANT_TIME);
      if (Math.floor(bomb.state.plantProgress * 4) !== Math.floor((bomb.state.plantProgress - dt) * 4)) {
        audio.plantTick();
      }
      if (bomb.state.plantProgress >= PLANT_TIME) {
        bomb.plantAt(site, player.state.position.clone());
        economy.add(PLANT_REWARD);
        hud.hideAction();
        bots.rotateToSite(site);
        bots.sendDefuser(bomb.state.pos);
        hud.setBomb(`BOMB PLANTED at ${site} — ${formatTime(bomb.state.timer)}`, false);
      }
    } else {
      if (bomb.state.plantProgress > 0) {
        bomb.state.plantProgress = Math.max(0, bomb.state.plantProgress - dt * 2);
      }
      hud.hideAction();
    }
  } else if (bomb.state.mode === 'dropped') {
    // Walk over a dropped bomb to pick it up.
    const d = Math.hypot(player.state.position.x - bomb.state.pos.x, player.state.position.z - bomb.state.pos.z);
    if (d < 1.3 && playerProxy.alive) {
      bomb.giveTo('player');
      hud.setBomb('BOMB — plant it at A or B (hold E on site)', false);
    }
  }
}

function updateSpectate(dt) {
  if (!spectateTarget || !spectateTarget.alive) {
    spectateTarget = bots.bots.find((b) => b.alive && b.team === 'VANGUARD') || null;
    if (!spectateTarget) return;
  }
  camera.position.set(spectateTarget.pos.x, spectateTarget.pos.y + 1.55, spectateTarget.pos.z);
  camera.rotation.set(spectateTarget.pitch, spectateTarget.yaw, 0);
  camera.fov += (FOV - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();
}

function updateHud() {
  const r = rounds.state;
  hud.setHealth(playerHealth);
  hud.setArmor(weapons.state.armor);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve);
  hud.setWeapon(weapons.def().name, weapons.state.grenades);
  hud.setMoney(economy.money);
  hud.setTimer(r.timer, r.phase);
  hud.setScore(r.scoreV, r.scoreE, Math.max(1, r.round), MAX_ROUNDS);
  const order = ['pistol', 'rifle', 'smg', 'sniper'];
  const slots = order
    .filter((id) => weapons.state.owned[id])
    .map((id) => ({ id, key: order.indexOf(id) + 1, name: WEAPONS[id].name, owned: true }));
  hud.setSlots(slots, weapons.state.current);
  const spreadPx = 6 + weapons.spread(player.groundSpeed(), input.state.aiming) * 900;
  hud.setCrosshair(spreadPx);
  if (bomb.state.mode === 'planted') {
    hud.setBomb(`BOMB PLANTED at ${bomb.state.site} — ${formatTime(bomb.state.timer)}`, bomb.state.timer < 10);
  } else if (bomb.state.mode === 'dropped') {
    hud.setBomb('BOMB DROPPED — pick it up', false);
  } else if (bomb.state.mode === 'carried' && bomb.state.carrier && bomb.state.carrier !== 'player') {
    hud.setBomb(`${bomb.state.carrier.name} carries the bomb`, false);
  }
}

function update(dt) {
  now += dt;
  const r = rounds.state;

  if (r.phase === 'buy') {
    rounds.step(dt);
    if (r.timer <= 0) beginLive();
    if (playerProxy.alive) updatePlayer(dt);
    bots.update(dt, playerProxy);
  } else if (r.phase === 'live') {
    rounds.step(dt);
    if (playerProxy.alive) updatePlayer(dt);
    else updateSpectate(dt);
    bots.update(dt, playerProxy);
    updateGrenades(dt);
    bomb.step(dt, now, (urgent) => audio.beep(urgent));
    if (bomb.state.mode === 'planted' && bomb.state.timer <= 0) {
      explode(bomb.state.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 14, 200, null);
      bomb.state.mode = 'exploded';
      endRound('VANGUARD', 'bomb');
    }
    if (r.timer <= 0 && bomb.state.mode !== 'planted') {
      endRound('EMBER', 'time');
    }
    // A dropped bomb near a friendly bot gets picked up.
    if (bomb.state.mode === 'dropped') {
      const carrier = bots.bots.find(
        (b) => b.alive && b.team === 'VANGUARD' &&
          Math.hypot(b.pos.x - bomb.state.pos.x, b.pos.z - bomb.state.pos.z) < 1.5,
      );
      if (carrier) {
        bomb.giveTo(carrier);
        bots.giveBomb(carrier);
      }
    }
  } else if (r.phase === 'end') {
    rounds.step(dt);
    bots.update(dt, playerProxy);
    updateGrenades(dt);
    if (playerProxy.alive) updatePlayer(dt);
    else updateSpectate(dt);
    if (r.timer <= 0) {
      if (rounds.matchOver()) endMatch();
      else startRound();
    }
  }

  weapons.step(dt);
  // Tracers and puffs fade.
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  for (const p of puffs) {
    if (p.life > 0) {
      p.life -= dt;
      p.mesh.scale.setScalar(1 + (0.3 - p.life) * 6);
      p.mesh.material.opacity = Math.max(0, p.life / 0.3) * 0.8;
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
  if (explosionLife > 0) {
    explosionLife -= dt;
    const t = 1 - explosionLife / 0.5;
    explosionMesh.scale.setScalar(1 + t * 11);
    explosionMesh.material.opacity = Math.max(0, 0.9 * (1 - t));
    explosionLight.intensity = 60 * (1 - t);
    if (explosionLife <= 0) {
      explosionMesh.visible = false;
      explosionLight.intensity = 0;
    }
  }
  shake = Math.max(0, shake - dt * 1.8);
  updateHud();

  // Camera follows the player (first person) unless spectating.
  if (playerProxy.alive) {
    camera.position.set(
      player.state.position.x,
      player.state.position.y + player.state.eye,
      player.state.position.z,
    );
    camera.rotation.set(player.state.pitch, player.state.yaw, 0);
    if (shake > 0) {
      camera.rotation.x += (Math.random() - 0.5) * shake * 0.06;
      camera.rotation.y += (Math.random() - 0.5) * shake * 0.06;
    }
  }
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function render() {
  renderer.render(scene, camera);
}

// Fixed-step simulation, render at display rate.
let accumulator = 0;
let last = performance.now();
function frame(time) {
  const elapsed = Math.min(0.1, (time - last) / 1000);
  last = time;
  accumulator += elapsed;
  while (accumulator >= FIXED_STEP) {
    update(FIXED_STEP);
    accumulator -= FIXED_STEP;
  }
  render();
  requestAnimationFrame(frame);
}

// Deterministic captures: set up a frame, render it twice, freeze.
function runShot(mode, seedValue) {
  const rng = mulberry32(seedValue);
  window.__shotReady = false;
  if (mode === 'start') {
    rounds.state.phase = 'menu';
    player.state.position.set(0, 0, 13);
    player.state.yaw = 0;
    player.state.pitch = 0.02;
    bots.spawnRound(ATTACKERS, DEFENDERS, null);
    hud.showOverlay('start');
  } else if (mode === 'buy') {
    hud.hideOverlay();
    startMatch();
    // Buy phase with the menu open and some money to spend.
    economy.add(2000);
    showBuyMenu();
  } else if (mode === 'play') {
    hud.hideOverlay();
    startMatch();
    rounds.beginLive();
    hud.hideBuy();
    // Player at mid, aiming down the lane at a defender standing in the open.
    player.state.position.set(0, 0, 4);
    player.state.yaw = 0;
    player.state.pitch = 0;
    const defender = bots.bots.find((b) => b.team === 'EMBER');
    if (defender) {
      defender.pos.set(-0.5, 0, -4);
      defender.group.position.copy(defender.pos);
      defender.yaw = Math.PI;
      defender.group.rotation.y = Math.PI;
    }
    // Fire once so the muzzle flash and tracer are in the frame.
    playerShoot();
    weapons.step(0.03);
  } else if (mode === 'end') {
    hud.hideOverlay();
    startMatch();
    rounds.beginLive();
    hud.hideBuy();
    // Stand at mid so the yard is the backdrop behind the banner.
    player.state.position.set(0, 0, 4);
    player.state.yaw = 0;
    player.state.pitch = 0;
    endRound('VANGUARD', 'elimination');
  }
  update(0);
  render();
  render();
  window.__shotReady = true;
}

// Debug hook for automated testing: the live state, read-only from outside.
window.__game = {
  rounds,
  bots,
  bomb,
  economy,
  get playerHealth() {
    return playerHealth;
  },
  get playerPos() {
    return { x: player.state.position.x, z: player.state.position.z, alive: playerProxy.alive };
  },
  get phase() {
    return rounds.state.phase;
  },
};

if (shot) {
  runShot(shot, seed);
  document.getElementById('hud').hidden = shot === 'start';
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
