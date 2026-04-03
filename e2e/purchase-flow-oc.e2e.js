// e2e/purchase-flow-oc.e2e.js
// E2E tests for the OC Certificate purchase flow.
//
// NOTE (BUG — server.js): The POST /api/orders handler in server.js validates
// order.planId against the plan catalog, but the frontend does not include
// planId at the top level of the order object (it is only on each cart item).
// This causes the full order submission tests to fail with "A valid planId is
// required." when run against the local server.js (self-hosted path).
// The Vercel API path (api/orders/index.js) does not have this validation.
// Tests that submit an order are expected to fail until server.js is patched
// to derive planId from order.items[0].planId when not explicitly provided.
import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PDF = path.join(__dirname, "fixtures", "authority-doc.pdf");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Navigate to home and wait for the page to be ready. */
async function goHome(page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

/**
 * Complete step 1: search for "Harbour", select the plan, choose OC category.
 */
async function selectPlanAndOC(page) {
  await goHome(page);

  // Type in the search bar — search by plan ID (SP12345) to match any plan name
  await page.locator('.s1-search-bar input').fill("SP12345");

  // Plan card appears in results — click the first match (regardless of name)
  await page.locator('.plan-card').first().click();

  // The selected building card should now show
  await expect(page.locator(".bsel")).toBeVisible();

  // Choose "OC Certificates" category card
  await page.locator('.cat-card').filter({ hasText: "OC Certificates" }).click();

  // Continue to step 2
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 2 — plan heading should be visible (whatever the plan name is)
  await expect(page.locator(".pg-title")).toBeVisible();
}

/**
 * Complete step 2: fill lot, applicant details, upload authority doc, add a product.
 */
async function fillStep2(page, { lotNumber = "Lot 1", ownerName = "Test Owner" } = {}) {
  // Lot number input (placeholder "e.g. Lot 5")
  await page.locator('input[placeholder="e.g. Lot 5"]').fill(lotNumber);

  // Applicant type is "owner" by default; fill owner name
  await page.locator('input[placeholder="e.g. Jane Smith"]').fill(ownerName);

  // Upload authority doc
  const fileInput = page.locator('input[type="file"]');
  await fileInput.first().setInputFiles(FIXTURE_PDF);

  // Wait for the filename to appear
  await expect(page.getByText("authority-doc.pdf")).toBeVisible();

  // Add "OC Certificate — Standard" — click the Add button on its product card
  await page.getByText("OC Certificate — Standard").first().waitFor();
  // Find the Add button on the Standard product card
  const standardCard = page.locator(".prod-card").filter({ hasText: "OC Certificate — Standard" });
  await standardCard.locator(".add-btn").click();

  // Verify "Added" pill appears
  await expect(standardCard.locator(".added-pill")).toBeVisible();
}

/**
 * Fill contact details in step 4.
 * Inputs identified by placeholder text from App.jsx.
 */
async function fillContactDetails(page, {
  name = "Test User",
  email = "testuser@example.com",
  phone = "0412 345 678",
} = {}) {
  // Full Name placeholder is the owner's name pre-filled or "Jane Smith"
  await page.locator('input[placeholder="Jane Smith"], input.f-input[type="text"]').first().fill(name);
  await page.locator('input[placeholder="jane@example.com"]').fill(email);
  await page.locator('input[placeholder="0400 000 000"]').fill(phone);
}

// ─── Happy path: Bank Transfer ────────────────────────────────────────────────

test("OC purchase — bank transfer happy path", async ({ page }) => {
  await selectPlanAndOC(page);
  await fillStep2(page);

  // Click "Review Order (1)" button
  await page.getByRole("button", { name: /review order/i }).click();
  await expect(page.getByText("Review Order")).toBeVisible();

  // Verify at least one item appears in cart
  await expect(page.getByText("OC Certificate — Standard").first()).toBeVisible({ timeout: 5000 });

  // Enter Contact Details
  await page.getByRole("button", { name: /enter contact details/i }).click();
  await expect(page.getByText("Contact Details")).toBeVisible();

  await fillContactDetails(page);

  // Choose Payment
  await page.getByRole("button", { name: /choose payment/i }).click();
  await expect(page.getByRole("heading", { name: /payment/i })).toBeVisible();

  // Select "Direct Bank Transfer" (it may already be selected by default)
  await page.locator(".pay-method").filter({ hasText: /direct bank transfer/i }).click();

  // Bank details visible
  await expect(page.locator(".bank-box")).toBeVisible();

  // Confirm Order
  await page.getByRole("button", { name: /confirm order/i }).click();

  // Step 6 — confirmation: look for the order-code element
  await expect(page.locator(".order-code").first()).toBeVisible({ timeout: 15000 });

  // Order ID format TOCS-XXXXXXXX-XXX
  const orderId = await page.locator(".order-code").first().textContent();
  expect(orderId.trim()).toMatch(/TOCS-[A-Z0-9]+-[A-Z0-9]+/);

  // localStorage.tocs_last_order should be set
  const storedOrder = await page.evaluate(() => localStorage.getItem("tocs_last_order"));
  expect(storedOrder).not.toBeNull();
  const parsed = JSON.parse(storedOrder);
  expect(parsed.id).toMatch(/TOCS-/);
});

// ─── Happy path: PayID ────────────────────────────────────────────────────────

test("OC purchase — PayID payment", async ({ page }) => {
  await selectPlanAndOC(page);
  await fillStep2(page);

  await page.getByRole("button", { name: /review order/i }).click();
  await page.getByRole("button", { name: /enter contact details/i }).click();
  await fillContactDetails(page);
  await page.getByRole("button", { name: /choose payment/i }).click();

  // Select PayID option
  await page.locator(".pay-method").filter({ hasText: /payid/i }).click();

  await page.getByRole("button", { name: /confirm order/i }).click();
  await expect(page.locator(".order-code").first()).toBeVisible({ timeout: 15000 });
});

// ─── Validation: empty cart ───────────────────────────────────────────────────

test("OC purchase — cannot review with empty cart", async ({ page }) => {
  await selectPlanAndOC(page);

  // Fill lot and owner name, upload doc — but add NO products
  await page.locator('input[placeholder="e.g. Lot 5"]').fill("Lot 1");
  await page.locator('input[placeholder="e.g. Jane Smith"]').fill("Test Owner");
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(FIXTURE_PDF);

  // "Review Order (0)" button should be disabled when cart is empty
  const reviewBtn = page.getByRole("button", { name: /review order/i });
  await expect(reviewBtn).toBeDisabled();
});

// ─── Validation: owner name required ─────────────────────────────────────────

test("OC purchase — owner name validation", async ({ page }) => {
  await selectPlanAndOC(page);

  // Fill lot but skip owner name
  await page.locator('input[placeholder="e.g. Lot 5"]').fill("Lot 1");

  // Upload authority doc
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(FIXTURE_PDF);

  // Add product
  await page.getByText("OC Certificate — Standard").first().waitFor();
  await page.locator(".prod-card").filter({ hasText: "OC Certificate — Standard" }).locator(".add-btn").click();

  // Click Review — should show warning
  await page.getByRole("button", { name: /review order/i }).click();

  // Warning about owner name
  await expect(page.getByText(/owner name is required/i)).toBeVisible();
});

// ─── Validation: authority doc required ──────────────────────────────────────

test("OC purchase — authority doc validation", async ({ page }) => {
  await selectPlanAndOC(page);

  await page.locator('input[placeholder="e.g. Lot 5"]').fill("Lot 1");
  await page.locator('input[placeholder="e.g. Jane Smith"]').fill("Test Owner");

  // Add product WITHOUT uploading authority doc
  await page.getByText("OC Certificate — Standard").first().waitFor();
  await page.locator(".prod-card").filter({ hasText: "OC Certificate — Standard" }).locator(".add-btn").click();

  // Click Review — doc warning should appear
  await page.getByRole("button", { name: /review order/i }).click();

  // Warning about levy notice / authority doc
  await expect(page.getByText(/levy notice is required|authority document is required/i)).toBeVisible();
});

// ─── Validation: invalid email ────────────────────────────────────────────────

test("OC purchase — invalid email validation", async ({ page }) => {
  await selectPlanAndOC(page);
  await fillStep2(page);

  await page.getByRole("button", { name: /review order/i }).click();
  await page.getByRole("button", { name: /enter contact details/i }).click();

  // Fill name and phone with valid values, but enter invalid email
  await page.locator('input[placeholder="Jane Smith"], input.f-input[type="text"]').first().fill("Test User");
  await page.locator('input[placeholder="jane@example.com"]').fill("notanemail");
  // Trigger onBlur to activate validation (email validation fires on blur)
  await page.locator('input[placeholder="jane@example.com"]').blur();

  // Email validation error should be visible after blur
  await expect(page.getByText(/valid email/i)).toBeVisible();

  // "Choose Payment" button should be disabled with an invalid email
  const choosePaymentBtn = page.getByRole("button", { name: /choose payment/i });
  await expect(choosePaymentBtn).toBeDisabled();
});

// ─── Edit cart (back navigation) ──────────────────────────────────────────────

test("OC purchase — edit cart from review", async ({ page }) => {
  await selectPlanAndOC(page);
  await fillStep2(page);

  await page.getByRole("button", { name: /review order/i }).click();
  await expect(page.getByText("Review Order")).toBeVisible();

  // Click "Edit" (back to step 2)
  await page.getByRole("button", { name: /edit/i }).click();

  // Should be on step 2 with the product still showing as Added
  await expect(page.locator(".added-pill").first()).toBeVisible();
});

// ─── Cancel order (return to step 1) ─────────────────────────────────────────

test("OC purchase — cancel order from review", async ({ page }) => {
  await selectPlanAndOC(page);
  await fillStep2(page);

  await page.getByRole("button", { name: /review order/i }).click();

  // Click "Cancel" — red cancel button (has trash icon and "Cancel" text)
  await page.getByRole("button", { name: /cancel/i }).click();

  // Should be back at step 1 (the how-it-works grid is visible on step 1)
  // Note: the plan remains selected after cancel (app only clears cart, not plan selection)
  await expect(page.locator(".hiw-grid")).toBeVisible();
});

// ─── Cart total verification (multi-OC lot) ───────────────────────────────────

test("OC purchase — multi-OC lot pricing shows correct total", async ({ page }) => {
  await selectPlanAndOC(page);

  // Select Lot 4 (has OC-A and OC-B — both will be checked by default)
  await page.locator('input[placeholder="e.g. Lot 5"]').fill("Lot 4");
  await page.locator('input[placeholder="e.g. Jane Smith"]').fill("Test Owner");

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(FIXTURE_PDF);

  await page.getByText("OC Certificate — Standard").first().waitFor();

  // Add OC Certificate — Standard (perOC: true → 2 OCs = 2 cart items)
  await page.locator(".prod-card").filter({ hasText: "OC Certificate — Standard" }).locator(".add-btn").click();

  // Sticky cart footer should show 2 items
  await expect(page.locator(".sc-count")).toContainText("2");

  // Review
  await page.getByRole("button", { name: /review order/i }).click();

  // Total: $220 (first OC) + $150 (second OC) = $370
  await expect(page.locator(".cart-total-amt")).toContainText("370.00");
});
