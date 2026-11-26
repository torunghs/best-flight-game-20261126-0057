// SAYAP NUSANTARA — all sound is synthesized with WebAudio: a prop
// engine hum whose pitch follows the throttle, wind that rises with
// speed, and short blips for rings, drops, touchdowns, warnings and
// crashes. Nothing is loaded from a file.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two detuned sawtooths through a low-pass, quiet by design.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 93;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(lp);
      engineOsc2.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass, louder with speed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      src.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      src.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  // Called every frame while flying; throttle 0..1, speed in knots.
  function update(throttle, speedKt, flying) {
    if (!ctx || !started || muted) return;
    const t = ctx.currentTime;
    const on = flying ? 1 : 0;
    engineGain.gain.setTargetAtTime(0.05 * on, t, 0.1);
    engineOsc.frequency.setTargetAtTime(52 + throttle * 78, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(78 + throttle * 118, t, 0.08);
    windGain.gain.setTargetAtTime(Math.min(0.12, Math.max(0, (speedKt - 45) / 700)) * on, t, 0.15);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* audio is decoration */ }
  }

  return {
    unlock,
    update,
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (engineGain && ctx) engineGain.gain.setTargetAtTime(muted ? 0 : 0.05, ctx.currentTime, 0.05); },
    ring() { blip(880, 0.16, 'sine', 0.22); blip(1318, 0.28, 'sine', 0.18, 0.09); },
    drop() { blip(220, 0.2, 'triangle', 0.2); },
    goodDrop() { blip(660, 0.14, 'sine', 0.2); blip(990, 0.2, 'sine', 0.18, 0.08); },
    touchdown() { blip(140, 0.25, 'triangle', 0.25); blip(520, 0.3, 'sine', 0.15, 0.1); },
    warn() { blip(440, 0.12, 'square', 0.08); blip(440, 0.12, 'square', 0.08, 0.18); },
    crash() {
      blip(90, 0.5, 'sawtooth', 0.25);
      blip(60, 0.7, 'sawtooth', 0.22, 0.15);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.3, 'sine', 0.18, i * 0.13));
    },
  };
}
