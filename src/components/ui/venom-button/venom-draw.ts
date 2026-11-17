import { N, pointOn, type Site, type Tendril, type VenomSim } from "./venom-sim";

/** ink = strand colour, sheen = highlight colour, edge = optional outline so ink reads on dark pages. */
export type VenomPalette = { ink: string; sheen: string; edge: string | null };

/* ------------------------------------------------------------------ */
/*  Glove cursor (original artwork)                                     */
/* ------------------------------------------------------------------ */

const GLOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
<g fill="#fff" stroke="#0b0b12" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
<path d="M10 33h17v8.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 10 41.5z"/>
<path d="M13 37.5h11M13 40.5h11" fill="none" stroke-width="1.6"/>
<path d="M8.5 21c-2.4-1.6-5.4-.6-5.3 1.9.1 1.7 1.3 2.8 2.9 4.2L10.5 31c1 1 2.1 2 3.4 2H25c2.4 0 4-1.6 4.4-4l1.2-7.5c.4-2.6-1.1-4.2-3.1-4.2H12.6z"/>
<path d="M12.5 18.5V5.5a3 3 0 0 1 6 0v14"/>
<path d="M18.5 19.5v-3.2a2.8 2.8 0 0 1 5.6 0v4"/>
<path d="M24.1 20.5v-2.4a2.7 2.7 0 0 1 5.4 0l-.1 3.6"/>
<path d="M16 24.5c1.5.7 3.6.8 5.4 0" fill="none" stroke-width="1.4"/>
</g></svg>`;

const SCALE = 1.55;
const HOT = { x: 15.5, y: 2.5 }; // index fingertip, icon units
export const GLOVE_SIZE = { w: 36 * SCALE, h: 44 * SCALE };

/** Wrap sites in icon units, in the order tendrils take them: index, middle, wrist, ring, thumb, index base. */
const SITES = [
  { x: 15.5, y: 7.5, ax: 0, ay: 1, half: 3 },
  { x: 21.3, y: 18.5, ax: 0, ay: 1, half: 2.8 },
  { x: 18.5, y: 36.5, ax: 1, ay: 0, half: 4.5 },
  { x: 26.8, y: 20.5, ax: 0, ay: 1, half: 2.7 },
  { x: 5.8, y: 23, ax: 0.75, ay: 0.66, half: 2.6 },
  { x: 15.5, y: 14, ax: 0, ay: 1, half: 3 },
];

let glove: HTMLImageElement | null = null;
export function getGlove() {
  if (typeof Image === "undefined") return null;
  if (!glove) {
    glove = new Image();
    glove.decoding = "async";
    glove.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(GLOVE_SVG)}`;
  }
  return glove.complete && glove.naturalWidth ? glove : null;
}

export type GlovePose = { x: number; y: number; rot: number };

/** World positions of the wrap sites for a glove pose. */
export function gloveSites(p: GlovePose): (Site & { half: number })[] {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return SITES.map((q) => {
    const lx = (q.x - HOT.x) * SCALE, ly = (q.y - HOT.y) * SCALE;
    return {
      x: p.x + lx * c - ly * s,
      y: p.y + lx * s + ly * c,
      ax: q.ax * c - q.ay * s,
      ay: q.ax * s + q.ay * c,
      half: q.half * SCALE,
    };
  });
}

/* ------------------------------------------------------------------ */

const LIGHT = { x: -0.6, y: -0.8 };

/** Cheap deterministic hash → [0, 1). */
function h01(a: number, b: number) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** How many thin fibres one guide strand is drawn as. 6 guides × 4 = up to 24 strands. */
export const FIBERS = 4;
const FP = 18; // points per fibre

/** Half-width of the stretch of edge a strand's fibres are glued to, px. */
function rootSpread(t: Tendril) {
  return 12 + 22 * Math.min(1, t.len / 120);
}

// Fibre layout for the strand being drawn, reused by every pass (edge, membranes, ink, gloss).
const BX = new Float32Array(FIBERS * FP), BY = new Float32Array(FIBERS * FP), BW = new Float32Array(FIBERS * FP);

/**
 * One guide strand from the physics becomes a loose bundle of thin fibres, like the reference:
 * - roots fan out along the edge and are glued to the body (thick at the base, see `skirt`),
 * - mid-length they sway apart (each with its own phase), the tips converge on the finger,
 * - width follows the guide's radius, so stretching, beading and the pinch-off still read.
 * Returns the fibre count; points land in BX/BY/BW.
 */
function layoutFibres(t: Tendril, sim: VenomSim) {
  const O = sim.outline;
  const attached = t.state !== "frag";
  const n = attached ? FIBERS : 2;
  const spread = attached ? rootSpread(t) : 2;
  const stretch = Math.min(2, Math.max(0.6, t.stretch));
  const g0x = t.x[0], g0y = t.y[0];
  for (let k = 0; k < n; k++) {
    const r1 = h01(t.seed, k), r2 = h01(t.seed + 3.1, k), r3 = h01(t.seed + 7.7, k);
    const f = k / (n - 1) - 0.5 + (r1 - 0.5) * 0.18;
    let rdx = 0, rdy = 0;
    if (attached) {
      const rp = O.at(t.s + f * spread * 2);
      rdx = rp.x - rp.nx * 0.8 - g0x;
      rdy = rp.y - rp.ny * 0.8 - g0y;
    }
    const amp = (2.4 + 5 * r2) * (0.55 + 0.6 * Math.max(0, stretch - 0.8)) + t.len * (0.015 + 0.03 * r3);
    const freq = 4 + r1 * 5, phase = r3 * 6.283;
    const w0 = (0.95 + 1.05 * r2) * sim.cfg.thickness;
    for (let i = 0; i < FP; i++) {
      const u = i / (FP - 1);
      const p = pointOn(t, u);
      const a = pointOn(t, Math.max(0, u - 0.04)), b = pointOn(t, Math.min(1, u + 0.04));
      const tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const glue = Math.pow(1 - u, 1.4);
      const lat = f * 2.4 * u + amp * Math.sin(Math.PI * u) * Math.sin(freq * u + phase + sim.time * 1.6);
      const o = k * FP + i;
      BX[o] = p.x + rdx * glue + nx * lat;
      BY[o] = p.y + rdy * glue + ny * lat;
      const r = sim.radius(t, u);
      // flare at the root (adhesion), taper at the tip, vanish where the guide pinches off
      BW[o] = w0 * (1 + 2.4 * Math.pow(1 - u, 6)) * (0.55 + 0.45 * (1 - u)) * Math.min(1, r / 0.9);
    }
  }
  return n;
}

/**
 * Opaque ink: one stroke per segment so the width can follow the fibre (round caps hide joints).
 * Translucent passes (outline, gloss) use one path per fibre instead: overlapping caps would
 * double the alpha at every joint and read as beads.
 */
function strokeFibres(ctx: CanvasRenderingContext2D, n: number, widen: number, sheen: boolean) {
  const whole = sheen || widen > 0;
  for (let k = 0; k < n; k++) {
    const o = k * FP;
    if (whole) {
      let wsum = 0;
      for (let j = 0; j < FP; j++) wsum += BW[o + j];
      const wm = wsum / FP;
      if (wm <= 0.08) continue;
      const ox = sheen ? LIGHT.x * wm * 0.3 : 0, oy = sheen ? LIGHT.y * wm * 0.3 : 0;
      ctx.lineWidth = sheen ? Math.max(0.3, wm * 0.3) : wm + widen;
      ctx.beginPath();
      ctx.moveTo(BX[o] + ox, BY[o] + oy);
      for (let j = 1; j < FP - 1; j++) {
        ctx.quadraticCurveTo(BX[o + j] + ox, BY[o + j] + oy, (BX[o + j] + BX[o + j + 1]) / 2 + ox, (BY[o + j] + BY[o + j + 1]) / 2 + oy);
      }
      ctx.lineTo(BX[o + FP - 1] + ox, BY[o + FP - 1] + oy);
      ctx.stroke();
      continue;
    }
    for (let j = 0; j < FP - 1; j++) {
      const wj = BW[o + j];
      if (wj <= 0.08) continue;
      const sx = j === 0 ? BX[o] : (BX[o + j - 1] + BX[o + j]) / 2, sy = j === 0 ? BY[o] : (BY[o + j - 1] + BY[o + j]) / 2;
      const ex = j === FP - 2 ? BX[o + j + 1] : (BX[o + j] + BX[o + j + 1]) / 2;
      const ey = j === FP - 2 ? BY[o + j + 1] : (BY[o + j] + BY[o + j + 1]) / 2;
      ctx.lineWidth = wj;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(BX[o + j], BY[o + j], ex, ey);
      ctx.stroke();
    }
  }
}

/**
 * Sticky membranes between neighbouring fibre roots: the goo has not let go of itself yet, so
 * the first stretch of each pair is joined by a sheet with a concave free edge (a meniscus).
 */
function fillMembranes(ctx: CanvasRenderingContext2D, n: number, t: Tendril) {
  const m = Math.max(2, Math.round(FP * (0.12 + 0.1 * Math.min(1, t.R / 40)))); // how far up the sheet reaches
  for (let k = 0; k < n - 1; k++) {
    const a = k * FP, b = (k + 1) * FP;
    ctx.beginPath();
    ctx.moveTo(BX[a], BY[a]);
    for (let i = 1; i <= m; i++) ctx.lineTo(BX[a + i], BY[a + i]);
    // concave free edge: sag back toward the roots
    const mx = (BX[a + m] + BX[b + m]) / 2, my = (BY[a + m] + BY[b + m]) / 2;
    const rx = (BX[a] + BX[b]) / 2, ry = (BY[a] + BY[b]) / 2;
    ctx.quadraticCurveTo(rx + (mx - rx) * 0.35, ry + (my - ry) * 0.35, BX[b + m], BY[b + m]);
    for (let i = m - 1; i >= 0; i--) ctx.lineTo(BX[b + i], BY[b + i]);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Adhesion: where a strand leaves the body, the goo stays glued to the edge as a low meniscus
 * spanning all its fibre roots, so the strands look stuck to the button rather than poked in.
 */
function skirt(ctx: CanvasRenderingContext2D, t: Tendril, sim: VenomSim) {
  const k = Math.min(1, t.R / 18); // shrinks as a recoiling strand sinks back in
  if (k < 0.05) return;
  const O = sim.outline;
  const half = rootSpread(t) + 5;
  const h = (3.5 + 5 * Math.min(1, t.len / 90)) * k * sim.cfg.thickness;
  const STEPS = 14;
  ctx.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const v = i / STEPS;
    const p = O.at(t.s + (v * 2 - 1) * half * (0.6 + 0.4 * k));
    const bump = h * Math.pow(Math.sin(Math.PI * v), 0.75) * (1 + 0.15 * Math.sin(sim.time * 2 + t.seed + v * 9));
    if (i === 0) ctx.moveTo(p.x - p.nx * 1.5, p.y - p.ny * 1.5);
    ctx.lineTo(p.x + p.nx * bump, p.y + p.ny * bump);
  }
  for (let i = STEPS; i >= 0; i--) {
    const v = i / STEPS;
    const p = O.at(t.s + (v * 2 - 1) * half * (0.6 + 0.4 * k));
    ctx.lineTo(p.x - p.nx * 1.5, p.y - p.ny * 1.5);
  }
  ctx.closePath();
  ctx.fill();
}

function spike(ctx: CanvasRenderingContext2D, bx: number, by: number, nx: number, ny: number, len: number, base: number, lean: number, curl: number) {
  if (len < 0.6) return;
  const tx = -ny, ty = nx;
  const dx = nx + tx * lean, dy = ny + ty * lean;
  const dl = Math.hypot(dx, dy) || 1;
  const ex = bx + (dx / dl) * len, ey = by + (dy / dl) * len;
  const cx = bx + (dx / dl) * len * 0.55 + tx * curl, cy = by + (dy / dl) * len * 0.55 + ty * curl;
  ctx.beginPath();
  ctx.moveTo(bx - tx * base - nx * 2, by - ty * base - ny * 2);
  ctx.quadraticCurveTo(cx - tx * base * 0.25, cy - ty * base * 0.25, ex, ey);
  ctx.quadraticCurveTo(cx + tx * base * 0.25, cy + ty * base * 0.25, bx + tx * base - nx * 2, by + ty * base - ny * 2);
  ctx.closePath();
  ctx.fill();
}

function coil(ctx: CanvasRenderingContext2D, site: Site & { half: number }, wrap: number, front: boolean, seed: number) {
  if (wrap <= 0.02) return;
  const turns = 2 * wrap;
  const px = -site.ay, py = site.ax; // across the finger
  const steps = Math.ceil(28 * turns);
  const span = 7; // along the finger, px
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * turns * Math.PI * 2 + seed;
    const along = (i / steps - 0.5) * span * turns * 0.5;
    const x = site.x + site.ax * along + px * Math.cos(th) * (site.half + 1.2);
    const y = site.y + site.ay * along + py * Math.cos(th) * (site.half + 1.2) + Math.sin(th) * 0.6;
    const isFront = Math.sin(th) > 0;
    if (isFront === front) {
      if (!pen) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      pen = true;
    } else pen = false;
  }
  ctx.stroke();
}

/**
 * Draw one frame. Order: root puddles + surface strings → coil backs → glove → strands,
 * fibres, webs → coil fronts → droplets.
 */
export function drawVenom(
  ctx: CanvasRenderingContext2D,
  sim: VenomSim,
  palette: VenomPalette,
  pose: GlovePose | null,
  sites: (Site & { half: number })[] | null,
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = palette.ink;
  ctx.strokeStyle = palette.ink;
  const O = sim.outline;

  // Surface strings: awareness fizz on the facing edge.
  if (sim.awareness > 0.02) {
    for (let i = 0; i < 17; i++) {
      const off = (i - 8) * 5.2;
      const env = Math.exp(-((off / 34) ** 2));
      const p = O.at(sim.focusS + off);
      const wob = Math.sin(sim.time * 7 + i * 1.7);
      const len = sim.awareness * env * (5 + 9 * ((i * 0.618) % 1)) * (0.85 + 0.15 * wob);
      const lean = (sim.pointerDir.x * -p.ny + sim.pointerDir.y * p.nx) * 0.9;
      spike(ctx, p.x, p.y, p.nx, p.ny, len * (1.1 + 0.5 * ((i * 0.37) % 1)), 1.1 + len * 0.06, lean, wob * 1.8);
    }
  }
  // Idle bursts: a few strings curl out, glide along the edge and sink back.
  for (const b of sim.bursts) {
    const k = Math.sin((Math.PI * b.age) / b.life);
    for (const s of b.strings) {
      const p = O.at(b.s + s.off + b.glide * (b.age / b.life));
      spike(ctx, p.x, p.y, p.nx, p.ny, s.h * k, 1.5 + k, s.lean + 0.4 * Math.sin(b.age * 5), 2.5 * k);
    }
  }

  // Adhesion skirts: goo glued along the edge under each strand's roots.
  for (const t of sim.tendrils) if (t.state !== "frag") skirt(ctx, t, sim);

  // Coil backs, tucked under the glove.
  if (sites) {
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.9;
    for (const t of sim.tendrils) if (t.state !== "lunge" && t.state !== "recoil") coil(ctx, sites[t.site], t.wrap, false, t.seed);
    ctx.globalAlpha = 1;
  }

  // Glove
  if (pose && sim.glove > 0.02) {
    const img = getGlove();
    if (img) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, sim.glove * 1.4);
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.rot);
      const s = 0.85 + 0.15 * sim.glove;
      ctx.scale(s, s);
      ctx.drawImage(img, -HOT.x * SCALE, -HOT.y * SCALE, GLOVE_SIZE.w, GLOVE_SIZE.h);
      ctx.restore();
    }
  }

  // Strands, each drawn as a bundle of thin fibres
  for (const t of sim.tendrils) {
    if (t.R < 0.6) continue;
    const n = layoutFibres(t, sim);
    if (palette.edge) {
      ctx.strokeStyle = palette.edge;
      strokeFibres(ctx, n, 0.9, false);
    }
    ctx.strokeStyle = palette.ink;
    ctx.fillStyle = palette.ink;
    if (t.state !== "frag") fillMembranes(ctx, n, t);
    strokeFibres(ctx, n, 0, false);
    // wet gloss: a hairline offset toward the light
    ctx.strokeStyle = palette.sheen;
    ctx.globalAlpha = 0.35;
    strokeFibres(ctx, n, 0, true);
    ctx.globalAlpha = 1;

    // Mozzarella fibres peel off a stretched strand.
    if ((t.state === "held" || t.state === "pinch") && t.stretch > 1.08) {
      const amp = Math.min(9, (t.stretch - 1.05) * 22);
      const dx = t.x[N - 1] - t.x[0], dy = t.y[N - 1] - t.y[0];
      const dl = Math.hypot(dx, dy) || 1;
      const nx = -dy / dl, ny = dx / dl;
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = 0.55;
      for (const f of [-1, -0.35, 0.75]) {
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          const p = pointOn(t, u);
          const o = amp * f * Math.sin(Math.PI * u) * (0.8 + 0.2 * Math.sin(sim.time * 3 + f * 5 + u * 6));
          if (i === 0) ctx.moveTo(p.x + nx * o, p.y + ny * o);
          else ctx.lineTo(p.x + nx * o, p.y + ny * o);
        }
        ctx.stroke();
      }
    }
  }

  // Cheesy webs between neighbouring strands.
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 0.7;
  for (const w of sim.webs) {
    const a = pointOn(w.a, w.ta), b = pointOn(w.b, w.tb);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + d * w.sag, b.x, b.y);
    ctx.stroke();
  }

  // Coil fronts, over the glove.
  if (sites) {
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.5;
    for (const t of sim.tendrils) if (t.state !== "lunge" && t.state !== "recoil") coil(ctx, sites[t.site], t.wrap, true, t.seed);
  }

  // Droplets
  ctx.fillStyle = palette.ink;
  for (const d of sim.drops) {
    const k = 1 - Math.pow(d.life / d.max, 3);
    const sp = Math.hypot(d.vx, d.vy);
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.r * k, d.r * k * (1 + Math.min(0.9, sp * 0.004)), Math.atan2(d.vy, d.vx) - Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
