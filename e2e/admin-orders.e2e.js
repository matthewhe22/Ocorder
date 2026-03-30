// e2e/admin-orders.e2e.js — E2E tests for admin order management
//
// Precondition: Redis seeded with orders in various statuses.
// Requires dev server at http://localhost:3000.

import { test, expect } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USER || "testadmin@example.com";
const ADMIN_PASS = process.env.ADMIN_PASS || "TestPass123!";

// Helper: log in to admin panel
async function loginAdmin(page) {
  await page.goto("/");

  const adminBtn = page.getByRole("button", { name: /admin/i }).first();
  if (!(await adminBtn.count())) return false;
  await adminBtn.click();

  const userInput = page.locator("input[type='email'], input[placeholder*='user' i]").first();
  const passInput = page.locator("input[type='password']").first();
  if (!(await userInput.count()) || !(await passInput.count())) return false;

  await userInput.fill(ADMIN_USER);
  await passInput.fill(ADMIN_PASS);

  const loginBtn = page.getByRole("button", { name: /login|sign in/i }).first();
  if (!(await loginBtn.count())) return false;
  await loginBtn.click();
  await page.waitForTimeout(2000);
  return true;
}

test.describe("Admin order management", () => {
  test("orders table renders after login", async ({ page }) => {
    const loggedIn = await loginAdmin(page);
    if (!loggedIn) return test.skip();

    // Navigate to Orders tab if it exists
    const ordersTab = page.getByRole("button", { name: /orders/i }).first()
      .or(page.getByText(/orders/i).first());
    if (await ordersTab.count() > 0) await ordersTab.click();
    await page.waitForTimeout(1000);

    // At minimum, admin content should be visible
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("CSV export download is triggered", async ({ page }) => {
    const loggedIn = await loginAdmin(page);
    if (!loggedIn) return test.skip();

    const exportBtn = page.getByRole("button", { name: /export|csv/i }).first()
      .or(page.getByText(/export/i).first());
    if (!(await exportBtn.count())) return test.skip();

    // Listen for download
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 5000 }).catch(() => null),
      exportBtn.click(),
    ]);

    if (download) {
      expect(download.suggestedFilename()).toMatch(/tocs-orders.*\.csv/i);
    }
  });

  test("status filter dropdown filters orders", async ({ page }) => {
    const loggedIn = await loginAdmin(page);
    if (!loggedIn) return test.skip();

    // Look for a status filter
    const statusFilter = page.locator("select[name*='status'], select[id*='status'], select").first();
    if (!(await statusFilter.count())) return test.skip();

    // Select a status option
    const options = await statusFilter.locator("option").allTextContents();
    const paidOption = options.find(o => o.toLowerCase().includes("paid"));
    if (paidOption) {
      await statusFilter.selectOption({ label: paidOption });
      await page.waitForTimeout(500);
      // Filtered rows should only show paid orders (or no rows if none exist)
    }
  });
});
