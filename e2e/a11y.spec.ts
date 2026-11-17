import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hasRail, open } from "./helpers";

const scan = (page: import("@playwright/test").Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();

const summary = (v: Awaited<ReturnType<typeof scan>>["violations"]) =>
  v.map((x) => `${x.id} (${x.impact}): ${x.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n");

for (const scheme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("page has no axe violations", async ({ page }) => {
      await open(page);
      await expect(page.locator("html")).toHaveClass(new RegExp(scheme));
      const { violations } = await scan(page);
      expect(violations, summary(violations)).toEqual([]);
    });

    test("open navigation has no axe violations", async ({ page }, info) => {
      await open(page);
      if (hasRail(page)) {
        if (info.project.name === "desktop") {
          await page.mouse.move(30, 300);
          await expect(page.getByRole("navigation", { name: "Main" })).toHaveAttribute("data-open", "true");
          await page.getByRole("button", { name: "Pin sidebar open" }).click();
        } else {
          await page.getByRole("button", { name: "Expand sidebar" }).tap();
        }
        await expect(page.getByRole("navigation", { name: "Main" })).toHaveAttribute("data-open", "true");
      } else {
        await page.getByRole("button", { name: "Open menu" }).click();
        await page.getByRole("dialog", { name: "Menu" }).waitFor();
      }
      await page.waitForTimeout(500); // let transitions settle before measuring contrast
      const { violations } = await scan(page);
      expect(violations, summary(violations)).toEqual([]);
    });
  });
}

test("one h1, landmarks and a sensible heading order", async ({ page }) => {
  await open(page);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  const levels = await page.locator("h1, h2, h3, h4").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
});

test("decorative canvases are hidden from assistive tech", async ({ page }) => {
  await open(page);
  const canvases = page.locator("canvas");
  for (const c of await canvases.all()) await expect(c).toHaveAttribute("aria-hidden", "true");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("venom button renders as a plain button with no canvas", async ({ page }) => {
    const { expectNoErrors } = await open(page);
    await expect(page.locator(".venom-btn").first()).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    expectNoErrors();
  });
});
