/**
 * Rasterises a button's label (text runs and inline SVG icons, as laid out by the browser) into a
 * white-on-transparent mask for the WebGL renderer, which shades it as polished metal on the slab.
 * The DOM label stays in place, transparent, for layout, selection and assistive tech.
 */

export type LabelRaster = {
  canvas: HTMLCanvasElement;
  /** label box in canvas CSS px: centre, half size; ink = half width of what is drawn */
  box: { cx: number; cy: number; hw: number; hh: number; ink: number };
};

const SCALE = 4;

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function rasterLabel(button: HTMLElement, label: HTMLElement, pad: number): Promise<LabelRaster> {
  if (document.fonts?.ready) await document.fonts.ready;
  const br = button.getBoundingClientRect();
  const lr = label.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(label).fontSize) || 16;
  // the box spans the button's width and ~2.1× the font size, like the original label texture, so the
  // metal gradient (bright top, dark horizon, light bottom) lands across the letters
  const boxW = br.width, boxH = Math.min(br.height, fs * 2.13);
  const midY = lr.top + lr.height / 2;
  const ox = br.left, oy = midY - boxH / 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(boxW * SCALE));
  canvas.height = Math.max(1, Math.round(boxH * SCALE));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.translate(-ox, -oy);
  ctx.fillStyle = "#fff";

  let x0 = Infinity, x1 = -Infinity;
  const range = document.createRange();
  const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const icons: Promise<void>[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const raw = n.textContent ?? "";
      const start = raw.search(/\S/);
      if (start < 0) continue;
      const text = raw.trim();
      const parent = n.parentElement!;
      const cs = getComputedStyle(parent);
      range.setStart(n, start);
      range.setEnd(n, start + text.length);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      ctx.textBaseline = "alphabetic";
      const m = ctx.measureText(text);
      const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
      const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
      ctx.fillText(text, r.left, r.top + (r.height - ascent - descent) / 2 + ascent);
      x0 = Math.min(x0, r.left);
      x1 = Math.max(x1, r.right);
    } else if (n instanceof SVGSVGElement) {
      const r = n.getBoundingClientRect();
      if (!r.width) continue;
      const clone = n.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width", String(r.width));
      clone.setAttribute("height", String(r.height));
      clone.setAttribute("style", "color:#fff");
      if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const url = "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      icons.push(loadImage(url).then((img) => void (img && ctx.drawImage(img, r.left, r.top, r.width, r.height))));
      x0 = Math.min(x0, r.left);
      x1 = Math.max(x1, r.right);
    }
  }
  await Promise.all(icons);
  const cx = br.left + br.width / 2;
  const ink = Number.isFinite(x0) ? Math.max(cx - x0, x1 - cx) : br.width / 4;
  return {
    canvas,
    box: { cx: pad + br.width / 2, cy: pad + (midY - br.top), hw: boxW / 2, hh: boxH / 2, ink },
  };
}
