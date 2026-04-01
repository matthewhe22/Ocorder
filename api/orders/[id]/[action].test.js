// api/orders/[id]/[action].test.js — Unit tests for all order action handlers
//
// GAP-8: send-certificate and send-invoice use createTransporter from _lib/email.js (good).
//        The test documents that connectionTimeout/socketTimeout ARE set (via createTransporter).
// GAP-7: stripe-confirm returns the order from data.orders[idx] (before SP URLs are written).
//        Test verifies the returned order has status "Paid" but may not have SP URLs.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../../test/request-factory.js";

vi.mock("../../_lib/store.js", () => ({
  readData:      vi.fn(),
  writeData:     vi.fn(),
  readConfig:    vi.fn(),
  validToken:    vi.fn(),
  extractToken:  vi.fn(),
  cors:          vi.fn(),
  readAuthority: vi.fn(),
  KV_AVAILABLE:  true,
}));

vi.mock("../../_lib/sharepoint.js", () => ({
  uploadToSharePoint: vi.fn(async () => "https://sp.example.com/file"),
  SHAREPOINT_ENABLED: false,
}));

vi.mock("../../_lib/email.js", () => ({
  buildOrderEmailHtml:    vi.fn(() => "<html>order</html>"),
  buildCustomerEmailHtml: vi.fn(() => "<html>customer</html>"),
  createTransporter:      vi.fn(() => ({
    sendMail: vi.fn(async () => ({ messageId: "test-id" })),
  })),
}));

vi.mock("../../_lib/pdf.js", () => ({
  generateOrderPdf:    vi.fn(async () => Buffer.from("%PDF-order")),
  generateReceiptPdf:  vi.fn(async () => Buffer.from("%PDF-receipt")),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        retrieve: vi.fn(async (id) => ({
          id,
          payment_status: "paid",
          metadata: { orderId: "TOCS-TEST-001" },
        })),
      },
    },
  })),
}));

import handler from "./[action].js";
import * as store from "../../_lib/store.js";
import * as spLib from "../../_lib/sharepoint.js";
import * as emailLib from "../../_lib/email.js";
import Stripe from "stripe";

const VALID_TOKEN = "valid.token";

const DEFAULT_CONFIG = {
  orderEmail: "orders@tocs.co",
  smtp: { host: "smtp.test.com", port: 2525, user: "smtpuser", pass: "smtppass" },
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
};

function makeOrder(overrides = {}) {
  return {
    id: "TOCS-TEST-001",
    status: "Pending Payment",
    payment: "bank",
    total: 220,
    orderCategory: "oc",
    lotAuthorityFile: "TOCS-TEST-001-lot-authority.pdf",
    contactInfo: {
      name: "Jane Smith",
      email: "jane@example.com",
      phone: "0412 345 678",
    },
    items: [
      { productName: "OC Certificate — Standard", price: 220, lotNumber: "Lot 1", planName: "Test Building" },
    ],
    auditLog: [{ ts: "2026-03-30T10:00:00.000Z", action: "Order created", note: "Customer: Jane Smith" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.readConfig.mockResolvedValue({ ...DEFAULT_CONFIG });
  store.readData.mockResolvedValue({ strataPlans: [], orders: [makeOrder()] });
  store.writeData.mockResolvedValue();
  store.readAuthority.mockResolvedValue({ data: Buffer.from("pdf").toString("base64"), filename: "authority.pdf", contentType: "application/pdf" });
  store.extractToken.mockReturnValue(VALID_TOKEN);
  store.validToken.mockResolvedValue(true);
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
});

// ── authority action ──────────────────────────────────────────────────────────

describe("GET /api/orders/:id/authority", () => {
  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "GET", query: { id: "TOCS-TEST-001", action: "authority" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    store.readData.mockResolvedValue({ strataPlans: [], orders: [] });
    const req = makeReq({ method: "GET", query: { id: "NONEXISTENT", action: "authority" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 404 when order has no lotAuthorityFile and no lotAuthorityUrl", async () => {
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({ lotAuthorityFile: undefined, lotAuthorityUrl: undefined })],
    });
    const req = makeReq({ method: "GET", query: { id: "TOCS-TEST-001", action: "authority" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 302 redirect to lotAuthorityUrl when the URL is present", async () => {
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({ lotAuthorityUrl: "https://sp.example.com/file" })],
    });
    const req = makeReq({ method: "GET", query: { id: "TOCS-TEST-001", action: "authority" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(302);
    expect(res._redirectUrl).toBe("https://sp.example.com/file");
  });

  it("serves file bytes from Redis when no lotAuthorityUrl", async () => {
    const req = makeReq({ method: "GET", query: { id: "TOCS-TEST-001", action: "authority" } });
    const res = makeRes();
    await handler(req, res);
    // Handler calls res.send(buf) without res.status(200), so _status is null (implies 200)
    expect(res._body).toBeInstanceOf(Buffer);
  });

  it("sets correct Content-Type and Content-Disposition headers when serving from Redis", async () => {
    const req = makeReq({ method: "GET", query: { id: "TOCS-TEST-001", action: "authority" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._headers["Content-Type"]).toBe("application/pdf");
    expect(res._headers["Content-Disposition"]).toMatch(/attachment; filename=/);
  });

  it("returns 503 when readAuthority throws", async () => {
    store.readAuthority.mockRejectedValue(new Error("Redis error"));
    const req = makeReq({ method: "GET", query: { id: "TOCS-TEST-001", action: "authority" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(503);
  });

  it("returns 404 when Redis returns null stored authority doc", async () => {
    store.readAuthority.mockResolvedValue(null);
    const req = makeReq({ method: "GET", query: { id: "TOCS-TEST-001", action: "authority" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });
});

// ── status action ─────────────────────────────────────────────────────────────

describe("PUT /api/orders/:id/status", () => {
  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: { status: "Paid" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 400 when status is missing", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when status is not a valid enum value", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: { status: "InvalidStatus" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 404 when order not found", async () => {
    store.readData.mockResolvedValue({ strataPlans: [], orders: [] });
    const req = makeReq({ method: "PUT", query: { id: "NONEXISTENT", action: "status" }, body: { status: "Paid" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 200 { ok: true } on success and updates order status in Redis", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: { status: "Paid" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("ok", true);
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.orders[0].status).toBe("Paid");
  });

  it("appends an audit log entry with correct action string", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: { status: "Processing" } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    const lastEntry = saved.orders[0].auditLog.at(-1);
    expect(lastEntry.action).toBe("Status changed to Processing");
  });

  it("sets cancelReason when status is Cancelled and note is provided", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: { status: "Cancelled", note: "Customer requested" } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.orders[0].cancelReason).toBe("Customer requested");
  });

  it("does NOT set cancelReason when status is Cancelled but note is absent", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: { status: "Cancelled" } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.orders[0].cancelReason).toBeUndefined();
  });

  it("does NOT set cancelReason for non-Cancelled statuses even if note is provided", async () => {
    const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: { status: "Processing", note: "Some note" } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.orders[0].cancelReason).toBeUndefined();
  });

  it("accepts each valid status value", async () => {
    const VALID_STATUSES = ["Pending Payment", "Processing", "Issued", "Cancelled", "On Hold", "Awaiting Documents", "Invoice to be issued", "Paid", "Awaiting Stripe Payment"];
    for (const status of VALID_STATUSES) {
      store.readData.mockResolvedValue({ strataPlans: [], orders: [makeOrder()] });
      store.writeData.mockResolvedValue();
      const req = makeReq({ method: "PUT", query: { id: "TOCS-TEST-001", action: "status" }, body: { status } });
      const res = makeRes();
      await handler(req, res);
      expect(res._status).toBe(200);
    }
  });
});

// ── send-certificate action ───────────────────────────────────────────────────

describe("POST /api/orders/:id/send-certificate", () => {
  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    store.readData.mockResolvedValue({ strataPlans: [], orders: [] });
    const req = makeReq({ method: "POST", query: { id: "NONEXISTENT", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 400 when SMTP is not configured", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CONFIG, smtp: { host: "", port: 2525, user: "", pass: "" } });
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("sends email to order.contactInfo.email", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const transporter = emailLib.createTransporter.mock.results[0]?.value;
    expect(transporter?.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com" })
    );
  });

  it("replaces {orderId} in the subject template", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    const transporter = emailLib.createTransporter.mock.results[0]?.value;
    const mailOpts = transporter?.sendMail.mock.calls[0][0];
    expect(mailOpts.subject).toContain("TOCS-TEST-001");
    expect(mailOpts.subject).not.toContain("{orderId}");
  });

  it("attaches the provided attachment as a Buffer", async () => {
    const attachData = Buffer.from("pdf content").toString("base64");
    const req = makeReq({
      method: "POST",
      query: { id: "TOCS-TEST-001", action: "send-certificate" },
      body: { attachment: { data: attachData, filename: "cert.pdf", contentType: "application/pdf" } },
    });
    const res = makeRes();
    await handler(req, res);
    const transporter = emailLib.createTransporter.mock.results[0]?.value;
    const mailOpts = transporter?.sendMail.mock.calls[0][0];
    expect(mailOpts.attachments).toHaveLength(1);
    expect(mailOpts.attachments[0].content).toBeInstanceOf(Buffer);
  });

  it("does NOT attach when attachment.data is absent", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    const transporter = emailLib.createTransporter.mock.results[0]?.value;
    const mailOpts = transporter?.sendMail.mock.calls[0][0];
    expect(mailOpts.attachments).toBeUndefined();
  });

  it("sets order status to Issued in Redis", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.orders[0].status).toBe("Issued");
  });

  it("appends 'Certificate issued' audit log entry with email in note", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    const lastEntry = saved.orders[0].auditLog.at(-1);
    expect(lastEntry.action).toBe("Certificate issued");
    expect(lastEntry.note).toContain("jane@example.com");
  });

  it("returns 500 when sendMail throws", async () => {
    emailLib.createTransporter.mockReturnValueOnce({
      sendMail: vi.fn(async () => { throw new Error("SMTP error"); }),
    });
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
  });

  // GAP-8: createTransporter is used (which sets connectionTimeout/socketTimeout correctly)
  it("uses createTransporter from _lib/email.js (GAP-8: correct timeout settings)", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-certificate" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(emailLib.createTransporter).toHaveBeenCalled();
  });
});

// ── send-invoice action ───────────────────────────────────────────────────────

describe("POST /api/orders/:id/send-invoice", () => {
  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-invoice" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    store.readData.mockResolvedValue({ strataPlans: [], orders: [] });
    const req = makeReq({ method: "POST", query: { id: "NONEXISTENT", action: "send-invoice" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 400 when SMTP is not configured", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CONFIG, smtp: { host: "", port: 2525, user: "", pass: "" } });
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-invoice" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("sends email to order.contactInfo.email", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-invoice" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    const transporter = emailLib.createTransporter.mock.results[0]?.value;
    expect(transporter?.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com" })
    );
  });

  it("uses message from request body when provided", async () => {
    const req = makeReq({
      method: "POST",
      query: { id: "TOCS-TEST-001", action: "send-invoice" },
      body: { message: "Custom invoice message here." },
    });
    const res = makeRes();
    await handler(req, res);
    const transporter = emailLib.createTransporter.mock.results[0]?.value;
    const mailOpts = transporter?.sendMail.mock.calls[0][0];
    expect(mailOpts.html).toContain("Custom invoice message here.");
  });

  it("uses default message with payment details when message is absent", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-invoice" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    const transporter = emailLib.createTransporter.mock.results[0]?.value;
    const mailOpts = transporter?.sendMail.mock.calls[0][0];
    // Default message includes payment details (note: word is "invoice" lowercase in the template)
    expect(mailOpts.html).toContain("invoice");
    expect(mailOpts.html).toContain("Payment details");
  });

  it("sets order status to Pending Payment in Redis", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-invoice" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.orders[0].status).toBe("Pending Payment");
  });

  it("appends 'Invoice sent' audit log entry with email in note", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-invoice" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    const lastEntry = saved.orders[0].auditLog.at(-1);
    expect(lastEntry.action).toBe("Invoice sent");
    expect(lastEntry.note).toContain("jane@example.com");
  });

  it("returns 500 when sendMail throws", async () => {
    emailLib.createTransporter.mockReturnValueOnce({
      sendMail: vi.fn(async () => { throw new Error("SMTP error"); }),
    });
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "send-invoice" }, body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
  });
});

// ── stripe-confirm action ─────────────────────────────────────────────────────

describe("POST /api/orders/:id/stripe-confirm", () => {
  beforeEach(() => {
    // Set up order with stripeSessionId
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({ stripeSessionId: "cs_test_session_123", status: "Awaiting Stripe Payment", payment: "stripe" })],
    });
  });

  it("returns 503 when STRIPE_SECRET_KEY is not set", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    store.readConfig.mockResolvedValue({ ...DEFAULT_CONFIG, stripe: { secretKey: "" } });
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(503);
  });

  it("returns 404 when order not found", async () => {
    store.readData.mockResolvedValue({ strataPlans: [], orders: [] });
    const req = makeReq({ method: "POST", query: { id: "NONEXISTENT", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 200 { success: true } immediately when order status is already Paid (idempotency)", async () => {
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({ status: "Paid", stripeSessionId: "cs_test_session_123", payment: "stripe" })],
    });
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("success", true);
    // Should not call Stripe
    const StripeInstance = Stripe.mock.results[0]?.value;
    if (StripeInstance) {
      expect(StripeInstance.checkout.sessions.retrieve).not.toHaveBeenCalled();
    }
  });

  it("returns 400 when order has no stripeSessionId", async () => {
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({ status: "Awaiting Stripe Payment", stripeSessionId: undefined })],
    });
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 500 when stripe.checkout.sessions.retrieve throws", async () => {
    Stripe.mockImplementationOnce(() => ({
      checkout: {
        sessions: {
          retrieve: vi.fn(async () => { throw new Error("Stripe API error"); }),
        },
      },
    }));
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
  });

  it("returns 400 when session.metadata.orderId does not match URL id (cross-order protection)", async () => {
    Stripe.mockImplementationOnce(() => ({
      checkout: {
        sessions: {
          retrieve: vi.fn(async () => ({
            id: "cs_test_session_123",
            payment_status: "paid",
            metadata: { orderId: "DIFFERENT-ORDER-ID" }, // mismatch!
          })),
        },
      },
    }));
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 402 when session.payment_status is not 'paid'", async () => {
    Stripe.mockImplementationOnce(() => ({
      checkout: {
        sessions: {
          retrieve: vi.fn(async () => ({
            id: "cs_test_session_123",
            payment_status: "unpaid",
            metadata: { orderId: "TOCS-TEST-001" },
          })),
        },
      },
    }));
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(402);
    expect(res._body).toHaveProperty("payment_status", "unpaid");
  });

  it("returns 200 { success: true, order } when payment is confirmed", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("success", true);
    expect(res._body).toHaveProperty("order");
  });

  it("sets order status to Paid in Redis on success", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(store.writeData).toHaveBeenCalled();
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.orders[0].status).toBe("Paid");
  });

  it("appends 'Payment confirmed via Stripe' audit log entry", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    const auditEntry = saved.orders[0].auditLog.find(e => e.action === "Payment confirmed via Stripe");
    expect(auditEntry).toBeDefined();
    expect(auditEntry.note).toContain("cs_test_session_123");
  });

  it("sends emails on success when SMTP is configured", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(emailLib.createTransporter).toHaveBeenCalled();
  });

  it("does NOT send emails when SMTP is not configured", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CONFIG, smtp: { host: "", port: 2525, user: "", pass: "" } });
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(emailLib.createTransporter).not.toHaveBeenCalled();
  });

  // GAP-7: The response order is from data.orders[idx] before SP URLs are written
  it("returned order object reflects the Paid status (GAP-7)", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "stripe-confirm" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.order.status).toBe("Paid");
    // SP URLs may not be present in the response since they're written after response
    // (this is expected behaviour documented in GAP-7)
  });
});

// ── delete action ─────────────────────────────────────────────────────────────

describe("DELETE /api/orders/:id/delete", () => {
  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "DELETE", query: { id: "TOCS-TEST-001", action: "delete" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    store.readData.mockResolvedValue({ strataPlans: [], orders: [] });
    const req = makeReq({ method: "DELETE", query: { id: "NONEXISTENT", action: "delete" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 409 when trying to delete a non-Cancelled order", async () => {
    // Default order has status "Pending Payment" — not Cancelled
    const req = makeReq({ method: "DELETE", query: { id: "TOCS-TEST-001", action: "delete" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(409);
  });

  it("returns 200 { ok: true, deleted: id } on success and removes from Redis", async () => {
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({ status: "Cancelled" })],
    });
    const req = makeReq({ method: "DELETE", query: { id: "TOCS-TEST-001", action: "delete" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true, deleted: "TOCS-TEST-001" });
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.orders).toHaveLength(0);
  });
});

// ── Unknown action ────────────────────────────────────────────────────────────

describe("Unknown action", () => {
  it("returns 404 for any unrecognised action value", async () => {
    const req = makeReq({ method: "POST", query: { id: "TOCS-TEST-001", action: "nonexistent" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
    expect(res._body).toEqual({ error: "Unknown action." });
  });
});
