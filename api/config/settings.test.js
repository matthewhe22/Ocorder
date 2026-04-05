// api/config/settings.test.js
// Tests that saved credentials (SMTP, SharePoint, PIQ, Stripe) are never
// accidentally wiped by empty-string or masked-placeholder submissions.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

// ── Module mocks ──────────────────────────────────────────────────────────────
// Paths are relative to this test file (same directory as the handler).

let storedConfig = null;
let configInStore = null;

vi.mock("../_lib/store.js", () => ({
  cors:          vi.fn(),
  extractToken:  vi.fn(() => "valid-token"),
  validToken:    vi.fn(async () => true),
  KV_AVAILABLE:  false,
  kvGet:         vi.fn(async () => null),
  kvSet:         vi.fn(async () => {}),
  readConfig:    vi.fn(async () => structuredClone(configInStore)),
  writeConfig:   vi.fn(async (cfg) => { storedConfig = structuredClone(cfg); }),
}));

vi.mock("../_lib/piq.js", () => ({
  getPiqToken:         vi.fn(async () => ({ access_token: "tok", baseUrl: "https://piq.example.com" })),
  getPiqBuilding:      vi.fn(async () => null),
  getPiqSchedules:     vi.fn(async () => []),
  getPiqLots:          vi.fn(async () => []),
  getAllPiqBuildings:   vi.fn(async () => ({ buildings: [] })),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    accounts: { retrieve: vi.fn(async () => ({ id: "acct_test" })) },
  })),
}));

// Load the handler AFTER mocks are registered.
const { default: handler } = await import("./settings.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

function seedConfig(cfg) {
  configInStore = structuredClone(cfg);
}

const BASE_CONFIG = {
  orderEmail: "orders@tocs.co",
  smtp:       { host: "mail.smtp2go.com", port: 2525, user: "OCCAPP", pass: "real-smtp-password" },
  sharepoint: { tenantId: "t1", clientId: "c1", clientSecret: "real-sp-secret", siteId: "s1", folderPath: "/docs" },
  piq:        { baseUrl: "https://piq.example.com", clientId: "piqclient", clientSecret: "real-piq-secret" },
  stripe:     { secretKey: "sk_live_real", publishableKey: "pk_live_real" },
  paymentDetails:  {},
  paymentMethods:  {},
  emailTemplate:   {},
};

// ── GET: masking ──────────────────────────────────────────────────────────────

describe("GET /api/config/settings — credential masking", () => {
  beforeEach(() => { seedConfig(BASE_CONFIG); storedConfig = null; });

  it("masks SMTP password as ••••••••", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: "Bearer tok" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.smtp.pass).toBe("••••••••");
  });

  it("masks SharePoint clientSecret as ••••••••", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: "Bearer tok" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.sharepoint.clientSecret).toBe("••••••••");
  });

  it("masks PIQ clientSecret as ••••••••", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: "Bearer tok" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.piq.clientSecret).toBe("••••••••");
  });

  it("masks Stripe secretKey as ••••••••", async () => {
    const req = makeReq({ method: "GET", headers: { authorization: "Bearer tok" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.stripe.secretKey).toBe("••••••••");
  });

  it("returns empty string for pass when no SMTP password is saved", async () => {
    seedConfig({ ...BASE_CONFIG, smtp: { ...BASE_CONFIG.smtp, pass: "" } });
    const req = makeReq({ method: "GET", headers: { authorization: "Bearer tok" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.smtp.pass).toBe("");
  });
});

// ── POST: SMTP password guard ─────────────────────────────────────────────────

describe("POST /api/config/settings — SMTP password guard", () => {
  beforeEach(() => { seedConfig(BASE_CONFIG); storedConfig = null; });

  it("does NOT overwrite SMTP password when empty string is submitted", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { smtp: { host: "mail.smtp2go.com", port: 2525, user: "OCCAPP", pass: "" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.ok).toBe(true);
    expect(storedConfig.smtp.pass).toBe("real-smtp-password");
  });

  it("does NOT overwrite SMTP password when placeholder •••••••• is submitted", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { smtp: { host: "mail.smtp2go.com", port: 2525, user: "OCCAPP", pass: "••••••••" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.ok).toBe(true);
    expect(storedConfig.smtp.pass).toBe("real-smtp-password");
  });

  it("does NOT overwrite SMTP password when pass field is omitted entirely", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { smtp: { host: "mail.smtp2go.com", port: 2525, user: "OCCAPP" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.ok).toBe(true);
    expect(storedConfig.smtp.pass).toBe("real-smtp-password");
  });

  it("DOES update SMTP password when a real new value is provided", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { smtp: { host: "mail.smtp2go.com", port: 2525, user: "OCCAPP", pass: "new-smtp-password" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.ok).toBe(true);
    expect(storedConfig.smtp.pass).toBe("new-smtp-password");
  });

  it("updates other SMTP fields without touching the password", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { smtp: { host: "new.host.com", port: 587, user: "newuser", pass: "" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.smtp.host).toBe("new.host.com");
    expect(storedConfig.smtp.port).toBe(587);
    expect(storedConfig.smtp.user).toBe("newuser");
    expect(storedConfig.smtp.pass).toBe("real-smtp-password"); // untouched
  });
});

// ── POST: SharePoint secret guard ─────────────────────────────────────────────

describe("POST /api/config/settings — SharePoint clientSecret guard", () => {
  beforeEach(() => { seedConfig(BASE_CONFIG); storedConfig = null; });

  it("does NOT overwrite SharePoint secret when empty string is submitted", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { sharepoint: { tenantId: "t1", clientId: "c1", clientSecret: "", siteId: "s1", folderPath: "/docs" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.sharepoint.clientSecret).toBe("real-sp-secret");
  });

  it("does NOT overwrite SharePoint secret when placeholder is submitted", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { sharepoint: { tenantId: "t1", clientId: "c1", clientSecret: "••••••••", siteId: "s1", folderPath: "/docs" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.sharepoint.clientSecret).toBe("real-sp-secret");
  });

  it("DOES update SharePoint secret when a real new value is provided", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { sharepoint: { tenantId: "t1", clientId: "c1", clientSecret: "new-sp-secret", siteId: "s1", folderPath: "/docs" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.sharepoint.clientSecret).toBe("new-sp-secret");
  });

  it("updates other SharePoint fields without touching the secret", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { sharepoint: { tenantId: "new-tenant", clientId: "new-client", clientSecret: "", siteId: "new-site", folderPath: "/new" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.sharepoint.tenantId).toBe("new-tenant");
    expect(storedConfig.sharepoint.clientId).toBe("new-client");
    expect(storedConfig.sharepoint.siteId).toBe("new-site");
    expect(storedConfig.sharepoint.clientSecret).toBe("real-sp-secret"); // untouched
  });
});

// ── POST: PIQ secret guard ────────────────────────────────────────────────────

describe("POST /api/config/settings — PIQ clientSecret guard", () => {
  beforeEach(() => { seedConfig(BASE_CONFIG); storedConfig = null; });

  it("does NOT overwrite PIQ secret when empty string is submitted", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { piq: { baseUrl: "https://piq.example.com", clientId: "piqclient", clientSecret: "" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.piq.clientSecret).toBe("real-piq-secret");
  });

  it("does NOT overwrite PIQ secret when placeholder is submitted", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { piq: { baseUrl: "https://piq.example.com", clientId: "piqclient", clientSecret: "••••••••" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.piq.clientSecret).toBe("real-piq-secret");
  });

  it("DOES update PIQ secret when a real new value is provided", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { piq: { baseUrl: "https://piq.example.com", clientId: "piqclient", clientSecret: "new-piq-secret" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.piq.clientSecret).toBe("new-piq-secret");
  });
});

// ── POST: Stripe secret guard ─────────────────────────────────────────────────

describe("POST /api/config/settings — Stripe secretKey guard", () => {
  beforeEach(() => { seedConfig(BASE_CONFIG); storedConfig = null; });

  it("does NOT overwrite Stripe secret when empty string is submitted", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { stripe: { secretKey: "", publishableKey: "pk_live_real" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.stripe.secretKey).toBe("sk_live_real");
  });

  it("does NOT overwrite Stripe secret when placeholder is submitted", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { stripe: { secretKey: "••••••••", publishableKey: "pk_live_real" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.stripe.secretKey).toBe("sk_live_real");
  });

  it("DOES update Stripe secret when a real new value is provided", async () => {
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: { stripe: { secretKey: "sk_live_new", publishableKey: "pk_live_real" } },
    });
    const res = makeRes();
    await handler(req, res);
    expect(storedConfig.stripe.secretKey).toBe("sk_live_new");
  });
});

// ── POST: full settings save without re-entering any secrets ──────────────────

describe("POST /api/config/settings — full save without re-entering secrets", () => {
  beforeEach(() => { seedConfig(BASE_CONFIG); storedConfig = null; });

  it("preserves all secrets when a typical settings-page save omits or sends empty secrets", async () => {
    // Simulates exactly what the frontend sends after loading: secrets stripped
    // from payload when the placeholder was shown and field was not re-entered.
    const req = makeReq({
      method: "POST",
      headers: { authorization: "Bearer tok" },
      body: {
        orderEmail: "newemail@tocs.co",
        smtp:       { host: "mail.smtp2go.com", port: 2525, user: "OCCAPP" }, // pass omitted
        sharepoint: { tenantId: "t1", clientId: "c1", siteId: "s1", folderPath: "/docs" }, // clientSecret omitted
        piq:        { baseUrl: "https://piq.example.com", clientId: "piqclient" }, // clientSecret omitted
        stripe:     { publishableKey: "pk_live_real" }, // secretKey omitted
      },
    });
    const res = makeRes();
    await handler(req, res);
    expect(res._body.ok).toBe(true);
    expect(storedConfig.smtp.pass).toBe("real-smtp-password");
    expect(storedConfig.sharepoint.clientSecret).toBe("real-sp-secret");
    expect(storedConfig.piq.clientSecret).toBe("real-piq-secret");
    expect(storedConfig.stripe.secretKey).toBe("sk_live_real");
    expect(storedConfig.orderEmail).toBe("newemail@tocs.co");
  });
});

// ── Auth guard ────────────────────────────────────────────────────────────────

describe("GET/POST /api/config/settings — auth guard", () => {
  it("rejects unauthenticated GET with 401", async () => {
    const { validToken } = await import("../_lib/store.js");
    validToken.mockResolvedValueOnce(false);
    const req = makeReq({ method: "GET", headers: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("rejects unauthenticated POST with 401", async () => {
    const { validToken } = await import("../_lib/store.js");
    validToken.mockResolvedValueOnce(false);
    const req = makeReq({ method: "POST", headers: {}, body: { orderEmail: "x@x.com" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });
});
