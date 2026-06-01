// api/orders/waituntil.test.js
// Verifies the response-latency optimisation: confirmation emails and
// SharePoint uploads are best-effort follow-ups, deferred via Vercel's
// `waitUntil` so the customer gets a sub-second response. Off-Vercel (tests,
// local server) the same work is awaited inline so nothing is silently dropped.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeReq, makeRes } from "../../test/request-factory.js";

// Hoisted shared handles so the module mocks can reach the per-test spies.
const h = vi.hoisted(() => ({ sendMail: vi.fn(), captured: [] }));

vi.mock("../_lib/store.js", () => ({
  readData:           vi.fn(async () => ({ orders: [], strataPlans: [] })),
  writeData:          vi.fn(async () => {}),
  readConfig:         vi.fn(async () => ({
    smtp: { host: "smtp.example.com", user: "u", pass: "p" },
    orderEmail: "orders@tocs.co",
    sharepoint: {},
  })),
  cors:               vi.fn(),
  writeAuthority:     vi.fn(async () => {}),
  writePiqPollStatus: vi.fn(async () => {}),
  readPiqPollStatus:  vi.fn(async () => null),
  rateLimit:          vi.fn(async () => ({ allowed: true })),
  clientIp:           vi.fn(() => "203.0.113.9"),
  validToken:         vi.fn(async () => true),
  KV_AVAILABLE:       false,
}));
vi.mock("../_lib/sharepoint.js", () => ({
  uploadToSharePoint: vi.fn(async () => null),
  SHAREPOINT_ENABLED: false,
  FOLDER_PATH:        "",
  sanitiseSegment:    vi.fn((s) => String(s || "")),
  pushAuditOnce:      vi.fn(),
}));
vi.mock("../_lib/pdf.js",   () => ({ generateOrderPdf: vi.fn(async () => Buffer.from("")) }));
vi.mock("../_lib/email.js", () => ({
  buildOrderEmailHtml:      vi.fn(() => "<html></html>"),
  buildCustomerEmailHtml:   vi.fn(() => "<html></html>"),
  buildPiqPaymentEmailHtml: vi.fn(() => "<html></html>"),
  createTransporter:        vi.fn(() => ({ sendMail: h.sendMail })),
}));
vi.mock("../_lib/piq.js",       () => ({ detectPiqPayment: vi.fn(async () => null) }));
vi.mock("../_lib/constants.js", () => ({ normaliseLotNumber: vi.fn((s) => String(s || "")) }));
vi.mock("stripe", () => ({ default: vi.fn(() => ({})) }));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn((p) => { h.captured.push(p); }) }));

const { default: handler } = await import("./index.js");
const { waitUntil } = await import("@vercel/functions");

function keysOrder() {
  return {
    order: {
      orderCategory: "keys",
      payment:       "invoice",
      total:         0,
      contactInfo:   { name: "Emma", email: "emma@example.com", phone: "1" },
      items: [{ productId: "K3", productName: "Garage Remote", price: 0, qty: 1, planId: "SP1", planName: "B" }],
    },
  };
}

describe("POST /api/orders — response latency deferral", () => {
  beforeEach(() => { h.sendMail.mockReset(); h.captured.length = 0; waitUntil.mockClear(); });
  afterEach(() => { delete process.env.VERCEL; });

  it("on Vercel: responds 200 without waiting for emails (waitUntil defers the work)", async () => {
    process.env.VERCEL = "1";
    // Email send never resolves — if the handler awaited it, this would hang.
    h.sendMail.mockImplementation(() => new Promise(() => {}));

    const res = makeRes();
    await handler(makeReq({ method: "POST", body: keysOrder() }), res);

    expect(res._status).toBe(200);
    expect(res._body.ok).toBe(true);
    // Background work was handed to waitUntil exactly once (emails + SP combined).
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(h.captured.length).toBe(1);
    expect(typeof h.captured[0].then).toBe("function");
    // Emails were still kicked off (best-effort), just not awaited.
    expect(h.sendMail).toHaveBeenCalled();
  });

  it("off Vercel: awaits background work inline — does not respond until it settles", async () => {
    delete process.env.VERCEL;
    h.sendMail.mockImplementation(() => new Promise(() => {})); // never resolves

    const res = makeRes();
    const handlerDone = handler(makeReq({ method: "POST", body: keysOrder() }), res).then(() => "done");

    // A bare microtask should settle before the handler, because the handler is
    // blocked awaiting the (never-resolving) email send inline.
    const sentinel = Symbol("pending");
    const winner = await Promise.race([handlerDone, Promise.resolve(sentinel)]);

    expect(winner).toBe(sentinel);
    expect(res._status).toBe(null);          // no response yet — still awaiting
    expect(waitUntil).not.toHaveBeenCalled(); // deferral path not taken off-Vercel
  });
});
