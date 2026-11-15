// bots.js — the nine bots: four EMBER teammates and five SABLE defenders.
// Each bot walks a waypoint path (BFS over the map graph), fights on line of
// sight with a reaction delay and aim error, takes cover when hurt, and
// plays the objective: the EMBER carrier plants at a site, SABLE rotates
// and defuses. Bots talk through short radio lines in the kill feed.
import * as THREE from 'three';
import { clamp, dist2D, rayHitsBox, rayHitsSphere } from './util.js';
import { WEAPONS } from './weapons.js';
import { PALETTE } from './palette.js';

const EMBER_NAMES = ['Ash', 'Flint', 'Cinder', 'Spark'];
const SABLE_NAMES = ['Onyx', 'Slate', 'Basalt', 'Umbra', 'Vesper'];
const RADIO = {
  push: ['pushing {site} now', 'moving on {site}', 'stacking {site}', 'through mid, watch the doors'],
  hold: ['holding {site}', 'watching {site} long', 'covering {site}'],
  contact: ['contact at {site}!', 'enemy spotted near {site}', 'taking fire at {site}'],
  plant: ['planting the charge', 'charge going down at {site}', 'cover me, planting'],
  defuse: ['defusing, keep them off me', 'on the bomb, buy me time'],
  down: ['{name} is down', 'we lost {name}'],
};
const BOT_SPEED = 3.4;
const BOT_COMBAT_SPEED = 2.2;

function makeBody(team) {
  const group = new THREE.Group();
  const main = team === 'EMBER' ? PALETTE.ember : PALETTE.teal;
  const dark = team === 'EMBER' ? PALETTE.emberDark : PALETTE.tealDark;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34),
    new THREE.MeshStandardMaterial({ color: main, roughness: 0.9 }));
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xc9a06b, roughness: 0.9 }));
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36),
    new THREE.MeshStandardMaterial({ color: team === 'EMBER' ? PALETTE.emberBright : PALETTE.tealBright, roughness: 0.6 }));
  band.position.y = 1.68;
  group.add(band);
  const legMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.95 });
  for (const sx of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.26), legMat);
    leg.position.set(sx, 0.31, 0);
    group.add(leg);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.78),
    new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5, metalness: 0.4 }));
  gun.position.set(0.28, 1.18, 0.42);
  group.add(gun);
  return group;
}

export class Bots {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.bots = [];
    this.time = 0;
  }

  spawnRound(roundNum) {
    for (const b of this.bots) this.scene.remove(b.mesh);
    this.bots = [];
    const mk = (name, team, spawn, weaponId) => {
      const mesh = makeBody(team);
      this.scene.add(mesh);
      const bot = {
        id: `${team}-${name}`, name, team, weaponId,
        pos: new THREE.Vector3(spawn[0], 0, spawn[1]),
        yaw: team === 'EMBER' ? Math.PI * 0.75 : -Math.PI * 0.25,
        health: 100, armor: this.rng.chance(0.5) ? 50 : 0,
        alive: true, state: 'move',
        path: [], pathIndex: 0,
        targetSite: null, holdNode: -1,
        reaction: 0, aimErr: 0.02, lastShot: -10, mag: WEAPONS[weaponId].mag,
        reloading: 0, speed: BOT_SPEED, visibleEnemy: null,
        radioCd: this.rng.range(2, 9), isCarrier: false,
        mesh, walkPhase: this.rng.range(0, 6), stuck: 0, lastX: spawn[0], lastZ: spawn[1],
      };
      bot.takeDamage = (dmg, head, attacker) => this.damageBot(bot, dmg, head, attacker);
      this.bots.push(bot);
      return bot;
    };
    EMBER_NAMES.forEach((n, i) => mk(n, 'EMBER', this.world.spawns.ember[i + 1] || this.world.spawns.ember[0],
      ['rifle', 'smg', 'shotgun', 'rifle'][i]));
    SABLE_NAMES.forEach((n, i) => mk(n, 'SABLE', this.world.spawns.sable[i],
      ['rifle', 'sniper', 'smg', 'rifle', 'shotgun'][i]));
    // Objectives: EMBER splits between the sites, SABLE holds one each.
    const ember = this.bots.filter((b) => b.team === 'EMBER');
    ember.forEach((b, i) => { b.targetSite = i % 2 === 0 ? 'A' : 'B'; });
    const sable = this.bots.filter((b) => b.team === 'SABLE');
    sable.forEach((b, i) => { b.targetSite = i < 3 ? 'A' : 'B'; b.holdNode = this.world.nearestWaypoint(this.world.sites[b.targetSite].x + (i % 2 ? 3 : -3), this.world.sites[b.targetSite].z + (i % 3 - 1) * 3); });
    this.assignPaths();
  }

  assignPaths() {
    for (const b of this.bots) {
      if (b.team === 'EMBER') {
        const site = this.world.sites[b.targetSite];
        const goal = this.world.nearestWaypoint(site.x, site.z);
        b.path = this.world.findPath(this.world.nearestWaypoint(b.pos.x, b.pos.z), goal);
      } else {
        b.path = this.world.findPath(this.world.nearestWaypoint(b.pos.x, b.pos.z), b.holdNode);
      }
      b.pathIndex = 0;
    }
  }

  damageBot(bot, dmg, head, attacker) {
    if (!bot.alive) return false;
    let rest = dmg;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rest * 0.5);
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.health -= rest;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.state = 'dead';
      bot.mesh.rotation.z = Math.PI / 2;
      bot.mesh.position.y = 0.2;
      return true;
    }
    if (bot.health < 35 && bot.state !== 'cover') {
      bot.state = 'cover';
      bot.coverUntil = this.time + 4;
    }
    return false;
  }

  say(bot, kind, site) {
    const line = this.rng.pick(RADIO[kind]);
    const text = line.replace('{site}', site ? `Site ${site}` : 'mid').replace('{name}', bot.name);
    if (this.onRadio) this.onRadio(`${bot.name}: ${text}`);
  }

  // Nearest living enemy the bot can see. enemies: [{pos, alive, team, ...}].
  visibleEnemy(bot, enemies) {
    let best = null, bd = 58;
    for (const e of enemies) {
      if (!e.alive || e.team === bot.team) continue;
      const d = dist2D(bot.pos.x, bot.pos.z, e.pos.x, e.pos.z);
      if (d > bd) continue;
      if (this.world.losBlocked(bot.pos.x, bot.pos.z, e.pos.x, e.pos.z)) continue;
      // Facing cone (wide when close, narrow at range).
      const ang = Math.atan2(-(e.pos.x - bot.pos.x), -(e.pos.z - bot.pos.z));
      let diff = Math.abs(ang - bot.yaw);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (d > 8 && diff > 1.2) continue;
      best = e; bd = d;
    }
    return best;
  }

  shootAt(bot, target, dt) {
    const w = WEAPONS[bot.weaponId];
    if (this.time - bot.lastShot < w.fireRate) return;
    if (bot.reloading > 0) { bot.reloading -= dt; return; }
    if (bot.mag <= 0) { bot.mag = w.mag; bot.reloading = 1.4; return; }
    bot.lastShot = this.time;
    bot.mag -= 1;
    const from = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
    const aimY = target.pos.y + 1.2;
    const dir = new THREE.Vector3(target.pos.x - from.x, aimY - from.y, target.pos.z - from.z).normalize();
    const d = dist2D(bot.pos.x, bot.pos.z, target.pos.x, target.pos.z);
    const spread = bot.aimErr + d * 0.00045 + (target.moving ? 0.008 : 0);
    const sd = new THREE.Vector3(
      dir.x + (this.rng.next() * 2 - 1) * spread,
      dir.y + (this.rng.next() * 2 - 1) * spread,
      dir.z + (this.rng.next() * 2 - 1) * spread).normalize();
    let wallT = w.range;
    for (const b of this.world.colliders) {
      const t = rayHitsBox(from.x, from.y, from.z, sd.x, sd.y, sd.z, b);
      if (t < wallT) wallT = t;
    }
    const th = rayHitsSphere(from.x, from.y, from.z, sd.x, sd.y, sd.z, target.pos.x, target.pos.y + 1.52, target.pos.z, 0.24);
    const tb = rayHitsSphere(from.x, from.y, from.z, sd.x, sd.y, sd.z, target.pos.x, target.pos.y + 0.85, target.pos.z, 0.46);
    const t = Math.min(th, tb);
    const end = new THREE.Vector3().copy(from).addScaledVector(sd, Math.min(t === Infinity ? wallT : t, w.range));
    if (this.onTracer) this.onTracer(from, end, w.tracer);
    if (t < wallT && t !== Infinity) {
      const head = th <= tb;
      const killed = target.takeDamage(w.damage * (head ? w.headMult : 1), head, bot.name);
      if (this.onBotHit) this.onBotHit(bot, target, killed, head);
      if (this.onShotSound) this.onShotSound(w.kind, d);
    }
  }

  update(dt, ctx) {
    this.time += dt;
    const enemiesOf = (team) => {
      const list = this.bots.filter((b) => b.team !== team);
      if (ctx.player.alive && team === 'SABLE') {
        list.push({ id: 'player', name: 'You', team: 'EMBER', pos: ctx.player.pos, alive: true, moving: ctx.player.moving, takeDamage: (d, h) => ctx.player.damage(d, h) });
      }
      return list;
    };
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const enemies = enemiesOf(bot.team);
      const enemy = this.visibleEnemy(bot, enemies);
      // Reaction: first sighting starts a delay before the bot may shoot.
      // Compare by id: the player proxy is rebuilt every frame, so object
      // identity would reset the reaction timer forever and the bot would
      // never fire at the player.
      if (enemy && (!bot.visibleEnemy || bot.visibleEnemy.id !== enemy.id)) {
        bot.reaction = this.time + this.rng.range(0.45, 0.9);
      }
      bot.visibleEnemy = enemy;
      // --- Objective behaviour when nothing is in sight ---
      if (!enemy) {
        bot.radioCd -= dt;
        if (bot.team === 'EMBER') {
          // Bomb carrier plants at its site; others push.
          if (bot.isCarrier && ctx.bomb.state.mode === 'carried') {
            const site = this.world.sites[bot.targetSite];
            if (dist2D(bot.pos.x, bot.pos.z, site.x, site.z) < site.r * 0.7) {
              bot.state = 'plant';
              if (ctx.bomb.tickPlant(dt, true, bot.targetSite)) {
                this.say(bot, 'plant', bot.targetSite);
                bot.isCarrier = false;
              }
              this.face(bot, site.x, site.z, dt);
              continue;
            }
          }
          if (ctx.bomb.state.mode === 'dropped') {
            const bp = ctx.bomb.state;
            if (dist2D(bot.pos.x, bot.pos.z, bp.x, bp.z) < 1.6) {
              if (ctx.bomb.pickup(bot.id)) { bot.isCarrier = true; if (this.onRadio) this.onRadio(`${bot.name}: got the bomb, heading ${bot.targetSite}`); }
            } else if (bot.state !== 'cover') {
              this.moveToward(bot, bp.x, bp.z, dt, BOT_SPEED);
              continue;
            }
          }
        } else {
          // SABLE: rotate to a planted bomb, defuse when clear.
          if (ctx.bomb.state.mode === 'planted') {
            const site = this.world.sites[ctx.bomb.state.site];
            const nearBomb = dist2D(bot.pos.x, bot.pos.z, site.x, site.z) < 3;
            const enemyNear = enemies.some((e) => e.alive && dist2D(e.pos.x, e.pos.z, site.x, site.z) < 10);
            if (nearBomb && !enemyNear) {
              bot.state = 'defuse';
              if (ctx.bomb.tickDefuse(dt, true)) this.say(bot, 'defuse', ctx.bomb.state.site);
              this.face(bot, site.x, site.z, dt);
              continue;
            }
            if (bot.state !== 'cover') { this.moveToward(bot, site.x, site.z, dt, BOT_SPEED); continue; }
          }
          if (bot.radioCd <= 0 && this.rng.chance(0.5)) {
            this.say(bot, 'hold', bot.targetSite);
            bot.radioCd = this.rng.range(14, 26);
          }
        }
        if (bot.state === 'cover' && this.time < (bot.coverUntil || 0)) {
          // Hold still in cover, peeking.
          bot.mesh.position.set(bot.pos.x, 0, bot.pos.z);
          continue;
        }
        bot.state = 'move';
        // Follow the waypoint path.
        if (bot.pathIndex < bot.path.length) {
          const node = this.world.waypoints[bot.path[bot.pathIndex]];
          const d = dist2D(bot.pos.x, bot.pos.z, node.x, node.z);
          if (d < 1.2) { bot.pathIndex += 1; }
          else this.moveToward(bot, node.x, node.z, dt, BOT_SPEED);
        } else if (bot.team === 'EMBER' && bot.radioCd <= 0) {
          this.say(bot, 'push', bot.targetSite);
          bot.radioCd = this.rng.range(12, 22);
        }
      } else {
        // --- Combat: face the enemy, strafe a little, shoot after reacting ---
        this.face(bot, enemy.pos.x, enemy.pos.z, dt);
        if (bot.state !== 'cover') {
          const d = dist2D(bot.pos.x, bot.pos.z, enemy.pos.x, enemy.pos.z);
          if (d < 4) this.moveToward(bot, bot.pos.x * 2 - enemy.pos.x, bot.pos.z * 2 - enemy.pos.z, dt, BOT_COMBAT_SPEED);
          else if (d > 26) this.moveToward(bot, enemy.pos.x, enemy.pos.z, dt, BOT_COMBAT_SPEED);
        }
        bot.state = 'combat';
        if (this.time >= bot.reaction) this.shootAt(bot, enemy, dt);
        if (bot.radioCd <= 0 && this.rng.chance(0.3)) {
          this.say(bot, 'contact', this.world.siteAt(enemy.pos.x, enemy.pos.z) || bot.targetSite);
          bot.radioCd = this.rng.range(10, 20);
        }
      }
      // Stuck detection: re-path if barely moved in 3s.
      const moved = dist2D(bot.pos.x, bot.pos.z, bot.lastX, bot.lastZ);
      bot.stuck += dt;
      if (bot.stuck > 3) {
        if (moved < 0.6 && bot.state === 'move') {
          const goal = bot.team === 'EMBER'
            ? this.world.nearestWaypoint(this.world.sites[bot.targetSite].x, this.world.sites[bot.targetSite].z)
            : bot.holdNode;
          bot.path = this.world.findPath(this.world.nearestWaypoint(bot.pos.x, bot.pos.z), goal);
          bot.pathIndex = 0;
        }
        bot.lastX = bot.pos.x; bot.lastZ = bot.pos.z; bot.stuck = 0;
      }
      // Sync the mesh.
      bot.walkPhase += dt * 9;
      const bob = Math.sin(bot.walkPhase) * 0.03;
      bot.mesh.position.set(bot.pos.x, bob, bot.pos.z);
      bot.mesh.rotation.y = bot.yaw;
    }
  }

  face(bot, x, z, dt) {
    const target = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
    let diff = target - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += clamp(diff, -6 * dt, 6 * dt);
  }

  moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.pos.x, dz = z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    bot.pos.x += (dx / d) * speed * dt;
    bot.pos.z += (dz / d) * speed * dt;
    this.world.collideCircle(bot.pos, 0.42, 1.7);
    this.face(bot, x, z, dt);
  }

  aliveCount(team) {
    return this.bots.filter((b) => b.team === team && b.alive).length;
  }

  // Targets for the player's weapon ray test, in the shape weapons.js expects.
  targets() {
    return this.bots.filter((b) => b.team === 'SABLE');
  }
}
