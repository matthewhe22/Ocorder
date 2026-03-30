// api/orders/index.integration.test.js — Integration tests for POST /api/orders
// Requires a real Redis instance. If unavailable, all tests are skipped.
//
// Mock scope: Stripe API and nodemailer are mocked; Redis is real.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { flushTestDb, closeTestDb } from "../../test/redis-helpers.js";

// ── Check Redis availability ────────────────────────────────────────────────────
let redisAvailable = false;
try {
  await flushTestDb();
  redisAvailable = true;
} catch {
  console.warn("[orders.index.integration] Local Redis not available — skipping integration tests");
}

const maybeIt = redisAvailable ? it : it.skip;

// ── Mock external services ──────────────────────────────────────────────────────
vi.mock("../../_lib/sharepoint.js", () => ({
  uploadToSharePoint: vi.fn(async () => null),
  SHAREPOINT_ENABLED: false,
  FOLDER_PATH:        "Test/Folder",
}));

vi.mock("../../_lib/pdf.js", () => ({
  generateOrderPdf: vi.fn(async () => Buffer.from("%PDF-test")),
}));

vi.mock("../../_lib/email.js", () => ({
  buildOrderEmailHtml:    vi.fn(() => "<html>order</html>"),
  buildCustomerEmailHtml: vi.fn(() => "<html>customer</html>"),
  createTransporter:      vi.fn(() => ({
    sendMail: vi.fn(async () => ({ messageId: "test-id" })),
  })),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: vi.fn(async (params) => ({
          id: "cs_test_integration",
          url: "https://checkout.stripe.com/test",
          metadata: params.metadata || {},
        })),
      },
    },
  })),
}));

import { makeReq, makeRes } from "../../test/request-factory.js";

async function importHandler() {
  vi.resetModules();
  const mod = await import("./index.js");
  return mod.default;
}

async function importStore() {
  vi.resetModules();
  return await import("../_lib/store.js");
}

describe("POST /api/orders integration tests", { skip: !redisAvailable }, () => {
  beforeEach(async () => {
    await flushTestDb();
    // Seed a minimal config with SMTP disabled so emails don't interfere
    const { writeConfig } = await importStore();
    await writeConfig({
      orderEmail: "orders@test.com",
      smtp: { host: "", port: 2525, user: "", pass: "" },
      sharepoint: { tenantId: "", clientId: "", clientSecret: "", siteId: "" },
      stripe: { secretKey: "" },
      emailTemplate: { adminNotificationSubject: "New Order #{orderId}", adminNotificationIntro: "Intro" },
    });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // ── Full non-Stripe order placement flow ─────────────────────────────────────

  maybeIt("POST a valid bank order — order appears in readData().orders[0]", async () => {
    const handler = await importHandler();
    const req = makeReq({
      method: "POST",
      body: {
        order: {
          payment: "bank",
          total: 220,
          orderCategory: "oc",
          contactInfo: { name: "Integration Test", email: "int@test.com", phone: "0400000000" },
          items: [{ productName: "OC Certificate", price: 220, lotNumber: "Lot 1", planName: "Test Building" }],
        },
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("ok", true);

    const { readData } = await importStore();
    const data = await readData();
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0].payment).toBe("bank");
    expect(data.orders[0].status).toBe("Pending Payment");
  });

  maybeIt("order.auditLog contains the 'Order created' entry", async () => {
    const handler = await importHandler();
    const req = makeReq({
      method: "POST",
      body: {
        order: {
          payment: "bank",
          total: 220,
          orderCategory: "oc",
          contactInfo: { name: "Test User", email: "test@test.com", phone: "0400000000" },
          items: [{ productName: "OC Certificate", price: 220, lotNumber: "Lot 1", planName: "Building" }],
        },
      },
    });
    const res = makeRes();
    await handler(req, res);
    const { readData } = await importStore();
    const data = await readData();
    const order = data.orders[0];
    expect(order.auditLog[0].action).toBe("Order created");
    expect(order.auditLog[0].note).toContain("Test User");
  });

  maybeIt("authority doc saved to Redis when lotAuthority.data is present", async () => {
    const handler = await importHandler();
    const req = makeReq({
      method: "POST",
      body: {
        order: {
          payment: "bank",
          total: 220,
          orderCategory: "oc",
          contactInfo: { name: "Test User", email: "test@test.com", phone: "0400000000" },
          items: [{ productName: "OC Certificate", price: 220, lotNumber: "Lot 1", planName: "Building" }],
        },
        lotAuthority: {
          data: Buffer.from("PDF content").toString("base64"),
          filename: "authority.pdf",
          contentType: "application/pdf",
        },
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);

    const { readData, readAuthority } = await importStore();
    const data = await readData();
    const orderId = data.orders[0].id;
    const stored = await readAuthority(orderId);
    expect(stored).not.toBeNull();
    expect(stored.filename).toBe("authority.pdf");
  });

  // ── Full Stripe order placement flow ──────────────────────────────────────────

  maybeIt("Stripe order — saved with stripeSessionId and returns { id, redirect }", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_integration";
    const handler = await importHandler();
    const req = makeReq({
      method: "POST",
      body: {
        order: {
          payment: "stripe",
          total: 220,
          orderCategory: "oc",
          contactInfo: { name: "Stripe Test", email: "stripe@test.com", phone: "0400000000" },
          items: [{ productName: "OC Certificate", price: 220, lotNumber: "Lot 1", planName: "Building" }],
        },
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("id");
    expect(res._body).toHaveProperty("redirect");

    const { readData } = await importStore();
    const data = await readData();
    expect(data.orders[0].stripeSessionId).toBe("cs_test_integration");
  });
});
