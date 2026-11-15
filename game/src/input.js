// input.js — keyboard, mouse and pointer lock. Keeps raw browser events out
// of the game logic: the game reads keys, look deltas and edge-triggered
// actions (pressed / released) once per fixed step.
export class Input {
  constructor() {
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.firing = false;
    this.aiming = false;
    this.locked = false;
    this._pressed = new Set();
    this._released = new Set();
    this._onKey = null;
    this._onClick = null;
    this._attached = false;
    this.shotMode = false; // screenshot modes never lock the pointer
  }

  attach(canvas, callbacks = {}) {
    if (this._attached) return;
    this._attached = true;
    this._onKey = callbacks.onKey || null;
    this._onClick = callbacks.onClick || null;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (this._onKey) this._onKey(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this._released.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.firing = false; this.aiming = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (this.shotMode) { if (e.button === 0) this.firing = true; return; }
      if (!this.locked) {
        if (this._onClick) this._onClick();
        return;
      }
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.aiming = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.aiming = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock(canvas) {
    if (this.shotMode) return;
    try {
      // Newer Chrome returns a promise that rejects without a real user
      // gesture (synthetic clicks in tests): swallow it, the game plays on.
      const p = canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* headless or denied: play on */ }
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this._pressed.has(code); }
  released(code) { return this._released.has(code); }

  // Consume the accumulated look delta for this step.
  consumeLook() {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  endStep() { this._pressed.clear(); this._released.clear(); }

  get moveX() {
    return (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
  }
  get moveZ() {
    return (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
  }
  get crouch() { return this.down('ControlLeft') || this.down('KeyC'); }
  get walk() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  get jump() { return this.down('Space'); }
}
