import { readConfig, writeConfig, validToken, extractToken, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = extractToken(req);
  if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

  if (req.method === "GET") {
    try {
      const cfg = await readConfig();
      const smtp = cfg.smtp || {};
      const pd   = cfg.paymentDetails || {};
      const et   = cfg.emailTemplate || {};
      const sp   = cfg.sharepoint || {};
      return res.status(200).json({
        orderEmail: cfg.orderEmail || "Orders@tocs.co",
        logo: cfg.logo || "",
        smtp: { host: smtp.host || "mail-au.smtp2go.com", port: smtp.port || 2525, user: smtp.user || "OCCAPP", pass: smtp.pass ? "••••••••" : "" },
        paymentDetails: { accountName: pd.accountName || "Top Owners Corporation", bsb: pd.bsb || "033-065", accountNumber: pd.accountNumber || "522011", payid: pd.payid || "accounts@tocs.com.au" },
        emailTemplate: { certificateSubject: et.certificateSubject || "Your OC Certificate — Order #{orderId}", certificateGreeting: et.certificateGreeting || "", footer: et.footer || "" },
        sharepoint: {
          tenantId:     sp.tenantId     || "",
          clientId:     sp.clientId     || "",
          clientSecret: sp.clientSecret ? "••••••••" : "",
          siteId:       sp.siteId       || "",
          folderPath:   sp.folderPath   || "TOCS-Orders/Authority-Documents",
        },
      });
    } catch (err) {
      return res.status(500).json({ error: "Failed to load settings: " + err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const { orderEmail, logo, smtp, paymentDetails, emailTemplate, sharepoint } = req.body || {};
      const cfg = await readConfig();
      if (orderEmail !== undefined) cfg.orderEmail = orderEmail;
      if (logo !== undefined) cfg.logo = logo;
      if (smtp && typeof smtp === "object") {
        cfg.smtp = cfg.smtp || {};
        if (smtp.host !== undefined) cfg.smtp.host = smtp.host;
        if (smtp.port !== undefined) cfg.smtp.port = Number(smtp.port) || 2525;
        if (smtp.user !== undefined) cfg.smtp.user = smtp.user;
        if (smtp.pass !== undefined && smtp.pass !== "••••••••") cfg.smtp.pass = smtp.pass;
      }
      if (paymentDetails && typeof paymentDetails === "object") cfg.paymentDetails = { ...cfg.paymentDetails, ...paymentDetails };
      if (emailTemplate  && typeof emailTemplate  === "object") cfg.emailTemplate  = { ...cfg.emailTemplate,  ...emailTemplate  };
      if (sharepoint && typeof sharepoint === "object") {
        cfg.sharepoint = cfg.sharepoint || {};
        if (sharepoint.tenantId   !== undefined) cfg.sharepoint.tenantId   = sharepoint.tenantId;
        if (sharepoint.clientId   !== undefined) cfg.sharepoint.clientId   = sharepoint.clientId;
        // Only update clientSecret if a real value is provided (not the masked placeholder)
        if (sharepoint.clientSecret !== undefined && sharepoint.clientSecret !== "••••••••") cfg.sharepoint.clientSecret = sharepoint.clientSecret;
        if (sharepoint.siteId      !== undefined) cfg.sharepoint.siteId     = sharepoint.siteId;
        if (sharepoint.folderPath  !== undefined) cfg.sharepoint.folderPath = sharepoint.folderPath;
      }
      await writeConfig(cfg);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to save settings: " + err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
