// GET /api/config/public — Public config (payment details) for checkout flow
import { readConfig, cors, DEMO_MODE } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  const cfg = await readConfig();
  const pd = cfg.paymentDetails || {};
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const pm = cfg.paymentMethods || {};
  const sp = cfg.sharepoint || {};
  return res.status(200).json({
    logo: cfg.logo || "",
    stripeEnabled: !!(cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY),
    bankEnabled:   pm.bankEnabled  !== false,
    payidEnabled:  pm.payidEnabled !== false,
    demoMode:      DEMO_MODE,
    // Whether SharePoint archival is wired up. Boolean only — no secrets.
    // The admin UI uses this to hide the "↑ Save to SharePoint" button on
    // deployments without SP creds (e.g. local dev, demo) where the action
    // would otherwise 400 with "SharePoint is not configured".
    sharepointEnabled: !!((sp.tenantId && sp.clientId && sp.clientSecret && sp.siteId)
      || (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.SHAREPOINT_SITE_ID)),
    paymentDetails: {
      accountName: pd.accountName || "Top Owners Corporation",
      bsb: pd.bsb || "033-065",
      accountNumber: pd.accountNumber || "522011",
      payid: pd.payid || "accounts@tocs.com.au",
    },
  });
}
