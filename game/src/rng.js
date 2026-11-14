// SANDLINE YARD — small deterministic random helpers. The game seeds
// Math.random with mulberry32 in main.js for screenshot captures, and the bots
// use range() with their own Math.random calls; everything here is a pure
// function of the generator it is handed, so a seeded run plays out the same
// way every time and an unseeded run stays unpredictable.

// mulberry32: a tiny fast seeded PRNG. Returns a function that yields a new
// pseudo-random number in [0, 1) on every call.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// range(rng, min, max): a number in [min, max) from the given generator.
// The ends may be given in either order; they are sorted first.
export function range(rng, min, max) {
  if (max < min) {
    const tmp = min;
    min = max;
    max = tmp;
  }
  return min + rng() * (max - min);
}

// int(rng, min, max): a whole number in [min, max], both ends included.
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// pick(rng, list): one element of the list, uniformly at random.
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// chance(rng, p): true with probability p (0..1), false otherwise.
export function chance(rng, p) {
  return rng() < p;
}

// shuffle(rng, list): a shuffled copy of the list (Fisher-Yates), the
// original untouched.
export function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// clamp01(v): v held inside [0, 1]. Used by spread and fade maths.
export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
