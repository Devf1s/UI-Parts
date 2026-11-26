import { expect, test } from "@playwright/test";
import { horizontalOverflow } from "./helpers";

/**
 * Cross-browser smoke test: every page in Firefox and WebKit (desktop Safari and Mobile Safari),
 * besides the Chromium devices. The detailed specs stay Chromium-only; this checks that each
 * engine loads every page cleanly, lays it out without sideways scroll, and that WebGL either
 * runs or falls back instead of hanging.
 */
const PAGES = ["/", "/portfolio", "/portfolio/gallery", "/portfolio/orbit", "/test"] as const;

for (const path of PAGES) {
  test(`${path} loads cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    // hydrated: the theme switch marks its option checked only after mount
    await page.locator('[role="radio"][aria-checked="true"]').first().waitFor({ state: "attached" });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // the hero scene settles: drawing, or switched off with its CSS fallback showing
    const hero = page.locator('[data-testid="ink-canvas"], [data-testid="poster-canvas"], [data-testid="galaxy-canvas"]');
    if (await hero.count()) await expect.poll(() => hero.getAttribute("data-status"), { timeout: 10_000 }).not.toBe("pending");
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("the theme switch changes the theme", async ({ page }) => {
  await page.goto("/");
  await page.locator('[role="radio"][aria-checked="true"]').first().waitFor({ state: "attached" });
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("an index button leads to its page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: /^Orbit/ }).click();
  await expect(page).toHaveURL(/\/portfolio\/orbit$/);
  // the index stays in the document, hidden, for the way back: only one heading is exposed
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("an unknown address shows the 404 page", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page wandered off");
  await page.getByRole("link", { name: /Take me home/ }).click();
  await expect(page).toHaveURL(/\/$/);
});
