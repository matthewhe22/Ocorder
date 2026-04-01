// api/plans.test.js — Unit tests for POST /api/plans
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../test/request-factory.js";

vi.mock("./_lib/store.js", () => ({
  readData:     vi.fn(),
  writeData:    vi.fn(),
  validToken:   vi.fn(),
  extractToken: vi.fn(),
  cors:         vi.fn(),
}));

import handler from "./plans.js";
import * as store from "./_lib/store.js";

const VALID_TOKEN = "valid.token";
const EXISTING_ORDERS = [{ id: "ORD-001", status: "Paid" }];
const DEFAULT_DATA = {
  strataPlans: [{ id: "SP12345", name: "Old Building", lots: [], products: [], active: true }],
  orders: EXISTING_ORDERS,
};

const VALID_PLAN = { id: "SP99001", name: "New Building", lots: [], products: [], active: true };

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.readData.mockResolvedValue({ ...DEFAULT_DATA, strataPlans: [...DEFAULT_DATA.strataPlans], orders: [...DEFAULT_DATA.orders] });
  store.writeData.mockResolvedValue();
  store.extractToken.mockReturnValue(VALID_TOKEN);
  store.validToken.mockResolvedValue(true);
});

describe("POST /api/plans — save plans", () => {
  // --- Auth guard ---

  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", body: { plans: [VALID_PLAN] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  // --- Input validation ---

  it("returns 400 when plans is not an array", async () => {
    const req = makeReq({ method: "POST", body: { plans: "not-an-array" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when plans is absent from request body", async () => {
    const req = makeReq({ method: "POST", body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when plans is an empty array", async () => {
    const req = makeReq({ method: "POST", body: { plans: [] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when a plan has no id", async () => {
    const req = makeReq({ method: "POST", body: { plans: [{ name: "Missing ID" }] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when a plan has no name", async () => {
    const req = makeReq({ method: "POST", body: { plans: [{ id: "SP1" }] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when a product has a negative price", async () => {
    const req = makeReq({ method: "POST", body: { plans: [{ id: "SP1", name: "Test", products: [{ id: "P1", price: -5 }] }] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  // --- Happy path ---

  it("returns 200 { ok: true } when plans is a valid array", async () => {
    const req = makeReq({ method: "POST", body: { plans: [VALID_PLAN] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  it("calls writeData with updated plans (replacing existing)", async () => {
    const req = makeReq({ method: "POST", body: { plans: [VALID_PLAN] } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.strataPlans).toEqual([VALID_PLAN]);
    // Orders should be preserved
    expect(saved.orders).toEqual(EXISTING_ORDERS);
  });

  it("replaces the entire strataPlans array (not a merge)", async () => {
    const newPlan = { id: "SP99001", name: "Brand New Building", lots: [], products: [], active: true };
    const req = makeReq({ method: "POST", body: { plans: [newPlan] } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeData.mock.calls[0][0];
    // Old plan should be gone
    expect(saved.strataPlans.find(p => p.id === "SP12345")).toBeUndefined();
    expect(saved.strataPlans[0].id).toBe("SP99001");
  });

  // --- import-lots action ---

  it("returns 401 for import-lots when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", body: { action: "import-lots", planId: "SP12345", lots: [{ id: "L1" }] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 400 for import-lots when lots is empty array", async () => {
    const req = makeReq({ method: "POST", body: { action: "import-lots", planId: "SP12345", lots: [] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 404 for import-lots when planId not found", async () => {
    const req = makeReq({ method: "POST", body: { action: "import-lots", planId: "NONEXISTENT", lots: [{ id: "L1" }] } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it("returns 200 and replaces lots for import-lots", async () => {
    const newLots = [{ id: "L1", number: "Lot 1" }, { id: "L2", number: "Lot 2" }];
    const req = makeReq({ method: "POST", body: { action: "import-lots", planId: "SP12345", lots: newLots } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true, count: 2 });
    const saved = store.writeData.mock.calls[0][0];
    expect(saved.strataPlans[0].lots).toEqual(newLots);
  });

  // --- Method guards ---

  it("returns 405 for non-POST methods", async () => {
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it("returns 200 for OPTIONS preflight", async () => {
    const req = makeReq({ method: "OPTIONS" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });
});
