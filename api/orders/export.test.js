// api/orders/export.test.js — Unit tests for GET /api/orders/export
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

vi.mock("../_lib/store.js", () => ({
  readData:     vi.fn(),
  validToken:   vi.fn(),
  extractToken: vi.fn(),
  cors:         vi.fn(),
}));

import handler from "./export.js";
import * as store from "../_lib/store.js";

const VALID_TOKEN = "valid.token";

const makeOrder = (overrides = {}) => ({
  id: "TOCS-TEST-001",
  date: "2026-03-30T10:00:00.000Z",
  payment: "bank",
  status: "Pending Payment",
  total: 220,
  contactInfo: {
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "0412 345 678",
    applicantType: "owner",
    ownerName: "Jane Smith",
  },
  items: [
    { productName: "OC Certificate — Standard", price: 220, lotNumber: "Lot 1", planName: "Test Building" },
  ],
  selectedShipping: { name: "Standard Post", cost: 10 },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.extractToken.mockReturnValue(VALID_TOKEN);
  store.validToken.mockResolvedValue(true);
  store.readData.mockResolvedValue({ strataPlans: [], orders: [makeOrder()] });
});

describe("GET /api/orders/export", () => {
  // --- Auth guard ---

  it("returns 401 when no valid token (header)", async () => {
    store.extractToken.mockReturnValue(null);
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  // --- Happy path ---

  it("returns a CSV response with correct Content-Type", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._headers["Content-Type"]).toBe("text/csv");
  });

  it("returns a Content-Disposition header with the correct filename pattern", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    const cd = res._headers["Content-Disposition"];
    expect(cd).toMatch(/^attachment; filename="tocs-orders-\d{4}-\d{2}-\d{2}\.csv"$/);
  });

  it("CSV contains a header row with correct column names", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    const lines = res._body.split("\r\n");
    const header = lines[0];
    expect(header).toContain("Order ID");
    expect(header).toContain("Date");
    expect(header).toContain("Name");
    expect(header).toContain("Email");
    expect(header).toContain("Status");
    expect(header).toContain("Payment");
    expect(header).toContain("Total (AUD)");
  });

  it("CSV rows contain correct values for each order field", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    const lines = res._body.split("\r\n");
    const dataRow = lines[1];
    expect(dataRow).toContain("TOCS-TEST-001");
    expect(dataRow).toContain("jane@example.com");
    expect(dataRow).toContain("Jane Smith");
    expect(dataRow).toContain("Pending Payment");
    expect(dataRow).toContain("bank");
  });

  it("handles applicantType inference from companyName when applicantType is absent", async () => {
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({ contactInfo: { name: "Bob", email: "b@x.com", companyName: "Law Co", phone: "0400000000" } })],
    });
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    const lines = res._body.split("\r\n");
    const dataRow = lines[1];
    // companyName present → should infer "Agent"
    expect(dataRow).toContain("Agent");
  });

  it("includes delivery address when shippingAddress is present", async () => {
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({
        contactInfo: {
          name: "Jane", email: "j@x.com", applicantType: "owner",
          shippingAddress: { street: "123 Main St", suburb: "Sydney", state: "NSW", postcode: "2000" },
        },
      })],
    });
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body).toContain("123 Main St");
    expect(res._body).toContain("Sydney");
  });

  it("delivery address is empty string when absent", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    const lines = res._body.split("\r\n");
    const dataRow = lines[1];
    // Delivery address column should be present but empty (just "")
    expect(dataRow).toContain('""');
  });

  it("CSV values containing double quotes are escaped with doubled quotes (RFC 4180)", async () => {
    store.readData.mockResolvedValue({
      strataPlans: [],
      orders: [makeOrder({ contactInfo: { name: 'Jane "The" Smith', email: "j@x.com", applicantType: "owner" } })],
    });
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    // Double-quote escaping in CSV: " becomes ""
    expect(res._body).toContain('Jane ""The"" Smith');
  });

  // --- Method guards ---

  it("returns 405 for non-GET methods", async () => {
    const req = makeReq({ method: "POST" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
