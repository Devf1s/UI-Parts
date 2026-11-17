/**
 * Geometry and the refraction map for the curved glass panel. Pure functions, no React.
 *
 * Shape: a rounded slab whose long edges bow inward (an hourglass waist), like a sheet of glass
 * bent around a cylinder. The path always has the same commands, so CSS/Motion can interpolate it
 * between the collapsed rail and the expanded panel.
 */

export type ShapeOpts = {
  /** Visible width (right edge x). */
  w: number;
  h: number;
  /** Corner radius. */
  r: number;
  /** How far the right edge bows in at the waist, px. The left edge bows a third of that. */
  bow: number;
  /** Inset of the whole outline, e.g. 0.5 to put a 1px stroke on the pixel grid. */
  inset?: number;
};

const f = (n: number) => Math.round(n * 100) / 100;

export function shapePath({ w, h, r, bow, inset = 0 }: ShapeOpts) {
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const bl = bow * 0.35;
  const mid = (y0 + y1) / 2;
  const k = (mid - y0 - r) * 0.42; // tangent length: vertical at the corners, smooth at the waist
  return [
    `M${f(x0 + r)} ${f(y0)}`,
    `L${f(x1 - r)} ${f(y0)}`,
    `Q${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}`,
    `C${f(x1)} ${f(y0 + r + k)} ${f(x1 - bow)} ${f(mid - k)} ${f(x1 - bow)} ${f(mid)}`,
    `C${f(x1 - bow)} ${f(mid + k)} ${f(x1)} ${f(y1 - r - k)} ${f(x1)} ${f(y1 - r)}`,
    `Q${f(x1)} ${f(y1)} ${f(x1 - r)} ${f(y1)}`,
    `L${f(x0 + r)} ${f(y1)}`,
    `Q${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - r)}`,
    `C${f(x0)} ${f(y1 - r - k)} ${f(x0 + bl)} ${f(mid + k)} ${f(x0 + bl)} ${f(mid)}`,
    `C${f(x0 + bl)} ${f(mid - k)} ${f(x0)} ${f(y0 + r + k)} ${f(x0)} ${f(y0 + r)}`,
    `Q${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)}`,
    "Z",
  ].join("");
}

/**
 * Displacement map for <feDisplacementMap>: R/G encode an x/y offset (128 = none).
 * Inside a `bezel` band along the edges the backdrop is pulled from further in along the edge
 * normal, with a squared falloff, which reads as the thick rim of a glass lens. (Sampling inward
 * also keeps every lookup inside the filter region, so nothing outside the pane leaks in.)
 * Computed once per size (a few ms for a 300×900 panel) and cached as a data URL.
 */
const mapCache = new Map<string, string>();

export function displacementMap(w: number, h: number, r: number, bezel: number): string {
  w = Math.round(w);
  h = Math.round(h);
  const key = `${w}x${h}:${r}:${bezel}`;
  const hit = mapCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      // distance to the edge of a rounded rect + outward normal
      let dist: number, nx = 0, ny = 0;
      const cx = px < r ? r : px > w - r ? w - r : px;
      const cy = py < r ? r : py > h - r ? h - r : py;
      if (cx !== px && cy !== py) {
        const dx = px - cx, dy = py - cy, l = Math.hypot(dx, dy) || 1;
        dist = r - l;
        nx = dx / l;
        ny = dy / l;
      } else {
        const dl = px, dr = w - px, dt = py, db = h - py;
        dist = Math.min(dl, dr, dt, db);
        if (dist === dl) nx = -1;
        else if (dist === dr) nx = 1;
        else if (dist === dt) ny = -1;
        else ny = 1;
      }
      const t = dist < bezel ? 1 - Math.max(0, dist) / bezel : 0;
      const m = t * t;
      const i = (y * w + x) * 4;
      d[i] = 128 - Math.round(nx * m * 127);
      d[i + 1] = 128 - Math.round(ny * m * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL("image/png");
  if (mapCache.size > 8) mapCache.clear();
  mapCache.set(key, url);
  return url;
}

/**
 * SVG filters in `backdrop-filter` only render in Chromium. Elsewhere (Safari, Firefox) the panel
 * falls back to a plain frosted blur, which still looks right.
 */
export function supportsRefraction() {
  if (typeof navigator === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  // the lens re-filters the backdrop on every scroll frame: keep it to machines with headroom
  const cores = navigator.hardwareConcurrency ?? 0;
  return !!brands?.some((b) => b.brand === "Chromium") && cores >= 4;
}
