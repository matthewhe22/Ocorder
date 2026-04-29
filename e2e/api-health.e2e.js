// API contract smoke — runs against the same webServer Playwright spins up.
// Asserts the public surface: /api/data returns the SPA bootstrap blob, the
// public /track endpoint enforces 404s on unknown ids, and POST /api/orders
// rejects malformed payloads. (Note: /api/health is not part of the local
// Express server's surface — that endpoint only exists in the Vercel
// serverless deployment; the smoke suite intentionally avoids relying on it.)
import { test, expect } from "@playwright/test";

test.describe("OC Order API — public surface", () => {
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

  test("POST /api/orders with malformed body returns 4xx", async ({ request }) => {
    const r = await request.post("/api/orders", {
      data: { order: {} },
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });
});
