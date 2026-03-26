// server.js — TOCS OC Portal with persistence + REST API
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST         = path.join(__dirname, "dist");
const DATA_FILE    = path.join(__dirname, "data.json");
const CONFIG_FILE  = path.join(__dirname, "config.json");
const UPLOADS_DIR  = path.join(__dirname, "uploads");
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Default seed data ─────────────────────────────────────────────────────────
const DEFAULT_DATA = {
  strataPlans: [
    {
      id: "SP12345",
      name: "Harbour View Residences",
      address: "45 Marina Drive, Sydney NSW 2000",
      lots: [
        { id: "L1", number: "Lot 1",              level: "Ground",   type: "Residential", ownerCorps: ["OC-A"] },
        { id: "L2", number: "Lot 2",              level: "Level 1",  type: "Residential", ownerCorps: ["OC-A"] },
        { id: "L3", number: "Lot 3",              level: "Level 2",  type: "Residential", ownerCorps: ["OC-A"] },
        { id: "L4", number: "Lot 4",              level: "Level 3",  type: "Residential", ownerCorps: ["OC-A","OC-B"] },
        { id: "L5", number: "Lot 5",              level: "Level 4",  type: "Commercial",  ownerCorps: ["OC-B"] },
        { id: "L6", number: "Lot 6",              level: "Level 5",  type: "Commercial",  ownerCorps: ["OC-B"] },
        { id: "L7", number: "Lot 7 (Parking)",    level: "Basement", type: "Parking",     ownerCorps: ["OC-A","OC-B"] },
      ],
      ownerCorps: {
        "OC-A": { name: "Owner Corporation A — Residential", levy: 1200 },
        "OC-B": { name: "Owner Corporation B — Commercial",  levy: 2400 },
      },
      products: [
        { id:"P1", name:"OC Certificate — Standard",           description:"s151 SMA Owner Corporation Certificate",            price:220, secondaryPrice:150, turnaround:"5 business days",   perOC:true  },
        { id:"P2", name:"OC Certificate — Urgent",             description:"Priority processing, 24–48 hour turnaround",        price:385, secondaryPrice:280, turnaround:"1–2 business days", perOC:true  },
        { id:"P3", name:"Register of Owners Search",           description:"Current register of lot owners and addresses",      price: 55,                    turnaround:"3 business days",   perOC:false },
        { id:"P4", name:"Insurance Certificate of Currency",   description:"Current building insurance details and certificate",price: 75,                    turnaround:"2 business days",   perOC:false },
        { id:"P5", name:"Meeting Minutes — Last 2 Years",      description:"Minutes of AGM and general meetings",              price:110,                    turnaround:"5 business days",   perOC:false },
        { id:"P6", name:"Financial Statements",                description:"Latest audited financial statements",               price: 95,                    turnaround:"5 business days",   perOC:false },
      ],
      active: true,
    },
  ],
  orders: [],
};

const DEFAULT_CONFIG = {
  admins: [{ id: "default", username: "info@tocs.co", password: "Tocs@Vote", name: "Admin" }],
  admin: { user: "info@tocs.co", pass: "Tocs@Vote" }, // legacy — kept for backward compat
  orderEmail: "Orders@tocs.co",
  smtp: { host: "mail-au.smtp2go.com", port: 2525, user: "OCCAPP", pass: "" },
  paymentDetails: {
    accountName: "Top Owners Corporation",
    bsb: "033-065",
    accountNumber: "522011",
    payid: "accounts@tocs.com.au",
  },
  emailTemplate: {
    certificateSubject: "Your OC Certificate — Order #{orderId}",
    certificateGreeting: "Dear {name},\n\nPlease find attached your Owner Corporation Certificate for Lot {lotNumber} at {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team",
    footer: "Top Owners Corporation Solution  |  info@tocs.co",
  },
};

// ── In-memory sessions  Map<token, { user, exp }> ─────────────────────────────
const SESSIONS = new Map();

function genToken() {
  return crypto.randomBytes(32).toString("hex");
}
function validToken(token) {
  if (!token) return false;
  const s = SESSIONS.get(token);
  if (!s) return false;
  if (Date.now() > s.exp) { SESSIONS.delete(token); return false; }
  return true;
}
function getSessionUser(token) {
  const s = SESSIONS.get(token);
  return (s && Date.now() <= s.exp) ? s.user : null;
}
// Returns the admins array from cfg, migrating from legacy cfg.admin if needed.
function getAdmins(cfg) {
  if (Array.isArray(cfg.admins) && cfg.admins.length > 0) return cfg.admins;
  return [{ id: "legacy", username: cfg.admin?.user || "info@tocs.co", password: cfg.admin?.pass || "Tocs@Vote", name: "Admin" }];
}

// ── File helpers ──────────────────────────────────────────────────────────────
function readData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    // Back-fill status on legacy orders that pre-date the status field
    if (Array.isArray(d.orders)) {
      d.orders = d.orders.map(o => o.status ? o : { ...o, status: "Pending Payment" });
    }
    return d;
  } catch { return structuredClone(DEFAULT_DATA); }
}
function writeData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch {
    writeConfig(DEFAULT_CONFIG); return structuredClone(DEFAULT_CONFIG);
  }
}
function writeConfig(c) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2)); }

// ── Email helpers ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function buildOrderEmailHtml(order, tpl) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  let date = "—";
  try { date = new Date(order.date).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" }); } catch {}
  const payment = order.payment === "card" ? "Credit / Debit Card" : order.payment === "invoice" ? "Invoice" : order.payment || "—";
  const introText = esc(tpl?.adminNotificationIntro || "A new order has been placed on the TOCS Owner Corporation Certificate Portal. Please review and process it at your earliest convenience.");

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${esc(item.productName || item.name) || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${esc(item.ocName) || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(item.price || 0).toFixed(2)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;letter-spacing:0.05em;">TOCS Order Portal</h1>
      <p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">New Order Notification</p>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;">${introText}</p>

      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Details</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Order ID</td><td style="padding:6px 0;font-weight:600;">${esc(order.id) || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Date</td><td style="padding:6px 0;">${date}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Payment</td><td style="padding:6px 0;">${payment}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Total</td><td style="padding:6px 0;font-weight:700;font-size:1.1rem;color:#1c3326;">$${(order.total || 0).toFixed(2)} AUD</td></tr>
      </table>

      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Customer Information</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Name</td><td style="padding:6px 0;">${esc(contact.name) || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${esc(contact.email)}" style="color:#2e6b42;">${esc(contact.email) || "—"}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${esc(contact.phone) || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Company / Firm</td><td style="padding:6px 0;">${esc(contact.companyName) || "—"}</td></tr>
      </table>

      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Items</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f5f7f5;">
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;letter-spacing:0.04em;">Product</th>
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;letter-spacing:0.04em;">Owner Corporation</th>
          <th style="padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;letter-spacing:0.04em;">Price</th>
        </tr>
        ${itemRows}
        <tr style="background:#f5f7f5;">
          <td colspan="2" style="padding:8px 12px;font-weight:700;font-size:0.95rem;">Total</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;font-size:0.95rem;">$${(order.total || 0).toFixed(2)} AUD</td>
        </tr>
      </table>

      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Lot Authority Document</h3>
      <p style="margin-top:8px;">${order.lotAuthorityFile ? `<strong>${esc(order.lotAuthorityFile)}</strong> has been uploaded and saved.` : "No lot authority document was provided."}</p>

      <hr style="border:none;border-top:1px solid #e8edf0;margin:28px 0 20px;">
      <p style="font-size:0.78rem;color:#aaa;margin:0;">This is an automated notification from the TOCS Order Portal. Please do not reply to this email.</p>
    </div>
  </div>
</body></html>`;
}

// ── Customer confirmation email ───────────────────────────────────────────────
function buildCustomerEmailHtml(order, cfg) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  const pd = cfg.paymentDetails || {};
  let date = "—";
  try { date = new Date(order.date).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" }); } catch {}
  const isPending = order.payment === "bank" || order.payment === "payid";
  const itemRows = items.map(item =>
    `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${esc(item.productName) || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${esc(item.ocName) || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(item.price||0).toFixed(2)}</td>
    </tr>`).join("");
  const bankRows = order.payment === "bank" ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;">
      <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;">Bank Transfer Details</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
        <tr><td style="padding:4px 0;color:#666;width:38%;">Account Name</td><td style="padding:4px 0;font-weight:600;">${esc(pd.accountName||"")}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">BSB</td><td style="padding:4px 0;font-weight:600;">${esc(pd.bsb||"")}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Account Number</td><td style="padding:4px 0;font-weight:600;">${esc(pd.accountNumber||"")}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${esc(order.id)}</td></tr>
      </table>
    </div>` : order.payment === "payid" ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;">
      <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;">PayID Details</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
        <tr><td style="padding:4px 0;color:#666;width:38%;">PayID</td><td style="padding:4px 0;font-weight:600;">${esc(pd.payid||"")}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${esc(order.id)}</td></tr>
      </table>
    </div>` : "";

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;letter-spacing:0.05em;">TOCS Order Portal</h1>
      <p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">Order Confirmation</p>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;">Dear ${esc(contact.name) || "Applicant"},</p>
      <p>Thank you for your order. ${isPending ? "Your order has been received and is <strong>awaiting payment</strong>. Certificate processing will begin once payment is confirmed." : "Your payment has been received and your certificate(s) will be processed within the stated turnaround time."}</p>
      <div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:12px 16px;border-radius:4px;margin:20px 0;">
        <div style="font-size:0.78rem;color:#666;margin-bottom:4px;">Your order reference number</div>
        <div style="font-family:monospace;font-size:1.2rem;font-weight:700;color:#1c3326;">${esc(order.id)}</div>
        <div style="font-size:0.75rem;color:#666;margin-top:4px;">Please keep this for your records. Use it as your payment reference for bank transfers.</div>
      </div>
      ${bankRows}
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Summary</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        <tr style="background:#f5f7f5;">
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Product</th>
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Owner Corporation</th>
          <th style="padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;">Price</th>
        </tr>
        ${itemRows}
        <tr><td colspan="2" style="padding:8px 12px;font-size:0.78rem;color:#666;">GST (10%) included</td><td style="padding:8px 12px;text-align:right;font-size:0.78rem;color:#666;">$${((order.total||0)/11).toFixed(2)}</td></tr>
        <tr style="background:#f5f7f5;"><td colspan="2" style="padding:8px 12px;font-weight:700;">Total (incl. GST)</td><td style="padding:8px 12px;text-align:right;font-weight:700;font-size:1.05rem;color:#1c3326;">$${(order.total||0).toFixed(2)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #e8edf0;margin:28px 0 16px;">
      <p style="font-size:0.8rem;color:#555;margin:0;">If you have any questions about your order, please contact us at <a href="mailto:${esc(cfg.orderEmail||'info@tocs.co')}" style="color:#2e6b42;">${esc(cfg.orderEmail||'info@tocs.co')}</a> quoting your order reference number.</p>
    </div>
  </div>
</body></html>`;
}

// ── Certificate delivery email ─────────────────────────────────────────────────
function buildCertEmailHtml(order, message, cfg) {
  const tpl = cfg.emailTemplate || {};
  const contact = order.contactInfo || {};
  const lot = order.items?.[0];
  const raw = (tpl.certificateGreeting || "Dear {name},\n\nPlease find attached your OC Certificate.\n\nKind regards,\nTOCS Team")
    .replace(/{name}/g, esc(contact.name || "Applicant"))
    .replace(/{lotNumber}/g, esc(lot?.lotNumber || ""))
    .replace(/{address}/g, esc(lot?.planName || ""));
  const bodyText = message || raw;
  const htmlBody = esc(bodyText).replace(/\n/g, "<br>");
  const footer = esc(tpl.footer || "Top Owners Corporation Solution  |  info@tocs.co").replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;letter-spacing:0.05em;">Top Owners Corporation Solution</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;">${htmlBody}</p>
      <div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:10px 16px;border-radius:4px;margin:20px 0;font-size:0.83rem;">
        Order Reference: <strong style="font-family:monospace;">${esc(order.id)}</strong>
      </div>
      <hr style="border:none;border-top:1px solid #e8edf0;margin:24px 0 16px;">
      <p style="font-size:0.78rem;color:#aaa;margin:0;">${footer}</p>
    </div>
  </div>
</body></html>`;
}

// ── Send admin notification (with optional authority doc attachment) ────────────
async function sendOrderEmail(order, cfg, authorityBuf, authorityFilename) {
  const smtp = cfg.smtp || {};
  if (!smtp.host || !smtp.user || !smtp.pass) {
    console.log("  ⚠️   SMTP not configured — skipping email send. Configure SMTP in Admin → Settings.");
    return;
  }
  const toEmail = cfg.orderEmail || "Orders@tocs.co";
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: Number(smtp.port) || 587,
      secure: Number(smtp.port) === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });
    const tpl = cfg.emailTemplate || {};
    const orderType = order.orderCategory === "keys" ? "Keys" : "OC Certificate";
    const firstItem = order.items?.[0];
    const adminSubject = (tpl.adminNotificationSubject || "New Order — {orderType} #{orderId}")
      .replace(/{orderId}/g, order.id)
      .replace(/{orderType}/g, orderType)
      .replace(/{total}/g, `$${(order.total || 0).toFixed(2)} AUD`)
      .replace(/{buildingName}/g, firstItem?.planName || "")
      .replace(/{address}/g, firstItem?.planName || "")   // alias — same as {buildingName}
      .replace(/{lotNumber}/g, firstItem?.lotNumber || "");
    const mailOpts = {
      from: `"TOCS Order Portal" <${toEmail}>`,
      to: toEmail,
      subject: adminSubject,
      html: buildOrderEmailHtml(order, tpl),
    };
    if (authorityBuf && authorityFilename) {
      mailOpts.attachments = [{ filename: authorityFilename, content: authorityBuf }];
    }
    await transporter.sendMail(mailOpts);
    console.log(`  ✉️   Admin notification sent → ${toEmail}`);
  } catch (err) {
    console.error(`  ❌  Admin email failed: ${err.message}`);
  }
}

// ── Send customer confirmation email ─────────────────────────────────────────
async function sendCustomerEmail(order, cfg) {
  const smtp = cfg.smtp || {};
  if (!smtp.host || !smtp.user || !smtp.pass) return;
  const toEmail = order.contactInfo?.email;
  if (!toEmail) return;
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: Number(smtp.port) || 587,
      secure: Number(smtp.port) === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false },
    });
    const customerSubject = `Order Confirmed — ${order.id}`;
    await transporter.sendMail({
      from: `"TOCS Order Portal" <${cfg.orderEmail || "Orders@tocs.co"}>`,
      to: toEmail,
      subject: customerSubject,
      html: buildCustomerEmailHtml(order, cfg),
    });
    console.log(`  ✉️   Customer confirmation sent → ${toEmail}`);
  } catch (err) {
    console.error(`  ❌  Customer email failed: ${err.message}`);
  }
}

// Bootstrap files on first run
if (!fs.existsSync(DATA_FILE))   writeData(DEFAULT_DATA);
if (!fs.existsSync(CONFIG_FILE)) writeConfig(DEFAULT_CONFIG);

// ── Body parser ───────────────────────────────────────────────────────────────
function readBody(req, res) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => {
      body += c;
      if (body.length > 2e6) {
        if (res && !res.headersSent) {
          const msg = JSON.stringify({ error: "Request body too large (max 2 MB)." });
          res.writeHead(413, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(msg) });
          res.end(msg);
        }
        req.destroy();
      }
    });
    req.on("end",  () => { try { resolve(JSON.parse(body || "{}")); } catch { resolve({}); } });
    req.on("error", reject);
  });
}

// ── Multipart parser (for FormData with file upload) ──────────────────────────
function readMultipart(req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers["content-type"] || "";
    const boundaryMatch = ct.match(/boundary=(.+)/);
    if (!boundaryMatch) return resolve({ fields: {}, files: {} });
    const boundary = boundaryMatch[1];
    const chunks = [];
    let size = 0;
    req.on("data", c => { size += c.length; if (size > 15e6) req.destroy(); chunks.push(c); });
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const parts = buf.toString("binary").split("--" + boundary).filter(p => p.trim() && p.trim() !== "--");
      const fields = {};
      const files = {};
      for (const part of parts) {
        const headerEnd = part.indexOf("\r\n\r\n");
        if (headerEnd === -1) continue;
        const headers = part.slice(0, headerEnd);
        const body = part.slice(headerEnd + 4).replace(/\r\n$/, "");
        const nameMatch = headers.match(/name="([^"]+)"/);
        const fileMatch = headers.match(/filename="([^"]+)"/);
        if (!nameMatch) continue;
        if (fileMatch) {
          const filename = fileMatch[1];
          const ctMatch = headers.match(/Content-Type:\s*(.+)/i);
          files[nameMatch[1]] = {
            filename,
            contentType: ctMatch ? ctMatch[1].trim() : "application/octet-stream",
            data: Buffer.from(body, "binary"),
          };
        } else {
          fields[nameMatch[1]] = body;
        }
      }
      resolve({ fields, files });
    });
    req.on("error", reject);
  });
}

// ── Response helpers ──────────────────────────────────────────────────────────
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}
function authHeader(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// ── MIME + Cache ──────────────────────────────────────────────────────────────
const MIME = {
  ".html":"text/html; charset=utf-8", ".js":"application/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png",
  ".jpg":"image/jpeg", ".ico":"image/x-icon", ".json":"application/json",
  ".woff":"font/woff", ".woff2":"font/woff2",
};
function cacheHeader(ext) {
  if (ext === ".html") return "no-cache, no-store, must-revalidate";
  if ([".js",".css",".woff",".woff2"].includes(ext)) return "public, max-age=31536000, immutable";
  return "public, max-age=86400";
}

// ── Request handler ───────────────────────────────────────────────────────────
async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // CORS — restrict to same origin; adjust ALLOWED_ORIGINS if a separate frontend domain is used
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const reqOrigin = req.headers["origin"];
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", reqOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Vary", "Origin");
  }

  const { method } = req;
  const urlPath = req.url.split("?")[0];

  // Handle CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin) ? 204 : 405);
    return res.end();
  }

  // ── Health ─────────────────────────────────────────────────────────────────
  if (urlPath === "/health") {
    return json(res, 200, { status:"ok", app:"tocs-oc-portal", ts: new Date().toISOString() });
  }

  // ── GET /api/data  (public) ────────────────────────────────────────────────
  if (urlPath === "/api/data" && method === "GET") {
    const token = authHeader(req);
    const d = readData();
    // Authenticated admins get full data (incl. orders); public callers get only plans.
    if (validToken(token)) return json(res, 200, d);
    // Strip admin-only fields from products before returning to public callers
    return json(res, 200, {
      strataPlans: d.strataPlans.map(plan => ({
        ...plan,
        products: (plan.products || []).map(({ managerAdminCharge, ...prod }) => prod),
      })),
    });
  }

  // ── POST /api/auth  (unified auth endpoint) ───────────────────────────────
  if (urlPath === "/api/auth" && method === "POST") {
    const body = await readBody(req, res);
    const { action } = body;

    // action=login
    if (action === "login") {
      const { user, pass } = body;
      if (!user || !pass) return json(res, 400, { error: "Username and password are required." });
      const cfg = readConfig();
      const admins = getAdmins(cfg);
      const match = admins.find(a => a.username.toLowerCase() === user.toLowerCase() && a.password === pass);
      if (match) {
        const token = genToken();
        SESSIONS.set(token, { user: match.username, exp: Date.now() + 8 * 60 * 60 * 1000 });
        return json(res, 200, { token, user: match.username, name: match.name });
      }
      return json(res, 401, { error: "Incorrect username or password." });
    }

    // action=list-admins
    if (action === "list-admins") {
      const token = authHeader(req);
      if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
      const cfg = readConfig();
      const admins = getAdmins(cfg);
      return json(res, 200, { admins: admins.map(({ id, username, name }) => ({ id, username, name })) });
    }

    // action=add-admin
    if (action === "add-admin") {
      const token = authHeader(req);
      if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
      const { username, password, name } = body;
      if (!username?.trim()) return json(res, 400, { error: "Username is required." });
      if (username.trim().replace(/[\x00-\x1f\x7f]/g, "").length === 0) return json(res, 400, { error: "Username must not consist of only control characters." });
      if (username.trim().length > 200) return json(res, 400, { error: "Username must not exceed 200 characters." });
      if (!password) return json(res, 400, { error: "Password is required." });
      if (password.length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
      const cleanUsername = username.trim().replace(/[\x00-\x1f\x7f]/g, "");
      const cfg = readConfig();
      const admins = getAdmins(cfg);
      if (admins.find(a => a.username.toLowerCase() === cleanUsername.toLowerCase())) {
        return json(res, 409, { error: "An admin with that username already exists." });
      }
      const newAdmin = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        username: cleanUsername,
        password,
        name: name?.trim().replace(/[\x00-\x1f\x7f]/g, "") || cleanUsername,
      };
      cfg.admins = [...admins, newAdmin];
      writeConfig(cfg);
      return json(res, 200, { ok: true, admin: { id: newAdmin.id, username: newAdmin.username, name: newAdmin.name } });
    }

    // action=remove-admin
    if (action === "remove-admin") {
      const token = authHeader(req);
      if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
      const { id } = body;
      const cfg = readConfig();
      const admins = getAdmins(cfg);
      if (admins.length <= 1) return json(res, 409, { error: "Cannot remove the last admin account." });
      if (!admins.find(a => a.id === id)) return json(res, 404, { error: "Admin not found." });
      cfg.admins = admins.filter(a => a.id !== id);
      cfg.admin = { user: cfg.admins[0].username, pass: cfg.admins[0].password }; // legacy sync
      writeConfig(cfg);
      return json(res, 200, { ok: true });
    }

    // action=reset-admin-password
    if (action === "reset-admin-password") {
      const token = authHeader(req);
      if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
      const { id, newPassword } = body;
      if (!id) return json(res, 400, { error: "Admin ID is required." });
      if (!newPassword) return json(res, 400, { error: "New password is required." });
      if (newPassword.length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
      const cfg = readConfig();
      const admins = getAdmins(cfg);
      const idx = admins.findIndex(a => a.id === id);
      if (idx === -1) return json(res, 404, { error: "Admin not found." });
      admins[idx] = { ...admins[idx], password: newPassword };
      cfg.admins = admins;
      cfg.user = cfg.admins[0].username;
      cfg.pass = cfg.admins[0].password;
      writeConfig(cfg);
      SESSIONS.clear(); // invalidate all sessions after any password reset
      return json(res, 200, { ok: true });
    }

    // action=change-credentials
    if (action === "change-credentials") {
      const token = authHeader(req);
      if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
      const sessionUser = getSessionUser(token);
      const { currentPass, newUser, newPass } = body;
      const cfg = readConfig();
      const admins = getAdmins(cfg);
      const idx = admins.findIndex(a => a.username === sessionUser);
      if (idx === -1) return json(res, 404, { error: "Your admin account was not found." });
      if (currentPass !== admins[idx].password) return json(res, 400, { error: "Current password is incorrect." });
      if (newPass) {
        if (newPass.length < 8) return json(res, 400, { error: "New password must be at least 8 characters." });
        if (newPass === currentPass) return json(res, 400, { error: "New password must differ from the current password." });
        admins[idx].password = newPass;
      }
      if (newUser && newUser.trim()) admins[idx].username = newUser.trim();
      cfg.admins = admins;
      cfg.admin = { user: cfg.admins[0].username, pass: cfg.admins[0].password }; // legacy sync
      writeConfig(cfg);
      SESSIONS.clear(); // force re-login for all sessions
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "Missing or invalid action." });
  }

  // ── POST /api/orders  (public — customer places order, JSON + optional base64 file) ─
  if (urlPath === "/api/orders" && method === "POST") {
    const body = await readBody(req, res);
    const raw = body.order || body; // support both { order, lotAuthority } and flat order
    if (!raw.id || !Array.isArray(raw.items)) return json(res, 400, { error: "Invalid order." });
    // Validate order ID format: no path separators or control characters
    if (/[/\\?\s#\x00-\x1f]/.test(raw.id)) return json(res, 400, { error: "Order ID must not contain spaces, slashes, or control characters." });
    if (raw.id.length > 100) return json(res, 400, { error: "Order ID must not exceed 100 characters." });
    if (raw.items.length === 0) return json(res, 400, { error: "Order must contain at least one item." });
    if (raw.items.length > 50) return json(res, 400, { error: "Order cannot contain more than 50 items." });
    if (!raw.contactInfo?.name || !raw.contactInfo?.email) return json(res, 400, { error: "Customer name and email are required." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.contactInfo.email)) return json(res, 400, { error: "A valid customer email address is required." });
    if ((raw.contactInfo.name || "").length > 200) return json(res, 400, { error: "Name must not exceed 200 characters." });
    if ((raw.contactInfo.companyName || "").length > 200) return json(res, 400, { error: "Company name must not exceed 200 characters." });
    // Validate payment method
    const VALID_PAYMENTS = ["bank", "payid", "card", "stripe", "invoice"];
    if (raw.payment && !VALID_PAYMENTS.includes(raw.payment)) return json(res, 400, { error: `Invalid payment method. Allowed: ${VALID_PAYMENTS.join(", ")}.` });
    // Strip control characters from string values that flow into email subjects / headers
    const stripCtrl = (v) => typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]/g, "") : v;
    // Whitelist fields — never persist client-supplied admin fields
    const order = {
      id: raw.id,
      planId: raw.planId,
      lotId: raw.lotId,
      orderCategory: raw.orderCategory,
      contactInfo: {
        name:        stripCtrl(raw.contactInfo?.name  || ""),
        email:       stripCtrl(raw.contactInfo?.email || ""),
        phone:       stripCtrl(raw.contactInfo?.phone || ""),
        companyName: stripCtrl(raw.contactInfo?.companyName || ""),
      },
      status: (raw.payment === "stripe" || raw.payment === "card") ? "Processing"
            : raw.payment === "invoice" ? "Invoice to be issued"
            : "Pending Payment",
      payment: raw.payment || "bank",
      items: (raw.items || []).map(item => ({
        productId:   item.productId,
        lotId:       item.lotId,
        lotNumber:   stripCtrl(item.lotNumber   || ""),
        planName:    stripCtrl(item.planName    || ""),
        ocName:      stripCtrl(item.ocName      || ""),
        productName: stripCtrl(item.productName || ""),
        ocId:        item.ocId   || null,
        qty:         Math.min(100, Math.max(1, Math.floor(Number(item.qty) || 1))),
        // price and managerAdminCharge set below from server-side catalog
      })),
      selectedShipping: raw.selectedShipping ? {
        type:  stripCtrl(String(raw.selectedShipping.type  || "")),
        price: Math.max(0, Number(raw.selectedShipping.price) || 0),
      } : undefined,
    };
    // Always use server time — never trust client-supplied date
    order.date = new Date().toISOString();
    // Validate + override item prices against the plan's product catalog
    {
      const d = readData();
      const plan = d.strataPlans.find(p => p.id === order.planId);
      // Require a known plan — no plan means no price enforcement
      if (!plan) return json(res, 400, { error: "A valid planId is required." });
      if (!plan.products?.length) return json(res, 400, { error: "The specified plan has no products." });
      // Count how many times each perOC product appears per lot to apply secondaryPrice
      const ocCountPerProduct = {}; // key: `${productId}:${lotId}`
      for (const item of order.items) {
        if (!item.productId) return json(res, 400, { error: "Each order item must have a productId." });
        const product = plan.products.find(p => p.id === item.productId);
        if (!product) return json(res, 400, { error: `Unknown productId: ${item.productId}` });
        if (product.perOC) {
          const key = `${item.productId}:${item.lotId || ""}`;
          ocCountPerProduct[key] = (ocCountPerProduct[key] || 0) + 1;
          item.price = ocCountPerProduct[key] === 1
            ? Number(product.price)
            : Number(product.secondaryPrice ?? product.price);
        } else {
          // Multiply by qty for non-perOC products (e.g. keys/fobs where user selects quantity)
          item.price = product.price * (item.qty || 1);
        }
        // Snapshot managerAdminCharge from catalog (keys/fob products only, admin use)
        if (product.managerAdminCharge !== undefined) {
          item.managerAdminCharge = product.managerAdminCharge;
        }
      }
    }
    const shippingCost = order.selectedShipping ? Math.max(0, Number(order.selectedShipping.price) || 0) : 0;
    const recalcTotal = order.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0) + shippingCost;
    order.total = Math.round(recalcTotal * 100) / 100;

    // Duplicate check BEFORE writing any files to disk
    const d = readData();
    if (d.orders.find(o => o.id === order.id)) {
      return json(res, 409, { error: "An order with this ID already exists." });
    }

    const AUTH_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    let authorityBuf = null;
    let authorityFilename = null;
    if (body.lotAuthority?.data) {
      try {
        const decoded = Buffer.from(body.lotAuthority.data, "base64");
        if (decoded.length === 0) throw new Error("Empty or invalid base64 data");
        if (decoded.length > AUTH_MAX_BYTES) {
          return json(res, 400, { error: "Authority document must not exceed 10 MB." });
        }
        // Whitelist allowed file extensions and validate magic bytes
        const ALLOWED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"];
        const rawExt = path.extname(body.lotAuthority.filename || "").toLowerCase();
        if (!ALLOWED_EXTS.includes(rawExt)) {
          return json(res, 400, { error: "Authority document must be a PDF, JPG, or PNG file." });
        }
        // Validate file magic bytes match the declared extension
        const isPDF  = decoded[0] === 0x25 && decoded[1] === 0x50 && decoded[2] === 0x44 && decoded[3] === 0x46; // %PDF
        const isJPEG = decoded[0] === 0xFF && decoded[1] === 0xD8 && decoded[2] === 0xFF;
        const isPNG  = decoded[0] === 0x89 && decoded[1] === 0x50 && decoded[2] === 0x4E && decoded[3] === 0x47;
        const validMagic = (rawExt === ".pdf" && isPDF) || ([".jpg",".jpeg"].includes(rawExt) && isJPEG) || (rawExt === ".png" && isPNG);
        if (!validMagic) {
          return json(res, 400, { error: "Authority document content does not match the declared file type." });
        }
        authorityBuf = decoded;
        authorityFilename = order.id + "-lot-authority" + rawExt;
        fs.writeFileSync(path.join(UPLOADS_DIR, authorityFilename), authorityBuf);
        order.lotAuthorityFile = authorityFilename;
        console.log(`  📎  Lot authority saved: ${authorityFilename}`);
      } catch (e) {
        if (res.headersSent) return;
        console.error("  ❌  Failed to save authority file:", e.message);
      }
    }

    order.auditLog = [{ ts: new Date().toISOString(), action: "Order created", note: `Customer: ${order.contactInfo?.name || "?"}` }];
    d.orders.unshift(order);
    writeData(d);

    const cfg = readConfig();
    // Send emails — capture failures and append them to the order's auditLog
    const emailResults = await Promise.allSettled([
      sendOrderEmail(order, cfg, authorityBuf, authorityFilename),
      sendCustomerEmail(order, cfg),
    ]);
    const emailLabels = ["Admin notification", "Customer confirmation"];
    let needsWrite = false;
    emailResults.forEach((r, i) => {
      if (r.status === "rejected") {
        const entry = { ts: new Date().toISOString(), action: "Email send failed", note: `${emailLabels[i]}: ${r.reason?.message || r.reason}` };
        const idx2 = d.orders.findIndex(o => o.id === order.id);
        if (idx2 !== -1) { d.orders[idx2].auditLog = [...(d.orders[idx2].auditLog || []), entry]; needsWrite = true; }
      }
    });
    if (needsWrite) writeData(d);

    // Strip admin-only fields before returning to the customer
    const customerOrder = { ...order, items: order.items.map(({ managerAdminCharge, ...item }) => item) };
    return json(res, 200, { ok: true, order: customerOrder, emailSentTo: cfg.orderEmail || "Orders@tocs.co" });
  }

  // ── PUT /api/orders/:id/status  (admin) ───────────────────────────────────
  const statusMatch = urlPath.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (statusMatch && method === "PUT") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { status, note } = await readBody(req, res);
    if (!status || typeof status !== "string" || !status.trim()) return json(res, 400, { error: "A non-empty status string is required." });
    const VALID_STATUSES = ["Pending Payment","Processing","Issued","Cancelled","On Hold","Awaiting Documents","Invoice to be issued"];
    if (!VALID_STATUSES.includes(status)) return json(res, 400, { error: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}.` });
    const d = readData();
    const idx = d.orders.findIndex(o => o.id === statusMatch[1]);
    if (idx === -1) return json(res, 404, { error: "Order not found." });
    d.orders[idx].status = status;
    const auditEntry = { ts: new Date().toISOString(), action: `Status changed to ${status}` };
    if (note) auditEntry.note = note;
    d.orders[idx].auditLog = [...(d.orders[idx].auditLog || []), auditEntry];
    if (status === "Cancelled" && note) d.orders[idx].cancelReason = note;
    writeData(d);
    return json(res, 200, { ok: true });
  }

  // ── GET /api/orders/:id/authority  (admin — download authority doc) ────────
  const authorityMatch = urlPath.match(/^\/api\/orders\/([^/]+)\/authority$/);
  if (authorityMatch && method === "GET") {
    const token = new URL("http://x" + req.url).searchParams.get("token") || authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const d = readData();
    const order = d.orders.find(o => o.id === authorityMatch[1]);
    if (!order) return json(res, 404, { error: "Order not found." });
    if (!order.lotAuthorityFile) return json(res, 404, { error: "No authority document for this order." });
    // Sanitise the stored filename: strip control chars (incl. CRLF) to prevent header injection
    const safeFilename = path.basename(order.lotAuthorityFile).replace(/[^\w.\-]/g, "_");
    const filePath = path.resolve(UPLOADS_DIR, safeFilename);
    // Guard against path traversal: resolved path must stay inside UPLOADS_DIR
    if (!filePath.startsWith(UPLOADS_DIR + path.sep) && filePath !== UPLOADS_DIR) {
      return json(res, 403, { error: "Forbidden." });
    }
    fs.readFile(filePath, (err, data) => {
      if (err) return json(res, 404, { error: "File not found on server." });
      try {
        const ext = path.extname(safeFilename).toLowerCase();
        const mimeMap = { ".pdf":"application/pdf", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png" };
        res.writeHead(200, {
          "Content-Type": mimeMap[ext] || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeFilename}"`,
          "Content-Length": data.length,
        });
        res.end(data);
      } catch (headerErr) {
        console.error("  ❌  Authority download header error:", headerErr.message);
        if (!res.headersSent) json(res, 500, { error: "Could not send file." });
      }
    });
    return;
  }

  // ── POST /api/orders/:id/send-certificate  (admin) ────────────────────────
  const sendCertMatch = urlPath.match(/^\/api\/orders\/([^/]+)\/send-certificate$/);
  if (sendCertMatch && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { message, attachment } = await readBody(req, res);
    const d = readData();
    const idx = d.orders.findIndex(o => o.id === sendCertMatch[1]);
    if (idx === -1) return json(res, 404, { error: "Order not found." });
    const order = d.orders[idx];
    const recipientEmail = order.contactInfo?.email;
    if (!recipientEmail) return json(res, 400, { error: "Order has no customer email address." });
    const cfg = readConfig();
    const smtp = cfg.smtp || {};
    if (!smtp.host || !smtp.user || !smtp.pass) return json(res, 400, { error: "SMTP not configured." });
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host, port: Number(smtp.port) || 587,
        secure: Number(smtp.port) === 465,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: false },
      });
      const tpl = cfg.emailTemplate || {};
      const subj = (tpl.certificateSubject || "Your OC Certificate — Order #{orderId}").replace(/{orderId}/g, order.id);
      const mailOpts = {
        from: `"Top Owners Corporation Solution" <${cfg.orderEmail || "Orders@tocs.co"}>`,
        to: recipientEmail,
        subject: subj,
        html: buildCertEmailHtml(order, message, cfg),
      };
      if (attachment?.data) {
        mailOpts.attachments = [{ filename: attachment.filename || "OC-Certificate.pdf", content: Buffer.from(attachment.data, "base64"), contentType: attachment.contentType || "application/pdf" }];
      }
      await transporter.sendMail(mailOpts);
      d.orders[idx].status = "Issued";
      d.orders[idx].auditLog = [...(d.orders[idx].auditLog || []), { ts: new Date().toISOString(), action: "Certificate issued", note: `To: ${recipientEmail}` }];
      writeData(d);
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  // ── GET /api/orders/export  (admin — CSV download) ────────────────────────
  if (urlPath === "/api/orders/export" && method === "GET") {
    const token = authHeader(req) || new URL("http://x" + req.url).searchParams.get("token");
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const d = readData();
    const rows = [["Order ID","Date","Name","Email","Phone","Building Name","Lot Number","Items","Total (AUD)","Payment","Status","Manager Admin Charge (AUD)"]];
    for (const o of d.orders) {
      const adminCharge = (o.items || []).reduce((sum, item) => sum + ((item.managerAdminCharge || 0) * (item.qty || 1)), 0);
      rows.push([
        o.id,
        new Date(o.date).toLocaleDateString("en-AU"),
        o.contactInfo?.name  || "",
        o.contactInfo?.email || "",
        o.contactInfo?.phone || "",
        o.items?.[0]?.planName  || "",
        o.items?.[0]?.lotNumber || "",
        o.items?.length ?? 0,
        (o.total || 0).toFixed(2),
        o.payment || "",
        o.status  || "",
        adminCharge > 0 ? adminCharge.toFixed(2) : "",
      ]);
    }
    // Strip control characters (including embedded newlines) to prevent row-splitting in spreadsheets
    const csvEsc = v => {
      const s = String(v).replace(/[\r\n\t]/g, " ").replace(/"/g, '""');
      // Prefix formula-injection characters to prevent spreadsheet code execution
      return /^[=+\-@\t]/.test(s) ? `"'${s}"` : `"${s}"`;
    };
    const csv = rows.map(r => r.map(csvEsc).join(",")).join("\r\n");
    const csvBuf = Buffer.from(csv, "utf8");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tocs-orders-${new Date().toISOString().slice(0,10)}.csv"`,
      "Content-Length": csvBuf.length,
    });
    return res.end(csvBuf);
  }

  // ── POST /api/lots/import  (admin — import lots from parsed Excel data) ────
  if (urlPath === "/api/lots/import" && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { planId, lots } = await readBody(req, res);
    if (!planId || !Array.isArray(lots)) return json(res, 400, { error: "Invalid import data." });
    if (lots.length === 0) return json(res, 400, { error: "Lots array cannot be empty." });
    // Validate each lot has a non-empty id
    for (const lot of lots) {
      if (!lot || typeof lot !== "object" || !lot.id) {
        return json(res, 400, { error: "Each lot must have a non-empty id field." });
      }
    }
    // Deduplicate by lot id (last occurrence wins)
    const seenLots = new Map();
    for (const lot of lots) {
      if (lot && typeof lot === "object" && lot.id) seenLots.set(lot.id, lot);
    }
    const d = readData();
    const idx = d.strataPlans.findIndex(p => p.id === planId);
    if (idx === -1) return json(res, 404, { error: "Plan not found." });
    const prevCount = (d.strataPlans[idx].lots || []).length;
    d.strataPlans[idx].lots = [...seenLots.values()];
    const newCount = d.strataPlans[idx].lots.length;
    d.strataPlans[idx].lotsImportLog = [
      ...((d.strataPlans[idx].lotsImportLog || []).slice(-49)), // keep last 50 entries
      { ts: new Date().toISOString(), action: "Lots imported", note: `${prevCount} → ${newCount} lots` },
    ];
    writeData(d);
    return json(res, 200, { ok: true, count: newCount });
  }

  // ── POST /api/plans  (admin — save full plans array) ──────────────────────
  if (urlPath === "/api/plans" && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { plans } = await readBody(req, res);
    if (!Array.isArray(plans)) return json(res, 400, { error: 'Invalid plans. Body must be {"plans": [...]}.' });
    if (plans.length === 0) return json(res, 400, { error: "Plans array cannot be empty." });
    // Validate each plan is an object with a non-empty id and name
    for (const p of plans) {
      if (!p || typeof p !== "object") return json(res, 400, { error: "Each plan must be an object." });
      if (!p.id || typeof p.id !== "string") return json(res, 400, { error: "Each plan must have a non-empty string id." });
      if (!p.name || typeof p.name !== "string") return json(res, 400, { error: `Plan '${p.id}' is missing a name.` });
      // Validate product prices are finite non-negative numbers
      if (Array.isArray(p.products)) {
        for (const prod of p.products) {
          if (!prod || typeof prod !== "object") continue;
          if (!prod.id || typeof prod.id !== "string")
            return json(res, 400, { error: `Each product in plan '${p.id}' must have a non-empty string id.` });
          if (typeof prod.price !== "number" || !Number.isFinite(prod.price))
            return json(res, 400, { error: `Product '${prod.name || prod.id}' in plan '${p.id}' price must be a finite number.` });
          if (prod.price < 0)
            return json(res, 400, { error: `Product '${prod.name || prod.id}' in plan '${p.id}' has a negative price.` });
          if (prod.secondaryPrice !== undefined) {
            if (typeof prod.secondaryPrice !== "number" || !Number.isFinite(prod.secondaryPrice) || prod.secondaryPrice < 0)
              return json(res, 400, { error: `Product '${prod.name || prod.id}' in plan '${p.id}' secondaryPrice must be a non-negative number.` });
          }
          if (prod.managerAdminCharge !== undefined) {
            if (typeof prod.managerAdminCharge !== "number" || !Number.isFinite(prod.managerAdminCharge) || prod.managerAdminCharge < 0)
              return json(res, 400, { error: `Product '${prod.name || prod.id}' in plan '${p.id}' has an invalid managerAdminCharge (must be a non-negative number).` });
          }
        }
      }
    }
    // Deduplicate plans by id (last occurrence wins)
    const seen = new Map();
    for (const p of plans) seen.set(p.id, p);
    const d = readData();
    d.strataPlans = [...seen.values()];
    writeData(d);
    return json(res, 200, { ok: true });
  }

  // ── POST /api/config/test-email  (admin) ──────────────────────────────────
  if (urlPath === "/api/config/test-email" && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const cfg = readConfig();
    const smtp = cfg.smtp || {};
    if (!smtp.host || !smtp.user || !smtp.pass) {
      return json(res, 400, { error: "SMTP not configured. Please fill in all SMTP fields and save settings first." });
    }
    const toEmail = cfg.orderEmail || "Orders@tocs.co";
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host, port: Number(smtp.port) || 587,
        secure: Number(smtp.port) === 465,
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
      return json(res, 200, { ok: true, sentTo: toEmail });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  // ── GET /api/config/public  (no auth — payment details for checkout) ────────
  if (urlPath === "/api/config/public" && method === "GET") {
    const cfg = readConfig();
    const pd = cfg.paymentDetails || {};
    const pm = cfg.paymentMethods || {};
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return json(res, 200, {
      logo: cfg.logo || "",
      stripeEnabled: !!(cfg.stripe?.secretKey),
      bankEnabled:   pm.bankEnabled  !== false,
      payidEnabled:  pm.payidEnabled !== false,
      paymentDetails: {
        accountName: pd.accountName || "Top Owners Corporation",
        bsb: pd.bsb || "033-065",
        accountNumber: pd.accountNumber || "522011",
        payid: pd.payid || "accounts@tocs.com.au",
      },
    });
  }

  // ── GET /api/config/settings  (admin) ─────────────────────────────────────
  if (urlPath === "/api/config/settings" && method === "GET") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const cfg = readConfig();
    const smtp = cfg.smtp || {};
    const pd = cfg.paymentDetails || {};
    const et = cfg.emailTemplate || {};
    const pm = cfg.paymentMethods || {};
    return json(res, 200, {
      orderEmail: cfg.orderEmail || "Orders@tocs.co",
      logo: cfg.logo || "",
      smtp: { host: smtp.host || "mail-au.smtp2go.com", port: smtp.port || 2525, user: smtp.user || "OCCAPP", pass: smtp.pass ? "••••••••" : "" },
      paymentDetails: { accountName: pd.accountName || "Top Owners Corporation", bsb: pd.bsb || "033-065", accountNumber: pd.accountNumber || "522011", payid: pd.payid || "accounts@tocs.com.au" },
      paymentMethods: { bankEnabled: pm.bankEnabled !== false, payidEnabled: pm.payidEnabled !== false },
      emailTemplate: {
        certificateSubject:       et.certificateSubject       || "Your OC Certificate — Order #{orderId}",
        certificateGreeting:      et.certificateGreeting      || "",
        footer:                   et.footer                   || "",
        adminNotificationSubject: et.adminNotificationSubject || "New Order — {orderType} #{orderId}",
        adminNotificationIntro:   et.adminNotificationIntro   || "A new order has been placed.",
      },
    });
  }

  // ── POST /api/config/settings  (admin) ────────────────────────────────────
  if (urlPath === "/api/config/settings" && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const body2 = await readBody(req, res);
    const { orderEmail, smtp, paymentDetails, emailTemplate, paymentMethods, logo } = body2;
    const cfg = readConfig();
    if (logo !== undefined) {
      if (typeof logo !== "string") return json(res, 400, { error: "logo must be a string." });
      cfg.logo = logo.trim();
    }
    if (orderEmail !== undefined) {
      if (typeof orderEmail !== "string" || !orderEmail.trim()) return json(res, 400, { error: "orderEmail must be a non-empty string." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderEmail.trim())) return json(res, 400, { error: "orderEmail must be a valid email address." });
      cfg.orderEmail = orderEmail.trim();
    }
    const stripCRLF = (s) => typeof s === "string" ? s.replace(/[\r\n]/g, " ").trim() : s;
    if (smtp && typeof smtp === "object") {
      cfg.smtp = cfg.smtp || {};
      if (smtp.host !== undefined) cfg.smtp.host = stripCRLF(smtp.host);
      if (smtp.port !== undefined) {
        const p = Number(smtp.port);
        if (!Number.isFinite(p) || p <= 0) return json(res, 400, { error: "smtp.port must be a positive number." });
        cfg.smtp.port = p;
      }
      if (smtp.user !== undefined) cfg.smtp.user = stripCRLF(smtp.user);
      if (smtp.pass !== undefined && smtp.pass !== "••••••••") cfg.smtp.pass = smtp.pass; // ignore masked placeholder
    }
    if (paymentDetails && typeof paymentDetails === "object") {
      const sanitised = {};
      for (const [k, v] of Object.entries(paymentDetails)) sanitised[k] = typeof v === "string" ? stripCRLF(v) : v;
      cfg.paymentDetails = { ...cfg.paymentDetails, ...sanitised };
    }
    if (emailTemplate && typeof emailTemplate === "object") {
      // Strip CRLF from all email template string fields to prevent header injection
      const sanitiseTemplate = (obj) => {
        const out = {};
        for (const [k, v] of Object.entries(obj)) out[k] = typeof v === "string" ? stripCRLF(v) : v;
        return out;
      };
      cfg.emailTemplate = { ...cfg.emailTemplate, ...sanitiseTemplate(emailTemplate) };
    }
    if (paymentMethods && typeof paymentMethods === "object") {
      cfg.paymentMethods = cfg.paymentMethods || {};
      if (typeof paymentMethods.bankEnabled  === "boolean") cfg.paymentMethods.bankEnabled  = paymentMethods.bankEnabled;
      if (typeof paymentMethods.payidEnabled === "boolean") cfg.paymentMethods.payidEnabled = paymentMethods.payidEnabled;
    }
    writeConfig(cfg);
    return json(res, 200, { ok: true });
  }

  // ── 405 / 404 for unmatched /api/ routes ──────────────────────────────────
  if (urlPath.startsWith("/api/")) {
    // Return 405 if the path is known but the method is wrong
    const knownRoutes = [
      [/^\/api\/auth$/, ["POST"]],
      [/^\/api\/data$/, ["GET"]],
      [/^\/api\/orders$/, ["POST"]],
      [/^\/api\/orders\/export$/, ["GET"]],
      [/^\/api\/orders\/[^/]+\/status$/, ["PUT"]],
      [/^\/api\/orders\/[^/]+\/authority$/, ["GET"]],
      [/^\/api\/orders\/[^/]+\/send-certificate$/, ["POST"]],
      [/^\/api\/lots\/import$/, ["POST"]],
      [/^\/api\/plans$/, ["POST"]],
      [/^\/api\/config\/settings$/, ["GET", "POST"]],
      [/^\/api\/config\/public$/, ["GET"]],
      [/^\/api\/config\/test-email$/, ["POST"]],
    ];
    for (const [pattern, methods] of knownRoutes) {
      if (pattern.test(urlPath)) {
        res.setHeader("Allow", methods.join(", "));
        return json(res, 405, { error: `Method Not Allowed. Allowed: ${methods.join(", ")}.` });
      }
    }
    return json(res, 404, { error: "Not found." });
  }

  // ── Static file serving ────────────────────────────────────────────────────
  let filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end("Forbidden"); }

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(DIST, "index.html"), (err2, html) => {
        if (err2) { res.writeHead(404); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-cache, no-store, must-revalidate" });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheHeader(ext),
      "Content-Length": data.length,
    });
    res.end(data);
  });
}

// ── Server bootstrap ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  handler(req, res).catch(err => {
    console.error("Handler error:", err);
    if (!res.headersSent) json(res, 500, { error: "Internal server error." });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   TOCS Owner Corporation Portal            ║
╠════════════════════════════════════════════╣
║   Server  : http://${HOST}:${PORT}${" ".repeat(Math.max(0, 22 - HOST.length - String(PORT).length))}║
║   Env     : ${(process.env.NODE_ENV || "production").padEnd(29)}║
║   Dist    : ./dist                         ║
║   Data    : ./data.json                    ║
╚════════════════════════════════════════════╝
`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`\n  ❌  Port ${PORT} is already in use.\n`);
  else console.error("Server error:", err);
  process.exit(1);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT",  () => server.close(() => process.exit(0)));
