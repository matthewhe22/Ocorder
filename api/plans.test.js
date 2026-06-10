// api/plans.test.js
// Security: lot import whitelists fields. A client must not be able to inject a
// forged `piqLotId` (which drives PIQ payment matching) or arbitrary fields via
// import-lots — those are set only by the trusted PIQ sync.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeReq, makeRes } from "../test/request-factory.js";

let storeData = null;
let written = null;

vi.mock("./_lib/store.js", () => ({
  readData:        vi.fn(async () => structuredClone(storeData)),
  writeData:       vi.fn(async (d) => { written = d; }),
  validAdminToken: vi.fn(async () => true),
  extractToken:    vi.fn(() => "admin-token"),
  cors:            vi.fn(),
}));

const { default: handler } = await import("./plans.js");

async function importLots(lots) {
  storeData = { strataPlans: [{ id: "SP1", name: "B", lots: [], ownerCorps: {} }], orders: [] };
  written = null;
  const res = makeRes();
  await handler(makeReq({
    method: "POST",
    headers: { authorization: "Bearer admin-token" },
    body: { action: "import-lots", planId: "SP1", lots },
  }), res);
  return res;
}

describe("GET /api/plans?id= — public single-plan detail", () => {
  async function getPlan(id) {
    storeData = {
      strataPlans: [
        {
          id: "SP1", name: "Harbour View", address: "45 Marina Drive",
          lots: [{ id: "L1", number: "Lot 1" }],
          ownerCorps: { "OC-A": { name: "Main" } },
          products: [{ id: "K3", name: "Garage Remote", price: 110, managerAdminCharge: 25, category: "keys" }],
        },
        { id: "SP2", name: "Hidden", active: false, lots: [], ownerCorps: {}, products: [] },
      ],
      orders: [],
    };
    const res = makeRes();
    await handler(makeReq({ method: "GET", query: { id } }), res);
    return res;
  }

  it("returns the full plan with managerAdminCharge stripped from products", async () => {
    const res = await getPlan("SP1");
    expect(res._status).toBe(200);
    const plan = res._body.plan;
    expect(plan.id).toBe("SP1");
    expect(plan.lots).toHaveLength(1);
    expect(plan.ownerCorps["OC-A"]).toBeDefined();
    const product = plan.products[0];
    expect(product.price).toBe(110);
    expect("managerAdminCharge" in product).toBe(false);
  });

  it("404s for unknown and inactive plans", async () => {
    expect((await getPlan("NOPE"))._status).toBe(404);
    expect((await getPlan("SP2"))._status).toBe(404);
  });

  it("400s when id is missing", async () => {
    expect((await getPlan(""))._status).toBe(400);
  });
});

describe("POST /api/plans import-lots — field whitelist", () => {
  it("drops a forged piqLotId and arbitrary fields on a new lot", async () => {
    const res = await importLots([{
      number: "5", type: "Residential", level: "1",
      piqLotId: 9999,            // forged — must be dropped
      isAdmin: true,             // arbitrary — must be dropped
      ownerCorps: ["OC-A"],
    }]);

    expect(res._status).toBe(200);
    const lot = written.strataPlans[0].lots.find(l => l.number === "5");
    expect(lot).toBeDefined();
    expect("piqLotId" in lot).toBe(false);
    expect("isAdmin" in lot).toBe(false);
    // Whitelisted fields survive.
    expect(lot.type).toBe("Residential");
    expect(lot.level).toBe("1");
    expect(lot.ownerCorps).toEqual(["OC-A"]);
  });

  it("coerces an invalid type to Residential", async () => {
    const res = await importLots([{ number: "6", type: "Penthouse" }]);
    expect(res._status).toBe(200);
    const lot = written.strataPlans[0].lots.find(l => l.number === "6");
    expect(lot.type).toBe("Residential");
  });
});

async function savePlans(plans) {
  storeData = { strataPlans: [], orders: [] };
  written = null;
  const res = makeRes();
  await handler(makeReq({
    method: "POST",
    headers: { authorization: "Bearer admin-token" },
    body: { plans },
  }), res);
  return res;
}

describe("POST /api/plans save — validation parity + dedup", () => {
  it("rejects a non-numeric managerAdminCharge", async () => {
    const res = await savePlans([{ id: "SP1", name: "B", products: [
      { id: "K1", name: "Key", price: 10, category: "keys", managerAdminCharge: "lots" },
    ] }]);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/managerAdminCharge/);
  });

  it("rejects externalUrl on a non-keys (OC) product", async () => {
    const res = await savePlans([{ id: "SP1", name: "B", products: [
      { id: "P1", name: "OC Cert", price: 220, perOC: true, category: "oc", externalUrl: "https://example.com" },
    ] }]);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/externalUrl is only allowed on Keys/);
  });

  it("accepts externalUrl on a keys product", async () => {
    const res = await savePlans([{ id: "SP1", name: "B", products: [
      { id: "K1", name: "Key", price: 10, category: "keys", externalUrl: "https://example.com/buy" },
    ] }]);
    expect(res._status).toBe(200);
  });

  it("deduplicates plans by id (last occurrence wins)", async () => {
    const res = await savePlans([
      { id: "SP1", name: "First", products: [] },
      { id: "SP1", name: "Second", products: [] },
    ]);
    expect(res._status).toBe(200);
    expect(written.strataPlans).toHaveLength(1);
    expect(written.strataPlans[0].name).toBe("Second");
  });
});
