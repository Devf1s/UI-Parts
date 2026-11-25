import { expect, type Page } from "@playwright/test";

/** md breakpoint (768px): rail above, drawer below. */
export const hasRail = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;

/** Loads a page (the UI parts showcase, /test, by default) and collects runtime errors so a test can fail on any console error. */
export async function open(page: Page, path = "/test") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(path);
  // the index has no venom button; every other page does
  await page.locator(path === "/" ? 'nav[aria-label="Pages"]' : ".venom-btn").first().waitFor();
  // hydrated: the theme switch only marks its option checked after mount
  await page.locator('[role="radio"][aria-checked="true"]').first().waitFor({ state: "attached" });
  return {
    errors,
    expectNoErrors: () => expect(errors, errors.join("\n")).toEqual([]),
  };
}

export function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
