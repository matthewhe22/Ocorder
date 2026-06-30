// Portal smoke test — exercises the customer-facing wizard far enough to
// confirm the SPA boots, plans render, and the order-tracking widget round-
// trips through the API. Does NOT submit a real order (no SMTP / Stripe).
import { test, expect } from "@playwright/test";

test.describe("OC Order portal — smoke", () => {
  test("home loads and shows the search bar", async ({ page }) => {
    await page.goto("/");
    // Brand mark — `alt="TOCS"` on the logo at the top of the page.
    await expect(page.getByAltText("TOCS")).toBeVisible();
    // The plan-search input always renders on step 1.
    await expect(page.getByPlaceholder(/search|plan|building/i).first()).toBeVisible();
  });

  test("track widget rejects an unknown order id", async ({ page }) => {
    await page.goto("/");
    // Find the track form. Its button is rendered with the `track-btn` class.
    const trackInput = page.locator(".track-input").first();
    if (await trackInput.count() === 0) test.skip(true, "track widget not present in this build");
    await trackInput.fill("TOCS-DOES-NOT-EXIST");
    await page.locator(".track-btn").first().click();
    // Expect a not-found message — the API returns "Order not found."
    await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 10_000 });
  });

  test("admin login screen renders on the admin path", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByText(/admin login|sign in/i).first()).toBeVisible();
  });
});
