// POST /api/config/test-email — Send a test email using current SMTP settings (admin only)
// Accepts optional { smtp, orderEmail } in the request body to test without saving first.
import nodemailer from "nodemailer";
import { readConfig, validToken, extractToken, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const token = extractToken(req);
  if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

  // Use smtp values from request body if provided (test before saving),
  // otherwise fall back to what is stored in config.
  const body = req.body || {};
  const cfg = await readConfig();

  const MASKED = "••••••••";
  const smtp = {
    host: body.smtp?.host || cfg.smtp?.host,
    port: Number(body.smtp?.port || cfg.smtp?.port) || 2525,
    user: body.smtp?.user || cfg.smtp?.user,
    // If the frontend sends the masked placeholder, use the real stored password
    pass: (body.smtp?.pass && body.smtp.pass !== MASKED) ? body.smtp.pass : cfg.smtp?.pass,
  };
  const toEmail = body.orderEmail || cfg.orderEmail || "Orders@tocs.co";

  if (!smtp.host || !smtp.user || !smtp.pass) {
    return res.status(400).json({ error: "SMTP credentials incomplete. Please fill in Host, Username and Password." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });
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
