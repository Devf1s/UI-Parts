import { expect, test, type Page } from "@playwright/test";
import { hasRail, open } from "./helpers";

const nav = (page: Page) => page.getByRole("navigation", { name: "Main" });
/** Visible width of the rail, measured by hit-testing (clip-path clips hits too). */
const visibleWidth = (page: Page) =>
  page.locator("nav[aria-label=Main] .sb-glass").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    let x = r.left + 12; // start inside: the left edge bows in a little at the waist
    while (x < r.right && el.contains(document.elementFromPoint(x, y))) x += 4;
    return x - r.left;
  });

test.describe("sidebar: rail", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasRail(page), "drawer layout");
    await open(page);
  });

  test("expands on hover with a mouse, collapses on leave", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "needs a fine pointer");
    await expect(nav(page)).toHaveAttribute("data-open", "false");
    expect(await visibleWidth(page)).toBeLessThan(80);
    await page.mouse.move(30, 300);
    await expect(nav(page)).toHaveAttribute("data-open", "true");
    await expect.poll(() => visibleWidth(page)).toBeGreaterThan(250);
    await page.mouse.move(900, 300);
    await expect(nav(page)).toHaveAttribute("data-open", "false");
  });

  test("pin keeps it open and is announced", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "touch rails pin via the logo (next test)");
    await page.mouse.move(30, 300);
    await expect(nav(page)).toHaveAttribute("data-open", "true");
    const pin = page.getByRole("button", { name: "Pin sidebar open" });
    await pin.click();
    const unpin = page.getByRole("button", { name: "Unpin sidebar" });
    await expect(unpin).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(900, 300);
    await expect(nav(page)).toHaveAttribute("data-open", "true");
    await unpin.click();
    await page.mouse.move(900, 300);
    await expect(nav(page)).toHaveAttribute("data-open", "false");
  });

  test("tablet: tapping the logo opens it, tapping outside closes it", async ({ page }, info) => {
    test.skip(info.project.name !== "tablet", "touch only");
    await page.getByRole("button", { name: "Expand sidebar" }).tap();
    await expect(nav(page)).toHaveAttribute("data-open", "true");
    await page.locator("main h1").tap();
    await expect(nav(page)).toHaveAttribute("data-open", "false");
  });

  test("keyboard: focus opens it (on touch tablets too) and links are reachable", async ({ page }) => {
    await page.keyboard.press("Tab");
    await expect(nav(page)).toHaveAttribute("data-open", "true");
    const links = nav(page).getByRole("listitem").getByRole("link"); // menu links, not the promo card
    await expect(links).toHaveCount(6);
    for (let i = 0; i < 8 && !(await links.nth(1).evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(links.nth(1)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(links.nth(1)).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveURL(/#projects$/);
    await page.locator("main h1").click({ position: { x: 5, y: 5 } }); // move focus away
    await page.keyboard.press("Tab");
  });

  test("tapping a link on a touch rail does not expand it", async ({ page }, info) => {
    test.skip(info.project.name !== "tablet", "touch only");
    await nav(page).getByRole("link", { name: "Skills" }).tap({ position: { x: 24, y: 22 } }); // the visible icon
    await expect(nav(page).getByRole("link", { name: "Skills" })).toHaveAttribute("aria-current", "page");
    await expect(nav(page)).toHaveAttribute("data-open", "false");
  });

  test("collapsed links still have accessible names", async ({ page }) => {
    for (const name of ["Home", "Projects", "Skills", "Experience", "Blog", "Contact"]) {
      await expect(nav(page).getByRole("link", { name })).toHaveCount(1);
    }
  });

  test("scroll spy moves the active item", async ({ page }) => {
    await page.locator("#contact").scrollIntoViewIfNeeded();
    await expect(nav(page).getByRole("link", { name: "Contact" })).toHaveAttribute("aria-current", "page");
    await page.evaluate(() => scrollTo(0, 0));
    await expect(nav(page).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });

  test("animates clip-path only, never width (no layout thrash)", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "needs hover");
    const before = await page.locator("main").boundingBox();
    const width = await page.locator("nav .sb-glass").evaluate((el) => el.getBoundingClientRect().width);
    await page.mouse.move(30, 300);
    await expect(nav(page)).toHaveAttribute("data-open", "true");
    expect(await page.locator("nav .sb-glass").evaluate((el) => el.getBoundingClientRect().width)).toBe(width);
    expect(await page.locator("main").boundingBox()).toEqual(before);
  });
});

test.describe("sidebar: groups and glass", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasRail(page), "drawer layout");
    await open(page);
  });

  test("a group folds its children away and hands the active state to its header", async ({ page }) => {
    const work = nav(page).getByRole("button", { name: "Work" });
    await nav(page).getByRole("link", { name: "Skills" }).click({ position: { x: 24, y: 20 } });
    await expect(work).toHaveAttribute("aria-expanded", "true");
    await work.click({ position: { x: 24, y: 22 } });
    await expect(work).toHaveAttribute("aria-expanded", "false");
    // folded children are inert: they can't take focus
    const skills = nav(page).locator('a[href="#skills"]');
    expect(await skills.evaluate((el) => (el.focus(), document.activeElement === el))).toBe(false);
    await expect(work.locator(".sb-glass-pill")).toHaveCount(1);
    await work.click({ position: { x: 24, y: 22 } });
    await expect(nav(page).getByRole("link", { name: "Skills" })).toHaveAttribute("aria-current", "page");
  });

  test("curved outline: both long edges bow in at the waist", async ({ page }) => {
    const clip = await page.locator("nav .sb-glass").evaluate((el) => getComputedStyle(el).clipPath);
    expect(clip).toMatch(/^path\(/);
    // hit-test the right edge near the top and at the waist
    const edgeAt = (fy: number) =>
      page.locator("nav .sb-glass").evaluate((el, fy) => {
        const r = el.getBoundingClientRect();
        const y = r.top + r.height * fy;
        let x = r.left;
        while (x < r.right && el.contains(document.elementFromPoint(x + 0.5, y))) x += 1;
        return x - r.left;
      }, fy);
    expect((await edgeAt(0.1)) - (await edgeAt(0.5))).toBeGreaterThan(3);
  });

  test("refraction on desktop Chromium, frosted fallback on touch", async ({ page }, info) => {
    const bf = await page.locator("nav .sb-glass").evaluate((el) => getComputedStyle(el).backdropFilter);
    if (info.project.name === "desktop") expect(bf).toMatch(/^url\(/);
    else expect(bf).toMatch(/blur/);
  });
});

test.describe("sidebar: reduced transparency", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("solid panel when transparency is reduced", async ({ page }) => {
    test.skip(!hasRail(page), "drawer layout");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
    await open(page);
    const s = await page.locator("nav .sb-glass").evaluate((el) => getComputedStyle(el));
    expect(s.backdropFilter).toBe("none");
  });
});

test.describe("sidebar: drawer", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(hasRail(page), "rail layout");
    await open(page);
    await page.getByRole("button", { name: "Open menu" }).click();
  });

  const dialog = (page: Page) => page.getByRole("dialog", { name: "Menu" });

  test("opens as a modal, locks scroll and focuses the current link", async ({ page }) => {
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toHaveAttribute("aria-modal", "true");
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    await expect(dialog(page).getByRole("link", { name: "Home" })).toBeFocused();
  });

  test("closes with the close button, Escape and the backdrop", async ({ page }) => {
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(dialog(page)).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(dialog(page)).toBeVisible();
    const vw = page.viewportSize()!.width;
    await page.mouse.click(vw - 10, 300);
    await expect(dialog(page)).toBeHidden();
  });

  test("navigating closes the drawer and scrolls to the section", async ({ page }) => {
    await dialog(page).getByRole("link", { name: "Contact" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator("#contact")).toBeInViewport();
  });

  test("swipe left closes it", async ({ page }) => {
    await expect(dialog(page)).toBeVisible();
    await page.waitForTimeout(400); // spring in
    const box = (await dialog(page).boundingBox())!;
    const y = box.y + box.height * 0.6;
    await page.mouse.move(box.x + box.width - 20, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width - 20 - i * 30, y);
    await page.mouse.up();
    await expect(dialog(page)).toBeHidden();
  });

  test("fits small screens and leaves a tap-out strip", async ({ page }) => {
    const box = (await dialog(page).boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(box.x + box.width).toBeLessThanOrEqual(vw - 40);
  });
});
