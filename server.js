// server.js — TOCS OC Portal with persistence + REST API
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
  return [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
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
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return structuredClone(DEFAULT_DATA); }
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
function buildOrderEmailHtml(order) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  let date = "—";
  try { date = new Date(order.date).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" }); } catch {}
  const payment = order.payment === "card" ? "Credit / Debit Card" : order.payment === "invoice" ? "Invoice" : order.payment || "—";

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.productName || item.name || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.ocName || "—"}</td>
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
      <p style="margin-top:0;">A new order has been placed on the TOCS Owner Corporation Certificate Portal. Please review and process it at your earliest convenience.</p>

      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Details</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Order ID</td><td style="padding:6px 0;font-weight:600;">${order.id || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Date</td><td style="padding:6px 0;">${date}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Payment</td><td style="padding:6px 0;">${payment}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Total</td><td style="padding:6px 0;font-weight:700;font-size:1.1rem;color:#1c3326;">$${(order.total || 0).toFixed(2)} AUD</td></tr>
      </table>

      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Customer Information</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Name</td><td style="padding:6px 0;">${contact.name || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${contact.email || ""}" style="color:#2e6b42;">${contact.email || "—"}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${contact.phone || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Company / Firm</td><td style="padding:6px 0;">${contact.companyName || "—"}</td></tr>
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
      <p style="margin-top:8px;">${order.lotAuthorityFile ? `<strong>${order.lotAuthorityFile}</strong> has been uploaded and saved.` : "No lot authority document was provided."}</p>

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
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.productName || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.ocName || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(item.price||0).toFixed(2)}</td>
    </tr>`).join("");
  const bankRows = order.payment === "bank" ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;">
      <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;">Bank Transfer Details</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
        <tr><td style="padding:4px 0;color:#666;width:38%;">Account Name</td><td style="padding:4px 0;font-weight:600;">${pd.accountName||""}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">BSB</td><td style="padding:4px 0;font-weight:600;">${pd.bsb||""}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Account Number</td><td style="padding:4px 0;font-weight:600;">${pd.accountNumber||""}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${order.id}</td></tr>
      </table>
    </div>` : order.payment === "payid" ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;">
      <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;">PayID Details</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
        <tr><td style="padding:4px 0;color:#666;width:38%;">PayID</td><td style="padding:4px 0;font-weight:600;">${pd.payid||""}</td></tr>
        <tr><td style="padding:4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${order.id}</td></tr>
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
      <p style="margin-top:0;">Dear ${contact.name || "Applicant"},</p>
      <p>Thank you for your order. ${isPending ? "Your order has been received and is <strong>awaiting payment</strong>. Certificate processing will begin once payment is confirmed." : "Your payment has been received and your certificate(s) will be processed within the stated turnaround time."}</p>
      <div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:12px 16px;border-radius:4px;margin:20px 0;">
        <div style="font-size:0.78rem;color:#666;margin-bottom:4px;">Your order reference number</div>
        <div style="font-family:monospace;font-size:1.2rem;font-weight:700;color:#1c3326;">${order.id}</div>
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
      <p style="font-size:0.8rem;color:#555;margin:0;">If you have any questions about your order, please contact us at <a href="mailto:${cfg.orderEmail||'info@tocs.co'}" style="color:#2e6b42;">${cfg.orderEmail||'info@tocs.co'}</a> quoting your order reference number.</p>
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
    .replace(/{name}/g, contact.name || "Applicant")
    .replace(/{lotNumber}/g, lot?.lotNumber || "")
    .replace(/{address}/g, lot?.planName || "");
  const bodyText = message || raw;
  const htmlBody = bodyText.replace(/\n/g, "<br>");
  const footer = (tpl.footer || "Top Owners Corporation Solution  |  info@tocs.co").replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;letter-spacing:0.05em;">Top Owners Corporation Solution</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;">${htmlBody}</p>
      <div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:10px 16px;border-radius:4px;margin:20px 0;font-size:0.83rem;">
        Order Reference: <strong style="font-family:monospace;">${order.id}</strong>
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
    const mailOpts = {
      from: `"TOCS Order Portal" <${toEmail}>`,
      to: toEmail,
      subject: `New Order #${order.id} — $${(order.total || 0).toFixed(2)} AUD`,
      html: buildOrderEmailHtml(order),
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
    await transporter.sendMail({
      from: `"TOCS Order Portal" <${cfg.orderEmail || "Orders@tocs.co"}>`,
      to: toEmail,
      subject: `Order Confirmed — ${order.id}`,
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
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 2e6) req.destroy(); });
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

  const { method } = req;
  const urlPath = req.url.split("?")[0];

  // ── Health ─────────────────────────────────────────────────────────────────
  if (urlPath === "/health") {
    return json(res, 200, { status:"ok", app:"tocs-oc-portal", ts: new Date().toISOString() });
  }

  // ── GET /api/data  (public) ────────────────────────────────────────────────
  if (urlPath === "/api/data" && method === "GET") {
    return json(res, 200, readData());
  }

  // ── POST /api/auth  (unified auth endpoint) ───────────────────────────────
  if (urlPath === "/api/auth" && method === "POST") {
    const body = await readBody(req);
    const { action } = body;

    // action=login
    if (action === "login") {
      const { user, pass } = body;
      if (!user || !pass) return json(res, 400, { error: "Username and password are required." });
      const cfg = readConfig();
      const admins = getAdmins(cfg);
      const match = admins.find(a => a.username === user && a.password === pass);
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
      if (!password) return json(res, 400, { error: "Password is required." });
      if (password.length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
      const cfg = readConfig();
      const admins = getAdmins(cfg);
      if (admins.find(a => a.username.toLowerCase() === username.trim().toLowerCase())) {
        return json(res, 409, { error: "An admin with that username already exists." });
      }
      const newAdmin = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        username: username.trim(),
        password,
        name: name?.trim() || username.trim(),
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
    const body = await readBody(req);
    const order = body.order || body; // support both { order, lotAuthority } and flat order
    if (!order.id || !Array.isArray(order.items)) return json(res, 400, { error: "Invalid order." });

    let authorityBuf = null;
    let authorityFilename = null;
    if (body.lotAuthority?.data) {
      try {
        authorityBuf = Buffer.from(body.lotAuthority.data, "base64");
        const ext = path.extname(body.lotAuthority.filename || ".bin") || ".bin";
        authorityFilename = (order.id || "unknown") + "-lot-authority" + ext;
        fs.writeFileSync(path.join(UPLOADS_DIR, authorityFilename), authorityBuf);
        order.lotAuthorityFile = authorityFilename;
        console.log(`  📎  Lot authority saved: ${authorityFilename}`);
      } catch (e) { console.error("  ❌  Failed to save authority file:", e.message); }
    }

    order.auditLog = [{ ts: new Date().toISOString(), action: "Order created", note: `Customer: ${order.contactInfo?.name || "?"}` }];
    const d = readData();
    d.orders.unshift(order);
    writeData(d);

    const cfg = readConfig();
    // Fire-and-forget both emails
    sendOrderEmail(order, cfg, authorityBuf, authorityFilename);
    sendCustomerEmail(order, cfg);

    return json(res, 200, { ok: true, order, emailSentTo: cfg.orderEmail || "Orders@tocs.co" });
  }

  // ── PUT /api/orders/:id/status  (admin) ───────────────────────────────────
  const statusMatch = urlPath.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (statusMatch && method === "PUT") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { status, note } = await readBody(req);
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
    if (!order?.lotAuthorityFile) return json(res, 404, { error: "No authority document for this order." });
    const filePath = path.join(UPLOADS_DIR, order.lotAuthorityFile);
    fs.readFile(filePath, (err, data) => {
      if (err) return json(res, 404, { error: "File not found on server." });
      const ext = path.extname(order.lotAuthorityFile).toLowerCase();
      const mimeMap = { ".pdf":"application/pdf", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png" };
      res.writeHead(200, {
        "Content-Type": mimeMap[ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${order.lotAuthorityFile}"`,
        "Content-Length": data.length,
      });
      res.end(data);
    });
    return;
  }

  // ── POST /api/orders/:id/send-certificate  (admin) ────────────────────────
  const sendCertMatch = urlPath.match(/^\/api\/orders\/([^/]+)\/send-certificate$/);
  if (sendCertMatch && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { message, attachment } = await readBody(req);
    const d = readData();
    const idx = d.orders.findIndex(o => o.id === sendCertMatch[1]);
    if (idx === -1) return json(res, 404, { error: "Order not found." });
    const order = d.orders[idx];
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
        to: order.contactInfo.email,
        subject: subj,
        html: buildCertEmailHtml(order, message, cfg),
      };
      if (attachment?.data) {
        mailOpts.attachments = [{ filename: attachment.filename || "OC-Certificate.pdf", content: Buffer.from(attachment.data, "base64"), contentType: attachment.contentType || "application/pdf" }];
      }
      await transporter.sendMail(mailOpts);
      d.orders[idx].status = "Issued";
      d.orders[idx].auditLog = [...(d.orders[idx].auditLog || []), { ts: new Date().toISOString(), action: "Certificate issued", note: `To: ${order.contactInfo.email}` }];
      writeData(d);
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  // ── GET /api/orders/export  (admin — CSV download) ────────────────────────
  if (urlPath === "/api/orders/export" && method === "GET") {
    const token = new URL("http://x" + req.url).searchParams.get("token");
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const d = readData();
    const rows = [["Order ID","Date","Name","Email","Phone","Items","Total (AUD)","Payment","Status"]];
    for (const o of d.orders) {
      rows.push([
        o.id,
        new Date(o.date).toLocaleDateString("en-AU"),
        o.contactInfo?.name  || "",
        o.contactInfo?.email || "",
        o.contactInfo?.phone || "",
        o.items?.length ?? 0,
        (o.total || 0).toFixed(2),
        o.payment || "",
        o.status  || "",
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    res.writeHead(200, {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="tocs-orders-${new Date().toISOString().slice(0,10)}.csv"`,
    });
    return res.end(csv);
  }

  // ── POST /api/lots/import  (admin — import lots from parsed Excel data) ────
  if (urlPath === "/api/lots/import" && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { planId, lots } = await readBody(req);
    if (!planId || !Array.isArray(lots)) return json(res, 400, { error: "Invalid import data." });
    const d = readData();
    const idx = d.strataPlans.findIndex(p => p.id === planId);
    if (idx === -1) return json(res, 404, { error: "Plan not found." });
    d.strataPlans[idx].lots = lots;
    writeData(d);
    return json(res, 200, { ok: true, count: lots.length });
  }

  // ── POST /api/plans  (admin — save full plans array) ──────────────────────
  if (urlPath === "/api/plans" && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { plans } = await readBody(req);
    if (!Array.isArray(plans)) return json(res, 400, { error: "Invalid plans." });
    const d = readData();
    d.strataPlans = plans;
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
    return json(res, 200, {
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
    return json(res, 200, {
      orderEmail: cfg.orderEmail || "Orders@tocs.co",
      smtp: { host: smtp.host || "mail-au.smtp2go.com", port: smtp.port || 2525, user: smtp.user || "OCCAPP", pass: smtp.pass || "" },
      paymentDetails: { accountName: pd.accountName || "Top Owners Corporation", bsb: pd.bsb || "033-065", accountNumber: pd.accountNumber || "522011", payid: pd.payid || "accounts@tocs.com.au" },
      emailTemplate: { certificateSubject: et.certificateSubject || "Your OC Certificate — Order #{orderId}", certificateGreeting: et.certificateGreeting || "", footer: et.footer || "" },
    });
  }

  // ── POST /api/config/settings  (admin) ────────────────────────────────────
  if (urlPath === "/api/config/settings" && method === "POST") {
    const token = authHeader(req);
    if (!validToken(token)) return json(res, 401, { error: "Not authenticated." });
    const { orderEmail, smtp, paymentDetails, emailTemplate } = await readBody(req);
    const cfg = readConfig();
    if (orderEmail !== undefined) cfg.orderEmail = orderEmail;
    if (smtp && typeof smtp === "object") {
      cfg.smtp = cfg.smtp || {};
      if (smtp.host !== undefined) cfg.smtp.host = smtp.host;
      if (smtp.port !== undefined) cfg.smtp.port = Number(smtp.port) || 587;
      if (smtp.user !== undefined) cfg.smtp.user = smtp.user;
      if (smtp.pass !== undefined) cfg.smtp.pass = smtp.pass;
    }
    if (paymentDetails && typeof paymentDetails === "object") {
      cfg.paymentDetails = { ...cfg.paymentDetails, ...paymentDetails };
    }
    if (emailTemplate && typeof emailTemplate === "object") {
      cfg.emailTemplate = { ...cfg.emailTemplate, ...emailTemplate };
    }
    writeConfig(cfg);
    return json(res, 200, { ok: true });
  }

  // ── 404 for unmatched /api/ ────────────────────────────────────────────────
  if (urlPath.startsWith("/api/")) {
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
