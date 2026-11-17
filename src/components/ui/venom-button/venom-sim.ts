/**
 * Physics for the venom strands. Pure math, no DOM.
 *
 * A bundle of thin verlet ropes grows out of the side of the button that faces the
 * pointer, lunges at it with a stagger, grabs it, sags under gravity while you drag
 * it around, and snaps strand by strand once you pull past `reach`.
 */

export type VenomConfig = {
  strands: number;
  reach: number; // a held strand snaps past this length, px
  sense: number; // pointer distance (from the edge) that wakes the strands, px
  thickness: number; // root thickness multiplier
  gravity: number;
  stiffness: number;
  splash: number;
};

export type VenomInput = {
  pointer: { x: number; y: number } | null;
  bx: number;
  by: number;
  bw: number;
  bh: number;
  radius: number;
};

export const POINTS = 12;

export type Strand = {
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  len: number;
  attached: boolean;
  cooldown: number;
  delay: number; // stagger of the lunge, 0..1
  offset: number; // position along the edge relative to the bundle centre, px
  gx: number; // grab point relative to the pointer (on the glove), px
  gy: number;
  width: number; // thickness variation
  phase: number;
  snapAt: number; // reach multiplier for this strand
  ax: number;
  ay: number;
};

export type Drop = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class VenomSim {
  cfg: VenomConfig;
  strands: Strand[] = [];
  drops: Drop[] = [];
  time = 0;
  /** how much the body leans toward the held pointer */
  pullX = 0;
  pullY = 0;
  held = 0; // number of attached strands
  engagement = 0;
  private seed = 7;

  constructor(cfg: VenomConfig) {
    this.cfg = cfg;
  }

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private build(input: VenomInput) {
    const n = this.cfg.strands;
    const cx = input.bx + input.bw / 2;
    const cy = input.by + input.bh;
    const spacing = Math.min(4.2, (input.bw * 0.5) / n);
    this.strands = Array.from({ length: n }, (_, i) => {
      const mk = (v: number) => new Float32Array(POINTS).fill(v);
      return {
        x: mk(cx), y: mk(cy), px: mk(cx), py: mk(cy),
        len: 0, attached: false, cooldown: 0,
        delay: this.rand() * 0.55,
        offset: (i - (n - 1) / 2) * spacing + (this.rand() - 0.5) * spacing,
        // grab points spread over the glove's fingers and palm (relative to the fingertip hotspot)
        gx: -12 + this.rand() * 30,
        gy: 8 + this.rand() * 36,
        width: 0.65 + this.rand() * 0.7,
        phase: this.rand() * 6.28,
        snapAt: 0.85 + this.rand() * 0.35,
        ax: cx, ay: cy,
      };
    });
  }

  /** Closest point on the rounded-rect outline, plus its outward normal. */
  outline(input: VenomInput, px: number, py: number) {
    const { bx, by, bw, bh } = input;
    const r = Math.min(input.radius, bh / 2, bw / 2);
    const qx = clamp(px, bx + r, bx + bw - r);
    const qy = clamp(py, by + r, by + bh - r);
    let nx = px - qx, ny = py - qy;
    const d = Math.hypot(nx, ny);
    if (d < 1e-3) {
      // pointer is inside: push toward the nearest long edge
      nx = 0;
      ny = py < by + bh / 2 ? -1 : 1;
    } else {
      nx /= d;
      ny /= d;
    }
    return { x: qx + nx * r, y: qy + ny * r, nx, ny, dist: d - r };
  }

  press(x: number, y: number) {
    for (let i = 0; i < this.cfg.splash; i++) {
      const a = -Math.PI / 2 + (this.rand() - 0.5) * Math.PI * 1.6;
      const v = 3 + this.rand() * 6;
      this.drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.5 + this.rand() * 2.8, life: 0, max: 50 + this.rand() * 40 });
    }
  }

  step(dt: number, input: VenomInput) {
    const C = this.cfg;
    if (this.strands.length !== C.strands) this.build(input);
    this.time += dt / 60;
    const P = input.pointer;

    let sensing = false;
    let base = { x: input.bx + input.bw / 2, y: input.by + input.bh, nx: 0, ny: 1, dist: Infinity };
    if (P) {
      base = this.outline(input, P.x, P.y);
      sensing = base.dist < C.sense;
    }
    const over = !!P && base.dist <= 0;
    this.engagement += ((sensing ? clamp(1 - base.dist / C.sense, 0, 1) : 0) - this.engagement) * Math.min(1, 0.15 * dt);

    const tx = -base.ny, ty = base.nx; // tangent along the edge
    const g = C.gravity * dt * dt;
    const damp = Math.pow(0.93, dt);
    const tip = POINTS - 1;
    let held = 0, pullX = 0, pullY = 0;

    for (const s of this.strands) {
      s.cooldown = Math.max(0, s.cooldown - dt / 60);

      // Anchor: spread along the edge around the point that faces the pointer.
      if (P) {
        const a = this.outline(input, base.x + tx * s.offset - base.nx * 2, base.y + ty * s.offset - base.ny * 2);
        const k = Math.min(1, 0.25 * dt);
        s.ax += (a.x - a.nx * 1.5 - s.ax) * k;
        s.ay += (a.y - a.ny * 1.5 - s.ay) * k;
      }

      const gx = P ? P.x + s.gx : 0, gy = P ? P.y + s.gy : 0;
      const d = Math.hypot(gx - s.ax, gy - s.ay);
      let lenTarget = 0;

      if (s.attached) {
        if (!P || over || d > C.reach * s.snapAt) {
          this.snap(s);
        } else {
          lenTarget = d * 1.06; // a little slack so it sags
        }
      } else if (P && sensing && !over && s.cooldown === 0) {
        const eager = clamp(this.engagement * 1.9 - s.delay, 0, 1);
        lenTarget = Math.min(d * 1.04, C.reach) * eager;
      }

      const grow = lenTarget > s.len ? 0.12 : s.cooldown > 0 ? 0.35 : 0.2;
      s.len += (lenTarget - s.len) * Math.min(1, grow * dt * C.stiffness);

      // integrate
      for (let j = 1; j < POINTS; j++) {
        const vx = (s.x[j] - s.px[j]) * damp;
        const vy = (s.y[j] - s.py[j]) * damp;
        s.px[j] = s.x[j];
        s.py[j] = s.y[j];
        s.x[j] += vx + Math.sin(this.time * 5 + s.phase + j) * 0.05 * dt;
        s.y[j] += vy + g;
      }

      if (s.attached && P) {
        s.x[tip] = gx;
        s.y[tip] = gy;
        held++;
        pullX += gx - s.ax;
        pullY += gy - s.ay;
      } else if (P && lenTarget > 0) {
        const k = 0.14 * dt * C.stiffness;
        s.x[tip] += (gx - s.x[tip]) * k;
        s.y[tip] += (gy - s.y[tip]) * k;
        if (Math.hypot(gx - s.x[tip], gy - s.y[tip]) < 7 && d < C.reach * s.snapAt * 0.9) s.attached = true;
      }

      // constraints
      const seg = Math.max(s.len, 0.3) / tip;
      for (let it = 0; it < 8; it++) {
        s.x[0] = s.ax;
        s.y[0] = s.ay;
        for (let j = 0; j < tip; j++) {
          const dx = s.x[j + 1] - s.x[j], dy = s.y[j + 1] - s.y[j];
          const dd = Math.hypot(dx, dy) || 1e-4;
          const diff = (dd - seg) / dd;
          const pinTip = s.attached && j + 1 === tip;
          const wa = j === 0 ? 0 : pinTip ? 1 : 0.5;
          const wb = j === 0 ? 1 : pinTip ? 0 : 0.5;
          s.x[j] += dx * diff * wa;
          s.y[j] += dy * diff * wa;
          s.x[j + 1] -= dx * diff * wb;
          s.y[j + 1] -= dy * diff * wb;
        }
      }
    }

    this.held = held;
    const pl = held ? Math.min(7, 2 + held * 0.35) : 0;
    const pd = Math.hypot(pullX, pullY) || 1;
    this.pullX += ((held ? (pullX / pd) * pl : 0) - this.pullX) * Math.min(1, 0.12 * dt);
    this.pullY += ((held ? (pullY / pd) * pl : 0) - this.pullY) * Math.min(1, 0.12 * dt);

    for (const d of this.drops) {
      d.life += dt;
      d.vx *= Math.pow(0.97, dt);
      d.vy = d.vy * Math.pow(0.97, dt) + C.gravity * 0.9 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    this.drops = this.drops.filter((d) => d.life < d.max);
    if (this.drops.length > 40) this.drops.splice(0, this.drops.length - 40);

    return sensing || held > 0;
  }

  private snap(s: Strand) {
    s.attached = false;
    s.cooldown = 0.35 + this.rand() * 0.6;
    const t = POINTS - 1;
    // the broken end flicks back and sheds a droplet
    s.px[t] = s.x[t] - (s.ax - s.x[t]) * 0.08;
    s.py[t] = s.y[t] - (s.ay - s.y[t]) * 0.08;
    if (this.rand() < 0.6) {
      this.drops.push({ x: s.x[t], y: s.y[t], vx: (this.rand() - 0.5) * 2, vy: -1 + this.rand(), r: 1.4 + this.rand() * 1.6, life: 0, max: 45 + this.rand() * 30 });
    }
  }

  settled() {
    return (
      this.drops.length === 0 &&
      this.held === 0 &&
      this.engagement < 0.01 &&
      Math.abs(this.pullX) + Math.abs(this.pullY) < 0.05 &&
      this.strands.every((s) => s.len < 0.4)
    );
  }
}
