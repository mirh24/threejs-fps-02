// The look plan in one place. DUSTLINE YARD is a freight yard at dusk: a warm
// low sun, cool blue shadows, rust-red containers and sand-coloured ground.
// The same names are the CSS custom properties in index.html; the two team
// colours are the only extra entries.
export const PALETTE = {
  canvas: '#191410', // sky and fog
  surface: '#2b2118', // ground and big walls
  hairline: '#4d3d2a', // crates, containers, cover
  ink: '#f2e8d5', // light surfaces and HUD text
  muted: '#a89880', // dim text and distant detail
  accent: '#ff8c2f', // the sun, muzzle flash, highlights
  rust: '#8a4a28', // containers and barrels
  sand: '#c9a86a', // ground patches and site markers
  teamBlue: '#4a90d9', // VANGUARD, the attackers (the player)
  teamRed: '#e8532f', // EMBER, the defenders
};

export function shade(name) {
  return PALETTE[name];
}
