import { POINTS, type VenomSim } from "./venom-sim";

/** ink = strand colour, sheen = highlight colour (40% alpha), edge = optional outline so ink reads on dark pages. */
export type VenomPalette = { ink: string; sheen: string; edge: string | null };

/** Cartoon glove cursor (hotspot = index fingertip). Drawn once into an offscreen bitmap. */
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
const GLOVE_SCALE = 1.55;
export const GLOVE_HOTSPOT = { x: 15.5 * GLOVE_SCALE, y: 2.5 * GLOVE_SCALE };
export const GLOVE_SIZE = { w: 36 * GLOVE_SCALE, h: 44 * GLOVE_SCALE };

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

/**
 * Draw strands as tapered ink: thick drip at the root, thin waist, small knot at the tip.
 * Each strand is one smooth quadratic path drawn in a few width bands (cheap and smooth).
 */
export function drawVenom(
  ctx: CanvasRenderingContext2D,
  sim: VenomSim,
  palette: VenomPalette,
  glovePos: { x: number; y: number } | null,
  showGlove: boolean,
) {
  const tip = POINTS - 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Glove under the strands, so the goo looks wrapped around the fingers.
  if (showGlove && glovePos) {
    const img = getGlove();
    if (img) ctx.drawImage(img, glovePos.x - GLOVE_HOTSPOT.x, glovePos.y - GLOVE_HOTSPOT.y, GLOVE_SIZE.w, GLOVE_SIZE.h);
  }

  for (const s of sim.strands) {
    if (s.len < 0.6) continue;
    const vis = Math.min(1, s.len / 14);
    const w = s.width * vis * sim.cfg.thickness;

    // Root drip: a small teardrop merging the strand into the body edge.
    const dx = s.x[1] - s.x[0], dy = s.y[1] - s.y[0];
    const dl = Math.hypot(dx, dy) || 1;
    const rr = 3.4 * w + 1;
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.ellipse(s.x[0] + (dx / dl) * rr * 0.4, s.y[0] + (dy / dl) * rr * 0.4, rr, rr * 0.8, Math.atan2(dy, dx), 0, Math.PI * 2);
    ctx.fill();

    // Body of the strand in three bands: root → waist → tip.
    const bands: [number, number, number][] = [
      [0, 4, 2.6 * w + 0.6],
      [3, 9, 1.0 * w + 0.5],
      [8, tip, 1.5 * w + 0.5],
    ];
    const path = (a: number, b: number) => {
      ctx.beginPath();
      ctx.moveTo(s.x[a], s.y[a]);
      for (let j = a + 1; j < b; j++) {
        const mx = (s.x[j] + s.x[j + 1]) / 2, my = (s.y[j] + s.y[j + 1]) / 2;
        ctx.quadraticCurveTo(s.x[j], s.y[j], mx, my);
      }
      ctx.lineTo(s.x[b], s.y[b]);
    };
    if (palette.edge) {
      ctx.strokeStyle = palette.edge;
      for (const [a, b, lw] of bands) {
        ctx.lineWidth = lw + 1.6;
        path(a, b);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = palette.ink;
    for (const [a, b, lw] of bands) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(s.x[a], s.y[a]);
      for (let j = a + 1; j < b; j++) {
        const mx = (s.x[j] + s.x[j + 1]) / 2, my = (s.y[j] + s.y[j + 1]) / 2;
        ctx.quadraticCurveTo(s.x[j], s.y[j], mx, my);
      }
      ctx.lineTo(s.x[b], s.y[b]);
      ctx.stroke();
    }

    // Wet highlight running along the strand.
    if (w > 0.5) {
      ctx.strokeStyle = palette.sheen;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(s.x[1] - 0.6, s.y[1] - 0.6);
      for (let j = 2; j < tip - 1; j++) ctx.lineTo(s.x[j] - 0.6, s.y[j] - 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Knot where it grips the glove.
    if (s.attached) {
      ctx.fillStyle = palette.ink;
      ctx.beginPath();
      ctx.arc(s.x[tip], s.y[tip], 1.6 + w * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = palette.ink;
  for (const d of sim.drops) {
    const k = 1 - Math.pow(d.life / d.max, 3);
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.r * k, d.r * k * (1 + Math.min(0.8, Math.abs(d.vy) * 0.08)), Math.atan2(d.vy, d.vx) - Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
