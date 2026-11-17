import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * Performance budgets on the production build. Budgets are loose enough for a shared CI runner
 * but tight enough to catch a regression (a running idle loop, a width animation, a huge bundle).
 */

test.skip(({ browserName }) => browserName !== "chromium", "CDP metrics");

async function vitals(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ lcp: number; cls: number }>((resolve) => {
        let lcp = 0, cls = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) =>
          l.getEntries().forEach((e) => {
            const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!s.hadRecentInput) cls += s.value;
          }),
        ).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve({ lcp, cls }), 1500);
      }),
  );
}

test("Core Web Vitals: LCP < 2.5 s, CLS < 0.1", async ({ page }) => {
  await open(page);
  const { lcp, cls } = await vitals(page);
  test.info().annotations.push({ type: "vitals", description: `LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}` });
  expect(lcp).toBeLessThan(2500);
  expect(cls).toBeLessThan(0.1);
});

test("JS shipped on first load stays under 250 kB compressed", async ({ page }) => {
  await open(page);
  await page.waitForLoadState("networkidle");
  const bytes = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((e) => (e as PerformanceResourceTiming).initiatorType === "script" || e.name.endsWith(".js"))
      .reduce((n, e) => n + (e as PerformanceResourceTiming).encodedBodySize, 0),
  );
  test.info().annotations.push({ type: "js", description: `${Math.round(bytes / 1024)} kB` });
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(250 * 1024);
});

test("idle page does not burn CPU (loop sleeps between bursts)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "autoplay keeps phones busy by design");
  await open(page);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const read = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  };
  const a = await read();
  await page.waitForTimeout(4000);
  const b = await read();
  const busy = (b.ScriptDuration - a.ScriptDuration + b.TaskDuration - a.TaskDuration) / 4;
  test.info().annotations.push({ type: "idle", description: `${(busy * 100).toFixed(1)}% main thread` });
  expect(busy).toBeLessThan(0.1);
});

test("interaction stays smooth on a 4× slower CPU", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "mouse sweep");
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const b = (await page.locator(".venom-btn").first().boundingBox())!;
  await page.evaluate(() => {
    const w = window as unknown as { frames_: number[] };
    w.frames_ = [];
    let last = performance.now();
    const tick = (t: number) => {
      w.frames_.push(t - last);
      last = t;
      if (w.frames_.length < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 60; i++) {
    const t = i / 60;
    await page.mouse.move(b.x + b.width / 2 + Math.sin(t * 12) * 120, b.y + b.height + 30 + Math.abs(Math.sin(t * 6)) * 220);
    await page.waitForTimeout(25);
  }
  const frames = await page.evaluate(() => (window as unknown as { frames_: number[] }).frames_.slice(5).sort((x, y) => x - y));
  const p95 = frames[Math.floor(frames.length * 0.95)];
  test.info().annotations.push({ type: "frames", description: `p95 ${p95.toFixed(1)} ms over ${frames.length} frames` });
  expect(p95).toBeLessThan(50);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("glass sidebar: expanding and scrolling under it stay smooth on a 4× slower CPU", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "hover + refraction path");
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    const w = window as unknown as { frames_: number[] };
    w.frames_ = [];
    let last = performance.now();
    const tick = (t: number) => {
      w.frames_.push(t - last);
      last = t;
      if (w.frames_.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(30, 300);
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(300);
    await page.mouse.move(900, 300);
    await page.waitForTimeout(500);
  }
  const frames = await page.evaluate(() => (window as unknown as { frames_: number[] }).frames_.slice(5).sort((x, y) => x - y));
  const p50 = frames[Math.floor(frames.length * 0.5)];
  const p95 = frames[Math.floor(frames.length * 0.95)];
  test.info().annotations.push({ type: "sidebar frames", description: `p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms over ${frames.length} frames` });
  // a 4× slower CPU is a low-end laptop: at least 30 fps typical, no hitch longer than 4 frames
  expect(p50).toBeLessThan(34);
  expect(p95).toBeLessThan(67);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("off-screen buttons stop animating", async ({ page }, info) => {
  test.skip(info.project.name === "desktop", "uses autoplay");
  await open(page);
  await page.waitForTimeout(500);
  // frames drawn on the hero's canvas in one second
  const heroFrames = () =>
    page.evaluate(
      () =>
        new Promise<number>((r) => {
          const hero = document.querySelector("canvas");
          let n = 0;
          const orig = CanvasRenderingContext2D.prototype.clearRect;
          CanvasRenderingContext2D.prototype.clearRect = function (...a) {
            if (this.canvas === hero) n++;
            return orig.apply(this, a);
          };
          setTimeout(() => {
            CanvasRenderingContext2D.prototype.clearRect = orig;
            r(n);
          }, 1000);
        }),
    );
  const onScreen = await heroFrames();
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const offScreen = await heroFrames();
  expect(onScreen).toBeGreaterThan(20);
  expect(offScreen).toBe(0);
});
