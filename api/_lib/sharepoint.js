// api/_lib/sharepoint.js — Microsoft SharePoint/OneDrive upload via Graph API
//
// Credentials can be supplied via:
//   A) Vercel environment variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, etc.)
//   B) Admin → Storage settings page (stored in Redis, passed as spConfig param)
// Option B takes priority so the admin can configure SharePoint without touching env vars.
//
// Azure App Registration API permissions required (Application, not Delegated):
//   Files.ReadWrite.All
//   Sites.ReadWrite.All
//   → Grant admin consent after adding

import { ClientSecretCredential } from "@azure/identity";

// Env-var fallbacks (used when Redis config is not set)
const TENANT_ID     = process.env.AZURE_TENANT_ID;
const CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SITE_ID       = process.env.SHAREPOINT_SITE_ID;
export const FOLDER_PATH = process.env.SHAREPOINT_FOLDER_PATH || "Top Owners Corporation Solution/ORDER DATABASE";

// True only when all required env vars are present (used as a quick check for env-var path)
export const SHAREPOINT_ENABLED = !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET && SITE_ID);

/**
 * Upload a file to SharePoint and return an organisation-scoped view link.
 * @param {string} filename       — Destination filename in SharePoint
 * @param {string} contentType    — MIME type of the file (e.g. "application/pdf")
 * @param {string} base64Data     — Base64-encoded file content
 * @param {object} [spConfig]     — SharePoint config from Redis (overrides env vars when provided)
 * @param {string} [subFolder]    — Optional subfolder appended to folderPath (e.g. order ID)
 *                                  When provided: {folderPath}/{subFolder}/{filename}
 *                                  When omitted:  {folderPath}/{filename}  (backward-compatible)
 * @returns {Promise<string|null>} SharePoint view URL, or null if upload failed / not configured
 */
export async function uploadToSharePoint(filename, contentType, base64Data, spConfig, subFolder = null) {
  // Redis config takes priority; fall back to env vars
  const tenantId     = spConfig?.tenantId     || TENANT_ID;
  const clientId     = spConfig?.clientId     || CLIENT_ID;
  const clientSecret = spConfig?.clientSecret || CLIENT_SECRET;
  const siteId       = spConfig?.siteId       || SITE_ID;
  const baseFolder   = spConfig?.folderPath   || FOLDER_PATH;
  const folderPath   = subFolder ? `${baseFolder}/${subFolder}` : baseFolder;

  if (!(tenantId && clientId && clientSecret && siteId)) return null;

  // Timeout for each Graph API HTTP call (ms). The PUT and createLink calls
  // are sequential — at 8000 ms each (16 s total) we'd routinely exceed
  // Vercel's 10 s function limit even on the happy-ish path. Tighten each to
  // 4500 ms (9 s combined worst case) so a slow Graph response surfaces as a
  // controllable upload failure, not a function timeout that kills the
  // surrounding handler.
  const GRAPH_TIMEOUT_MS = 4500;

  try {
    // Get OAuth2 token via client credentials (calls login.microsoftonline.com — fast ~1 s)
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
    const accessToken = tokenResponse.token;

    const fileBuffer = Buffer.isBuffer(base64Data) ? base64Data : Buffer.from(base64Data, "base64");
    // Encode each path segment so spaces/special chars in folder names are handled correctly
    const uploadPath = `${folderPath}/${filename}`;
    const encodedPath = uploadPath.split("/").map(s => encodeURIComponent(s)).join("/");

    console.log(`  📤  Uploading to SharePoint: ${uploadPath}`);

    // ── PUT upload via raw fetch + AbortController ────────────────────────────
    // The Graph SDK does NOT support AbortSignal, so fetch() is used directly.
    // Without AbortController the request hangs indefinitely from Vercel's network,
    // preventing the function from exiting and burning the full 10 s timeout.
    const putController = new AbortController();
    const putTimer = setTimeout(() => putController.abort(), GRAPH_TIMEOUT_MS);

    let driveItemId;
    try {
      const putRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": contentType || "application/octet-stream",
          },
          body: fileBuffer,
          signal: putController.signal,
        }
      );
      clearTimeout(putTimer);
      if (!putRes.ok) {
        const text = await putRes.text().catch(() => "");
        throw new Error(`Graph PUT ${putRes.status}: ${text.slice(0, 200)}`);
      }
      const driveItem = await putRes.json();
      driveItemId = driveItem.id;
    } catch (e) {
      clearTimeout(putTimer);
      throw e;
    }

    // ── Create shareable link ─────────────────────────────────────────────────
    const linkController = new AbortController();
    const linkTimer = setTimeout(() => linkController.abort(), GRAPH_TIMEOUT_MS);

    let url;
    try {
      const linkRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${driveItemId}/createLink`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ type: "view", scope: "organization" }),
          signal: linkController.signal,
        }
      );
      clearTimeout(linkTimer);
      if (!linkRes.ok) {
        const text = await linkRes.text().catch(() => "");
        throw new Error(`Graph createLink ${linkRes.status}: ${text.slice(0, 200)}`);
      }
      const linkResult = await linkRes.json();
      url = linkResult.link.webUrl;
    } catch (e) {
      clearTimeout(linkTimer);
      throw e;
    }

    console.log(`  🔗  SharePoint link: ${url}`);
    return url;

  } catch (err) {
    // Non-fatal — caller falls back to Redis storage
    const reason = err.name === "AbortError" ? `timed out after ${GRAPH_TIMEOUT_MS}ms` : err.message;
    console.error("  ❌  SharePoint upload failed:", reason);
    return null;
  }
}

/**
 * Resolve whether SharePoint is reachable for a given Redis-backed config.
 * Used by callers that need to decide whether to skip SP upload entirely.
 */
export function isSharePointEnabled(spConfig) {
  return SHAREPOINT_ENABLED || !!(spConfig?.tenantId && spConfig?.clientId && spConfig?.clientSecret && spConfig?.siteId);
}

// Append `{ ts, action, note }` to `auditLog`, but only if no entry with the
// same `action` exists within the last `withinMs` (default 24h). Returns true
// when an entry was actually pushed. Used to keep webhook retries from
// flooding the audit log with hundreds of duplicate "SP upload failed" rows
// while SharePoint creds are misconfigured.
export function pushAuditOnce(auditLog, action, note, withinMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - withinMs;
  const hasRecent = (auditLog || []).some(e => {
    if (e?.action !== action) return false;
    const t = e.ts ? Date.parse(e.ts) : 0;
    return Number.isFinite(t) && t >= cutoff;
  });
  if (hasRecent) return false;
  auditLog.push({ ts: new Date().toISOString(), action, note });
  return true;
}

// Sanitise a single SharePoint path segment. Strips the OneDrive / Graph
// reserved characters and any leading/trailing dots or whitespace (which
// SharePoint also forbids). A segment that collapses to empty or to a string
// of dots ("..", "...") would resolve as a parent-directory reference under
// Graph's `root:/{path}:/content` API and let user-controlled fields (e.g.
// `planName` submitted at order creation, or an authority-doc filename) write
// files outside the configured base folder — so any segment that ends up
// empty after sanitisation falls back to the supplied default.
// Unicode format / bidi / zero-width / invisible chars to strip. Targets:
//   - RTL override (U+202E) and zero-width joiners — UI/audit-log spoofs
//   - Soft hyphen (U+00AD) — classic invisible-in-rendered-text spoof
//   - Unicode "Tags" plane (U+E0000–U+E007F) — invisible by design
// Built as an explicit-escape RegExp so the source file stays ASCII-only.
// Note: the Tags block is in a supplementary plane (above U+FFFF) so we use
// the `u` flag and a surrogate-pair-aware range.
const BIDI_FORMAT_CHARS_RE = new RegExp(
  "[" +
  "\\u00AD" +          // soft hyphen
  "\\u200B-\\u200F" +  // zero-width space / non-joiner / joiner / LRM / RLM
  "\\u202A-\\u202E" +  // LRE / RLE / PDF / LRO / RLO
  "\\u2066-\\u2069" +  // LRI / RLI / FSI / PDI
  "\\uFEFF" +          // zero-width no-break space
  "\\u{E0000}-\\u{E007F}" + // Tags plane (invisible language tags + cancellable chars)
  "]",
  "gu",
);

export function sanitiseSegment(raw, fallback) {
  let s = String(raw ?? "");
  // NFKC normalise so visually-identical Unicode (fullwidth dots, ligatures)
  // collapses to its ASCII form before dot-stripping runs.
  try { s = s.normalize("NFKC"); } catch { /* ancient runtime — ignore */ }
  // Reserved ASCII + C0 / C1 control chars.
  s = s.replace(/[\\/:*?"<>|\x00-\x1f\x7f-\x9f]/g, "-");
  // Unicode bidi / zero-width / format chars — not a traversal vector under
  // Graph's path resolver, but a phishing/spoof primitive in audit surfaces.
  s = s.replace(BIDI_FORMAT_CHARS_RE, "-");
  s = s.replace(/^[.\s]+|[.\s]+$/g, "").trim();
  if (!s) return fallback;
  return s;
}

/**
 * Compute the per-order SharePoint subfolder path:
 *   {sanitised building name}/{OC-Certificates | Keys-Fobs}/{orderId}
 */
export function orderSharePointSubFolder(order) {
  const categoryFolder = order.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
  const buildingName = sanitiseSegment(order.items?.[0]?.planName, "Unknown Building");
  const orderId = sanitiseSegment(order.id, "unknown-order");
  return `${buildingName}/${categoryFolder}/${orderId}`;
}

/**
 * Upload an order's documents (authority doc, generated order-summary PDF, and
 * optionally a payment-receipt PDF) to SharePoint and return the per-document
 * results. Pure — does not touch Redis/audit log; the caller is responsible
 * for persisting URLs and writing audit entries.
 *
 * @param {object} order
 * @param {object} spConfig
 * @param {object} pdf            — { generateOrderPdf, generateReceiptPdf } from _lib/pdf.js
 * @param {object} [opts]
 * @param {object} [opts.authDoc] — { data: base64, filename, contentType } (optional)
 * @param {boolean}[opts.includeSummary] — generate + upload order-summary.pdf (default true)
 * @param {boolean}[opts.includeReceipt] — also upload payment-receipt.pdf
 * @param {string} [opts.stripeSessionId] — Stripe session for receipt header
 * @returns {Promise<{ authUrl: string|null, summaryUrl: string|null, receiptUrl: string|null, errors: object }>}
 */
export async function uploadOrderDocs(order, spConfig, pdf, opts = {}) {
  const subFolder = orderSharePointSubFolder(order);
  const errors = {};
  const includeSummary = opts.includeSummary !== false;

  const summaryPromise = includeSummary
    ? (async () => {
        try {
          const buf = await pdf.generateOrderPdf(order);
          return await uploadToSharePoint("order-summary.pdf", "application/pdf", buf.toString("base64"), spConfig, subFolder);
        } catch (e) { errors.summary = e; return null; }
      })()
    : Promise.resolve(null);

  // Filename is user-supplied at order-creation time and persists in Redis;
  // sanitise as a path segment to block `../` traversal before concatenating.
  const authFilename = `authority-${sanitiseSegment(opts.authDoc?.filename, "document")}`;
  const authPromise = opts.authDoc?.data
    ? uploadToSharePoint(
        authFilename,
        opts.authDoc.contentType || "application/octet-stream",
        opts.authDoc.data,
        spConfig,
        subFolder
      ).catch(e => { errors.auth = e; return null; })
    : Promise.resolve(null);

  const receiptPromise = opts.includeReceipt
    ? (async () => {
        try {
          const buf = await pdf.generateReceiptPdf(order, opts.stripeSessionId);
          return await uploadToSharePoint("payment-receipt.pdf", "application/pdf", buf.toString("base64"), spConfig, subFolder);
        } catch (e) { errors.receipt = e; return null; }
      })()
    : Promise.resolve(null);

  const [summaryUrl, authUrl, receiptUrl] = await Promise.all([summaryPromise, authPromise, receiptPromise]);
  return { authUrl, summaryUrl, receiptUrl, errors };
}
