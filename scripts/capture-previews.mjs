#!/usr/bin/env node
/**
 * Screenshots of every project's live site, for the portfolio previews.
 *
 *   npm run previews                              # every repository with a homepage
 *   npm run previews -- --only hoobank,tenzies    # just these (others are kept)
 *   npm run previews -- --from ./shots            # use <dir>/<repo>.png instead of capturing
 *   npm run previews -- --url UI-Parts=http://localhost:3000
 *
 * Each site is opened at 1280×800 in Chromium (reduced motion, no scrollbars), left to settle,
 * then written to public/previews as two WebP sizes whose names carry a content hash, so they can
 * be cached forever. src/data/previews.json maps repository → files, size and dominant colour.
 * A page that still looks the same as its last screenshot keeps it (no churn in git); a page that
 * renders (nearly) blank, e.g. when its API is down, gets a second, longer look and is otherwise
 * listed under "blank" instead, so the portfolio draws a card for it.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(root, "public/previews");
const MANIFEST = join(root, "src/data/previews.json");
const VIEWPORT = { width: 1280, height: 800 };
/** Card (680 px wide at 2×) and touch thumbnail sizes; both 16:10 like the viewport. */
const SIZES = { src: 720, thumb: 360 };
const SETTLE_MS = 2500;
const RETRY_SETTLE_MS = 10_000;
/** Shannon entropy below which a screenshot is a blank page (a logo on a flat colour ≈ 0.2). */
const BLANK_ENTROPY = 0.6;
/** Mean difference (0…255) on a 64×40 thumbnail below which two screenshots show the same page. */
const SAME_PAGE = 3;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const only = flag("only")?.split(",");
const from = flag("from");
const overrides = Object.fromEntries(
  args.flatMap((a, i) => (args[i - 1] === "--url" ? [a.split(/=(.*)/s).slice(0, 2)] : [])),
);

const { repos } = JSON.parse(await readFile(join(root, "src/data/github-repos.json"), "utf8"));
const last = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, "utf8")) : {};
const previous = last.previews ?? {};
const targets = repos
  .filter((r) => r.homepage && (!only || only.includes(r.name)))
  .map((r) => ({ name: r.name, url: r.homepage, open: overrides[r.name] ?? r.homepage }));

await mkdir(DIR, { recursive: true });
const browser = from ? null : await chromium.launch({ args: ["--hide-scrollbars"] });
const context = await browser?.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: "light" });
const shots = new Map(); // url → result, so repositories sharing a site share its files
const next = { ...(only ? previous : {}) };
const blank = { ...(only ? last.blank : {}) };
let failed = 0;

for (const t of targets) {
  try {
    let entry = shots.get(t.open);
    if (!entry) {
      let png = from ? await readFile(join(from, `${t.name}.png`)) : await capture(t.open);
      if (!from && (await isBlank(png))) png = await capture(t.open, RETRY_SETTLE_MS);
      if (await isBlank(png)) entry = { blank: true };
      else if (previous[t.name] && (await samePage(png, previous[t.name]))) entry = { ...previous[t.name], kept: true };
      else entry = await save(t.name, png);
      shots.set(t.open, entry);
    }
    delete next[t.name];
    delete blank[t.name];
    if (entry.blank) {
      blank[t.name] = t.url;
      console.warn(`… ${t.name.padEnd(20)} renders blank, left out`);
      continue;
    }
    const { src, thumb, width, height, color } = entry;
    next[t.name] = { url: t.url, src, thumb, width, height, color };
    console.log(`${entry.kept ? "=" : "✓"} ${t.name.padEnd(20)} ${src}${entry.kept ? " (unchanged)" : ""}`);
  } catch (err) {
    failed++;
    console.warn(`✗ ${t.name.padEnd(20)} ${t.open}: ${err.message.split("\n")[0]}`);
    if (previous[t.name]) next[t.name] = previous[t.name]; // keep the last good one
  }
}
await browser?.close();

const byName = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const sorted = byName(next);
const manifest = { viewport: [VIEWPORT.width, VIEWPORT.height], previews: sorted, blank: byName(blank) };
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

// files no entry points at any more
const used = new Set(Object.values(sorted).flatMap((p) => [p.src, p.thumb].map((s) => s.split("/").pop())));
for (const f of await readdir(DIR)) if (!used.has(f)) await rm(join(DIR, f));

console.log(`${Object.keys(sorted).length} previews in src/data/previews.json${failed ? `, ${failed} failed` : ""}`);
if (failed && !Object.keys(sorted).length) process.exitCode = 1;

async function capture(url, settle = SETTLE_MS) {
  const page = await context.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(settle); // intro animations, lazy images, slow APIs
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    return await page.screenshot({ type: "png" });
  } finally {
    await page.close();
  }
}

async function isBlank(png) {
  return (await sharp(png).stats()).entropy < BLANK_ENTROPY;
}

/** Whether a new capture shows the same page as a saved preview (small grey thumbnails compared). */
async function samePage(png, prev) {
  const file = join(root, "public", prev.src);
  if (!existsSync(file)) return false;
  const tiny = (input) => sharp(input).resize(64, 40, { fit: "fill" }).greyscale().raw().toBuffer();
  const [a, b] = await Promise.all([tiny(png), tiny(file)]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length < SAME_PAGE;
}

async function save(name, png) {
  const base = sharp(png).resize(VIEWPORT.width, VIEWPORT.height, { fit: "cover", position: "top" });
  const { dominant } = await base.clone().stats();
  const color = `#${[dominant.r, dominant.g, dominant.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  const files = {};
  for (const [key, width] of Object.entries(SIZES)) {
    const webp = await base
      .clone()
      .resize(width, Math.round((width * VIEWPORT.height) / VIEWPORT.width), { kernel: "lanczos3" })
      .webp({ quality: key === "src" ? 80 : 74, effort: 6, smartSubsample: true })
      .toBuffer();
    const hash = createHash("sha256").update(webp).digest("hex").slice(0, 8);
    const file = `${name.toLowerCase()}${key === "thumb" ? "-sm" : ""}.${hash}.webp`;
    await writeFile(join(DIR, file), webp);
    files[key] = `/previews/${file}`;
  }
  return { ...files, width: SIZES.src, height: Math.round((SIZES.src * VIEWPORT.height) / VIEWPORT.width), color };
}
