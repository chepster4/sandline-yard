// SANDLINE YARD — sound, all procedural. No audio files ship with the game,
// so every effect is a small WebAudio recipe: filtered noise for gunfire and
// explosions, short oscillator blips for the UI and the bomb. The context is
// created lazily on the first user gesture (unlock), and every method is a
// no-op until then, so the menu can call sounds freely before the match.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      // A limiter between the mix and the speakers: a burst of overlapping
      // shots and an explosion must not clip into a square wave.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 8;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (err) {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  function noise(dur, filterFreq, type, gain, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(t);
    source.stop(t + dur + 0.05);
  }

  function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // A gunshot: a sharp noise crack with a low thump underneath. Rifles crack
  // harder than pistols; the sniper gets a longer tail.
  function shot(kind) {
    if (kind === 'sniper') {
      noise(0.28, 900, 'lowpass', 0.9);
      noise(0.12, 3200, 'highpass', 0.5);
      tone(140, 0.18, 'sine', 0.5, 55);
    } else if (kind === 'rifle') {
      noise(0.14, 1400, 'bandpass', 0.8);
      tone(170, 0.09, 'sine', 0.45, 70);
    } else if (kind === 'smg') {
      noise(0.09, 1800, 'bandpass', 0.6);
      tone(200, 0.06, 'sine', 0.35, 90);
    } else {
      noise(0.11, 1100, 'bandpass', 0.7);
      tone(150, 0.08, 'sine', 0.4, 65);
    }
  }

  function distantShot() {
    noise(0.22, 500, 'lowpass', 0.25);
  }

  function dryFire() {
    tone(1400, 0.03, 'square', 0.12);
  }

  function reload() {
    tone(500, 0.05, 'square', 0.14);
    tone(700, 0.05, 'square', 0.14, 0, 0.12);
  }

  function hit(head) {
    tone(head ? 1250 : 950, 0.06, 'sine', 0.3);
  }

  function kill() {
    tone(880, 0.07, 'sine', 0.32);
    tone(1320, 0.1, 'sine', 0.3, 0, 0.07);
  }

  function hurt() {
    tone(220, 0.16, 'sawtooth', 0.28, 110);
    noise(0.12, 400, 'lowpass', 0.2);
  }

  function click() {
    tone(900, 0.04, 'square', 0.16);
  }

  function buy() {
    tone(660, 0.06, 'sine', 0.25);
    tone(990, 0.09, 'sine', 0.25, 0, 0.06);
  }

  function select() {
    tone(760, 0.04, 'square', 0.14);
  }

  function plantBeep(on) {
    if (on) {
      tone(1050, 0.08, 'square', 0.22);
      tone(1050, 0.08, 'square', 0.22, 0, 0.14);
    } else {
      tone(1050, 0.06, 'square', 0.16);
    }
  }

  function bombTick() {
    tone(1500, 0.05, 'square', 0.2);
  }

  function explosion() {
    noise(1.1, 300, 'lowpass', 1.0);
    noise(0.5, 1200, 'bandpass', 0.5);
    tone(90, 0.9, 'sine', 0.8, 35);
  }

  function roundEnd(sableWon) {
    if (sableWon) {
      tone(523, 0.12, 'sine', 0.3);
      tone(659, 0.12, 'sine', 0.3, 0, 0.12);
      tone(784, 0.22, 'sine', 0.3, 0, 0.24);
    } else {
      tone(392, 0.14, 'sine', 0.28);
      tone(330, 0.14, 'sine', 0.28, 0, 0.14);
      tone(262, 0.26, 'sine', 0.28, 0, 0.28);
    }
  }

  function mvp() {
    tone(1046, 0.09, 'sine', 0.25);
    tone(1318, 0.09, 'sine', 0.25, 0, 0.09);
    tone(1568, 0.16, 'sine', 0.25, 0, 0.18);
  }

  function clock() {
    tone(1100, 0.07, 'square', 0.25);
    tone(1100, 0.07, 'square', 0.25, 0, 0.16);
  }

  return {
    unlock, toggleMute, shot, distantShot, dryFire, reload, hit, kill,
    hurt, click, buy, select, plantBeep, bombTick, explosion, roundEnd,
    mvp, clock,
  };
}
