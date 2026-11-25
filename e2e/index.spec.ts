import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { horizontalOverflow } from "./helpers";

/**
 * The index (/): every page of the site in the middle of the screen, each behind a cartoon button
 * with a character on it (a cat, pop-up pictures, a rocket, a jack-in-the-box).
 */

const PAGES = [
  { name: "Portfolio", href: "/portfolio" },
  { name: "Gallery", href: "/portfolio/gallery" },
  { name: "Orbit", href: "/portfolio/orbit" },
  { name: "UI parts", href: "/test" },
] as const;

/** Animations that are actually playing right now (finished entrances do not count). */
const running = (page: Page, selector = "body") =>
  page.locator(selector).first().evaluate((root) => root.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length);
async function load(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Pages" }).waitFor();
  await page.locator('[role="radio"][aria-checked="true"]').first().waitFor({ state: "attached" });
  // let the entrance (buttons dropping in) finish, so boxes are measured where they rest
  await expect.poll(() => running(page, "main"), { timeout: 5000 }).toBe(0);
  return { errors, expectNoErrors: () => expect(errors, errors.join("\n")).toEqual([]) };
}

const link = (page: Page, name: string) => page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: new RegExp(`^${name}`) });
const desktopOnly = (name: string) => test.skip(name !== "desktop", "needs a mouse");
const top = async (l: Locator) => (await l.boundingBox())!.y;
const cat = (page: Page) =>
  page.getByTestId("neko").evaluate((el) => {
    const h = (el as unknown as { __toon: { running(): boolean; look(): [number, number] } }).__toon;
    return { running: h.running(), look: h.look() };
  });
/** Leaves the button without letting the press turn into a click. */
async function release(page: Page) {
  await page.mouse.move(4, 4);
  await page.mouse.up();
}

test("lists every page, in order, in the middle of the screen", async ({ page }) => {
  const { expectNoErrors } = await load(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Where to?");
  const links = page.getByRole("navigation", { name: "Pages" }).getByRole("link");
  await expect(links).toHaveCount(PAGES.length);
  for (const [i, p] of PAGES.entries()) {
    await expect(links.nth(i)).toHaveAccessibleName(new RegExp(`^${p.name}`));
    await expect(links.nth(i)).toHaveAttribute("href", p.href);
  }
  const nav = (await page.getByRole("navigation", { name: "Pages" }).boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(Math.abs(nav.x + nav.width / 2 - vw / 2)).toBeLessThan(vw * 0.05);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // every button is a comfortable tap target
  for (let i = 0; i < PAGES.length; i++) expect((await links.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expectNoErrors();
});

for (const scheme of ["light", "dark"] as const) {
  test(`no axe violations, ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await load(page);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(violations, violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n")).toEqual([]);
  });
}

test("every button plays its exit gag, then opens its page", async ({ page }, info) => {
  const touch = info.project.name !== "desktop";
  for (const p of PAGES) {
    const { expectNoErrors } = await load(page);
    const l = link(page, p.name);
    if (touch) await l.tap();
    else await l.click();
    await expect(page).toHaveURL(new RegExp(`${p.href}$`));
    expectNoErrors();
  }
  // the gag really plays before the page changes
  await load(page);
  const go = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const l = document.querySelector('nav[aria-label="Pages"] a')!;
        new MutationObserver(() => l.hasAttribute("data-go") && resolve(true)).observe(l, { attributes: true });
      }),
  );
  if (touch) await link(page, "Portfolio").tap();
  else await link(page, "Portfolio").click();
  expect(await go).toBe(true);
  await expect(page).toHaveURL(/\/portfolio$/);
});

test("going back after a gag shows the index at rest", async ({ page }, info) => {
  // pages navigated away from are kept hidden (Activity) for the way back; their timers stop
  const touch = info.project.name !== "desktop";
  await load(page);
  if (touch) await link(page, "UI parts").tap();
  else await link(page, "UI parts").click();
  await expect(page).toHaveURL(/\/test$/);
  await page.mouse.move(4, 4);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  const l = link(page, "UI parts");
  await expect(l).toBeVisible();
  await expect(l).not.toHaveAttribute("data-go");
  await expect(l).not.toHaveAttribute("data-press");
  await expect(page.locator(".toon__lines").first()).toHaveCSS("opacity", "0");
});

test("keyboard: tab order follows the list, focus is visible and wakes the character", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  await link(page, "Portfolio").focus();
  await page.keyboard.press("Shift+Tab");
  for (const p of PAGES) {
    await page.keyboard.press("Tab");
    const l = link(page, p.name);
    await expect(l).toBeFocused();
    await expect(l).toHaveAttribute("data-hover", "true");
    const ring = await l.locator(".toon__body").evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth}`;
    });
    expect(ring).toBe("solid 3px");
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/test$/);
});

test("neko: the eyes follow the pointer, settle, and squeeze shut on a press", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const vw = page.viewportSize()!.width;
  const l = link(page, "Portfolio");
  const b = (await l.boundingBox())!;
  await page.mouse.move(8, b.y, { steps: 3 });
  await expect.poll(async () => (await cat(page)).look[0]).toBeLessThan(-1.5);
  await page.mouse.move(vw - 8, b.y, { steps: 3 });
  await expect.poll(async () => (await cat(page)).look[0]).toBeGreaterThan(1.5);
  // the spring settles and the loop stops: nothing runs while the pointer is still
  await expect.poll(async () => (await cat(page)).running, { timeout: 4000 }).toBe(false);

  const rest = await top(page.getByTestId("neko"));
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 3 });
  await expect(l).toHaveAttribute("data-hover", "true");
  await expect.poll(() => top(page.getByTestId("neko"))).toBeLessThan(rest - 6); // pops up
  await page.mouse.down();
  await expect(l).toHaveAttribute("data-press", "true");
  await expect(page.locator(".neko-squint")).toHaveCSS("opacity", "1");
  await expect(page.locator(".neko-eyes")).toHaveCSS("opacity", "0");
  await release(page);
  await expect(l).not.toHaveAttribute("data-press");
  await expect(page).toHaveURL(/\/$/);
});

test("pop-up: the pictures spring out of the button and tuck back in", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const l = link(page, "Gallery");
  const b = (await l.boundingBox())!;
  const card = page.locator(".pop-card").first();
  const tucked = await top(card);
  expect(tucked).toBeGreaterThan(b.y - 20); // only the top edge peeks out
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 3 });
  await expect.poll(() => top(card)).toBeLessThan(b.y - 30);
  expect(await running(page, '[data-toon="popup"] .toon__front')).toBeGreaterThan(0); // petals falling
  await page.mouse.move(4, 4);
  await expect.poll(() => top(card)).toBeGreaterThan(b.y - 20);
});

test("rocket: rumbles and smokes when pointed at, lifts off when clicked", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const l = link(page, "Orbit");
  const b = (await l.boundingBox())!;
  expect(await running(page, '[data-toon="rocket"]')).toBe(0);
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 3 });
  await expect.poll(() => running(page, '[data-toon="rocket"] .rk-spot')).toBeGreaterThan(3); // rumble, flame, puffs
  const pad = await top(page.locator(".rk-rocket"));
  await l.click();
  await expect(l).toHaveAttribute("data-go", "true");
  await expect.poll(() => top(page.locator(".rk-rocket")), { timeout: 2000 }).toBeLessThan(pad - 40);
  await expect(page).toHaveURL(/\/portfolio\/orbit$/);
});

test("jack-in-the-box: the glove boings out, then punches (POW!) on click", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const l = link(page, "UI parts");
  const b = (await l.boundingBox())!;
  const glove = page.locator(".bx-glove");
  const hidden = await top(glove);
  expect(hidden).toBeGreaterThan(b.y); // inside the box
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 3 });
  await expect.poll(() => top(glove)).toBeLessThan(b.y);
  await expect(page.locator(".bx-pow")).toHaveCSS("scale", "0");
  await l.click();
  await expect.poll(() => page.locator(".bx-pow").evaluate((e) => parseFloat(getComputedStyle(e).scale))).toBeGreaterThan(0.8);
  await expect(page).toHaveURL(/\/test$/);
});

test("sound stays off until it is switched on", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const plays = () => page.evaluate(() => (window as unknown as { __uiSound: { plays(): number } }).__uiSound.plays());
  const visit = async (name: string) => {
    const b = (await link(page, name).boundingBox())!;
    await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 2 });
    await page.mouse.move(4, 4, { steps: 2 });
  };
  const toggle = page.getByRole("button", { name: "Sound" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await visit("UI parts");
  expect(await plays()).toBe(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const n = await plays();
  await visit("Orbit");
  await visit("Gallery");
  await expect.poll(plays).toBeGreaterThan(n + 1);
});

test("reduced motion: no entrance, no gags in the way, links open at once", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page);
  expect(await running(page, "main")).toBe(0);
  const l = link(page, "Orbit");
  const b = (await l.boundingBox())!;
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 3 });
  expect(await running(page, "main")).toBe(0);
  expect((await cat(page)).running).toBe(false);
  const sawGo = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const el = document.querySelectorAll('nav[aria-label="Pages"] a')[2];
        new MutationObserver(() => el.hasAttribute("data-go") && resolve(true)).observe(el, { attributes: true });
        setTimeout(() => resolve(false), 1500);
      }),
  );
  await l.click();
  await expect(page).toHaveURL(/\/portfolio\/orbit$/);
  expect(await sawGo).toBe(false);
});

test("an untouched page goes completely idle", async ({ page }) => {
  await load(page);
  // the entrance plays once; after that nothing animates and the eye loop sleeps
  await expect.poll(() => running(page), { timeout: 5000 }).toBe(0);
  await expect.poll(async () => (await cat(page)).running, { timeout: 4000 }).toBe(false);
});
