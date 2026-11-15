// audio.js — every sound is synthesized with the Web Audio API; the game
// ships no audio files. One shared noise buffer, short oscillator/noise
// envelopes per effect, a master gain and an M-key mute toggle.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this._beepTimer = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch { return false; }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  _noise(dur, filterFreq, gain, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // kind: pistol | smg | shotgun | rifle | sniper — each a distinct crack.
  shot(kind) {
    if (!this.ensure()) return;
    switch (kind) {
      case 'pistol': this._noise(0.09, 2400, 0.5); this._tone(220, 0.06, 0.25, 'square', 90); break;
      case 'smg': this._noise(0.06, 3200, 0.35); this._tone(300, 0.04, 0.18, 'square', 120); break;
      case 'shotgun': this._noise(0.22, 1100, 0.8); this._tone(140, 0.16, 0.4, 'sawtooth', 55); break;
      case 'rifle': this._noise(0.11, 1900, 0.55); this._tone(190, 0.07, 0.28, 'square', 80); break;
      case 'sniper': this._noise(0.3, 900, 0.9); this._tone(110, 0.22, 0.45, 'sawtooth', 45); break;
      default: this._noise(0.1, 2000, 0.5);
    }
  }

  reload() { this._tone(1400, 0.05, 0.16, 'square'); setTimeout(() => this._tone(900, 0.05, 0.16, 'square'), 140); }
  dryFire() { this._tone(1100, 0.04, 0.12, 'square'); }
  step() { this._noise(0.05, 500, 0.10); }
  hit() { this._tone(520, 0.07, 0.22, 'triangle', 260); }
  kill() { this._tone(780, 0.09, 0.25, 'triangle', 380); this._tone(1170, 0.1, 0.15, 'sine'); }
  hurt() { this._noise(0.12, 300, 0.4); this._tone(90, 0.14, 0.3, 'sawtooth', 60); }
  grenadeThrow() { this._noise(0.08, 900, 0.2); }
  explosion() { this._noise(0.7, 400, 0.9); this._tone(70, 0.6, 0.5, 'sine', 32); }
  plantBeep() { this._tone(880, 0.08, 0.2, 'square'); }
  defuseTone() { this._tone(660, 0.18, 0.2, 'sine', 990); }
  // Short sting at round start, two-note jingle on win, low phrase on loss.
  sting() { this._tone(440, 0.12, 0.25, 'triangle'); setTimeout(() => this._tone(660, 0.16, 0.25, 'triangle'), 120); }
  jingle(win) {
    if (win) { [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 0.25, 'triangle'), i * 130)); }
    else { [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, 0.2, 0.22, 'triangle'), i * 150)); }
  }
  // Bomb beeps speed up as the fuse runs down; call once per frame.
  bombBeep(fuse) {
    if (!this.ctx || this.muted) return;
    this._beepTimer -= 1 / 60;
    const interval = fuse > 20 ? 1 : fuse > 10 ? 0.5 : 0.25;
    if (this._beepTimer <= 0) { this._beepTimer = interval; this._tone(1200, 0.06, 0.18, 'square'); }
  }
}
