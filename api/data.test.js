// api/data.test.js — Unit tests for GET /api/data
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../test/request-factory.js";

vi.mock("./_lib/store.js", () => ({
  readData:     vi.fn(),
  validToken:   vi.fn(),
  extractToken: vi.fn(),
  cors:         vi.fn(),
}));

import handler from "./data.js";
import * as store from "./_lib/store.js";

const VALID_TOKEN = "valid.token";
const TEST_ORDERS = [
  { id: "ORD-001", status: "Pending Payment", total: 220 },
  { id: "ORD-002", status: "Issued", total: 385 },
];
const TEST_PLANS = [
  { id: "SP12345", name: "Test Building", active: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.readData.mockResolvedValue({ strataPlans: TEST_PLANS, orders: TEST_ORDERS });
  store.extractToken.mockReturnValue(null);
  store.validToken.mockResolvedValue(false);
});

describe("GET /api/data", () => {
  // --- Happy path (unauthenticated) ---

  it("returns 200 with strataPlans and empty orders when no token", async () => {
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.strataPlans).toEqual(TEST_PLANS);
    expect(res._body.orders).toEqual([]);
  });

  // --- Happy path (authenticated) ---

  it("returns orders when a valid Bearer token is present", async () => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.orders).toEqual(TEST_ORDERS);
  });

  it("accepts token via ?token= query param", async () => {
    store.validToken.mockImplementation(async (token) => token === VALID_TOKEN);
    const req = makeReq({ method: "GET", query: { token: VALID_TOKEN } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.orders).toEqual(TEST_ORDERS);
  });

  // --- Method guards ---

  it("returns 405 for non-GET methods", async () => {
    const req = makeReq({ method: "POST" });
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
