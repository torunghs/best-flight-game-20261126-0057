// SAYAP NUSANTARA — screen-space particles: ring bursts, landing
// confetti, exhaust puffs that trail the tail, and floating score text.

export function createParticles(random) {
  const parts = [];
  const texts = [];

  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = random() * Math.PI * 2;
      const sp = 60 + random() * 190;
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.7 + random() * 0.5, age: 0, color, size: 2 + random() * 3.5,
      });
    }
  }

  function spawnFloatText(x, y, text, color) {
    texts.push({ x, y, text, color, life: 1.6, age: 0 });
  }

  // A puff that starts at the tail and drifts back as the plane flies on.
  function spawnTrail(plane) {
    parts.push({
      x: 640 + (random() - 0.5) * 10, y: 430 + (random() - 0.5) * 8,
      vx: (random() - 0.5) * 12, vy: 26 + random() * 20,
      life: 0.55, age: 0, color: '#cfd8dc', size: 3 + random() * 3,
    });
  }

  function update(dt) {
    for (const pt of parts) {
      pt.age += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 30 * dt;
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].age >= parts[i].life) parts.splice(i, 1);
    }
    for (const t of texts) t.age += dt;
    for (let i = texts.length - 1; i >= 0; i--) {
      if (texts[i].age >= texts[i].life) texts.splice(i, 1);
    }
  }

  return { parts, texts, spawnBurst, spawnFloatText, spawnTrail, update };
}
