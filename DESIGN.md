# DUSTLINE — a three.js tactical FPS

A round-based tactical FPS in a freight yard at dusk. VANGUARD (the player + 3
bots) attacks; EMBER (4 bots) defends two bomb sites, A (warehouse) and B (fuel
depot). First to 5 rounds wins the match (max 9).

## How a round plays

- **Buy phase (15s):** the buy menu opens. Spend round money on weapons,
  grenades and armor (keys 1–5 or click; B closes the menu).
- **Live round (100s):** plant the bomb at A or B (hold E on a site, 3.2s) or
  eliminate EMBER. If the bomb is planted it blows after 35s unless a defender
  defuses it (5s). If the clock runs out with no plant, EMBER wins the round.
- **Money:** start $800. Kill +$300, plant +$300, round win +$3250, round loss
  +$1900 (grows +$500 per consecutive loss, max $3400). Death costs the bought
  primary, the armor and the grenades; the issued pistol and rifle stay.

## Weapons

| Weapon | Price | Damage | Notes |
|---|---|---|---|
| P9 pistol | owned | 26 / 78 head | 12 rounds |
| AR-77 rifle | owned | 34 / 100 head | 30 rounds, the workhorse |
| VULCAN-9 SMG | $1500 | 22 / 66 head | 30 rounds, very fast |
| LONGSHOT sniper | $4750 | 90 / 180 head | 5 rounds, right-click zoom |
| HE grenade | $300 | up to 110 AoE | throw with G, 1.6s fuse |
| Kevlar armor | $650 | — | halves damage taken |

Spread grows with movement and shrinks when still or aiming, so stopping to
aim pays. Headshots deal the listed head damage.

## Bots

- **Attackers** advance on a site along a waypoint graph (BFS paths), plant
  when they carry the bomb, and hold after it is planted.
- **Defenders** hold a site angle, rotate toward gunshots they hear, rotate to
  a planted bomb, and defuse it.
- **Vision** is a real raycast: walls block sight. Reaction time scales with
  distance and bot skill; shooting is hitscan in 3-round bursts with spread
  that grows with range and target speed, so bots feel fair, not aimbot-perfect.
- **The bomb** drops where its carrier dies; a friendly bot or the player picks
  it up by walking over it.

## Presentation

- Dusk palette: warm low sun from the west, cool blue fill, rust containers,
  sand ground patches, glowing site zones. No textures, no models, no network.
- HUD: health + armor, ammo, money, round timer, team score, kill feed, bomb
  status, weapon slots, dynamic crosshair (gap = spread), hitmarker (red for
  headshots), damage direction indicator, buy menu, round banner.
- Sound: every effect synthesized with WebAudio (gunshots, reload, hit ticks,
  explosion, bomb beeps, round stings, footsteps). No audio files.

## Files

- `game/index.html` — page + import map + HUD DOM.
- `game/src/main.js` — boot, loop, shooting, grenades, round flow, captures.
- `game/src/world.js` — the DUSTLINE YARD map, lighting, waypoint graph.
- `game/src/bots.js` — bot AI (perception, paths, bursts, plant/defuse).
- `game/src/weapons.js` — the arsenal, view models, spread, muzzle flash.
- `game/src/bomb.js`, `economy.js`, `rounds.js` — the three state machines.
- `game/src/hud.js`, `input.js`, `player.js`, `audio.js`, `palette.js`, `util.js`.
- `screenshots/` — 1-play (cover), 2-buy, 3-end, 4-start; `?shot=` + seed
  renders each deterministically and sets `window.__shotReady`.
- `main.ts` — copies game/ + screenshots/ to /output and writes dossier.json.

## Verification done

- All 13 modules pass `node --check`; the import graph resolves.
- `main.ts` builds a dossier within the kit's caps (see the build log).
- Headless Chrome (chrome-headless-shell, software GL) renders all four
  `?shot=` captures with no console errors; the frames were eyeballed.
- A CDP-driven play test confirmed: bots navigate the waypoint graph to the
  sites, the buy phase hands over to the live round, and enemy bots damage the
  player.
