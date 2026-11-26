// SAYAP NUSANTARA — boot and the one loop: input is read every frame,
// the world advances in fixed 1/60 s steps, and the renderer paints what
// is there. Four screens: title, play, paused and game over.
//
// ?seed=N fixes the island layout. ?shot=cover|rings|drop|landing (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createInput, ACTION_CONFIRM, ACTION_DROP, ACTION_FLAPS, ACTION_MUTE, ACTION_PAUSE, ACTION_VIEW } from './input.js';
import { createParticles } from './particles.js';
import { createWorld, dropCargo, startFlight, updateWorld } from './physics.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const world = createWorld(random);
const particles = createParticles(random);
const audio = createAudio();
const renderer = createRenderer(canvas);
const input = createInput(canvas, (nx, ny) => ({ x: nx * 1280, y: ny * 720 }));

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

let screen = SCREEN_TITLE;
let best = 0;
try { best = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { best = 0; }

function saveBest(value) {
  try { window.localStorage.setItem(BEST_KEY, String(value)); } catch { /* storage can be off */ }
}

function announce(text) {
  status.textContent = text;
}

function startGame() {
  audio.unlock();
  const fresh = createWorld(createRandom(seed));
  // Swap the world in place so the debug hooks keep pointing at it.
  for (const k of Object.keys(world)) delete world[k];
  Object.assign(world, fresh);
  startFlight(world);
  screen = SCREEN_PLAY;
  announce('Misi dimulai. Lewati 5 ring hijau!');
}

function handleClick(click) {
  audio.unlock();
  if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
    const hit = renderer.hitAt(world, screen, click.x, click.y);
    if (hit && hit.type === 'start') startGame();
    return;
  }
  const hit = renderer.hitAt(world, screen, click.x, click.y);
  if (!hit) return;
  if (hit.type === 'view') world.view = world.view === 'chase' ? 'cockpit' : 'chase';
  else if (hit.type === 'pause') screen = screen === SCREEN_PAUSED ? SCREEN_PLAY : SCREEN_PAUSED;
  else if (hit.type === 'mute') audio.toggleMute();
  else if (hit.type === 'flaps') world.plane.flaps = !world.plane.flaps;
  else if (hit.type === 'throttle') world.plane.throttle = hit.value;
}

function handleKey(key) {
  if (key === ACTION_CONFIRM) {
    audio.unlock();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
    else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    return;
  }
  if (key === ACTION_PAUSE) {
    if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
    else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    return;
  }
  if (key === ACTION_MUTE) { audio.toggleMute(); return; }
  if (key === ACTION_VIEW) {
    if (screen === SCREEN_PLAY) world.view = world.view === 'chase' ? 'cockpit' : 'chase';
    return;
  }
  if (key === ACTION_FLAPS) {
    if (screen === SCREEN_PLAY) world.plane.flaps = !world.plane.flaps;
    return;
  }
  if (key === ACTION_DROP) {
    if (screen === SCREEN_PLAY) dropCargo(world, audio);
  }
}

function stage(name) {
  if (!stageShot(name, world, particles)) return;
  renderer.draw(world, SCREEN_PLAY, { best, muted: audio.muted }, particles);
  renderer.draw(world, SCREEN_PLAY, { best, muted: audio.muted }, particles);
  window.__shotReady = true;
}

window.__shot = stage;
window.__world = world;
window.__screen = () => screen;
// Playtest hook: place the plane somewhere real and let the loop fly her.
window.__flyTo = (x, z, y, headingDeg, speedKt, throttle) => {
  const p = world.plane;
  p.x = x; p.z = z; p.y = y;
  p.heading = (headingDeg * Math.PI) / 180;
  p.speedKt = speedKt;
  p.throttle = throttle;
  p.onGround = false;
  p.pitch = 0; p.bank = 0;
  return { x: p.x, y: p.y, z: p.z };
};

if (shot) {
  // Staged screenshot mode: one scene, one frame, no loop, no audio.
  renderer.resize();
  stage(shot);
} else {
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    for (const click of input.takeClicks()) handleClick(click);
    for (const key of input.takeKeys()) handleKey(key);
    if (screen === SCREEN_PLAY) {
      acc += dt;
      while (acc >= STEP) {
        updateWorld(world, STEP, input.controls(), audio, particles);
        acc -= STEP;
        if (world.over) {
          screen = SCREEN_OVER;
          if (world.score > best) { best = world.score; saveBest(best); }
          announce(world.over.win ? 'Misi selesai!' : `Misi gagal: ${world.over.reason}`);
          break;
        }
      }
      particles.update(dt);
    } else {
      particles.update(dt);
      // Idle life behind the title: the prop idles on the strip.
      world.propAngle += dt * 3;
    }
    renderer.draw(world, screen, { best, muted: audio.muted }, particles);
  }
  requestAnimationFrame(frame);
}
