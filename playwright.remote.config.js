// playwright.remote.config.js — runs E2E tests against the live Vercel demo deployment
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.js",

  retries: 0,
  workers: 1,

  use: {
    baseURL: "https://oc-order-git-demo-ocss.vercel.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // No local server — targeting the live Vercel deployment
  webServer: undefined,
});
