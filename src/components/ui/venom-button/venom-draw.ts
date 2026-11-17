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

function tube(ctx: CanvasRenderingContext2D, t: Tendril, sim: VenomSim, widthOf: (r: number) => number, dx = 0, dy = 0, offK = 0) {
  // one stroke per segment so the width can vary along the strand; round caps hide the joints
  for (let j = 0; j < N - 1; j++) {
    const r = sim.radius(t, (j + 0.5) / (N - 1));
    const w = widthOf(r);
    if (w <= 0.05) continue;
    const ox = dx * r * offK, oy = dy * r * offK;
    const sx = j === 0 ? t.x[0] : (t.x[j - 1] + t.x[j]) / 2;
    const sy = j === 0 ? t.y[0] : (t.y[j - 1] + t.y[j]) / 2;
    const ex = j === N - 2 ? t.x[j + 1] : (t.x[j] + t.x[j + 1]) / 2;
    const ey = j === N - 2 ? t.y[j + 1] : (t.y[j] + t.y[j + 1]) / 2;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(sx + ox, sy + oy);
    ctx.quadraticCurveTo(t.x[j] + ox, t.y[j] + oy, ex + ox, ey + oy);
    ctx.stroke();
  }
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
    for (let i = 0; i < 9; i++) {
      const off = (i - 4) * 8.5;
      const env = Math.exp(-((off / 30) ** 2));
      const p = O.at(sim.focusS + off);
      const wob = Math.sin(sim.time * 7 + i * 1.7);
      const len = sim.awareness * env * (5 + 9 * ((i * 0.618) % 1)) * (0.85 + 0.15 * wob);
      const lean = (sim.pointerDir.x * -p.ny + sim.pointerDir.y * p.nx) * 0.9;
      spike(ctx, p.x, p.y, p.nx, p.ny, len, 1.6 + len * 0.08, lean, wob * 1.5);
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

  // Root puddles: a fillet where each strand leaves the body.
  for (const t of sim.tendrils) {
    if (t.state === "frag") continue;
    const p = O.at(t.s);
    const k = Math.min(1, t.R / 18); // puddle shrinks as a recoiling strand sinks back in
    const r0 = Math.min(sim.radius(t, 0), 2.4) * k;
    if (r0 < 0.2) continue;
    ctx.beginPath();
    ctx.ellipse(p.x - p.nx * 0.5, p.y - p.ny * 0.5, r0 * 2.1 + 3 * k, r0 + 1.6 * k, Math.atan2(p.ny, p.nx) + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }

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

  // Strands
  for (const t of sim.tendrils) {
    if (t.R < 0.6) continue;
    if (palette.edge) {
      ctx.strokeStyle = palette.edge;
      tube(ctx, t, sim, (r) => r * 2 + 1.4);
    }
    ctx.strokeStyle = palette.ink;
    tube(ctx, t, sim, (r) => r * 2);
    // wet gloss: broad sheen + sharp specular, offset toward the light
    ctx.strokeStyle = palette.sheen;
    ctx.globalAlpha = 0.28;
    tube(ctx, t, sim, (r) => (r > 0.5 ? r * 0.7 : 0), LIGHT.x, LIGHT.y, 0.35);
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = 0.7;
    tube(ctx, t, sim, (r) => (r > 0.8 ? Math.max(0.3, r * 0.22) : 0), LIGHT.x, LIGHT.y, 0.55);
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
