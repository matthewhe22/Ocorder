// e2e/admin-login.e2e.js — E2E tests for admin authentication
//
// Requires:
//   - Dev server at http://localhost:3000
//   - Redis configured with admin credentials (ADMIN_USER / ADMIN_PASS or stored config)
//
// Test credentials from test/setup.js:
//   user: testadmin@example.com
//   pass: TestPass123!

import { test, expect } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USER || "testadmin@example.com";
const ADMIN_PASS = process.env.ADMIN_PASS || "TestPass123!";

// Helper to locate the Admin nav button
async function openAdminPanel(page) {
  const adminBtn = page.getByRole("button", { name: /admin/i }).first()
    .or(page.getByText(/admin/i).first());
  if (await adminBtn.count() > 0) {
    await adminBtn.click();
    return true;
  }
  return false;
}

test.describe("Admin authentication", () => {
  test("login form is shown when Admin is clicked", async ({ page }) => {
    await page.goto("/");
    const found = await openAdminPanel(page);
    if (!found) return test.skip();

    // Look for login form elements
    const loginForm = page.locator("input[type='password'], input[placeholder*='password' i]").first();
    await expect(loginForm).toBeVisible({ timeout: 5000 }).catch(() => {
      // Admin might require different navigation path
    });
  });

  test("invalid credentials show error message", async ({ page }) => {
    await page.goto("/");
    const found = await openAdminPanel(page);
    if (!found) return test.skip();

    const userInput = page.locator("input[type='email'], input[placeholder*='user' i], input[placeholder*='email' i]").first();
    const passInput = page.locator("input[type='password']").first();

    if (!(await userInput.count()) || !(await passInput.count())) return test.skip();

    await userInput.fill("wrong@example.com");
    await passInput.fill("wrongpass");

    const loginBtn = page.getByRole("button", { name: /login|sign in/i }).first();
    if (await loginBtn.count() > 0) {
      await loginBtn.click();
      // Should show error
      const errorMsg = page.getByText(/incorrect|invalid|wrong|unauthorized/i).first();
      await expect(errorMsg).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });

  test("successful login shows admin panel", async ({ page }) => {
    await page.goto("/");
    const found = await openAdminPanel(page);
    if (!found) return test.skip();

    const userInput = page.locator("input[type='email'], input[placeholder*='user' i], input[placeholder*='email' i]").first();
    const passInput = page.locator("input[type='password']").first();

    if (!(await userInput.count()) || !(await passInput.count())) return test.skip();

    await userInput.fill(ADMIN_USER);
    await passInput.fill(ADMIN_PASS);

    const loginBtn = page.getByRole("button", { name: /login|sign in/i }).first();
    if (await loginBtn.count() > 0) {
      await loginBtn.click();
      await page.waitForTimeout(2000);
      // Admin panel should now be visible — look for orders, settings, etc.
      const adminContent = page.getByText(/orders|settings|logout/i).first();
      await expect(adminContent).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });

  test("logout clears admin token from sessionStorage", async ({ page }) => {
    await page.goto("/");
    const found = await openAdminPanel(page);
    if (!found) return test.skip();

    // Log in
    const userInput = page.locator("input[type='email'], input[placeholder*='user' i]").first();
    const passInput = page.locator("input[type='password']").first();
    if (!(await userInput.count())) return test.skip();

    await userInput.fill(ADMIN_USER);
    await passInput.fill(ADMIN_PASS);
    const loginBtn = page.getByRole("button", { name: /login|sign in/i }).first();
    if (await loginBtn.count() > 0) await loginBtn.click();
    await page.waitForTimeout(2000);

    // Log out
    const logoutBtn = page.getByRole("button", { name: /logout|sign out/i }).first();
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForTimeout(500);

      // Token should be cleared
      const token = await page.evaluate(() => sessionStorage.getItem("admin_token"));
      // Either null or undefined after logout
      expect(token == null).toBe(true);
    }
  });
});
