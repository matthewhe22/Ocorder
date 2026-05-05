import { describe, it, expect } from "vitest";
import { findLevyForOrderId, isLevyTransaction } from "./piq.js";

const ORDER_ID = "TOCS-MOQC20E7-H4RFTULVNO";
const DESC     = "FOB Order x 1 - Unit 1109 TOCS-MOQC20E7-H4RFTULVNO";

describe("isLevyTransaction", () => {
  it("accepts levy / Special Levy / Special Fee variants", () => {
    expect(isLevyTransaction({ type: "levy" })).toBe(true);
    expect(isLevyTransaction({ type: "Levy" })).toBe(true);
    expect(isLevyTransaction({ type: "Special Levy" })).toBe(true);
    expect(isLevyTransaction({ type: "specialLevy" })).toBe(true);
    expect(isLevyTransaction({ type: "Special Fee" })).toBe(true);
    expect(isLevyTransaction({ type: "specialFee" })).toBe(true);
    expect(isLevyTransaction({ type: "special_fee" })).toBe(true);
  });

  it("rejects non-levy types", () => {
    expect(isLevyTransaction({ type: "receipt" })).toBe(false);
    expect(isLevyTransaction({ type: "refund" })).toBe(false);
    expect(isLevyTransaction({ type: "obal" })).toBe(false);
    expect(isLevyTransaction({})).toBe(false);
    expect(isLevyTransaction(null)).toBe(false);
  });
});

describe("findLevyForOrderId", () => {
  it("matches the order ID inside a Special Fee description (real-world case)", () => {
    const ledger = [
      { type: "obal",        description: "Opening balance" },
      { type: "Special Fee", description: DESC, reference: "Ref #10882", totalDue: 50, totalPaid: 0 },
    ];
    const levy = findLevyForOrderId(ledger, ORDER_ID);
    expect(levy).not.toBeNull();
    expect(levy.reference).toBe("Ref #10882");
  });

  it("matches Special Levy with order ID in description field", () => {
    const ledger = [{ type: "Special Levy", description: DESC, reference: "Ref #10882" }];
    expect(findLevyForOrderId(ledger, ORDER_ID)).toBe(ledger[0]);
  });

  it("matches when the order ID lives in the legacy `details` field", () => {
    const ledger = [{ type: "levy", details: DESC, reference: "Ref #10882" }];
    expect(findLevyForOrderId(ledger, ORDER_ID)).toBe(ledger[0]);
  });

  it("matches when the order ID lives in `narrative` or `memo`", () => {
    expect(findLevyForOrderId([{ type: "Special Fee", narrative: DESC }], ORDER_ID)).not.toBeNull();
    expect(findLevyForOrderId([{ type: "Special Fee", memo:      DESC }], ORDER_ID)).not.toBeNull();
    expect(findLevyForOrderId([{ type: "Special Fee", note:      DESC }], ORDER_ID)).not.toBeNull();
  });

  it("matches when the order ID is in the reference field instead", () => {
    const ledger = [{ type: "Special Fee", description: "FOB Order", reference: ORDER_ID }];
    expect(findLevyForOrderId(ledger, ORDER_ID)).toBe(ledger[0]);
  });

  it("matches case-insensitively", () => {
    const ledger = [{ type: "Special Fee", description: DESC.toLowerCase() }];
    expect(findLevyForOrderId(ledger, ORDER_ID)).toBe(ledger[0]);
  });

  it("returns null when no levy contains the order ID", () => {
    const ledger = [
      { type: "Special Fee", description: "FOB Order x 1 - Unit 1109 TOCS-OTHER-ORDER" },
      { type: "receipt",     description: DESC },
    ];
    expect(findLevyForOrderId(ledger, ORDER_ID)).toBeNull();
  });

  it("returns null for empty / falsy order ID", () => {
    expect(findLevyForOrderId([{ type: "Special Fee", description: DESC }], "")).toBeNull();
    expect(findLevyForOrderId([{ type: "Special Fee", description: DESC }], null)).toBeNull();
  });

  it("ignores receipts even when their description echoes the order ID", () => {
    const ledger = [
      { type: "receipt",     description: DESC, totalPaid: 50 },
      { type: "Special Fee", description: DESC, reference: "Ref #10882", totalDue: 50, totalPaid: 50 },
    ];
    const levy = findLevyForOrderId(ledger, ORDER_ID);
    expect(levy.type).toBe("Special Fee");
  });
});
