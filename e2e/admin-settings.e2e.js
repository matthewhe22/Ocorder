// e2e/admin-settings.e2e.js
// E2E tests for admin settings management.
import { test, expect } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USER || "info@tocs.co";
const ADMIN_PASS = process.env.ADMIN_PASS || "Tocs@Vote";

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Log in and navigate to the Settings tab. */
async function openSettingsTab(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /admin/i }).click();
  await page.locator('input[type="email"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /^settings$/i })).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: /^settings$/i }).click();
}

// ─── Settings page loads ──────────────────────────────────────────────────────

test("Admin settings — settings page loads after login", async ({ page }) => {
  await openSettingsTab(page);

  // Settings tab content should be visible
  await expect(page.getByText(/smtp|order notification|email template/i).first()).toBeVisible({ timeout: 5000 });
});

// ─── Update order notification email ─────────────────────────────────────────

test("Admin settings — update order notification email", async ({ page }) => {
  await openSettingsTab(page);

  // Look for the order notification email input — it usually holds the order email address
  // The SettingsTab renders inputs for orderEmail, payment details, SMTP, templates
  // Find any email input that's likely the order notification email
  const emailInputs = page.locator('input[type="email"], input.f-input[type="text"]');
  const firstEmailInput = emailInputs.first();

  // Clear and fill with test value
  await firstEmailInput.triple_click?.() || await firstEmailInput.click({ clickCount: 3 });
  await firstEmailInput.fill("e2esettings@test.com");

  // Save (look for a Save button in the settings panel)
  await page.getByRole("button", { name: /save/i }).first().click();

  // Expect either a success message or the input value to persist
  await expect(page.locator('input[value="e2esettings@test.com"]')).toBeVisible({ timeout: 5000 });
});

// ─── SMTP password placeholder preserved ─────────────────────────────────────

test("Admin settings — SMTP password shows masked or empty placeholder", async ({ page }) => {
  await openSettingsTab(page);

  // The settings GET endpoint returns "••••••••" when SMTP pass is stored.
  // The password input for SMTP should show either empty or the masked placeholder.
  // If no password configured, it would be empty.
  const smtpSection = page.getByText(/smtp/i).first();
  await expect(smtpSection).toBeVisible({ timeout: 5000 });

  // Find password-like inputs
  const passInputs = page.locator('input[type="password"]');
  if (await passInputs.count() > 0) {
    const value = await passInputs.first().inputValue();
    expect(value === "" || value === "••••••••").toBe(true);
  }
});

// ─── Payment settings visible ────────────────────────────────────────────────

test("Admin settings — payment details section visible", async ({ page }) => {
  await openSettingsTab(page);

  // Navigate to Payment tab
  await page.getByRole("button", { name: /^payment$/i }).click();

  // Payment details should be present
  await expect(page.getByText(/bsb|account|payid/i).first()).toBeVisible({ timeout: 5000 });
});
