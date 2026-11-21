import type { Project } from "@/data/portfolio";

/** Pure geometry of the Orbit galaxy, shared by the WebGL scene, the DOM overlay and the tests. */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

/** Spiral arms: angle of the arm at radius r (log spiral). */
export const ARMS = 2;
export const armAngle = (r: number, arm: number) => Math.log(Math.max(r, 0.02) * 6 + 1) * 2.4 + (arm * Math.PI * 2) / ARMS;

const RMIN = 0.18, RMAX = 1;

/** 0 … 1 by creation date: 0 = newest (near the core), 1 = oldest (at the rim). */
export function ageOf(created: string, range: { from: number; to: number }) {
  const t = Date.parse(created);
  return range.to === range.from ? 0 : (range.to - t) / (range.to - range.from);
}

export function dateRange(projects: Pick<Project, "created">[]) {
  const ts = projects.map((p) => Date.parse(p.created));
  return { from: Math.min(...ts), to: Math.max(...ts) };
}

export const radiusAt = (age: number) => RMIN + (RMAX - RMIN) * Math.sqrt(Math.max(0, Math.min(1, age)));

/** Star of each project: on a spiral arm at the radius of its age, nudged by its seed. */
export function starPositions(projects: Pick<Project, "created" | "seed">[]): Vec3[] {
  const range = dateRange(projects);
  return projects.map((p, i) => {
    const r = radiusAt(ageOf(p.created, range));
    const a = armAngle(r, i % ARMS) + (p.seed - 0.5) * 0.5;
    const y = (p.seed - 0.5) * 0.06;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });
}

/** Radius of the ring for 1 January of each year inside the range. */
export function yearRings(projects: Pick<Project, "created">[]) {
  const range = dateRange(projects);
  const first = new Date(range.from).getUTCFullYear() + 1, last = new Date(range.to).getUTCFullYear();
  const rings: { year: number; r: number }[] = [];
  for (let y = first; y <= last; y++) rings.push({ year: y, r: radiusAt(ageOf(`${y}-01-01T00:00:00Z`, range)) });
  return rings;
}

/** Seeded dust along the arms plus a bulge: positions (xyz), size and tint (0 core … 1 arm). */
export function dust(count: number, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const pos = new Float32Array(count * 3), size = new Float32Array(count), tint = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x: number, y: number, z: number, tt: number;
    if (i % 5 === 0) {
      // bulge
      const r = Math.abs(gauss()) * 0.22;
      const a = rnd() * Math.PI * 2;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = gauss() * 0.05;
      tt = 0;
    } else {
      const r = 0.08 + Math.pow(rnd(), 0.8) * 1.15;
      const a = armAngle(r, i % ARMS) + gauss() * (0.35 + r * 0.25);
      x = Math.cos(a) * r + gauss() * 0.03;
      z = Math.sin(a) * r + gauss() * 0.03;
      y = gauss() * 0.035 * (1.2 - r * 0.6);
      tt = Math.min(1, r);
    }
    pos.set([x, y, z], i * 3);
    size[i] = 0.6 + Math.pow(rnd(), 6) * 2.4;
    tint[i] = tt;
  }
  return { pos, size, tint };
}

// ── matrices (column-major, like GL)
export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = v;
  }
  return o;
}

/** Camera orbiting the origin: yaw around Y, pitch down toward the disc, at `dist`. */
export function orbitView(yaw: number, pitch: number, dist: number): Mat4 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // rotate world by yaw (Y), then pitch (X), then push back along -Z
  const ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
  const rx = new Float32Array([1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1]);
  const tz = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -dist, 1]);
  return multiply(tz, multiply(rx, ry));
}

/** World point → CSS px in a w × h canvas, with depth (clip w). Null if behind the camera. */
export function toScreen(m: Mat4, p: Vec3, w: number, h: number) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const cw = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (cw <= 0.0001) return null;
  return { x: (x / cw * 0.5 + 0.5) * w, y: (0.5 - (y / cw) * 0.5) * h, w: cw };
}

/** Index of the star nearest to (x, y) within `radius` px, or -1. */
export function pick(screen: ({ x: number; y: number } | null)[], x: number, y: number, radius: number) {
  let best = -1, bd = radius * radius;
  screen.forEach((s, i) => {
    if (!s) return;
    const d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (d <= bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}
