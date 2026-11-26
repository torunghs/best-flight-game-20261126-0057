// SAYAP NUSANTARA — a small seeded random generator and the value noise
// the terrain uses, so the same ?seed= always draws the same islands.

export function createRandom(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return function random() {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// A deterministic 2D hash in [-1, 1]; smooth value noise from it.
export function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 2147483648 - 1;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz);
}
