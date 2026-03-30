// e2e/stripe-flow.e2e.js
// E2E tests for Stripe payment flow scenarios.
//
// The Stripe redirect test requires a live STRIPE_SECRET_KEY and is skipped
// if it is not set.  The cancellation banner and error-state tests run against
// any server instance.
import { test, expect } from "@playwright/test";

const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;

// ─── Stripe cancellation banner ───────────────────────────────────────────────

test("Stripe — cancellation banner shown on /?cancelled=1", async ({ page }) => {
  await page.goto("/?cancelled=1");
  await page.waitForLoadState("networkidle");

  // The app shows a yellow cancellation banner
  await expect(page.getByText(/payment cancelled/i)).toBeVisible({ timeout: 8000 });

  // Dismiss button (renders as × with no accessible name, but aria-label may vary)
  const dismissBtn = page.locator("button[aria-label='Dismiss'], button").filter({ hasText: "×" }).first();
  await dismissBtn.click();

  // Banner should disappear
  await expect(page.getByText(/payment cancelled/i)).not.toBeVisible({ timeout: 5000 });
});

// ─── Stripe error state ────────────────────────────────────────────────────────

test("Stripe — error shown for non-existent order stripe confirm", async ({ page }) => {
  // Simulate Stripe redirecting back with a made-up order ID
  await page.goto("/complete?orderId=NONEXISTENT-ORDER-E2E&stripeOk=1");
  await page.waitForLoadState("networkidle");

  // App attempts to call /api/orders/NONEXISTENT-ORDER-E2E/stripe-confirm
  // which fails, and shows an error message
  await expect(
    page.getByText(/could not be verified|error|contact support|network error/i).first()
  ).toBeVisible({ timeout: 15000 });
});

// ─── Stripe payment method visible when stripe is enabled ─────────────────────

test.skip(!STRIPE_ENABLED, "STRIPE_SECRET_KEY not set — skipping card payment test");
test("Stripe — credit card option visible when stripe enabled", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.locator('.s1-search-bar input').fill("Harbour");
  await page.locator('.plan-card').filter({ hasText: "Harbour View Residences" }).first().click();
  await page.locator('.cat-card').filter({ hasText: "OC Certificates" }).click();
  await page.getByRole("button", { name: /continue/i }).click();

  await page.locator('input[placeholder="e.g. Lot 5"]').fill("Lot 1");
  await page.locator('input[placeholder="e.g. Jane Smith"]').fill("Test Owner");

  const FIXTURE_PDF = new URL("./fixtures/authority-doc.pdf", import.meta.url).pathname;
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(FIXTURE_PDF);

  await page.getByText("OC Certificate — Standard").first().waitFor();
  await page.locator(".prod-card").filter({ hasText: "OC Certificate — Standard" }).locator(".add-btn").click();

  await page.getByRole("button", { name: /review order/i }).click();
  await page.getByRole("button", { name: /enter contact details/i }).click();

  await page.locator('input[placeholder="Jane Smith"], input.f-input[type="text"]').first().fill("Test User");
  await page.locator('input[placeholder="jane@example.com"]').fill("stripe@example.com");
  await page.locator('input[placeholder="0400 000 000"]').fill("0412 345 678");

  await page.getByRole("button", { name: /choose payment/i }).click();

  // Stripe card option should be visible
  await expect(page.locator(".pay-method").filter({ hasText: /credit|debit|card/i })).toBeVisible();
});
