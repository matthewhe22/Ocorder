// Merged handler: GET  /api/orders/:id/authority
//                 PUT  /api/orders/:id/status
//                 PUT  /api/orders/:id/amend
//                 POST /api/orders/:id/notify
//                 POST /api/orders/:id/send-certificate
//                 POST /api/orders/:id/send-invoice
//                 POST /api/orders/:id/stripe-confirm  (public — no admin auth)
// Replaces separate files to stay within Vercel Hobby's 12-function limit.

import Stripe from "stripe";
import { readData, writeData, readConfig, validToken, extractToken, cors, readAuthority, writeCertificate, readCertificate, withOrderLock, rateLimit, clientIp, KV_AVAILABLE } from "../../_lib/store.js";
import { uploadToSharePoint, SHAREPOINT_ENABLED, isSharePointEnabled, uploadOrderDocs } from "../../_lib/sharepoint.js";
import { buildOrderEmailHtml, buildCustomerEmailHtml, buildPiqPaymentEmailHtml, createTransporter } from "../../_lib/email.js";
import { generateOrderPdf, generateReceiptPdf } from "../../_lib/pdf.js";
import { detectPiqPayment } from "../../_lib/piq.js";

// ── HTML escape helper ────────────────────────────────────────────────────────
function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ── Generic customer notification email (used by /notify) ────────────────────
function buildNotifyEmailHtml(order, message, cfg) {
  const tpl = cfg.emailTemplate || {};
  const footer = esc(tpl.footer || "Top Owners Corporation Solution  |  info@tocs.co").replace(/\n/g, "<br>");
  const body = esc(message).replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;letter-spacing:0.05em;">Top Owners Corporation Solution</h1>
      <p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">Order ${esc(order.id)} — status update</p>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;white-space:pre-wrap;line-height:1.5;">${body}</p>
      <div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:10px 16px;border-radius:4px;margin:20px 0;font-size:0.83rem;">
        Order Reference: <strong style="font-family:monospace;">${esc(order.id)}</strong>
      </div>
      <hr style="border:none;border-top:1px solid #e8edf0;margin:24px 0 16px;">
      <p style="font-size:0.78rem;color:#aaa;margin:0;">${footer}</p>
    </div>
  </div>
</body></html>`;
}

// ── Order-amended customer email (used by /amend) ────────────────────────────
function buildAmendedEmailHtml(order, oldTotal, newTotal, note, cfg) {
  const tpl = cfg.emailTemplate || {};
  const contact = order.contactInfo || {};
  const items = order.items || [];
  const footer = esc(tpl.footer || "Top Owners Corporation Solution  |  info@tocs.co").replace(/\n/g, "<br>");
  const itemRows = items.map(it => `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${esc(it.productName) || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:center;">${Number(it.qty) || 1}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(Number(it.price) || 0).toFixed(2)}</td>
    </tr>`).join("");
  const totalChanged = Math.round(newTotal * 100) !== Math.round(oldTotal * 100);
  const totalsBlock = totalChanged
    ? `<tr><td style="padding:6px 0;color:#666;width:38%;">Previous Total</td><td style="padding:6px 0;text-decoration:line-through;color:#999;">$${oldTotal.toFixed(2)} AUD</td></tr>
       <tr><td style="padding:6px 0;color:#666;">New Total</td><td style="padding:6px 0;font-weight:700;font-size:1.1rem;color:#1c3326;">$${newTotal.toFixed(2)} AUD</td></tr>`
    : `<tr><td style="padding:6px 0;color:#666;width:38%;">Total</td><td style="padding:6px 0;font-weight:700;font-size:1.1rem;color:#1c3326;">$${newTotal.toFixed(2)} AUD</td></tr>`;
  const noteBlock = note ? `<p style="margin:16px 0 0;padding:12px 16px;background:#f0f7f3;border-left:4px solid #2e6b42;border-radius:4px;font-size:0.88rem;"><strong>Note from TOCS:</strong> ${esc(note).replace(/\n/g, "<br>")}</p>` : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;letter-spacing:0.05em;">TOCS Order Portal</h1>
      <p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">Order Updated</p>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;">Dear ${esc(contact.name) || "Applicant"},</p>
      <p>Your order <strong style="font-family:monospace;">${esc(order.id)}</strong> has been amended by our team. The order reference number stays the same; the updated details are shown below.</p>
      ${noteBlock}
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Updated Order</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        ${totalsBlock}
        <tr><td style="padding:6px 0;color:#666;">Status</td><td style="padding:6px 0;">${esc(order.status)}</td></tr>
      </table>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Items</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f5f7f5;">
          <th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Product</th>
          <th style="padding:8px 12px;text-align:center;font-size:0.78rem;text-transform:uppercase;color:#666;">Qty</th>
          <th style="padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;">Price</th>
        </tr>
        ${itemRows}
        ${order.selectedShipping?.name ? `<tr><td colspan="2" style="padding:8px 12px;color:#666;">Shipping — ${esc(order.selectedShipping.name)}</td><td style="padding:8px 12px;text-align:right;">$${(Number(order.selectedShipping.price) || 0).toFixed(2)}</td></tr>` : ""}
        <tr style="background:#f5f7f5;"><td colspan="2" style="padding:8px 12px;font-weight:700;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:700;">$${newTotal.toFixed(2)} AUD</td></tr>
      </table>
      <p style="font-size:0.85rem;color:#555;">If an invoice was previously issued, an updated invoice reflecting the new total will be sent separately. Please use the same order reference for any payment.</p>
      <hr style="border:none;border-top:1px solid #e8edf0;margin:24px 0 16px;">
      <p style="font-size:0.78rem;color:#aaa;margin:0;">${footer}</p>
    </div>
  </div>
</body></html>`;
}

// ── Email builder ─────────────────────────────────────────────────────────────
function buildCertEmailHtml(order, message, cfg) {
  const tpl = cfg.emailTemplate || {};
  const contact = order.contactInfo || {};
  const lot = order.items?.[0];
  const isKeys = order.orderCategory === "keys";
  const keysDefault = "Dear {name},\n\nPlease find attached your Keys/Fobs/Remotes order documents for {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team";
  const ocDefault = "Dear {name},\n\nPlease find attached your OC Certificate.\n\nKind regards,\nTOCS Team";
  const raw = (tpl.certificateGreeting || (isKeys ? keysDefault : ocDefault))
    .replace(/{name}/g, esc(contact.name || "Applicant"))
    .replace(/{lotNumber}/g, esc(lot?.lotNumber || ""))
    .replace(/{address}/g, esc(lot?.planName || ""));
  const bodyText = message ? esc(message).replace(/\n/g, "<br>") : raw.replace(/\n/g, "<br>");
  const footer = esc(tpl.footer || "Top Owners Corporation Solution  |  info@tocs.co").replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;letter-spacing:0.05em;">Top Owners Corporation Solution</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;">${bodyText}</p>
      <div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:10px 16px;border-radius:4px;margin:20px 0;font-size:0.83rem;">
        Order Reference: <strong style="font-family:monospace;">${esc(order.id)}</strong>
      </div>
      <hr style="border:none;border-top:1px solid #e8edf0;margin:24px 0 16px;">
      <p style="font-size:0.78rem;color:#aaa;margin:0;">${footer}</p>
    </div>
  </div>
</body></html>`;
}

// ── Multipart parser (for FormData uploads) ───────────────────────────────────
// Used by send-certificate / send-invoice so a 3.9 MB PDF doesn't get base64-
// inflated past Vercel's 4.5 MB request body limit.
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || "");
  if (!m) return { fields: {}, files: {} };
  const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
  const fields = {};
  const files = {};
  let pos = buffer.indexOf(boundary);
  if (pos < 0) return { fields, files };
  pos += boundary.length;
  while (pos < buffer.length) {
    if (buffer[pos] === 0x2d && buffer[pos + 1] === 0x2d) break; // closing --
    if (buffer[pos] === 0x0d && buffer[pos + 1] === 0x0a) pos += 2;
    const next = buffer.indexOf(boundary, pos);
    if (next < 0) break;
    let partEnd = next;
    if (buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) partEnd -= 2;
    const part = buffer.slice(pos, partEnd);
    const headerEnd = part.indexOf("\r\n\r\n");
    pos = next + boundary.length;
    if (headerEnd < 0) continue;
    const headerStr = part.slice(0, headerEnd).toString("utf8");
    const body = part.slice(headerEnd + 4);
    const nameMatch = /name="([^"]+)"/.exec(headerStr);
    if (!nameMatch) continue;
    const fileMatch = /filename="([^"]*)"/.exec(headerStr);
    if (fileMatch) {
      const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerStr);
      const fileObj = {
        filename: fileMatch[1],
        contentType: ctMatch ? ctMatch[1].trim() : "application/octet-stream",
        data: body,
      };
      const key = nameMatch[1];
      if (files[key]) {
        if (!Array.isArray(files[key])) files[key] = [files[key]];
        files[key].push(fileObj);
      } else {
        files[key] = fileObj;
      }
    } else {
      fields[nameMatch[1]] = body.toString("utf8");
    }
  }
  return { fields, files };
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Returns { message, attachments } where each attachment has a .buffer Node Buffer.
// Accepts both legacy JSON ({ message, attachment: { filename, contentType, data: base64 } })
// and multipart/form-data (fields: message; file: PDF, one or many) for backward compatibility.
async function readMessageAndAttachments(req) {
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (ct.includes("multipart/form-data")) {
    let buf;
    if (Buffer.isBuffer(req.body)) buf = req.body;
    else if (typeof req.body === "string") buf = Buffer.from(req.body, "utf8");
    else buf = await readRawBody(req).catch(() => Buffer.alloc(0));
    const { fields, files } = parseMultipart(buf, ct);
    const fileField = files.file || files.attachment;
    const fileList = fileField ? (Array.isArray(fileField) ? fileField : [fileField]) : [];
    return {
      message: fields.message || "",
      attachments: fileList.map(f => ({ filename: f.filename, contentType: f.contentType, buffer: f.data })),
    };
  }
  const body = req.body || {};
  const a = body.attachment;
  return {
    message: body.message || "",
    attachments: a?.data
      ? [{ filename: a.filename, contentType: a.contentType, buffer: Buffer.from(a.data, "base64") }]
      : [],
  };
}

// ── Redirect target allow-list ────────────────────────────────────────────────
// Limits the hosts the authority/cert 302 redirects can point at so a corrupted
// or forged URL on the order cannot turn the portal into an open redirector.
// SharePoint Online + Microsoft Graph share-link domains are the only legitimate
// targets here; anything else is treated as a misconfiguration.
const ALLOWED_REDIRECT_HOSTS = /^(?:[a-z0-9-]+\.)*(?:sharepoint\.com|onmicrosoft\.com|microsoft\.com)$/i;
function isAllowedRedirectHost(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    return ALLOWED_REDIRECT_HOSTS.test(u.hostname);
  } catch { return false; }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id, action } = req.query;

  // ── GET /api/orders/:id/authority ─────────────────────────────────────────
  // Two response shapes (matches the /certificate endpoint):
  //   - SharePoint URL on the order → 200 { url } (JSON). Frontend opens it.
  //     Previously this was a 302 that carried the admin token via Referer.
  //   - SharePoint URL missing → stream the binary from Redis KV.
  if (action === "authority" && req.method === "GET") {
    // Bearer header only — the previous ?token= fallback leaked the long-lived
    // admin token via Vercel access logs, browser history, and (on the old
    // 302 path) Referer headers cross-origin to *.sharepoint.com.
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const data = await readData();
    const order = data.orders.find(o => o.id === id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (!order.lotAuthorityFile && !order.lotAuthorityUrl) return res.status(404).json({ error: "No authority document for this order." });

    if (order.lotAuthorityUrl) {
      if (!isAllowedRedirectHost(order.lotAuthorityUrl)) {
        console.error(`Authority URL blocked — non-allowed host: ${order.lotAuthorityUrl}`);
        return res.status(502).json({ error: "Stored authority URL is not on an allowed host." });
      }
      return res.status(200).json({ url: order.lotAuthorityUrl });
    }

    // Fallback: serve from Redis KV
    if (!KV_AVAILABLE) return res.status(503).json({ error: "Document storage is not connected. Add REDIS_URL to Vercel environment variables." });
    let stored = null;
    try { stored = await readAuthority(id); } catch (e) {
      return res.status(503).json({ error: "Document storage unavailable: " + e.message });
    }
    if (!stored?.data) return res.status(404).json({ error: "Document not found in storage." });

    const buf = Buffer.from(stored.data, "base64");
    res.setHeader("Content-Type", stored.contentType || "application/octet-stream");
    const safeFilename = String(order.lotAuthorityFile || "authority").replace(/[^\w.\-]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", buf.length);
    return res.send(buf);
  }

  // ── POST /api/orders/:id/save-to-sharepoint  (admin — retroactive SP save) ─
  // Admin remediation for orders whose SP folder was never created (e.g. Stripe
  // webhook path before the May 13 fix, or any historical SP upload failure).
  // Generates the order summary (and payment receipt for Stripe orders) and
  // uploads alongside the authority doc, then persists the URLs back onto the
  // order.
  //
  // Idempotent — each doc kind is only uploaded if its URL is not already
  // populated on the order. A second click on a fully-uploaded order is a
  // no-op (no audit log noise, no Graph API calls).
  if (action === "save-to-sharepoint" && req.method === "POST") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    // PDF generation is CPU-bound and each call hits the Graph API; rate-limit
    // to stop a script (or a leaked token) from amplifying into a function /
    // Graph-quota DoS.
    const rl = await rateLimit(`sp-save:${clientIp(req)}`, 10, 60);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter || 60));
      return res.status(429).json({ error: "Too many SharePoint saves — please wait a moment and try again." });
    }

    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];

    const cfg = await readConfig();
    const spConfig = cfg?.sharepoint || {};
    if (!isSharePointEnabled(spConfig)) return res.status(400).json({ error: "SharePoint is not configured." });

    const authDocStored = await readAuthority(id).catch(() => null);
    const isStripePaid = order.payment === "stripe" && order.status === "Paid" && !!order.stripeSessionId;

    // Per-doc gating — skip anything already in SharePoint.
    const needSummary = !order.summaryUrl;
    const needAuth    = !!authDocStored?.data && !order.lotAuthorityUrl;
    const needReceipt = isStripePaid && !order.receiptUrl;

    if (!needSummary && !needAuth && !needReceipt) {
      return res.status(200).json({
        ok: true, alreadyPresent: true,
        summaryUrl: order.summaryUrl || null,
        authUrl:    order.lotAuthorityUrl || null,
        receiptUrl: order.receiptUrl || null,
        order,
      });
    }

    let result;
    try {
      result = await uploadOrderDocs(order, spConfig, { generateOrderPdf, generateReceiptPdf }, {
        authDoc: needAuth ? authDocStored : null,
        includeSummary: needSummary,
        includeReceipt: needReceipt,
        stripeSessionId: order.stripeSessionId,
      });
    } catch (e) {
      console.error(`save-to-sharepoint failed for ${id}:`, e.message);
      return res.status(500).json({ error: "SharePoint upload failed: " + (e.message || "unknown error") });
    }
    const { authUrl, summaryUrl, receiptUrl, errors } = result;

    // Wrap the audit-log write in the order lock so a concurrent amend / status
    // / piq / send-cert can't clobber the URLs or entries we just produced.
    let finalOrder;
    try {
      const lockRes = await withOrderLock(id, async () => {
        const fresh = await readData();
        const fi = fresh.orders.findIndex(o => o.id === id);
        if (fi === -1) return { missing: true };
        const fo = fresh.orders[fi];
        fo.auditLog = fo.auditLog || [];
        const ts = () => new Date().toISOString();
        if (needAuth) {
          if (authUrl) { fo.lotAuthorityUrl = authUrl; fo.auditLog.push({ ts: ts(), action: "Authority doc saved to SharePoint", note: `Manual: ${authUrl}` }); }
          else         { fo.auditLog.push({ ts: ts(), action: "Authority doc SP upload failed", note: "Manual: " + (errors.auth?.message?.slice(0, 60) || "See Vercel logs") }); }
        }
        if (needSummary) {
          if (summaryUrl) { fo.summaryUrl = summaryUrl; fo.auditLog.push({ ts: ts(), action: "Order summary saved to SharePoint", note: `Manual: ${summaryUrl}` }); }
          else            { fo.auditLog.push({ ts: ts(), action: "Order summary SP upload failed", note: "Manual: " + (errors.summary?.message?.slice(0, 60) || "See Vercel logs") }); }
        }
        if (needReceipt) {
          if (receiptUrl) { fo.receiptUrl = receiptUrl; fo.auditLog.push({ ts: ts(), action: "Payment receipt saved to SharePoint", note: `Manual: ${receiptUrl}` }); }
          else            { fo.auditLog.push({ ts: ts(), action: "Payment receipt SP upload failed", note: "Manual: " + (errors.receipt?.message?.slice(0, 60) || "See Vercel logs") }); }
        }
        await writeData(fresh);
        return { order: fo };
      });
      if (lockRes.missing) return res.status(404).json({ error: "Order vanished mid-upload." });
      finalOrder = lockRes.order;
    } catch (e) {
      console.error(`save-to-sharepoint persist failed for ${id}:`, e.message);
      return res.status(503).json({ error: "Order is busy — please try again." });
    }
    const fo = finalOrder;
    return res.status(200).json({
      ok: true,
      authUrl, summaryUrl, receiptUrl,
      order: fo,
    });
  }

  // ── GET /api/orders/:id/certificate  (admin — re-download issued cert) ────
  // Two response shapes:
  //   - SharePoint copy available → 200 { url: "<sp view url>" } (JSON).
  //     The frontend opens this in a new tab. A 302 here was previously used
  //     but broke `fetch`-based downloads: browsers follow the cross-origin
  //     redirect without CORS headers and the response becomes opaque, so the
  //     admin saw a generic "could not download" toast on the happy path.
  //   - SharePoint URL missing → stream the bytes from Redis KV.
  if (action === "certificate" && req.method === "GET") {
    // Bearer header only — the previous ?token= fallback leaked the long-lived
    // admin token via Vercel access logs, browser history, and the Referer
    // header on the SP-redirect path. The frontend always passes the token
    // via the Authorization header.
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const data = await readData();
    const order = data.orders.find(o => o.id === id);
    if (!order) return res.status(404).json({ error: "Order not found." });

    if (order.certificateUrl) return res.status(200).json({ url: order.certificateUrl });

    if (!KV_AVAILABLE) return res.status(503).json({ error: "Document storage is not connected." });
    let stored = null;
    try { stored = await readCertificate(id); } catch (e) {
      return res.status(503).json({ error: "Document storage unavailable: " + e.message });
    }
    if (!stored?.data) return res.status(404).json({ error: "No stored certificate for this order." });

    const buf = Buffer.from(stored.data, "base64");
    res.setHeader("Content-Type", stored.contentType || "application/pdf");
    const safeFilename = String(stored.filename || order.certificateFile || `certificate-${order.id}.pdf`).replace(/[^\w.\-]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", buf.length);
    return res.send(buf);
  }

  // ── PUT /api/orders/:id/status ────────────────────────────────────────────
  if (action === "status" && req.method === "PUT") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const { status, note } = req.body || {};
    if (!status) return res.status(400).json({ error: "status is required." });
    // Must match production server.js status enum exactly
    const VALID_STATUSES = ["Pending Payment","Processing","Issued","Cancelled","On Hold","Awaiting Documents","Invoice to be issued","Paid","Awaiting Stripe Payment"];
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status: "${status}".` });

    try {
      const result = await withOrderLock(id, async () => {
        const data = await readData();
        const idx = data.orders.findIndex(o => o.id === id);
        if (idx === -1) return { error: "Order not found.", code: 404 };

        data.orders[idx].status = status;
        const auditEntry = { ts: new Date().toISOString(), action: `Status changed to ${status}` };
        if (note) auditEntry.note = note;
        data.orders[idx].auditLog = [...(data.orders[idx].auditLog || []), auditEntry];
        if (status === "Cancelled" && note) data.orders[idx].cancelReason = note;

        await writeData(data);
        return { ok: true };
      });
      if (result.error) return res.status(result.code).json({ error: result.error });
      return res.status(200).json(result);
    } catch (e) {
      console.error(`status update failed for ${id}:`, e.message);
      return res.status(503).json({ error: "Order is busy — please try again." });
    }
  }

  // ── PUT /api/orders/:id/amend ────────────────────────────────────────────
  // Admin only. Edits items / shipping for an unpaid order and recomputes total.
  // Order reference (id) is preserved.  If an invoice was already sent the admin
  // must click "Send Invoice" again after amending — this endpoint does not
  // re-issue invoices automatically.
  if (action === "amend" && req.method === "PUT") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const AMENDABLE_STATUSES = ["Invoice to be issued", "Pending Payment", "Awaiting Stripe Payment", "On Hold", "Awaiting Documents"];
    const { items, selectedShipping, note } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items must be a non-empty array." });
    if (items.length > 50) return res.status(400).json({ error: "Too many items (max 50)." });
    for (const it of items) {
      if (!it?.productName || typeof it.price !== "number" || !Number.isFinite(it.price) || it.price < 0) {
        return res.status(400).json({ error: "Each item must have productName and a non-negative numeric price." });
      }
    }

    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];
    if (!AMENDABLE_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: `Order cannot be amended in status "${order.status}". Cancel and re-create instead.` });
    }
    if (order.payment === "stripe" && order.status === "Awaiting Stripe Payment") {
      return res.status(409).json({ error: "Stripe orders cannot be amended — the customer is mid-checkout. Cancel and re-create instead." });
    }

    const cleanItems = items.map(it => ({
      productId:   it.productId,
      productName: String(it.productName).slice(0, 200),
      price:       Math.max(0, Math.round(Number(it.price) * 100) / 100),
      qty:         Math.min(100, Math.max(1, Math.floor(Number(it.qty) || 1))),
      lotNumber:   String(it.lotNumber || "").slice(0, 50),
      lotId:       it.lotId,
      planId:      it.planId,
      planName:    String(it.planName || "").slice(0, 200),
      ocName:      String(it.ocName || "").slice(0, 200),
      ocId:        it.ocId || null,
      ...(it.isSecondaryOC ? { isSecondaryOC: true } : {}),
      ...(it.turnaround ? { turnaround: String(it.turnaround).slice(0, 100) } : {}),
      ...(it.managerAdminCharge !== undefined ? { managerAdminCharge: Math.max(0, Number(it.managerAdminCharge) || 0) } : {}),
      ...(it.key ? { key: String(it.key).slice(0, 200) } : {}),
    }));

    let cleanShipping = order.selectedShipping;
    if (order.orderCategory === "keys" && selectedShipping && typeof selectedShipping === "object") {
      cleanShipping = {
        id:    String(selectedShipping.id   || "").slice(0, 50),
        name:  String(selectedShipping.name || "").slice(0, 100),
        type:  String(selectedShipping.type || "").slice(0, 50),
        price: Math.max(0, Number(selectedShipping.price) || 0),
      };
    }
    const shippingCost = (order.orderCategory === "keys" && cleanShipping)
      ? Math.max(0, Number(cleanShipping.price) || 0) : 0;
    const newTotal = Math.round((cleanItems.reduce((s, it) => s + (Number(it.price) || 0), 0) + shippingCost) * 100) / 100;

    const oldTotal = Number(order.total) || 0;
    const oldItemCount = (order.items || []).length;
    const noteText = (typeof note === "string" && note.trim()) ? note.trim().slice(0, 200) : "";
    const auditNote = `Total: $${oldTotal.toFixed(2)} → $${newTotal.toFixed(2)} | Items: ${oldItemCount} → ${cleanItems.length}${noteText ? ` | ${noteText}` : ""}`;

    data.orders[idx].items = cleanItems;
    data.orders[idx].total = newTotal;
    if (cleanShipping) data.orders[idx].selectedShipping = cleanShipping;
    const amendTs = new Date().toISOString();
    data.orders[idx].auditLog = [...(data.orders[idx].auditLog || []), {
      ts: amendTs,
      action: "Order amended",
      note: auditNote,
    }];
    await writeData(data);

    // Regenerate the order summary PDF and upload to SharePoint so the stored
    // copy reflects the amendment.  The new file is date-stamped so multiple
    // amendments on different days each get their own file; same-day amendments
    // overwrite (the latest snapshot is what matters).  Failures are logged to
    // the audit log but do not roll back the amendment itself.
    const cfgForSp = await readConfig();
    const spConfig = cfgForSp?.sharepoint || {};
    const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);
    if (spEnabled) {
      const updatedOrder = data.orders[idx];
      const categoryFolder = updatedOrder.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
      const buildingName = (updatedOrder.items?.[0]?.planName || "Unknown Building").replace(/[\\/:*?"<>|]/g, "-").trim();
      const spSubFolder = `${buildingName}/${categoryFolder}/${updatedOrder.id}`;
      const dateStr = amendTs.slice(0, 10); // YYYY-MM-DD
      const filename = `order-summary-amended-${dateStr}.pdf`;
      let newSummaryUrl = null;
      let spErr = null;
      try {
        const pdfBuffer = await generateOrderPdf(updatedOrder);
        newSummaryUrl = await uploadToSharePoint(filename, "application/pdf", pdfBuffer.toString("base64"), spConfig, spSubFolder);
      } catch (e) {
        spErr = e;
        console.error(`Amend: order summary regeneration failed for ${id}:`, e.message);
      }
      // Fresh-read so we don't clobber any concurrent writes (e.g. PIQ poll)
      const fresh = await readData().catch(() => null);
      const oi = fresh?.orders.find(o => o.id === id);
      if (oi) {
        if (newSummaryUrl) {
          oi.summaryUrl = newSummaryUrl;
          oi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary regenerated", note: `${filename} → ${newSummaryUrl}` });
          data.orders[idx].summaryUrl = newSummaryUrl;
        } else {
          const note = spErr?.message ? spErr.message.substring(0, 120) : "See Vercel logs";
          oi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary regeneration failed", note });
        }
        await writeData(fresh).catch(e => console.error("Amend SP audit persist failed:", e.message));
      }
    }
    // Notify the applicant by email that their order has been amended.
    // Best-effort: failure is recorded in the audit log but does not fail the request,
    // since the amendment itself has already been persisted.
    const cfgForEmail = cfgForSp;
    const smtp = cfgForEmail.smtp || {};
    const recipientEmail = data.orders[idx].contactInfo?.email;
    if (recipientEmail && smtp.host && smtp.user && smtp.pass) {
      try {
        const transporter = createTransporter(smtp);
        const fromEmail = cfgForEmail.orderEmail || "Orders@tocs.co";
        await transporter.sendMail({
          from: `"Top Owners Corporation Solution" <${fromEmail}>`,
          to: recipientEmail,
          subject: `Update to your TOCS order ${id}`,
          html: buildAmendedEmailHtml(data.orders[idx], oldTotal, newTotal, noteText, cfgForEmail),
        });
        const fresh = await readData().catch(() => null);
        const oi = fresh?.orders.find(o => o.id === id);
        if (oi) {
          oi.auditLog.push({ ts: new Date().toISOString(), action: "Amendment notification sent", note: `Sent to: ${recipientEmail}` });
          await writeData(fresh).catch(e => console.error("Amend email audit persist failed:", e.message));
        }
      } catch (e) {
        console.error(`Amend customer email failed for ${id}:`, e.message);
        const fresh = await readData().catch(() => null);
        const oi = fresh?.orders.find(o => o.id === id);
        if (oi) {
          oi.auditLog.push({ ts: new Date().toISOString(), action: "Amendment notification failed", note: e.message?.substring(0, 200) || "" });
          await writeData(fresh).catch(err => console.error("Amend email failure audit persist failed:", err.message));
        }
      }
    }
    return res.status(200).json({ ok: true, order: data.orders[idx] });
  }

  // ── POST /api/orders/:id/notify  (admin — generic customer email) ────────
  // Body: { subject?, message }.  Sends to order.contactInfo.email; failure is
  // logged to the order audit log so the admin UI surfaces delivery problems
  // without needing access to server logs.
  if (action === "notify" && req.method === "POST") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const { subject, message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "A non-empty message is required." });
    }
    const safeMessage = message.slice(0, 5000);
    const safeSubject = (typeof subject === "string" && subject.trim()) ? subject.slice(0, 200) : null;

    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];
    const recipientEmail = order.contactInfo?.email;
    if (!recipientEmail) return res.status(400).json({ error: "Order has no customer email address." });

    const cfg = await readConfig();
    const smtp = cfg.smtp || {};
    if (!smtp.host || !smtp.user || !smtp.pass) return res.status(400).json({ error: "SMTP not configured." });

    const subj = safeSubject || `Update on your TOCS order ${order.id}`;
    try {
      const transporter = createTransporter(smtp);
      const fromEmail = cfg.orderEmail || "Orders@tocs.co";
      await transporter.sendMail({
        from: `"Top Owners Corporation Solution" <${fromEmail}>`,
        to: recipientEmail,
        subject: subj,
        html: buildNotifyEmailHtml(order, safeMessage, cfg),
      });
      data.orders[idx].auditLog = [
        ...(data.orders[idx].auditLog || []),
        { ts: new Date().toISOString(), action: "Customer notified", note: `Subject: ${subj}` },
      ];
      await writeData(data);
      return res.status(200).json({ ok: true });
    } catch (err) {
      data.orders[idx].auditLog = [
        ...(data.orders[idx].auditLog || []),
        { ts: new Date().toISOString(), action: "Customer notify failed", note: err.message?.substring(0, 200) || "" },
      ];
      await writeData(data).catch(() => {});
      console.error(`Customer notify failed for ${id}:`, err.message);
      return res.status(500).json({ error: "Failed to send notification email." });
    }
  }

  // ── POST /api/orders/:id/send-certificate ─────────────────────────────────
  if (action === "send-certificate" && req.method === "POST") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const { message, attachments } = await readMessageAndAttachments(req);
    const ATTACH_LIMIT = 4.5 * 1024 * 1024;
    const totalAttachSize = attachments.reduce((sum, a) => sum + a.buffer.length, 0);
    if (totalAttachSize > ATTACH_LIMIT) return res.status(413).json({ error: "Attachments too large — total must be under 4.5 MB." });
    // Refuse to send a "certificate" email with no certificate attached — the
    // recipient would get an empty notification and SharePoint would never
    // receive a copy. Both happened for TOCS-MOJI6FCL-YLC / TOCS-MOI215N8-GR4.
    if (attachments.length === 0) return res.status(400).json({ error: "Attach at least one certificate file before sending." });
    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];

    const cfg = await readConfig();
    const smtp = cfg.smtp || {};
    const fromEmail = cfg.orderEmail || "Orders@tocs.co";
    if (!order.contactInfo?.email) return res.status(400).json({ error: "No email address on this order." });
    if (!smtp.host || !smtp.user || !smtp.pass) return res.status(400).json({ error: "SMTP not configured." });

    try {
      const transporter = createTransporter(smtp);
      const tpl = cfg.emailTemplate || {};
      const isKeys = order.orderCategory === "keys";
      const subj = isKeys
        ? `Your Keys/Fobs Order — ${order.id}`
        : (tpl.certificateSubject || "Your OC Certificate — Order #{orderId}").replace(/{orderId}/g, order.id);
      const mailOpts = {
        from: `"Top Owners Corporation Solution" <${fromEmail}>`,
        to: order.contactInfo.email,
        subject: subj,
        html: buildCertEmailHtml(order, message, cfg),
      };
      if (attachments.length > 0) {
        const defaultFilename = "OC-Certificate.pdf";
        mailOpts.attachments = attachments.map((a, i) => ({
          filename: a.filename || (i === 0 ? defaultFilename : `attachment-${i + 1}.pdf`),
          content: a.buffer,
          contentType: a.contentType || "application/pdf",
        }));
      }
      await transporter.sendMail(mailOpts);

      // Save the emailed certificate to Redis KV as a guaranteed fallback for
      // admin re-download. This succeeds even when SharePoint is unreachable so
      // the cert is never lost after delivery.
      const first = attachments[0];
      const firstFilename    = first.filename    || "certificate.pdf";
      const firstContentType = first.contentType || "application/pdf";
      let kvSaved = false;
      if (KV_AVAILABLE) {
        try {
          await writeCertificate(order.id, {
            data: first.buffer.toString("base64"),
            filename: firstFilename,
            contentType: firstContentType,
          });
          kvSaved = true;
        } catch (e) { console.error("Certificate KV save failed:", e.message); }
      }

      // Auto-save first certificate to SharePoint (best-effort, non-fatal)
      let certUrlNew = null;
      try {
        const spConfig  = cfg?.sharepoint || {};
        const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);
        if (spEnabled) {
          const spCategoryFolder = order.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
          const spBuildingName = (order.items?.[0]?.planName || "Unknown Building").replace(/[\\/:*?"<>|]/g, "-").trim();
          const spSubFolder = `${spBuildingName}/${spCategoryFolder}/${order.id}`;
          certUrlNew = await uploadToSharePoint(
            firstFilename,
            firstContentType,
            first.buffer,
            spConfig,
            spSubFolder
          );
        }
      } catch (e) { console.error("Certificate SharePoint upload failed:", e.message); }

      // Re-read fresh data before writing to avoid clobbering concurrent writes
      // (same pattern as send-invoice — email takes ~7s during which poll-piq may write).
      const freshDataCert = await readData();
      const freshIdxCert  = freshDataCert.orders.findIndex(o => o.id === id);
      if (freshIdxCert !== -1) {
        const freshOrder = freshDataCert.orders[freshIdxCert];
        freshOrder.certificateFile = firstFilename;
        freshOrder.certificateContentType = firstContentType;
        if (certUrlNew) freshOrder.certificateUrl = certUrlNew;
        freshOrder.status = "Issued";
        const newAudit = [];
        if (kvSaved) newAudit.push({ ts: new Date().toISOString(), action: "Certificate saved to Redis", note: firstFilename });
        if (certUrlNew) newAudit.push({ ts: new Date().toISOString(), action: "Certificate saved to SharePoint", note: certUrlNew });
        else if (SHAREPOINT_ENABLED || cfg?.sharepoint?.siteId) newAudit.push({ ts: new Date().toISOString(), action: "Certificate SP upload failed", note: "See Vercel logs" });
        newAudit.push({ ts: new Date().toISOString(), action: "Certificate issued", note: `Sent to: ${order.contactInfo.email}` });
        freshOrder.auditLog = [...(freshOrder.auditLog || []), ...newAudit];
        await writeData(freshDataCert);
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/orders/:id/send-invoice ────────────────────────────────────
  if (action === "send-invoice" && req.method === "POST") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const { message, attachments: invoiceAttachments } = await readMessageAndAttachments(req);
    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];

    const cfg = await readConfig();
    const smtp = cfg.smtp || {};
    const fromEmail = cfg.orderEmail || "Orders@tocs.co";
    if (!order.contactInfo?.email) return res.status(400).json({ error: "No email address on this order." });
    if (!smtp.host || !smtp.user || !smtp.pass) return res.status(400).json({ error: "SMTP not configured." });

    try {
      const transporter = createTransporter(smtp);
      const pd = cfg.paymentDetails || {};
      const contact = order.contactInfo || {};
      const defaultMsg = `Dear ${contact.name || "Applicant"},\n\nPlease find attached your invoice for Keys/Fobs/Remotes order #${order.id}.\n\nKind regards,\nTOCS Team`;
      const htmlBody = message ? esc(message).replace(/\n/g, "<br>") : esc(defaultMsg).replace(/\n/g, "<br>");
      const tpl = cfg.emailTemplate || {};
      const footer = esc(tpl.footer || "Top Owners Corporation Solution  |  info@tocs.co").replace(/\n/g, "<br>");
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
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
      const mailOpts = {
        from: `"Top Owners Corporation Solution" <${fromEmail}>`,
        to: order.contactInfo.email,
        subject: `Invoice for your Keys/Fobs/Remotes Order #${order.id}`,
        html,
      };
      if (invoiceAttachments.length > 0) {
        mailOpts.attachments = invoiceAttachments.map((a, i) => ({
          filename: a.filename || (i === 0 ? "Invoice.pdf" : `attachment-${i + 1}.pdf`),
          content: a.buffer,
          contentType: a.contentType || "application/pdf",
        }));
      }
      await transporter.sendMail(mailOpts);

      // Auto-save invoice to SharePoint (best-effort, non-fatal)
      // Capture the URL separately so we can apply it to fresh data below.
      let spInvoiceUrl = null;
      let spAuditEntry = null;
      if (invoiceAttachments.length > 0) {
        try {
          const spConfig  = cfg?.sharepoint || {};
          const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);
          if (spEnabled) {
            const spCategoryFolder = order.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
            const spBuildingName = (order.items?.[0]?.planName || "Unknown Building").replace(/[\\/:*?"<>|]/g, "-").trim();
            const spSubFolder = `${spBuildingName}/${spCategoryFolder}/${order.id}`;
            const first = invoiceAttachments[0];
            const uploadedUrl = await uploadToSharePoint(
              first.filename || "invoice.pdf",
              first.contentType || "application/pdf",
              first.buffer,
              spConfig,
              spSubFolder
            );
            if (uploadedUrl) {
              spInvoiceUrl = uploadedUrl;
              spAuditEntry = { ts: new Date().toISOString(), action: "Invoice saved to SharePoint", note: uploadedUrl };
            }
          }
        } catch (e) { console.error("Invoice SharePoint upload failed:", e.message); }
      }

      // Re-read fresh data before writing the status update to avoid clobbering
      // concurrent writes (e.g. the hourly PIQ poll) that ran while the email was
      // being sent.  The email is already delivered at this point so we must not
      // let a stale snapshot from earlier in this request overwrite the current state.
      const freshData = await readData();
      const freshIdx  = freshData.orders.findIndex(o => o.id === id);
      if (freshIdx !== -1) {
        if (spInvoiceUrl) freshData.orders[freshIdx].invoiceUrl = spInvoiceUrl;
        freshData.orders[freshIdx].status = "Pending Payment";
        const newAuditEntries = [
          ...(spAuditEntry ? [spAuditEntry] : []),
          { ts: new Date().toISOString(), action: "Invoice sent", note: `Sent to: ${order.contactInfo.email}` },
        ];
        freshData.orders[freshIdx].auditLog = [...(freshData.orders[freshIdx].auditLog || []), ...newAuditEntries];
        await writeData(freshData);
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/orders/:id/stripe-confirm ──────────────────────────────────
  // PUBLIC — no admin auth (customer's browser calls this after Stripe redirect).
  // Security: session.metadata.orderId is compared to the URL id to prevent
  // cross-order confirmation attacks. stripeSessionId is read from Redis, never from request body.
  if (action === "stripe-confirm" && req.method === "POST") {
    const cfgForStripe = await readConfig();
    const stripeKey = cfgForStripe.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(503).json({ error: "Stripe is not configured on this server." });
    }

    // Pre-lock read so we can short-circuit on already-paid (avoids a Stripe
    // round-trip and the lock contention that would otherwise stack up if
    // the customer double-submits the confirmation request).
    const initialData = await readData();
    const initialIdx  = initialData.orders.findIndex(o => o.id === id);
    if (initialIdx === -1) return res.status(404).json({ error: "Order not found." });
    if (initialData.orders[initialIdx].status === "Paid") {
      return res.status(200).json({ success: true, order: initialData.orders[initialIdx] });
    }

    const stripeSessionIdRef = initialData.orders[initialIdx].stripeSessionId;
    if (!stripeSessionIdRef) {
      return res.status(400).json({ error: "No Stripe session associated with this order." });
    }

    const stripe = new Stripe(stripeKey);
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(stripeSessionIdRef);
    } catch (e) {
      console.error("Stripe session retrieve failed:", e.message);
      return res.status(500).json({ error: "Could not verify payment. Please contact support." });
    }

    // Security: server-side metadata verification — prevents cross-order attacks
    if (session.metadata?.orderId !== id) {
      console.error(`stripe-confirm metadata mismatch: session.metadata.orderId=${session.metadata?.orderId} vs URL id=${id}`);
      return res.status(400).json({ error: "Payment verification failed." });
    }

    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment not completed.", payment_status: session.payment_status });
    }

    // Acquire the order lock and re-check status to serialise against the
    // checkout.session.completed webhook (which can race this endpoint).
    let data, idx, stripeSessionId;
    try {
      const r = await withOrderLock(id, async () => {
        const d = await readData();
        const i = d.orders.findIndex(o => o.id === id);
        if (i === -1) return { error: "Order not found.", code: 404 };
        if (d.orders[i].status === "Paid") return { alreadyPaid: true, order: d.orders[i] };
        d.orders[i].status = "Paid";
        d.orders[i].auditLog = [...(d.orders[i].auditLog || []), {
          ts: new Date().toISOString(),
          action: "Payment confirmed via Stripe",
          note: `Session: ${d.orders[i].stripeSessionId}`,
        }];
        await writeData(d);
        return { data: d, idx: i, stripeSessionId: d.orders[i].stripeSessionId };
      });
      if (r.error) return res.status(r.code).json({ error: r.error });
      if (r.alreadyPaid) return res.status(200).json({ success: true, order: r.order });
      data = r.data; idx = r.idx; stripeSessionId = r.stripeSessionId;
    } catch (e) {
      console.error(`stripe-confirm lock/write failed for ${id}:`, e.message);
      return res.status(503).json({ error: "Order is busy — please try again." });
    }

    // Send admin + customer emails using shared helpers from _lib/email.js
    // Timeout config: connectionTimeout:8000, socketTimeout:10000, NO greetingTimeout
    // (matches orders/index.js pattern — greetingTimeout causes silent failures with SMTP2GO)
    const cfg     = cfgForStripe;   // reuse — already fetched above for Stripe key resolution
    const smtp    = cfg.smtp || {};
    const toEmail = cfg.orderEmail || "Orders@tocs.co";
    const confirmedOrder = data.orders[idx];

    // Fetch authority doc once — shared by SP IIFE and email attachment below.
    // Intentionally unconditional: SP may be enabled even when SMTP is not.
    const authDoc = await readAuthority(id).catch(() => null);

    // ── START SP uploads immediately (fire-and-forget, parallel to emails) ─────
    // Pattern mirrors api/orders/index.js: IIFE starts at T=0, emails await in
    // parallel, response is sent after emails, then await spPromise (~1–2s left).
    let spPromise = Promise.resolve();
    const spConfig  = cfg?.sharepoint || {};
    const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);
    if (spEnabled) {
      const categoryFolder = confirmedOrder.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
      const buildingName   = (confirmedOrder.items?.[0]?.planName || "Unknown Building")
        .replace(/[\\/:*?"<>|]/g, "-").trim();
      const spSubFolder    = `${buildingName}/${categoryFolder}/${id}`;

      spPromise = (async () => {
        try {
          const [summaryBuf, receiptBuf] = await Promise.all([
            generateOrderPdf(confirmedOrder),
            generateReceiptPdf(confirmedOrder, stripeSessionId),
          ]);
          const summaryB64 = summaryBuf.toString("base64");
          const receiptB64 = receiptBuf.toString("base64");

          const [authResult, summaryResult, receiptResult] = await Promise.allSettled([
            authDoc?.data
              ? uploadToSharePoint(
                  `authority-${authDoc.filename || "document"}`,
                  authDoc.contentType || "application/octet-stream",
                  authDoc.data,
                  spConfig,
                  spSubFolder
                ).catch(e => { console.error("SP authority upload:", e.message); return null; })
              : Promise.resolve(null),
            uploadToSharePoint("order-summary.pdf", "application/pdf", summaryB64, spConfig, spSubFolder)
              .catch(e => { console.error("SP summary upload:", e.message); return null; }),
            uploadToSharePoint("payment-receipt.pdf", "application/pdf", receiptB64, spConfig, spSubFolder)
              .catch(e => { console.error("SP receipt upload:", e.message); return null; }),
          ]);

          const authUrl    = authResult.status    === "fulfilled" ? authResult.value    : null;
          const summaryUrl = summaryResult.status === "fulfilled" ? summaryResult.value : null;
          const receiptUrl = receiptResult.status === "fulfilled" ? receiptResult.value : null;

          // Fresh readData — avoids overwriting the "Paid" status committed above
          const freshData = await readData();
          const oi = freshData.orders.find(o => o.id === id);
          if (oi) {
            oi.auditLog = oi.auditLog || [];
            if (authUrl)            { oi.lotAuthorityUrl = authUrl;  oi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc saved to SharePoint", note: authUrl }); }
            else if (authDoc?.data) { oi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc SP upload failed", note: "See Vercel logs" }); }
            if (summaryUrl)         { oi.summaryUrl = summaryUrl;   oi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary saved to SharePoint", note: summaryUrl }); }
            else                    { oi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary SP upload failed", note: "See Vercel logs" }); }
            if (receiptUrl)         { oi.receiptUrl = receiptUrl;   oi.auditLog.push({ ts: new Date().toISOString(), action: "Payment receipt saved to SharePoint", note: receiptUrl }); }
            else                    { oi.auditLog.push({ ts: new Date().toISOString(), action: "Payment receipt SP upload failed", note: "See Vercel logs" }); }
          }
          await writeData(freshData).catch(e => console.error("SP result persist failed:", e.message));
          console.log(`SP uploads done for stripe order ${id}: auth=${!!authUrl} summary=${!!summaryUrl} receipt=${!!receiptUrl}`);
        } catch (e) {
          console.error("SP upload block failed:", e.message);
        }
      })();
    }
    // ── END SP uploads ──────────────────────────────────────────────────────────

    if (smtp.host && smtp.user && smtp.pass) {
      const authAttachment = (authDoc?.data && authDoc.filename)
        ? [{ filename: authDoc.filename, content: authDoc.data, encoding: "base64", contentType: authDoc.contentType || "application/octet-stream" }]
        : [];
      const transporter = createTransporter(smtp);
      const from = `"TOCS Order Portal" <${toEmail}>`;
      const orderType = { oc: "OC Certificate", keys: "Keys / Fobs" }[confirmedOrder.orderCategory] || "Order";
      const lotNumber = confirmedOrder.items?.[0]?.lotNumber || "";
      const buildingName = confirmedOrder.items?.[0]?.planName || "";
      const adminSubject = (cfg.emailTemplate?.adminNotificationSubject || "New Order — {orderType} #{orderId} — {total}")
        .replace("{orderType}", orderType)
        .replace("{orderId}", confirmedOrder.id || "")
        .replace("{total}", confirmedOrder.total != null ? `$${confirmedOrder.total.toFixed(2)}` : "")
        .replace("{lotNumber}", lotNumber)
        .replace("{buildingName}", buildingName)
        .replace("{address}", buildingName);
      const emailJobs = [
        transporter.sendMail({
          from, to: toEmail,
          subject: adminSubject,
          html: buildOrderEmailHtml(confirmedOrder, cfgForStripe),
          attachments: authAttachment,
        }).catch(e => console.error("Admin stripe email failed:", e.message)),
      ];
      if (confirmedOrder.contactInfo?.email) {
        emailJobs.push(
          transporter.sendMail({
            from, to: confirmedOrder.contactInfo.email,
            subject: `Payment Confirmed — Order ${id}`,
            html: buildCustomerEmailHtml(confirmedOrder, cfg),
          }).catch(e => console.error("Customer stripe email failed:", e.message))
        );
      }
      await Promise.allSettled(emailJobs).then(async results => {
        const sent = results.filter(r => r.status === "fulfilled").length;
        console.log(`Stripe-confirm emails: ${sent}/${results.length} sent for order ${id}`);
        const labels = ["Admin notification", "Customer confirmation"];
        const failures = results
          .map((r, i) => r.status === "rejected" ? `${labels[i] || "Email"} failed: ${r.reason?.message || "unknown"}` : null)
          .filter(Boolean);
        if (failures.length > 0) {
          try {
            const fresh = await readData();
            const oi = fresh.orders.find(o => o.id === id);
            if (oi) {
              failures.forEach(msg => oi.auditLog.push({ ts: new Date().toISOString(), action: "Email notification failed: " + msg, note: "" }));
              await writeData(fresh);
            }
          } catch (e) { console.error("Failed to persist email failure to audit log:", e.message); }
        }
      });
    }

    // Send response before awaiting SP — customer should not wait for uploads
    res.status(200).json({ success: true, order: confirmedOrder });

    // Allow SP uploads to finish if still in-flight.
    // NOTE: stripe-confirm has ~1–1.5s of pre-IIFE overhead (readData, Stripe API, writeData,
    // readConfig, readAuthority) before the IIFE and emails start. Combined with ~6.6s emails,
    // the remaining budget for await spPromise is tighter than orders/index.js (~1–2s max).
    // SP uploads typically complete in 2–3s; if they exceed the Vercel 10s limit, audit log
    // entries will not be written but Redis data is not corrupted.
    await spPromise;
    return;
  }
  // ── END stripe-confirm ─────────────────────────────────────────────────────

  // ── POST /api/orders/:id/stripe-cancel ──────────────────────────────────────
  // PUBLIC — called by the browser when the customer cancels or abandons Stripe checkout.
  // Verifies the Stripe session is NOT paid before removing the phantom order from Redis.
  if (action === "stripe-cancel" && req.method === "POST") {
    const data = await readData();
    const idx  = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(200).json({ ok: true }); // already gone — idempotent

    const order = data.orders[idx];

    // Only allow cancellation of Stripe-pending orders
    if (order.payment !== "stripe" || order.status === "Paid") {
      return res.status(409).json({ error: "Order cannot be cancelled via this endpoint." });
    }

    // Double-check with Stripe that payment was not actually completed
    const cfg = await readConfig();
    const stripeKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
    if (stripeKey && order.stripeSessionId) {
      try {
        const stripe = new Stripe(stripeKey);
        const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
        if (session.payment_status === "paid") {
          // Race condition: payment completed just as user hit cancel — honour the payment
          return res.status(409).json({ error: "Payment was already completed. Refresh to see your confirmation." });
        }
      } catch (e) {
        // Stripe API unavailable — refuse cancellation; let checkout.session.expired webhook handle it
        console.warn(`stripe-cancel: could not verify session for order ${id}:`, e.message);
        return res.status(503).json({ error: "Could not verify payment status. Please try again shortly." });
      }
    }

    order.status = "Cancelled";
    order.auditLog = [...(order.auditLog || []), { ts: new Date().toISOString(), action: "Order cancelled", note: "Stripe checkout abandoned by customer" }];
    await writeData(data);
    console.log(`stripe-cancel: cancelled pending order ${id}`);
    return res.status(200).json({ ok: true });
  }
  // ── END stripe-cancel ──────────────────────────────────────────────────────

  // ── DELETE /api/orders/:id/delete ───────────────────────────────────────────
  // Admin only. Permanently removes an order from Redis. No undo.
  if (action === "delete" && req.method === "DELETE") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });

    const orderToDelete = data.orders[idx];
    if (orderToDelete.status !== "Cancelled") {
      return res.status(409).json({ error: "Only cancelled orders can be deleted. Cancel the order first." });
    }

    data.orders.splice(idx, 1);
    await writeData(data);
    return res.status(200).json({ ok: true, deleted: id });
  }

  // ── POST /api/orders/:id/check-piq-payment ──────────────────────────────────
  // Admin only. Manually polls the PIQ lot ledger for a single keys order.
  // Returns current levy/payment status and persists results to Redis.
  if (action === "check-piq-payment" && req.method === "POST") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const data  = await readData();
    const idx   = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];

    // Allow admin to reset the locked payment date so a corrected date can be recorded.
    if (req.body?.resetPaymentDate === true && order.status === "Paid") {
      order.piqPaymentDate = null;
      order.auditLog = [...(order.auditLog || []), { ts: new Date().toISOString(), action: "PIQ payment date reset", note: "Reset by admin to allow re-confirmation" }];
    }

    // Auto-link piqLotId from plan lots for orders placed before the plan was
    // synced from PIQ (piqLotId was missing at order-creation time).
    // Normalise lot numbers so "Lot 5" matches PIQ's "5" and vice-versa.
    if (!order.piqLotId) {
      const normStr = s => String(s || "").trim().toLowerCase().replace(/^(lot|unit|apt|apartment|villa|shop|suite|level|block|stage|tower)\s+/i, "").trim();
      const lotNumber = order.items?.[0]?.lotNumber || "";
      const lotId     = order.items?.[0]?.lotId     || "";
      const planId    = order.items?.[0]?.planId    || "";
      const plan      = data.strataPlans?.find(p => p.id === planId);
      const lots      = plan?.lots || [];
      const matches   = l =>
        (lotNumber && normStr(l.number) === normStr(lotNumber)) ||
        (lotId     && l.id === lotId);
      // Prefer a lot that already has piqLotId to avoid matching the un-linked duplicate
      const lot = lots.find(l => l.piqLotId && matches(l)) ?? lots.find(matches);
      if (lot?.piqLotId) {
        order.piqLotId = lot.piqLotId;
        if (order.items?.[0]) order.items[0].lotId = lot.id;
        order.auditLog = [...(order.auditLog || []), {
          ts: new Date().toISOString(),
          action: "PIQ lot linked",
          note: `piqLotId ${lot.piqLotId} auto-linked from plan on first check`,
        }];
      }
    }

    if (!order.piqLotId) {
      return res.status(400).json({ error: "This order has no PIQ lot ID. Sync the plan from PIQ first." });
    }

    const cfg = await readConfig();
    const now = new Date().toISOString();

    try {
      const result = await detectPiqPayment(cfg, order.piqLotId, order.id);

      // Update order fields
      order.piqLastPolled    = now;
      order.piqLevyFound     = result.levyFound;
      order.piqLevyTotalDue  = result.totalDue  ?? order.piqLevyTotalDue  ?? null;
      order.piqLevyTotalNett = result.totalNett ?? (result.paid ? 0 : order.piqLevyTotalNett ?? null);

      if (result.paid) {
        const isNewPayment = !["Paid", "Issued"].includes(order.status) || !order.piqPaymentDate;
        // Use server time as payment date on first confirmation only — never overwrite.
        if (!order.piqPaymentDate) order.piqPaymentDate = now;
        if (result.paymentReference) order.piqPaymentReference = result.paymentReference;

        if (isNewPayment) {
        // Don't regress status from "Issued" — keys were already dispatched; just record payment details.
        if (order.status !== "Issued") order.status = "Paid";
        const dateStr = new Date(now).toLocaleDateString("en-AU", { day:"2-digit", month:"short", year:"numeric" });
        order.auditLog = [...(order.auditLog || []), {
          ts:     now,
          action: "Payment confirmed via PropertyIQ",
          note:   `Date: ${dateStr} | Ref: ${result.paymentReference || "—"} | Amount: $${(result.totalPaid || 0).toFixed(2)}`,
        }];

        // Send payment notification email to admin (non-fatal)
        try {
          const smtp = cfg.smtp || {};
          if (smtp.host && smtp.user && smtp.pass) {
            const toEmail     = cfg.orderEmail || "Orders@tocs.co";
            const transporter = createTransporter(smtp);
            const lotNumber   = order.items?.[0]?.lotNumber || "";
            const planName    = order.items?.[0]?.planName  || "";
            await transporter.sendMail({
              from:    `"TOCS Order Portal" <${toEmail}>`,
              to:      toEmail,
              subject: `PAYMENT RECEIVED — Keys/Fob Order ${order.id} — ${lotNumber}, ${planName}`,
              html:    buildPiqPaymentEmailHtml(order, order.piqPaymentDate, result.paymentReference, result.totalPaid),
            });
          }
        } catch (emailErr) {
          console.error(`PIQ payment email failed for ${order.id}:`, emailErr.message);
          order.auditLog.push({ ts: now, action: "PIQ payment email failed", note: emailErr.message?.substring(0, 120) });
        }
        } // end isNewPayment
      }

      await writeData(data);

      return res.status(200).json({
        ok:               true,
        levyFound:        result.levyFound,
        paid:             result.paid || false,
        totalDue:         result.totalDue    ?? null,
        totalNett:        result.totalNett   ?? null,
        totalPaid:        result.totalPaid   ?? null,
        paymentDate:      order.piqPaymentDate     ?? null,
        paymentReference: result.paymentReference ?? null,
        lastPolled:       now,
        orderStatus:      order.status,
      });
    } catch (err) {
      console.error(`check-piq-payment error for ${id}:`, err.message);
      // Still update lastPolled on error
      order.piqLastPolled = now;
      await writeData(data).catch(() => {});
      return res.status(200).json({ ok: false, error: err.message, lastPolled: now });
    }
  }

  // ── GET /api/orders/:id/track  (public — applicant order status lookup) ──────
  if (action === "track" && req.method === "GET") {
    // Per-IP rate limit: 30 lookups per 5 minutes is well above legitimate use
    // (a customer occasionally re-checking their own order) but blunts
    // enumeration scans against the order-id space.
    const ip = clientIp(req);
    const rl = await rateLimit(`track:${ip}`, 30, 5 * 60);
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.retryAfter || 60));
      return res.status(429).json({ error: "Too many requests. Please try again shortly." });
    }
    const data = await readData();
    const order = data.orders.find(o => o.id.toUpperCase() === id.toUpperCase());
    if (!order) return res.status(404).json({ error: "Order not found. Please check your reference number." });
    const firstItem = order.items?.[0] || {};
    return res.status(200).json({
      id: order.id,
      status: order.status,
      date: order.date,
      orderCategory: order.orderCategory,
      planName: firstItem.planName || "",
      lotNumber: firstItem.lotNumber || "",
      total: order.total,
      items: (order.items || []).map(({ productName, qty, price, ocName }) => ({ productName, qty, price, ocName })),
    });
  }

  return res.status(404).json({ error: "Unknown action." });
}
