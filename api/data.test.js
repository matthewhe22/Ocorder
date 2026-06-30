// api/data.test.js
// GET /api/data must return only plan SUMMARIES (no lots/products) to public
// callers — the full catalog leaks internal fields (managerAdminCharge) and
// grows linearly with the portfolio. Authenticated admins get full data.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../test/request-factory.js";

let isAdminResult = false;

vi.mock("./_lib/store.js", () => ({
  readData: vi.fn(async () => ({
    strataPlans: [
      {
        id: "SP1", name: "Harbour View", address: "45 Marina Drive",
        lots: [{ id: "L1", number: "Lot 1" }, { id: "L2", number: "Lot 2" }],
        ownerCorps: { "OC-A": { name: "Main" } },
        products: [
          { id: "K3", name: "Garage Remote", price: 110, managerAdminCharge: 25, category: "keys" },
          { id: "P1", name: "OC Certificate", price: 220, secondaryPrice: 150, perOC: true, category: "oc" },
        ],
      },
      { id: "SP2", name: "Hidden Plan", address: "1 Off Market Rd", active: false, lots: [], ownerCorps: {}, products: [] },
    ],
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

describe("GET /api/data — public summary vs admin full data", () => {
  beforeEach(() => { isAdminResult = false; });

  it("returns summaries (no lots/products/managerAdminCharge) for non-admin callers", async () => {
    const res = await get();
    expect(res._status).toBe(200);
    const plan = res._body.strataPlans.find(p => p.id === "SP1");
    expect(plan).toBeDefined();
    // Summary fields present…
    expect(plan.name).toBe("Harbour View");
    expect(plan.address).toBe("45 Marina Drive");
    expect(plan.lotCount).toBe(2);
    expect(plan.ocCount).toBe(1);
    // …full catalog fields absent entirely.
    expect("lots" in plan).toBe(false);
    expect("products" in plan).toBe(false);
    expect("ownerCorps" in plan).toBe(false);
    // Non-admins get no orders.
    expect(res._body.orders).toEqual([]);
  });

  it("hides inactive plans from public callers", async () => {
    const res = await get();
    expect(res._body.strataPlans.find(p => p.id === "SP2")).toBeUndefined();
  });

  it("keeps full plans (incl. managerAdminCharge) and orders for authenticated admins", async () => {
    isAdminResult = true;
    const res = await get();
    expect(res._status).toBe(200);
    const product = res._body.strataPlans[0].products.find(p => p.id === "K3");
    expect(product.managerAdminCharge).toBe(25);
    expect(res._body.strataPlans[0].lots).toHaveLength(2);
    expect(res._body.orders).toHaveLength(1);
  });
});
