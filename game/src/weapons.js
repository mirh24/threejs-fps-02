// weapons.js — weapon definitions, firing, spread, recoil, reload and
// tracers. All hitscan: a ray from the camera is tested against bot hit
// spheres (head r=0.24, body r=0.46) and against wall boxes; the nearest
// hit wins. Spread grows with movement and firing, shrinks when crouched
// or still; headshots deal double damage.
import * as THREE from 'three';
import { clamp, rayHitsBox, rayHitsSphere } from './util.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'Sidewinder', kind: 'pistol', damage: 34, headMult: 2, mag: 12, reserve: 48, fireRate: 0.16, reloadTime: 1.1, spread: 0.011, moveSpread: 0.02, range: 60, auto: false, zoom: 1, kick: 0.011, tracer: 0xffc46b },
  smg: { id: 'smg', name: 'Hornet', kind: 'smg', damage: 22, headMult: 2, mag: 30, reserve: 120, fireRate: 0.085, reloadTime: 1.5, spread: 0.02, moveSpread: 0.035, range: 34, auto: true, zoom: 1, kick: 0.008, tracer: 0xffd27a },
  shotgun: { id: 'shotgun', name: 'Mauler', kind: 'shotgun', damage: 14, headMult: 2, mag: 7, reserve: 28, fireRate: 0.85, reloadTime: 2.2, spread: 0.055, moveSpread: 0.03, range: 20, auto: false, zoom: 1, pellets: 8, kick: 0.05, tracer: 0xff9a4d },
  rifle: { id: 'rifle', name: 'Longhorn', kind: 'rifle', damage: 32, headMult: 2, mag: 30, reserve: 90, fireRate: 0.115, reloadTime: 1.7, spread: 0.008, moveSpread: 0.024, range: 80, auto: true, zoom: 1.4, kick: 0.014, tracer: 0xffe08a },
  sniper: { id: 'sniper', name: 'Dunehawk', kind: 'sniper', damage: 95, headMult: 2, mag: 5, reserve: 15, fireRate: 1.15, reloadTime: 2.6, spread: 0.001, moveSpread: 0.05, range: 120, auto: false, zoom: 4, kick: 0.07, tracer: 0xfff2c0 },
};

export const GRENADE = { id: 'grenade', name: 'Frag grenade', damage: 110, radius: 6.5, fuse: 1.4 };

export class WeaponSys {
  constructor(scene) {
    this.scene = scene;
    this.owned = {}; // id -> { mag, reserve }
    this.current = 'pistol';
    this.grenades = 0;
    this.lastShot = -10;
    this.reloading = 0;
    this.reloadTotal = 0;
    this.heat = 0; // bloom from sustained fire
    this.tracers = [];
    this._tracerGeo = new THREE.BufferGeometry();
    this._tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.onShot = null; // (kind)
    this.onDryFire = null;
    this.onReloadStart = null;
    this.onHit = null; // (target, damage, headshot, killed)
    this.onKill = null;
  }

  reset(loadout) {
    this.owned = {};
    for (const id of loadout) {
      const w = WEAPONS[id];
      this.owned[id] = { mag: w.mag, reserve: w.reserve };
    }
    if (!this.owned.pistol) this.owned.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
    this.current = loadout.includes('rifle') ? 'rifle' : 'pistol';
    this.grenades = 0;
    this.lastShot = -10;
    this.reloading = 0;
    this.heat = 0;
  }

  get def() { return WEAPONS[this.current]; }
  get state() { return this.owned[this.current]; }

  give(id) {
    if (this.owned[id]) {
      this.owned[id].reserve += WEAPONS[id].reserve;
      return false;
    }
    this.owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    this.current = id;
    return true;
  }

  switchTo(id) {
    if (!this.owned[id] || this.current === id) return false;
    this.current = id;
    this.reloading = 0;
    this.heat = 0;
    return true;
  }

  // Current spread in radians: base + movement + heat, crouch/stand-still bonus.
  spreadFor(moving, crouched, aiming) {
    const w = this.def;
    let s = w.spread + (moving ? w.moveSpread : 0) + this.heat * 0.02;
    if (crouched) s *= 0.6;
    if (aiming) s *= 0.55;
    return s;
  }

  canFire(now) {
    return this.reloading <= 0 && now - this.lastShot >= this.def.fireRate;
  }

  startReload(now) {
    const st = this.state;
    if (!st || this.reloading > 0 || st.mag >= this.def.mag || st.reserve <= 0) return false;
    this.reloading = this.def.reloadTime;
    this.reloadTotal = this.def.reloadTime;
    if (this.onReloadStart) this.onReloadStart();
    return true;
  }

  update(now, dt) {
    this.heat = Math.max(0, this.heat - dt * 0.9);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const st = this.state, w = this.def;
        const need = w.mag - st.mag;
        const take = Math.min(need, st.reserve);
        st.mag += take;
        st.reserve -= take;
      }
    }
    // Fade tracers out.
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.life -= dt * 6;
      t.line.material.opacity = Math.max(0, t.life);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  spawnTracer(from, to, color) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      from.x, from.y, from.z, to.x, to.y, to.z,
    ]), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 1 });
    if (this.tracers.length > 24) {
      const old = this.tracers.shift();
      this.scene.remove(old.line);
      old.line.material.dispose();
    }
  }

  // Fire one trigger pull. targets: [{pos, headY, bodyY, alive, team, id, name,
  // takeDamage(dmg, head, attacker)}]. world: for wall blocking. Returns the
  // number of hits landed.
  fire(now, origin, dir, targets, world, opts = {}) {
    const w = this.def;
    const st = this.state;
    if (!st) return 0;
    if (!this.canFire(now)) return 0;
    if (st.mag <= 0) {
      if (this.onDryFire) this.onDryFire();
      this.lastShot = now;
      this.startReload(now);
      return 0;
    }
    this.lastShot = now;
    st.mag -= 1;
    this.heat = Math.min(1, this.heat + (w.kind === 'shotgun' ? 0.5 : 0.16));
    if (this.onShot) this.onShot(w.kind);
    const pellets = w.pellets || 1;
    const spread = opts.spread ?? w.spread;
    let hits = 0;
    for (let p = 0; p < pellets; p += 1) {
      const d = new THREE.Vector3(
        dir.x + (Math.random() * 2 - 1) * spread,
        dir.y + (Math.random() * 2 - 1) * spread,
        dir.z + (Math.random() * 2 - 1) * spread,
      ).normalize();
      // Nearest wall along the ray.
      let wallT = w.range;
      for (const b of world.colliders) {
        const t = rayHitsBox(origin.x, origin.y, origin.z, d.x, d.y, d.z, b);
        if (t < wallT) wallT = t;
      }
      // Nearest target: head sphere first, then body sphere.
      let best = null, bestT = wallT, bestHead = false;
      for (const t of targets) {
        if (!t.alive) continue;
        const th = rayHitsSphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, t.pos.x, t.pos.y + 1.52, t.pos.z, 0.24);
        if (th < bestT) { best = t; bestT = th; bestHead = true; continue; }
        const tb = rayHitsSphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, t.pos.x, t.pos.y + 0.85, t.pos.z, 0.46);
        if (tb < bestT) { best = t; bestT = tb; bestHead = false; }
      }
      const end = new THREE.Vector3().copy(origin).addScaledVector(d, Math.min(bestT, w.range));
      this.spawnTracer(origin, end, w.tracer);
      if (best) {
        const dmg = w.damage * (bestHead ? w.headMult : 1);
        const killed = best.takeDamage(dmg, bestHead, opts.attacker || 'player');
        hits += 1;
        if (this.onHit) this.onHit(best, dmg, bestHead, killed);
        if (killed && this.onKill) this.onKill(best);
      }
    }
    return hits;
  }

  // Bot-fired shot: same ray test, but the target is the player (or a bot).
  // spread is passed in by the bot's aim error. Returns {hit, head, killed}.
  fireAt(now, origin, dir, spread, target, world, attacker) {
    const w = this.def;
    const d = new THREE.Vector3(
      dir.x + (Math.random() * 2 - 1) * spread,
      dir.y + (Math.random() * 2 - 1) * spread,
      dir.z + (Math.random() * 2 - 1) * spread,
    ).normalize();
    let wallT = w.range;
    for (const b of world.colliders) {
      const t = rayHitsBox(origin.x, origin.y, origin.z, d.x, d.y, d.z, b);
      if (t < wallT) wallT = t;
    }
    if (!target.alive) return { hit: false };
    const th = rayHitsSphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, target.pos.x, target.pos.y + 1.52, target.pos.z, 0.24);
    const tb = rayHitsSphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, target.pos.x, target.pos.y + 0.85, target.pos.z, 0.46);
    const t = Math.min(th, tb);
    const end = new THREE.Vector3().copy(origin).addScaledVector(d, Math.min(t === Infinity ? wallT : t, w.range));
    this.spawnTracer(origin, end, w.tracer);
    if (t < wallT && t !== Infinity) {
      const head = th <= tb;
      const dmg = w.damage * (head ? w.headMult : 1);
      const killed = target.takeDamage(dmg, head, attacker);
      return { hit: true, head, killed };
    }
    return { hit: false };
  }
}
