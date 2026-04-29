// playwright.config.js (repo root)
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.js",

  // Fail fast on CI; allow retries locally
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Shared settings for all tests
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // Browser targets
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],

  // Start the local dev server before running tests. The Express server lives
  // in OCOrder/ — `cd` keeps relative paths (DATA_FILE, UPLOADS_DIR, dist/)
  // resolving correctly. The build runs once first so dist/index.html exists.
  webServer: {
    command: "cd OCOrder && node build.mjs && DATA_FILE=../test-data.json CONFIG_FILE=../test-config.json UPLOADS_DIR=../test-uploads PORT=3000 node server.js",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
