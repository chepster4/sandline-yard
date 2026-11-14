// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio files and makes no network request. One shared context, created lazily on the
// first user gesture (browsers refuse audio before that).
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(duration) {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration, frequency, type = 'lowpass', gain = 0.5, slideTo = null, when = 0 }) {
    if (!ensure() || muted) return;
    const start = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(duration + 0.05);
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), start + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  function tone({ frequency, duration, type = 'sine', gain = 0.25, slideTo = null, when = 0 }) {
    if (!ensure() || muted) return;
    const start = context.currentTime + when;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(amp).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    shot(kind) {
      if (kind === 'sniper') {
        burst({ duration: 0.28, frequency: 2600, slideTo: 180, gain: 0.6 });
        tone({ frequency: 150, duration: 0.16, type: 'triangle', gain: 0.35, slideTo: 55 });
      } else if (kind === 'smg') {
        burst({ duration: 0.09, frequency: 3200, slideTo: 500, gain: 0.34 });
      } else if (kind === 'pistol') {
        burst({ duration: 0.13, frequency: 2400, slideTo: 320, gain: 0.42 });
      } else {
        burst({ duration: 0.16, frequency: 2100, slideTo: 260, gain: 0.5 });
        tone({ frequency: 120, duration: 0.1, type: 'triangle', gain: 0.3, slideTo: 60 });
      }
    },
    distantShot() {
      burst({ duration: 0.2, frequency: 900, slideTo: 200, gain: 0.16 });
    },
    hit(head) {
      tone({ frequency: head ? 1560 : 1180, duration: 0.07, type: 'square', gain: 0.16 });
    },
    kill() {
      tone({ frequency: 880, duration: 0.09, type: 'square', gain: 0.18 });
      tone({ frequency: 1320, duration: 0.12, type: 'square', gain: 0.16, when: 0.08 });
    },
    hurt() {
      tone({ frequency: 220, duration: 0.14, type: 'sawtooth', gain: 0.2, slideTo: 110 });
    },
    reload() {
      tone({ frequency: 700, duration: 0.05, type: 'square', gain: 0.12 });
      tone({ frequency: 500, duration: 0.05, type: 'square', gain: 0.12, when: 0.28 });
      tone({ frequency: 900, duration: 0.06, type: 'square', gain: 0.14, when: 0.62 });
    },
    dryFire() {
      tone({ frequency: 1400, duration: 0.04, type: 'square', gain: 0.1 });
    },
    plantBeep(final) {
      tone({ frequency: final ? 1500 : 980, duration: final ? 0.3 : 0.1, type: 'sine', gain: 0.2 });
    },
    bombTick() {
      tone({ frequency: 1100, duration: 0.05, type: 'sine', gain: 0.14 });
    },
    // One soft tick when the round clock drops under ten seconds.
    clock() {
      tone({ frequency: 980, duration: 0.09, type: 'sine', gain: 0.18 });
      tone({ frequency: 980, duration: 0.09, type: 'sine', gain: 0.14, when: 0.14 });
    },
    // A short fanfare for an MVP round (three or more kills by the player).
    mvp() {
      [784, 988, 1175].forEach((frequency, i) => tone({ frequency, duration: 0.14, type: 'triangle', gain: 0.18, when: i * 0.09 }));
    },
    explosion() {
      burst({ duration: 0.9, frequency: 500, slideTo: 60, gain: 0.8 });
      tone({ frequency: 90, duration: 0.7, type: 'sine', gain: 0.5, slideTo: 30 });
    },
    roundEnd(won) {
      const notes = won ? [523, 659, 784] : [392, 330, 262];
      notes.forEach((frequency, i) => tone({ frequency, duration: 0.22, type: 'triangle', gain: 0.2, when: i * 0.14 }));
    },
    buy() {
      tone({ frequency: 660, duration: 0.06, type: 'sine', gain: 0.14 });
      tone({ frequency: 990, duration: 0.09, type: 'sine', gain: 0.14, when: 0.06 });
    },
    click() {
      tone({ frequency: 800, duration: 0.04, type: 'sine', gain: 0.1 });
    },
    // Weapon switch: a dry two-tone click, distinct from the buy sound.
    select() {
      tone({ frequency: 520, duration: 0.04, type: 'square', gain: 0.08 });
      tone({ frequency: 760, duration: 0.05, type: 'square', gain: 0.08, when: 0.05 });
    },
  };
}
