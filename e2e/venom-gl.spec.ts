import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * The WebGL renderer. CI runners have no GPU, where the button deliberately falls back to the 2D
 * canvas (a software rasteriser runs the ray march at a few fps), so these tests force WebGL on and
 * drive the simulation deterministically through the engine's test hook instead of real time.
 */

type Hook = { gl: { simulate(sec: number, to: { x: number; y: number; mouse: boolean } | null): void; stats(): { strands: number; held: number; hand: boolean } }; pause(): void };

test.skip(({ browserName }) => browserName !== "chromium", "WebGL2 via SwiftShader");

/** Wait for the WebGL renderer, then stop its real-time loop (software GL is far too slow for it). */
async function glOn(page: Page, keepRunning = false) {
  await expect(page.locator(".venom-btn").first()).toHaveClass(/venom-btn--gl/, { timeout: 30_000 });
  if (!keepRunning) await page.locator("canvas").first().evaluate((c) => (c as HTMLCanvasElement & { __venom: Hook }).__venom.pause());
}

/** Canvas-local position of a point given relative to the hero button. */
async function local(page: Page, dx: number, dyBelow: number) {
  const c = (await page.locator("canvas").first().boundingBox())!;
  const b = (await page.locator(".venom-btn").first().boundingBox())!;
  return { x: b.x + b.width / 2 + dx - c.x, y: b.y + b.height + dyBelow - c.y, mouse: true };
}
const sim = (page: Page, sec: number, to: { x: number; y: number; mouse: boolean } | null) =>
  page.locator("canvas").first().evaluate((c, [s, t]) => {
    const h = (c as HTMLCanvasElement & { __venom: Hook }).__venom;
    h.pause();
    h.gl.simulate(s as number, t as { x: number; y: number; mouse: boolean } | null);
    return h.gl.stats();
  }, [sec, to] as const);

/** Alpha of the drawn frame at a canvas-local CSS point, read right after drawing it. */
const alphaAt = (page: Page, x: number, y: number) =>
  page.locator("canvas").first().evaluate((c: HTMLCanvasElement, [x, y]) => {
    const h = (c as HTMLCanvasElement & { __venom: Hook }).__venom;
    h.gl.simulate(1 / 60, null);
    const t = document.createElement("canvas");
    t.width = c.width;
    t.height = c.height;
    const ctx = t.getContext("2d")!;
    ctx.drawImage(c, 0, 0);
    const k = c.width / c.clientWidth;
    return ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3];
  }, [x, y] as const);

test.describe("venom button, WebGL renderer", () => {
  // software GL at phone/tablet pixel ratios takes seconds per frame; the renderer itself is the same
  // on every device, and touch input + the fallback are covered by venom.spec.ts on all of them
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "software WebGL is too slow at high DPR");
    await page.addInitScript(() => ((window as unknown as { __VENOM_GL__: string }).__VENOM_GL__ = "force"));
  });

  test("draws the slab itself and keeps the real button accessible", async ({ page }) => {
    const { expectNoErrors } = await open(page);
    await glOn(page);
    const btn = page.getByRole("button", { name: /let.s collaborate/i });
    await expect(btn).toBeVisible();
    // the DOM label is still there for assistive tech, just transparent
    await expect(btn.locator(".venom-label")).toHaveCSS("color", "rgba(0, 0, 0, 0)");
    await expect(page.locator("canvas").first()).toHaveCSS("pointer-events", "none");
    const c = (await page.locator("canvas").first().boundingBox())!;
    const b = (await btn.boundingBox())!;
    await sim(page, 0.1, null);
    expect(await alphaAt(page, b.x - c.x + b.width / 2, b.y - c.y + b.height / 2)).toBe(255); // slab
    expect(await alphaAt(page, 4, 4)).toBe(0); // the page shows through away from it
    await btn.focus();
    expect(await btn.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
    expectNoErrors();
  });

  test("tendrils latch onto a nearby cursor, then snap when it pulls away", async ({ page }) => {
    await open(page);
    await glOn(page);
    await sim(page, 0.5, null);
    await sim(page, 0.05, await local(page, 60, 330));
    expect((await sim(page, 0.3, await local(page, 60, 330))).strands).toBe(0); // far away: nothing reaches
    await sim(page, 0.9, await local(page, 20, 95));
    const held = await sim(page, 0.6, await local(page, 20, 95));
    expect(held.held).toBeGreaterThanOrEqual(2);
    expect(held.hand).toBe(true);
    await sim(page, 1.5, await local(page, 160, 420));
    const after = await sim(page, 1.5, await local(page, 160, 420));
    expect(after.held).toBe(0);
  });

  test("real mouse: the cursor becomes the 3D hand near the button and comes back away from it", async ({ page }) => {
    await open(page);
    await glOn(page, true);
    const b = (await page.locator(".venom-btn").first().boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 500);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 60, { steps: 4 });
    await expect(page.locator("html")).toHaveClass(/venom-glove/, { timeout: 15_000 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 700, { steps: 4 });
    await expect(page.locator("html")).not.toHaveClass(/venom-glove/, { timeout: 30_000 });
  });

  test("click still fires on the real button", async ({ page }) => {
    await open(page);
    await glOn(page);
    const btn = page.locator(".venom-btn").first();
    await btn.evaluate((el) => el.addEventListener("click", () => ((window as unknown as { hit: number }).hit = 1)));
    await btn.click();
    expect(await page.evaluate(() => (window as unknown as { hit?: number }).hit)).toBe(1);
  });
});

test("without a GPU it falls back to the 2D canvas", async ({ page }) => {
  await open(page);
  await page.waitForTimeout(1500);
  await expect(page.locator(".venom-btn").first()).not.toHaveClass(/venom-btn--gl/);
  expect(await page.locator("canvas").first().evaluate((c: HTMLCanvasElement) => !!c.getContext("2d"))).toBe(true);
});
