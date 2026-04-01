// e2e/admin-plans.e2e.js
// E2E tests for admin plan management (add, edit, delete).
import { test, expect } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USER || "info@tocs.co";
const ADMIN_PASS = process.env.ADMIN_PASS || "Tocs@Vote";

// Unique plan ID to avoid conflicts across test runs
const TEST_PLAN_ID = "SP99001";
const TEST_PLAN_NAME = "E2E Test Building";
const TEST_PLAN_NAME_UPDATED = "E2E Updated Building";
const TEST_PLAN_ADDR = "1 Test Street, Sydney NSW 2000";

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Log in and navigate to the Plans tab. */
async function openPlansTab(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /admin/i }).click();
  await page.locator('input[type="email"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /^plans$/i })).toBeVisible({ timeout: 8000 });
  // Plans tab is the default; click to make sure
  await page.getByRole("button", { name: /^plans$/i }).click();
  await expect(page.getByRole("heading", { name: "Strata Plans" })).toBeVisible({ timeout: 5000 });
}

/** Clean up any test plan that may exist from a prior run. */
async function cleanupTestPlan(page, planName) {
  const planRow = page.locator(".tbl tbody tr").filter({ hasText: planName });
  if (await planRow.count() > 0) {
    page.once("dialog", d => d.accept());
    await planRow.locator(".tbl-act-btn").filter({ hasText: /delete/i }).click();
    await expect(page.getByText(planName)).not.toBeVisible({ timeout: 5000 });
  }
}

// ─── Add a plan ────────────────────────────────────────────────────────────────

test("Admin plans — add a new plan", async ({ page }) => {
  await openPlansTab(page);
  await cleanupTestPlan(page, TEST_PLAN_NAME);

  // Click "Add Plan"
  await page.getByRole("button", { name: /add plan/i }).click();

  // Modal should appear
  await expect(page.locator(".modal")).toBeVisible({ timeout: 5000 });

  // Fill Plan ID, Name, Address (the modal has input fields in order)
  const modalInputs = page.locator(".modal input.f-input, .modal input[type='text']");
  await modalInputs.nth(0).fill(TEST_PLAN_ID);
  await modalInputs.nth(1).fill(TEST_PLAN_NAME);
  await modalInputs.nth(2).fill(TEST_PLAN_ADDR);

  // Save
  await page.locator(".modal").getByRole("button", { name: /save|add/i }).last().click();

  // New plan appears in the table
  await expect(page.getByText(TEST_PLAN_NAME)).toBeVisible({ timeout: 5000 });
});

// ─── Edit a plan ──────────────────────────────────────────────────────────────

test("Admin plans — edit an existing plan name", async ({ page }) => {
  await openPlansTab(page);

  // Ensure test plan exists (re-create if previous test deleted it)
  let planRow = page.locator(".tbl tbody tr").filter({ hasText: TEST_PLAN_NAME });
  if (await planRow.count() === 0) {
    await page.getByRole("button", { name: /add plan/i }).click();
    await expect(page.locator(".modal")).toBeVisible();
    const modalInputs = page.locator(".modal input.f-input, .modal input[type='text']");
    await modalInputs.nth(0).fill(TEST_PLAN_ID);
    await modalInputs.nth(1).fill(TEST_PLAN_NAME);
    await modalInputs.nth(2).fill(TEST_PLAN_ADDR);
    await page.locator(".modal").getByRole("button", { name: /save|add/i }).last().click();
    await page.getByText(TEST_PLAN_NAME).waitFor({ timeout: 5000 });
    // Wait for the modal overlay to fully close before continuing
    await expect(page.locator(".overlay")).not.toBeVisible({ timeout: 5000 });
    planRow = page.locator(".tbl tbody tr").filter({ hasText: TEST_PLAN_NAME });
  }

  // Click Edit button on the row
  await planRow.locator(".tbl-act-btn").filter({ hasText: /edit/i }).click();
  await expect(page.locator(".modal")).toBeVisible({ timeout: 5000 });

  // Clear and update the name (2nd input in modal is Name)
  const nameInput = page.locator(".modal input.f-input, .modal input[type='text']").nth(1);
  await nameInput.clear();
  await nameInput.fill(TEST_PLAN_NAME_UPDATED);

  await page.locator(".modal").getByRole("button", { name: /save|update/i }).last().click();

  // Updated name visible in table
  await expect(page.getByText(TEST_PLAN_NAME_UPDATED)).toBeVisible({ timeout: 5000 });
});

// ─── Delete a plan ────────────────────────────────────────────────────────────

test("Admin plans — delete plan removes it from table", async ({ page }) => {
  await openPlansTab(page);

  // The plan might be named TEST_PLAN_NAME_UPDATED from the edit test, or TEST_PLAN_NAME
  let planName = TEST_PLAN_NAME_UPDATED;
  if (await page.locator(".tbl tbody tr").filter({ hasText: TEST_PLAN_NAME_UPDATED }).count() === 0) {
    planName = TEST_PLAN_NAME;
  }

  let planRow = page.locator(".tbl tbody tr").filter({ hasText: planName });
  if (await planRow.count() === 0) {
    // Create a fresh one to delete
    await page.getByRole("button", { name: /add plan/i }).click();
    await expect(page.locator(".modal")).toBeVisible();
    const modalInputs = page.locator(".modal input.f-input, .modal input[type='text']");
    await modalInputs.nth(0).fill("SP99099");
    await modalInputs.nth(1).fill("E2E Delete Building");
    await modalInputs.nth(2).fill("99 Delete Street, Sydney NSW 2000");
    await page.locator(".modal").getByRole("button", { name: /save|add/i }).last().click();
    await page.getByText("E2E Delete Building").waitFor({ timeout: 5000 });
    // Wait for the modal overlay to fully close before continuing
    await expect(page.locator(".overlay")).not.toBeVisible({ timeout: 5000 });
    planName = "E2E Delete Building";
    planRow = page.locator(".tbl tbody tr").filter({ hasText: planName });
  }

  // Handle browser confirm dialog
  page.once("dialog", d => d.accept());
  await planRow.locator(".tbl-act-btn").filter({ hasText: /delete/i }).click();

  // Plan row should disappear
  await expect(page.getByText(planName)).not.toBeVisible({ timeout: 5000 });
});
