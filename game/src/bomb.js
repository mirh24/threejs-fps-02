// bomb.js — the objective. States: 'carried' (someone holds it), 'dropped',
// 'planted' (35s fuse ticking), 'defused', 'detonated'. Planting takes a
// 2.5s hold near a site, defusing a 5s hold near a planted bomb. Progress
// resets the moment the holder steps away or takes damage.
export const PLANT_TIME = 2.5;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 35;

export class Bomb {
  constructor() {
    this.state = {
      mode: 'carried', // carried | dropped | planted | defused | detonated
      site: null, // 'A' | 'B' | null
      fuse: FUSE_TIME,
      plantProgress: 0,
      defuseProgress: 0,
      carrier: 'player', // 'player' | bot id | null
      x: 0,
      z: 0,
    };
    this.onPlanted = null;
    this.onDetonated = null;
    this.onDefused = null;
    this.onDropped = null;
  }

  reset(carrier = 'player') {
    this.state.mode = 'carried';
    this.state.site = null;
    this.state.fuse = FUSE_TIME;
    this.state.plantProgress = 0;
    this.state.defuseProgress = 0;
    this.state.carrier = carrier;
    this.state.x = 0;
    this.state.z = 0;
  }

  get planted() { return this.state.mode === 'planted'; }

  // holding: true while the actor stands at a site holding E. Returns true
  // the moment the plant completes.
  tickPlant(dt, holding, site) {
    const s = this.state;
    if (s.mode !== 'carried' && s.mode !== 'dropped') return false;
    if (!holding || !site) { s.plantProgress = 0; return false; }
    s.plantProgress += dt;
    if (s.plantProgress >= PLANT_TIME) {
      s.mode = 'planted';
      s.site = site;
      s.fuse = FUSE_TIME;
      s.plantProgress = 0;
      if (this.onPlanted) this.onPlanted(site);
      return true;
    }
    return false;
  }

  // holding: true while a defender stands at the planted bomb holding E.
  tickDefuse(dt, holding) {
    const s = this.state;
    if (s.mode !== 'planted') return false;
    if (!holding) { s.defuseProgress = 0; return false; }
    s.defuseProgress += dt;
    if (s.defuseProgress >= DEFUSE_TIME) {
      s.mode = 'defused';
      s.defuseProgress = 0;
      if (this.onDefused) this.onDefused(s.site);
      return true;
    }
    return false;
  }

  // Fuse countdown while planted. Returns true the moment it blows.
  tickFuse(dt) {
    const s = this.state;
    if (s.mode !== 'planted') return false;
    s.fuse -= dt;
    if (s.fuse <= 0) {
      s.mode = 'detonated';
      if (this.onDetonated) this.onDetonated(s.site);
      return true;
    }
    return false;
  }

  drop(x, z) {
    const s = this.state;
    if (s.mode !== 'carried') return;
    s.mode = 'dropped';
    s.carrier = null;
    s.x = x; s.z = z;
    s.plantProgress = 0;
    if (this.onDropped) this.onDropped(x, z);
  }

  pickup(carrier) {
    const s = this.state;
    if (s.mode !== 'dropped') return false;
    s.mode = 'carried';
    s.carrier = carrier;
    return true;
  }

  statusLine() {
    const s = this.state;
    if (s.mode === 'planted') return `BOMB PLANTED — SITE ${s.site} — ${Math.ceil(s.fuse)}s`;
    if (s.mode === 'carried') return s.carrier === 'player' ? 'BOMB: YOU CARRY IT — PLANT AT A OR B' : 'BOMB: CARRIED BY A TEAMMATE';
    if (s.mode === 'dropped') return 'BOMB DROPPED — PICK IT UP';
    if (s.mode === 'defused') return 'BOMB DEFUSED';
    if (s.mode === 'detonated') return 'BOMB DETONATED';
    return '';
  }
}
