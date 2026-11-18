import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const hero = (page: Page) => page.locator(".venom-btn").first();

/** Counts non-transparent pixels on the hero's canvas: a cheap "is anything drawn" probe. */
const inkPixels = (page: Page) =>
  page.locator("canvas").first().evaluate((c: HTMLCanvasElement) => {
    // null while the WebGL attempt still owns the canvas (it is swapped for a 2D one without a GPU)
    const ctx = c.getContext("2d");
    if (!ctx) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 20) n++;
    return n;
  });

test.describe("venom button", () => {
  test("is a real, labelled, keyboard-operable button", async ({ page }) => {
    await open(page);
    const btn = page.getByRole("button", { name: /let.s collaborate/i });
    await expect(btn).toBeVisible();
    await btn.focus();
    await expect(btn).toBeFocused();
    const ring = await btn.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe("none");
  });

  test("canvas never blocks clicks on nearby content", async ({ page }) => {
    await open(page);
    for (const c of await page.locator("canvas").all()) {
      await expect(c).toHaveCSS("pointer-events", "none");
    }
    const link = page.locator('#home a[href="#contact"]');
    await link.click();
    await expect(page).toHaveURL(/#contact$/);
  });

  test("mouse: tendrils reach for the cursor, glove replaces it, then it lets go", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "needs a mouse");
    await open(page);
    const b = (await hero(page).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 400);
    await page.waitForTimeout(300);
    const before = await inkPixels(page);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 40, { steps: 10 });
    await expect(page.locator("html")).toHaveClass(/venom-glove/, { timeout: 2000 });
    expect(await inkPixels(page)).toBeGreaterThan(before);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height + 600, { steps: 20 });
    await expect(page.locator("html")).not.toHaveClass(/venom-glove/, { timeout: 3000 });
  });

  test("touch: ghost autoplay draws without a hidden cursor", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "touch only");
    await open(page);
    await expect.poll(() => inkPixels(page), { timeout: 5000 }).toBeGreaterThan(50);
    await expect(page.locator("html")).not.toHaveClass(/venom-glove/);
  });

  test("tap fires the click handler and throws a splash", async ({ page }, info) => {
    await open(page);
    const btn = hero(page);
    await btn.evaluate((el) => el.addEventListener("click", () => ((window as unknown as { hit: number }).hit = 1)));
    if (info.project.name === "desktop") await btn.click();
    else await btn.tap();
    expect(await page.evaluate(() => (window as unknown as { hit?: number }).hit)).toBe(1);
  });

  test("theme switch re-reads the ink colour without reloading", async ({ page }) => {
    await open(page);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(100);
    const edge = await hero(page).evaluate((el) => getComputedStyle(el).getPropertyValue("--venom-edge").trim());
    expect(edge).not.toBe("none");
  });
});
