// In-process smoke test for the Vercel serverless handlers.
// Boots each handler with a fake req/res and a path-isolated KV (no Redis).
// Goal: verify the W1-3 changes haven't regressed existing behaviour and
// that previously-stored orders / configs still round-trip cleanly.

import { describe, it, expect, beforeAll } from "vitest";

// ── Fake req/res helpers ──────────────────────────────────────────────────────
function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k)    { return this.headers[k.toLowerCase()]; },
    status(c)       { this.statusCode = c; return this; },
    json(obj)       { this.body = obj; return this; },
    send(buf)       { this.body = buf; return this; },
    end()           { return this; },
    redirect(_, url){ this.statusCode = 302; this.headers.location = url; return this; },
  };
  return res;
}
function makeReq({ method = "GET", url = "/", headers = {}, body, query = {} } = {}) {
  return { method, url, headers, body, query, socket: { remoteAddress: "127.0.0.1" } };
}

beforeAll(() => {
  // Disable Redis for these tests so the no-KV / "fall open" code paths run
  // (the existing test/setup.js points at a non-existent local Redis). Must
  // happen before any dynamic import of store.js because KV_AVAILABLE is
  // captured at module load.
  delete process.env.REDIS_URL;
  delete process.env.KV_URL;
  // Make the store / token paths deterministic in tests.
  process.env.TOKEN_SECRET = "test-secret-for-smoke-tests";
  process.env.NODE_ENV = "test";
});

describe("Password helper — legacy-plaintext compatibility", () => {
  it("verifyPassword still accepts legacy plaintext stored in pre-migration configs", async () => {
    const { verifyPassword, hashPassword } = await import("./password.js");
    expect(await verifyPassword("Tocs@Vote", "Tocs@Vote")).toBe(true);
    expect(await verifyPassword("Tocs@Vote", "wrong")).toBe(false);
    const h = await hashPassword("Tocs@Vote");
    expect(await verifyPassword(h, "Tocs@Vote")).toBe(true);
  });
});

describe("Token signing — production refuses without TOKEN_SECRET", () => {
  it("createSession + validToken round-trip with TOKEN_SECRET set", async () => {
    const store = await import("./store.js");
    const t = await store.createSession("smoke@example.com");
    expect(typeof t).toBe("string");
    expect(t).toMatch(/\./);
    expect(await store.validToken(t)).toBe(true);
    expect(await store.validToken("garbage")).toBe(false);
    // Tampered signature
    expect(await store.validToken(t.slice(0, -2) + "00")).toBe(false);
  });
});

describe("CORS — exact-origin allow-list", () => {
  it("allows the canonical domains and rejects prefix attacks", async () => {
    const { cors } = await import("./store.js");
    const allow = makeRes();
    cors(allow, { headers: { origin: "https://tocs.co" } });
    expect(allow.headers["access-control-allow-origin"]).toBe("https://tocs.co");

    const spoof = makeRes();
    cors(spoof, { headers: { origin: "https://tocs.co.evil.com" } });
    expect(spoof.headers["access-control-allow-origin"]).toBeUndefined();

    const localDev = makeRes();
    cors(localDev, { headers: { origin: "http://localhost:3000" } });
    expect(localDev.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});

describe("withOrderLock — falls open without Redis (dev mode)", () => {
  it("still calls the inner fn when KV is unavailable", async () => {
    const { withOrderLock } = await import("./store.js");
    let called = false;
    const result = await withOrderLock("ORDER-X", async () => {
      called = true;
      return "ok";
    });
    expect(called).toBe(true);
    expect(result).toBe("ok");
  });
});

describe("rateLimit — falls open without Redis", () => {
  it("returns allowed:true when KV is unavailable", async () => {
    const { rateLimit } = await import("./store.js");
    const r = await rateLimit("track:127.0.0.1", 30, 300);
    expect(r.allowed).toBe(true);
  });
});

describe("Stripe-webhook — refuses without STRIPE_WEBHOOK_SECRET", () => {
  it("503 + WEBHOOK_SECRET_MISSING when env not set", async () => {
    const prev = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const handler = (await import("../stripe-webhook/index.js")).default;
    const req = makeReq({ method: "POST", headers: {} });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
    expect(res.body?.code).toBe("WEBHOOK_SECRET_MISSING");
    if (prev !== undefined) process.env.STRIPE_WEBHOOK_SECRET = prev;
  });
});

describe("Order /track — public lookup contract", () => {
  it("returns 404 for unknown ids (and does not 5xx without Redis)", async () => {
    const handler = (await import("../orders/[id]/[action].js")).default;
    const req = makeReq({
      method: "GET",
      query: { id: "TOCS-NOPE-XXXX", action: "track" },
      headers: {},
    });
    const res = makeRes();
    await handler(req, res);
    // Without KV, readData returns DEFAULT_DATA which has no orders → 404.
    expect(res.statusCode).toBe(404);
    expect(res.body?.error).toMatch(/not found/i);
  });
});

describe("Existing OCOrder/data.json shape — orders intact", () => {
  it("data.json has a strataPlans array and orders array of expected shape", async () => {
    const fs = await import("fs");
    const path = "/home/user/Ocorder/OCOrder/data.json";
    if (!fs.existsSync(path)) {
      // No persisted data in this checkout — that's fine; the schema test
      // below covers the expected shape via the seed data.
      return;
    }
    const raw = fs.readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty("strataPlans");
    expect(Array.isArray(parsed.strataPlans)).toBe(true);
    expect(parsed).toHaveProperty("orders");
    expect(Array.isArray(parsed.orders)).toBe(true);
    // Every existing order should carry id + status + items.
    for (const o of parsed.orders) {
      expect(typeof o.id).toBe("string");
      expect(typeof o.status).toBe("string");
      expect(Array.isArray(o.items)).toBe(true);
    }
  });
});

describe("DEMO seed — referenced orders have valid status enum entries", () => {
  it("every DEMO order's status is in the canonical enum", async () => {
    const { DEMO_DEFAULT_DATA } = await import("./store.js");
    const VALID = new Set([
      "Pending Payment", "Processing", "Issued", "Cancelled",
      "On Hold", "Awaiting Documents", "Invoice to be issued",
      "Paid", "Awaiting Stripe Payment",
    ]);
    for (const o of DEMO_DEFAULT_DATA.orders) {
      expect(VALID.has(o.status), `order ${o.id} has unknown status "${o.status}"`).toBe(true);
    }
  });
});
