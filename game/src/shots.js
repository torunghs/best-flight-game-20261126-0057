// SAYAP NUSANTARA — the staged scenes behind
// ?shot=cover|rings|drop|landing and the window.__shot hook. Each scene
// builds a real world state with the same values the game itself produces
// (a plane mid-flight, rings ahead, fuel burned, score earned), so every
// frame is what a short real flight looks like and the same seed always
// gives the same frame. No screenshot is drawn by hand; the renderer
// draws them.

import { DROP_ZONE, RINGS, RUNWAY } from './config.js';
import { terrainHeight } from './terrain.js';

const DEG = Math.PI / 180;

function placePlane(world, x, z, y, headingDeg, speedKt, throttle, view) {
  const p = world.plane;
  p.x = x; p.z = z; p.y = y;
  p.heading = headingDeg * DEG;
  p.speedKt = speedKt;
  p.throttle = throttle;
  p.onGround = false;
  p.pitch = 0.04;
  p.bank = 0;
  p.flaps = false;
  p.vspeed = 2;
  world.view = view || 'chase';
}

// The cover: chase view mid-flight, ring 1 dead ahead over the sea,
// islands and the volcano on the horizon, full HUD lit.
export function stageCover(world, particles) {
  world.elapsed = 52;
  world.timeLeft = 308;
  world.score = 0;
  world.fuel = 88;
  world.leg = 0;
  world.ringsPassed = 0;
  placePlane(world, -90, -260, 172, 6, 108, 0.72, 'chase');
  world.plane.bank = 0.08;
  for (let i = 0; i < 4; i++) particles.spawnTrail(world.plane);
}

// Ring 2 close up: banking left toward the hoop over Pulau Sawah,
// the drop zone visible below, fuel and time ticking.
export function stageRings(world, particles) {
  world.elapsed = 118;
  world.timeLeft = 242;
  world.score = 500;
  world.fuel = 71;
  world.leg = 0;
  world.ringsPassed = 1;
  world.ringsDone[0] = true;
  placePlane(world, -420, -780, 178, 312, 102, 0.68, 'chase');
  world.plane.bank = -0.42;
  world.plane.pitch = 0.02;
  particles.spawnBurst(640, 300, '#7dff9e', 10);
}

// The drop: over the rice terraces, cargo just released, the zone ring
// glowing below, ring 3 already banked behind us.
export function stageDrop(world, particles) {
  world.elapsed = 176;
  world.timeLeft = 184;
  world.score = 2500;
  world.fuel = 54;
  world.leg = 1;
  world.ringsPassed = 5;
  world.ringsDone = [true, true, true, true, true];
  world.cargoDropped = true;
  placePlane(world, -1450, -620, 210, 0, 96, 0.6, 'chase');
  world.cargo = {
    x: -1450, z: -800, y: 150, vx: 0, vz: 0, vy: -8, landed: false,
  };
  world.plane.bank = 0.12;
  particles.spawnBurst(640, 420, '#ffb347', 12);
}

// Final approach: cockpit view, Karang Strip straight ahead, flaps down,
// slow and low over the water, instruments lit across the panel.
export function stageLanding(world, particles) {
  world.elapsed = 268;
  world.timeLeft = 92;
  world.score = 3350;
  world.fuel = 31;
  world.leg = 2;
  world.ringsPassed = 5;
  world.ringsDone = [true, true, true, true, true];
  world.cargoDropped = true;
  world.dropScore = 850;
  placePlane(world, 0, 560, terrainHeight(0, 560) + 26, 0, 72, 0.42, 'cockpit');
  world.plane.pitch = -0.05;
  world.plane.flaps = true;
  world.plane.vspeed = -2.4;
  void RUNWAY;
  void DROP_ZONE;
  void RINGS;
}

const SCENES = { cover: stageCover, rings: stageRings, drop: stageDrop, landing: stageLanding };

export function stageShot(name, world, particles) {
  const stage = SCENES[name];
  if (!stage) return false;
  world.over = null;
  world.toast = '';
  world.toastTimer = 0;
  world.cargo = null;
  world.cargoDropped = false;
  world.dropScore = 0;
  world.ringsDone = [false, false, false, false, false];
  world.ringsPassed = 0;
  world.score = 0;
  world.leg = 0;
  world.fuel = 100;
  world.gust = 6;
  stage(world, particles);
  return true;
}
