# BUILD NOTES — SAYAP NUSANTARA (best-flight-game-20261126-0057)

## Concept

An Indonesian bush-pilot game, built from scratch in one session on
26 Nov 2026: the player flies a small orange STOL prop plane
("PK-SYN") between the islands of a fictional archipelago — Pulau
Karang (home strip), Pulau Sawah (rice terraces), Gunung Api (a
volcano with a crater), Pulau Hutan, Pulau Batu and a handful of sandy
islets. The idea is deliberately local: the mission is a working
flight — rings, a cargo drop, a short-strip landing — instead of a
generic dogfight. All art is canvas shapes drawn in code
(`game/src/render.js`, `game/src/terrain.js`); all sound is
synthesized with WebAudio (`game/src/audio.js`). No images, no audio
files, no libraries, no network request at run time.

## How it plays

1. Take off from Karang Strip: throttle up (W), pull up (arrow up)
   past 58 kt. The strip points north, straight at the first ring.
2. Leg 1 — thread 5 glowing green rings in order; each is worth 500
   points. A diamond marker and a distance readout point at the next
   one; an edge arrow takes over when it is off-screen.
3. Leg 2 — drop the cargo (Space) onto the dashed orange circle on
   Pulau Sawah's terraces; up to 1,000 points by accuracy. The crate
   keeps some forward speed, so drop just short of the circle.
4. Leg 3 — come home and land on Karang Strip: under 88 kt, gentle
   descent, lined up with the runway. Flaps (F) help the float. A good
   landing pays 1,000 plus time and fuel bonuses.
5. Six minutes on the clock, 100% fuel. Below 55 kt the wing stalls
   and she sinks; hills and the sea end the mission. Wind gusts nudge
   the nose; a PULL UP warning fires when terrain is close — except on
   a lined-up final, where descending is the plan.

## What was tested (headless Chrome 159, 26 Nov 2026)

- **Syntax:** `node --check` passes on all 10 game sources, main.ts,
  serve.ts, shot.mjs and playtest.mjs.
- **Full playtest (`playtest.mjs`, real CDP keyboard input):** title →
  start, throttle to 118 kt, pull up — airborne at 69 m; ring 1 flown
  through (+500); cargo dropped over the sawah and landed (+736,
  leg advanced to landing); short final, flaps down, touchdown —
  mission complete, score 5,159. Zero console errors.
- **Bugs found by the playtest and fixed:** the plane crashed on the
  exact step of liftoff (the ground check read the rest height as a
  crash — fixed with a small hop on rotation); the landing was judged
  a crash because full-pitch descent (-7.6 m/s) beat the -7 m/s gentle
  limit while flaps only helped below 70 kt (limit relaxed to -8.5,
  flaps effective below 90 kt).
- **Screenshots:** 4 staged scenes via `?shot=cover|rings|drop|landing`
  (`game/src/shots.js`, each a real world state built with the game's
  own values), captured at 1280x720 JPEG in headless Chrome, visually
  inspected twice; layout bugs found in the first pass (plane too
  large, ring hidden behind the plane, dial labels overlapping, a
  hard-edged sun-glitter pillar, a false PULL UP warning on final)
  were fixed and the shots retaken.
- **Entry program:** `MAKEFUN_OUTPUT_DIR=out node main.ts` writes
  `game/`, `screenshots/` and `dossier.json` (92 KB of source); run
  twice, the outputs are byte-identical.
- **Limits:** 4 screenshots, 86–92 KB each (cap 256 KiB), 1280x720
  (long side ≤ 1280, short side ≥ 480); `game/` is 11 files, ~92 KB
  (caps 993 files / 48 MiB); no file under `game/` references anything
  outside `game/` and no network call exists in the game.

## Deliverables

- `main.ts` (Node 22, stdlib only) — copies `game/` + `screenshots/` and
  writes `dossier.json` via `vendor/makefun-game.ts` (kit copy, unchanged,
  sha256 `dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129`)
- `game/` — `index.html` + 10 ES modules under `game/src/`
- `screenshots/` — `1-cover.jpg` (cover: chase view, ring 1 ahead, full
  HUD), `2-rings.jpg` (banking toward ring 2 over Pulau Sawah),
  `3-drop.jpg` (cargo away, zone ring glowing on the terraces),
  `4-landing.jpg` (cockpit view, Karang Strip straight ahead, flaps down)
- `LICENSE` (MIT, from the kit starter)
