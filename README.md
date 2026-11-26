# SAYAP NUSANTARA — Pilot Bush Antar-Pulau

Entry for make.fun `best-flight-game-20261126-0057`. A small STOL bush
plane, a six-minute clock, and one archipelago: thread five glowing
rings, drop a cargo crate onto the rice terraces of Pulau Sawah, then
bring her home onto the short strip at Pulau Karang before the fuel or
the clock runs out.

## How to play

- **W / S** — throttle up / down (or click the THR bar on the right edge)
- **Arrow keys up / down** — climb / descend
- **Arrow keys left / right** or **A / D** — bank and turn
- **Space** — drop the cargo (only on the cargo leg)
- **F** — flaps (slows you down, helps the landing float)
- **V** — chase view / cockpit view, **P** — pause, **M** — mute
- Every button on the screen is clickable too.

Stall below 55 kt and she sinks; hit a hill or the sea and the mission
ends. Land on the strip — slow, low, lined up, flaps down — to finish.

## Run it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

No build step, no network request at run time: plain static files,
canvas art drawn in code, sound synthesized with WebAudio.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored `vendor/makefun-game.ts`.

## Layout

- `game/index.html` — the page, one canvas
- `game/src/config.js` — envelope, islands, rings, runway, mission data
- `game/src/terrain.js` — the archipelago heightfield (islands + noise,
  runway flattened)
- `game/src/physics.js` — the flight model and the three mission legs
- `game/src/render.js` — pseudo-3D chase/cockpit view, HUD, lit instruments
- `game/src/shots.js` — the four staged screenshot scenes
- `game/src/audio.js`, `input.js`, `particles.js`, `random.js`, `main.js`
- `screenshots/` — 4 real renders of the game's own code, 1280x720
