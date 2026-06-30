// api/_lib/store-split.test.js
// The dataset is split across keys (tocs:plans / tocs:order-ids /
// tocs:order:{id}) instead of one monolithic blob. These tests run the real
// store against the file-KV fallback (LOCAL_KV_DIR) and cover: legacy-blob
// migration, diff-writes (only changed orders touch the store), index
// merging that preserves concurrent additions, deletion, replaceData, and
// the readOrder fast path.

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Must happen BEFORE store.js is imported — KV_AVAILABLE and LOCAL_KV_DIR are
// captured at module load.
delete process.env.REDIS_URL;
delete process.env.KV_URL;
const KV_DIR = mkdtempSync(join(tmpdir(), "tocs-kv-"));
process.env.LOCAL_KV_DIR = KV_DIR;

const store = await import("./store.js");

// File-KV stores each key as <sanitised-key>.json with shape { v: value }.
const fileFor = (key) => join(KV_DIR, key.replace(/[^A-Za-z0-9._-]+/g, "_") + ".json");
const readKey = (key) => {
  const f = fileFor(key);
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, "utf8")).v;
};
const writeKey = (key, v) => writeFileSync(fileFor(key), JSON.stringify({ v }));
const delAll = () => {
  for (const f of readdirSync(KV_DIR)) unlinkSync(join(KV_DIR, f));
};

const order = (id, extra = {}) => ({
  id, status: "Pending Payment", total: 220, date: "2026-06-10T00:00:00.000Z",
  items: [{ productId: "P1", productName: "OC Cert", price: 220 }],
  auditLog: [], ...extra,
});

beforeEach(async () => {
  delAll();
  // Reset the module-scope read snapshot by re-reading the (now empty) store.
  await store.readData();
});

describe("legacy blob migration", () => {
  it("splits tocs:data into per-order keys on first read and keeps a backup", async () => {
    writeKey("tocs:data", {
      strataPlans: [{ id: "SP1", name: "B", lots: [], ownerCorps: {}, products: [] }],
      orders: [order("TOCS-B"), order("TOCS-A")],
    });

    const d = await store.readData();
    expect(d.orders.map(o => o.id)).toEqual(["TOCS-B", "TOCS-A"]);
    expect(d.strataPlans[0].id).toBe("SP1");

    // Split keys exist; legacy key is gone but backed up.
    expect(readKey("tocs:order-ids")).toEqual(["TOCS-B", "TOCS-A"]);
    expect(readKey("tocs:order:TOCS-A").id).toBe("TOCS-A");
    expect(readKey("tocs:plans")[0].id).toBe("SP1");
    expect(readKey("tocs:data")).toBeNull();
    expect(readKey("tocs:data:pre-split").orders).toHaveLength(2);
  });
});

describe("writeData diff", () => {
  it("writes only the orders that changed", async () => {
    await store.replaceData({ strataPlans: [], orders: [order("TOCS-1"), order("TOCS-2")] });
    const d = await store.readData();

    // Tamper with TOCS-2's stored file directly (simulating another instance's
    // concurrent update that our snapshot doesn't know about).
    const tampered = { ...order("TOCS-2"), status: "Issued" };
    writeKey("tocs:order:TOCS-2", tampered);

    // Mutate only TOCS-1 and write the whole dataset back.
    d.orders.find(o => o.id === "TOCS-1").status = "Processing";
    await store.writeData(d);

    // TOCS-1 was written; TOCS-2 was NOT clobbered back to our stale copy.
    expect(readKey("tocs:order:TOCS-1").status).toBe("Processing");
    expect(readKey("tocs:order:TOCS-2").status).toBe("Issued");
  });

  it("adds new orders to the front of the index and deletes removed ones", async () => {
    await store.replaceData({ strataPlans: [], orders: [order("TOCS-OLD")] });
    const d = await store.readData();

    d.orders.unshift(order("TOCS-NEW"));
    await store.writeData(d);
    expect(readKey("tocs:order-ids")).toEqual(["TOCS-NEW", "TOCS-OLD"]);
    expect(readKey("tocs:order:TOCS-NEW")).not.toBeNull();

    const d2 = await store.readData();
    d2.orders = d2.orders.filter(o => o.id !== "TOCS-OLD");
    await store.writeData(d2);
    expect(readKey("tocs:order-ids")).toEqual(["TOCS-NEW"]);
    expect(readKey("tocs:order:TOCS-OLD")).toBeNull();
  });

  it("preserves orders added concurrently by another instance", async () => {
    await store.replaceData({ strataPlans: [], orders: [order("TOCS-MINE")] });
    const d = await store.readData();

    // Another instance creates an order between our read and write.
    writeKey("tocs:order:TOCS-THEIRS", order("TOCS-THEIRS"));
    writeKey("tocs:order-ids", ["TOCS-THEIRS", "TOCS-MINE"]);

    d.orders.unshift(order("TOCS-NEW"));
    await store.writeData(d);

    const ids = readKey("tocs:order-ids");
    expect(ids).toContain("TOCS-THEIRS"); // not lost
    expect(ids).toContain("TOCS-NEW");
    expect(ids).toContain("TOCS-MINE");
    expect(readKey("tocs:order:TOCS-THEIRS")).not.toBeNull();
  });
});

describe("readOrder fast path", () => {
  it("returns a single order without the index and null for unknown ids", async () => {
    await store.replaceData({ strataPlans: [], orders: [order("TOCS-X")] });
    const o = await store.readOrder("TOCS-X");
    expect(o.id).toBe("TOCS-X");
    expect(await store.readOrder("TOCS-NOPE")).toBeNull();
  });
});

describe("replaceData", () => {
  it("wipes existing orders entirely (demo reset semantics)", async () => {
    await store.replaceData({ strataPlans: [], orders: [order("TOCS-GONE")] });
    await store.replaceData({ strataPlans: [{ id: "SP9", name: "N" }], orders: [order("TOCS-KEPT")] });
    expect(readKey("tocs:order-ids")).toEqual(["TOCS-KEPT"]);
    expect(readKey("tocs:order:TOCS-GONE")).toBeNull();
    expect(readKey("tocs:plans")[0].id).toBe("SP9");
    const d = await store.readData();
    expect(d.orders.map(o => o.id)).toEqual(["TOCS-KEPT"]);
  });
});

describe("round-trip through readData/writeData", () => {
  it("status update persists and re-reads correctly", async () => {
    await store.replaceData({ strataPlans: [], orders: [order("TOCS-RT")] });
    const d = await store.readData();
    d.orders[0].status = "Issued";
    d.orders[0].auditLog.push({ ts: "2026-06-10T01:00:00.000Z", action: "Status changed to Issued" });
    await store.writeData(d);

    const d2 = await store.readData();
    expect(d2.orders[0].status).toBe("Issued");
    expect(d2.orders[0].auditLog).toHaveLength(1);
  });
});
