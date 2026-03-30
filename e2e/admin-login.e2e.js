// e2e/admin-login.e2e.js
// E2E tests for admin authentication.
//
// The default admin credentials used by server.js are:
//   user: info@tocs.co
//   pass: Tocs@Vote
// Override via ADMIN_USER / ADMIN_PASS env vars if needed.
import { test, expect } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USER || "info@tocs.co";
const ADMIN_PASS = process.env.ADMIN_PASS || "Tocs@Vote";

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Navigate to the admin panel login form. */
async function openAdminLogin(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /admin/i }).click();
}

/** Log in with provided credentials. */
async function loginAs(page, { user, pass }) {
  await openAdminLogin(page);
  // The login form has type="email" for username and type="password" for password
  await page.locator('input[type="email"]').fill(user);
  await page.locator('input[type="password"]').fill(pass);
  // The login button has text "Sign In"
  await page.getByRole("button", { name: /sign in/i }).click();
}

// ─── Happy path ───────────────────────────────────────────────────────────────

test("Admin login — valid credentials shows admin panel", async ({ page }) => {
  await loginAs(page, { user: ADMIN_USER, pass: ADMIN_PASS });

  // After login the Orders tab should be visible in the admin bar
  await expect(page.getByRole("button", { name: /^orders$/i })).toBeVisible({ timeout: 8000 });
});

// ─── Invalid credentials ──────────────────────────────────────────────────────

test("Admin login — wrong password shows error", async ({ page }) => {
  await loginAs(page, { user: ADMIN_USER, pass: "WrongPassword99!" });

  // Error message shown
  await expect(page.locator(".login-err")).toBeVisible();
});

// ─── Token persistence across reload ─────────────────────────────────────────

test("Admin login — token persists after page reload", async ({ page }) => {
  await loginAs(page, { user: ADMIN_USER, pass: ADMIN_PASS });
  await expect(page.getByRole("button", { name: /^orders$/i })).toBeVisible({ timeout: 8000 });

  // Reload the page
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Navigate back to admin
  await page.getByRole("button", { name: /admin/i }).click();

  // Should still be logged in (token in sessionStorage)
  await expect(page.getByRole("button", { name: /^orders$/i })).toBeVisible({ timeout: 8000 });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

test("Admin login — logout clears session and shows login form", async ({ page }) => {
  await loginAs(page, { user: ADMIN_USER, pass: ADMIN_PASS });
  await expect(page.getByRole("button", { name: /^orders$/i })).toBeVisible({ timeout: 8000 });

  // Click "Sign Out" button
  await page.getByRole("button", { name: /sign out/i }).click();

  // Login form (password input) should reappear
  await expect(page.locator('input[type="password"]')).toBeVisible();

  // sessionStorage should have no token
  const token = await page.evaluate(() => sessionStorage.getItem("admin_token"));
  expect(token).toBeNull();
});

// ─── Enter key submits the form ───────────────────────────────────────────────

test("Admin login — pressing Enter in password field submits", async ({ page }) => {
  await openAdminLogin(page);
  await page.locator('input[type="email"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.locator('input[type="password"]').press("Enter");

  await expect(page.getByRole("button", { name: /^orders$/i })).toBeVisible({ timeout: 8000 });
});
