// api/_lib/email.test.js — Unit tests for email HTML builders and transporter factory
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nodemailer so createTransporter never opens real connections.
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn((opts) => ({ _opts: opts, sendMail: vi.fn(), verify: vi.fn() })),
  },
}));

import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "./email.js";
import nodemailer from "nodemailer";

// ── Shared fixtures ────────────────────────────────────────────────────────────
function makeOrder(overrides = {}) {
  return {
    id: "TOCS-TEST-001",
    date: "2026-03-30T10:00:00.000Z",
    payment: "bank",
    status: "Pending Payment",
    total: 220,
    orderCategory: "oc",
    contactInfo: {
      name: "Jane Smith",
      email: "jane@example.com",
      phone: "0412 345 678",
      applicantType: "owner",
      ownerName: "Jane Smith",
    },
    items: [
      { productName: "OC Certificate — Standard", ocName: "Owner Corp A", lotNumber: "Lot 1", planName: "Test Building", price: 220 },
    ],
    auditLog: [],
    ...overrides,
  };
}

function makeCfg(overrides = {}) {
  return {
    orderEmail: "orders@tocs.co",
    paymentDetails: {
      accountName: "Top Owners Corp",
      bsb: "033-065",
      accountNumber: "522011",
      payid: "accounts@tocs.com.au",
    },
    emailTemplate: {
      footer: "TOCS  |  info@tocs.co",
      adminNotificationIntro: "A new order has been placed.",
    },
    ...overrides,
  };
}

// ── buildOrderEmailHtml ────────────────────────────────────────────────────────
describe("buildOrderEmailHtml", () => {
  it("contains the order ID", () => {
    const html = buildOrderEmailHtml(makeOrder(), makeCfg());
    expect(html).toContain("TOCS-TEST-001");
  });

  it("includes the customer name", () => {
    const html = buildOrderEmailHtml(makeOrder(), makeCfg());
    expect(html).toContain("Jane Smith");
  });

  it("includes the formatted total as $X.XX AUD", () => {
    const html = buildOrderEmailHtml(makeOrder({ total: 220 }), makeCfg());
    expect(html).toContain("$220.00 AUD");
  });

  it("shows Agent / Representative for applicantType === agent", () => {
    const order = makeOrder({ contactInfo: { name: "Bob", applicantType: "agent", companyName: "Law Co", email: "b@x.com" } });
    const html = buildOrderEmailHtml(order, makeCfg());
    expect(html).toContain("Agent / Representative");
  });

  it("shows Owner for applicantType !== agent", () => {
    const html = buildOrderEmailHtml(makeOrder(), makeCfg());
    expect(html).toContain("Owner");
  });

  it("shows company name row when agent and companyName is set", () => {
    const order = makeOrder({ contactInfo: { name: "Bob", applicantType: "agent", companyName: "Law Co", email: "b@x.com" } });
    const html = buildOrderEmailHtml(order, makeCfg());
    expect(html).toContain("Law Co");
  });

  it("shows owner name row when not agent and ownerName is set", () => {
    const order = makeOrder({ contactInfo: { name: "Jane", applicantType: "owner", ownerName: "Jane Smith", email: "j@x.com" } });
    const html = buildOrderEmailHtml(order, makeCfg());
    expect(html).toContain("Jane Smith");
  });

  it("renders delivery address section when shippingAddress.street is present", () => {
    const order = makeOrder({
      contactInfo: {
        name: "Jane", applicantType: "owner", email: "j@x.com",
        shippingAddress: { street: "123 Main St", suburb: "Sydney", state: "NSW", postcode: "2000" },
      },
    });
    const html = buildOrderEmailHtml(order, makeCfg());
    expect(html).toContain("Delivery Address");
    expect(html).toContain("123 Main St");
  });

  it("does NOT render delivery address when shippingAddress is absent", () => {
    const html = buildOrderEmailHtml(makeOrder(), makeCfg());
    expect(html).not.toContain("Delivery Address");
  });

  it("renders shipping cost row when selectedShipping.cost > 0", () => {
    const order = makeOrder({ selectedShipping: { name: "Express Post", cost: 20 } });
    const html = buildOrderEmailHtml(order, makeCfg());
    expect(html).toContain("Express Post");
    expect(html).toContain("$20.00");
  });

  it("shows Stripe (Card) as payment label for stripe payment", () => {
    const html = buildOrderEmailHtml(makeOrder({ payment: "stripe" }), makeCfg());
    expect(html).toContain("Stripe (Card)");
  });

  it("shows Direct Bank Transfer for bank payment", () => {
    const html = buildOrderEmailHtml(makeOrder({ payment: "bank" }), makeCfg());
    expect(html).toContain("Direct Bank Transfer");
  });

  it("shows PayID for payid payment", () => {
    const html = buildOrderEmailHtml(makeOrder({ payment: "payid" }), makeCfg());
    expect(html).toContain("PayID");
  });

  it("shows lotAuthorityFile filename in footer note when present", () => {
    const order = makeOrder({ lotAuthorityFile: "authority-doc.pdf" });
    const html = buildOrderEmailHtml(order, makeCfg());
    expect(html).toContain("authority-doc.pdf");
  });

  it("shows Not provided when lotAuthorityFile is absent", () => {
    const html = buildOrderEmailHtml(makeOrder(), makeCfg());
    expect(html).toContain("Not provided");
  });

  it("does not throw when items is empty", () => {
    expect(() => buildOrderEmailHtml(makeOrder({ items: [] }), makeCfg())).not.toThrow();
  });

  it("does not throw when date is not a valid date string", () => {
    expect(() => buildOrderEmailHtml(makeOrder({ date: "not-a-date" }), makeCfg())).not.toThrow();
    const html = buildOrderEmailHtml(makeOrder({ date: "not-a-date" }), makeCfg());
    expect(html).toContain("—");
  });
});

// ── buildCustomerEmailHtml ─────────────────────────────────────────────────────
describe("buildCustomerEmailHtml", () => {
  it("contains the order ID", () => {
    const html = buildCustomerEmailHtml(makeOrder(), makeCfg());
    expect(html).toContain("TOCS-TEST-001");
  });

  it("shows awaiting payment message for bank payment", () => {
    const html = buildCustomerEmailHtml(makeOrder({ payment: "bank" }), makeCfg());
    expect(html).toContain("awaiting payment");
  });

  it("shows awaiting payment message for payid payment", () => {
    const html = buildCustomerEmailHtml(makeOrder({ payment: "payid" }), makeCfg());
    expect(html).toContain("awaiting payment");
  });

  it("shows payment received message for non-pending payment types", () => {
    const html = buildCustomerEmailHtml(makeOrder({ payment: "stripe" }), makeCfg());
    expect(html).toContain("payment has been received");
  });

  it("includes bank transfer details block for bank payment", () => {
    const html = buildCustomerEmailHtml(makeOrder({ payment: "bank" }), makeCfg());
    expect(html).toContain("Bank Transfer Details");
    expect(html).toContain("Top Owners Corp");
    expect(html).toContain("033-065");
    expect(html).toContain("522011");
    expect(html).toContain("TOCS-TEST-001"); // reference
  });

  it("includes PayID details block for payid payment", () => {
    const html = buildCustomerEmailHtml(makeOrder({ payment: "payid" }), makeCfg());
    expect(html).toContain("PayID Details");
    expect(html).toContain("accounts@tocs.com.au");
  });

  it("does NOT include bank/PayID details block for stripe payment", () => {
    const html = buildCustomerEmailHtml(makeOrder({ payment: "stripe" }), makeCfg());
    expect(html).not.toContain("Bank Transfer Details");
    expect(html).not.toContain("PayID Details");
  });

  it("shows GST amount as (total / 11).toFixed(2)", () => {
    const html = buildCustomerEmailHtml(makeOrder({ total: 220 }), makeCfg());
    expect(html).toContain((220 / 11).toFixed(2));
  });

  it("renders delivery address block when shippingAddress.street is present", () => {
    const order = makeOrder({
      contactInfo: {
        name: "Jane", applicantType: "owner", email: "j@x.com",
        shippingAddress: { street: "123 Main St", suburb: "Sydney", state: "NSW", postcode: "2000" },
      },
    });
    const html = buildCustomerEmailHtml(order, makeCfg());
    expect(html).toContain("Delivery Address");
    expect(html).toContain("123 Main St");
  });

  it("shows the order email from cfg.orderEmail in the footer contact line (not emailTemplate.footer)", () => {
    // buildCustomerEmailHtml renders the orderEmail address in the footer contact line,
    // not the emailTemplate.footer field (that field is used by the certificate email builder).
    const cfg = makeCfg({ orderEmail: "contact@tocs.co" });
    const html = buildCustomerEmailHtml(makeOrder(), cfg);
    expect(html).toContain("contact@tocs.co");
  });

  it("shows the order email from cfg.orderEmail in the contact line", () => {
    const html = buildCustomerEmailHtml(makeOrder(), makeCfg());
    expect(html).toContain("orders@tocs.co");
  });
});

// ── createTransporter ──────────────────────────────────────────────────────────
describe("createTransporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a transporter object with sendMail", () => {
    const t = createTransporter({ host: "smtp.test.com", port: 2525, user: "u", pass: "p" });
    expect(t).toBeDefined();
    expect(typeof t.sendMail).toBe("function");
  });

  it("uses secure: true when port is 465", () => {
    createTransporter({ host: "smtp.test.com", port: 465, user: "u", pass: "p" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true })
    );
  });

  it("uses secure: false when port is not 465", () => {
    createTransporter({ host: "smtp.test.com", port: 2525, user: "u", pass: "p" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: false })
    );
  });

  it("sets connectionTimeout: 8000", () => {
    createTransporter({ host: "smtp.test.com", port: 2525, user: "u", pass: "p" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 8000 })
    );
  });

  it("sets socketTimeout: 10000", () => {
    createTransporter({ host: "smtp.test.com", port: 2525, user: "u", pass: "p" });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ socketTimeout: 10000 })
    );
  });

  it("does NOT set greetingTimeout", () => {
    createTransporter({ host: "smtp.test.com", port: 2525, user: "u", pass: "p" });
    const callArgs = nodemailer.createTransport.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty("greetingTimeout");
  });
});
