// SANDLINE — the look plan, in one place. A desert-dusk compound at last light:
// warm sand, rusted steel and deep shadow, one amber accent, and safety yellow
// for the hazard striping on the foundry dressing (silos, pipe gantry, barriers).
// The same names are the CSS custom properties in index.html, so the page and the
// scene agree.
export const PALETTE = {
  canvas: '#171310',
  surface: '#241c14',
  hairline: '#3a2f22',
  ink: '#f2e8d8',
  muted: '#a89a83',
  accent: '#e07830',
  sable: '#37b6a0',
  viper: '#d84a4a',
  sand: '#c9a86a',
  steel: '#5a6b74',
  danger: '#ff5340',
  hazard: '#d8b13c',
  rust: '#8a4a28',
};

export function shade(name) {
  return PALETTE[name];
}
