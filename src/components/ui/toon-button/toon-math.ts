/**
 * Small, pure helpers behind the toon buttons: where an anime eye looks, a critically-ish damped
 * spring for the pupils, and the seeded shapes of the manga effects (focus lines, impact burst).
 * Everything here is deterministic so the server and the client draw the same SVG.
 */

/**
 * Where the iris sits inside an eye of radii `rx`×`ry` (eye units) when the pointer is `dx`,`dy`
 * CSS px away from the eye. Near the eye it follows closely; far away it saturates at the rim,
 * like a real gaze, instead of snapping to the edge as soon as the pointer moves.
 */
export function lookOffset(dx: number, dy: number, rx: number, ry: number, reach = 160) {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const k = (1.6 * d) / (d + reach); // 0 at the eye, reaches the rim a little way out
  return clampToEllipse((dx / d) * rx * k, (dy / d) * ry * k, rx, ry);
}

/** Pulls a point back inside the ellipse of radii rx, ry (centred on 0). */
export function clampToEllipse(x: number, y: number, rx: number, ry: number) {
  const e = (x * x) / (rx * rx) + (y * y) / (ry * ry);
  if (e <= 1) return { x, y };
  const s = 1 / Math.sqrt(e);
  return { x: x * s, y: y * s };
}

/** One step of a damped spring towards `target`. Returns the new position and velocity. */
export function springStep(pos: number, vel: number, target: number, dt: number, stiffness = 260, damping = 16) {
  const a = (target - pos) * stiffness - vel * damping;
  const v = vel + a * dt;
  return { pos: pos + v * dt, vel: v };
}

/** Mulberry32: a tiny seeded PRNG so the SVG is identical on the server and the client. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => +n.toFixed(2);

/**
 * Manga focus lines (集中線) for a `w`×`h` box: thin wedges that start outside the box and point
 * at its middle, stopping at an inner ellipse so the centre stays clear. Returns one SVG path.
 */
export function focusLines(seed: number, count: number, w: number, h: number) {
  const r = rng(seed);
  const cx = w / 2, cy = h / 2;
  const R = Math.hypot(cx, cy) * 1.05; // outer radius: beyond the corners
  let d = "";
  for (let i = 0; i < count; i++) {
    const a = ((i + r() * 0.8) / count) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    // the inner end sits on an ellipse a bit smaller than the box, pushed in or out at random
    const inner = 0.58 + r() * 0.3;
    const ix = cx + ca * cx * inner, iy = cy + sa * cy * inner;
    const half = 0.008 + r() * 0.02; // wedge half-angle at the outer end
    const ox1 = cx + Math.cos(a - half) * R, oy1 = cy + Math.sin(a - half) * R;
    const ox2 = cx + Math.cos(a + half) * R, oy2 = cy + Math.sin(a + half) * R;
    d += `M${f(ox1)} ${f(oy1)}L${f(ix)} ${f(iy)}L${f(ox2)} ${f(oy2)}Z`;
  }
  return d;
}

/** A jagged comic impact burst (the "POW!" balloon), `points` spikes between radii r1 and r2. */
export function burst(seed: number, points: number, r1: number, r2: number, cx = 0, cy = 0) {
  const r = rng(seed);
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2 + (r() - 0.5) * 0.12;
    const rad = i % 2 ? r1 * (0.92 + r() * 0.16) : r2 * (0.85 + r() * 0.3);
    d += `${i ? "L" : "M"}${f(cx + Math.cos(a) * rad)} ${f(cy + Math.sin(a) * rad * 0.8)}`;
  }
  return d + "Z";
}
