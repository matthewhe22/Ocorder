// api/orders/oc-pricing.test.js
// Regression tests: the "secondary OC" volume discount is derived SERVER-SIDE
// and never trusted from the client. Per perOC product the first line is the
// primary rate and each additional line the secondaryPrice, regardless of the
// client's `isSecondaryOC` flag — so a crafted request can't claim the discount
// on a primary OC to under-pay.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

const PLAN = {
  id: "SP1",
  name: "Harbour View",
  active: true,
  ownerCorps: { "OC-A": { name: "OC A" }, "OC-B": { name: "OC B" } },
  products: [{ id: "P1", name: "OC Certificate", price: 220, secondaryPrice: 150, perOC: true, category: "oc" }],
};

vi.mock("../_lib/store.js", () => ({
  readData:           vi.fn(async () => ({ orders: [], strataPlans: [structuredClone(PLAN)] })),
  writeData:          vi.fn(async () => {}),
  readConfig:         vi.fn(async () => ({ smtp: {}, orderEmail: "orders@tocs.co", sharepoint: {} })),
  cors:               vi.fn(),
  writeAuthority:     vi.fn(async () => {}),
  writePiqPollStatus: vi.fn(async () => {}),
  readPiqPollStatus:  vi.fn(async () => null),
  rateLimit:          vi.fn(async () => ({ allowed: true })),
  clientIp:           vi.fn(() => "203.0.113.2"),
  withOrderLock:      vi.fn(async (_id, fn) => fn()),
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

const { default: handler } = await import("./index.js");

function ocOrder({ lines, total }) {
  return {
    order: {
      orderCategory: "oc",
      payment:       "bank",
      total,
      contactInfo:   { name: "Emma", email: "emma@example.com", phone: "1" },
      items: lines.map(l => ({
        productId: "P1", productName: "OC Certificate", planId: "SP1", planName: "Harbour View",
        lotNumber: "1", ocId: l.ocId, ocName: l.ocId, price: l.price, qty: 1,
        ...(l.isSecondaryOC !== undefined ? { isSecondaryOC: l.isSecondaryOC } : {}),
      })),
    },
  };
}

async function post(body) {
  const res = makeRes();
  await handler(makeReq({ method: "POST", body }), res);
  return res;
}

describe("POST /api/orders — OC secondary pricing derived server-side", () => {
  beforeEach(() => {});

  it("accepts 2 OCs priced primary + secondary ($220 + $150 = $370)", async () => {
    const res = await post(ocOrder({
      lines: [
        { ocId: "OC-A", price: 220, isSecondaryOC: false },
        { ocId: "OC-B", price: 150, isSecondaryOC: true },
      ],
      total: 370,
    }));
    expect(res._status).toBe(200);
    expect(res._body.order.total).toBe(370);
  });

  it("accepts a single OC at the primary rate ($220)", async () => {
    const res = await post(ocOrder({ lines: [{ ocId: "OC-A", price: 220 }], total: 220 }));
    expect(res._status).toBe(200);
    expect(res._body.order.total).toBe(220);
  });

  it("rejects a single OC that claims the secondary discount ($150)", async () => {
    // Crafted: lone OC line flagged secondary. Server charges primary → mismatch.
    const res = await post(ocOrder({
      lines: [{ ocId: "OC-A", price: 150, isSecondaryOC: true }],
      total: 150,
    }));
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/Invalid total: expected \$220\.00 \(received \$150\.00\)/);
  });

  it("rejects an order where BOTH OC lines claim the secondary rate (under-pay attempt)", async () => {
    // 2 × $150 = $300 claimed; server derives $220 + $150 = $370.
    const res = await post(ocOrder({
      lines: [
        { ocId: "OC-A", price: 150, isSecondaryOC: true },
        { ocId: "OC-B", price: 150, isSecondaryOC: true },
      ],
      total: 300,
    }));
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/Invalid total: expected \$370\.00 \(received \$300\.00\)/);
  });

  it("rejects a line whose price is neither the primary nor the secondary catalog rate", async () => {
    const res = await post(ocOrder({ lines: [{ ocId: "OC-A", price: 50 }], total: 50 }));
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/P1 must be \$220\.00 or \$150\.00 \(received \$50\.00\)/);
  });
});
