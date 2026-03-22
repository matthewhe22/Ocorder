// Merged handler: GET  /api/orders/:id/authority
//                 PUT  /api/orders/:id/status
//                 POST /api/orders/:id/send-certificate
//                 POST /api/orders/:id/send-invoice
//                 POST /api/orders/:id/stripe-confirm  (public — no admin auth)
// Replaces separate files to stay within Vercel Hobby's 12-function limit.

import nodemailer from "nodemailer";
import Stripe from "stripe";
import { readData, writeData, readConfig, validToken, extractToken, cors, readAuthority, KV_AVAILABLE } from "../../_lib/store.js";
import { uploadToSharePoint, SHAREPOINT_ENABLED } from "../../_lib/sharepoint.js";
import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "../../_lib/email.js";
import { generateOrderPdf, generateReceiptPdf } from "../../_lib/pdf.js";

// ── Email builder ─────────────────────────────────────────────────────────────
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

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const { id, action } = req.query;

  // ── GET /api/orders/:id/authority ─────────────────────────────────────────
  if (action === "authority" && req.method === "GET") {
    const token = extractToken(req) || req.query?.token;
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const data = await readData();
    const order = data.orders.find(o => o.id === id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (!order.lotAuthorityFile && !order.lotAuthorityUrl) return res.status(404).json({ error: "No authority document for this order." });

    // Preferred: redirect to SharePoint URL (opens directly in browser)
    if (order.lotAuthorityUrl) {
      return res.redirect(302, order.lotAuthorityUrl);
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
    res.setHeader("Content-Disposition", `attachment; filename="${order.lotAuthorityFile}"`);
    res.setHeader("Content-Length", buf.length);
    return res.send(buf);
  }

  // ── PUT /api/orders/:id/status ────────────────────────────────────────────
  if (action === "status" && req.method === "PUT") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const { status, note } = req.body || {};
    if (!status) return res.status(400).json({ error: "status is required." });
    const VALID_STATUSES = ["Pending","Processing","Awaiting Payment","Awaiting Stripe Payment","Paid","Issued","Cancelled","Invoice to be issued","Invoice sent, awaiting payment"];
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status: "${status}".` });

    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });

    data.orders[idx].status = status;
    const auditEntry = { ts: new Date().toISOString(), action: `Status changed to ${status}` };
    if (note) auditEntry.note = note;
    data.orders[idx].auditLog = [...(data.orders[idx].auditLog || []), auditEntry];
    if (status === "Cancelled" && note) data.orders[idx].cancelReason = note;

    await writeData(data);
    return res.status(200).json({ ok: true });
  }

  // ── POST /api/orders/:id/send-certificate ─────────────────────────────────
  if (action === "send-certificate" && req.method === "POST") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const { message, attachment } = req.body || {};
    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];

    const cfg = await readConfig();
    const smtp = cfg.smtp || {};
    const fromEmail = cfg.orderEmail || "Orders@tocs.co";
    if (!smtp.host || !smtp.user || !smtp.pass) return res.status(400).json({ error: "SMTP not configured." });

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host, port: Number(smtp.port) || 2525,
        secure: Number(smtp.port) === 465,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: false },
      });
      const tpl = cfg.emailTemplate || {};
      const subj = (tpl.certificateSubject || "Your OC Certificate — Order #{orderId}").replace(/{orderId}/g, order.id);
      const mailOpts = {
        from: `"Top Owners Corporation Solution" <${fromEmail}>`,
        to: order.contactInfo.email,
        subject: subj,
        html: buildCertEmailHtml(order, message, cfg),
      };
      if (attachment?.data) {
        mailOpts.attachments = [{ filename: attachment.filename || "OC-Certificate.pdf", content: Buffer.from(attachment.data, "base64"), contentType: attachment.contentType || "application/pdf" }];
      }
      await transporter.sendMail(mailOpts);

      // Auto-save certificate to SharePoint (best-effort, non-fatal)
      if (attachment?.data) {
        try {
          const spConfig  = cfg?.sharepoint || {};
          const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);
          if (spEnabled) {
            const certUrl = await uploadToSharePoint(
              attachment.filename || "certificate.pdf",
              attachment.contentType || "application/pdf",
              attachment.data,
              spConfig,
              id   // ← per-order subfolder (order ID)
            );
            if (certUrl) {
              data.orders[idx].certificateUrl = certUrl;
              data.orders[idx].auditLog = [...(data.orders[idx].auditLog || []), { ts: new Date().toISOString(), action: "Certificate saved to SharePoint", note: certUrl }];
            }
          }
        } catch (e) { console.error("Certificate SharePoint upload failed:", e.message); }
      }

      data.orders[idx].status = "Issued";
      data.orders[idx].auditLog = [...(data.orders[idx].auditLog || []), { ts: new Date().toISOString(), action: "Certificate issued", note: `Sent to: ${order.contactInfo.email}` }];
      await writeData(data);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST /api/orders/:id/send-invoice ────────────────────────────────────
  if (action === "send-invoice" && req.method === "POST") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const { message, attachment } = req.body || {};
    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];

    const cfg = await readConfig();
    const smtp = cfg.smtp || {};
    const fromEmail = cfg.orderEmail || "Orders@tocs.co";
    if (!smtp.host || !smtp.user || !smtp.pass) return res.status(400).json({ error: "SMTP not configured." });

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host, port: Number(smtp.port) || 2525,
        secure: Number(smtp.port) === 465,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: false },
      });
      const pd = cfg.paymentDetails || {};
      const contact = order.contactInfo || {};
      const defaultMsg = `Dear ${contact.name || "Applicant"},\n\nPlease find attached your invoice for Keys/Fobs/Remotes order #${order.id}.\n\nPayment details:\nAccount Name: ${pd.accountName || ""}\nBSB: ${pd.bsb || ""}\nAccount Number: ${pd.accountNumber || ""}\nPayID: ${pd.payid || ""}\n\nPlease use your order number as the payment reference.\n\nKind regards,\nTOCS Team`;
      const bodyText = message || defaultMsg;
      const htmlBody = bodyText.replace(/\n/g, "<br>");
      const tpl = cfg.emailTemplate || {};
      const footer = (tpl.footer || "Top Owners Corporation Solution  |  info@tocs.co").replace(/\n/g, "<br>");
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
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
      const mailOpts = {
        from: `"Top Owners Corporation Solution" <${fromEmail}>`,
        to: order.contactInfo.email,
        subject: `Invoice for your Keys/Fobs/Remotes Order #${order.id}`,
        html,
      };
      if (attachment?.data) {
        mailOpts.attachments = [{ filename: attachment.filename || "Invoice.pdf", content: Buffer.from(attachment.data, "base64"), contentType: attachment.contentType || "application/pdf" }];
      }
      await transporter.sendMail(mailOpts);

      // Auto-save invoice to SharePoint (best-effort, non-fatal)
      if (attachment?.data) {
        try {
          const spConfig  = cfg?.sharepoint || {};
          const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);
          if (spEnabled) {
            const invoiceUrl = await uploadToSharePoint(
              attachment.filename || "invoice.pdf",
              attachment.contentType || "application/pdf",
              attachment.data,
              spConfig,
              id   // ← per-order subfolder (order ID)
            );
            if (invoiceUrl) {
              data.orders[idx].invoiceUrl = invoiceUrl;
              data.orders[idx].auditLog = [...(data.orders[idx].auditLog || []), { ts: new Date().toISOString(), action: "Invoice saved to SharePoint", note: invoiceUrl }];
            }
          }
        } catch (e) { console.error("Invoice SharePoint upload failed:", e.message); }
      }

      data.orders[idx].status = "Invoice sent, awaiting payment";
      data.orders[idx].auditLog = [...(data.orders[idx].auditLog || []), { ts: new Date().toISOString(), action: "Invoice sent", note: `Sent to: ${order.contactInfo.email}` }];
      await writeData(data);
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

    // Always read order from Redis first — idempotency check depends on it
    const data = await readData();
    const idx  = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];

    // Idempotency guard — prevents duplicate emails on page refresh / replay
    if (order.status === "Paid") {
      return res.status(200).json({ success: true, order });
    }

    const { stripeSessionId } = order;
    if (!stripeSessionId) {
      return res.status(400).json({ error: "No Stripe session associated with this order." });
    }

    const stripe = new Stripe(stripeKey);
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(stripeSessionId);
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

    // Update order status and audit log
    data.orders[idx].status = "Paid";
    data.orders[idx].auditLog = [...(data.orders[idx].auditLog || []), {
      ts: new Date().toISOString(),
      action: "Payment confirmed via Stripe",
      note: `Session: ${stripeSessionId}`,
    }];
    await writeData(data);

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
      const emailJobs = [
        createTransporter(smtp).sendMail({
          from: `"TOCS Order Portal" <${toEmail}>`,
          to: toEmail,
          subject: `Payment Confirmed — Order #${id} — $${(confirmedOrder.total||0).toFixed(2)} AUD`,
          html: buildOrderEmailHtml(confirmedOrder),
          attachments: authAttachment,
        }).catch(e => console.error("Admin stripe email failed:", e.message)),
      ];
      if (confirmedOrder.contactInfo?.email) {
        emailJobs.push(
          createTransporter(smtp).sendMail({
            from: `"TOCS Order Portal" <${toEmail}>`,
            to: confirmedOrder.contactInfo.email,
            subject: `Payment Confirmed — Order ${id}`,
            html: buildCustomerEmailHtml(confirmedOrder, cfg),
          }).catch(e => console.error("Customer stripe email failed:", e.message))
        );
      }
      await Promise.allSettled(emailJobs).then(results => {
        const sent = results.filter(r => r.status === "fulfilled").length;
        console.log(`Stripe-confirm emails: ${sent}/${results.length} sent for order ${id}`);
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

  // ── DELETE /api/orders/:id/delete ───────────────────────────────────────────
  // Admin only. Permanently removes an order from Redis. No undo.
  if (action === "delete" && req.method === "DELETE") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });

    data.orders.splice(idx, 1);
    await writeData(data);
    return res.status(200).json({ ok: true, deleted: id });
  }

  return res.status(404).json({ error: "Unknown action." });
}
