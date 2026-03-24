// POST /api/orders — Customer places an order (public)
import { readData, writeData, readConfig, cors, writeAuthority, KV_AVAILABLE } from "../_lib/store.js";
import { uploadToSharePoint, SHAREPOINT_ENABLED, FOLDER_PATH } from "../_lib/sharepoint.js";
import { generateOrderPdf } from "../_lib/pdf.js";
import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "../_lib/email.js";
import Stripe from "stripe";

async function sendMail(smtp, mailOpts) {
  const transporter = createTransporter(smtp);
  await transporter.sendMail(mailOpts);
}

// Wraps any promise with a hard timeout — returns null (not reject) on expiry so
// callers can use the result naturally without needing extra try/catch.
async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const body = req.body || {};
  const order = body.order || body;
  if (!order?.id) return res.status(400).json({ error: "Invalid order: 'id' is required." });
  if (!Array.isArray(order?.items) || order.items.length === 0) return res.status(400).json({ error: "Invalid order: 'items' must be a non-empty array." });
  if (!order?.payment) return res.status(400).json({ error: "Invalid order: 'payment' method is required (bank, payid, stripe)." });

  try {
    const cfg      = await readConfig();
    const stripeKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
    const smtp     = cfg.smtp || {};
    const toEmail  = cfg.orderEmail || "Orders@tocs.co";
    const spConfig = cfg?.sharepoint || {};
    const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);

    // Derive SharePoint folder structure: {buildingName}/{categoryFolder}/{orderId}
    const categoryFolder = order.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
    const buildingName   = (order.items?.[0]?.planName || "Unknown Building")
      .replace(/[\\/:*?"<>|]/g, "-").trim();
    const spSubFolder    = `${buildingName}/${categoryFolder}/${order.id}`;


    // Set filename synchronously (no network) so admin can see the doc reference immediately
    if (body.lotAuthority?.data) {
      order.lotAuthorityFile = body.lotAuthority.filename;
    }

    order.auditLog = [{ ts: new Date().toISOString(), action: "Order created", note: `Customer: ${order.contactInfo?.name || "?"}` }];

    // ── STRIPE PRE-VALIDATION (before Redis save — prevents ghost orders) ────────
    // Validate Stripe configuration BEFORE saving to Redis so a failed validation
    // does not leave an orphaned order in the database with no Stripe session.
    if (order.payment === "stripe") {
      if (!stripeKey) {
        return res.status(400).json({ error: "Stripe is not configured on this server." });
      }
      if (!order.total || order.total <= 0) {
        return res.status(400).json({ error: "Stripe cannot process a zero-value order. Please contact us." });
      }
    }

    // ── Save order to Redis immediately ──────────────────────────────────────────
    const data = await readData();
    data.orders.unshift(order);
    await writeData(data);

    // ── STRIPE CHECKOUT SESSION CREATION ────────────────────────────────────────
    // If payment is "stripe", create a Checkout Session and redirect the customer.
    // Emails are sent later by the stripe-confirm endpoint after payment is verified.
    // NOTE: This returns early — SP uploads, Redis authority save, and email blocks
    // are all skipped for Stripe orders (accepted limitation for initial implementation).
    if (order.payment === "stripe") {
      try {
        const stripe = new Stripe(stripeKey);
        const proto = req.headers["x-forwarded-proto"] || "https";
        const host  = req.headers["host"] || "occorder.vercel.app";
        const baseUrl = `${proto}://${host}`;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [{
            price_data: {
              currency: "aud",
              product_data: { name: "OC Certificate Order", description: `Order ${order.id} — ${order.items?.length || 0} item(s)` },
              unit_amount: Math.round(order.total * 100), // cents
            },
            quantity: 1,
          }],
          mode: "payment",
          success_url: `${baseUrl}/complete?orderId=${order.id}&stripeOk=1`,
          cancel_url:  `${baseUrl}/?cancelled=1`,
          metadata: { orderId: order.id },
        });
        // Persist the session ID so stripe-confirm can verify it server-side
        order.stripeSessionId = session.id;
        const oi = data.orders.find(o => o.id === order.id);
        if (oi) {
          oi.stripeSessionId = session.id;
          oi.auditLog.push({ ts: new Date().toISOString(), action: "Stripe Checkout Session created", note: session.id });
        }
        await writeData(data);

        // Save authority doc to Redis for Stripe orders (same fallback as non-Stripe)
        // Ensures admin can download the doc once payment is confirmed.
        if (body.lotAuthority?.data && KV_AVAILABLE) {
          try {
            await writeAuthority(order.id, {
              data: body.lotAuthority.data,
              filename: body.lotAuthority.filename,
              contentType: body.lotAuthority.contentType,
            });
            if (oi) oi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc saved to Redis", note: "" });
            await writeData(data);
          } catch (e) {
            console.error("Stripe: Authority KV save failed:", e.message);
          }
        }

        // Return redirect — browser will navigate to Stripe's hosted checkout page
        return res.status(200).json({ id: order.id, redirect: session.url });
      } catch (stripeErr) {
        console.error("Stripe session creation failed:", stripeErr.message);
        return res.status(500).json({ error: "Could not create payment session. Please try again." });
      }
    }
    // ── END STRIPE CHECKOUT ────────────────────────────────────────────────────

    // ── START SP uploads immediately at T=0 (parallel to emails) ────────────
    // Graph API from Vercel takes ~8–9 s. Starting NOW gives it the full window.
    // If started after emails (~7 s), only 3 s remain → always times out.
    // Authority doc is also saved to Redis below as a guaranteed fallback.
    let spPromise = Promise.resolve();
    if (spEnabled) {
      spPromise = (async () => {
        try {
          const spFilename = `authority-${body.lotAuthority?.filename || "doc"}`;
          // Capture upload errors so audit log entries contain the actual reason
          let authErr = null, pdfErr = null;
          // Run both uploads in parallel — each takes ~8–9 s independently
          const [authResult, pdfResult] = await Promise.allSettled([
            body.lotAuthority?.data
              ? uploadToSharePoint(spFilename, body.lotAuthority.contentType, body.lotAuthority.data, spConfig, spSubFolder)
                  .catch(e => { authErr = e; console.error("SP authority upload:", e.message); return null; })
              : Promise.resolve(null),
            (async () => {
              try {
                const pdfBuffer = await generateOrderPdf(order);
                const pdfBase64 = pdfBuffer.toString("base64");
                return await uploadToSharePoint("order-summary.pdf", "application/pdf", pdfBase64, spConfig, spSubFolder)
                  .catch(e => { pdfErr = e; console.error("SP PDF upload:", e.message); return null; });
              } catch (e) { pdfErr = e; console.error("SP PDF gen/upload:", e.message); return null; }
            })(),
          ]);
          const spUrl     = authResult.status === "fulfilled" ? authResult.value : null;
          const summaryUrl = pdfResult.status  === "fulfilled" ? pdfResult.value  : null;
          const oi = data.orders.find(o => o.id === order.id);
          if (spUrl) {
            order.lotAuthorityUrl = spUrl;
            if (oi) { oi.lotAuthorityUrl = spUrl; oi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc saved to SharePoint", note: spUrl }); }
          }
          if (summaryUrl) {
            order.summaryUrl = summaryUrl;
            if (oi) { oi.summaryUrl = summaryUrl; oi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary saved to SharePoint", note: summaryUrl }); }
          }
          if (!spUrl && body.lotAuthority?.data) {
            const note = authErr?.message ? authErr.message.substring(0, 120) : "See Vercel logs";
            if (oi) oi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc SP upload failed", note });
          }
          if (!summaryUrl) {
            const note = pdfErr?.message ? pdfErr.message.substring(0, 120) : "See Vercel logs";
            if (oi) oi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary SP upload failed", note });
          }
          // Always persist final state (SP URLs if succeeded, failure audit entries if not)
          await writeData(data).catch(e => console.error("SP result persist failed:", e.message));
          console.log(`SP uploads done for order ${order.id}: auth=${!!spUrl} pdf=${!!summaryUrl}`);
        } catch (e) {
          console.error("SP upload block failed:", e.message);
        }
      })();
    }

    // ── Save authority doc to Redis (fast guaranteed fallback) ────────────────
    if (body.lotAuthority?.data && KV_AVAILABLE) {
      try {
        await writeAuthority(order.id, {
          data: body.lotAuthority.data,
          filename: body.lotAuthority.filename,
          contentType: body.lotAuthority.contentType,
        });
        const oi = data.orders.find(o => o.id === order.id);
        if (oi) oi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc saved to Redis", note: "" });
        await writeData(data);
        console.log(`Authority doc saved to Redis for order ${order.id}`);
      } catch (e) {
        console.error("Authority KV save failed:", e.message);
      }
    }

    // ── Send emails SYNCHRONOUSLY (before response — guaranteed delivery) ───────
    // SMTP2GO on port 2525 takes ~6.6 s per send (parallel). SP uploads are
    // already running above in parallel, so emails don't eat into SP time.
    if (smtp.host && smtp.user && smtp.pass) {
      console.log(`Sending emails for order ${order.id}...`);
      const orderType = { oc: "OC Certificate", keys: "Keys / Fobs" }[order.orderCategory] || "Order";
      const lotNumber = order.items?.[0]?.lotNumber || "";
      const buildingName = order.items?.[0]?.planName || "";
      const adminSubject = (cfg.emailTemplate?.adminNotificationSubject || "New Order — {orderType} — {buildingName} — Lot {lotNumber}")
        .replace("{orderType}", orderType)
        .replace("{lotNumber}", lotNumber)
        .replace("{buildingName}", buildingName);
      const emailJobs = [
        sendMail(smtp, {
          from: `"TOCS Order Portal" <${toEmail}>`,
          to: toEmail,
          subject: adminSubject,
          html: buildOrderEmailHtml(order, cfg),
          attachments: body.lotAuthority?.data ? [{
            filename: body.lotAuthority.filename,
            content: body.lotAuthority.data,
            encoding: "base64",
            contentType: body.lotAuthority.contentType || "application/octet-stream",
          }] : [],
        }).catch(e => console.error("Admin email failed:", e.message)),
      ];
      if (order.contactInfo?.email) {
        emailJobs.push(
          sendMail(smtp, {
            from: `"TOCS Order Portal" <${toEmail}>`,
            to: order.contactInfo.email,
            subject: `Order Confirmed — ${order.id}`,
            html: buildCustomerEmailHtml(order, cfg),
          }).catch(e => console.error("Customer email failed:", e.message))
        );
      }
      await Promise.allSettled(emailJobs).then(async results => {
        const sent = results.filter(r => r.status === "fulfilled").length;
        console.log(`Emails: ${sent}/${results.length} sent for order ${order.id}`);
        // Log any email failures to the audit log so admins can see them
        const labels = ["Admin notification", "Customer confirmation"];
        const failures = results
          .map((r, i) => r.status === "rejected" ? `${labels[i] || "Email"} failed: ${r.reason?.message || "unknown"}` : null)
          .filter(Boolean);
        if (failures.length > 0) {
          try {
            const fresh = await readData();
            const oi = fresh.orders.find(o => o.id === order.id);
            if (oi) {
              oi.auditLog = oi.auditLog || [];
              failures.forEach(msg => oi.auditLog.push({ ts: new Date().toISOString(), action: "Email notification failed", note: msg }));
              await writeData(fresh);
            }
          } catch (e) { console.error("Email audit log persist failed:", e.message); }
        }
      });
    }

    // ── RESPOND ───────────────────────────────────────────────────────────────
    res.status(200).json({ ok: true, order, emailSentTo: toEmail });

    // Allow SP uploads to finish if still in-flight (~1–2 s remaining after ~7 s emails)
    await spPromise;

  } catch (err) {
    console.error("Order creation failed:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Order could not be saved. Please try again." });
    }
  }
}
