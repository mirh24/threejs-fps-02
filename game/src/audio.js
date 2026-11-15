// Synthesized sound effects, WebAudio only: no audio files, no network. Every
// sound is a few oscillators and filtered noise, built once and reused. The
// context starts on the first user gesture (the play button), as browsers
// require; before that every call is a silent no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise({ at = 0, duration = 0.1, type = 'lowpass', frequency = 1200, gain = 0.5, q = 1 }) {
    if (!ensure() || !ctx) return;
    const t = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone({ at = 0, duration = 0.1, type = 'sine', from = 440, to = null, gain = 0.3 }) {
    if (!ensure() || !ctx) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // One shared click for UI, kept tiny so the buy menu feels responsive.
  function click() {
    tone({ duration: 0.05, type: 'square', from: 880, to: 660, gain: 0.12 });
  }

  return {
    unlock() {
      if (ensure() && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    shot(kind) {
      if (kind === 'sniper') {
        noise({ duration: 0.22, type: 'bandpass', frequency: 900, gain: 0.9, q: 0.7 });
        tone({ duration: 0.18, type: 'sine', from: 160, to: 50, gain: 0.5 });
      } else if (kind === 'smg') {
        noise({ duration: 0.07, type: 'bandpass', frequency: 1800, gain: 0.45, q: 0.8 });
        tone({ duration: 0.06, type: 'sine', from: 200, to: 90, gain: 0.25 });
      } else if (kind === 'pistol') {
        noise({ duration: 0.09, type: 'bandpass', frequency: 1500, gain: 0.55, q: 0.8 });
        tone({ duration: 0.07, type: 'sine', from: 190, to: 80, gain: 0.3 });
      } else {
        // rifle
        noise({ duration: 0.12, type: 'bandpass', frequency: 1100, gain: 0.7, q: 0.7 });
        tone({ duration: 0.1, type: 'sine', from: 170, to: 60, gain: 0.4 });
      }
    },
    enemyShot(distance) {
      // Distant gunfire: quieter and duller the further away it is.
      const g = Math.max(0.05, 0.5 - distance * 0.012);
      noise({ duration: 0.1, type: 'lowpass', frequency: 700, gain: g });
    },
    dryFire() {
      tone({ duration: 0.04, type: 'square', from: 1200, to: 900, gain: 0.15 });
    },
    reload() {
      tone({ duration: 0.05, type: 'square', from: 500, to: 350, gain: 0.15 });
      tone({ at: 0.25, duration: 0.05, type: 'square', from: 600, to: 420, gain: 0.15 });
      tone({ at: 0.55, duration: 0.06, type: 'square', from: 750, to: 520, gain: 0.18 });
    },
    hit(headshot) {
      tone({ duration: 0.06, type: 'sine', from: headshot ? 1560 : 1180, to: headshot ? 1320 : 990, gain: 0.25 });
    },
    kill() {
      tone({ duration: 0.08, type: 'sine', from: 880, to: 880, gain: 0.2 });
      tone({ at: 0.08, duration: 0.12, type: 'sine', from: 1318, to: 1318, gain: 0.2 });
    },
    hurt() {
      tone({ duration: 0.12, type: 'sawtooth', from: 140, to: 70, gain: 0.3 });
      noise({ duration: 0.08, type: 'lowpass', frequency: 500, gain: 0.25 });
    },
    step(run) {
      noise({ duration: 0.05, type: 'lowpass', frequency: 380, gain: run ? 0.12 : 0.07 });
    },
    grenadeThrow() {
      tone({ duration: 0.08, type: 'square', from: 300, to: 180, gain: 0.15 });
    },
    explosion() {
      noise({ duration: 1.1, type: 'lowpass', frequency: 900, gain: 0.9 });
      tone({ duration: 0.9, type: 'sine', from: 90, to: 28, gain: 0.7 });
      noise({ at: 0.05, duration: 0.5, type: 'bandpass', frequency: 300, gain: 0.5, q: 0.6 });
    },
    beep(urgent) {
      tone({ duration: urgent ? 0.09 : 0.12, type: 'square', from: urgent ? 1320 : 990, to: urgent ? 1320 : 990, gain: 0.12 });
    },
    plantTick() {
      tone({ duration: 0.05, type: 'square', from: 660, to: 660, gain: 0.12 });
    },
    defuseTick() {
      tone({ duration: 0.05, type: 'square', from: 520, to: 520, gain: 0.12 });
    },
    roundStart() {
      tone({ duration: 0.35, type: 'sine', from: 220, to: 220, gain: 0.25 });
      tone({ at: 0.12, duration: 0.35, type: 'sine', from: 330, to: 330, gain: 0.25 });
      tone({ at: 0.24, duration: 0.5, type: 'sine', from: 440, to: 440, gain: 0.28 });
    },
    roundWin() {
      tone({ duration: 0.18, type: 'sine', from: 523, to: 523, gain: 0.22 });
      tone({ at: 0.16, duration: 0.18, type: 'sine', from: 659, to: 659, gain: 0.22 });
      tone({ at: 0.32, duration: 0.4, type: 'sine', from: 784, to: 784, gain: 0.25 });
    },
    roundLose() {
      tone({ duration: 0.25, type: 'sine', from: 392, to: 392, gain: 0.22 });
      tone({ at: 0.22, duration: 0.25, type: 'sine', from: 311, to: 311, gain: 0.22 });
      tone({ at: 0.44, duration: 0.5, type: 'sine', from: 233, to: 233, gain: 0.25 });
    },
    buy() {
      click();
      tone({ at: 0.06, duration: 0.08, type: 'sine', from: 1046, to: 1046, gain: 0.15 });
    },
    denied() {
      tone({ duration: 0.12, type: 'square', from: 220, to: 160, gain: 0.15 });
    },
    click,
  };
}
