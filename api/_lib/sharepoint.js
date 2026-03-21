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

  // Timeout for each Graph API HTTP call (ms). Must leave room within Vercel's 10 s limit.
  const GRAPH_TIMEOUT_MS = 8000;

  try {
    // Get OAuth2 token via client credentials (calls login.microsoftonline.com — fast ~1 s)
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
    const accessToken = tokenResponse.token;

    const fileBuffer = Buffer.from(base64Data, "base64");
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
