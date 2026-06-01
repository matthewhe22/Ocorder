// api/data.test.js
// Security: managerAdminCharge is an internal admin-only figure. GET /api/data
// must strip it from the public catalog for non-admin callers, but keep it for
// authenticated admins (the admin UI / CSV export need it).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../test/request-factory.js";

let isAdminResult = false;

vi.mock("./_lib/store.js", () => ({
  readData: vi.fn(async () => ({
    strataPlans: [{
      id: "SP1", name: "Harbour View",
      products: [
        { id: "K3", name: "Garage Remote", price: 110, managerAdminCharge: 25, category: "keys" },
        { id: "P1", name: "OC Certificate", price: 220, secondaryPrice: 150, perOC: true, category: "oc" },
      ],
    }],
    orders: [{ id: "TOCS-1", total: 110 }],
  })),
  validToken:   vi.fn(async () => isAdminResult),
  extractToken: vi.fn(() => "tok"),
  cors:         vi.fn(),
}));

const { default: handler } = await import("./data.js");

async function get() {
  const res = makeRes();
  await handler(makeReq({ method: "GET", headers: { authorization: "Bearer tok" } }), res);
  return res;
}

describe("GET /api/data — managerAdminCharge exposure", () => {
  beforeEach(() => { isAdminResult = false; });

  it("strips managerAdminCharge from products for non-admin callers", async () => {
    const res = await get();
    expect(res._status).toBe(200);
    const product = res._body.strataPlans[0].products.find(p => p.id === "K3");
    expect(product).toBeDefined();
    expect("managerAdminCharge" in product).toBe(false);
    // Other fields are preserved.
    expect(product.price).toBe(110);
    // Non-admins get no orders.
    expect(res._body.orders).toEqual([]);
  });

  it("keeps managerAdminCharge and orders for authenticated admins", async () => {
    isAdminResult = true;
    const res = await get();
    expect(res._status).toBe(200);
    const product = res._body.strataPlans[0].products.find(p => p.id === "K3");
    expect(product.managerAdminCharge).toBe(25);
    expect(res._body.orders).toHaveLength(1);
  });
});
