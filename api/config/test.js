// POST /api/config/test?service=email|sharepoint — Admin: test SMTP or SharePoint config
// Merged from test-email.js and test-sharepoint.js to stay within Vercel Hobby 12-function limit.
import { readConfig, validToken, extractToken, cors } from "../_lib/store.js";
import { createTransporter } from "../_lib/email.js";
import { ClientSecretCredential } from "@azure/identity";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const token = extractToken(req);
  if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

  const service = req.query?.service || req.body?.service;

  // ── Test SMTP / email ──────────────────────────────────────────────────────
  if (service === "email") {
    const body = req.body || {};
    const cfg  = await readConfig();

    const MASKED = "••••••••";
    const smtp = {
      host: body.smtp?.host || cfg.smtp?.host,
      port: Number(body.smtp?.port || cfg.smtp?.port) || 2525,
      user: body.smtp?.user || cfg.smtp?.user,
      pass: (body.smtp?.pass && body.smtp.pass !== MASKED) ? body.smtp.pass : cfg.smtp?.pass,
    };
    const toEmail = body.orderEmail || cfg.orderEmail || "Orders@tocs.co";

    if (!smtp.host || !smtp.user || !smtp.pass) {
      return res.status(400).json({ error: "SMTP credentials incomplete. Please fill in Host, Username and Password." });
    }

    try {
      const transporter = createTransporter(smtp);
      await transporter.verify();
      await transporter.sendMail({
        from: `"TOCS Order Portal" <${toEmail}>`,
        to: toEmail,
        subject: "[TEST] TOCS Order Portal — SMTP Test",
        html: `<div style="font-family:Arial,sans-serif;padding:32px;max-width:500px">
          <h2 style="color:#1c3326;">SMTP Test Successful ✅</h2>
          <p>This is a test email from the TOCS Order Portal.</p>
          <p>Your SMTP server is correctly configured. Real order notifications will be sent to <strong>${toEmail}</strong>.</p>
          <hr style="border:none;border-top:1px solid #e8edf0;margin:20px 0">
          <p style="font-size:0.78rem;color:#aaa;">Sent from ${smtp.host}:${smtp.port} via ${smtp.user}</p>
        </div>`,
      });
      return res.status(200).json({ ok: true, sentTo: toEmail });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Test SharePoint ────────────────────────────────────────────────────────
  if (service === "sharepoint") {
    const cfg = await readConfig();
    const sp  = cfg?.sharepoint || {};
    const { tenantId, clientId, clientSecret, siteId, folderPath } = sp;

    if (!(tenantId && clientId && clientSecret && siteId)) {
      return res.status(200).json({ ok: false, step: "config", error: "Missing one or more SP credentials (tenantId, clientId, clientSecret, siteId)" });
    }

    let accessToken;
    try {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
      accessToken = tokenResponse.token;
    } catch (e) {
      return res.status(200).json({ ok: false, step: "auth", error: e.message });
    }

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

  return res.status(400).json({ error: "Missing or invalid ?service= parameter. Use 'email' or 'sharepoint'." });
}
