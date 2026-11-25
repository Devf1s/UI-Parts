import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3200);
const chromium = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

/**
 * End-to-end tests against the production build (`next build && next start`).
 * Every spec runs on a desktop, a tablet and two phones, all in Chromium; device descriptors give
 * each one its viewport, DPR, touch and UA. With PW_BROWSERS=all (the CI "browsers" job, which
 * installs them) the cross-browser smoke test also runs in Firefox, desktop Safari and Mobile Safari.
 */
const otherEngines = process.env.PW_BROWSERS === "all";
const SMOKE = /compat\.spec\.ts/;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: chromium,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["iPad Mini"], browserName: "chromium" } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "phone-small", use: { ...devices["iPhone SE"], browserName: "chromium" } },
    ...(otherEngines
      ? [
          { name: "firefox", testMatch: SMOKE, use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
          { name: "safari", testMatch: SMOKE, use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
          { name: "mobile-safari", testMatch: SMOKE, use: { ...devices["iPhone 13"] } },
        ]
      : []),
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
