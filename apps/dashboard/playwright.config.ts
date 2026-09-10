import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Mission Control dashboard smoke tests.
 *
 * Boots a local API + dashboard via the npm workspaces dev script, then
 * runs a few sanity checks. Kept small on purpose — full integration
 * coverage lives in apps/api/src/server.test.ts.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.MC_DASHBOARD_BASE_URL || "http://127.0.0.1:3000/agents",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});