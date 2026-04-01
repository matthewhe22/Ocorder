// api/config/settings.test.js — Unit tests for GET/POST /api/config/settings
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

vi.mock("../_lib/store.js", () => ({
  readConfig:   vi.fn(),
  writeConfig:  vi.fn(),
  validToken:   vi.fn(),
  extractToken: vi.fn(),
  cors:         vi.fn(),
  kvGet:        vi.fn(),
  kvSet:        vi.fn(),
  KV_AVAILABLE: false,
}));

// Mock Stripe to prevent real API calls
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    accounts: { retrieve: vi.fn(async () => ({ id: "acct_test" })) },
  })),
}));

import handler from "./settings.js";
import * as store from "../_lib/store.js";

const VALID_TOKEN = "valid.token";

const DEFAULT_CFG = {
  orderEmail: "orders@tocs.co",
  logo: "logo-data",
  smtp: { host: "smtp.test.com", port: 2525, user: "user", pass: "secretpass" },
  paymentDetails: { accountName: "TOCS", bsb: "033-065", accountNumber: "522011", payid: "acc@tocs.com" },
  emailTemplate: { certificateSubject: "Subject", certificateGreeting: "", footer: "Footer", adminNotificationSubject: "Subj", adminNotificationIntro: "Intro" },
  sharepoint: { tenantId: "t1", clientId: "c1", clientSecret: "sp-secret", siteId: "s1", folderPath: "Folder" },
  stripe: { secretKey: "sk_test_secret", publishableKey: "" },
  paymentMethods: { bankEnabled: true, payidEnabled: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.readConfig.mockResolvedValue(structuredClone(DEFAULT_CFG));
  store.writeConfig.mockResolvedValue();
  store.validToken.mockResolvedValue(false);
  store.extractToken.mockReturnValue(null);
  store.kvGet.mockResolvedValue(null);
  store.kvSet.mockResolvedValue();
});

// ── GET /api/config/settings ────────────────────────────────────────────────────

describe("GET /api/config/settings", () => {
  it("returns 401 when no valid token", async () => {
    const req = makeReq({ method: "GET" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 200 with all settings fields when authenticated", async () => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("orderEmail");
    expect(res._body).toHaveProperty("smtp");
    expect(res._body).toHaveProperty("sharepoint");
    expect(res._body).toHaveProperty("emailTemplate");
  });

  it("returns smtp.pass as masked placeholder when password is stored", async () => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.smtp.pass).toBe("••••••••");
  });

  it("returns smtp.pass as empty string when no password stored", async () => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
    store.readConfig.mockResolvedValue({ ...DEFAULT_CFG, smtp: { ...DEFAULT_CFG.smtp, pass: "" } });
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.smtp.pass).toBe("");
  });

  it("returns sharepoint.clientSecret as masked placeholder when secret is stored", async () => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.sharepoint.clientSecret).toBe("••••••••");
  });

  it("returns sharepoint.clientSecret as empty string when not stored", async () => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
    store.readConfig.mockResolvedValue({ ...DEFAULT_CFG, sharepoint: { ...DEFAULT_CFG.sharepoint, clientSecret: "" } });
    const req = makeReq({ method: "GET", headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.sharepoint.clientSecret).toBe("");
  });
});

// ── POST /api/config/settings ───────────────────────────────────────────────────

describe("POST /api/config/settings", () => {
  beforeEach(() => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
  });

  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", body: { orderEmail: "new@test.com" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("updates orderEmail when provided", async () => {
    const req = makeReq({ method: "POST", body: { orderEmail: "new@test.com" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const saved = store.writeConfig.mock.calls[0][0];
    expect(saved.orderEmail).toBe("new@test.com");
  });

  it("updates smtp.host, smtp.port, smtp.user when provided", async () => {
    const req = makeReq({ method: "POST", body: { smtp: { host: "new-host.com", port: 587, user: "newuser" } } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const saved = store.writeConfig.mock.calls[0][0];
    expect(saved.smtp.host).toBe("new-host.com");
    expect(saved.smtp.port).toBe(587);
    expect(saved.smtp.user).toBe("newuser");
  });

  it("does NOT update smtp.pass when the value is the masked placeholder", async () => {
    const req = makeReq({ method: "POST", body: { smtp: { pass: "••••••••" } } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeConfig.mock.calls[0][0];
    // original pass should remain (note: 'secretpass' is from DEFAULT_CFG)
    expect(saved.smtp.pass).toBe("secretpass");
  });

  it("updates smtp.pass when a real non-masked value is provided", async () => {
    const req = makeReq({ method: "POST", body: { smtp: { pass: "NewRealPass123" } } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeConfig.mock.calls[0][0];
    expect(saved.smtp.pass).toBe("NewRealPass123");
  });

  it("does NOT update sharepoint.clientSecret when the value is the masked placeholder", async () => {
    const req = makeReq({ method: "POST", body: { sharepoint: { clientSecret: "••••••••" } } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeConfig.mock.calls[0][0];
    expect(saved.sharepoint.clientSecret).toBe("sp-secret");
  });

  it("updates sharepoint.clientSecret when a real value is provided", async () => {
    const req = makeReq({ method: "POST", body: { sharepoint: { clientSecret: "new-real-secret" } } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeConfig.mock.calls[0][0];
    expect(saved.sharepoint.clientSecret).toBe("new-real-secret");
  });

  it("performs partial update — fields not in body are unchanged", async () => {
    const req = makeReq({ method: "POST", body: { orderEmail: "new@test.com" } });
    const res = makeRes();
    await handler(req, res);
    const saved = store.writeConfig.mock.calls[0][0];
    // smtp should be unchanged
    expect(saved.smtp.pass).toBe("secretpass");
  });

  it("returns 500 when writeConfig throws", async () => {
    store.writeConfig.mockRejectedValue(new Error("Redis write failed"));
    const req = makeReq({ method: "POST", body: { orderEmail: "new@test.com" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
  });

  it("returns 405 for unsupported methods", async () => {
    const req = makeReq({ method: "DELETE" });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });
});
