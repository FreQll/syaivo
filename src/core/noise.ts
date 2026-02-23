/**
 * Self-contained simplex noise — 2D and 3D.
 * No external dependencies required.
 *
 * Based on the public domain implementation by Stefan Gustavson.
 */

// ─── Gradient tables ──────────────────────────────────────────────────────────

const GRAD3: number[][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

// ─── Permutation table (fixed seed for determinism) ───────────────────────────

function buildPermutation(): Uint8Array {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 42;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const j = (seed >>> 0) % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  return p;
}

const perm = buildPermutation();
const perm12 = new Uint8Array(512);
const p512   = new Uint8Array(512);

for (let i = 0; i < 512; i++) {
  p512[i]   = perm[i & 255];
  perm12[i] = p512[i] % 12;
}

function dot2(g: number[], x: number, y: number): number {
  return g[0] * x + g[1] * y;
}

function dot3(g: number[], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z;
}

// ─── 2D Simplex noise ─────────────────────────────────────────────────────────

/**
 * 2D simplex noise. Returns a value in [-1, 1].
 */
export function simplex2(xin: number, yin: number): number {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  const s  = (xin + yin) * F2;
  const i  = Math.floor(xin + s);
  const j  = Math.floor(yin + s);
  const t  = (i + j) * G2;

  const X0 = i - t, Y0 = j - t;
  const x0 = xin - X0, y0 = yin - Y0;

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2,        y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2,     y2 = y0 - 1 + 2 * G2;

  const ii  = i & 255, jj = j & 255;
  const gi0 = perm12[ii      + p512[jj     ]];
  const gi1 = perm12[ii + i1 + p512[jj + j1]];
  const gi2 = perm12[ii + 1  + p512[jj + 1 ]];

  const t0 = 0.5 - x0*x0 - y0*y0;
  const n0 = t0 < 0 ? 0 : (t0*t0)*(t0*t0) * dot2(GRAD3[gi0], x0, y0);

  const t1 = 0.5 - x1*x1 - y1*y1;
  const n1 = t1 < 0 ? 0 : (t1*t1)*(t1*t1) * dot2(GRAD3[gi1], x1, y1);

  const t2 = 0.5 - x2*x2 - y2*y2;
  const n2 = t2 < 0 ? 0 : (t2*t2)*(t2*t2) * dot2(GRAD3[gi2], x2, y2);

  return 70 * (n0 + n1 + n2);
}

// ─── 3D Simplex noise ─────────────────────────────────────────────────────────

/**
 * 3D simplex noise. Returns a value in [-1, 1].
 * The Z axis is ideal for time — slicing through Z produces
 * continuously morphing 2D fields with no translational drift.
 */
export function simplex3(xin: number, yin: number, zin: number): number {
  const F3 = 1 / 3;
  const G3 = 1 / 6;

  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const k = Math.floor(zin + s);
  const t = (i + j + k) * G3;

  const X0 = i - t, Y0 = j - t, Z0 = k - t;
  const x0 = xin - X0, y0 = yin - Y0, z0 = zin - Z0;

  // Determine which simplex we're in
  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;

  if (x0 >= y0) {
    if      (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
    else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
    else               { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
  } else {
    if      (y0 < z0)  { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
    else if (x0 < z0)  { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
    else               { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
  }

  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2*G3, y2 = y0 - j2 + 2*G3, z2 = z0 - k2 + 2*G3;
  const x3 = x0 - 1 + 3*G3,  y3 = y0 - 1 + 3*G3,  z3 = z0 - 1 + 3*G3;

  const ii = i & 255, jj = j & 255, kk = k & 255;
  const gi0 = perm12[ii      + p512[jj      + p512[kk     ]]];
  const gi1 = perm12[ii + i1 + p512[jj + j1 + p512[kk + k1]]];
  const gi2 = perm12[ii + i2 + p512[jj + j2 + p512[kk + k2]]];
  const gi3 = perm12[ii + 1  + p512[jj + 1  + p512[kk + 1 ]]];

  const t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
  const n0 = t0 < 0 ? 0 : (t0*t0)*(t0*t0) * dot3(GRAD3[gi0], x0, y0, z0);

  const t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
  const n1 = t1 < 0 ? 0 : (t1*t1)*(t1*t1) * dot3(GRAD3[gi1], x1, y1, z1);

  const t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
  const n2 = t2 < 0 ? 0 : (t2*t2)*(t2*t2) * dot3(GRAD3[gi2], x2, y2, z2);

  const t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
  const n3 = t3 < 0 ? 0 : (t3*t3)*(t3*t3) * dot3(GRAD3[gi3], x3, y3, z3);

  return 32 * (n0 + n1 + n2 + n3);
}

// ─── fBm variants ─────────────────────────────────────────────────────────────

/**
 * Fractal Brownian Motion over 2D simplex noise.
 */
export function fbm(
  x: number, y: number,
  octaves = 4, lacunarity = 2, gain = 0.5
): number {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value    += simplex2(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude   *= gain;
    frequency   *= lacunarity;
  }
  return value / maxValue;
}

/**
 * Fractal Brownian Motion over 3D simplex noise.
 * Use (x, y, time) to get a morphing 2D field with no translational drift.
 */
export function fbm3(
  x: number, y: number, z: number,
  octaves = 4, lacunarity = 2, gain = 0.5
): number {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value    += simplex3(x * frequency, y * frequency, z * frequency) * amplitude;
    maxValue += amplitude;
    amplitude   *= gain;
    frequency   *= lacunarity;
  }
  return value / maxValue;
}
