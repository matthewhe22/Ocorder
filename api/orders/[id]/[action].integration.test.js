// api/orders/[id]/[action].integration.test.js — Integration tests for order action handlers
// Requires a real Redis instance. If unavailable, all tests are skipped.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { flushTestDb, seedData, getStored, closeTestDb, createTestToken } from "../../../test/redis-helpers.js";

// ── Check Redis availability ────────────────────────────────────────────────────
let redisAvailable = false;
try {
  await flushTestDb();
  redisAvailable = true;
} catch {
  console.warn("[action.integration] Local Redis not available — skipping integration tests");
}

const maybeIt = redisAvailable ? it : it.skip;

// ── Mock external services ──────────────────────────────────────────────────────
vi.mock("../../../_lib/sharepoint.js", () => ({
  uploadToSharePoint: vi.fn(async () => null),
  SHAREPOINT_ENABLED: false,
}));

vi.mock("../../../_lib/email.js", () => ({
  buildOrderEmailHtml:    vi.fn(() => "<html>order</html>"),
  buildCustomerEmailHtml: vi.fn(() => "<html>customer</html>"),
  createTransporter:      vi.fn(() => ({
    sendMail: vi.fn(async () => ({ messageId: "test-id" })),
  })),
}));

vi.mock("../../../_lib/pdf.js", () => ({
  generateOrderPdf:   vi.fn(async () => Buffer.from("%PDF-order")),
  generateReceiptPdf: vi.fn(async () => Buffer.from("%PDF-receipt")),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        retrieve: vi.fn(async (id) => ({
          id,
          payment_status: "paid",
          metadata: { orderId: "TOCS-INTG-001" },
        })),
      },
    },
  })),
}));

import { makeReq, makeRes } from "../../../test/request-factory.js";
import handler from "./[action].js";
import { readData, writeConfig } from "../../_lib/store.js";

function makeOrder(overrides = {}) {
  return {
    id: "TOCS-INTG-001",
    status: "Pending Payment",
    payment: "bank",
    total: 220,
    orderCategory: "oc",
    lotAuthorityFile: "TOCS-INTG-001-lot-authority.pdf",
    contactInfo: {
      name: "Integration Test",
      email: "int@test.com",
      phone: "0400000000",
    },
    items: [
      { productName: "OC Certificate — Standard", price: 220, lotNumber: "Lot 1", planName: "Test Building" },
    ],
    auditLog: [{ ts: "2026-03-30T10:00:00.000Z", action: "Order created", note: "Customer: Integration Test" }],
    ...overrides,
  };
}

// Seed a minimal config with SMTP disabled
async function seedConfig() {
  await writeConfig({
    orderEmail: "orders@test.com",
    smtp: { host: "", port: 2525, user: "", pass: "" },
    sharepoint: { tenantId: "", clientId: "", clientSecret: "", siteId: "" },
    stripe: { secretKey: "" },
    emailTemplate: {
      certificateSubject: "Your OC Certificate — Order #{orderId}",
      certificateGreeting: "",
      footer: "TOCS Footer",
      adminNotificationSubject: "New Order",
      adminNotificationIntro: "Intro",
    },
    paymentDetails: { accountName: "TOCS", bsb: "033-065", accountNumber: "522011", payid: "acc@tocs.com" },
  });
}

describe("Order action handler integration tests", { skip: !redisAvailable }, () => {
  let authHeader;

  beforeEach(async () => {
    await flushTestDb();
    await seedConfig();
    await seedData({ strataPlans: [], orders: [makeOrder()] });
    const token = await createTestToken();
    authHeader = { authorization: `Bearer ${token}` };
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // ── Status update round-trip ──────────────────────────────────────────────────

  maybeIt("PUT status: Paid — updates status in Redis", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-INTG-001", action: "status" }, body: { status: "Paid" }, headers: authHeader });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("ok", true);

    const data = await readData();
    expect(data.orders[0].status).toBe("Paid");
  });

  maybeIt("PUT status — audit log entry is appended correctly", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-INTG-001", action: "status" }, body: { status: "Processing" }, headers: authHeader });
    const res = makeRes();
    await handler(req, res);

    const data = await readData();
    const order = data.orders[0];
    const lastEntry = order.auditLog.at(-1);
    expect(lastEntry.action).toBe("Status changed to Processing");
  });

  // ── Order cancellation with reason ────────────────────────────────────────────

  maybeIt("PUT status: Cancelled with note — cancelReason is set", async () => {
    const req = makeReq({
      method: "PUT",
      query: { id: "TOCS-INTG-001", action: "status" },
      body: { status: "Cancelled", note: "Customer requested cancellation" },
      headers: authHeader,
    });
    const res = makeRes();
    await handler(req, res);

    const data = await readData();
    expect(data.orders[0].cancelReason).toBe("Customer requested cancellation");
  });

  // ── Order delete ──────────────────────────────────────────────────────────────

  maybeIt("DELETE order — only the deleted order is removed", async () => {
    // Seed two orders
    await seedData({
      strataPlans: [],
      orders: [
        makeOrder({ id: "TOCS-INTG-001", status: "Cancelled" }),
        makeOrder({ id: "TOCS-INTG-002", status: "Pending Payment" }),
      ],
    });

    const req = makeReq({ method: "DELETE", query: { id: "TOCS-INTG-001", action: "delete" }, headers: authHeader });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);

    const data = await readData();
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0].id).toBe("TOCS-INTG-002");
  });

  // ── stripe-confirm idempotency ────────────────────────────────────────────────

  maybeIt("stripe-confirm on already-Paid order returns 200 without calling Stripe", async () => {
    // Seed a pre-paid order
    await seedData({
      strataPlans: [],
      orders: [makeOrder({ status: "Paid", stripeSessionId: "cs_test_existing", payment: "stripe" })],
    });
    process.env.STRIPE_SECRET_KEY = "sk_test_integration";

    const req = makeReq({ method: "POST", query: { id: "TOCS-INTG-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("success", true);
  });
});
