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
 * be cached forever. src/data/previews.json maps repository → files, size and average colour.
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
const previous = existsSync(MANIFEST) ? JSON.parse(await readFile(MANIFEST, "utf8")).previews : {};
const targets = repos
  .filter((r) => r.homepage && (!only || only.includes(r.name)))
  .map((r) => ({ name: r.name, url: r.homepage, open: overrides[r.name] ?? r.homepage }));

await mkdir(DIR, { recursive: true });
const browser = from ? null : await chromium.launch({ args: ["--hide-scrollbars"] });
const context = await browser?.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: "light" });
const shots = new Map(); // url → result, so repositories sharing a site share its files
const next = { ...(only ? previous : {}) };
let failed = 0;

for (const t of targets) {
  try {
    let entry = shots.get(t.open);
    if (!entry) {
      const png = from ? await readFile(join(from, `${t.name}.png`)) : await capture(t.open);
      entry = await save(t.name, png);
      shots.set(t.open, entry);
    }
    next[t.name] = { url: t.url, ...entry };
    console.log(`✓ ${t.name.padEnd(20)} ${entry.src}`);
  } catch (err) {
    failed++;
    console.warn(`✗ ${t.name.padEnd(20)} ${t.open}: ${err.message.split("\n")[0]}`);
    if (previous[t.name]) next[t.name] = previous[t.name]; // keep the last good one
  }
}
await browser?.close();

const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(MANIFEST, `${JSON.stringify({ viewport: [VIEWPORT.width, VIEWPORT.height], previews: sorted }, null, 2)}\n`);

// files no entry points at any more
const used = new Set(Object.values(sorted).flatMap((p) => [p.src, p.thumb].map((s) => s.split("/").pop())));
for (const f of await readdir(DIR)) if (!used.has(f)) await rm(join(DIR, f));

console.log(`${Object.keys(sorted).length} previews in src/data/previews.json${failed ? `, ${failed} failed` : ""}`);
if (failed && !Object.keys(sorted).length) process.exitCode = 1;

async function capture(url) {
  const page = await context.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(SETTLE_MS); // intro animations, lazy images
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    return await page.screenshot({ type: "png" });
  } finally {
    await page.close();
  }
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
