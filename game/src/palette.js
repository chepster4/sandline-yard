// SANDLINE YARD — one palette for the whole game. Every module reads its
// colours from here, so the yard keeps one dusk-industrial look: warm sand and
// rust against deep dusk purple, with teal SABLE and amber VIPER so the two
// teams read at a glance in any light. Values are CSS hex strings; three.js
// takes them straight into new THREE.Color().
export const PALETTE = {
  // Teams — high contrast against the sand ground, distinct from each other.
  sable: '#2fa8a0',
  viper: '#e07830',
  // Ground and structures.
  ground: '#7d6a52',
  groundDark: '#5d4c3a',
  wall: '#5d564e',
  wallDark: '#453e38',
  concrete: '#6f6a63',
  steel: '#8b939c',
  steelDark: '#565e66',
  rust: '#8a4a28',
  rustLight: '#a8623a',
  // Warm accents: dusk sky spill, lamps, hazard paint, sand.
  sand: '#c9a06a',
  sandLight: '#dcc096',
  amber: '#e8a33d',
  hazard: '#f2c230',
  dusk: '#241a2e',
  duskLight: '#7a4028',
  lamp: '#ffd9a0',
  // Small details and UI-adjacent tones.
  hairline: '#2a2320',
  smoke: '#9a938a',
  containerA: '#3f7d7a',
  containerB: '#a85a2e',
  crate: '#8a6f4d',
  crateDark: '#6b543a',
  // The bomb device and its blink.
  bombBody: '#1f2a24',
  bombLight: '#ff3b30',
  bombLightSafe: '#37d67a',
  // Combat light: the warm flash of a muzzle and the amber of sparks.
  muzzle: '#ffd9a0',
  spark: '#ffc46b',
};
