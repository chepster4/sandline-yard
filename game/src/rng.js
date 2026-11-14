// Deterministic randomness: one mulberry32 stream per seed, so a screenshot run
// (?shot=...&seed=N) plays out the same way every time it is taken.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

// A Fisher–Yates shuffle on a copy, so the caller's order survives.
export function shuffle(random, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// True with probability p (0..1) on the same seeded stream.
export function chance(random, p) {
  return random() < p;
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

// An integer in [min, max], inclusive on both ends.
export function rangeInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}
