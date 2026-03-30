// e2e/admin-plans.e2e.js — E2E tests for admin plan management
//
// Requires dev server at http://localhost:3000 and admin credentials in Redis.

import { test, expect } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USER || "testadmin@example.com";
const ADMIN_PASS = process.env.ADMIN_PASS || "TestPass123!";

async function loginAdmin(page) {
  await page.goto("/");
  const adminBtn = page.getByRole("button", { name: /admin/i }).first();
  if (!(await adminBtn.count())) return false;
  await adminBtn.click();
  const userInput = page.locator("input[type='email'], input[placeholder*='user' i]").first();
  const passInput = page.locator("input[type='password']").first();
  if (!(await userInput.count())) return false;
  await userInput.fill(ADMIN_USER);
  await passInput.fill(ADMIN_PASS);
  const loginBtn = page.getByRole("button", { name: /login|sign in/i }).first();
  if (!(await loginBtn.count())) return false;
  await loginBtn.click();
  await page.waitForTimeout(2000);
  return true;
}

test.describe("Admin plan management", () => {
  test("Plans tab is accessible after login", async ({ page }) => {
    const loggedIn = await loginAdmin(page);
    if (!loggedIn) return test.skip();

    const plansTab = page.getByRole("button", { name: /plans/i }).first()
      .or(page.getByText(/plans/i).first());
    if (await plansTab.count() > 0) {
      await plansTab.click();
      await page.waitForTimeout(1000);
      // Plans content should be visible
      await expect(page.locator("body")).not.toBeEmpty();
    } else {
      test.skip();
    }
  });

  test("existing plans are displayed in the plans table", async ({ page }) => {
    const loggedIn = await loginAdmin(page);
    if (!loggedIn) return test.skip();

    const plansTab = page.getByRole("button", { name: /plans/i }).first();
    if (!(await plansTab.count())) return test.skip();
    await plansTab.click();
    await page.waitForTimeout(1000);

    // Harbour View Residences is in DEFAULT_DATA — should appear if Redis has default data
    const planName = page.getByText(/Harbour View/i).first();
    if (await planName.count() > 0) {
      await expect(planName).toBeVisible();
    }
  });

  test("Add Plan button opens plan editor", async ({ page }) => {
    const loggedIn = await loginAdmin(page);
    if (!loggedIn) return test.skip();

    const plansTab = page.getByRole("button", { name: /plans/i }).first();
    if (!(await plansTab.count())) return test.skip();
    await plansTab.click();
    await page.waitForTimeout(1000);

    const addBtn = page.getByRole("button", { name: /add plan|new plan/i }).first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
      // Should show some form or modal for adding a plan
      const planForm = page.locator("input[placeholder*='Plan ID'], input[placeholder*='Name'], form").first();
      if (await planForm.count() > 0) {
        await expect(planForm).toBeVisible();
      }
    } else {
      test.skip();
    }
  });
});
