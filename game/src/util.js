// util.js — small math, seeded random and geometry helpers shared by every module.
// Nothing here allocates in hot loops: callers reuse the scratch objects below.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) { this.next = mulberry32(seed); }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent smoothing: damp(current, target, lambda, dt).
export const damp = (c, t, lambda, dt) => lerp(c, t, 1 - Math.exp(-lambda * dt));
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const fmtClock = (s) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// 2D segment vs axis-aligned box (XZ plane). Returns true when the segment
// crosses the box footprint. Used for line-of-sight and wall blocking.
export function segmentHitsBox2D(ax, az, bx, bz, box) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const axes = [
    [dx, box.minX - ax, box.maxX - ax],
    [dz, box.minZ - az, box.maxZ - az],
  ];
  for (const [d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (ax < box.minX || ax > box.maxX) { /* keep axis check below */ }
      if (lo > 0 || hi < 0) return false;
    } else {
      let u0 = lo / d, u1 = hi / d;
      if (u0 > u1) { const tmp = u0; u0 = u1; u1 = tmp; }
      t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      if (t0 > t1) return false;
    }
  }
  // Also require the segment to actually pass the other axis' span.
  const mx = ax + dx * clamp(t0, 0, 1), mz = az + dz * clamp(t0, 0, 1);
  return mx >= box.minX - 1e-6 && mx <= box.maxX + 1e-6
    && mz >= box.minZ - 1e-6 && mz <= box.maxZ + 1e-6;
}

// Ray (origin + t*dir, t>=0) vs 3D axis-aligned box. Returns nearest t or Infinity.
export function rayHitsBox(ox, oy, oz, dx, dy, dz, box) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [box.minX, 0, box.minZ], mx = [box.maxX, box.top, box.maxZ];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return Infinity;
    } else {
      let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
      if (a > b) { const tmp = a; a = b; b = tmp; }
      tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Ray vs sphere. Returns nearest positive t or Infinity.
export function rayHitsSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}
