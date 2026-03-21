// POST /api/config/test-sharepoint — Admin: test SharePoint credentials
import { readConfig, cors } from "../_lib/store.js";
import { ClientSecretCredential } from "@azure/identity";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const auth = req.headers.authorization?.split(" ")[1];
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const cfg = await readConfig();
  const sp  = cfg?.sharepoint || {};

  const tenantId     = sp.tenantId;
  const clientId     = sp.clientId;
  const clientSecret = sp.clientSecret;
  const siteId       = sp.siteId;
  const folderPath   = sp.folderPath;

  if (!(tenantId && clientId && clientSecret && siteId)) {
    return res.status(200).json({ ok: false, step: "config", error: "Missing one or more SP credentials (tenantId, clientId, clientSecret, siteId)" });
  }

  // Step 1 — get OAuth token
  let accessToken;
  try {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
    accessToken = tokenResponse.token;
  } catch (e) {
    return res.status(200).json({ ok: false, step: "auth", error: e.message });
  }

  // Step 2 — read the SharePoint site (lightweight GET, no file ops)
  try {
    const siteRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!siteRes.ok) {
      const body = await siteRes.text().catch(() => "");
      return res.status(200).json({ ok: false, step: "site_read", httpStatus: siteRes.status, error: body.slice(0, 500) });
    }
    const site = await siteRes.json();

    // Step 3 — list drive root (verifies Files.ReadWrite.All permission)
    const driveRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children?$top=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!driveRes.ok) {
      const body = await driveRes.text().catch(() => "");
      return res.status(200).json({ ok: false, step: "drive_read", httpStatus: driveRes.status, error: body.slice(0, 500) });
    }

    return res.status(200).json({
      ok: true,
      siteName: site.displayName,
      siteWebUrl: site.webUrl,
      folderPath,
      message: "Credentials valid — site accessible and drive readable",
    });
  } catch (e) {
    return res.status(200).json({ ok: false, step: "graph_call", error: e.message });
  }
}
