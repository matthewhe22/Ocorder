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
