// SAYAP NUSANTARA — the archipelago's heightfield. Each island is a
// smooth dome; the volcano is a cone with a crater dip, rice island gets
// stepped terraces, and a little value noise roughens every slope. The
// sea is y = 0, so height <= 0 is water.

import { ISLANDS, RUNWAY } from './config.js';
import { valueNoise } from './random.js';

function islandHeight(isl, d) {
  if (d >= isl.r) return 0;
  const t = 1 - d / isl.r; // 0 at the shore, 1 at the centre
  const dome = t * t * (3 - 2 * t);
  let h = isl.h * dome;
  if (isl.kind === 'volcano') {
    // A steeper cone with a crater bowl at the top.
    h = isl.h * Math.pow(t, 1.6);
    if (d < isl.r * 0.16) h -= isl.h * 0.35 * (1 - d / (isl.r * 0.16));
  } else if (isl.kind === 'rice') {
    // Terraced steps on the hillside.
    const steps = Math.floor(h / 14);
    h = steps * 14 + Math.min(6, h - steps * 14);
  }
  return h;
}

export function terrainHeight(x, z) {
  let h = 0;
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < isl.r) h += islandHeight(isl, d);
  }
  if (h > 0.5) {
    // Roughen only where there is land, so the shoreline stays clean.
    h += valueNoise(x * 0.004, z * 0.004) * Math.min(14, h * 0.22);
    h += valueNoise(x * 0.02 + 7, z * 0.02 - 3) * Math.min(4, h * 0.08);
  }
  // Flatten the strip: the runway sits on levelled ground so the approach
  // reads and the touchdown height is the same along its whole length.
  const rdx = x - RUNWAY.x;
  const rdz = z - RUNWAY.z;
  const along = Math.abs(rdx * Math.sin(RUNWAY.heading * Math.PI / 180) + rdz * -Math.cos(RUNWAY.heading * Math.PI / 180));
  const across = Math.abs(rdx * Math.cos(RUNWAY.heading * Math.PI / 180) + rdz * Math.sin(RUNWAY.heading * Math.PI / 180));
  const near = Math.max(along / 260, across / 60);
  if (near < 1) {
    const f = (1 - near) * (1 - near) * (3 - 2 * (1 - near));
    h = h * (1 - f) + 42 * f;
  }
  return Math.max(0, h);
}

// Which island (if any) a point sits on, for naming the ground below.
export function islandAt(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const isl of ISLANDS) {
    const d = Math.hypot(x - isl.x, z - isl.z);
    if (d < isl.r && d < bestD) { best = isl; bestD = d; }
  }
  return best;
}
