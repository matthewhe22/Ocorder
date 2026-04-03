// api/orders/index.test.js — Unit tests for POST /api/orders
//
// GAP-SEC-5: Order ID is now generated server-side (CRIT-1 fix). Tests verify this.
// GAP-GAP-6: Server derives order status from payment method (CRIT-2 fix). Tests verify this.
// GAP-GAP-5: SP upload failure does not block the HTTP response. Tests verify this.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

vi.mock("../_lib/store.js", () => ({
  readData:       vi.fn(),
  writeData:      vi.fn(),
  readConfig:     vi.fn(),
  writeAuthority: vi.fn(),
  cors:           vi.fn(),
  KV_AVAILABLE:   true,
}));

vi.mock("../_lib/sharepoint.js", () => ({
  uploadToSharePoint: vi.fn(async () => null),
  SHAREPOINT_ENABLED: false,
  FOLDER_PATH:        "Test/Folder",
}));

vi.mock("../_lib/pdf.js", () => ({
  generateOrderPdf: vi.fn(async () => Buffer.from("%PDF-test")),
}));

vi.mock("../_lib/email.js", () => ({
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
          id: "cs_test_123",
          url: "https://checkout.stripe.com/test",
          metadata: params.metadata || {},
        })),
      },
    },
  })),
}));

import handler from "./index.js";
import * as store from "../_lib/store.js";
import * as spLib from "../_lib/sharepoint.js";
import * as emailLib from "../_lib/email.js";
import Stripe from "stripe";

const DEFAULT_CONFIG = {
  orderEmail: "orders@tocs.co",
  smtp: { host: "smtp.test.com", port: 2525, user: "smtpuser", pass: "smtppass" },
  sharepoint: { tenantId: "", clientId: "", clientSecret: "", siteId: "" },
  stripe: { secretKey: "" },
  emailTemplate: {
    adminNotificationSubject: "New Order — {orderType} #{orderId} — {total}",
    adminNotificationIntro: "A new order has been placed.",
  },
};

function makeOrderBody(overrides = {}) {
  return {
    order: {
      payment: "bank",
      total: 220,
      orderCategory: "oc",
      contactInfo: {
        name: "Jane Smith",
        email: "jane@example.com",
        phone: "0412 345 678",
        applicantType: "owner",
      },
      items: [
        { productName: "OC Certificate — Standard", price: 220, lotNumber: "Lot 1", planName: "Test Building" },
      ],
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.readConfig.mockResolvedValue({ ...DEFAULT_CONFIG });
  store.readData.mockResolvedValue({ strataPlans: [], orders: [] });
  store.writeData.mockResolvedValue();
  store.writeAuthority.mockResolvedValue();
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
});

describe("POST /api/orders", () => {
  // --- Method guards ---

  it("returns 405 for non-POST methods", async () => {
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  // --- Input validation ---

  it("returns 400 when items is not an array", async () => {
    const req = makeReq({ method: "POST", body: { order: { items: "not-array", payment: "bank", total: 100, contactInfo: { email: "a@b.com" } } } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when items is empty", async () => {
    const req = makeReq({ method: "POST", body: { order: { items: [], payment: "bank", total: 100, contactInfo: { email: "a@b.com" } } } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when payment is missing", async () => {
    const req = makeReq({ method: "POST", body: { order: { items: [{ productName: "OC", price: 100 }], total: 100, contactInfo: { email: "a@b.com" } } } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when contact email is missing", async () => {
    const req = makeReq({ method: "POST", body: { order: { items: [{ productName: "OC", price: 100 }], payment: "bank", total: 100, contactInfo: {} } } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when contact email is invalid", async () => {
    const req = makeReq({ method: "POST", body: { order: { items: [{ productName: "OC", price: 100 }], payment: "bank", total: 100, contactInfo: { email: "notanemail" } } } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when payment is invalid method", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody({ payment: "bitcoin" }) });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when stripe is not configured and payment is stripe", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CONFIG, stripe: { secretKey: "" } });
    delete process.env.STRIPE_SECRET_KEY;
    const req = makeReq({ method: "POST", body: makeOrderBody({ payment: "stripe", total: 220 }) });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when stripe payment with total <= 0", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody({ payment: "stripe", total: 0 }) });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  // --- Happy path (non-Stripe) ---

  it("returns 200 { ok: true, order, emailSentTo } for a valid bank order", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody() });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("ok", true);
    expect(res._body).toHaveProperty("order");
    expect(res._body).toHaveProperty("emailSentTo");
  });

  it("saves order to Redis via writeData", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody() });
    const res = makeRes();
    await handler(req, res);
    expect(store.writeData).toHaveBeenCalled();
    const savedData = store.writeData.mock.calls[0][0];
    expect(savedData.orders).toHaveLength(1);
  });

  it("sets order.auditLog[0] with action 'Order created' and customer name", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody() });
    const res = makeRes();
    await handler(req, res);
    const order = res._body.order;
    expect(order.auditLog[0].action).toBe("Order created");
    expect(order.auditLog[0].note).toContain("Jane Smith");
  });

  it("server generates order ID (CRIT-1 — client-supplied ID is ignored)", async () => {
    // SEC-5: Server generates ID, ignoring any client-supplied ID
    const req = makeReq({ method: "POST", body: makeOrderBody({ id: "CLIENT-SUPPLIED-ID" }) });
    const res = makeRes();
    await handler(req, res);
    const order = res._body.order;
    // Server-generated ID starts with TOCS-
    expect(order.id).toMatch(/^TOCS-/);
    // Must NOT use the client-supplied value
    expect(order.id).not.toBe("CLIENT-SUPPLIED-ID");
  });

  it("sets order.lotAuthorityFile from body.lotAuthority.filename when present", async () => {
    const req = makeReq({
      method: "POST",
      body: {
        ...makeOrderBody(),
        lotAuthority: { data: Buffer.from("pdf").toString("base64"), filename: "authority.pdf", contentType: "application/pdf" },
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.order.lotAuthorityFile).toMatch(/authority\.pdf$/);
  });

  it("saves authority doc to Redis via writeAuthority when data is present", async () => {
    const req = makeReq({
      method: "POST",
      body: {
        ...makeOrderBody(),
        lotAuthority: { data: Buffer.from("pdf").toString("base64"), filename: "authority.pdf", contentType: "application/pdf" },
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(store.writeAuthority).toHaveBeenCalled();
  });

  it("does NOT call writeAuthority when lotAuthority.data is absent", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody() });
    const res = makeRes();
    await handler(req, res);
    expect(store.writeAuthority).not.toHaveBeenCalled();
  });

  it("sends admin notification email when SMTP is configured", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody() });
    const res = makeRes();
    await handler(req, res);
    const transporter = emailLib.createTransporter.mock.results[0]?.value;
    expect(transporter?.sendMail).toHaveBeenCalled();
  });

  it("does NOT send email when SMTP is not configured (missing host)", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CONFIG, smtp: { host: "", port: 2525, user: "u", pass: "p" } });
    const req = makeReq({ method: "POST", body: makeOrderBody() });
    const res = makeRes();
    await handler(req, res);
    expect(emailLib.createTransporter).not.toHaveBeenCalled();
  });

  it("returns 500 when writeData throws", async () => {
    store.writeData.mockRejectedValue(new Error("Redis write failed"));
    const req = makeReq({ method: "POST", body: makeOrderBody() });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
  });

  // --- Stripe order ---

  it("returns { id, redirect } for Stripe payment", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody({ payment: "stripe", total: 220 }) });
    const res = makeRes();
    await handler(req, res);
    expect(res._body).toHaveProperty("id");
    expect(res._body).toHaveProperty("redirect");
    expect(res._body.redirect).toContain("checkout.stripe.com");
  });

  it("saves stripeSessionId on the order for Stripe payment", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody({ payment: "stripe", total: 220 }) });
    const res = makeRes();
    await handler(req, res);
    // writeData should be called at least twice (initial save + stripe session save)
    const calls = store.writeData.mock.calls;
    const lastSave = calls[calls.length - 1][0];
    const savedOrder = lastSave.orders[0];
    expect(savedOrder.stripeSessionId).toBe("cs_test_123");
  });

  it("returns 500 when stripe.checkout.sessions.create throws", async () => {
    Stripe.mockImplementationOnce(() => ({
      checkout: {
        sessions: {
          create: vi.fn(async () => { throw new Error("Stripe error"); }),
        },
      },
    }));
    const req = makeReq({ method: "POST", body: makeOrderBody({ payment: "stripe", total: 220 }) });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
  });

  // --- SharePoint (GAP-5: SP failure is non-fatal) ---

  it("does not return error when SP upload fails (non-fatal)", async () => {
    spLib.uploadToSharePoint.mockRejectedValue(new Error("SP upload failed"));
    // SP enabled via config
    store.readConfig.mockResolvedValue({
      ...DEFAULT_CONFIG,
      sharepoint: { tenantId: "t", clientId: "c", clientSecret: "s", siteId: "si", folderPath: "F" },
    });
    const req = makeReq({ method: "POST", body: makeOrderBody() });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("ok", true);
  });

  // --- Status derivation (CRIT-2) ---

  it("sets order.status to 'Pending Payment' for bank payment", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody({ payment: "bank" }) });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.order.status).toBe("Pending Payment");
  });

  it("sets order.status to 'Awaiting Stripe Payment' for stripe payment", async () => {
    const req = makeReq({ method: "POST", body: makeOrderBody({ payment: "stripe", total: 220 }) });
    const res = makeRes();
    await handler(req, res);
    // Status is in the written data, not directly in the redirect response
    const calls = store.writeData.mock.calls;
    const savedOrder = calls[0][0].orders[0];
    expect(savedOrder.status).toBe("Awaiting Stripe Payment");
  });
});
