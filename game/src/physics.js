// SAYAP NUSANTARA — the world state and the flight model. A small STOL
// bush plane: throttle sets a target speed, pitch trades speed for climb,
// bank turns the nose, and below stall speed she sinks and the controls
// go soft. Three legs in order: five rings, one cargo drop, one landing.

import { DROP_ZONE, FLIGHT, ISLANDS, LEGS, RINGS, RUNWAY, SCORES } from './config.js';
import { terrainHeight } from './terrain.js';

const KT_TO_MS = 0.514444;
const DEG = Math.PI / 180;

export function createWorld(random) {
  const clouds = [];
  for (let i = 0; i < 46; i++) {
    clouds.push({
      x: (random() - 0.5) * 6400,
      z: (random() - 0.5) * 6400,
      y: 320 + random() * 260,
      r: 90 + random() * 170,
    });
  }
  const ground = terrainHeight(RUNWAY.x, RUNWAY.z);
  return {
    random,
    clouds,
    plane: {
      x: RUNWAY.x, z: RUNWAY.z + RUNWAY.length / 2 - 30, y: ground + 1.2,
      heading: 0, speedKt: 0, throttle: 0, pitch: 0, bank: 0,
      vspeed: 0, onGround: true, flaps: false,
    },
    fuel: FLIGHT.fuelStart,
    score: 0,
    timeLeft: FLIGHT.missionSeconds,
    elapsed: 0,
    leg: 0,
    ringsDone: RINGS.map(() => false),
    ringsPassed: 0,
    cargoDropped: false,
    cargo: null,
    dropScore: 0,
    landingBonus: 0,
    over: null,
    toast: 'Naikkan throttle (W), lalu tarik ke atas (panah atas) untuk lepas landas.',
    toastTimer: 6,
    view: 'chase',
    gust: 0,
    gustTimer: 4,
    stallTimer: 0,
    warnTimer: 0,
    landed: false,
    propAngle: 0,
  };
}

export function nextTarget(world) {
  if (world.leg === 0) {
    const i = world.ringsDone.findIndex((d) => !d);
    return i === -1 ? null : { kind: 'ring', ...RINGS[i], index: i };
  }
  if (world.leg === 1) return { kind: 'drop', ...DROP_ZONE };
  return { kind: 'runway', ...RUNWAY };
}

function setToast(world, text, secs = 3) {
  world.toast = text;
  world.toastTimer = secs;
}

// Distance from the plane to the runway centreline, split into along-track
// (positive past the centre) and across-track metres.
function runwayOffset(world) {
  const p = world.plane;
  const dx = p.x - RUNWAY.x;
  const dz = p.z - RUNWAY.z;
  const h = RUNWAY.heading * DEG;
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  return { along: dx * fx + dz * fz, across: dx * -fz + dz * fx };
}

function crash(world, reason, audio) {
  if (world.over) return;
  world.over = { win: false, reason };
  if (audio) audio.crash();
}

function winLanding(world, audio) {
  if (world.over) return;
  const timeBonus = Math.round(world.timeLeft * 2);
  const fuelBonus = Math.round(world.fuel * 3);
  world.landingBonus = SCORES.landing + timeBonus + fuelBonus;
  world.score += world.landingBonus;
  world.landed = true;
  world.over = {
    win: true,
    reason: 'Mendarat mulus di Karang Strip — misi selesai!',
    timeBonus,
    fuelBonus,
  };
  if (audio) { audio.touchdown(); audio.win(); }
}

export function dropCargo(world, audio) {
  if (world.over || world.leg !== 1 || world.cargoDropped) {
    if (world.leg === 0) setToast(world, 'Selesaikan dulu 5 ring sebelum antar kargo.');
    return;
  }
  const p = world.plane;
  world.cargoDropped = true;
  world.cargo = {
    x: p.x, z: p.z, y: p.y - 2, vx: Math.sin(p.heading) * p.speedKt * KT_TO_MS * 0.35,
    vz: -Math.cos(p.heading) * p.speedKt * KT_TO_MS * 0.35, vy: 0, landed: false,
  };
  if (audio) audio.drop();
  setToast(world, 'Kargo dijatuhkan — lihat di mana dia mendarat!');
}

export function updateWorld(world, dt, controls, audio, particles) {
  const p = world.plane;
  if (world.over) return;
  world.elapsed += dt;
  world.timeLeft -= dt;
  world.propAngle += dt * (4 + p.throttle * 40);
  if (world.toastTimer > 0) world.toastTimer -= dt;

  if (world.timeLeft <= 0) {
    world.timeLeft = 0;
    world.over = { win: false, reason: 'Waktu misi habis — kargo tak sampai.' };
    if (audio) audio.crash();
    return;
  }

  // Wind gusts: a slow wander that nudges the nose and shows on the HUD.
  world.gustTimer -= dt;
  if (world.gustTimer <= 0) {
    world.gustTimer = 5 + world.random() * 7;
    world.gust = (world.random() - 0.5) * 14;
  }

  // Throttle: W / Shift up, S down.
  if (controls.throttleUp) p.throttle = Math.min(1, p.throttle + 0.7 * dt);
  if (controls.throttleDown) p.throttle = Math.max(0, p.throttle - 0.7 * dt);

  // Fuel: the engine drinks faster at full throttle; empty means gliding.
  if (p.throttle > 0 && world.fuel > 0) {
    world.fuel = Math.max(0, world.fuel - (FLIGHT.fuelBurnBase + FLIGHT.fuelBurnThrottle * p.throttle) * dt);
  }
  if (world.fuel <= 0) p.throttle = 0;
  if (world.fuel < 25 && world.fuel > 0 && world.warnTimer <= 0) {
    world.warnTimer = 4;
    setToast(world, 'BAHAN BAKAR RENDAH — selesaikan misi!', 3);
    if (audio) audio.warn();
  }
  if (world.warnTimer > 0) world.warnTimer -= dt;

  // Speed chases the throttle target; climbing bleeds speed, flaps drag.
  const pitchIn = (controls.pitchUp ? 1 : 0) - (controls.pitchDown ? 1 : 0);
  const bankIn = (controls.bankRight ? 1 : 0) - (controls.bankLeft ? 1 : 0);
  const stalled = p.speedKt < FLIGHT.stallKt && !p.onGround;
  const authority = stalled ? 0.45 : 1;
  let target = FLIGHT.minSpeedKt + p.throttle * (FLIGHT.cruiseKt - FLIGHT.minSpeedKt);
  target -= pitchIn * 22;
  if (p.flaps) target -= 14;
  if (p.speedKt < target) p.speedKt = Math.min(target, p.speedKt + FLIGHT.accelPerSec * dt);
  else p.speedKt = Math.max(target, p.speedKt - FLIGHT.accelPerSec * 0.8 * dt);
  if (p.speedKt > FLIGHT.maxSpeedKt) p.speedKt = FLIGHT.maxSpeedKt;

  // Pitch and bank ease toward what the pilot asks for.
  const pitchTarget = pitchIn * 0.24 * authority;
  const bankTarget = bankIn * 0.75 * authority;
  p.pitch += (pitchTarget - p.pitch) * Math.min(1, dt * 3.2);
  p.bank += (bankTarget - p.bank) * Math.min(1, dt * 3.0);

  // Turning: bank rolls the nose around, a little faster when slow.
  const turnAuthority = Math.min(1.4, Math.max(0.4, 90 / Math.max(50, p.speedKt)));
  p.heading += p.bank * FLIGHT.turnRate * turnAuthority * dt;
  p.heading += world.gust * 0.00012 * dt * 60;

  // Vertical speed: pitch converts forward speed into climb; a stall sinks.
  const speedMs = p.speedKt * KT_TO_MS;
  let vspeed = Math.sin(p.pitch) * speedMs * FLIGHT.climbFactor;
  if (stalled) {
    vspeed -= (FLIGHT.stallKt - p.speedKt) * 0.55;
    world.stallTimer -= dt;
    if (world.stallTimer <= 0) {
      world.stallTimer = 1.2;
      setToast(world, 'STALL! Turunkan hidung, tambah throttle!', 1.4);
      if (audio) audio.warn();
    }
  }
  if (p.flaps && p.speedKt < FLIGHT.groundEffectKt) vspeed += 0.8;
  p.vspeed = vspeed;

  // Move.
  const fx = Math.sin(p.heading);
  const fz = -Math.cos(p.heading);
  p.x += fx * speedMs * dt;
  p.z += fz * speedMs * dt;

  // Liftoff: on the strip, speed plus a pulled nose gets her airborne.
  const ground = terrainHeight(p.x, p.z);
  if (p.onGround) {
    p.y = ground + 1.2;
    if (p.speedKt > 58 && pitchIn > 0) {
      p.onGround = false;
      // A small hop on rotation: without it the ground-contact check
      // below would read the rest height as a crash on this same step.
      p.y = ground + 2.5;
      setToast(world, 'Lepas landas! Ikuti panah hijau ke ring pertama.', 4);
    }
  } else {
    p.y += vspeed * dt;
  }

  // Engine note follows throttle and speed.
  if (audio) audio.update(p.throttle, p.speedKt, !p.onGround || p.speedKt > 20);

  // Ground and water contact.
  if (!p.onGround && p.y <= ground + 1.2) {
    const off = runwayOffset(world);
    const aligned = Math.abs(((p.heading - RUNWAY.heading * DEG + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.44;
    const gentle = p.vspeed > -8.5 && p.speedKt < 88;
    const onStrip = Math.abs(off.across) < RUNWAY.width / 2 + 4 && Math.abs(off.along) < RUNWAY.length / 2 + 20;
    if (world.leg === 2 && onStrip && aligned && gentle) {
      p.y = ground + 1.2;
      p.onGround = true;
      winLanding(world, audio);
      return;
    }
    if (ground <= 0.5) crash(world, 'Mendarat di laut — pesawat tenggelam.', audio);
    else if (p.speedKt > 95) crash(world, 'Menabrak daratan dengan kecepatan tinggi.', audio);
    else crash(world, `Menabrak ${ISLANDS.find((i) => Math.hypot(p.x - i.x, p.z - i.z) < i.r)?.name ?? 'bukit'} — mendarat darurat gagal.`, audio);
    return;
  }

  // Rings: fly through the glowing hoop.
  if (world.leg === 0) {
    const i = world.ringsDone.findIndex((d) => !d);
    if (i !== -1) {
      const ring = RINGS[i];
      const d = Math.sqrt((p.x - ring.x) ** 2 + (p.y - ring.y) ** 2 + (p.z - ring.z) ** 2);
      if (d < ring.r + 6) {
        world.ringsDone[i] = true;
        world.ringsPassed += 1;
        world.score += SCORES.ring;
        if (audio) audio.ring();
        if (particles) particles.spawnBurst(640, 300, '#7dff9e', 26);
        if (world.ringsPassed === RINGS.length) {
          world.leg = 1;
          setToast(world, 'Semua ring dilewati! Sekarang antar kargo ke sawah (SPASI).', 5);
        } else {
          setToast(world, `Ring ${world.ringsPassed}/5 — +${SCORES.ring} poin!`, 2.5);
        }
      }
    }
  }

  // Cargo in free fall.
  if (world.cargo && !world.cargo.landed) {
    const c = world.cargo;
    c.vy -= 22 * dt;
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    c.y += c.vy * dt;
    const gh = terrainHeight(c.x, c.z);
    if (c.y <= gh + 1) {
      c.y = gh + 1;
      c.landed = true;
      const miss = Math.hypot(c.x - DROP_ZONE.x, c.z - DROP_ZONE.z);
      const acc = Math.max(0, 1 - miss / (DROP_ZONE.r * 2.4));
      world.dropScore = Math.round(SCORES.dropMax * acc);
      world.score += world.dropScore;
      world.leg = 2;
      if (audio) audio.goodDrop();
      if (particles) particles.spawnBurst(640, 420, '#ffb347', 22);
      setToast(world, miss <= DROP_ZONE.r
        ? `Kargo TEPAT di sawah! +${world.dropScore} poin. Pulang dan mendarat.`
        : `Kargo meleset ${Math.round(miss)} m (+${world.dropScore}). Pulang dan mendarat.`, 5);
    }
  }

  // Clouds drift with the wind.
  for (const c of world.clouds) {
    c.x += dt * 2.2;
    if (c.x > 3400) c.x = -3400;
  }

  // Exhaust puffs behind the tail while the engine runs.
  if (particles && p.throttle > 0.25 && world.random() < dt * 22) {
    particles.spawnTrail(p);
  }
}

export function startFlight(world) {
  world.over = null;
  world.score = 0;
  world.timeLeft = FLIGHT.missionSeconds;
  world.elapsed = 0;
  world.leg = 0;
  world.fuel = FLIGHT.fuelStart;
}
