// test-email.mjs — Run with: node test-email.mjs
// Tests the SMTP connection and sends a sample order notification.
import nodemailer from "nodemailer";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config
let cfg;
try {
  cfg = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf8"));
} catch {
  console.error("❌  config.json not found. Run from the tocs-deploy directory.");
  process.exit(1);
}

const smtp = cfg.smtp || {};
const toEmail = cfg.orderEmail || "Orders@tocs.co";

if (!smtp.host || !smtp.user || !smtp.pass) {
  console.error("❌  SMTP not configured in config.json.");
  process.exit(1);
}

console.log(`\n📧  TOCS Email Test`);
console.log(`   Host   : ${smtp.host}:${smtp.port}`);
console.log(`   From   : ${smtp.user}`);
console.log(`   To     : ${toEmail}\n`);

// Sample order
const sampleOrder = {
  id: "TEST-" + Date.now(),
  date: new Date().toISOString(),
  total: 495.00,
  payment: "card",
  status: "pending",
  contactInfo: {
    name: "Test Customer",
    email: "test@example.com",
    phone: "0400 000 000",
    companyName: "Sample Law Firm Pty Ltd",
  },
  items: [
    { productName: "OC Certificate — Standard", ocName: "Owner Corporation A — Residential", price: 220 },
    { productName: "OC Certificate — Urgent",   ocName: "Owner Corporation B — Commercial",  price: 385 },
  ],
  lotAuthorityFile: null,
};

function buildHtml(order) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  let date = "—";
  try { date = new Date(order.date).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" }); } catch {}
  const payment = order.payment === "card" ? "Credit / Debit Card" : order.payment === "invoice" ? "Invoice" : order.payment || "—";
  const itemRows = items.map(item =>
    `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.productName || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.ocName || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(item.price||0).toFixed(2)}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;letter-spacing:0.05em;">TOCS Order Platform</h1>
      <p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">New Order Notification — TEST</p>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;background:#fff8e1;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:4px;">
        ⚠️ This is a <strong>test email</strong> from the TOCS Order Platform. No real order was placed.
      </p>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Details</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Order ID</td><td style="padding:6px 0;font-weight:600;">${order.id}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Date</td><td style="padding:6px 0;">${date}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Payment</td><td style="padding:6px 0;">${payment}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Total</td><td style="padding:6px 0;font-weight:700;font-size:1.1rem;color:#1c3326;">$${(order.total||0).toFixed(2)} AUD</td></tr>
      </table>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Customer Information</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Name</td><td style="padding:6px 0;">${contact.name||"—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;">${contact.email||"—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${contact.phone||"—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Company / Firm</td><td style="padding:6px 0;">${contact.companyName||"—"}</td></tr>
      </table>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Items</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f5f7f5;">
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Product</th>
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Owner Corporation</th>
          <th style="padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;">Price</th>
        </tr>
        ${itemRows}
        <tr style="background:#f5f7f5;">
          <td colspan="2" style="padding:8px 12px;font-weight:700;">Total</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;">$${(order.total||0).toFixed(2)} AUD</td>
        </tr>
      </table>
      <hr style="border:none;border-top:1px solid #e8edf0;margin:28px 0 20px;">
      <p style="font-size:0.78rem;color:#aaa;margin:0;">This is a test notification from the TOCS Order Platform.</p>
    </div>
  </div>
</body></html>`;
}

try {
  console.log("⏳  Connecting to SMTP server…");
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: Number(smtp.port) === 465,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: false },
  });

  console.log("⏳  Verifying credentials…");
  await transporter.verify();
  console.log("✅  SMTP connection verified.\n");

  console.log("⏳  Sending test email…");
  const info = await transporter.sendMail({
    from: `"TOCS Order Platform" <${smtp.user}>`,
    to: toEmail,
    subject: `[TEST] New Order #${sampleOrder.id} — $${sampleOrder.total.toFixed(2)} AUD`,
    html: buildHtml(sampleOrder),
  });

  console.log(`✅  Email sent successfully!`);
  console.log(`   Message ID : ${info.messageId}`);
  console.log(`   Accepted   : ${info.accepted?.join(", ")}`);
  console.log(`\n   Check ${toEmail} for the test email.\n`);
} catch (err) {
  console.error(`\n❌  Failed: ${err.message}`);
  if (err.code === "EAUTH") {
    console.error("   → Authentication failed. Check username/password.");
    console.error("   → If MFA is enabled, use an App Password instead.");
  } else if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") {
    console.error("   → Cannot reach SMTP server. Check host/port and network.");
  }
  process.exit(1);
}
