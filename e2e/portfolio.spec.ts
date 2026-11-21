import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { byCategory, PROJECTS } from "../src/data/portfolio";
import { horizontalOverflow } from "./helpers";

/**
 * Portfolio samples: every page on every device, in both themes, with and without WebGL.
 * CI has no GPU: WebGL2 runs on SwiftShader, where scenes draw still frames ("static" quality)
 * unless a test forces the full loop with `window.__PF_GL__ = "force"`.
 */

const SAMPLES = [
  { slug: "symbiote", title: "Symbiote", canvas: "ink-canvas" },
  { slug: "gallery", title: "Gallery", canvas: "poster-canvas" },
  { slug: "orbit", title: "Orbit", canvas: "galaxy-canvas" },
] as const;

type Debug = { quality: string; frames: number; running(): boolean };

async function load(page: Page, path: string, gl?: "force" | "off") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  if (gl) await page.addInitScript((mode) => ((window as unknown as { __PF_GL__: string }).__PF_GL__ = mode), gl);
  await page.goto(path);
  await page.getByRole("navigation", { name: "Portfolio samples" }).waitFor();
  // hydrated: the theme switch only marks its option checked after mount
  await page.locator('[role="radio"][aria-checked="true"]').first().waitFor({ state: "attached" });
  return { errors, expectNoErrors: () => expect(errors, errors.join("\n")).toEqual([]) };
}

const status = (page: Page, testId: string) => page.getByTestId(testId).getAttribute("data-status");
const debug = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((c) => {
    const d = (c as unknown as { __pf?: Debug }).__pf;
    return d ? { quality: d.quality, frames: d.frames, running: d.running() } : null;
  });

const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
const summary = (v: Awaited<ReturnType<typeof scan>>["violations"]) =>
  v.map((x) => `${x.id} (${x.impact}): ${x.nodes.map((n) => n.target.join(" ")).join(", ")}`).join("\n");

test("index lists the three samples", async ({ page }) => {
  const { expectNoErrors } = await load(page, "/portfolio");
  for (const s of SAMPLES) await expect(page.getByRole("main").getByRole("link", { name: new RegExp(s.title) })).toHaveAttribute("href", `/portfolio/${s.slug}`);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const { violations } = await scan(page);
  expect(violations, summary(violations)).toEqual([]);
  expectNoErrors();
});

for (const s of SAMPLES) {
  test.describe(`${s.title} sample`, () => {
    const path = `/portfolio/${s.slug}`;

    test("renders its WebGL scene without errors", async ({ page }) => {
      const { expectNoErrors } = await load(page, path);
      await expect.poll(() => status(page, s.canvas)).toBe("on");
      const d = await debug(page, s.canvas);
      expect(d!.frames).toBeGreaterThan(0);
      expectNoErrors();
    });

    test("one h1, landmarks, heading order, no sideways scroll", async ({ page }) => {
      await load(page, path);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      const levels = await page.locator("h1, h2, h3, h4").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      // scrolled to the end too (lazy content, footer, dock)
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });

    test("canvases are decorative and never block clicks", async ({ page }) => {
      await load(page, path);
      for (const c of await page.locator("canvas").all()) {
        expect(await c.evaluate((el) => !!el.closest('[aria-hidden="true"]'))).toBe(true);
      }
      // every link to another site opens a new tab without leaking the opener
      for (const a of await page.locator('a[href^="http"]').all()) {
        await expect(a).toHaveAttribute("target", "_blank");
        await expect(a).toHaveAttribute("rel", /noreferrer/);
      }
    });

    test("falls back to CSS without WebGL", async ({ page }) => {
      const { expectNoErrors } = await load(page, path, "off");
      await expect.poll(() => status(page, s.canvas)).toBe("off");
      await expect(page.locator("h1")).toBeVisible();
      if (s.slug === "symbiote") await expect(page.locator(".sym-ink-fallback")).toBeVisible();
      if (s.slug === "gallery") {
        await expect(page.getByTestId("poster-flat")).toBeVisible();
        await page.locator("#index").scrollIntoViewIfNeeded();
        await expect(page.locator(".gal-cover-fallback").first()).toBeVisible();
      }
      expectNoErrors();
    });

    for (const scheme of ["light", "dark"] as const) {
      test(`no axe violations, ${scheme} theme`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await load(page, path);
        await expect(page.locator("html")).toHaveClass(new RegExp(scheme));
        await expect.poll(() => status(page, s.canvas)).toBe("on");
        await page.waitForTimeout(700); // canvases fade in
        const { violations } = await scan(page);
        expect(violations, summary(violations)).toEqual([]);
      });
    }

    test("reduced motion: still frames only", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const { expectNoErrors } = await load(page, path, "force");
      await expect.poll(() => status(page, s.canvas)).toBe("on");
      await page.waitForTimeout(800);
      expect((await debug(page, s.canvas))!.running).toBe(false);
      expectNoErrors();
    });

    test("ambient animation pauses once scrolled out of view", async ({ page }, info) => {
      test.skip(s.slug === "gallery", "the poster sits beside the copy; covered by the planes test");
      test.skip(info.project.name === "tablet" || info.project.name === "phone-small", "one desktop + one phone is enough");
      await load(page, path, "force");
      await expect.poll(async () => (await debug(page, s.canvas))?.running).toBe(true);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await expect.poll(async () => (await debug(page, s.canvas))?.running, { timeout: 4000 }).toBe(false);
    });

    test("dock switches samples", async ({ page }) => {
      await load(page, path);
      const dock = page.getByRole("navigation", { name: "Portfolio samples" });
      await expect(dock.getByRole("link", { name: s.title })).toHaveAttribute("aria-current", "page");
      const next = SAMPLES[(SAMPLES.findIndex((x) => x.slug === s.slug) + 1) % SAMPLES.length];
      await dock.getByRole("link", { name: next.title }).click();
      await expect(page).toHaveURL(new RegExp(`/portfolio/${next.slug}$`));
      await expect(dock.getByRole("link", { name: next.title })).toHaveAttribute("aria-current", "page");
    });
  });
}

test.describe("Symbiote", () => {
  test("hovering the index shows a WebGL preview that follows the cursor", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "mouse only");
    await load(page, "/portfolio/symbiote");
    const preview = page.locator(".sym-preview");
    const rows = page.locator("#work li.sym-row");
    await rows.first().scrollIntoViewIfNeeded();
    const box = (await rows.nth(1).boundingBox())!;
    await page.mouse.move(box.x + 300, box.y + box.height / 2, { steps: 4 });
    await expect(preview).toHaveClass(/opacity-100/);
    await expect.poll(() => status(page, "preview-canvas")).toBe("on");
    const a = (await preview.boundingBox())!;
    await page.mouse.move(box.x + 600, box.y + box.height / 2, { steps: 6 });
    await expect.poll(async () => (await preview.boundingBox())!.x).toBeGreaterThan(a.x + 100);
    // other rows dim while one is hovered
    await expect(rows.nth(2)).toHaveClass(/sym-row--dim/);
    await page.mouse.move(5, 5);
    await expect(preview).toHaveClass(/opacity-0/);
  });

  test("touch screens get thumbnails instead of the floating preview", async ({ page }, info) => {
    test.skip(info.project.name === "desktop", "touch only");
    await load(page, "/portfolio/symbiote");
    await page.locator("#work").scrollIntoViewIfNeeded();
    await expect(page.locator(".sym-thumb").first()).toBeVisible();
    await expect(page.locator(".sym-preview")).toBeHidden();
  });

  test("the venom button takes you to the work", async ({ page }) => {
    await load(page, "/portfolio/symbiote");
    await page.getByRole("button", { name: "see the work" }).click();
    await expect(page.locator("#work")).toBeInViewport();
    await expect(page.locator("#work")).toBeFocused();
  });

  test("lists every public repository once", async ({ page }) => {
    await load(page, "/portfolio/symbiote");
    const featured = await page.locator("#work li.sym-row").count();
    const archive = await page.locator("#archive tbody tr").count();
    expect(featured + archive).toBe(PROJECTS.length);
  });
});

test.describe("Share", () => {
  test("copies the page link when there is no share sheet", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "clipboard permissions");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await load(page, "/portfolio/gallery");
    await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined }));
    await page.getByRole("button", { name: /share this portfolio/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  });

  test("uses the native share sheet where there is one", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __shared: ShareData[] };
      w.__shared = [];
      Object.defineProperty(navigator, "share", { value: async (d: ShareData) => void w.__shared.push(d) });
      Object.defineProperty(navigator, "canShare", { value: () => true });
    });
    await load(page, "/portfolio/orbit");
    await page.getByRole("button", { name: /share the galaxy/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Thanks for sharing" })).toBeVisible();
    const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0].url).toBe(page.url());
  });
});

test.describe("Gallery", () => {
  test("filters by category and the covers follow", async ({ page }) => {
    await load(page, "/portfolio/gallery");
    await page.locator("#index").scrollIntoViewIfNeeded();
    const cards = page.locator("#index ul > li");
    await expect(cards).toHaveCount(PROJECTS.length);
    const games = byCategory("game").length;
    await page.getByRole("button", { name: /^Games/ }).click();
    await expect(page.getByRole("button", { name: /^Games/ })).toHaveAttribute("aria-pressed", "true");
    await expect(cards).toHaveCount(games);
    await expect(page.getByRole("status").filter({ hasText: `Showing ${games} project` })).toBeAttached();
    await page.getByRole("button", { name: /^All/ }).click();
    await expect(cards).toHaveCount(PROJECTS.length);
  });

  test("covers are drawn by WebGL and redraw while scrolling", async ({ page }) => {
    await load(page, "/portfolio/gallery");
    await page.locator("#index").scrollIntoViewIfNeeded();
    await expect.poll(() => status(page, "planes-canvas")).toBe("on");
    await expect(page.locator(".gal-grid")).toHaveAttribute("data-gl", "on");
    const before = (await debug(page, "planes-canvas"))!.frames;
    await page.mouse.wheel(0, 400);
    await page.evaluate(() => scrollBy(0, 300));
    await expect.poll(async () => (await debug(page, "planes-canvas"))!.frames).toBeGreaterThan(before);
  });

  test("a 'View' cursor follows the mouse over cards", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "mouse only");
    await load(page, "/portfolio/gallery");
    await page.locator("#index ul > li").first().scrollIntoViewIfNeeded();
    const card = (await page.locator("#index [data-card]").first().boundingBox())!;
    await page.mouse.move(card.x + card.width / 2, card.y + 80, { steps: 3 });
    await expect(page.locator(".gal-cursor")).toHaveAttribute("data-on", "true");
  });
});

test.describe("Orbit", () => {
  test("picking a star opens its project", async ({ page }, info) => {
    await load(page, "/portfolio/orbit");
    await expect.poll(() => status(page, "galaxy-canvas")).toBe("on");
    // a star that is on screen and not under the copy or the controls
    const target = await page.getByTestId("galaxy-canvas").evaluate((c) => {
      const stars = (c as unknown as { __stars: ({ x: number; y: number } | null)[] }).__stars;
      const r = c.getBoundingClientRect();
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (!s) continue;
        const x = r.left + s.x, y = r.top + s.y;
        if (x < 30 || y < 30 || x > innerWidth - 30 || y > innerHeight - 30) continue;
        if (document.elementFromPoint(x, y) === c) return { i, x, y };
      }
      return null;
    });
    expect(target).not.toBeNull();
    if (info.project.name === "desktop") await page.mouse.click(target!.x, target!.y);
    else await page.touchscreen.tap(target!.x, target!.y);
    const card = page.getByRole("region", { name: /^Selected star:/ });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: /Source/ })).toHaveAttribute("href", /github\.com/);
    await card.getByRole("button", { name: "Close" }).click();
    await expect(card).toBeHidden();
  });

  test("language toggles and search", async ({ page }) => {
    await load(page, "/portfolio/orbit");
    const ts = page.getByRole("group", { name: "Highlight stars by language" }).getByRole("button", { name: /TypeScript/ });
    await ts.click();
    await expect(ts).toHaveAttribute("aria-pressed", "true");
    await ts.click();
    await expect(ts).toHaveAttribute("aria-pressed", "false");

    const search = page.getByRole("searchbox", { name: "Find a repository" });
    await search.fill("react");
    const hits = PROJECTS.filter((p) => [p.title, p.slug, p.language, ...p.stack].some((x) => x.toLowerCase().includes("react"))).length;
    await expect(page.getByText(`${hits} of ${PROJECTS.length} match`)).toBeVisible();
    await search.fill("");
    await expect(page.getByText(`${PROJECTS.length} repositories`, { exact: true })).toBeVisible();
  });
});
