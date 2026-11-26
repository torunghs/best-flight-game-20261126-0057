// SAYAP NUSANTARA — constants, islands, route and mission data.
// One original bush-pilot game: fly a small prop plane between Indonesian
// islands, thread the target rings, drop cargo on Pulau Sawah, and land
// back on the short strip at Pulau Karang. All units are metres, knots and
// degrees; the screen is a fixed 1280x720 canvas scaled to the window.

export const W = 1280;
export const H = 720;
export const STEP = 1 / 60;
export const BEST_KEY = 'sayap-nusantara-best';

// Flight envelope of the little STOL bush plane.
export const FLIGHT = {
  minSpeedKt: 38, // below this the wing stops flying
  stallKt: 55, // below this she sinks and the controls go mushy
  cruiseKt: 118, // full-throttle level speed, clean
  maxSpeedKt: 145,
  accelPerSec: 26, // knots per second toward the throttle target
  climbFactor: 0.8, // climb rate as a share of forward speed at full pitch
  turnRate: 0.62, // radians per second at full bank
  fuelBurnBase: 0.16, // percent per second at idle
  fuelBurnThrottle: 0.62, // extra percent per second at full throttle
  fuelStart: 100,
  missionSeconds: 360, // six minutes on the clock
  groundEffectKt: 90, // flaps + slow flight float a little longer
};

// The archipelago. x is east, z is south, y is height above the sea.
// Every island is a smooth bump; the volcano gets a crater dip on top.
export const ISLANDS = [
  { name: 'Pulau Karang', x: 0, z: 300, r: 950, h: 55, kind: 'home' },
  { name: 'Pulau Sawah', x: -1450, z: -850, r: 720, h: 95, kind: 'rice' },
  { name: 'Gunung Api', x: 1250, z: -1550, r: 820, h: 265, kind: 'volcano' },
  { name: 'Pulau Hutan', x: -1850, z: 1250, r: 680, h: 125, kind: 'forest' },
  { name: 'Pulau Batu', x: 450, z: -2650, r: 520, h: 150, kind: 'rock' },
  { name: 'Pulau Kecil', x: 1650, z: 950, r: 430, h: 42, kind: 'sand' },
  { name: 'Karang Utara', x: -650, z: -2100, r: 300, h: 28, kind: 'sand' },
  { name: 'Karang Timur', x: 2300, z: -400, r: 320, h: 34, kind: 'sand' },
  { name: 'Karang Barat', x: -2400, z: -300, r: 340, h: 30, kind: 'sand' },
];

// Home strip on Pulau Karang, pointing north (heading 0, along -z).
export const RUNWAY = {
  x: 0, z: 180, heading: 0, length: 420, width: 26, name: 'KARANG STRIP',
};

// The ring course: five hoops on the way out, then the drop, then home.
// Each ring faces the direction you arrive from.
export const RINGS = [
  { x: 0, z: -450, y: 150, r: 24 },
  { x: -720, z: -950, y: 175, r: 24 },
  { x: -1450, z: -850, y: 150, r: 24 },
  { x: 150, z: -1850, y: 200, r: 24 },
  { x: 1250, z: -1550, y: 215, r: 24 },
];

// Cargo drop zone: the rice terraces of Pulau Sawah, right under ring 3.
export const DROP_ZONE = { x: -1450, z: -850, r: 55, name: 'SAWAH' };

// Mission legs, in order. Score: ring 500, drop up to 1000 by accuracy,
// landing 1000 plus a time and fuel bonus.
export const LEGS = [
  { id: 'rings', title: 'LEWATI 5 RING', detail: 'Ikuti panah hijau, terbang menembus tiap ring.' },
  { id: 'drop', title: 'ANTAR KARGO', detail: 'Jatuhkan kargo (SPASI) tepat di lingkaran sawah.' },
  { id: 'land', title: 'MENDARAT', detail: 'Kembali ke Karang Strip: pelan, rendah, lurus.' },
];

export const SCORES = { ring: 500, dropMax: 1000, landing: 1000 };

// Colours: one warm late-afternoon palette for sky, sea and land.
export const PALETTE = {
  skyTop: '#2e6fb0',
  skyMid: '#7fb2dd',
  skyLow: '#f7c98b',
  sun: '#fff3c4',
  seaDeep: '#14506e',
  seaShallow: '#2e86a8',
  sand: '#e8d29a',
  grass: '#5da24a',
  jungle: '#2f7a33',
  rock: '#8a7d6b',
  volcano: '#6e5a52',
  snow: '#e8e4da',
  runway: '#3a3f46',
  ring: '#39e75f',
  ringNext: '#7dff9e',
  hudAmber: '#ffb347',
  hudGreen: '#7dff9e',
  hudRed: '#ff5a4e',
  panel: '#1c2733',
};
