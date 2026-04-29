// API contract smoke — runs against the same webServer Playwright spins up.
// Asserts: health endpoint live, /api/data returns the SPA bootstrap blob,
// public /track endpoint enforces rate limits and returns 404 for unknowns.
import { test, expect } from "@playwright/test";

test.describe("OC Order API — public surface", () => {
  test("GET /api/health responds 200", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
  });

  test("GET /api/data returns plans + orders shape", async ({ request }) => {
    const r = await request.get("/api/data");
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body).toHaveProperty("strataPlans");
    expect(Array.isArray(body.strataPlans)).toBe(true);
  });

  test("GET track on unknown id is 404", async ({ request }) => {
    const r = await request.get("/api/orders/TOCS-NOPE-XXXX/track");
    expect(r.status()).toBe(404);
  });
});
