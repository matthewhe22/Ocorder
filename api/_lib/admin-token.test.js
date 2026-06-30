// api/_lib/admin-token.test.js
// Security: the static SERVICE_API_TOKEN is READ-ONLY. validToken() accepts it
// (read endpoints), but validAdminToken() — the gate for mutating endpoints
// (save plans, write config, change/delete orders) — must reject it. Only a
// human admin's HMAC session token may perform writes.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const SERVICE_TOKEN = "service-token-abcdefghijklmnop-32chars"; // ≥ 32 chars

let store;
let prevServiceToken;

beforeAll(async () => {
  // Disable Redis BEFORE importing store.js — KV_AVAILABLE is captured at module
  // load, and the token/session paths must "fall open" without a real Redis (the
  // default test/setup.js points REDIS_URL at a non-existent local server).
  delete process.env.REDIS_URL;
  delete process.env.KV_URL;
  process.env.TOKEN_SECRET = "test-secret-for-admin-token-tests";
  prevServiceToken = process.env.SERVICE_API_TOKEN;
  process.env.SERVICE_API_TOKEN = SERVICE_TOKEN;
  store = await import("./store.js");
});

afterAll(() => {
  if (prevServiceToken === undefined) delete process.env.SERVICE_API_TOKEN;
  else process.env.SERVICE_API_TOKEN = prevServiceToken;
});

describe("validAdminToken — service token is read-only", () => {
  it("validToken ACCEPTS the service token (read endpoints)", async () => {
    expect(await store.validToken(SERVICE_TOKEN)).toBe(true);
  });

  it("validAdminToken REJECTS the service token (mutating endpoints)", async () => {
    expect(await store.validAdminToken(SERVICE_TOKEN)).toBe(false);
  });

  it("both accept a valid admin session token", async () => {
    const session = await store.createSession("admin@tocs.co");
    expect(await store.validToken(session)).toBe(true);
    expect(await store.validAdminToken(session)).toBe(true);
  });

  it("validAdminToken rejects garbage and tampered tokens", async () => {
    const session = await store.createSession("admin@tocs.co");
    expect(await store.validAdminToken("garbage")).toBe(false);
    expect(await store.validAdminToken(session.slice(0, -2) + "00")).toBe(false);
    expect(await store.validAdminToken("")).toBe(false);
  });
});
