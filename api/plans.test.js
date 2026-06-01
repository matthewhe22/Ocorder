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
