// api/config/test.test.js — Unit tests for POST /api/config/test?service=email|sharepoint
//
// NOTE — GAP-SEC-4: The merged test.js handler now requires a valid token
// (calls validToken() properly), unlike the old test-sharepoint.js which only
// checked if the Authorization header was non-empty. Tests here document the
// CURRENT (fixed) behaviour that requires a valid token.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

vi.mock("../_lib/store.js", () => ({
  readConfig:   vi.fn(),
  validToken:   vi.fn(),
  extractToken: vi.fn(),
  cors:         vi.fn(),
}));

vi.mock("../_lib/email.js", () => ({
  createTransporter: vi.fn(),
}));

vi.mock("@azure/identity", () => ({
  ClientSecretCredential: vi.fn().mockImplementation(() => ({
    getToken: vi.fn(async () => ({ token: "mock-access-token" })),
  })),
}));

import handler from "./test.js";
import * as store from "../_lib/store.js";
import * as emailLib from "../_lib/email.js";
import { ClientSecretCredential } from "@azure/identity";

const VALID_TOKEN = "valid.token";

const DEFAULT_CFG = {
  smtp: { host: "smtp.test.com", port: 2525, user: "user", pass: "pass" },
  orderEmail: "orders@tocs.co",
  sharepoint: {
    tenantId:     "tenant-id",
    clientId:     "client-id",
    clientSecret: "client-secret",
    siteId:       "site-id",
    folderPath:   "Test/Folder",
  },
};

// Mock transporter (sendMail succeeds by default)
let mockSendMail;
let mockVerify;

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.readConfig.mockResolvedValue({ ...DEFAULT_CFG });
  store.extractToken.mockReturnValue(VALID_TOKEN);
  store.validToken.mockResolvedValue(true);

  mockSendMail = vi.fn(async () => ({ messageId: "test-id" }));
  mockVerify   = vi.fn(async () => true);
  emailLib.createTransporter.mockReturnValue({ sendMail: mockSendMail, verify: mockVerify });
});

// ── Method guards ──────────────────────────────────────────────────────────────

describe("POST /api/config/test — method guards", () => {
  it("returns 405 for non-POST methods", async () => {
    const req = makeReq({ method: "GET", query: { service: "email" } });
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

  it("returns 400 when service param is missing", async () => {
    const req = makeReq({ method: "POST", body: {}, query: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});

// ── Auth guard ──────────────────────────────────────────────────────────────────

describe("POST /api/config/test — auth guard", () => {
  it("returns 401 when no valid token", async () => {
    store.extractToken.mockReturnValue(null);
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", body: {}, query: { service: "email" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  // SEC-4 NOTE: The merged test.js handler uses validToken() correctly.
  // The old test-sharepoint.js only checked `if (!auth)` — any non-empty Bearer
  // token value would pass, even an invalid HMAC. This is fixed in the merged handler.
  // TODO SEC-4: Add test if the old test-sharepoint.js file is ever restored.
  it("does NOT accept an invalid token (SEC-4 fix in merged handler)", async () => {
    store.extractToken.mockReturnValue("some-non-empty-token");
    store.validToken.mockResolvedValue(false); // invalid HMAC
    const req = makeReq({ method: "POST", body: { service: "sharepoint" }, query: { service: "sharepoint" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });
});

// ── service=email ──────────────────────────────────────────────────────────────

describe("POST /api/config/test?service=email", () => {
  it("returns 400 when SMTP host is missing", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CFG, smtp: { host: "", port: 2525, user: "user", pass: "pass" } });
    const req = makeReq({ method: "POST", body: {}, query: { service: "email" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when SMTP user is missing", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CFG, smtp: { host: "smtp.test.com", port: 2525, user: "", pass: "pass" } });
    const req = makeReq({ method: "POST", body: {}, query: { service: "email" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when SMTP pass is missing", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CFG, smtp: { host: "smtp.test.com", port: 2525, user: "user", pass: "" } });
    const req = makeReq({ method: "POST", body: {}, query: { service: "email" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("uses request body SMTP values when provided", async () => {
    const req = makeReq({
      method: "POST",
      body: { smtp: { host: "custom-smtp.com", port: 465, user: "customuser", pass: "custompass" } },
      query: { service: "email" },
    });
    const res = makeRes();
    await handler(req, res);
    expect(emailLib.createTransporter).toHaveBeenCalledWith(
      expect.objectContaining({ host: "custom-smtp.com", user: "customuser", pass: "custompass" })
    );
  });

  it("falls back to stored config SMTP values when body omits them", async () => {
    const req = makeReq({ method: "POST", body: {}, query: { service: "email" } });
    const res = makeRes();
    await handler(req, res);
    expect(emailLib.createTransporter).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.test.com", user: "user", pass: "pass" })
    );
  });

  it("uses stored cfg.smtp.pass when body sends the masked placeholder", async () => {
    const req = makeReq({
      method: "POST",
      body: { smtp: { host: "smtp.test.com", user: "user", pass: "••••••••" } },
      query: { service: "email" },
    });
    const res = makeRes();
    await handler(req, res);
    // Should use stored pass, not the placeholder
    expect(emailLib.createTransporter).toHaveBeenCalledWith(
      expect.objectContaining({ pass: "pass" })
    );
  });

  it("calls transporter.verify() before sendMail", async () => {
    const callOrder = [];
    mockVerify.mockImplementation(async () => { callOrder.push("verify"); return true; });
    mockSendMail.mockImplementation(async () => { callOrder.push("sendMail"); return { messageId: "id" }; });
    const req = makeReq({ method: "POST", body: {}, query: { service: "email" } });
    const res = makeRes();
    await handler(req, res);
    expect(callOrder.indexOf("verify")).toBeLessThan(callOrder.indexOf("sendMail"));
  });

  it("returns 200 { ok: true, sentTo } on success", async () => {
    const req = makeReq({ method: "POST", body: {}, query: { service: "email" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true, sentTo: "orders@tocs.co" });
  });

  it("returns 500 with error message on SMTP failure", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP connection refused"));
    const req = makeReq({ method: "POST", body: {}, query: { service: "email" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
    expect(res._body.error).toContain("SMTP connection refused");
  });
});

// ── service=sharepoint ─────────────────────────────────────────────────────────

describe("POST /api/config/test?service=sharepoint", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    delete global.fetch;
  });

  it("returns 200 { ok: false, step: 'config' } when SP config is missing", async () => {
    store.readConfig.mockResolvedValue({ ...DEFAULT_CFG, sharepoint: { tenantId: "", clientId: "", clientSecret: "", siteId: "" } });
    const req = makeReq({ method: "POST", body: { service: "sharepoint" }, query: { service: "sharepoint" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: false, step: "config" });
  });

  it("returns 200 { ok: false, step: 'auth' } when OAuth token fails", async () => {
    ClientSecretCredential.mockImplementationOnce(() => ({
      getToken: vi.fn(async () => { throw new Error("Auth error"); }),
    }));
    const req = makeReq({ method: "POST", body: { service: "sharepoint" }, query: { service: "sharepoint" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: false, step: "auth" });
  });

  it("returns 200 { ok: false, step: 'site_read' } when site read returns non-2xx", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "Not found" });
    const req = makeReq({ method: "POST", body: { service: "sharepoint" }, query: { service: "sharepoint" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: false, step: "site_read", httpStatus: 404 });
  });

  it("returns 200 { ok: false, step: 'drive_read' } when drive read returns non-2xx", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ displayName: "Test Site", webUrl: "https://sp.example.com" }) })
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" });
    const req = makeReq({ method: "POST", body: { service: "sharepoint" }, query: { service: "sharepoint" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: false, step: "drive_read", httpStatus: 403 });
  });

  it("returns 200 { ok: true } on full success", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ displayName: "Test Site", webUrl: "https://sp.example.com" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: [] }) });
    const req = makeReq({ method: "POST", body: { service: "sharepoint" }, query: { service: "sharepoint" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.ok).toBe(true);
    expect(res._body.siteName).toBe("Test Site");
    expect(res._body.siteWebUrl).toBe("https://sp.example.com");
  });
});
