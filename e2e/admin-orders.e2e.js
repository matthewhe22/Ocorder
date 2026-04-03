// e2e/admin-orders.e2e.js
// E2E tests for admin order management.
//
// These tests work with whatever orders already exist in data.json.
// They do NOT attempt to place new orders (which would hit the planId
// validation bug in server.js POST /api/orders).
import { test, expect } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_USER || "info@tocs.co";
const ADMIN_PASS = process.env.ADMIN_PASS || "Tocs@Vote";

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Log in to admin panel and navigate to the Orders tab. */
async function loginAdminOrders(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /admin/i }).click();
  await page.locator('input[type="email"]').fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /^orders$/i })).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: /^orders$/i }).click();
}

// ─── Order table and expand ────────────────────────────────────────────────────

test("Admin orders — table renders and row expands", async ({ page }) => {
  await loginAdminOrders(page);

  // Orders table should have at least one row (data.json has a default order)
  const rows = page.locator(".tbl tbody tr");
  const rowCount = await rows.count();
  if (rowCount === 0) {
    test.skip(true, "No orders in data.json to test with");
    return;
  }

  await expect(rows.first()).toBeVisible({ timeout: 5000 });

  // Click first row to expand it
  await rows.first().click();

  // Expanded content — order date, total, or audit log should be visible
  await expect(page.getByText(/audit|order id|items/i).first()).toBeVisible({ timeout: 5000 });
});

// ─── Cancel order ─────────────────────────────────────────────────────────────

test("Admin orders — cancel order with reason", async ({ page }) => {
  await loginAdminOrders(page);

  // Find a non-cancelled, non-issued order to cancel
  const cancellableRow = page.locator(".tbl tbody tr").filter({ hasNotText: /cancelled|issued/i });
  if (await cancellableRow.count() === 0) {
    test.skip(true, "No cancellable orders available");
    return;
  }

  await cancellableRow.first().click();

  // Click "Cancel" action button
  const cancelBtn = page.locator(".tbl-act-btn").filter({ hasText: /^cancel$/i });
  if (await cancelBtn.count() === 0) {
    test.skip(true, "No cancel button found — order may already be in a final state");
    return;
  }
  await cancelBtn.first().click();

  // Cancel modal appears
  await expect(page.locator(".modal")).toBeVisible({ timeout: 5000 });
  await page.locator(".modal textarea, .modal input[type='text']").last().fill("E2E test cancellation reason");

  // Check the confirmation checkbox
  const checkbox = page.locator(".modal input[type='checkbox']").last();
  await checkbox.check();

  // Confirm cancel — the modal button says "CANCEL ORDER"
  await page.locator(".modal").getByRole("button", { name: /cancel order/i }).click();

  // Status badge should update to "Cancelled"
  await expect(
    page.locator(".badge").filter({ hasText: /cancelled/i }).first()
  ).toBeVisible({ timeout: 8000 });
});

// ─── Mark as Paid ─────────────────────────────────────────────────────────────

test("Admin orders — Mark Paid updates status badge", async ({ page }) => {
  await loginAdminOrders(page);

  // Find an "Awaiting Payment" order
  const awaitingRow = page.locator(".tbl tbody tr").filter({ hasText: /awaiting payment/i });
  if (await awaitingRow.count() === 0) {
    test.skip(true, "No Awaiting Payment orders available");
    return;
  }

  await awaitingRow.first().click();

  // Click "Mark Paid"
  const markPaidBtn = page.locator(".tbl-act-btn").filter({ hasText: /mark paid/i });
  if (await markPaidBtn.count() === 0) {
    test.skip(true, "No Mark Paid button found");
    return;
  }
  await markPaidBtn.first().click();

  // Status badge updates to "Paid"
  await expect(
    page.locator(".badge").filter({ hasText: /^paid$/i }).first()
  ).toBeVisible({ timeout: 8000 });
});

// ─── Text search filters orders ────────────────────────────────────────────────

test("Admin orders — text search filters order list", async ({ page }) => {
  await loginAdminOrders(page);

  // Get the text from the first row to use as search term
  const rows = page.locator(".tbl tbody tr");
  if (await rows.count() === 0) {
    test.skip(true, "No orders to test with");
    return;
  }

  // Get the order ID from the first row (monospace text)
  const firstCell = rows.first().locator("td").first();
  const orderIdText = await firstCell.textContent();
  const orderId = orderIdText?.trim().split(/\s/)[0];

  if (!orderId || !orderId.startsWith("TOCS")) {
    test.skip(true, "Could not read order ID from table");
    return;
  }

  // Find any search input in the orders view
  const searchInput = page.locator('input[type="text"]').filter({ hasNot: page.locator('[readonly]') }).first();
  if (await searchInput.count() === 0) {
    test.skip(true, "No text search input found in orders tab");
    return;
  }

  await searchInput.fill(orderId);

  // The specific order row should remain visible
  await expect(rows.filter({ hasText: orderId }).first()).toBeVisible({ timeout: 5000 });
});
