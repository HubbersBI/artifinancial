import { defineConfig, devices } from "@playwright/test";

/**
 * Artifinancial E2E configuration (PLAN section 12).
 *
 * The app is single-user with one shared SQLite database, so tests share state
 * and must run serially in file-name order. `01-fresh-start.spec.ts` runs first
 * against an untouched database; every later spec resets state through the API.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:8000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
