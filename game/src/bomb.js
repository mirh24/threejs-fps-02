// The bomb: carried, dropped, planted, defused or exploded. A single state
// machine. Planting takes 3.2s holding E on a site, defusing 5s holding E by
// the bomb, and a planted bomb blows after 35s. The only rendering here is the
// blinking light on the bomb itself plus a beep timer; the HUD draws the rest.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 35;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.surface),
      roughness: 0.5,
      metalness: 0.4,
    }),
  );
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.05, 0.08),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  lamp.position.set(0.1, 0.13, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);

  const state = {
    mode: 'carried', // carried | dropped | planted | defused | exploded
    carrier: null, // 'player' or a bot object
    site: null,
    pos: new THREE.Vector3(),
    plantProgress: 0,
    defuseProgress: 0,
    timer: BOMB_TIMER,
    beepAt: 0,
  };

  return {
    state,
    group,
    giveTo(carrier) {
      state.mode = 'carried';
      state.carrier = carrier;
      group.visible = false;
    },
    dropAt(pos) {
      state.mode = 'dropped';
      state.carrier = null;
      state.pos.copy(pos);
      state.pos.y = 0.12;
      group.position.copy(state.pos);
      group.visible = true;
    },
    plantAt(siteKey, pos) {
      state.mode = 'planted';
      state.site = siteKey;
      state.pos.copy(pos);
      state.pos.y = 0.12;
      state.timer = BOMB_TIMER;
      state.beepAt = 0;
      group.position.copy(state.pos);
      group.visible = true;
    },
    reset() {
      state.mode = 'carried';
      state.carrier = null;
      state.site = null;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.timer = BOMB_TIMER;
      group.visible = false;
    },
    step(dt, now, onBeep) {
      if (state.mode !== 'planted') return;
      state.timer -= dt;
      const urgent = state.timer < 10;
      const interval = urgent ? 0.35 : 0.9;
      if (now >= state.beepAt) {
        state.beepAt = now + interval;
        onBeep(urgent);
      }
      // The light blinks faster as the timer runs down.
      const lit = Math.sin(now * (urgent ? 22 : 7)) > 0;
      lamp.material.color.set(lit ? PALETTE.accent : PALETTE.teamRed);
    },
  };
}
