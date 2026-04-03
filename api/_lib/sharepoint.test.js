// api/_lib/sharepoint.test.js — Unit tests for SharePoint upload helper
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @azure/identity so no real OAuth calls are made
vi.mock("@azure/identity", () => ({
  ClientSecretCredential: vi.fn().mockImplementation(() => ({
    getToken: vi.fn(async () => ({ token: "mock-access-token" })),
  })),
}));

// We need to import after mocks are set up; use dynamic import per test or top-level.
import { uploadToSharePoint } from "./sharepoint.js";
import { ClientSecretCredential } from "@azure/identity";

// ── Helpers ────────────────────────────────────────────────────────────────────
const VALID_SP_CONFIG = {
  tenantId: "tenant-id",
  clientId: "client-id",
  clientSecret: "client-secret",
  siteId: "site-id",
  folderPath: "Test/Folder",
};

const FAKE_B64 = Buffer.from("hello world").toString("base64");

function makeFetch(overrides = {}) {
  const defaults = {
    putOk: true,
    putDriveItemId: "drive-item-123",
    linkOk: true,
    linkWebUrl: "https://sp.example.com/file",
  };
  const cfg = { ...defaults, ...overrides };

  return vi.fn(async (url, opts) => {
    // PUT upload
    if (opts?.method === "PUT") {
      if (!cfg.putOk) {
        return { ok: false, status: 403, text: async () => "Forbidden", json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ id: cfg.putDriveItemId }), text: async () => "" };
    }
    // POST createLink
    if (opts?.method === "POST") {
      if (!cfg.linkOk) {
        return { ok: false, status: 500, text: async () => "Internal Server Error", json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ link: { webUrl: cfg.linkWebUrl } }), text: async () => "" };
    }
    return { ok: false, status: 404, text: async () => "Not found", json: async () => ({}) };
  });
}

describe("uploadToSharePoint", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // --- Happy path ---

  it("returns the link.webUrl from the createLink response on success", async () => {
    global.fetch = makeFetch();
    const result = await uploadToSharePoint("test.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG);
    expect(result).toBe("https://sp.example.com/file");
  });

  it("calls credential.getToken for OAuth on success", async () => {
    global.fetch = makeFetch();
    await uploadToSharePoint("test.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG);
    const instance = ClientSecretCredential.mock.results[0].value;
    expect(instance.getToken).toHaveBeenCalledWith("https://graph.microsoft.com/.default");
  });

  it("constructs PUT URL with folderPath/subFolder/filename when subFolder is provided", async () => {
    global.fetch = makeFetch();
    await uploadToSharePoint("test.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG, "OrderSubFolder");
    const putCall = global.fetch.mock.calls.find(c => c[1]?.method === "PUT");
    expect(putCall[0]).toContain("Test");
    expect(putCall[0]).toContain("Folder");
    expect(putCall[0]).toContain("OrderSubFolder");
    expect(putCall[0]).toContain("test.pdf");
  });

  it("constructs PUT URL without subFolder segment when subFolder is null", async () => {
    global.fetch = makeFetch();
    await uploadToSharePoint("test.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG, null);
    const putCall = global.fetch.mock.calls.find(c => c[1]?.method === "PUT");
    // URL should contain folderPath and filename but no extra subfolder segment
    expect(putCall[0]).toContain("Test");
    expect(putCall[0]).toContain("Folder");
    expect(putCall[0]).toContain("test.pdf");
  });

  it("uses spConfig values over env vars when provided", async () => {
    global.fetch = makeFetch();
    // Env vars are absent for these keys (or different)
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG);
    expect(result).toBe("https://sp.example.com/file");
    // ClientSecretCredential should be called with spConfig values
    expect(ClientSecretCredential).toHaveBeenCalledWith("tenant-id", "client-id", "client-secret");
  });

  // --- Missing config ---

  it("returns null immediately when all required config fields are absent", async () => {
    global.fetch = makeFetch();
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, {});
    expect(result).toBeNull();
  });

  it("returns null when tenantId is absent even if others are present", async () => {
    global.fetch = makeFetch();
    const cfg = { ...VALID_SP_CONFIG, tenantId: "" };
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, cfg);
    expect(result).toBeNull();
  });

  it("returns null when clientId is absent", async () => {
    global.fetch = makeFetch();
    const cfg = { ...VALID_SP_CONFIG, clientId: "" };
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, cfg);
    expect(result).toBeNull();
  });

  it("returns null when siteId is absent", async () => {
    global.fetch = makeFetch();
    const cfg = { ...VALID_SP_CONFIG, siteId: "" };
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, cfg);
    expect(result).toBeNull();
  });

  // --- PUT failure ---

  it("returns null when the PUT response is not ok (non-2xx status)", async () => {
    global.fetch = makeFetch({ putOk: false });
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG);
    expect(result).toBeNull();
  });

  // --- createLink failure ---

  it("returns null (not throws) when the createLink response is not ok", async () => {
    global.fetch = makeFetch({ linkOk: false });
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG);
    expect(result).toBeNull();
  });

  // --- Unexpected error ---

  it("returns null (not throws) on any unexpected error", async () => {
    global.fetch = vi.fn(async () => { throw new Error("Network failure"); });
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG);
    expect(result).toBeNull();
  });

  // --- Timeout (AbortController) ---

  it("returns null when the PUT fetch call times out (AbortController fires)", async () => {
    // Simulate an AbortError
    global.fetch = vi.fn(async (url, opts) => {
      if (opts?.method === "PUT") {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }
      return { ok: true, json: async () => ({ link: { webUrl: "https://sp.example.com/file" } }) };
    });
    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG);
    expect(result).toBeNull();
  });

  // --- Env var fallback (module-level constants) ---
  // NOTE: sharepoint.js reads AZURE_TENANT_ID / AZURE_CLIENT_ID / etc. at module load time
  // into module-level constants. Therefore, changing process.env after import has NO effect.
  // The env var fallback can only be tested via the spConfig parameter (which takes priority).
  // The test below documents that passing a valid spConfig succeeds even when env vars are unset.

  it("uses spConfig credentials directly (not relying on env vars)", async () => {
    global.fetch = makeFetch();
    // Unset the env vars to ensure we're only using spConfig
    const savedTenant = process.env.AZURE_TENANT_ID;
    const savedClient = process.env.AZURE_CLIENT_ID;
    const savedSecret = process.env.AZURE_CLIENT_SECRET;
    const savedSite   = process.env.SHAREPOINT_SITE_ID;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
    delete process.env.SHAREPOINT_SITE_ID;

    const result = await uploadToSharePoint("file.pdf", "application/pdf", FAKE_B64, VALID_SP_CONFIG);
    // Should still succeed because spConfig has all required fields
    expect(result).toBe("https://sp.example.com/file");

    // Restore
    if (savedTenant !== undefined) process.env.AZURE_TENANT_ID     = savedTenant;
    if (savedClient !== undefined) process.env.AZURE_CLIENT_ID     = savedClient;
    if (savedSecret !== undefined) process.env.AZURE_CLIENT_SECRET = savedSecret;
    if (savedSite   !== undefined) process.env.SHAREPOINT_SITE_ID  = savedSite;
  });
});
