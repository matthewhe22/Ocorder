// POST /api/orders — Customer places an order (public)
// GET  /api/orders?action=poll-piq — Cron: check PIQ ledgers for pending keys orders
import { readData, writeData, readConfig, cors, writeAuthority, writePiqPollStatus, readPiqPollStatus, KV_AVAILABLE } from "../_lib/store.js";
import { randomBytes } from "crypto";
import { uploadToSharePoint, SHAREPOINT_ENABLED, FOLDER_PATH } from "../_lib/sharepoint.js";
import { generateOrderPdf } from "../_lib/pdf.js";
import { buildOrderEmailHtml, buildCustomerEmailHtml, buildPiqPaymentEmailHtml, createTransporter } from "../_lib/email.js";
import { detectPiqPayment } from "../_lib/piq.js";
import Stripe from "stripe";

// Cold-start assertion: log loudly if CRON_SECRET is missing. Without it, the
// Vercel cron at 02:30 UTC is rejected with 401 inside the handler below and
// payments stop syncing automatically. Surfacing this at module load means a
// single deploy log line is enough to catch the misconfiguration — the user
// no longer has to wait for a missed run to notice.
if (!process.env.CRON_SECRET) {
  console.error("[startup][CRITICAL] CRON_SECRET is not set. The poll-piq cron will be rejected with 401 until CRON_SECRET is configured in Vercel → Settings → Environment Variables. Manual admin 'Check PIQ' will continue to work.");
} else {
  console.log("[startup] CRON_SECRET is configured; poll-piq cron auth is wired up.");
}

async function sendMail(smtp, mailOpts) {
  const transporter = createTransporter(smtp);
  await transporter.sendMail(mailOpts);
}

// ── Helper: apply a PIQ payment result to an order and persist ────────────────
async function applyPiqPayment(order, result, cfg, data) {
  const now = new Date().toISOString();
  order.piqLastPolled      = now;
  order.piqLevyFound       = result.levyFound;
  order.piqLevyTotalDue    = result.totalDue    ?? order.piqLevyTotalDue    ?? null;
  order.piqLevyTotalNett   = result.totalNett   ?? (result.paid ? 0 : null);
  if (result.paid) {
    // Use server time as payment date on first confirmation only — never overwrite.
    if (!order.piqPaymentDate) order.piqPaymentDate = now;
    order.piqPaymentReference = result.paymentReference || null;
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
        console.log(`PIQ payment notification sent for order ${order.id}`);
      }
    } catch (emailErr) {
      console.error(`PIQ payment email failed for ${order.id}:`, emailErr.message);
      order.auditLog.push({ ts: now, action: "PIQ payment email failed", note: emailErr.message?.substring(0, 120) });
    }
  }
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET /api/orders?action=poll-piq  (called by Vercel cron daily at 02:30 UTC) ─
  // Also accepts admin Bearer token for manual triggers.
  // Scans all keys orders awaiting payment and polls their PIQ lot ledgers.
  if (req.method === "GET" && req.query?.action === "poll-piq") {
    // Allow either: a valid CRON_SECRET (Vercel cron / scheduled trigger)
    // or an admin Bearer token (manual trigger via admin UI). When CRON_SECRET
    // is unset we MUST deny rather than allow — silently allowing cron
    // requests without a secret would let any unauthenticated caller drive
    // the PIQ poll loop and potentially flip order statuses.
    //
    // Cron secret may arrive as either:
    //   - x-cron-secret: <secret>            (custom header from external schedulers)
    //   - authorization: Bearer <secret>     (Vercel cron's native format)
    // Both are checked with crypto.timingSafeEqual against CRON_SECRET.
    const cronSecret = process.env.CRON_SECRET;
    const reqSecret  = req.headers["x-cron-secret"];
    const token      = req.headers["authorization"]?.replace("Bearer ", "");
    const { validToken } = await import("../_lib/store.js");
    const { timingSafeEqual, createHash } = await import("crypto");
    const tsHashEqual = (a, b) => {
      const ah = createHash("sha256").update(String(a == null ? "" : a)).digest();
      const bh = createHash("sha256").update(String(b == null ? "" : b)).digest();
      return timingSafeEqual(ah, bh);
    };
    const isAdmin = await validToken(token);
    const cronViaHeader = !!(cronSecret && reqSecret && tsHashEqual(reqSecret, cronSecret));
    const cronViaBearer = !!(cronSecret && token && tsHashEqual(token, cronSecret));
    const isCron = cronViaHeader || cronViaBearer;
    if (!isAdmin && !isCron) {
      if (!cronSecret) {
        console.error("[CRITICAL] CRON_SECRET not set — refusing cron request. Set CRON_SECRET in the deployment environment.");
        // Record the rejection so admins can see it via poll-piq-status without
        // grepping Vercel logs. Best-effort — don't fail the response on KV error.
        await writePiqPollStatus({
          ok:        false,
          trigger:   "cron",
          error:     "CRON_SECRET not configured — cron request rejected with 401.",
        }).catch(() => {});
      }
      return res.status(401).json({ error: "Not authenticated." });
    }

    const trigger = isCron ? "cron" : "manual";
    try {
      const cfg  = await readConfig();
      const data = await readData();

      // Find all keys/invoice orders not yet resolved.
      // "Issued" is intentionally NOT excluded — if keys were dispatched before payment was confirmed
      // in the system, the payment must still be detected and recorded for proper reconciliation.
      // piqLotId is NOT required here — auto-link runs below for orders that are missing it.
      const candidates = data.orders.filter(o =>
        o.orderCategory === "keys" &&
        o.payment === "invoice" &&
        !["Paid", "Cancelled"].includes(o.status)
      );

      // Normalise lot-number strings for matching (strips common prefixes like "Lot ", "Unit ", etc.)
      const normLotStr = s => String(s || "").trim().toLowerCase()
        .replace(/^(lot|unit|apt|apartment|villa|shop|suite|level|block|stage|tower)\s+/i, "").trim();

      let checked = 0, confirmed = 0, linked = 0;
      const errors = [];

      for (const order of candidates) {
        // Auto-link piqLotId from plan data for orders created before PIQ was synced.
        // Uses only local data — no extra API call needed.
        if (!order.piqLotId) {
          const lotNumber = order.items?.[0]?.lotNumber || "";
          const lotId     = order.items?.[0]?.lotId     || "";
          const planId    = order.items?.[0]?.planId    || "";
          const plan      = data.strataPlans?.find(p => p.id === planId);
          const lots      = plan?.lots || [];
          const matches   = l =>
            (lotNumber && normLotStr(l.number) === normLotStr(lotNumber)) ||
            (lotId     && l.id === lotId);
          const lot = lots.find(l => l.piqLotId && matches(l)) ?? lots.find(matches);
          if (lot?.piqLotId) {
            order.piqLotId = lot.piqLotId;
            order.auditLog = [...(order.auditLog || []), {
              ts:     new Date().toISOString(),
              action: "PIQ lot linked",
              note:   `piqLotId ${lot.piqLotId} auto-linked by poll-piq cron`,
            }];
            linked++;
          }
        }

        if (!order.piqLotId) continue; // plan not yet synced from PIQ — skip

        try {
          const result = await detectPiqPayment(cfg, order.piqLotId, order.id);
          await applyPiqPayment(order, result, cfg, data);
          checked++;
          if (result.paid) confirmed++;
        } catch (err) {
          console.error(`poll-piq: failed for order ${order.id}:`, err.message);
          errors.push({ orderId: order.id, error: err.message?.substring(0, 120) });
          // Still update lastPolled even on error
          order.piqLastPolled = new Date().toISOString();
        }
      }

      // Write back if: a payment was confirmed OR new lot IDs were auto-linked.
      // We still avoid writing on pure "no payment found" runs to prevent a race
      // with send-invoice: the cron could read a stale snapshot and then overwrite
      // a concurrent status update made by send-invoice.
      if (confirmed > 0 || linked > 0) {
        await writeData(data).catch(err => {
          console.error("poll-piq: writeData failed:", err.message);
        });
      }

      // Record this run so the admin UI can show "last auto-poll" status.
      await writePiqPollStatus({
        ok:        true,
        trigger,
        checked,
        confirmed,
        linked,
        errorCount: errors.length,
      }).catch(e => console.error("poll-piq: writePiqPollStatus failed:", e.message));

      return res.status(200).json({ ok: true, checked, confirmed, linked: linked || undefined, errors: errors.length ? errors : undefined });
    } catch (err) {
      console.error("poll-piq error:", err.message);
      await writePiqPollStatus({
        ok:      false,
        trigger,
        error:   err.message?.substring(0, 240) || "unknown error",
      }).catch(() => {});
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET /api/orders?action=poll-piq-status (admin only) ──────────────────────
  // Returns the most recent poll-piq run summary plus whether CRON_SECRET is
  // configured in this deployment. Used by the admin Orders panel so a missed
  // or broken cron is visible without scraping Vercel logs.
  if (req.method === "GET" && req.query?.action === "poll-piq-status") {
    const token = req.headers["authorization"]?.replace("Bearer ", "");
    const { validToken } = await import("../_lib/store.js");
    if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

    // KV value shape: { lastCron?: {...}, lastManual?: {...} }. Returned as
    // distinct fields so the UI can judge auto-poll freshness against the cron
    // slot only — a recent manual run must NOT mask a broken Vercel cron.
    const status = await readPiqPollStatus().catch(() => null);
    return res.status(200).json({
      cronSecretConfigured: !!process.env.CRON_SECRET,
      schedule:             "30 2 * * * (UTC)",
      lastCronRun:          status?.lastCron   || null,
      lastManualRun:        status?.lastManual || null,
    });
  }

  // ── GET /api/orders?action=refresh-piq-payments  (admin only) ────────────────
  // Re-polls all already-paid PIQ orders and updates piqPaymentDate/piqPaymentReference
  // without re-sending emails. Used to correct dates stored before the piq.js bug fix.
  if (req.method === "GET" && req.query?.action === "refresh-piq-payments") {
    const token   = req.headers["authorization"]?.replace("Bearer ", "");
    const { validToken } = await import("../_lib/store.js");
    if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

    try {
      const cfg  = await readConfig();
      const data = await readData();

      const candidates = data.orders.filter(o =>
        o.orderCategory === "keys" && o.piqLotId && o.status === "Paid"
      );

      let refreshed = 0;
      const errors  = [];

      for (const order of candidates) {
        try {
          const result = await detectPiqPayment(cfg, order.piqLotId, order.id);
          if (result.paid) {
            if (!order.piqPaymentDate) order.piqPaymentDate = new Date().toISOString();
            if (result.paymentReference) order.piqPaymentReference = result.paymentReference;
            refreshed++;
          }
        } catch (err) {
          console.error(`refresh-piq-payments: failed for ${order.id}:`, err.message);
          errors.push({ orderId: order.id, error: err.message?.substring(0, 120) });
        }
      }

      if (refreshed > 0) await writeData(data);
      return res.status(200).json({ ok: true, refreshed, total: candidates.length, errors: errors.length ? errors : undefined });
    } catch (err) {
      console.error("refresh-piq-payments error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const body = req.body || {};
  const order = body.order || body;
  if (!Array.isArray(order?.items) || order.items.length === 0) return res.status(400).json({ error: "Invalid order: 'items' must be a non-empty array." });
  if (!order?.payment) return res.status(400).json({ error: "Invalid order: 'payment' method is required (bank, payid, stripe)." });

  try {
    const cfg      = await readConfig();
    const stripeKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
    const smtp     = cfg.smtp || {};
    const toEmail  = cfg.orderEmail || "Orders@tocs.co";
    const spConfig = cfg?.sharepoint || {};
    const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);

    // CRIT-1: Generate order ID server-side. The suffix uses 8 cryptographically
    // random bytes (~48 bits of entropy in the encoded form) — 65k× harder to
    // guess than the previous 3-char Math.random suffix and resistant to
    // /track endpoint enumeration.
    const serverId = "TOCS-" + Date.now().toString(36).toUpperCase()
      + "-" + randomBytes(8).toString("base64url").replace(/[-_]/g, "").slice(0, 10).toUpperCase();
    order.id = serverId;

    // CRIT-2: Validate payment method and order category
    if (!["bank", "payid", "stripe", "invoice"].includes(order.payment)) return res.status(400).json({ error: "Invalid payment method." });
    if (!["oc", "keys"].includes(order.orderCategory)) return res.status(400).json({ error: "Invalid orderCategory — must be 'oc' or 'keys'." });

    // CRIT-2: Sanitise total
    order.total = Math.max(0, Number(order.total) || 0);

    // CRIT-2: Validate and whitelist contactInfo fields
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!order.contactInfo?.email) {
      return res.status(400).json({ error: "Contact email is required." });
    }
    if (!EMAIL_RE.test(order.contactInfo.email)) {
      return res.status(400).json({ error: "Contact email is invalid." });
    }
    if (order.contactInfo.applicantType && !["agent", "owner"].includes(order.contactInfo.applicantType)) {
      return res.status(400).json({ error: "applicantType must be 'agent' or 'owner'." });
    }
    // Whitelist contactInfo to prevent arbitrary fields entering the database
    const ci = order.contactInfo;
    order.contactInfo = {
      name:         String(ci.name         || "").slice(0, 200),
      email:        String(ci.email        || "").slice(0, 200),
      phone:        String(ci.phone        || "").slice(0, 50),
      companyName:  String(ci.companyName  || "").slice(0, 200),
      ownerName:    String(ci.ownerName    || "").slice(0, 200),
      applicantType: ci.applicantType || "",
      ocReference:  String(ci.ocReference  || "").slice(0, 100),
      ...(ci.shippingAddress && typeof ci.shippingAddress === "object" ? {
        shippingAddress: {
          street:   String(ci.shippingAddress.street   || "").slice(0, 200),
          suburb:   String(ci.shippingAddress.suburb   || "").slice(0, 100),
          state:    String(ci.shippingAddress.state    || "").slice(0, 50),
          postcode: String(ci.shippingAddress.postcode || "").slice(0, 10),
        },
      } : {}),
    };

    // CRIT-2: Set status server-side
    if (order.payment === "stripe") {
      order.status = "Awaiting Stripe Payment";
    } else if (order.payment === "invoice") {
      order.status = "Invoice to be issued";
    } else {
      order.status = "Pending Payment";
    }

    // Auto-populate piqLotId for keys orders (enables PIQ payment polling)
    // Look up the lot in the plan's lots array by lot number and copy its piqLotId.
    if (order.orderCategory === "keys" && order.payment === "invoice") {
      try {
        const planData  = await readData();
        const lotNumber = order.items?.[0]?.lotNumber || "";
        const planId    = order.items?.[0]?.planId    || "";
        const plan      = planData.strataPlans?.find(p => p.id === planId);
        const lot       = plan?.lots?.find(l =>
          l.number?.toLowerCase() === lotNumber.toLowerCase() ||
          l.piqLotId != null && String(l.piqLotId) === String(order.items?.[0]?.lotId)
        );
        if (lot?.piqLotId) {
          order.piqLotId = lot.piqLotId;
          console.log(`[orders] piqLotId ${lot.piqLotId} auto-set for keys order`);
        }
      } catch (e) {
        console.warn("[orders] piqLotId lookup failed:", e.message);
      }
    }

    // MED-11: Validate items fields
    if (!order.items.every(item => item.productName && typeof item.price === "number")) {
      return res.status(400).json({ error: "Invalid order items: each item must have productName and price." });
    }

    // Derive SharePoint folder structure: {buildingName}/{categoryFolder}/{orderId}
    const categoryFolder = order.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
    const buildingName   = (order.items?.[0]?.planName || "Unknown Building")
      .replace(/[\\/:*?"<>|]/g, "-").trim();
    const spSubFolder    = `${buildingName}/${categoryFolder}/${order.id}`;

    // CRIT-7: Validate authority document on server
    if (body.lotAuthority?.data) {
      const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
      if (!ALLOWED_TYPES.includes(body.lotAuthority.contentType)) {
        return res.status(400).json({ error: "Authority document must be PDF, JPG, or PNG." });
      }
      // base64 byte size = (chars * 3/4)
      const byteSize = Math.ceil((body.lotAuthority.data.length * 3) / 4);
      if (byteSize > 10 * 1024 * 1024) {
        return res.status(400).json({ error: "Authority document must be under 10 MB." });
      }
    }

    // Set filename synchronously — sanitise client-supplied name to prevent path traversal
    // and HTTP header injection via Content-Disposition.
    if (body.lotAuthority?.data) {
      const rawName = String(body.lotAuthority.filename || "document");
      const ext = rawName.includes(".") ? rawName.split(".").pop().replace(/[^\w]/g, "").slice(0, 5) : "bin";
      order.lotAuthorityFile = `${order.id}-lot-authority.${ext}`;
    }

    order.date = new Date().toISOString();
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
    // CRIT-1: Check for ID collision before saving
    if (data.orders.find(o => o.id === order.id)) {
      return res.status(409).json({ error: "Order ID collision. Please try again." });
    }
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
          success_url: `${baseUrl}/complete?orderId=${serverId}&stripeOk=1`,
          cancel_url:  `${baseUrl}/?cancelled=1&orderId=${serverId}`,
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
          // Fresh read before writing SP results to avoid stale-data overwrites
          const freshData = await readData().catch(() => data);
          const freshOi = freshData.orders.find(o => o.id === order.id);
          if (freshOi) {
            if (spUrl) { freshOi.lotAuthorityUrl = spUrl; freshOi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc saved to SharePoint", note: spUrl }); }
            if (summaryUrl) { freshOi.summaryUrl = summaryUrl; freshOi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary saved to SharePoint", note: summaryUrl }); }
            if (!spUrl && body.lotAuthority?.data) { const note = authErr?.message ? authErr.message.substring(0, 120) : "See Vercel logs"; freshOi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc SP upload failed", note }); }
            if (!summaryUrl) { const note = pdfErr?.message ? pdfErr.message.substring(0, 120) : "See Vercel logs"; freshOi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary SP upload failed", note }); }
          }
          await writeData(freshData).catch(e => console.error("SP result persist failed:", e.message));
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
      const buildingNameEmail = order.items?.[0]?.planName || "";
      const adminSubject = (cfg.emailTemplate?.adminNotificationSubject || "New Order — {orderType} #{orderId} — {total}")
        .replace("{orderType}", orderType)
        .replace("{orderId}", order.id || "")
        .replace("{total}", order.total != null ? `$${order.total.toFixed(2)}` : "")
        .replace("{lotNumber}", lotNumber)
        .replace("{buildingName}", buildingNameEmail)
        .replace("{address}", buildingNameEmail);
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
