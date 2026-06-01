// api/orders/[id]/amend-shipping.test.js
// Regression test: amending a keys order must NOT drop its shipping amount.
//
// Customer keys orders persist shipping as `selectedShipping.cost` (the field
// the PDF, emails, and customer summary all read). The amend handler used to
// read only `.price`, so amending a customer order computed shipping as $0,
// silently dropped it from the new total, and overwrote the stored `.cost`.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../../test/request-factory.js";

let storeData = null;
let written = null;

vi.mock("../../_lib/store.js", () => ({
  readData:        vi.fn(async () => structuredClone(storeData)),
  writeData:       vi.fn(async (d) => { written = d; }),
  readConfig:      vi.fn(async () => ({ smtp: {}, sharepoint: {} })), // no smtp → skip emails
  validToken:      vi.fn(async () => true),
  extractToken:    vi.fn(() => "valid-token"),
  cors:            vi.fn(),
  readAuthority:   vi.fn(async () => null),
  writeCertificate: vi.fn(async () => {}),
  readCertificate: vi.fn(async () => null),
  withOrderLock:   vi.fn(async (_id, fn) => fn()),
  rateLimit:       vi.fn(async () => ({ allowed: true })),
  clientIp:        vi.fn(() => "203.0.113.1"),
  KV_AVAILABLE:    false,
}));
vi.mock("../../_lib/sharepoint.js", () => ({
  uploadToSharePoint: vi.fn(async () => null),
  SHAREPOINT_ENABLED: false,
  isSharePointEnabled: vi.fn(() => false),
  uploadOrderDocs:    vi.fn(async () => ({})),
  sanitiseSegment:    vi.fn((s) => String(s || "")),
  pushAuditOnce:      vi.fn(),
}));
vi.mock("../../_lib/email.js", () => ({
  buildOrderEmailHtml:      vi.fn(() => "<html></html>"),
  buildCustomerEmailHtml:   vi.fn(() => "<html></html>"),
  buildPiqPaymentEmailHtml: vi.fn(() => "<html></html>"),
  createTransporter:        vi.fn(() => ({ sendMail: vi.fn(async () => ({})) })),
}));
vi.mock("../../_lib/pdf.js", () => ({
  generateOrderPdf:   vi.fn(async () => Buffer.from("")),
  generateReceiptPdf: vi.fn(async () => Buffer.from("")),
}));
vi.mock("../../_lib/piq.js", () => ({ detectPiqPayment: vi.fn(async () => null) }));
vi.mock("stripe", () => ({ default: vi.fn(() => ({})) }));
// NOTE: ../../_lib/constants.js is intentionally NOT mocked — we need the real
// AMENDABLE_STATUSES / VALID_STATUSES.

const { default: handler } = await import("./[action].js");

function seedKeysOrder() {
  storeData = {
    strataPlans: [],
    orders: [{
      id: "TOCS-AMEND-1",
      orderCategory: "keys",
      payment: "invoice",
      status: "Invoice to be issued",
      total: 115,
      contactInfo: { name: "Emma", email: "emma@example.com", phone: "1" },
      // Customer-shaped shipping: `.cost`, no `.price`.
      selectedShipping: { id: "std", name: "Standard Delivery", cost: 15, requiresAddress: true },
      items: [{ productId: "K3", productName: "Garage Remote", price: 100, qty: 1, planId: "SP1", planName: "Bldg", lotNumber: "1" }],
      auditLog: [],
    }],
  };
}

async function amend(body) {
  const req = makeReq({
    method: "PUT",
    query: { id: "TOCS-AMEND-1", action: "amend" },
    headers: { authorization: "Bearer valid-token" },
    body,
  });
  const res = makeRes();
  await handler(req, res);
  return res;
}

describe("PUT /api/orders/:id/amend — keys shipping preserved", () => {
  beforeEach(() => { seedKeysOrder(); written = null; });

  it("keeps the shipping cost in the new total and stored order (cost-shaped shipping)", async () => {
    // Re-send the same item + the stored cost-shaped shipping object.
    const res = await amend({
      items: [{ productId: "K3", productName: "Garage Remote", price: 100, qty: 1, planId: "SP1", planName: "Bldg", lotNumber: "1" }],
      selectedShipping: { id: "std", name: "Standard Delivery", cost: 15, requiresAddress: true },
    });

    expect(res._status).toBe(200);
    // Items $100 + shipping $15 = $115 — shipping must NOT be dropped.
    expect(res._body.order.total).toBe(115);
    // Shipping amount preserved and written under the canonical `.cost`
    // (plus `.price` for legacy/admin consumers).
    expect(res._body.order.selectedShipping.cost).toBe(15);
    expect(res._body.order.selectedShipping.price).toBe(15);
  });

  it("recomputes the total when quantity changes, still including shipping", async () => {
    // Bump qty to 2 → line total $200 + $15 shipping = $215.
    const res = await amend({
      items: [{ productId: "K3", productName: "Garage Remote", price: 200, qty: 2, planId: "SP1", planName: "Bldg", lotNumber: "1" }],
      selectedShipping: { id: "std", name: "Standard Delivery", cost: 15, requiresAddress: true },
    });

    expect(res._status).toBe(200);
    expect(res._body.order.total).toBe(215);
    expect(res._body.order.selectedShipping.cost).toBe(15);
  });
});
