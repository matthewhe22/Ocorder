// api/config/public.test.js — Unit tests for GET /api/config/public
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

vi.mock("../_lib/store.js", () => ({
  readConfig: vi.fn(),
  cors:       vi.fn(),
  DEMO_MODE:  false,
}));

import handler from "./public.js";
import * as store from "../_lib/store.js";

const DEFAULT_CFG = {
  logo: "data:image/png;base64,abc",
  paymentDetails: {
    accountName:   "Top Owners Corporation",
    bsb:           "033-065",
    accountNumber: "522011",
    payid:         "accounts@tocs.com.au",
  },
  stripe: { secretKey: "" },
};

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.readConfig.mockResolvedValue({ ...DEFAULT_CFG });
  // Reset STRIPE_SECRET_KEY
  delete process.env.STRIPE_SECRET_KEY;
});

describe("GET /api/config/public", () => {
  // --- Happy path ---

  it("returns 200 with logo, stripeEnabled, and paymentDetails", async () => {
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("logo");
    expect(res._body).toHaveProperty("stripeEnabled");
    expect(res._body).toHaveProperty("paymentDetails");
  });

  it("stripeEnabled is false when STRIPE_SECRET_KEY is unset and cfg.stripe.secretKey is empty", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.stripeEnabled).toBe(false);
  });

  it("stripeEnabled is true when STRIPE_SECRET_KEY env var is set", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.stripeEnabled).toBe(true);
  });

  it("stripeEnabled is true when cfg.stripe.secretKey is set", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    store.readConfig.mockResolvedValue({ ...DEFAULT_CFG, stripe: { secretKey: "sk_test_stored" } });
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.stripeEnabled).toBe(true);
  });

  it("paymentDetails contains values from cfg.paymentDetails", async () => {
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.paymentDetails.accountName).toBe("Top Owners Corporation");
    expect(res._body.paymentDetails.bsb).toBe("033-065");
    expect(res._body.paymentDetails.accountNumber).toBe("522011");
    expect(res._body.paymentDetails.payid).toBe("accounts@tocs.com.au");
  });

  it("paymentDetails falls back to defaults when cfg.paymentDetails is absent", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CFG, paymentDetails: undefined });
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.paymentDetails.accountName).toBe("Top Owners Corporation");
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
