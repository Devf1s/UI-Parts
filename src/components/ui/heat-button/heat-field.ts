/**
 * A coarse 2D temperature field: heat is rubbed in by the pointer, spreads (diffusion), rises
 * (buoyancy, like air over a hot surface) and cools towards ambient. Units are arbitrary: 0 is
 * ambient, ~1 is "hand hot". Pure and allocation-free per step, so it is cheap and testable.
 */
export type HeatField = {
  cols: number;
  rows: number;
  t: Float32Array;
  tmp: Float32Array;
  /** Hottest cell after the last step. */
  max: number;
  maxAt: number;
};

export type HeatParams = {
  /** Diffusion, cells² / s. */
  diffusion: number;
  /** Upward drift, cells / s. */
  rise: number;
  /** Newtonian cooling rate, 1 / s. */
  cooling: number;
};

export const HEAT_DEFAULTS: HeatParams = { diffusion: 4, rise: 2.2, cooling: 1.1 };

export function createHeatField(cols: number, rows: number): HeatField {
  const n = Math.max(1, cols * rows);
  return { cols, rows, t: new Float32Array(n), tmp: new Float32Array(n), max: 0, maxAt: 0 };
}

/** Adds a Gaussian blob of heat centred on (x, y) in cell units. */
export function splat(f: HeatField, x: number, y: number, radius: number, amount: number) {
  const { cols, rows, t } = f;
  const r = Math.ceil(radius * 2.5);
  const k = 1 / (2 * radius * radius);
  for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(rows - 1, Math.ceil(y + r)); j++) {
    for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(cols - 1, Math.ceil(x + r)); i++) {
      const dx = i + 0.5 - x, dy = j + 0.5 - y;
      t[j * cols + i] += amount * Math.exp(-(dx * dx + dy * dy) * k);
    }
  }
}

/** Advances the field by `dt` seconds. Returns the new maximum temperature. */
export function stepHeat(f: HeatField, dt: number, p: HeatParams = HEAT_DEFAULTS) {
  const { cols, rows } = f;
  // explicit diffusion is stable while D·dt ≤ 0.25 per substep
  const subs = Math.max(1, Math.ceil((p.diffusion * dt) / 0.2));
  const a = (p.diffusion * dt) / subs;
  let src = f.t, dst = f.tmp;
  for (let s = 0; s < subs; s++) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const c = j * cols + i;
        const v = src[c];
        // insulated edges: a missing neighbour has the cell's own temperature
        const l = i > 0 ? src[c - 1] : v, r = i < cols - 1 ? src[c + 1] : v;
        const u = j > 0 ? src[c - cols] : v, d = j < rows - 1 ? src[c + cols] : v;
        dst[c] = v + a * (l + r + u + d - 4 * v);
      }
    }
    [src, dst] = [dst, src];
  }
  // rise: each cell takes some of the air from below; the top edge vents, the bottom draws cool air
  const up = Math.min(1, p.rise * dt);
  const cool = Math.exp(-p.cooling * dt);
  let max = 0, maxAt = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const c = j * cols + i;
      const below = j < rows - 1 ? src[c + cols] : 0;
      const v = (src[c] * (1 - up) + below * up) * cool;
      dst[c] = v < 1e-5 ? 0 : v;
      if (v > max) {
        max = v;
        maxAt = c;
      }
    }
  }
  if (dst !== f.t) f.t.set(dst);
  f.max = max;
  f.maxAt = maxAt;
  return max;
}

/** Total heat in the field (for tests and the "is it still warm" check). */
export const totalHeat = (f: HeatField) => f.t.reduce((s, v) => s + v, 0);

/**
 * "Ironbow" thermal palette, cold to hot, as packed ABGR (little-endian RGBA) for an ImageData
 * Uint32 view. `cold` is the colour of an untouched surface.
 */
export function ironbow(cold: [number, number, number] = [12, 10, 34], steps = 256) {
  const stops: [number, [number, number, number]][] = [
    [0, cold],
    [0.16, [44, 16, 96]],
    [0.34, [132, 28, 128]],
    [0.52, [214, 58, 52]],
    [0.7, [246, 132, 34]],
    [0.86, [252, 212, 64]],
    [1, [255, 252, 232]],
  ];
  const lut = new Uint32Array(steps);
  for (let s = 0; s < steps; s++) {
    const x = s / (steps - 1);
    let k = 0;
    while (k < stops.length - 2 && x > stops[k + 1][0]) k++;
    const [x0, c0] = stops[k], [x1, c1] = stops[k + 1];
    const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    const ch = (n: number) => Math.round(c0[n] + (c1[n] - c0[n]) * u);
    lut[s] = (255 << 24) | (ch(2) << 16) | (ch(1) << 8) | ch(0);
  }
  return lut;
}

/** Display temperature in °C for a field value: ambient 22 °C, a warm hand ~36 °C. */
export const celsius = (v: number) => 22 + v * 14;
