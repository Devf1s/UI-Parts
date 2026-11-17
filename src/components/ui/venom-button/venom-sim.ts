/**
 * Venom physics. Pure math, no DOM.
 *
 * Behaviour modelled on exteestudio/venom-button (MIT), re-implemented for a 2D canvas:
 * - Awareness: a fizz of short pointed strings rises on the edge that faces the cursor.
 * - Lunge: 2 tendrils at the edge of reach, up to `tendrils` close in, launched 30–60 ms apart.
 *   Each tip is driven by a second-order spring with a small wind-up and a sideways whip arc.
 * - Hold: each tendril latches onto its own finger (or the wrist) of the glove and coils round it.
 *   Volume is conserved (longer = thinner), rest length creeps toward the real length (viscous
 *   flow), stretched strands bead up and shed thin fibres, neighbours web together.
 * - Snap: past `snapStretch` or `maxLength` the neck pinches off in 100 ms; the root half recoils
 *   into the body, the tip half unwinds off the finger.
 * - Idle: every ~2 s a small burst of strings curls out somewhere on the edge and sinks back.
 */

export const N = 14; // points per tendril
const SUBSTEP = 1 / 240;

export type VenomConfig = {
  tendrils: number; // max simultaneous tendrils
  sense: number; // awareness distance from the edge, px
  reach: number; // launch distance from the edge, px
  maxLength: number; // always snaps past this length, px
  snapStretch: number; // snaps past this stretch ratio
  gravity: number; // px/s²
  lunge: number; // lunge speed multiplier
  thickness: number;
  splash: number;
  idle: boolean;
};

export type Body = { x: number; y: number; w: number; h: number; r: number };

/** Glove wrap sites in canvas space (world position + coil axis). Filled by the renderer. */
export type Site = { x: number; y: number; ax: number; ay: number };

type State = "lunge" | "held" | "pinch" | "recoil" | "frag";

export type Tendril = {
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  state: State;
  s: number; // anchor position along the outline (arc length)
  sOff: number;
  R: number; // rest length
  vol: number;
  age: number;
  pinch: number;
  neck: number;
  site: number;
  wrap: number; // 0..1 → 0..2 turns
  tx: number;
  ty: number;
  tvx: number;
  tvy: number;
  seed: number;
  len: number;
  stretch: number;
};

export type Web = { a: Tendril; b: Tendril; ta: number; tb: number; sag: number };
export type Drop = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number };
export type Burst = { s: number; age: number; life: number; glide: number; strings: { off: number; h: number; lean: number }[] };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------ */
/*  Rounded-rect outline, parametrised by arc length                   */
/* ------------------------------------------------------------------ */

type Seg =
  | { kind: "line"; x0: number; y0: number; x1: number; y1: number; nx: number; ny: number; len: number }
  | { kind: "arc"; cx: number; cy: number; a0: number; len: number };

export class Outline {
  segs: Seg[] = [];
  perimeter = 1;
  r = 0;
  private key = "";

  set(b: Body) {
    const key = `${b.x}|${b.y}|${b.w}|${b.h}|${b.r}`;
    if (key === this.key) return;
    this.key = key;
    const r = Math.min(b.r, b.h / 2, b.w / 2);
    this.r = r;
    const { x, y, w, h } = b;
    const L = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number): Seg => ({ kind: "line", x0, y0, x1, y1, nx, ny, len: Math.hypot(x1 - x0, y1 - y0) });
    const A = (cx: number, cy: number, a0: number): Seg => ({ kind: "arc", cx, cy, a0, len: (Math.PI / 2) * r });
    this.segs = [
      L(x + r, y, x + w - r, y, 0, -1),
      A(x + w - r, y + r, -Math.PI / 2),
      L(x + w, y + r, x + w, y + h - r, 1, 0),
      A(x + w - r, y + h - r, 0),
      L(x + w - r, y + h, x + r, y + h, 0, 1),
      A(x + r, y + h - r, Math.PI / 2),
      L(x, y + h - r, x, y + r, -1, 0),
      A(x + r, y + r, Math.PI),
    ].filter((s) => s.len > 1e-3);
    this.perimeter = this.segs.reduce((a, s) => a + s.len, 0) || 1;
  }

  wrap(s: number) {
    const P = this.perimeter;
    return ((s % P) + P) % P;
  }

  /** Point + outward normal at arc length s. */
  at(s: number): { x: number; y: number; nx: number; ny: number } {
    s = this.wrap(s);
    for (const g of this.segs) {
      if (s <= g.len) {
        if (g.kind === "line") {
          const t = s / g.len;
          return { x: g.x0 + (g.x1 - g.x0) * t, y: g.y0 + (g.y1 - g.y0) * t, nx: g.nx, ny: g.ny };
        }
        const a = g.a0 + s / this.r;
        const c = Math.cos(a), sn = Math.sin(a);
        return { x: g.cx + c * this.r, y: g.cy + sn * this.r, nx: c, ny: sn };
      }
      s -= g.len;
    }
    return this.at(0);
  }

  /** Arc length of the closest outline point and the distance to it. */
  closest(px: number, py: number) {
    let best = Infinity, bestS = 0, acc = 0;
    for (const g of this.segs) {
      let d: number, s: number;
      if (g.kind === "line") {
        const dx = g.x1 - g.x0, dy = g.y1 - g.y0;
        const t = clamp(((px - g.x0) * dx + (py - g.y0) * dy) / (g.len * g.len), 0, 1);
        d = Math.hypot(px - (g.x0 + dx * t), py - (g.y0 + dy * t));
        s = acc + t * g.len;
      } else {
        let a = Math.atan2(py - g.cy, px - g.cx) - g.a0;
        a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (a > Math.PI / 2) a = a > Math.PI * 1.25 ? 0 : Math.PI / 2;
        const qx = g.cx + Math.cos(g.a0 + a) * this.r, qy = g.cy + Math.sin(g.a0 + a) * this.r;
        d = Math.hypot(px - qx, py - qy);
        s = acc + a * this.r;
      }
      if (d < best) {
        best = d;
        bestS = s;
      }
      acc += g.len;
    }
    return { s: bestS, dist: best };
  }

  /** Signed shortest arc distance from a to b. */
  delta(a: number, b: number) {
    const P = this.perimeter;
    let d = this.wrap(b) - this.wrap(a);
    if (d > P / 2) d -= P;
    if (d < -P / 2) d += P;
    return d;
  }
}

export function pointOn(t: Tendril, u: number) {
  const f = clamp(u, 0, 1) * (N - 1);
  const i = Math.min(N - 2, Math.floor(f));
  const k = f - i;
  return { x: t.x[i] + (t.x[i + 1] - t.x[i]) * k, y: t.y[i] + (t.y[i + 1] - t.y[i]) * k };
}

/* ------------------------------------------------------------------ */

export class VenomSim {
  cfg: VenomConfig;
  outline = new Outline();
  tendrils: Tendril[] = [];
  webs: Web[] = [];
  drops: Drop[] = [];
  bursts: Burst[] = [];
  time = 0;
  awareness = 0; // 0..1: fizz of surface strings
  focusS = 0; // outline position facing the pointer
  pointerDir = { x: 0, y: 1 };
  glove = 0; // 0..1 arrow → glove morph
  tugX = 0;
  tugY = 0;
  tugRot = 0;
  private nextLaunch = 0;
  private nextBurst = 1.2;
  private lastBurstS = 0;
  private seed = 11;

  constructor(cfg: VenomConfig) {
    this.cfg = cfg;
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  get busy() {
    return (
      this.tendrils.length > 0 ||
      this.drops.length > 0 ||
      this.bursts.length > 0 ||
      this.awareness > 0.01 ||
      this.glove > 0.01 ||
      Math.abs(this.tugX) + Math.abs(this.tugY) > 0.05
    );
  }

  /** Seconds until the next idle burst (to schedule a wake-up while the loop sleeps). */
  get idleIn() {
    return Math.max(0, this.nextBurst - this.time);
  }

  /** Advance the clock while the loop sleeps, so idle bursts stay on schedule. */
  skip(sec: number) {
    this.time += sec;
  }

  press(x: number, y: number) {
    for (let i = 0; i < this.cfg.splash; i++) {
      const a = -Math.PI / 2 + (this.rand() - 0.5) * Math.PI * 1.4;
      const v = 120 + this.rand() * 260;
      this.drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.2 + this.rand() * 2.2, life: 0, max: 0.9 + this.rand() * 0.6 });
    }
  }

  private anchorOf(t: Tendril) {
    const p = this.outline.at(t.s);
    return { x: p.x - p.nx * 1.5, y: p.y - p.ny * 1.5 };
  }

  private launch(site: number) {
    const sOff = (this.rand() - 0.5) * 40;
    const s = this.outline.wrap(this.focusS + sOff);
    const a = this.outline.at(s);
    const side = this.rand() < 0.5 ? -1 : 1;
    const whip = 140 + this.rand() * 140;
    this.tendrils.push({
      x: new Float32Array(N).fill(a.x), y: new Float32Array(N).fill(a.y),
      px: new Float32Array(N).fill(a.x), py: new Float32Array(N).fill(a.y),
      state: "lunge", s, sOff, R: 2, vol: 0, age: 0, pinch: 0, neck: 0.5, site, wrap: 0,
      tx: a.x, ty: a.y,
      // wind-up: a small dip back into the body, plus a sideways whip
      tvx: -a.nx * 60 - a.ny * side * whip,
      tvy: -a.ny * 60 + a.nx * side * whip,
      seed: this.rand() * 100, len: 0, stretch: 1,
    });
  }

  step(dtSec: number, body: Body, pointer: { x: number; y: number } | null, sites: Site[] | null) {
    const C = this.cfg;
    this.outline.set(body);
    dtSec = Math.min(dtSec, 1 / 20);
    this.time += dtSec;

    // ---- pointer ----
    let dist = Infinity;
    if (pointer) {
      const c = this.outline.closest(pointer.x, pointer.y);
      const inside = pointer.x > body.x && pointer.x < body.x + body.w && pointer.y > body.y && pointer.y < body.y + body.h;
      dist = inside ? 0 : c.dist;
      this.focusS = this.outline.wrap(this.focusS + this.outline.delta(this.focusS, c.s) * Math.min(1, dtSec * 10));
      const f = this.outline.at(this.focusS);
      const dx = pointer.x - f.x, dy = pointer.y - f.y, dl = Math.hypot(dx, dy) || 1;
      this.pointerDir = { x: dx / dl, y: dy / dl };
    }
    const aware = dist < C.sense ? 1 - dist / C.sense : 0;
    this.awareness += (aware - this.awareness) * Math.min(1, dtSec * 6);

    // ---- launches ----
    const live = this.tendrils.filter((t) => t.state === "lunge" || t.state === "held" || t.state === "pinch");
    if (pointer && sites && dist > 2 && dist < C.reach) {
      const want = Math.min(C.tendrils, Math.round(2 + (C.tendrils - 2) * clamp((1 - dist / C.reach) * 1.5, 0, 1)));
      if (live.length < want && this.time >= this.nextLaunch) {
        const taken = new Set(live.map((t) => t.site));
        let site = 0;
        while (taken.has(site) && site < sites.length - 1) site++;
        this.launch(site);
        this.nextLaunch = this.time + 0.03 + this.rand() * 0.03;
      }
    }

    // ---- idle bursts ----
    if (C.idle && !pointer && this.time >= this.nextBurst) {
      const P = this.outline.perimeter;
      let s = this.rand() * P;
      if (Math.abs(this.outline.delta(this.lastBurstS, s)) < P / 4) s = this.outline.wrap(s + P / 2);
      this.lastBurstS = s;
      const k = this.rand() < 0.5 ? 2 : 3;
      this.bursts.push({
        s, age: 0, life: 1, glide: (this.rand() - 0.5) * 40,
        strings: Array.from({ length: k }, (_, i) => ({ off: (i - (k - 1) / 2) * 13, h: 11 + this.rand() * 9, lean: (this.rand() - 0.5) * 0.9 })),
      });
      this.nextBurst = this.time + 1.8 + this.rand() * 0.5;
    } else if (pointer) {
      this.nextBurst = Math.max(this.nextBurst, this.time + 1.5);
    }
    for (const b of this.bursts) b.age += dtSec;
    this.bursts = this.bursts.filter((b) => b.age < b.life);

    // ---- physics, 240 Hz substeps ----
    let steps = Math.ceil(dtSec / SUBSTEP);
    const h = dtSec / steps;
    while (steps-- > 0) for (const t of this.tendrils) this.stepTendril(t, h, pointer, sites, dist);

    // ---- split / cull / webs ----
    const born: Tendril[] = [];
    for (const t of this.tendrils) if (t.state === "pinch" && t.pinch >= 1) born.push(this.split(t));
    this.tendrils.push(...born);
    this.tendrils = this.tendrils.filter((t) => !((t.state === "recoil" || t.state === "frag") && t.R < 0.8));
    this.updateWebs();

    // ---- glove morph + tug ----
    const holding = this.tendrils.some((t) => t.state === "held" || t.state === "pinch" || (t.state === "lunge" && t.age > 0.1));
    this.glove += ((holding ? 1 : 0) - this.glove) * Math.min(1, dtSec * 14);
    let tx = 0, ty = 0;
    for (const t of this.tendrils) {
      if (t.state !== "held" && t.state !== "pinch") continue;
      const dx = t.x[0] - t.x[N - 1], dy = t.y[0] - t.y[N - 1];
      const dl = Math.hypot(dx, dy) || 1;
      const pull = clamp(t.stretch - 0.85, 0, 0.8);
      tx += (dx / dl) * pull;
      ty += (dy / dl) * pull;
    }
    const tl = Math.hypot(tx, ty);
    const amt = Math.min(10, tl * 12);
    const gx = tl ? (tx / tl) * amt : 0, gy = tl ? (ty / tl) * amt : 0;
    const k = Math.min(1, dtSec * (holding ? 10 : 20));
    this.tugX += (gx - this.tugX) * k;
    this.tugY += (gy - this.tugY) * k;
    this.tugRot += (clamp(-gx / 10, -1, 1) * 0.35 - this.tugRot) * k;

    // ---- droplets ----
    for (const d of this.drops) {
      d.life += dtSec;
      d.vx *= Math.pow(0.15, dtSec);
      d.vy = d.vy * Math.pow(0.15, dtSec) + C.gravity * 1.5 * dtSec;
      d.x += d.vx * dtSec;
      d.y += d.vy * dtSec;
    }
    this.drops = this.drops.filter((d) => d.life < d.max);
  }

  private measure(t: Tendril) {
    let L = 0;
    for (let j = 0; j < N - 1; j++) L += Math.hypot(t.x[j + 1] - t.x[j], t.y[j + 1] - t.y[j]);
    return L;
  }

  private stepTendril(t: Tendril, h: number, pointer: { x: number; y: number } | null, sites: Site[] | null, dist: number) {
    const C = this.cfg;
    t.age += h;
    const tip = N - 1;
    const site = sites?.[t.site];

    // the root glides along the edge to keep facing the pointer
    if (t.state !== "frag") {
      t.s = this.outline.wrap(t.s + this.outline.delta(t.s, this.focusS + t.sOff * 0.6) * Math.min(1, h * 3));
    }
    const a = this.anchorOf(t);

    // ---- state machine ----
    if (t.state === "lunge") {
      if (!site || !pointer || dist > C.reach * 1.2 || t.age > 0.8) {
        t.state = "recoil";
      } else {
        const w = 2 * Math.PI * 4.4 * C.lunge, z = 0.6;
        t.tvx += (w * w * (site.x - t.tx) - 2 * z * w * t.tvx) * h;
        t.tvy += (w * w * (site.y - t.ty) - 2 * z * w * t.tvy) * h;
        t.tx += t.tvx * h;
        t.ty += t.tvy * h;
        t.R = Math.max(2, Math.hypot(t.tx - a.x, t.ty - a.y) * 1.1);
        if (!t.vol) t.vol = Math.PI * 1.35 * 1.35 * Math.max(50, Math.hypot(site.x - a.x, site.y - a.y));
        if (t.age > 0.1 && Math.hypot(site.x - t.tx, site.y - t.ty) < 5) {
          t.state = "held";
          t.R = t.len;
        }
      }
    } else if (t.state === "held" || t.state === "pinch") {
      if (!site) {
        t.state = "recoil";
      } else {
        t.wrap = Math.min(1, t.wrap + h * 4);
        t.R += (t.len - t.R) * (1 - Math.exp(-0.25 * h)); // viscous flow
        t.stretch = t.len / Math.max(t.R, 1);
        if (t.state === "held" && (t.stretch > C.snapStretch || t.len > C.maxLength)) {
          t.state = "pinch";
          t.pinch = 0;
          t.neck = 0.35 + this.rand() * 0.3;
        }
        if (t.state === "pinch") t.pinch = Math.min(1, t.pinch + h / 0.1);
      }
    } else if (t.state === "recoil") {
      t.R *= Math.exp(-h * 7); // rubber band: fast, then easing, no overshoot
      t.wrap = 0;
    } else {
      t.R *= Math.exp(-h * 10);
      t.wrap = Math.max(0, t.wrap - h * 5);
    }

    // ---- verlet ----
    const g = C.gravity * h * h;
    const dirx = t.x[tip] - t.x[0], diry = t.y[tip] - t.y[0];
    const dl = Math.hypot(dirx, diry) || 1;
    for (let j = 1; j < N; j++) {
      const vx = (t.x[j] - t.px[j]) * 0.985;
      const vy = (t.y[j] - t.py[j]) * 0.985;
      t.px[j] = t.x[j];
      t.py[j] = t.y[j];
      const sl = Math.sin(this.time * 5 + j * 0.7 + t.seed) * 22 * h * h * Math.sin((Math.PI * j) / tip);
      t.x[j] += vx - (diry / dl) * sl;
      t.y[j] += vy + g + (dirx / dl) * sl;
    }

    const pinTip = t.state === "lunge" || t.state === "held" || t.state === "pinch";
    const tipX = t.state === "lunge" ? t.tx : (site?.x ?? t.x[tip]);
    const tipY = t.state === "lunge" ? t.ty : (site?.y ?? t.y[tip]);
    const rootX = t.state === "frag" && site ? site.x : a.x;
    const rootY = t.state === "frag" && site ? site.y : a.y;
    const seg = t.R / tip;
    for (let it = 0; it < 3; it++) {
      t.x[0] = rootX;
      t.y[0] = rootY;
      if (pinTip) {
        t.x[tip] = tipX;
        t.y[tip] = tipY;
      }
      for (let j = 0; j < tip; j++) {
        const dx = t.x[j + 1] - t.x[j], dy = t.y[j + 1] - t.y[j];
        const d = Math.hypot(dx, dy) || 1e-4;
        const diff = (d - seg) / d;
        const last = pinTip && j + 1 === tip;
        const wa = j === 0 ? 0 : last ? 1 : 0.5;
        const wb = j === 0 ? 1 : last ? 0 : 0.5;
        t.x[j] += dx * diff * wa;
        t.y[j] += dy * diff * wa;
        t.x[j + 1] -= dx * diff * wb;
        t.y[j + 1] -= dy * diff * wb;
      }
      // points two apart keep a minimum distance, so the strand curves instead of kinking
      for (let j = 0; j < tip - 1; j++) {
        const dx = t.x[j + 2] - t.x[j], dy = t.y[j + 2] - t.y[j];
        const d = Math.hypot(dx, dy) || 1e-4;
        const min = seg * 1.4;
        if (d < min) {
          const c = ((min - d) / d) * 0.25;
          if (j > 0) {
            t.x[j] -= dx * c;
            t.y[j] -= dy * c;
          }
          t.x[j + 2] += dx * c;
          t.y[j + 2] += dy * c;
        }
      }
    }
    t.x[0] = rootX;
    t.y[0] = rootY;
    if (pinTip) {
      t.x[tip] = tipX;
      t.y[tip] = tipY;
    }
    t.len = this.measure(t);
    if (t.state === "recoil" || t.state === "frag") t.stretch = 1;
  }

  /** Pinch-off: root half recoils into the body, tip half becomes a fragment that unwinds off the finger. */
  private split(t: Tendril): Tendril {
    const tip = N - 1;
    const k = Math.max(1, Math.round(t.neck * tip));
    const ox = Float32Array.from(t.x), oy = Float32Array.from(t.y);
    const resample = (out: Float32Array, src: Float32Array, from: number, to: number) => {
      for (let j = 0; j < N; j++) {
        const f = from + ((to - from) * j) / tip;
        const i0 = Math.floor(f), i1 = Math.min(tip, Math.ceil(f)), q = f - i0;
        out[j] = src[i0] + (src[i1] - src[i0]) * q;
      }
    };
    const frag: Tendril = {
      ...t,
      x: new Float32Array(N), y: new Float32Array(N), px: new Float32Array(N), py: new Float32Array(N),
      state: "frag", R: t.len * (1 - t.neck), vol: t.vol * (1 - t.neck), pinch: 0, stretch: 1,
    };
    resample(frag.x, ox, tip, k);
    resample(frag.y, oy, tip, k);
    frag.px.set(frag.x);
    frag.py.set(frag.y);
    resample(t.x, ox, 0, k);
    resample(t.y, oy, 0, k);
    t.px.set(t.x);
    t.py.set(t.y);
    t.state = "recoil";
    t.R = t.len * t.neck;
    t.vol *= t.neck;
    t.pinch = 0;
    t.stretch = 1;
    this.webs = this.webs.filter((w) => w.a !== t && w.b !== t);
    return frag;
  }

  private updateWebs() {
    const held = this.tendrils.filter((t) => t.state === "held");
    if (this.webs.length < 9) {
      for (let i = 0; i < held.length; i++) {
        for (let j = i + 1; j < held.length; j++) {
          const a = held[i], b = held[j];
          if (this.webs.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) continue;
          if (Math.abs(this.outline.delta(a.s, b.s)) > 45 || this.rand() > 0.06) continue;
          const n = 1 + Math.floor(this.rand() * 2);
          for (let q = 0; q < n && this.webs.length < 9; q++) {
            const ta = 0.12 + this.rand() * 0.5;
            this.webs.push({ a, b, ta, tb: clamp(ta + (this.rand() - 0.5) * 0.2, 0.08, 0.8), sag: 0.15 + this.rand() * 0.3 });
          }
        }
      }
    }
    this.webs = this.webs.filter((w) => {
      if ((w.a.state !== "held" && w.a.state !== "pinch") || (w.b.state !== "held" && w.b.state !== "pinch")) return false;
      const pa = pointOn(w.a, w.ta), pb = pointOn(w.b, w.tb);
      return Math.hypot(pa.x - pb.x, pa.y - pb.y) < 32;
    });
  }

  /** Strand radius at u∈[0,1]: volume-conserving, tapered, beaded, pinched. */
  radius(t: Tendril, u: number) {
    const L = Math.max(t.len, 4);
    let base = t.vol ? Math.sqrt(t.vol / (Math.PI * L)) : 1.2;
    base = clamp(base, 0.35, 2.6) * this.cfg.thickness;
    let r = base * (1.75 - 0.95 * u);
    if (t.stretch > 1.45) {
      const k = clamp((t.stretch - 1.45) / 0.12, 0, 1);
      r *= 1 + 0.45 * k * Math.sin(((u * L) / (9 * base)) * Math.PI * 2);
    }
    if (t.state === "pinch") r *= 1 - t.pinch * Math.exp(-(((u - t.neck) / 0.09) ** 2));
    if (t.state === "lunge") r *= clamp(t.age / 0.08, 0.3, 1);
    return Math.max(0, r);
  }
}
