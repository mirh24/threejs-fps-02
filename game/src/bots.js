// Bots: both teams. Defenders hold a site, rotate on noise or a plant, and
// defuse. Attackers advance on a site, plant when they carry the bomb, and
// hold after it. Vision is a real raycast (walls block it); hearing turns
// defenders toward gunshots. Shooting is hitscan in short bursts with spread
// that grows with distance and target speed, so bots feel fair rather than
// aimbot-perfect.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { angleDelta, clamp, mulberry32 } from './util.js';

const BOT_RADIUS = 0.38;
const BOT_HEIGHT = 1.7;
const EYE = 1.55;
const WALK_SPEED = 4.1;
const ENGAGE_SPEED = 2.2;
const REACTION_BASE = 0.28;

function nearestNode(waypoints, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [id, node] of Object.entries(waypoints)) {
    const d = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

function findPath(waypoints, fromId, toId) {
  if (fromId === toId) return [waypoints[toId]];
  const prev = { [fromId]: null };
  const queue = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of waypoints[cur].links) {
      if (!(next in prev)) {
        prev[next] = cur;
        if (next === toId) {
          const path = [];
          let id = toId;
          while (id !== null) {
            path.unshift(waypoints[id]);
            id = prev[id];
          }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [waypoints[toId]];
}

function makeBody(team, name) {
  const teamColor = team === 'VANGUARD' ? PALETTE.teamBlue : PALETTE.teamRed;
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(teamColor),
    roughness: 0.7,
    metalness: 0.1,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.surface),
    roughness: 0.6,
    metalness: 0.3,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.sand),
    roughness: 0.8,
    metalness: 0,
  });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.85, 0.3), torsoMat);
  torso.position.y = 1.05;
  torso.name = `torso:${name}`;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.06), darkMat);
  chest.position.set(0, 1.15, 0.17);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat);
  head.position.y = 1.68;
  head.name = `head:${name}`;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), darkMat);
  helmet.position.y = 1.86;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), darkMat);
  gun.position.set(0.28, 1.25, -0.3);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), darkMat);
  legL.position.set(-0.14, 0.3, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), darkMat);
  legR.position.set(0.14, 0.3, 0);
  group.add(torso, chest, head, helmet, gun, legL, legR);
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.userData.botName = name;
    }
  });
  return { group, torso, head };
}

export function createBotManager(scene, world, ctx) {
  const bots = [];
  const random = mulberry32(ctx.seed || 1337);
  const waypointIds = Object.keys(world.waypoints);

  function spawnBot(def) {
    const { group, torso, head } = makeBody(def.team, def.name);
    group.position.set(def.spawn.x, 0, def.spawn.z);
    scene.add(group);
    const bot = {
      ...def,
      group,
      torso,
      head,
      pos: group.position,
      yaw: def.team === 'VANGUARD' ? 0 : Math.PI,
      pitch: 0,
      health: 100,
      alive: true,
      weapon: WEAPONS[def.weaponId || 'rifle'],
      state: def.team === 'VANGUARD' ? 'advance' : 'hold',
      site: def.site,
      holdPos: new THREE.Vector3(def.spawn.x, 0, def.spawn.z),
      path: [],
      pathIndex: 0,
      target: null,
      lastSeen: null,
      lastSeenAt: -10,
      reaction: 0,
      perceiveAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      strafeDir: 1,
      strafeAt: 0,
      scanPhase: random() * Math.PI * 2,
      plantProgress: 0,
      defuseProgress: 0,
      skill: 0.72 + random() * 0.22,
      stepAt: 0,
    };
    group.rotation.y = bot.yaw;
    bots.push(bot);
    ctx.registerShootable(torso);
    ctx.registerShootable(head);
    return bot;
  }

  function setPath(bot, toX, toZ) {
    const from = nearestNode(world.waypoints, bot.pos.x, bot.pos.z);
    const to = nearestNode(world.waypoints, toX, toZ);
    const nodes = findPath(world.waypoints, from, to);
    bot.path = nodes.map((n) => new THREE.Vector3(n.x, 0, n.z));
    // End exactly on the goal, not just on its node.
    bot.path.push(new THREE.Vector3(toX, 0, toZ));
    bot.pathIndex = 0;
  }

  function moveAlong(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const goal = bot.path[bot.pathIndex];
    const dx = goal.x - bot.pos.x;
    const dz = goal.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const step = Math.min(dist, speed * dt);
    const nx = bot.pos.x + (dx / dist) * step;
    const nz = bot.pos.z + (dz / dist) * step;
    // Simple push-out against colliders so a bot never walks through a wall.
    // The floor's top is exactly y = 0, so a box must rise at least 5 cm
    // above the ground to count as an obstacle — otherwise the floor itself
    // would shove every bot south.
    let px = nx;
    let pz = nz;
    for (const box of world.colliders) {
      if (box.max.y <= 0.05 || box.min.y >= BOT_HEIGHT) continue;
      if (
        px + BOT_RADIUS > box.min.x && px - BOT_RADIUS < box.max.x &&
        pz + BOT_RADIUS > box.min.z && pz - BOT_RADIUS < box.max.z
      ) {
        const pushL = px + BOT_RADIUS - box.min.x;
        const pushR = box.max.x - (px - BOT_RADIUS);
        const pushB = pz + BOT_RADIUS - box.min.z;
        const pushF = box.max.z - (pz - BOT_RADIUS);
        const m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) px = box.min.x - BOT_RADIUS;
        else if (m === pushR) px = box.max.x + BOT_RADIUS;
        else if (m === pushB) pz = box.min.z - BOT_RADIUS;
        else pz = box.max.z + BOT_RADIUS;
      }
    }
    bot.pos.x = clamp(px, -21.5, 21.5);
    bot.pos.z = clamp(pz, -17.5, 17.5);
    const targetYaw = Math.atan2(-(goal.x - bot.pos.x), -(goal.z - bot.pos.z));
    bot.yaw += clamp(angleDelta(bot.yaw, targetYaw), -dt * 6, dt * 6);
    if (ctx.now - bot.stepAt > 0.42) {
      bot.stepAt = ctx.now;
      ctx.onStep(bot.pos, WALK_SPEED);
    }
    return false;
  }

  function faceTarget(bot, dt, targetPos) {
    const targetYaw = Math.atan2(-(targetPos.x - bot.pos.x), -(targetPos.z - bot.pos.z));
    bot.yaw += clamp(angleDelta(bot.yaw, targetYaw), -dt * 9, dt * 9);
    const dy = targetPos.y - (bot.pos.y + EYE);
    const dist = Math.hypot(targetPos.x - bot.pos.x, targetPos.z - bot.pos.z);
    bot.pitch = clamp(Math.atan2(dy, Math.max(1, dist)), -0.5, 0.5);
  }

  function perceive(bot, enemies) {
    if (ctx.now < bot.perceiveAt) return;
    bot.perceiveAt = ctx.now + 0.1;
    const eye = new THREE.Vector3(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
    let best = null;
    let bestD = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.pos.x - bot.pos.x;
      const dz = enemy.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 46 || dist < 0.5) continue;
      const toEnemy = Math.atan2(-dx, -dz);
      if (Math.abs(angleDelta(bot.yaw, toEnemy)) > 1.15) continue;
      const aim = new THREE.Vector3(enemy.pos.x, enemy.pos.y + 1.25, enemy.pos.z);
      if (!ctx.hasLineOfSight(eye, aim)) continue;
      if (dist < bestD) {
        bestD = dist;
        best = enemy;
      }
    }
    if (best) {
      if (bot.target !== best) {
        bot.reaction = REACTION_BASE + bestD * 0.009 + (1 - bot.skill) * 0.25;
      }
      bot.target = best;
      bot.lastSeen = new THREE.Vector3(best.pos.x, best.pos.y + 1.25, best.pos.z);
      bot.lastSeenAt = ctx.now;
    } else if (bot.target && ctx.now - bot.lastSeenAt > 2.2) {
      bot.target = null;
    }
  }

  function shootAt(bot) {
    if (!bot.target || bot.reaction > 0) return;
    if (bot.burstTimer > 0) return;
    const target = bot.target;
    const dist = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
    const targetSpeed = target.isPlayer ? ctx.playerSpeed : WALK_SPEED;
    // Spread: wider at range and against a moving target, tighter for skilled bots.
    const spread = (0.012 + dist * 0.0016 + targetSpeed * 0.004) * (1.25 - bot.skill * 0.5);
    const from = new THREE.Vector3(bot.pos.x, bot.pos.y + EYE, bot.pos.z);
    const to = new THREE.Vector3(target.pos.x, target.pos.y + 1.25, target.pos.z);
    const dir = to.clone().sub(from).normalize();
    dir.x += (random() - 0.5) * 2 * spread;
    dir.y += (random() - 0.5) * 2 * spread;
    dir.z += (random() - 0.5) * 2 * spread;
    dir.normalize();
    const muzzle = from.clone().add(dir.clone().multiplyScalar(0.7));
    ctx.onBotShot(bot, muzzle, dir, dist);
    const hit = ctx.raycast(from, dir, 60);
    if (hit && hit.botName) {
      const headshot = hit.objectName.startsWith('head:');
      const damage = headshot ? bot.weapon.headDamage : bot.weapon.damage;
      ctx.onDamage(target, damage, headshot, bot);
    }
    bot.burstLeft -= 1;
    bot.burstTimer = 0.115;
    if (bot.burstLeft <= 0) {
      bot.burstTimer = 0.55 + random() * 0.45;
      bot.burstLeft = 3;
    }
  }

  function updateBot(bot, dt, enemies) {
    if (!bot.alive) return;
    perceive(bot, enemies);
    bot.reaction = Math.max(0, bot.reaction - dt);
    bot.burstTimer = Math.max(0, bot.burstTimer - dt);

    const engaging = bot.target && bot.reaction <= 0;
    if (engaging) {
      faceTarget(bot, dt, bot.lastSeen);
      // Strafe sideways while fighting, keep 8–20 m from the target.
      if (ctx.now > bot.strafeAt) {
        bot.strafeAt = ctx.now + 0.7 + random() * 0.8;
        bot.strafeDir = random() < 0.5 ? -1 : 1;
      }
      const dist = Math.hypot(bot.target.pos.x - bot.pos.x, bot.target.pos.z - bot.pos.z);
      const side = new THREE.Vector3(Math.cos(bot.yaw), 0, -Math.sin(bot.yaw))
        .multiplyScalar(bot.strafeDir * ENGAGE_SPEED * dt);
      const toward = new THREE.Vector3(
        bot.target.pos.x - bot.pos.x,
        0,
        bot.target.pos.z - bot.pos.z,
      ).normalize();
      if (dist > 20) toward.multiplyScalar(ENGAGE_SPEED * dt);
      else if (dist < 8) toward.multiplyScalar(-ENGAGE_SPEED * dt);
      else toward.multiplyScalar(0);
      bot.pos.x = clamp(bot.pos.x + side.x + toward.x, -21.5, 21.5);
      bot.pos.z = clamp(bot.pos.z + side.z + toward.z, -17.5, 17.5);
      shootAt(bot);
    } else if (bot.state === 'hold') {
      // Scan the approach: a slow sweep, never perfectly still. A bot holding
      // a site faces south, toward mid, where the enemy comes from.
      bot.scanPhase += dt * 0.5;
      const want = Math.PI + Math.sin(bot.scanPhase) * 0.7;
      bot.yaw += clamp(angleDelta(bot.yaw, want), -dt * 1.2, dt * 1.2);
    } else if (bot.state === 'advance' || bot.state === 'rotate') {
      const done = moveAlong(bot, dt, WALK_SPEED);
      if (done) {
        if (bot.state === 'advance' && bot.carriesBomb) {
          bot.state = 'plant';
          bot.plantProgress = 0;
        } else if (bot.state === 'rotate' && bot.defuseOnArrival) {
          bot.state = 'defuse';
          bot.defuseProgress = 0;
          bot.defuseOnArrival = false;
        } else {
          bot.state = 'hold';
          bot.holdPos.copy(bot.pos);
        }
      }
    } else if (bot.state === 'plant') {
      bot.plantProgress += dt;
      if (bot.plantProgress >= 3.2) {
        bot.state = 'hold';
        ctx.onPlant(bot);
      }
    } else if (bot.state === 'defuse') {
      bot.defuseProgress += dt;
      if (bot.defuseProgress >= 5) {
        bot.state = 'hold';
        ctx.onDefuse(bot);
      }
    }
    bot.group.position.copy(bot.pos);
    bot.group.rotation.y = bot.yaw;
  }

  return {
    bots,
    spawnRound(attackers, defenders, bombCarrier) {
      // Remove the previous round's bodies.
      for (const bot of bots) {
        scene.remove(bot.group);
        ctx.unregisterShootable(bot.torso);
        ctx.unregisterShootable(bot.head);
      }
      bots.length = 0;
      for (const def of attackers) {
        const bot = spawnBot({ ...def, team: 'VANGUARD', weaponId: def.weaponId || 'rifle' });
        bot.carriesBomb = bombCarrier === def.name;
        setPath(bot, world.sites[def.site].x, world.sites[def.site].z);
      }
      for (const def of defenders) {
        const bot = spawnBot({ ...def, team: 'EMBER', weaponId: 'rifle' });
        bot.site = def.site;
        bot.holdPos.set(def.spawn.x, 0, def.spawn.z);
      }
    },
    update(dt, player) {
      const attackers = bots.filter((b) => b.team === 'VANGUARD');
      const defenders = bots.filter((b) => b.team === 'EMBER');
      for (const bot of bots) {
        // The player fights for VANGUARD, so only EMBER bots count them as an enemy.
        const enemies = bot.team === 'VANGUARD' ? defenders : [...attackers, player];
        updateBot(bot, dt, enemies);
      }
      // Separation: bots on the same route must not stack on one spot.
      for (let i = 0; i < bots.length; i += 1) {
        for (let j = i + 1; j < bots.length; j += 1) {
          const a = bots[i];
          const b = bots[j];
          if (!a.alive || !b.alive) continue;
          const dx = b.pos.x - a.pos.x;
          const dz = b.pos.z - a.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.01 && d < 0.9) {
            const push = ((0.9 - d) / 2) * Math.min(1, dt * 8);
            const nx = dx / d;
            const nz = dz / d;
            a.pos.x = clamp(a.pos.x - nx * push, -21.5, 21.5);
            a.pos.z = clamp(a.pos.z - nz * push, -17.5, 17.5);
            b.pos.x = clamp(b.pos.x + nx * push, -21.5, 21.5);
            b.pos.z = clamp(b.pos.z + nz * push, -17.5, 17.5);
          }
        }
      }
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    kill(bot) {
      bot.alive = false;
      bot.group.rotation.x = -Math.PI / 2;
      bot.group.position.y = 0.25;
      bot.group.traverse((m) => {
        if (m.isMesh) m.material = m.material.clone();
      });
    },
    hearNoise(pos, sourceTeam) {
      // Defenders not in a fight turn toward a gunshot they can hear.
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'EMBER' || bot.target) continue;
        const dist = Math.hypot(bot.pos.x - pos.x, bot.pos.z - pos.z);
        if (dist < 26) {
          bot.scanPhase = Math.atan2(-(pos.x - bot.pos.x), -(pos.z - bot.pos.z));
        }
      }
    },
    rotateToSite(siteKey) {
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'EMBER' || bot.target) continue;
        const site = world.sites[siteKey];
        bot.state = 'rotate';
        setPath(bot, site.x, site.z);
      }
    },
    sendDefuser(bombPos) {
      let best = null;
      let bestD = Infinity;
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'EMBER') continue;
        const d = Math.hypot(bot.pos.x - bombPos.x, bot.pos.z - bombPos.z);
        if (d < bestD) {
          bestD = d;
          best = bot;
        }
      }
      if (best) {
        best.state = 'rotate';
        setPath(best, bombPos.x, bombPos.z);
        best.defuseOnArrival = true;
      }
    },
    dropBomb(bot) {
      bot.carriesBomb = false;
    },
    giveBomb(bot) {
      bot.carriesBomb = true;
      if (bot.alive && bot.team === 'VANGUARD') {
        bot.state = 'advance';
        setPath(bot, world.sites[bot.site].x, world.sites[bot.site].z);
      }
    },
    setPath,
    findPath,
    nearestNode,
    waypointIds,
  };
}
