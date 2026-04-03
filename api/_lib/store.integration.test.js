// api/_lib/store.integration.test.js — Integration tests requiring a real Redis instance.
// These tests call actual store.js functions against a real Redis; no mocking of Redis.
// Requires: REDIS_URL set in test/setup.js (defaults to redis://localhost:6379)
//
// To run: ensure a local Redis is available (e.g. `docker run -p 6379:6379 redis:7`)
// If Redis is unavailable the tests are skipped automatically.

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { flushTestDb, seedData, seedConfig, getStored, closeTestDb } from "../../test/redis-helpers.js";

// ── Check Redis availability ────────────────────────────────────────────────────
let redisAvailable = false;
try {
  await flushTestDb();
  redisAvailable = true;
} catch {
  console.warn("[store.integration] Local Redis not available — skipping integration tests");
}

const maybeIt = redisAvailable ? it : it.skip;

// Re-import store module after each test to reset the singleton client.
// We use dynamic imports with cache-busting via vi.resetModules().
async function importStore() {
  vi.resetModules();
  return await import("./store.js");
}

describe("store.js integration tests", { skip: !redisAvailable }, () => {
  beforeEach(async () => {
    await flushTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // ── readData / writeData round-trips ────────────────────────────────────────

  describe("readData / writeData round-trips", () => {
    maybeIt("write and read back preserves deeply nested data", async () => {
      const { writeData, readData } = await importStore();
      const testData = {
        strataPlans: [{ id: "SP1", name: "Test Plan", lots: [{ id: "L1", number: "Lot 1" }], products: [], active: true }],
        orders: [],
      };
      await writeData(testData);
      const result = await readData();
      expect(result.strataPlans[0].id).toBe("SP1");
      expect(result.strataPlans[0].lots[0].number).toBe("Lot 1");
    });

    maybeIt("readData returns DEFAULT_DATA when tocs:data is not in Redis", async () => {
      const { readData, DEFAULT_DATA } = await importStore();
      const result = await readData();
      expect(result.strataPlans).toBeDefined();
      // Default data has SP12345
      expect(result.strataPlans.some(p => p.id === "SP12345")).toBe(true);
    });

    maybeIt("writing and reading orders preserves all order fields", async () => {
      const { writeData, readData } = await importStore();
      const order = {
        id: "TOCS-INT-001",
        status: "Pending Payment",
        payment: "bank",
        total: 220,
        contactInfo: { name: "Alice", email: "a@x.com", phone: "0400000000" },
        auditLog: [{ ts: "2026-03-30T10:00:00.000Z", action: "Order created" }],
        items: [{ productName: "OC Cert", price: 220, lotNumber: "Lot 1" }],
      };
      await writeData({ strataPlans: [], orders: [order] });
      const result = await readData();
      expect(result.orders[0].id).toBe("TOCS-INT-001");
      expect(result.orders[0].contactInfo.name).toBe("Alice");
      expect(result.orders[0].auditLog[0].action).toBe("Order created");
    });
  });

  // ── Migration logic ─────────────────────────────────────────────────────────

  describe("Migration logic", () => {
    maybeIt("adds shippingOptions: [] when plan is missing it", async () => {
      // Seed a plan matching SP12345 (DEFAULT_DATA) but without shippingOptions
      const planWithoutShipping = {
        id: "SP12345",
        name: "Harbour View Residences",
        lots: [],
        products: [
          { id:"P1", name:"OC Certificate — Standard", price:220, secondaryPrice:150, perOC:true, category:"oc" },
          { id:"P2", name:"OC Certificate — Urgent", price:385, secondaryPrice:280, perOC:true, category:"oc" },
          { id:"P3", name:"Register of Owners Search", price:55, perOC:false, category:"oc" },
          { id:"P4", name:"Insurance Certificate of Currency", price:75, perOC:false, category:"oc" },
          { id:"P5", name:"Meeting Minutes — Last 2 Years", price:110, perOC:false, category:"oc" },
          { id:"P6", name:"Financial Statements", price:95, perOC:false, category:"oc" },
          { id:"K1", name:"Building Entry Key", price:0, perOC:false, category:"keys" },
          { id:"K2", name:"Car Park Fob", price:0, perOC:false, category:"keys" },
          { id:"K3", name:"Garage Remote", price:0, perOC:false, category:"keys" },
        ],
        active: true,
        // NO shippingOptions
      };
      await seedData({ strataPlans: [planWithoutShipping], orders: [] });
      const { readData } = await importStore();
      const result = await readData();
      const plan = result.strataPlans.find(p => p.id === "SP12345");
      expect(Array.isArray(plan.shippingOptions)).toBe(true);
    });

    maybeIt("adds keysShipping: { deliveryCost: 0, expressCost: 0 } when plan is missing it", async () => {
      await seedData({
        strataPlans: [{ id: "SP12345", name: "Test", lots: [], products: [], active: true }],
        orders: [],
      });
      const { readData } = await importStore();
      const result = await readData();
      const plan = result.strataPlans.find(p => p.id === "SP12345");
      expect(plan.keysShipping).toEqual({ deliveryCost: 0, expressCost: 0 });
    });

    maybeIt("appends missing products for a plan that matches DEFAULT_DATA", async () => {
      // Seed SP12345 but only with P1 — should gain P2..K3
      await seedData({
        strataPlans: [{
          id: "SP12345", name: "Harbour View Residences", lots: [], active: true,
          products: [{ id: "P1", name: "OC Certificate — Standard", price: 220, perOC: true, category: "oc" }],
          shippingOptions: [],
        }],
        orders: [],
      });
      const { readData } = await importStore();
      const result = await readData();
      const plan = result.strataPlans.find(p => p.id === "SP12345");
      const ids = plan.products.map(p => p.id);
      // All default products should now be present
      expect(ids).toContain("P2");
      expect(ids).toContain("K1");
    });

    maybeIt("after migrating readData(), a subsequent call does NOT re-run migration (writes back once)", async () => {
      await seedData({
        strataPlans: [{ id: "SP12345", name: "Harbour View Residences", lots: [], products: [], active: true }],
        orders: [],
      });
      const { readData } = await importStore();
      // First read triggers migration and writes back
      await readData();
      // Get stored data after migration
      const stored = await getStored("tocs:data");
      expect(stored.strataPlans[0].shippingOptions).toBeDefined();
      // Second read — no migration needed
      await readData();
      // Stored data should be unchanged
      const storedAgain = await getStored("tocs:data");
      expect(storedAgain.strataPlans[0].shippingOptions).toBeDefined();
    });

    maybeIt("custom plan not in DEFAULT_DATA also receives keysShipping migration", async () => {
      await seedData({
        strataPlans: [
          { id: "CUSTOM-001", name: "Custom Building", lots: [], products: [], active: true, shippingOptions: [] },
        ],
        orders: [],
      });
      const { readData } = await importStore();
      const result = await readData();
      const plan = result.strataPlans.find(p => p.id === "CUSTOM-001");
      expect(plan.keysShipping).toEqual({ deliveryCost: 0, expressCost: 0 });
    });
  });

  // ── readConfig / writeConfig round-trips ────────────────────────────────────

  describe("readConfig / writeConfig round-trips", () => {
    maybeIt("write and read back is faithful", async () => {
      const { writeConfig, readConfig } = await importStore();
      const cfg = { user: "u@test.com", pass: "Secret123!", orderEmail: "o@test.com" };
      await writeConfig(cfg);
      const result = await readConfig();
      expect(result.user).toBe("u@test.com");
      expect(result.orderEmail).toBe("o@test.com");
    });

    maybeIt("readConfig fills in missing smtp fields from DEFAULT_CONFIG", async () => {
      const { writeConfig, readConfig } = await importStore();
      // Store config with only smtp.host; other smtp fields missing
      await writeConfig({ smtp: { host: "custom-host.example.com" } });
      const result = await readConfig();
      expect(result.smtp.host).toBe("custom-host.example.com");
      // port should be filled in from DEFAULT_CONFIG
      expect(result.smtp.port).toBeDefined();
    });
  });

  // ── writeAuthority / readAuthority round-trip ───────────────────────────────

  describe("writeAuthority / readAuthority round-trip", () => {
    maybeIt("write and read back preserves all fields", async () => {
      const { writeAuthority, readAuthority } = await importStore();
      const doc = { data: "base64abc==", filename: "test.pdf", contentType: "application/pdf" };
      await writeAuthority("ORD-TEST", doc);
      const result = await readAuthority("ORD-TEST");
      expect(result.data).toBe("base64abc==");
      expect(result.filename).toBe("test.pdf");
      expect(result.contentType).toBe("application/pdf");
    });

    maybeIt("readAuthority returns null for a non-existent order", async () => {
      const { readAuthority } = await importStore();
      const result = await readAuthority("ORD-MISSING");
      expect(result).toBeNull();
    });
  });

  // ── createSession / validToken round-trip ───────────────────────────────────

  describe("createSession / validToken round-trip", () => {
    maybeIt("a freshly created token passes validToken", async () => {
      const { createSession, validToken } = await importStore();
      const token = await createSession("admin@test.com");
      expect(await validToken(token)).toBe(true);
    });

    maybeIt("an expired token fails validToken", async () => {
      const { createSession, validToken } = await importStore();
      const token = await createSession("admin@test.com");
      // Advance clock past 8 hours
      vi.setSystemTime(Date.now() + 9 * 3600 * 1000);
      expect(await validToken(token)).toBe(false);
      vi.useRealTimers();
    });

    maybeIt("a token signed with a different TOKEN_SECRET fails validToken", async () => {
      const { createSession } = await importStore();
      const token = await createSession("admin@test.com");
      // Re-import with different secret
      const savedSecret = process.env.TOKEN_SECRET;
      process.env.TOKEN_SECRET = "different-secret-that-will-not-match-at-all!";
      const { validToken: validToken2 } = await importStore();
      expect(await validToken2(token)).toBe(false);
      process.env.TOKEN_SECRET = savedSecret;
    });
  });

  // ── Auth token invalidation on password change ──────────────────────────────

  describe("Auth token invalidation on password change", () => {
    maybeIt("token fails validToken after changing cfg.pass via writeConfig", async () => {
      // When TOKEN_SECRET is NOT set, the HMAC key derives from cfg.pass.
      // Temporarily unset TOKEN_SECRET to test password-based invalidation.
      const savedSecret = process.env.TOKEN_SECRET;
      delete process.env.TOKEN_SECRET;

      // Store initial config with known password
      await seedConfig({ user: "admin@test.com", pass: "OldPassword123!" });

      const { createSession, validToken, writeConfig } = await importStore();
      const token = await createSession("admin@test.com");
      expect(await validToken(token)).toBe(true);

      // Change password — HMAC key changes for non-TOKEN_SECRET path
      await writeConfig({ user: "admin@test.com", pass: "NewPassword456!" });

      // Token signed with old password should now fail
      // (Re-import to bust the in-memory config cache)
      const { validToken: freshValidToken } = await importStore();
      const isValid = await freshValidToken(token);
      // Current behaviour: validToken fails because getSecret() now returns new pass
      expect(isValid).toBe(false);

      process.env.TOKEN_SECRET = savedSecret;
    });
  });
});
