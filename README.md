# SANDLINE YARD

A round-based tactical FPS in three.js for the make.fun `threejs-fps-02`
bounty — two teams of five, two bomb sites, money between rounds, nine bots
with skill tiers, callouts and real line-of-sight vision.

## Play

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click **DEPLOY**, and the
mouse locks in: WASD to move, mouse to look, click to fire, right-click to
aim, R to reload, Shift to walk slow, Ctrl/C to crouch, Space to jump,
B for the buy menu, E to plant or defuse, 4/5/G for grenades, mouse wheel to
switch weapons, C to spectate a teammate after you are down.

## The game

- **Rounds:** first to 9 takes the match. The attacking side plants the bomb
  at site A or B; the defenders stop them or defuse it. Eliminating the
  other team wins the round too.
- **Money:** kills, plants and defuses pay; wins pay more than losses, and a
  losing streak pays a little extra. Spend it on the Raptor-9 SMG, the
  Longshot rifle, the Deadeye sniper, frag and smoke grenades, kevlar and a
  helmet.
- **Gunplay:** hits are raycast against bodies with headshot multipliers,
  spread grows while moving and shrinks while crouched or aiming, and every
  gun has its own recoil, magazine and reload.
- **Bots:** rookies, veterans and elites with different reaction times,
  burst lengths and accuracy. They follow routes through the yard, hold
  angles, investigate gunshots, call out what they see, escort the carrier,
  plant, retake and defuse.
- **The yard:** a fenced freight yard at dusk — rusted silos, a pipe gantry
  over the middle doors, shipping containers, crate cover and hazard-marked
  bomb sites, all built from three.js geometry and painted canvas textures.

## Verify

The game ships a headless self-test: it starts a match, walks, strafes and
fires through scripted input, forces a round end and checks the next round's
buy phase starts cleanly, then reports the outcome in `window.__selftest`
and the document title. Run it in headless Chrome against the local server:

```sh
node serve.ts &
chrome-headless-shell --headless --dump-dom \
  "http://localhost:8080/?selftest=1&frames=1800" | grep -o 'SELFTEST .*'
```

Screenshots are real renders of the same code: open
`http://localhost:8080/?shot=start|play|buy|end&seed=1` in headless Chrome
at 1280x720 and capture the frame once `window.__shotReady` is set.

## Hand in

Put 3–4 screenshots in `screenshots/` (the first by name is the cover),
then run:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## Layout

- `game/index.html` — the page, HUD and import map for three.js 0.187.0
- `game/src/main.js` — boot, the one loop, rounds, combat wiring
- `game/src/world.js` — the yard, its colliders and the bot nav graph
- `game/src/bots.js` — the bot brain: vision, hearing, tiers, callouts
- `game/src/player.js` — first-person movement, collision, damage
- `game/src/weapons.js` — guns, the viewmodel, grenades
- `game/src/bomb.js` — the bomb: carry, plant, defuse, detonate
- `game/src/economy.js` — money, rewards, the buy catalogue
- `game/src/fx.js` — pooled tracers and impact sparks
- `game/src/hud.js` — health, ammo, timer, score, killfeed, buy menu
- `game/src/audio.js` — procedural WebAudio sounds, no audio files
- `game/src/input.js` — pointer lock, keys, mouse look
- `game/src/palette.js` — the yard's one colour palette
- `game/src/rng.js` — small seeded-random helpers
- `game/vendor/three/` — three.js 0.187.0, vendored byte for byte
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged
