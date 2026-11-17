import { expect, test } from "@playwright/test";
import { hasRail, horizontalOverflow, open } from "./helpers";

test.describe("responsive layout", () => {
  test("no horizontal scroll and no console errors", async ({ page }) => {
    const { expectNoErrors } = await open(page);
    expect(await horizontalOverflow(page)).toBe(0);
    // scroll through the whole page so lazy effects mount, then re-check
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
        scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    });
    expect(await horizontalOverflow(page)).toBe(0);
    expectNoErrors();
  });

  test("rail on tablet/desktop, menu button on phones", async ({ page }) => {
    await open(page);
    const rail = page.getByRole("navigation", { name: "Main" });
    const menu = page.getByRole("button", { name: "Open menu" });
    if (hasRail(page)) {
      await expect(rail).toBeVisible();
      await expect(menu).toBeHidden();
    } else {
      await expect(rail).toBeHidden();
      await expect(menu).toBeVisible();
    }
  });

  test("content never sits under the rail", async ({ page }) => {
    test.skip(!hasRail(page), "drawer layout");
    await open(page);
    const rail = await page.locator("nav[aria-label=Main] .sb-glass").boundingBox();
    const h1 = await page.locator("h1").boundingBox();
    const railVisibleRight = rail!.x + 76; // collapsed width
    expect(h1!.x).toBeGreaterThanOrEqual(railVisibleRight);
  });

  test("headline fits the viewport and text stays readable", async ({ page }) => {
    await open(page);
    const vw = page.viewportSize()!.width;
    const box = await page.locator("h1").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("main p, main h2, main h3")]
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((s) => s < 12),
    );
    expect(small).toEqual([]);
  });

  test("touch targets are at least 24×24 (WCAG 2.5.8)", async ({ page }) => {
    await open(page);
    if (!hasRail(page)) await page.getByRole("button", { name: "Open menu" }).click();
    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("a[href], button")]
        .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed")
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0)
        .filter(({ el }) => !el.closest("p")) // inline text links are exempt
        .filter(({ r }) => r.width < 24 || r.height < 24)
        .map(({ el, r }) => `${el.getAttribute("aria-label") ?? el.textContent?.trim()} ${r.width}×${r.height}`),
    );
    expect(tooSmall).toEqual([]);
  });

  test("works in landscape", async ({ page }) => {
    const { width, height } = page.viewportSize()!;
    await page.setViewportSize({ width: height, height: width });
    const { expectNoErrors } = await open(page);
    expect(await horizontalOverflow(page)).toBe(0);
    await expect(page.locator("h1")).toBeInViewport();
    const btn = page.locator(".venom-btn").first();
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeInViewport({ ratio: 1 });
    expectNoErrors();
  });
});
