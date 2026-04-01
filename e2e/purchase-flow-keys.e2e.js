// e2e/purchase-flow-keys.e2e.js
// E2E tests for the Keys / Fobs / Remotes purchase flow.
//
// These tests require a plan that has at least one product with category "keys".
// If no keys products exist, the tests log a skip and pass gracefully.
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PDF = path.join(__dirname, "fixtures", "authority-doc.pdf");

const ADMIN_USER = process.env.ADMIN_USER || "info@tocs.co";
const ADMIN_PASS = process.env.ADMIN_PASS || "Tocs@Vote";

// ─── Data setup ───────────────────────────────────────────────────────────────

/**
 * Ensure the first active plan has at least one "keys" product.
 * Returns the name of the keys product to use in tests, or null if unavailable.
 *
 * Strategy:
 *   1. If a product named "E2E Building Entry Key" exists, use it.
 *   2. If any keys product exists, use it (return its name).
 *   3. Try to add "E2E Building Entry Key" via the admin API.
 *   4. If the add fails (e.g. Redis unavailable), return null.
 */
async function ensureKeysProduct(page) {
  // Log in to get admin token
  const loginResp = await page.request.post("/api/auth", {
    data: { action: "login", user: ADMIN_USER, pass: ADMIN_PASS },
  });
  if (!loginResp.ok()) return null;
  const { token } = await loginResp.json();

  // Get current data
  const dataResp = await page.request.get("/api/data", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!dataResp.ok()) return null;
  const data = await dataResp.json();

  const plan = data.strataPlans?.find(p => p.active);
  if (!plan) return null;

  // If the specific E2E product already exists, use it
  const e2eProduct = plan.products?.find(p => p.category === "keys" && p.name === "E2E Building Entry Key");
  if (e2eProduct) return "E2E Building Entry Key";

  // If any keys product exists, use the first one's name
  const existingKeys = plan.products?.find(p => p.category === "keys");
  if (existingKeys) return existingKeys.name;

  // No keys product — try to add one via the admin API
  const newProduct = {
    id: "K_E2E_1",
    name: "E2E Building Entry Key",
    description: "Test key for E2E",
    price: 0,
    turnaround: "2-3 business days",
    perOC: false,
    category: "keys",
  };
  const updatedPlan = { ...plan, products: [...(plan.products || []), newProduct] };
  const updatedPlans = data.strataPlans.map(p => p.id === plan.id ? updatedPlan : p);

  const saveResp = await page.request.post("/api/plans", {
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    data: { plans: updatedPlans },
  });
  return saveResp.ok() ? "E2E Building Entry Key" : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goHome(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

/** Select a plan and the Keys/Fobs category, then continue to step 2. */
async function selectPlanAndKeys(page) {
  await goHome(page);

  await page.locator('.s1-search-bar input').fill("SP12345");
  await page.locator('.plan-card').first().click();
  await expect(page.locator(".bsel")).toBeVisible();

  await page.locator('.cat-card').filter({ hasText: "Keys / Fobs / Remotes" }).click();
  await page.getByRole("button", { name: /continue/i }).click();
}

/** Fill step 2 for a keys order: lot, owner name, doc, add a product. */
async function fillKeysStep2(page, { lotNumber = "Lot 1", productName = "E2E Building Entry Key" } = {}) {
  await page.locator('input[placeholder="e.g. Lot 5"]').fill(lotNumber);
  await page.locator('input[placeholder="e.g. Jane Smith"]').fill("Test Owner");

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(FIXTURE_PDF);
  await expect(page.getByText("authority-doc.pdf")).toBeVisible();

  // Add the keys product
  await page.getByText(productName, { exact: false }).first().waitFor({ timeout: 5000 });
  await page.locator(".prod-card").filter({ hasText: productName }).locator(".add-btn").click();
}

/** Fill contact details in step 4. */
async function fillContact(page, {
  name = "Test User",
  email = "testkeys@example.com",
  phone = "0498 765 432",
} = {}) {
  await page.locator('input[placeholder="Jane Smith"], input.f-input[type="text"]').first().fill(name);
  await page.locator('input[placeholder="jane@example.com"]').fill(email);
  await page.locator('input[placeholder="0400 000 000"]').fill(phone);
}

// ─── Happy path: Keys order (pickup) ─────────────────────────────────────────

test("Keys purchase — pick up from BM", async ({ page }) => {
  const productName = await ensureKeysProduct(page);
  if (!productName) {
    test.skip(true, "Could not set up keys product for test");
    return;
  }

  await selectPlanAndKeys(page);
  await fillKeysStep2(page, { productName });

  await page.getByRole("button", { name: /review order/i }).click();
  await expect(page.getByText("Review Order")).toBeVisible();

  await page.getByRole("button", { name: /enter contact details/i }).click();
  await fillContact(page);

  // Keys orders use "Submit Order" directly (no step 5)
  await page.getByRole("button", { name: /submit order/i }).click();
  await expect(page.locator(".order-code").first()).toBeVisible({ timeout: 15000 });
});

// ─── Happy path: Keys with increased quantity ─────────────────────────────────

test("Keys purchase — increase quantity to 2", async ({ page }) => {
  const productName = await ensureKeysProduct(page);
  if (!productName) {
    test.skip(true, "Could not set up keys product for test");
    return;
  }

  await selectPlanAndKeys(page);
  await fillKeysStep2(page, { productName });

  // Increase qty to 2 by clicking the + button
  await page.locator(".prod-card").filter({ hasText: productName }).locator("button").filter({ hasText: "+" }).click();

  await page.getByRole("button", { name: /review order/i }).click();
  await page.getByRole("button", { name: /enter contact details/i }).click();
  await fillContact(page);
  await page.getByRole("button", { name: /submit order/i }).click();
  await expect(page.locator(".order-code").first()).toBeVisible({ timeout: 15000 });
});

// ─── Validation: Submit disabled without contact fields ───────────────────────

test("Keys purchase — submit disabled with empty contact form", async ({ page }) => {
  const productName = await ensureKeysProduct(page);
  if (!productName) {
    test.skip(true, "Could not set up keys product for test");
    return;
  }

  await selectPlanAndKeys(page);
  await fillKeysStep2(page, { productName });

  await page.getByRole("button", { name: /review order/i }).click();
  await page.getByRole("button", { name: /enter contact details/i }).click();

  // Submit button should be disabled when contact form is empty
  const submitBtn = page.getByRole("button", { name: /submit order/i });
  await expect(submitBtn).toBeDisabled();
});

// ─── Place Another Order resets flow ─────────────────────────────────────────

test("Keys purchase — Place Another Order resets to step 1", async ({ page }) => {
  const productName = await ensureKeysProduct(page);
  if (!productName) {
    test.skip(true, "Could not set up keys product for test");
    return;
  }

  await selectPlanAndKeys(page);
  await fillKeysStep2(page, { productName });
  await page.getByRole("button", { name: /review order/i }).click();
  await page.getByRole("button", { name: /enter contact details/i }).click();
  await fillContact(page);
  await page.getByRole("button", { name: /submit order/i }).click();
  await expect(page.locator(".order-code").first()).toBeVisible({ timeout: 15000 });

  // Click Place Another Order
  await page.getByRole("button", { name: /place another order/i }).click();
  await expect(page.locator('.s1-search-bar input')).toBeVisible();
});
