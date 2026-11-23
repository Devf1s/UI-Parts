import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow } from "./helpers";

/**
 * The index (/): every page of the site in the middle of the screen, each behind one of the four
 * new buttons (thermal, trivision, magnet, strings).
 */

const PAGES = [
  { name: "Portfolio", href: "/portfolio" },
  { name: "Gallery", href: "/portfolio/gallery" },
  { name: "Orbit", href: "/portfolio/orbit" },
  { name: "UI parts", href: "/test" },
] as const;

type Fx = { running: boolean; energy: number };

async function load(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Pages" }).waitFor();
  await page.locator('[role="radio"][aria-checked="true"]').first().waitFor({ state: "attached" });
  return { errors, expectNoErrors: () => expect(errors, errors.join("\n")).toEqual([]) };
}

const link = (page: Page, name: string) => page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: new RegExp(`^${name}`) });
const fx = (page: Page, id: string) =>
  page.getByTestId(id).evaluate((c) => {
    const f = (c as unknown as { __fx?: { running(): boolean; energy(): number } }).__fx;
    return f ? ({ running: f.running(), energy: f.energy() } as Fx) : null;
  });
const desktopOnly = (name: string) => test.skip(name !== "desktop", "needs a mouse");

test("lists every page, in order, in the middle of the screen", async ({ page }) => {
  const { expectNoErrors } = await load(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
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

test("every button opens its page", async ({ page }, info) => {
  const touch = info.project.name !== "desktop";
  for (const p of PAGES) {
    await load(page);
    const l = link(page, p.name);
    if (touch) await l.tap();
    else await l.click();
    await expect(page).toHaveURL(new RegExp(`${p.href}$`));
  }
});

test("keyboard: tab order follows the list and focus shows on every button", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  await link(page, "Portfolio").focus();
  await page.keyboard.press("Shift+Tab");
  for (const p of PAGES) {
    await page.keyboard.press("Tab");
    await expect(link(page, p.name)).toBeFocused();
    const ring = await link(page, p.name).evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).toContain("0px 0px 0px 3px");
  }
  // the trivision turns to its second face for keyboard users too
  await link(page, "Gallery").focus();
  await expect(link(page, "Gallery")).toHaveAttribute("data-face", "1");
});

test("thermal: rubbing warms it up, then it cools down and the loop stops", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const b = (await link(page, "Portfolio").boundingBox())!;
  const before = Number((await link(page, "Portfolio").locator(".heat-btn__temp").textContent())!.replace("°", ""));
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(b.x + b.width * (0.3 + 0.3 * Math.sin(i * 0.7)), b.y + b.height * (0.5 + 0.25 * Math.sin(i * 1.9)));
    await page.waitForTimeout(16);
  }
  expect((await fx(page, "heat-canvas"))!.energy).toBeGreaterThan(0.2);
  const after = Number((await link(page, "Portfolio").locator(".heat-btn__temp").textContent())!.replace("°", ""));
  expect(after).toBeGreaterThan(before + 2);
  await page.mouse.move(5, 5);
  await expect.poll(async () => (await fx(page, "heat-canvas"))!.running, { timeout: 15_000 }).toBe(false);
  expect((await fx(page, "heat-canvas"))!.energy).toBeLessThan(0.01);
});

test("trivision: second face on hover, third while pressed, back when the pointer leaves", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const l = link(page, "Gallery");
  await expect(l).toHaveAttribute("data-face", "0");
  const b = (await l.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height / 2);
  await expect(l).toHaveAttribute("data-face", "1");
  await page.mouse.down();
  await expect(l).toHaveAttribute("data-face", "2");
  // let go outside, so it does not navigate
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(l).toHaveAttribute("data-face", "0");
  await expect(page).toHaveURL(/\/$/);
  // the prisms really turn, starting next to where the pointer came in
  const delays = await l.locator(".tv-btn__prism").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).transitionDelay)));
  expect(delays[0]).toBeLessThan(delays[delays.length - 1]);
});

test("magnet: filings settle, swing round the pointer, flip with a press, then rest", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  await expect.poll(async () => (await fx(page, "filings-canvas"))!.running, { timeout: 6000 }).toBe(false);
  const l = link(page, "Orbit");
  const b = (await l.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2, { steps: 4 });
  await expect.poll(async () => (await fx(page, "filings-canvas"))!.energy).toBeGreaterThan(0.01);
  await expect(l).toHaveAttribute("data-pole", "n");
  await page.mouse.down();
  await expect(l).toHaveAttribute("data-pole", "s");
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect.poll(async () => (await fx(page, "filings-canvas"))!.running, { timeout: 6000 }).toBe(false);
  await expect(page).toHaveURL(/\/$/);
});

test("strings: a sweep plucks them and they ring down to silence", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const b = (await link(page, "UI parts").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.6, b.y - 8);
  await page.mouse.move(b.x + b.width * 0.62, b.y + b.height + 8, { steps: 5 });
  expect((await fx(page, "strings-canvas"))!.energy).toBeGreaterThan(1);
  await expect.poll(async () => (await fx(page, "strings-canvas"))!.running, { timeout: 10_000 }).toBe(false);
});

test("sound stays off until it is switched on", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await load(page);
  const plays = () => page.evaluate(() => (window as unknown as { __uiSound: { plays(): number } }).__uiSound.plays());
  const sweep = async () => {
    const b = (await link(page, "UI parts").boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.6, b.y - 8);
    await page.mouse.move(b.x + b.width * 0.62, b.y + b.height + 8, { steps: 5 });
  };
  const toggle = page.getByRole("button", { name: "Sound" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await sweep();
  expect(await plays()).toBe(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const n = await plays();
  await sweep();
  await expect.poll(plays).toBeGreaterThan(n);
});

test("reduced motion: still pictures, nothing loops", async ({ page }, info) => {
  desktopOnly(info.project.name);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page);
  const b = (await link(page, "Portfolio").boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  for (const id of ["heat-canvas", "filings-canvas", "strings-canvas"]) expect((await fx(page, id))!.running).toBe(false);
  const d = await link(page, "Gallery").locator(".tv-btn__prism").first().evaluate((e) => getComputedStyle(e).transitionDuration);
  expect(parseFloat(d)).toBeLessThan(0.01); // the global reduced-motion rule leaves 0.001s
});

test("an untouched page goes completely idle", async ({ page }) => {
  await load(page);
  await expect
    .poll(async () => (await Promise.all(["heat-canvas", "filings-canvas", "strings-canvas"].map((id) => fx(page, id)))).some((f) => f!.running), {
      timeout: 6000,
    })
    .toBe(false);
});
