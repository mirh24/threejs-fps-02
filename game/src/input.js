// Keyboard and mouse, plus the pointer lock that turns the mouse into look.
// Plain browser APIs only: the game asks the canvas for pointer lock and
// reads movementX/Y while it holds it. Actions that fire once per key press
// (use, grenade, cycle, buy menu, reload, weapon slots) are queued here and
// read by main.js; movement keys stay in the live set. Aim (right mouse) is
// held, not queued.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };
  const pressed = [];

  function setKey(event, down) {
    if (down) {
      if (!event.repeat) {
        if (event.code === 'KeyE') pressed.push('use');
        if (event.code === 'KeyG') pressed.push('grenade');
        if (event.code === 'KeyQ') pressed.push('cycle');
        if (event.code === 'KeyB') pressed.push('buy');
        if (event.code === 'KeyR') pressed.push('reload');
        if (event.code === 'Digit1') pressed.push('slot1');
        if (event.code === 'Digit2') pressed.push('slot2');
        if (event.code === 'Digit3') pressed.push('slot3');
        if (event.code === 'Digit4') pressed.push('slot4');
        if (event.code === 'Digit5') pressed.push('slot5');
      }
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.aiming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => {
    if (state.locked) event.preventDefault();
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takePressed() {
      if (pressed.length === 0) return [];
      const out = pressed.slice();
      pressed.length = 0;
      return out;
    },
  };
}
