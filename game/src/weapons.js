// Weapons: four guns and a grenade, each with its own numbers, view model and
// sound kind. One module owns the arsenal; main.js owns the ray and the
// damage. Spread grows with movement and shrinks when still or aiming, so
// stopping to aim pays. A sniper zooms with right mouse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9', kind: 'pistol', price: 0,
    damage: 26, headDamage: 78, mag: 12, reserve: 48,
    fireGap: 0.16, reloadTime: 1.4, spreadStill: 0.003, spreadMoving: 0.02,
    auto: false, zoom: 1,
  },
  rifle: {
    id: 'rifle', name: 'AR-77', kind: 'rifle', price: 2700,
    damage: 34, headDamage: 100, mag: 30, reserve: 90,
    fireGap: 0.096, reloadTime: 1.9, spreadStill: 0.0022, spreadMoving: 0.028,
    auto: true, zoom: 1,
  },
  smg: {
    id: 'smg', name: 'VULCAN-9', kind: 'smg', price: 1500,
    damage: 22, headDamage: 66, mag: 30, reserve: 120,
    fireGap: 0.06, reloadTime: 1.6, spreadStill: 0.006, spreadMoving: 0.034,
    auto: true, zoom: 1,
  },
  sniper: {
    id: 'sniper', name: 'LONGSHOT', kind: 'sniper', price: 4750,
    damage: 90, headDamage: 180, mag: 5, reserve: 15,
    fireGap: 1.15, reloadTime: 2.6, spreadStill: 0.0004, spreadMoving: 0.05,
    auto: false, zoom: 2.6,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
const MUZZLE_TIME = 0.06;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.hairline),
    roughness: 0.7,
    metalness: 0.2,
  });
  const body = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.ink),
    roughness: 0.5,
    metalness: 0.35,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.surface),
    roughness: 0.6,
    metalness: 0.3,
  });
  const model = new THREE.Group();
  if (def.id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.24), body);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.06), grip);
    handle.position.set(0, -0.09, 0.07);
    model.add(slide, handle);
    model.position.set(0.2, -0.21, -0.5);
  } else if (def.id === 'sniper') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.5), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.55), dark);
    barrel.position.set(0, 0.02, -0.5);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.075, -0.05);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.24), grip);
    stock.position.set(0, -0.015, 0.34);
    model.add(receiver, barrel, scope, stock);
    model.position.set(0.22, -0.22, -0.56);
  } else if (def.id === 'smg') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.26), grip);
    barrel.position.set(0, 0.02, -0.28);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.07), dark);
    mag.position.set(0, -0.13, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), grip);
    stock.position.set(0, -0.01, 0.24);
    model.add(receiver, barrel, mag, stock);
    model.position.set(0.23, -0.22, -0.52);
  } else {
    // rifle
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), dark);
    sight.position.set(0, 0.075, -0.05);
    model.add(receiver, barrel, stock, sight);
    model.position.set(0.24, -0.22, -0.54);
  }
  model.scale.setScalar(0.78);
  model.userData.baseZ = model.position.z;
  return model;
}

export function createWeapons(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = buildViewModel(def);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }

  // Muzzle flash: two thin crossed planes, a starburst rather than a solid square.
  const flashMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent),
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flash = new THREE.Group();
  const flashA = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.035), flashMat);
  const flashB = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.035), flashMat);
  flashA.rotation.z = Math.PI / 4;
  flashB.rotation.z = -Math.PI / 4;
  flash.add(flashA, flashB);
  flash.position.set(0.24, -0.16, -0.88);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'rifle',
    mag: WEAPONS.rifle.mag,
    reserve: WEAPONS.rifle.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: 0,
    armor: false,
    owned: { pistol: true, rifle: true },
  };

  function def() {
    return WEAPONS[state.current];
  }

  function showModel() {
    for (const [id, model] of Object.entries(models)) {
      model.visible = id === state.current;
    }
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = model.userData.baseZ + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = def().id === 'sniper' ? 0.12 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reloadTime;
      return true;
    },
    spread(speed, aiming) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      let s = d.spreadStill + moving * d.spreadMoving;
      if (aiming) s *= 0.45;
      return s;
    },
    switchTo(id) {
      if (!state.owned[id] || id === state.current) return false;
      state.current = id;
      state.mag = WEAPONS[id].mag;
      state.reserve = WEAPONS[id].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      showModel();
      return true;
    },
    buy(id, money) {
      const d = WEAPONS[id];
      if (!d || state.owned[id] || money < d.price) return -1;
      state.owned[id] = true;
      return d.price;
    },
    buyGrenade(money) {
      if (money < GRENADE_PRICE || state.grenades >= 2) return -1;
      state.grenades += 1;
      return GRENADE_PRICE;
    },
    buyArmor(money) {
      if (money < ARMOR_PRICE || state.armor) return -1;
      state.armor = true;
      return ARMOR_PRICE;
    },
    refillRound() {
      // Fresh magazine and reserve each round; bought weapons, grenades and
      // armor stay until they are used or the player dies.
      state.mag = def().mag;
      state.reserve = def().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      showModel();
    },
    onDeath() {
      // Death costs the bought primary, the armor and the grenades; the
      // issued pistol and rifle stay.
      state.owned = { pistol: true, rifle: true };
      state.grenades = 0;
      state.armor = false;
      if (!state.owned[state.current]) this.switchTo('rifle');
      showModel();
    },
    resetMatch() {
      state.owned = { pistol: true, rifle: true };
      state.current = 'rifle';
      state.grenades = 0;
      state.armor = false;
      this.refillRound();
    },
  };
}
