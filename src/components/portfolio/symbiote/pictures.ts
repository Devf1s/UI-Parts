import { CATEGORIES, languageColor, PROFILE, type Project } from "@/data/portfolio";

/**
 * Pictures for the work index preview, as ImageBitmaps ready for a texture upload. Screenshots are
 * fetched and decoded off the main thread; a project with no live site gets a card drawn from its
 * real data (repository, title, blurb, stack). Both are cached for the page's lifetime, so a
 * re-created GL scene re-uploads without another request.
 */
const cache = new Map<string, Promise<ImageBitmap>>();

export function screenshot(src: string) {
  let p = cache.get(src);
  if (!p) {
    p = fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${src}`);
        return res.blob();
      })
      .then((blob) => createImageBitmap(blob));
    p.catch(() => cache.delete(src)); // a later hover may try again
    cache.set(src, p);
  }
  return p;
}

export type Fonts = { sans: string; mono: string };

/** Same 16:10 size as the screenshots, so both fill the card alike. */
const CW = 720, CH = 450;

export function sourceCard(project: Project, fonts: Fonts) {
  const key = `source:${project.slug}`;
  let p = cache.get(key);
  if (!p) {
    p = document.fonts.ready.then(() => createImageBitmap(drawSourceCard(project, fonts)));
    cache.set(key, p);
  }
  return p;
}

function drawSourceCard(p: Project, fonts: Fonts) {
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  // a CPU canvas: the bitmap goes straight into a texture, with no read back from the GPU
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const [c0, c1, c2] = p.palette;

  // ground: the project's dark tone, its accent glowing from a corner, a fine dot grid
  ctx.fillStyle = c2;
  ctx.fillRect(0, 0, CW, CH);
  const glow = ctx.createRadialGradient(CW * 0.92, -CH * 0.1, 0, CW * 0.92, -CH * 0.1, CW * 0.8);
  glow.addColorStop(0, `${c1}cc`);
  glow.addColorStop(1, `${c1}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = "rgb(255 255 255 / 0.07)";
  for (let y = 18; y < CH; y += 24) for (let x = 18; x < CW; x += 24) ctx.fillRect(x, y, 2, 2);

  const pad = 44;
  let y = pad;
  ctx.textBaseline = "top";

  // owner / repository, like the top of its GitHub page
  ctx.font = `500 21px ${fonts.mono}`;
  ctx.fillStyle = "rgb(255 255 255 / 0.62)";
  const owner = `${PROFILE.handle} / `;
  ctx.fillText(owner, pad, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(p.slug, pad + ctx.measureText(owner).width, y);

  y += 70;
  ctx.font = `650 66px ${fonts.sans}`;
  ctx.letterSpacing = "-2px";
  ctx.fillStyle = "#fff";
  ctx.fillText(p.title, pad, y, CW - pad * 2);
  ctx.letterSpacing = "0px";

  y += 86;
  ctx.font = `400 24px ${fonts.sans}`;
  ctx.fillStyle = "rgb(255 255 255 / 0.76)";
  for (const line of wrap(ctx, p.blurb, CW - pad * 2 - 40).slice(0, 3)) {
    ctx.fillText(line, pad, y);
    y += 34;
  }

  // stack chips along the bottom
  ctx.font = `500 19px ${fonts.sans}`;
  let x = pad;
  const chipY = CH - pad - 38;
  for (const s of p.stack) {
    const w = ctx.measureText(s).width + 32;
    if (x + w > CW - pad) break;
    ctx.beginPath();
    ctx.roundRect(x + 0.75, chipY + 0.75, w - 1.5, 38 - 1.5, 19);
    ctx.fillStyle = "rgb(255 255 255 / 0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgb(255 255 255 / 0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(s, x + 16, chipY + 9);
    x += w + 10;
  }

  // language, type and where the code lives, above the chips
  const metaY = chipY - 44;
  ctx.beginPath();
  ctx.arc(pad + 7, metaY + 11, 7, 0, Math.PI * 2);
  ctx.fillStyle = languageColor(p.language);
  ctx.fill();
  ctx.font = `500 19px ${fonts.mono}`;
  ctx.fillStyle = c0;
  ctx.fillText(`${p.language} · ${CATEGORIES[p.category].label} · source on GitHub`, pad + 24, metaY + 1);
  return canvas;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
