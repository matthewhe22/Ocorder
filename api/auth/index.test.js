// api/auth/index.test.js — Unit tests for POST /api/auth handler
// All store.js I/O is mocked — no real Redis.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

// ── Mock store.js ──────────────────────────────────────────────────────────────
vi.mock("../_lib/store.js", () => ({
  readConfig:          vi.fn(),
  writeConfig:         vi.fn(),
  createSession:       vi.fn(),
  validToken:          vi.fn(),
  extractToken:        vi.fn(),
  invalidateAllSessions: vi.fn(),
  cors:                vi.fn(),
  kvGet:               vi.fn(),
  kvSet:               vi.fn(),
  kvDel:               vi.fn(),
  KV_AVAILABLE:        false,
}));

import handler from "./index.js";
import * as store from "../_lib/store.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────
const VALID_TOKEN = "valid.token";
const CFG_WITH_LEGACY_USER = {
  user: "testadmin@example.com",
  pass: "TestPass123!",
  orderEmail: "orders@tocs.co",
  smtp: { host: "", port: 2525, user: "", pass: "" },
};

function adminConfig(overrides = {}) {
  return { ...CFG_WITH_LEGACY_USER, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.cors.mockImplementation(() => {});
  store.readConfig.mockResolvedValue(adminConfig());
  store.writeConfig.mockResolvedValue();
  store.createSession.mockResolvedValue(VALID_TOKEN);
  store.validToken.mockResolvedValue(false);
  store.extractToken.mockReturnValue(null);
  store.invalidateAllSessions.mockResolvedValue();
  store.kvGet.mockResolvedValue(null);
  store.kvSet.mockResolvedValue();
  store.kvDel.mockResolvedValue();
});

// ── POST action=login ──────────────────────────────────────────────────────────

describe("POST /api/auth — action=login", () => {
  // --- Happy path ---

  it("returns 200 with token and user when credentials match", async () => {
    const req = makeReq({ method: "POST", body: { action: "login", user: "testadmin@example.com", pass: "TestPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("token", VALID_TOKEN);
    expect(res._body).toHaveProperty("user", "testadmin@example.com");
  });

  it("login is case-insensitive for username", async () => {
    const req = makeReq({ method: "POST", body: { action: "login", user: "TESTADMIN@EXAMPLE.COM", pass: "TestPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });

  // --- Input validation ---

  it("returns 400 when user is missing", async () => {
    const req = makeReq({ method: "POST", body: { action: "login", pass: "TestPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when pass is missing", async () => {
    const req = makeReq({ method: "POST", body: { action: "login", user: "testadmin@example.com" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when both user and pass are missing", async () => {
    const req = makeReq({ method: "POST", body: { action: "login" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  // --- State errors ---

  it("returns 401 when pass is wrong", async () => {
    const req = makeReq({ method: "POST", body: { action: "login", user: "testadmin@example.com", pass: "wrong" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 401 when user is wrong", async () => {
    const req = makeReq({ method: "POST", body: { action: "login", user: "unknown@example.com", pass: "TestPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 500 when readConfig throws", async () => {
    store.readConfig.mockRejectedValue(new Error("Redis down"));
    const req = makeReq({ method: "POST", body: { action: "login", user: "testadmin@example.com", pass: "TestPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(500);
  });
});

// ── Method guards ──────────────────────────────────────────────────────────────

describe("POST /api/auth — method guards", () => {
  it("returns 405 for non-POST methods", async () => {
    const req = makeReq({ method: "GET", body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it("returns 200 for OPTIONS preflight", async () => {
    const req = makeReq({ method: "OPTIONS", body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
  });
});

// ── POST action=list-admins ────────────────────────────────────────────────────

describe("POST /api/auth — action=list-admins", () => {
  it("returns 401 when no valid token", async () => {
    store.extractToken.mockReturnValue(null);
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", body: { action: "list-admins" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 200 with admins list when authenticated", async () => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
    const req = makeReq({ method: "POST", body: { action: "list-admins" }, headers: { authorization: `Bearer ${VALID_TOKEN}` } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("admins");
    expect(Array.isArray(res._body.admins)).toBe(true);
    // Should not expose passwords
    expect(res._body.admins[0]).not.toHaveProperty("password");
  });
});

// ── POST action=add-admin ──────────────────────────────────────────────────────

describe("POST /api/auth — action=add-admin", () => {
  beforeEach(() => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
  });

  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", body: { action: "add-admin", username: "new@example.com", password: "NewPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 400 when username is missing", async () => {
    const req = makeReq({ method: "POST", body: { action: "add-admin", password: "NewPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const req = makeReq({ method: "POST", body: { action: "add-admin", username: "new@example.com", password: "short" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 200 and new admin when valid input", async () => {
    const req = makeReq({ method: "POST", body: { action: "add-admin", username: "new@example.com", password: "NewPass123!", name: "New Admin" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("ok", true);
    expect(res._body.admin).toHaveProperty("username", "new@example.com");
  });

  it("returns 409 when admin already exists with same username", async () => {
    // Use admins array format
    store.readConfig.mockResolvedValue({
      admins: [{ id: "a1", username: "testadmin@example.com", password: "TestPass123!", name: "Admin" }],
    });
    const req = makeReq({ method: "POST", body: { action: "add-admin", username: "testadmin@example.com", password: "NewPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(409);
  });
});

// ── POST action=remove-admin ───────────────────────────────────────────────────

describe("POST /api/auth — action=remove-admin", () => {
  beforeEach(() => {
    store.extractToken.mockReturnValue(VALID_TOKEN);
    store.validToken.mockResolvedValue(true);
  });

  it("returns 409 when trying to remove the last admin", async () => {
    // Only one admin in the legacy format
    const req = makeReq({ method: "POST", body: { action: "remove-admin", id: "legacy" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(409);
  });

  it("returns 200 on success when multiple admins exist", async () => {
    store.readConfig.mockResolvedValue({
      admins: [
        { id: "a1", username: "admin1@example.com", password: "Pass123!", name: "Admin 1" },
        { id: "a2", username: "admin2@example.com", password: "Pass456!", name: "Admin 2" },
      ],
    });
    const req = makeReq({ method: "POST", body: { action: "remove-admin", id: "a2" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("ok", true);
  });

  it("returns 404 when admin id not found", async () => {
    store.readConfig.mockResolvedValue({
      admins: [
        { id: "a1", username: "admin1@example.com", password: "Pass123!", name: "Admin 1" },
        { id: "a2", username: "admin2@example.com", password: "Pass456!", name: "Admin 2" },
      ],
    });
    const req = makeReq({ method: "POST", body: { action: "remove-admin", id: "nonexistent" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });
});

// ── POST action=change-credentials ────────────────────────────────────────────

describe("POST /api/auth — action=change-credentials", () => {
  const TOKEN_PAYLOAD_B64 = Buffer.from(JSON.stringify({ user: "testadmin@example.com", exp: Date.now() + 8 * 3600 * 1000 })).toString("base64url");
  const DECODED_TOKEN = `${TOKEN_PAYLOAD_B64}.fakesig`;

  beforeEach(() => {
    store.extractToken.mockReturnValue(DECODED_TOKEN);
    store.validToken.mockResolvedValue(true);
  });

  it("returns 401 when no valid token", async () => {
    store.validToken.mockResolvedValue(false);
    const req = makeReq({ method: "POST", body: { action: "change-credentials", currentPass: "TestPass123!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it("returns 400 when currentPass does not match stored pass", async () => {
    const req = makeReq({ method: "POST", body: { action: "change-credentials", currentPass: "WrongPass!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 when newPass is shorter than 8 characters", async () => {
    const req = makeReq({ method: "POST", body: { action: "change-credentials", currentPass: "TestPass123!", newPass: "short" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 200 when currentPass is correct and newPass meets length requirement", async () => {
    const req = makeReq({ method: "POST", body: { action: "change-credentials", currentPass: "TestPass123!", newPass: "NewPass456!" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toHaveProperty("ok", true);
    expect(store.writeConfig).toHaveBeenCalled();
  });

  it("returns 200 when only newUser is provided", async () => {
    const req = makeReq({ method: "POST", body: { action: "change-credentials", currentPass: "TestPass123!", newUser: "newemail@example.com" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const savedCfg = store.writeConfig.mock.calls[0][0];
    expect(savedCfg.admins[0].username).toBe("newemail@example.com");
  });

  it("does not update username when newUser is empty string", async () => {
    const req = makeReq({ method: "POST", body: { action: "change-credentials", currentPass: "TestPass123!", newUser: "" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    const savedCfg = store.writeConfig.mock.calls[0][0];
    expect(savedCfg.admins[0].username).toBe("testadmin@example.com");
  });

  it("calls invalidateAllSessions on success", async () => {
    const req = makeReq({ method: "POST", body: { action: "change-credentials", currentPass: "TestPass123!", newPass: "NewPass456!" } });
    const res = makeRes();
    await handler(req, res);
    expect(store.invalidateAllSessions).toHaveBeenCalled();
  });
});

// ── Unknown action ─────────────────────────────────────────────────────────────

describe("POST /api/auth — unknown action", () => {
  it("returns 400 for missing action", async () => {
    const req = makeReq({ method: "POST", body: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it("returns 400 for unknown action", async () => {
    const req = makeReq({ method: "POST", body: { action: "nonexistent" } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});
