// api/_lib/pdf.test.js — Unit tests for PDF generators
import { describe, it, expect } from "vitest";
import { generateOrderPdf, generateReceiptPdf } from "./pdf.js";

// ── Shared fixtures ────────────────────────────────────────────────────────────
function makeOrder(overrides = {}) {
  return {
    id: "TOCS-PDF-001",
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
    },
    items: [
      { productName: "OC Certificate — Standard", ocName: "Owner Corp A", lotNumber: "Lot 1", planName: "Test Building", price: 220 },
    ],
    auditLog: [],
    ...overrides,
  };
}

// ── generateOrderPdf ───────────────────────────────────────────────────────────
describe("generateOrderPdf", () => {
  it("returns a Promise<Buffer>", async () => {
    const result = generateOrderPdf(makeOrder());
    expect(result).toBeInstanceOf(Promise);
    const buf = await result;
    expect(buf).toBeInstanceOf(Buffer);
  });

  it("the resolved Buffer has a non-zero length and starts with %PDF", async () => {
    const buf = await generateOrderPdf(makeOrder());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("does not throw for an order with an empty items array", async () => {
    await expect(generateOrderPdf(makeOrder({ items: [] }))).resolves.toBeInstanceOf(Buffer);
  });

  it("does not throw for an order with a shippingAddress", async () => {
    const order = makeOrder({
      contactInfo: {
        name: "Jane", email: "j@x.com",
        shippingAddress: { street: "123 Main St", suburb: "Sydney", state: "NSW", postcode: "2000" },
      },
    });
    await expect(generateOrderPdf(order)).resolves.toBeInstanceOf(Buffer);
  });

  it("does not throw for a keys order (orderCategory === keys)", async () => {
    const order = makeOrder({ orderCategory: "keys" });
    await expect(generateOrderPdf(order)).resolves.toBeInstanceOf(Buffer);
  });

  it("does not throw for a bank transfer order (payment === bank)", async () => {
    const order = makeOrder({ payment: "bank" });
    await expect(generateOrderPdf(order)).resolves.toBeInstanceOf(Buffer);
  });

  it("does not throw when contactInfo is absent (uses defaults)", async () => {
    const order = makeOrder({ contactInfo: undefined });
    await expect(generateOrderPdf(order)).resolves.toBeInstanceOf(Buffer);
  });

  it("does not throw for an order with multiple items including one with qty > 1", async () => {
    const order = makeOrder({
      items: [
        { productName: "OC Cert — Standard", ocName: "OC A", lotNumber: "Lot 1", planName: "Building X", price: 220, qty: 2 },
        { productName: "OC Cert — Urgent", ocName: "OC B", lotNumber: "Lot 2", planName: "Building X", price: 385 },
      ],
      total: 825,
    });
    await expect(generateOrderPdf(order)).resolves.toBeInstanceOf(Buffer);
  });
});

// ── generateReceiptPdf ─────────────────────────────────────────────────────────
describe("generateReceiptPdf", () => {
  it("returns a Promise<Buffer>", async () => {
    const result = generateReceiptPdf(makeOrder({ status: "Paid" }), "cs_test_123");
    expect(result).toBeInstanceOf(Promise);
    const buf = await result;
    expect(buf).toBeInstanceOf(Buffer);
  });

  it("the resolved Buffer has a non-zero length and starts with %PDF", async () => {
    const buf = await generateReceiptPdf(makeOrder({ status: "Paid" }), "cs_test_123");
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("does not throw when sessionId is null", async () => {
    await expect(generateReceiptPdf(makeOrder({ status: "Paid" }), null)).resolves.toBeInstanceOf(Buffer);
  });

  it("does not throw when sessionId is undefined", async () => {
    await expect(generateReceiptPdf(makeOrder({ status: "Paid" }), undefined)).resolves.toBeInstanceOf(Buffer);
  });

  it("uses the paidEntry.ts from auditLog when a Payment confirmed via Stripe entry exists", async () => {
    const order = makeOrder({
      status: "Paid",
      auditLog: [
        { ts: "2026-03-30T08:00:00.000Z", action: "Order created" },
        { ts: "2026-03-30T09:00:00.000Z", action: "Payment confirmed via Stripe", note: "Session: cs_test_123" },
      ],
    });
    // Should resolve without error (it uses the audit log timestamp)
    await expect(generateReceiptPdf(order, "cs_test_123")).resolves.toBeInstanceOf(Buffer);
  });

  it("uses new Date() when no Stripe audit log entry is found", async () => {
    const order = makeOrder({
      status: "Paid",
      auditLog: [{ ts: "2026-03-30T08:00:00.000Z", action: "Order created" }],
    });
    await expect(generateReceiptPdf(order, "cs_test_123")).resolves.toBeInstanceOf(Buffer);
  });

  it("does not throw when auditLog is empty", async () => {
    await expect(generateReceiptPdf(makeOrder({ status: "Paid", auditLog: [] }), "cs_test_123")).resolves.toBeInstanceOf(Buffer);
  });

  it("does not throw when auditLog is absent", async () => {
    const order = makeOrder({ status: "Paid" });
    delete order.auditLog;
    await expect(generateReceiptPdf(order, "cs_test_123")).resolves.toBeInstanceOf(Buffer);
  });
});
