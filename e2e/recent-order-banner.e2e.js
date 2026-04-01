// e2e/recent-order-banner.e2e.js
// E2E tests for the recent order banner shown on the home page.
import { test, expect } from "@playwright/test";

// ─── Banner shown for recent order ────────────────────────────────────────────

test("Recent order banner — shown for order placed within last 7 days", async ({ page }) => {
  // Navigate and inject a recent order into localStorage before the app reads it
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Set localStorage to simulate a recent order
  const recentOrder = {
    id: "TOCS-E2ETEST-ABC",
    date: new Date().toISOString(),
    email: "recent@example.com",
    total: 220,
    payment: "bank",
    orderCategory: "oc",
  };
  await page.evaluate((order) => {
    localStorage.setItem("tocs_last_order", JSON.stringify(order));
  }, recentOrder);

  // Reload to have the app read from localStorage on mount
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Recent order banner should be visible with the order ID
  await expect(page.getByText("TOCS-E2ETEST-ABC")).toBeVisible();
});

// ─── Banner hidden for order placed 8+ days ago ────────────────────────────────

test("Recent order banner — not shown for order 8 days ago", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Inject an old order (8 days ago)
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const oldOrder = {
    id: "TOCS-OLDORDER-XYZ",
    date: eightDaysAgo,
    email: "old@example.com",
    total: 220,
    payment: "bank",
    orderCategory: "oc",
  };
  await page.evaluate((order) => {
    localStorage.setItem("tocs_last_order", JSON.stringify(order));
  }, oldOrder);

  await page.reload();
  await page.waitForLoadState("networkidle");

  // Old order banner should NOT be visible
  await expect(page.getByText("TOCS-OLDORDER-XYZ")).not.toBeVisible();
});

// ─── Banner can be dismissed ──────────────────────────────────────────────────

test("Recent order banner — dismiss button hides banner", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const recentOrder = {
    id: "TOCS-DISMISS-TEST",
    date: new Date().toISOString(),
    email: "dismiss@example.com",
    total: 220,
    payment: "bank",
    orderCategory: "oc",
  };
  await page.evaluate((order) => {
    localStorage.setItem("tocs_last_order", JSON.stringify(order));
  }, recentOrder);

  await page.reload();
  await page.waitForLoadState("networkidle");

  // Banner visible
  await expect(page.getByText("TOCS-DISMISS-TEST")).toBeVisible();

  // Click dismiss (×) button near the banner
  // The dismiss button renders as a button with aria-label="Dismiss" and text "×"
  // It is the only button inside the recent order banner
  const dismissBtn = page.locator('[aria-label="Dismiss"]');
  await dismissBtn.click();

  // Banner should be gone
  await expect(page.getByText("TOCS-DISMISS-TEST")).not.toBeVisible();
});
