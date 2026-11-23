/**
 * Iron filings in a 2D magnetic field. Every pole contributes q·r̂ / (r + soft): a little gentler
 * than a true 1/r², so filings far from the poles still feel them. A filing is a short needle with
 * no head or tail, so it lines up with the field modulo π, turning faster where the field is strong.
 */
export type Pole = { x: number; y: number; q: number };

/** Field at (x, y). Returns [bx, by]. */
export function fieldAt(x: number, y: number, poles: readonly Pole[], soft = 6): [number, number] {
  let bx = 0, by = 0;
  for (const p of poles) {
    const dx = x - p.x, dy = y - p.y;
    const r = Math.hypot(dx, dy);
    const k = p.q / ((r + soft) * (r + soft) * Math.max(r, 1e-3));
    bx += dx * k;
    by += dy * k;
  }
  return [bx, by];
}

/** Smallest rotation that takes needle angle `a` onto direction `b`, modulo π: in [-π/2, π/2). */
export function needleDelta(a: number, b: number) {
  let d = (b - a) % Math.PI;
  if (d >= Math.PI / 2) d -= Math.PI;
  if (d < -Math.PI / 2) d += Math.PI;
  return d;
}

/** Filings packed as [x, y, length, angle] quadruples. */
export type Filings = Float32Array;

/** Scatters filings on a jittered grid over w × h (CSS px), with random lengths and angles. */
export function scatter(w: number, h: number, spacing: number, seed = 1): Filings {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const cols = Math.max(1, Math.floor(w / spacing)), rows = Math.max(1, Math.floor(h / spacing));
  const out = new Float32Array(cols * rows * 4);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      out[k++] = (i + 0.15 + rnd() * 0.7) * (w / cols);
      out[k++] = (j + 0.15 + rnd() * 0.7) * (h / rows);
      out[k++] = 3.5 + rnd() * 4.5;
      out[k++] = rnd() * Math.PI;
    }
  }
  return out;
}

/**
 * Turns every filing towards the field by one step of `dt` seconds. `rate` is the turn rate in a
 * reference field `ref`. Returns the largest remaining misalignment, in radians.
 */
export function align(filings: Filings, poles: readonly Pole[], dt: number, rate = 14, ref = 0.02) {
  let worst = 0;
  for (let k = 0; k < filings.length; k += 4) {
    const [bx, by] = fieldAt(filings[k], filings[k + 1], poles);
    const b = Math.hypot(bx, by);
    if (b < 1e-9) continue;
    const d = needleDelta(filings[k + 3], Math.atan2(by, bx));
    const turn = 1 - Math.exp(-dt * rate * Math.min(2.5, 0.25 + b / ref));
    filings[k + 3] += d * turn;
    const left = Math.abs(d * (1 - turn));
    if (left > worst) worst = left;
  }
  return worst;
}

/** Field strength at each filing relative to `ref`, 0…1, for shading. */
export function strength(x: number, y: number, poles: readonly Pole[], ref = 0.02) {
  const [bx, by] = fieldAt(x, y, poles);
  return Math.min(1, Math.hypot(bx, by) / (ref * 3));
}
