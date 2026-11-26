// SAYAP NUSANTARA — the renderer: a pseudo-3D chase/cockpit view over
// the archipelago, drawn on one 2D canvas. A camera sits behind the
// plane (or in the cockpit), the island heightfield is projected as a
// painter-sorted mesh, rings and the runway are projected the same way,
// and the HUD paints altitude, speed, heading and lit instruments over
// it all. Nothing is loaded from the network; every shape is drawn here.

import { DROP_ZONE, H, LEGS, PALETTE, RINGS, RUNWAY, W } from './config.js';
import { islandAt, terrainHeight } from './terrain.js';
import { nextTarget } from './physics.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export const START_BUTTON = { x: 490, y: 528, w: 300, h: 64 };
export const VIEW_BUTTON = { x: 950, y: 164, w: 92, h: 32 };
export const PAUSE_BUTTON = { x: 1050, y: 164, w: 92, h: 32 };
export const MUTE_BUTTON = { x: 1150, y: 164, w: 92, h: 32 };
export const FLAPS_BUTTON = { x: 1150, y: 600, w: 118, h: 32 };
export const THR_BAR = { x: 1216, y: 300, w: 26, h: 260 };

const FOCAL = 520;
const DEG = Math.PI / 180;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function fmt(n, digits = 0) {
  return Math.round(n).toLocaleString('en-US');
}
function mmss(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function landColor(h, hx, hz) {
  // One hash per ground point keeps the shading steady frame to frame.
  const n = Math.sin(hx * 12.9898 + hz * 78.233) * 43758.5453;
  const shade = 0.9 + 0.2 * (n - Math.floor(n));
  let base;
  if (h < 3) base = [214, 186, 128];
  else if (h < 45) base = [93, 162, 74];
  else if (h < 120) base = [47, 122, 51];
  else if (h < 200) base = [138, 125, 107];
  else if (h < 240) base = [110, 90, 82];
  else base = [232, 228, 218];
  return `rgb(${Math.round(base[0] * shade)},${Math.round(base[1] * shade)},${Math.round(base[2] * shade)})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = W;
    canvas.height = H;
  }

  function cameraFor(world) {
    const p = world.plane;
    const fx = Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    let cam;
    let look;
    if (world.view === 'cockpit') {
      cam = { x: p.x + fx * 1.5, y: p.y + 1.5, z: p.z + fz * 1.5 };
      look = { x: p.x + fx * 90, y: p.y + Math.sin(p.pitch) * 40 + 1.5, z: p.z + fz * 90 };
    } else {
      cam = { x: p.x - fx * 24, y: p.y + 7, z: p.z - fz * 24 };
      look = { x: p.x + fx * 80, y: p.y + 1.0, z: p.z + fz * 80 };
    }
    const fwd = norm(sub(look, cam));
    const right = norm(cross(fwd, { x: 0, y: 1, z: 0 }));
    const up = cross(right, fwd);
    return { cam, fwd, right, up };
  }

  function project(cam, pt) {
    const d = sub(pt, cam.cam);
    const cz = dot(d, cam.fwd);
    if (cz < 2) return null;
    return {
      x: W / 2 + (dot(d, cam.right) / cz) * FOCAL,
      y: H / 2 - (dot(d, cam.up) / cz) * FOCAL,
      d: cz,
    };
  }

  function horizonY(cam) {
    const pitch = Math.asin(clamp(-cam.fwd.y, -0.9, 0.9));
    return H / 2 - FOCAL * Math.tan(pitch);
  }

  function drawSky(cam, world) {
    const hy = horizonY(cam);
    const sky = ctx.createLinearGradient(0, 0, 0, Math.max(hy, 1));
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(0.62, PALETTE.skyMid);
    sky.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, Math.max(hy, 0));
    // Sea below the horizon.
    if (hy < H) {
      const sea = ctx.createLinearGradient(0, hy, 0, H);
      sea.addColorStop(0, PALETTE.seaShallow);
      sea.addColorStop(1, PALETTE.seaDeep);
      ctx.fillStyle = sea;
      ctx.fillRect(0, Math.max(hy, 0), W, H - Math.max(hy, 0));
    }
    // Late sun, fixed in the west sky.
    const sunDir = norm({ x: -0.72, y: 0.34, z: -0.6 });
    const sunPt = project(cam, {
      x: cam.cam.x + sunDir.x * 4000,
      y: cam.cam.y + sunDir.y * 4000,
      z: cam.cam.z + sunDir.z * 4000,
    });
    if (sunPt) {
      const g = ctx.createRadialGradient(sunPt.x, sunPt.y, 4, sunPt.x, sunPt.y, 90);
      g.addColorStop(0, 'rgba(255,243,196,0.95)');
      g.addColorStop(0.25, 'rgba(255,220,130,0.55)');
      g.addColorStop(1, 'rgba(255,220,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sunPt.x, sunPt.y, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sunPt.x, sunPt.y, 22, 0, Math.PI * 2);
      ctx.fill();
      // Glitter path on the water under the sun: a soft trapezoid that
      // widens toward the viewer, never a hard-edged pillar.
      if (hy < H - 8) {
        const g2 = ctx.createLinearGradient(0, hy + 6, 0, H);
        g2.addColorStop(0, 'rgba(255,230,160,0.16)');
        g2.addColorStop(1, 'rgba(255,230,160,0.05)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.moveTo(sunPt.x - 10, hy + 6);
        ctx.lineTo(sunPt.x + 10, hy + 6);
        ctx.lineTo(sunPt.x + 46, H);
        ctx.lineTo(sunPt.x - 46, H);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Thin horizon haze.
    ctx.fillStyle = 'rgba(247,201,139,0.35)';
    ctx.fillRect(0, hy - 3, W, 6);
  }

  function drawTerrain(cam, world) {
    const p = world.plane;
    const cell = 120;
    const half = 1800;
    const ox = Math.round(p.x / cell) * cell - half;
    const oz = Math.round(p.z / cell) * cell - half;
    const n = (half * 2) / cell; // 24 cells a side
    const heights = [];
    for (let j = 0; j <= n; j++) {
      heights[j] = [];
      for (let i = 0; i <= n; i++) {
        heights[j][i] = terrainHeight(ox + i * cell, oz + j * cell);
      }
    }
    const cells = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const h00 = heights[j][i];
        const h10 = heights[j][i + 1];
        const h01 = heights[j + 1][i];
        const h11 = heights[j + 1][i + 1];
        const maxH = Math.max(h00, h10, h01, h11);
        if (maxH <= 0.4) continue;
        const cx = ox + (i + 0.5) * cell;
        const cz = oz + (j + 0.5) * cell;
        const dist = Math.hypot(cx - p.x, cz - p.z);
        cells.push({ i, j, h00, h10, h01, h11, maxH, dist });
      }
    }
    cells.sort((a, b) => b.dist - a.dist);
    for (const c of cells) {
      const x0 = ox + c.i * cell;
      const z0 = oz + c.j * cell;
      const pts = [
        project(cam, { x: x0, y: c.h00, z: z0 }),
        project(cam, { x: x0 + cell, y: c.h10, z: z0 }),
        project(cam, { x: x0 + cell, y: c.h11, z: z0 + cell }),
        project(cam, { x: x0, y: c.h01, z: z0 + cell }),
      ];
      if (pts.some((q) => !q)) continue;
      // Skip edge-on slivers: a cell seen almost side-on projects as a
      // thin pillar that reads as a glitch, not as ground.
      const xs = pts.map((q) => q.x);
      const ys = pts.map((q) => q.y);
      const bw = Math.max(...xs) - Math.min(...xs);
      const bh = Math.max(...ys) - Math.min(...ys);
      if ((bw < 4 && bh > 30) || (bh < 4 && bw > 30)) continue;
      // A tall, thin quad is a cell seen almost edge-on (often straddling
      // the shoreline right under the camera): it reads as a grey pillar.
      if (bh > 260 && bw < 80) continue;
      const avg = (c.h00 + c.h10 + c.h01 + c.h11) / 4;
      ctx.fillStyle = landColor(avg, x0, z0);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRunway(cam, world) {
    const h = RUNWAY.heading * DEG;
    const fx = Math.sin(h);
    const fz = -Math.cos(h);
    const rx = -fz;
    const rz = fx;
    const gy = terrainHeight(RUNWAY.x, RUNWAY.z) + 0.6;
    const L = RUNWAY.length / 2;
    const Wd = RUNWAY.width / 2;
    const corners = [
      { x: RUNWAY.x - fx * L - rx * Wd, y: gy, z: RUNWAY.z - fz * L - rz * Wd },
      { x: RUNWAY.x + fx * L - rx * Wd, y: gy, z: RUNWAY.z + fz * L - rz * Wd },
      { x: RUNWAY.x + fx * L + rx * Wd, y: gy, z: RUNWAY.z + fz * L + rz * Wd },
      { x: RUNWAY.x - fx * L + rx * Wd, y: gy, z: RUNWAY.z - fz * L + rz * Wd },
    ].map((q) => project(cam, q));
    if (corners.some((q) => !q)) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(corners[k].x, corners[k].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Centreline dashes.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    for (let s = -L + 20; s < L - 20; s += 40) {
      const a = project(cam, { x: RUNWAY.x + fx * s, y: gy + 0.1, z: RUNWAY.z + fz * s });
      const b = project(cam, { x: RUNWAY.x + fx * (s + 20), y: gy + 0.1, z: RUNWAY.z + fz * (s + 20) });
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Threshold bars at the near end.
    for (const side of [-1, 1]) {
      const a = project(cam, { x: RUNWAY.x - fx * (L - 12) + rx * side * (Wd - 4), y: gy + 0.1, z: RUNWAY.z - fz * (L - 12) + rz * side * (Wd - 4) });
      const b = project(cam, { x: RUNWAY.x - fx * (L - 12) + rx * side * (Wd - 9), y: gy + 0.1, z: RUNWAY.z - fz * (L - 12) + rz * side * (Wd - 9) });
      if (!a || !b) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const label = project(cam, { x: RUNWAY.x - fx * (L + 40), y: gy + 2, z: RUNWAY.z - fz * (L + 40) });
    if (label && world.leg !== 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(RUNWAY.name, label.x, label.y);
    }
  }

  function drawDropZone(cam, world) {
    if (world.leg !== 1) return;
    const gy = terrainHeight(DROP_ZONE.x, DROP_ZONE.z) + 1;
    const pts = [];
    for (let k = 0; k <= 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const q = project(cam, { x: DROP_ZONE.x + Math.cos(a) * DROP_ZONE.r, y: gy, z: DROP_ZONE.z + Math.sin(a) * DROP_ZONE.r });
      if (q) pts.push(q);
    }
    if (pts.length < 3) return;
    ctx.strokeStyle = 'rgba(255,179,71,0.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const q of pts) ctx.lineTo(q.x, q.y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,179,71,0.16)';
    ctx.fill();
    const c = project(cam, { x: DROP_ZONE.x, y: gy + 2, z: DROP_ZONE.z });
    if (c) {
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ZONA KARGO', c.x, c.y);
    }
  }

  function drawRings(cam, world) {
    // Far rings first so the near one draws over them.
    const order = RINGS.map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const da = Math.hypot(a.r.x - world.plane.x, a.r.z - world.plane.z);
        const db = Math.hypot(b.r.x - world.plane.x, b.r.z - world.plane.z);
        return db - da;
      });
    for (const { r, i } of order) {
      if (world.ringsDone[i]) continue;
      const isNext = world.leg === 0 && world.ringsDone.findIndex((d) => !d) === i;
      // The hoop stands vertical, facing the way you arrive from.
      const prev = i === 0
        ? { x: RUNWAY.x, z: RUNWAY.z }
        : { x: RINGS[i - 1].x, z: RINGS[i - 1].z };
      let nx = r.x - prev.x;
      let nz = r.z - prev.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      const ux = -nz;
      const uz = nx;
      const pts = [];
      for (let k = 0; k <= 26; k++) {
        const a = (k / 26) * Math.PI * 2;
        const q = project(cam, {
          x: r.x + ux * Math.cos(a) * r.r,
          y: r.y + Math.sin(a) * r.r,
          z: r.z + uz * Math.cos(a) * r.r,
        });
        if (q) pts.push(q);
      }
      if (pts.length < 4) continue;
      const pulse = isNext ? 0.75 + 0.25 * Math.sin(world.elapsed * 5) : 0.55;
      ctx.lineWidth = isNext ? 9 : 6;
      ctx.strokeStyle = isNext
        ? `rgba(125,255,158,${0.35 * pulse + 0.25})`
        : 'rgba(255,179,71,0.4)';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const q of pts) ctx.lineTo(q.x, q.y);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = isNext ? 3.5 : 2.5;
      ctx.strokeStyle = isNext ? '#7dff9e' : 'rgba(255,179,71,0.85)';
      ctx.stroke();
      // A thin guide line down to the ground so the height reads.
      const top = project(cam, { x: r.x, y: r.y, z: r.z });
      const bot = project(cam, { x: r.x, y: terrainHeight(r.x, r.z) + 1, z: r.z });
      if (top && bot) {
        ctx.strokeStyle = isNext ? 'rgba(125,255,158,0.5)' : 'rgba(255,179,71,0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bot.x, bot.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawClouds(cam, world) {
    const list = world.clouds
      .map((c) => ({ c, q: project(cam, { x: c.x, y: c.y, z: c.z }) }))
      .filter((e) => e.q)
      .sort((a, b) => b.q.d - a.q.d);
    for (const { c, q } of list) {
      const s = (c.r / q.d) * FOCAL;
      if (s < 4) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, s, s * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse(q.x - s * 0.55, q.y + s * 0.08, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(q.x + s * 0.55, q.y + s * 0.08, s * 0.6, s * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCargo(cam, world) {
    if (!world.cargo) return;
    const q = project(cam, { x: world.cargo.x, y: world.cargo.y, z: world.cargo.z });
    if (!q) return;
    const s = clamp((26 / q.d) * FOCAL / 40, 3, 26);
    ctx.fillStyle = '#c98a2e';
    ctx.beginPath();
    ctx.arc(q.x, q.y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a4d12';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!world.cargo.landed) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(q.x, q.y - s * 1.6, s * 1.1, Math.PI, 0);
      ctx.fill();
    }
  }

  // The bush plane herself, chase view: seen from behind and above, nose
  // pointing up-screen, banking with the turn, prop spinning at the nose.
  function drawPlane(world) {
    const p = world.plane;
    const cx = W / 2;
    const cy = 442;
    const s = 0.8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-p.bank * 0.85);
    ctx.scale(s, s);
    // Ground shadow when she is low.
    const ground = terrainHeight(p.x, p.z);
    const agl = p.y - ground;
    if (agl < 260 && !p.onGround) {
      ctx.fillStyle = `rgba(0,0,0,${clamp(0.28 - agl / 1200, 0.05, 0.28)})`;
      ctx.beginPath();
      ctx.ellipse(0, 96 + agl * 0.35, 70 - agl * 0.1, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Main wings.
    ctx.fillStyle = '#e8542f';
    ctx.beginPath();
    ctx.moveTo(-158, -6);
    ctx.lineTo(-34, -26);
    ctx.lineTo(34, -26);
    ctx.lineTo(158, -6);
    ctx.lineTo(150, 10);
    ctx.lineTo(30, 2);
    ctx.lineTo(-30, 2);
    ctx.lineTo(-150, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f6f1e6';
    ctx.beginPath();
    ctx.moveTo(-158, -6);
    ctx.lineTo(-146, -4);
    ctx.lineTo(-140, 8);
    ctx.lineTo(-150, 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(158, -6);
    ctx.lineTo(146, -4);
    ctx.lineTo(140, 8);
    ctx.lineTo(150, 10);
    ctx.closePath();
    ctx.fill();
    // Tailplane and fin (near the camera, at the bottom).
    ctx.fillStyle = '#c7431f';
    ctx.beginPath();
    ctx.moveTo(-58, 62);
    ctx.lineTo(-14, 48);
    ctx.lineTo(14, 48);
    ctx.lineTo(58, 62);
    ctx.lineTo(52, 74);
    ctx.lineTo(-52, 74);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8542f';
    ctx.beginPath();
    ctx.moveTo(-13, 66);
    ctx.lineTo(0, 8);
    ctx.lineTo(13, 66);
    ctx.closePath();
    ctx.fill();
    // Fuselage: wide at the tail, tapering to the nose.
    const body = ctx.createLinearGradient(-20, 0, 20, 0);
    body.addColorStop(0, '#f6f1e6');
    body.addColorStop(0.5, '#fffaf0');
    body.addColorStop(1, '#e8dfc8');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-26, 78);
    ctx.quadraticCurveTo(-30, 10, -13, -58);
    ctx.quadraticCurveTo(0, -72, 13, -58);
    ctx.quadraticCurveTo(30, 10, 26, 78);
    ctx.quadraticCurveTo(0, 88, -26, 78);
    ctx.fill();
    ctx.strokeStyle = '#e8542f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-24, 40);
    ctx.quadraticCurveTo(-26, -10, -13, -52);
    ctx.moveTo(24, 40);
    ctx.quadraticCurveTo(26, -10, 13, -52);
    ctx.stroke();
    // Windows of the cabin, seen from behind the roof.
    ctx.fillStyle = '#274b63';
    ctx.beginPath();
    ctx.ellipse(0, -34, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Registration and name on the tail.
    ctx.fillStyle = '#7a2c12';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PK-SYN', 0, 62);
    // Spinning prop disc at the nose.
    const propA = world.propAngle % Math.PI;
    ctx.fillStyle = 'rgba(40,40,40,0.30)';
    ctx.beginPath();
    ctx.ellipse(0, -66, 30, 7, propA, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,40,40,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, -66, 30, 7, propA + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#33302c';
    ctx.beginPath();
    ctx.arc(0, -66, 5, 0, Math.PI * 2);
    ctx.fill();
    // Navigation lights, lit.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-158, 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#39e75f';
    ctx.beginPath();
    ctx.arc(158, 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 84, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDial(cx, cy, r, label, value, min, max, unit, color) {
    // A lit instrument: dark face, glowing amber ring, needle, digits.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#101c26';
    ctx.fill();
    ctx.strokeStyle = color || PALETTE.hudAmber;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color || PALETTE.hudAmber;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const frac = clamp((value - min) / (max - min), 0, 1);
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
      const x1 = cx + Math.cos(a) * (r - 9);
      const y1 = cy + Math.sin(a) * (r - 9);
      const x2 = cx + Math.cos(a) * (r - (k % 5 === 0 ? 18 : 14));
      const y2 = cy + Math.sin(a) * (r - (k % 5 === 0 ? 18 : 14));
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = k % 5 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    const a = Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = '#ff5a4e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 15), cy + Math.sin(a) * (r - 15));
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cfe3ef';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy - r * 0.52);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(`${fmt(value)}${unit ? ' ' + unit : ''}`, cx, cy + r * 0.62);
    ctx.restore();
  }

  function drawArtificialHorizon(cx, cy, r, world) {
    const p = world.plane;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-p.bank);
    const pitchPx = clamp(p.pitch * 220, -r, r);
    ctx.translate(0, pitchPx);
    ctx.fillStyle = '#4f9fd8';
    ctx.fillRect(-r - 2, -r * 2 - 2, (r + 2) * 2, r * 2 + 2);
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(-r - 2, 0, (r + 2) * 2, r * 2 + 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = PALETTE.hudAmber;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = PALETTE.hudAmber;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Fixed aircraft symbol.
    ctx.strokeStyle = '#ffe9b0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.moveTo(cx + 5, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
    ctx.fillStyle = '#cfe3ef';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HORIZON', cx, cy + r * 0.52);
    ctx.restore();
  }

  function drawCompassTape(world) {
    const hdg = ((world.plane.heading / DEG) % 360 + 360) % 360;
    const cx = W / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,26,0.72)';
    ctx.fillRect(cx - 230, 8, 460, 34);
    ctx.strokeStyle = 'rgba(255,179,71,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 230, 8, 460, 34);
    ctx.textAlign = 'center';
    for (let d = -60; d <= 60; d += 5) {
      let h = Math.round(hdg + d);
      h = ((h % 360) + 360) % 360;
      const x = cx + d * 3.6;
      const major = h % 30 === 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 38);
      ctx.lineTo(x, major ? 26 : 32);
      ctx.stroke();
      if (major) {
        const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        ctx.fillStyle = '#ffe9b0';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(names[h] ?? String(h).padStart(3, '0'), x, 22);
      }
    }
    // Centre caret and digital heading on a dark chip.
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(cx - 8, 42);
    ctx.lineTo(cx + 8, 42);
    ctx.lineTo(cx, 52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(10,18,26,0.85)';
    ctx.fillRect(cx - 32, 54, 64, 20);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', cx, 68);
    ctx.restore();
  }

  function drawHud(world, ui) {
    const p = world.plane;
    const altFt = p.y * 3.28084;
    const hdg = ((p.heading / DEG) % 360 + 360) % 360;
    drawCompassTape(world);

    // Top-left flight data: altitude, speed, vertical speed.
    ctx.save();
    ctx.textAlign = 'left';
    const box = (x, y, label, value, unit, color) => {
      ctx.fillStyle = 'rgba(10,18,26,0.72)';
      ctx.fillRect(x, y, 148, 52);
      ctx.strokeStyle = 'rgba(255,179,71,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, 148, 52);
      ctx.fillStyle = '#9fb8c8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(label, x + 10, y + 16);
      ctx.fillStyle = color || '#ffe9b0';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(value, x + 10, y + 42);
      ctx.fillStyle = '#9fb8c8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(unit, x + 112, y + 42);
    };
    box(12, 8, 'ALTITUDE', fmt(altFt), 'ft');
    box(12, 66, 'AIRSPEED', fmt(p.speedKt), 'kt', p.speedKt < 55 ? '#ff8a7a' : '#ffe9b0');
    box(12, 124, 'VERT SPEED', fmt(p.vspeed * 196.85), 'fpm');
    ctx.restore();

    // Top-right mission panel.
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,26,0.78)';
    ctx.fillRect(948, 8, 320, 148);
    ctx.strokeStyle = 'rgba(125,255,158,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(948, 8, 320, 148);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7dff9e';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`MISI ${world.leg + 1}/3 — ${LEGS[world.leg].title}`, 960, 30);
    ctx.fillStyle = '#dfe9ef';
    ctx.font = '13px sans-serif';
    ctx.fillText(LEGS[world.leg].detail, 960, 50);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`WAKTU ${mmss(world.timeLeft)}`, 960, 74);
    ctx.fillText(`SKOR ${fmt(world.score)}`, 1100, 74);
    // Rings progress.
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(970 + i * 26, 96, 8, 0, Math.PI * 2);
      ctx.fillStyle = world.ringsDone[i] ? '#7dff9e' : 'rgba(255,255,255,0.25)';
      ctx.fill();
      ctx.strokeStyle = '#7dff9e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = '#dfe9ef';
    ctx.font = '12px sans-serif';
    ctx.fillText(world.cargoDropped ? (world.dropScore ? `Kargo +${world.dropScore}` : 'Kargo dijatuhkan…') : 'Kargo di kabin', 1110, 100);
    // Fuel and throttle bars.
    const bar = (y, label, frac, color) => {
      ctx.fillStyle = '#9fb8c8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(label, 960, y + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(1030, y - 8, 220, 12);
      ctx.fillStyle = color;
      ctx.fillRect(1030, y - 8, 220 * clamp(frac, 0, 1), 12);
    };
    bar(124, 'FUEL', world.fuel / 100, world.fuel < 25 ? '#ff5a4e' : '#7dff9e');
    bar(144, 'THROTTLE', p.throttle, '#ffb347');
    ctx.restore();

    // Small buttons: view, pause, mute, flaps.
    const btn = (b, label, active) => {
      ctx.fillStyle = active ? 'rgba(255,179,71,0.85)' : 'rgba(10,18,26,0.72)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(255,179,71,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = active ? '#0a121a' : '#ffe9b0';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 4);
    };
    btn(VIEW_BUTTON, world.view === 'chase' ? 'VIEW: CHASE' : 'VIEW: COCKPIT', world.view === 'cockpit');
    btn(PAUSE_BUTTON, 'JEDA [P]');
    btn(MUTE_BUTTON, ui.muted ? 'SUARA: OFF' : 'SUARA: ON', ui.muted);
    btn(FLAPS_BUTTON, p.flaps ? 'FLAPS: ON [F]' : 'FLAPS: OFF [F]', p.flaps);

    // Throttle slider on the right edge.
    ctx.fillStyle = 'rgba(10,18,26,0.72)';
    ctx.fillRect(THR_BAR.x, THR_BAR.y, THR_BAR.w, THR_BAR.h);
    ctx.strokeStyle = 'rgba(255,179,71,0.6)';
    ctx.strokeRect(THR_BAR.x, THR_BAR.y, THR_BAR.w, THR_BAR.h);
    const thH = THR_BAR.h * p.throttle;
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(THR_BAR.x + 4, THR_BAR.y + THR_BAR.h - thH, THR_BAR.w - 8, thH);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THR', THR_BAR.x + THR_BAR.w / 2, THR_BAR.y - 6);
    ctx.fillText(`${Math.round(p.throttle * 100)}%`, THR_BAR.x + THR_BAR.w / 2, THR_BAR.y + THR_BAR.h + 14);

    // Next-target guidance: a diamond on the target, or an edge arrow.
    const target = nextTarget(world);
    if (target && !world.over) {
      const ty = target.kind === 'ring' ? target.y : terrainHeight(target.x, target.z) + 2;
      // Project with the current camera by rebuilding it here is wasteful;
      // main.js passes the camera through ui.cam.
      const q = ui.project ? ui.project({ x: target.x, y: ty, z: target.z }) : null;
      const dist = Math.hypot(p.x - target.x, p.z - target.z);
      const label = target.kind === 'ring'
        ? `RING ${target.index + 1} — ${fmt(dist)} m`
        : target.kind === 'drop' ? `ZONA KARGO — ${fmt(dist)} m` : `RUNWAY — ${fmt(dist)} m`;
      if (q && q.x > 60 && q.x < W - 60 && q.y > 90 && q.y < H - 120) {
        ctx.strokeStyle = '#7dff9e';
        ctx.lineWidth = 2.5;
        const r = target.kind === 'ring' ? 22 : 30;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - r);
        ctx.lineTo(q.x + r, q.y);
        ctx.lineTo(q.x, q.y + r);
        ctx.lineTo(q.x - r, q.y);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = '#7dff9e';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, q.x, q.y - r - 10);
      } else {
        // Off-screen: point the pilot with an edge arrow.
        const bearing = Math.atan2(target.x - p.x, -(target.z - p.z));
        const rel = normAngle(bearing - p.heading);
        const ax = W / 2 + Math.sin(rel) * 300;
        const ay2 = 330 - Math.cos(rel) * 130;
        ctx.save();
        ctx.translate(clamp(ax, 80, W - 80), clamp(ay2, 110, H - 160));
        ctx.rotate(rel);
        ctx.fillStyle = '#7dff9e';
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(12, 10);
        ctx.lineTo(-12, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#7dff9e';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, clamp(ax, 120, W - 120), clamp(ay2, 110, H - 160) + 32);
      }
    }

    // Warnings, centre-top under the compass.
    const warnings = [];
    if (p.speedKt < 55 && !p.onGround) warnings.push({ text: 'STALL — TAMBAH THROTTLE', color: '#ff5a4e' });
    if (world.fuel < 25) warnings.push({ text: 'BAHAN BAKAR RENDAH', color: '#ffb347' });
    const ground = terrainHeight(p.x, p.z);
    // No terrain warning on a lined-up final: descending toward the strip
    // is the plan, not a mistake.
    const onFinal = world.leg === 2 && Math.abs(p.x - RUNWAY.x) < 150
      && Math.abs(normAngle(p.heading - RUNWAY.heading * DEG)) < 0.5;
    if (!onFinal && !p.onGround && p.y - ground < 45 && p.vspeed < -2) warnings.push({ text: 'PULL UP — DARATAN!', color: '#ff5a4e' });
    if (world.gust && Math.abs(world.gust) > 9) warnings.push({ text: `ANGIN KENCANG ${Math.abs(Math.round(world.gust))} kt`, color: '#9fb8c8' });
    warnings.forEach((w, i) => {
      const blink = Math.sin(world.elapsed * 8) > -0.2;
      if (!blink && w.color === '#ff5a4e') return;
      ctx.fillStyle = w.color;
      ctx.font = 'bold 17px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(w.text, W / 2, 84 + i * 24);
    });

    // Toast line above the instruments.
    if (world.toastTimer > 0 && world.toast) {
      ctx.fillStyle = 'rgba(10,18,26,0.78)';
      const tw = ctx.measureText(world.toast).width + 28;
      ctx.fillRect(W / 2 - tw / 2, 596, tw, 30);
      ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(world.toast, W / 2, 616);
    }

    // Bottom instrument cluster: horizon, altimeter, airspeed, fuel.
    ctx.fillStyle = 'rgba(10,18,26,0.55)';
    ctx.fillRect(0, 636, W, 84);
    drawArtificialHorizon(120, 678, 34, world);
    drawDial(230, 678, 34, 'ALT ft', altFt, 0, 3000, '', '#7dff9e');
    drawDial(340, 678, 34, 'SPD kt', p.speedKt, 0, 160, '', '#ffb347');
    drawDial(450, 678, 34, 'HDG', hdg, 0, 360, '°', '#7fb2dd');
    drawDial(560, 678, 34, 'FUEL %', world.fuel, 0, 100, '', world.fuel < 25 ? '#ff5a4e' : '#7dff9e');
    ctx.fillStyle = '#9fb8c8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    const isl = islandAt(p.x, p.z);
    ctx.fillText(isl ? `DI ATAS ${isl.name.toUpperCase()}` : 'DI ATAS LAUT', 620, 668);
    ctx.fillText(`ANGIN ${Math.abs(Math.round(world.gust))} kt`, 620, 688);
    ctx.fillText(`FLAPS ${p.flaps ? 'ON' : 'OFF'}  •  V GANTI VIEW  •  F FLAPS  •  SPASI KARGO`, 620, 706);
  }

  function drawCockpitFrame(world) {
    // Glareshield, pillars and the nose, so the cockpit view reads as one.
    const p = world.plane;
    ctx.fillStyle = '#141c24';
    ctx.beginPath();
    ctx.moveTo(0, 470);
    ctx.quadraticCurveTo(W / 2, 430, W, 470);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0c1116';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(120, 0);
    ctx.lineTo(70, 470);
    ctx.lineTo(0, 470);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W - 120, 0);
    ctx.lineTo(W - 70, 470);
    ctx.lineTo(W, 470);
    ctx.closePath();
    ctx.fill();
    // Nose cone peeking over the panel, narrower so the runway stays in view.
    ctx.fillStyle = '#e8542f';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 58, 486);
    ctx.quadraticCurveTo(W / 2, 442, W / 2 + 58, 486);
    ctx.lineTo(W / 2 + 42, 552);
    ctx.lineTo(W / 2 - 42, 552);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f6f1e6';
    ctx.beginPath();
    ctx.ellipse(W / 2, 472, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Panel details: a row of lit switches and two gauge faces.
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#7dff9e' : '#ffb347';
      ctx.beginPath();
      ctx.arc(300 + i * 26, 520, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(754 + i * 26, 520, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#1c2733';
    ctx.beginPath();
    ctx.arc(430, 560, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(850, 560, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(430, 560, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(850, 560, 22, 0, Math.PI * 2);
    ctx.stroke();
    // Yoke: a short column and a half-wheel, kept small and low.
    ctx.strokeStyle = '#2a343f';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(W / 2, 560);
    ctx.lineTo(W / 2, 592);
    ctx.stroke();
    ctx.strokeStyle = '#3a4653';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(W / 2, 592, 24, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    void p;
  }

  function drawTitle(world, ui) {
    // A live scene behind the panel: the plane parked on the strip.
    ctx.fillStyle = 'rgba(8,14,20,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,18,26,0.88)';
    ctx.fillRect(240, 90, 800, 470);
    ctx.strokeStyle = 'rgba(255,179,71,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(240, 90, 800, 470);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 58px sans-serif';
    ctx.fillText('SAYAP NUSANTARA', W / 2, 168);
    ctx.fillStyle = '#7dff9e';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Pilot bush antar-pulau — ring, kargo, dan satu runway pendek', W / 2, 204);
    ctx.fillStyle = '#dfe9ef';
    ctx.font = '16px sans-serif';
    const lines = [
      'W / S — throttle naik / turun      •      Panah atas / bawah — naik / turun',
      'Panah kiri / kanan atau A / D — belok      •      SPASI — jatuhkan kargo',
      'F — flaps (bantu mendarat)      •      V — ganti view      •      P — jeda      •      klik tombol di layar juga bisa',
      '',
      'Misi: lewati 5 ring hijau, jatuhkan kargo tepat di sawah Pulau Sawah,',
      'lalu mendarat mulus di Karang Strip sebelum waktu atau bahan bakar habis.',
      'Hati-hati: di bawah 55 knot pesawat stall, dan daratan tidak memaafkan.',
    ];
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 248 + i * 26));
    if (ui.best > 0) {
      ctx.fillStyle = '#ffe9b0';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText(`Skor terbaik: ${fmt(ui.best)}`, W / 2, 248 + lines.length * 26 + 8);
    }
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(START_BUTTON.x, START_BUTTON.y, START_BUTTON.w, START_BUTTON.h);
    ctx.fillStyle = '#0a121a';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('TERBANG  [ENTER]', W / 2, START_BUTTON.y + 42);
  }

  function drawOver(world, ui) {
    ctx.fillStyle = 'rgba(8,14,20,0.55)';
    ctx.fillRect(0, 0, W, H);
    const over = world.over;
    ctx.fillStyle = 'rgba(10,18,26,0.92)';
    ctx.fillRect(340, 150, 600, 380);
    ctx.strokeStyle = over.win ? 'rgba(125,255,158,0.8)' : 'rgba(255,90,78,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(340, 150, 600, 380);
    ctx.textAlign = 'center';
    ctx.fillStyle = over.win ? '#7dff9e' : '#ff5a4e';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(over.win ? 'MISI SELESAI!' : 'MISI GAGAL', W / 2, 214);
    ctx.fillStyle = '#dfe9ef';
    ctx.font = '16px sans-serif';
    ctx.fillText(over.reason, W / 2, 248);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`SKOR AKHIR  ${fmt(world.score)}`, W / 2, 296);
    ctx.fillStyle = '#dfe9ef';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Ring: ${world.ringsPassed}/5  (+${world.ringsPassed * 500})`, W / 2, 330);
    ctx.fillText(`Kargo: +${world.dropScore}`, W / 2, 356);
    if (over.win) {
      ctx.fillText(`Mendarat: +1000   •   Bonus waktu: +${over.timeBonus}   •   Bonus bahan bakar: +${over.fuelBonus}`, W / 2, 382);
    } else {
      ctx.fillText('Mendarat: +0', W / 2, 382);
    }
    if (world.score > ui.best) {
      ctx.fillStyle = '#7dff9e';
      ctx.font = 'bold 17px sans-serif';
      ctx.fillText('SKOR TERBAIK BARU!', W / 2, 414);
    }
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(START_BUTTON.x, START_BUTTON.y, START_BUTTON.w, START_BUTTON.h);
    ctx.fillStyle = '#0a121a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('TERBANG LAGI  [ENTER]', W / 2, START_BUTTON.y + 42);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,14,20,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JEDA', W / 2, 340);
    ctx.fillStyle = '#dfe9ef';
    ctx.font = '18px sans-serif';
    ctx.fillText('Tekan P atau klik JEDA untuk lanjut terbang.', W / 2, 380);
  }

  function drawScene(world, screen, ui, particles) {
    const cam = cameraFor(world);
    drawSky(cam, world);
    drawTerrain(cam, world);
    drawRunway(cam, world);
    drawDropZone(cam, world);
    drawRings(cam, world);
    drawCargo(cam, world);
    drawClouds(cam, world);
    if (world.view === 'chase') drawPlane(world);
    else drawCockpitFrame(world);
    // Particles on top of the world, under the HUD.
    for (const pt of particles.parts) {
      const a = 1 - pt.age / pt.life;
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of particles.texts) {
      const a = 1 - t.age / t.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color;
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y - t.age * 40);
    }
    ctx.globalAlpha = 1;
    const ui2 = { ...ui, project: (pt) => project(cam, pt) };
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(world, ui2);
    if (screen === SCREEN_TITLE) drawTitle(world, ui);
    if (screen === SCREEN_OVER) drawOver(world, ui);
    if (screen === SCREEN_PAUSED) drawPaused();
  }

  function hitAt(world, screen, x, y) {
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER) {
      if (x >= START_BUTTON.x && x <= START_BUTTON.x + START_BUTTON.w
        && y >= START_BUTTON.y && y <= START_BUTTON.y + START_BUTTON.h) {
        return { type: 'start' };
      }
      return null;
    }
    if (screen !== SCREEN_PLAY && screen !== SCREEN_PAUSED) return null;
    const inBox = (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (inBox(VIEW_BUTTON)) return { type: 'view' };
    if (inBox(PAUSE_BUTTON)) return { type: 'pause' };
    if (inBox(MUTE_BUTTON)) return { type: 'mute' };
    if (inBox(FLAPS_BUTTON)) return { type: 'flaps' };
    if (inBox(THR_BAR)) {
      const frac = clamp(1 - (y - THR_BAR.y) / THR_BAR.h, 0, 1);
      return { type: 'throttle', value: frac };
    }
    return null;
  }

  return { resize, draw: drawScene, hitAt };
}
