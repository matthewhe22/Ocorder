// api/orders/index.test.js
// Regression tests for server-side total reconciliation on keys/fob orders.
//
// Bug: a 2× keys product order (e.g. 2× Garage Remote at $110 = $220) was
// rejected at submission with "Invalid total: expected $440.00 (received
// $220.00)". The cart stores `item.price` as the line total (unit × qty) and
// the frontend sums it that way; the handler then multiplied by qty AGAIN,
// double-counting quantity. These tests pin the corrected behaviour.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

// ── Module mocks (paths relative to this file) ──────────────────────────────
// readData/writeData are stubbed so the order "saves" without Redis; readConfig
// returns an empty smtp so the email block is skipped; SharePoint is disabled.
let writtenData = null;

vi.mock("../_lib/store.js", () => ({
  readData:           vi.fn(async () => ({ orders: [], strataPlans: [] })),
  writeData:          vi.fn(async (d) => { writtenData = d; }),
  readConfig:         vi.fn(async () => ({ smtp: {}, orderEmail: "orders@tocs.co", sharepoint: {} })),
  cors:               vi.fn(),
  writeAuthority:     vi.fn(async () => {}),
  writePiqPollStatus: vi.fn(async () => {}),
  readPiqPollStatus:  vi.fn(async () => null),
  rateLimit:          vi.fn(async () => ({ allowed: true })),
  clientIp:           vi.fn(() => "203.0.113.1"),
  validToken:         vi.fn(async () => true),
  KV_AVAILABLE:       false,
}));

vi.mock("../_lib/sharepoint.js", () => ({
  uploadToSharePoint: vi.fn(async () => null),
  SHAREPOINT_ENABLED: false,
  FOLDER_PATH:        "",
  sanitiseSegment:    vi.fn((s) => String(s || "")),
  pushAuditOnce:      vi.fn(),
}));

vi.mock("../_lib/pdf.js",   () => ({ generateOrderPdf: vi.fn(async () => Buffer.from("")) }));
vi.mock("../_lib/email.js", () => ({
  buildOrderEmailHtml:      vi.fn(() => "<html></html>"),
  buildCustomerEmailHtml:   vi.fn(() => "<html></html>"),
  buildPiqPaymentEmailHtml: vi.fn(() => "<html></html>"),
  createTransporter:        vi.fn(() => ({ sendMail: vi.fn(async () => ({})) })),
}));
vi.mock("../_lib/piq.js",       () => ({ detectPiqPayment: vi.fn(async () => null) }));
vi.mock("../_lib/constants.js", () => ({ normaliseLotNumber: vi.fn((s) => String(s || "")) }));
vi.mock("stripe", () => ({ default: vi.fn(() => ({})) }));

// Load the handler AFTER mocks are registered.
const { default: handler } = await import("./index.js");

// ── Helpers ─────────────────────────────────────────────────────────────────
function keysOrder({ qty, price, total }) {
  return {
    order: {
      orderCategory: "keys",
      payment:       "invoice",
      total,
      contactInfo:   { name: "Emma Henderson", email: "emma@example.com", phone: "0428914255" },
      items: [{
        productId:   "K3",
        productName: "Garage Remote",
        planId:      "SP1",
        planName:    "Harbour View",
        lotNumber:   "1",
        price,   // line total (unit × qty), as the cart stores it
        qty,
      }],
    },
  };
}

async function post(body) {
  const req = makeReq({ method: "POST", body });
  const res = makeRes();
  await handler(req, res);
  return res;
}

describe("POST /api/orders — keys total reconciliation", () => {
  beforeEach(() => { writtenData = null; });

  it("accepts a 2× keys order whose total equals the summed line totals ($220)", async () => {
    // 2× Garage Remote at $110 → line total $220 → order total $220.
    const res = await post(keysOrder({ qty: 2, price: 220, total: 220 }));

    expect(res._status).toBe(200);
    expect(res._body.ok).toBe(true);
    // Server-recomputed total must NOT double-count quantity.
    expect(res._body.order.total).toBe(220);
  });

  it("accepts a single-qty keys order ($110)", async () => {
    const res = await post(keysOrder({ qty: 1, price: 110, total: 110 }));

    expect(res._status).toBe(200);
    expect(res._body.order.total).toBe(110);
  });

  it("still rejects a tampered total that does not match the line items", async () => {
    // Client claims $100 for a $220 line total — must be rejected.
    const res = await post(keysOrder({ qty: 2, price: 220, total: 100 }));

    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/Invalid total: expected \$220\.00 \(received \$100\.00\)/);
  });
});
