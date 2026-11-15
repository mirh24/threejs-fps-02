# DUSTLINE — design notes

A round-based tactical FPS in the style Counter-Strike made famous, built
from scratch on three.js 0.187.0: static files, ES modules, no build step,
no network requests, single-player against bots.

## The fantasy

A dusty desert industrial yard at golden hour. EMBER (orange) attacks,
SABLE (dusty teal) defends. The yard is readable at a glance: sand and
ochre ground, rust trim, concrete walls, a warehouse yard at Site A, a
fuel depot at Site B, and a double-door choke guarding the middle lane.
The sun is low, dust drifts across the lanes, and every sightline ends in
cover — no dead ends, no 200-metre cross-map shots.

## Rounds and the objective

First team to 8 rounds takes the match (7–7 forces one deciding round).
Each round opens with a 15-second buy phase — movement allowed, shop on
B — then a 100-second live phase. EMBER wins by eliminating SABLE, or by
planting the bomb at A or B and letting its 35-second fuse run out.
SABLE wins by eliminating EMBER, by defusing a planted bomb (5-second
hold), or by running the clock out with no plant. A banner names the
winner and the reason, then a short intermission resets the yard.

The player starts each match carrying the bomb. If the player dies, the
bomb drops where they fell; the nearest EMBER bot picks it up and carries
on toward its site. A SABLE bot that reaches a planted bomb while the
area is clear defuses it.

## Economy

Everyone starts a match with $800. A kill pays $300, a round win $3250,
a round loss $1900. The shop sells five guns (pistol $300, SMG $1500,
shotgun $1200, rifle $2700, sniper $4750), body armor $650 and a frag
grenade $300. Unaffordable rows are greyed out; owned rows are gold.

## Gunplay

All weapons are hitscan with tracer lines and a muzzle flash. The pistol
is fast and honest, the SMG sprays at short range, the shotgun fires eight
pellets that end fights up close, the rifle is the all-rounder, and the
sniper hits for 95 with a 4x scope on right mouse. Spread grows with
movement and sustained fire and shrinks when crouched, standing still, or
aiming — stopping to aim pays. Headshots deal double damage. Armor
absorbs half of incoming damage until it is gone. Reload with R; the
magazine and reserve are always in the bottom-right corner.

## Bots

Four EMBER teammates and five SABLE defenders. EMBER bots split between
the sites along the waypoint graph; the carrier pushes its site and
plants when it arrives and the area is clear. SABLE bots hold a site each
and rotate to a planted bomb on sound. In a fight a bot reacts after
0.45–0.9 seconds, fires with aim error that grows with distance, and
falls back to cover below 35 health. They are beatable but dangerous:
they shoot back, they rotate, and they talk — short radio lines appear
in the kill feed.

## Sound

Everything is synthesized with the Web Audio API — no audio files. Each
weapon has its own crack, plus reload clicks, footsteps, hit thuds, a
round-start sting, win/loss jingles, bomb beeps that speed up as the
fuse runs down, and a defuse tone. M mutes.

## Code shape

Thirteen modules, one job each: `util` (math, seeded random, ray
tests), `palette` (the whole look in one place), `economy` (money and
prices), `rounds` (the round state machine), `bomb` (plant/fuse/defuse),
`input` (keyboard, mouse, pointer lock), `player` (movement, health,
armor, camera), `audio` (synthesized sound), `world` (map, colliders,
waypoints, dust), `hud` (all DOM, cached writes), `weapons` (firing,
spread, recoil, tracers), `bots` (AI), `main.js` (a fixed 1/60 s
simulation kept apart from rendering, plus the screenshot modes).

## Screenshot modes

`?shot=start` shows the title overlay and controls; `?shot=buy` opens
the shop with $2800; `?shot=play` drops the player into a live round
mid-fight; `?shot=end` shows the round-end banner at 1–0. Each accepts
`&seed=1` to fix the randomness.
