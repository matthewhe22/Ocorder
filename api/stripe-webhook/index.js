// api/stripe-webhook/index.js
// Handles Stripe webhook events — specifically checkout.session.completed.
// No admin auth required: security is provided by Stripe signature verification.
//
// Vercel serverless functions parse the body as JSON by default.
// Stripe signature verification requires the raw (unparsed) body,
// so we disable the built-in body parser and read the stream manually.

import Stripe from "stripe";
import { readData, writeData, readConfig, readAuthority, cors, withOrderLock, tryClaimStripeEvent } from "../_lib/store.js";
import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "../_lib/email.js";
import { isSharePointEnabled, uploadOrderDocs, pushAuditOnce } from "../_lib/sharepoint.js";
import { generateOrderPdf, generateReceiptPdf } from "../_lib/pdf.js";

// Disable Vercel's default body parser so we can read the raw body for
// Stripe signature verification.
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const cfg = await readConfig();
  const stripeKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
  const stripeInUse = !!stripeKey;

  // Refuse to process any webhook without the signing secret. We escalate the
  // log level when Stripe IS configured (live payments) but the webhook secret
  // is missing — that's a deploy-time misconfiguration that must be fixed,
  // not a routine "Stripe disabled" no-op. Using 503 (vs 403) so monitoring
  // and Stripe's own retry/back-off treat this as a server fault.
  if (!webhookSecret) {
    if (stripeInUse) {
      console.error("[CRITICAL] STRIPE_WEBHOOK_SECRET missing while Stripe is configured — payment confirmations cannot be verified. Set STRIPE_WEBHOOK_SECRET in the deployment environment.");
    } else {
      console.error("STRIPE_WEBHOOK_SECRET is not set — rejecting webhook.");
    }
    return res.status(503).json({ error: "Webhook secret not configured.", code: "WEBHOOK_SECRET_MISSING" });
  }

  // Read raw body for Stripe signature verification
  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  if (!stripeInUse) {
    console.error("Stripe secret key is not configured — cannot initialise Stripe.");
    return res.status(200).json({ received: true, skipped: true });
  }

  const stripe = new Stripe(stripeKey);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    // Log full reason server-side; respond with a generic message so the raw
    // Stripe error (which may include internal payload details) isn't echoed
    // back to whoever sent the request.
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).json({ error: "Webhook signature verification failed." });
  }

  // Idempotency by Stripe event.id. Stripe retries on non-2xx and can also
  // deliver the same event twice during failover; tryClaimStripeEvent uses
  // SET NX EX to atomically check-and-set, so only the first invocation
  // proceeds. Replays return 200 immediately so Stripe stops retrying.
  if (!(await tryClaimStripeEvent(event.id))) {
    console.log(`Stripe webhook: event ${event.id} already processed — skipping.`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // Handle checkout.session.expired — customer abandoned or session timed out
  if (event.type === "checkout.session.expired") {
    const expiredSession = event.data.object;
    const expiredOrderId = expiredSession.metadata?.orderId;
    if (expiredOrderId) {
      try {
        await withOrderLock(expiredOrderId, async () => {
          const data = await readData();
          const idx = data.orders.findIndex(o => o.id === expiredOrderId);
          if (idx !== -1 && data.orders[idx].status !== "Paid" && expiredSession.payment_status !== "paid") {
            data.orders[idx].status = "Cancelled";
            data.orders[idx].auditLog = [
              ...(data.orders[idx].auditLog || []),
              { ts: new Date().toISOString(), action: "Order cancelled — Stripe checkout session expired" },
            ];
            await writeData(data);
            console.log(`Stripe webhook: cancelled expired pending order ${expiredOrderId}`);
          }
        });
      } catch (e) {
        console.error(`Stripe webhook expired-handler failed for ${expiredOrderId}:`, e.message);
      }
    }
    return res.status(200).json({ received: true });
  }

  // Only handle checkout.session.completed beyond this point
  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true, ignored: true });
  }

  const session = event.data.object;
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.warn("checkout.session.completed event missing metadata.orderId — ignoring.");
    return res.status(200).json({ received: true, ignored: true });
  }

  // Re-read inside the lock so we observe the latest committed state.
  let lockResult;
  try {
    lockResult = await withOrderLock(orderId, async () => {
      const data = await readData();
      const idx = data.orders.findIndex(o => o.id === orderId);
      if (idx === -1) {
        console.warn(`Stripe webhook: order ${orderId} not found in Redis — ignoring.`);
        return { missing: true };
      }
      const order = data.orders[idx];
      if (order.status === "Paid") {
        console.log(`Stripe webhook: order ${orderId} already Paid — skipping.`);
        return { alreadyPaid: true, order };
      }
      data.orders[idx].status = "Paid";
      data.orders[idx].auditLog = [
        ...(data.orders[idx].auditLog || []),
        {
          ts: new Date().toISOString(),
          action: "Payment confirmed via Stripe webhook",
          note: `Session: ${session.id}`,
        },
      ];
      await writeData(data);
      return { transitioned: true, order: data.orders[idx] };
    });
  } catch (e) {
    console.error(`Stripe webhook: lock/write failed for ${orderId}:`, e.message);
    return res.status(503).json({ error: "Could not process order — please retry." });
  }
  if (lockResult.missing) {
    return res.status(200).json({ received: true, ignored: true });
  }
  // Opportunistic-SP path: when the order is already Paid (either because the
  // browser-side stripe-confirm beat us, or this webhook is a Stripe retry),
  // we normally just acknowledge and exit. But if the SP folder was never
  // populated (earlier run failed mid-flight), fall through and run only the
  // SP block — NOT the email block, which already fired on the original
  // transition. Skipping the email block here is what prevents duplicate
  // "Payment Confirmed" emails to the customer.
  const isFreshPayment = !lockResult.alreadyPaid;
  if (lockResult.alreadyPaid) {
    const ap = lockResult.order;
    const needAnySp = !ap.summaryUrl || (ap.payment === "stripe" && ap.status === "Paid" && !ap.receiptUrl);
    if (!needAnySp) {
      return res.status(200).json({ received: true, alreadyPaid: true });
    }
    console.log(`Webhook: order ${orderId} already Paid but SP folder missing — running opportunistic SP upload.`);
  }
  const confirmedOrder = lockResult.order;

  // ── START SP uploads in parallel with emails ───────────────────────────────
  // Previously this block was missing from the webhook path — when Stripe's
  // server-to-server webhook fired before the customer's browser hit the
  // success page, stripe-confirm would short-circuit on status="Paid" and SP
  // uploads were silently skipped. Without this block, orders TOCS-MOJI6FCL-YLC
  // and TOCS-MOI215N8-GR4 ended up with no SharePoint folder at all.
  const spConfig = cfg?.sharepoint || {};
  const spEnabled = isSharePointEnabled(spConfig);
  const authDoc = await readAuthority(orderId).catch(() => null);
  let spPromise = Promise.resolve();
  if (spEnabled) {
    spPromise = (async () => {
      try {
        // Re-read the order for the PDF snapshot. The status-flip lock was
        // released before this IIFE started; if an admin amended the order in
        // between, the snapshot inside `confirmedOrder` is stale and the
        // generated PDF would not match what's stored in Redis. Distinguish
        // "Redis read failed" (fall back to stale snapshot — better than
        // dropping the upload) from "order deleted or no longer Paid" (bail).
        let snapshot;
        try {
          const fresh = await readData();
          const found = fresh.orders.find(o => o.id === orderId);
          if (!found) {
            console.log(`Webhook SP IIFE: order ${orderId} no longer exists — skipping SP upload.`);
            return;
          }
          if (found.status !== "Paid") {
            console.log(`Webhook SP IIFE: order ${orderId} status flipped to "${found.status}" — skipping SP upload.`);
            return;
          }
          snapshot = found;
        } catch (e) {
          console.error(`Webhook SP IIFE: Redis read failed (${e.message}) — proceeding with stale snapshot.`);
          snapshot = confirmedOrder;
        }
        const { authUrl, summaryUrl, receiptUrl, errors } = await uploadOrderDocs(
          snapshot,
          spConfig,
          { generateOrderPdf, generateReceiptPdf },
          { authDoc, includeReceipt: true, stripeSessionId: session.id },
        );
        // Wrap the audit-log write in the order lock so concurrent updates
        // (amend / status / piq / send-cert) can't clobber the URLs / entries.
        await withOrderLock(orderId, async () => {
          const fresh = await readData();
          const oi = fresh.orders.find(o => o.id === orderId);
          if (!oi) return;
          oi.auditLog = oi.auditLog || [];
          const ts = () => new Date().toISOString();
          // Successes always append. Failures use pushAuditOnce so a webhook
          // retry storm against a persistently-broken SharePoint doesn't
          // flood the audit log with duplicate "SP upload failed" rows.
          if (authUrl)            { oi.lotAuthorityUrl = authUrl; oi.auditLog.push({ ts: ts(), action: "Authority doc saved to SharePoint", note: authUrl }); }
          else if (authDoc?.data) { pushAuditOnce(oi.auditLog, "Authority doc SP upload failed", errors.auth?.message?.slice(0, 60) || "See Vercel logs"); }
          if (summaryUrl) { oi.summaryUrl = summaryUrl; oi.auditLog.push({ ts: ts(), action: "Order summary saved to SharePoint", note: summaryUrl }); }
          else            { pushAuditOnce(oi.auditLog, "Order summary SP upload failed", errors.summary?.message?.slice(0, 60) || "See Vercel logs"); }
          if (receiptUrl) { oi.receiptUrl = receiptUrl; oi.auditLog.push({ ts: ts(), action: "Payment receipt saved to SharePoint", note: receiptUrl }); }
          else            { pushAuditOnce(oi.auditLog, "Payment receipt SP upload failed", errors.receipt?.message?.slice(0, 60) || "See Vercel logs"); }
          await writeData(fresh);
        }).catch(e => console.error("Webhook SP persist failed:", e.message));
        console.log(`Webhook SP uploads done for ${orderId}: auth=${!!authUrl} summary=${!!summaryUrl} receipt=${!!receiptUrl}`);
      } catch (e) {
        console.error("Webhook SP upload block failed:", e.message);
      }
    })();
  }

  // Send admin + customer emails (mirrors stripe-confirm handler).
  // Skipped on the opportunistic-SP retry path so customers don't get
  // duplicate "Payment Confirmed" emails from a webhook retry.
  const smtp = cfg.smtp || {};
  const toEmail = cfg.orderEmail || "Orders@tocs.co";

  if (isFreshPayment && smtp.host && smtp.user && smtp.pass) {
    const transporter = createTransporter(smtp);
    const from = `"TOCS Order Portal" <${toEmail}>`;

    // Build configurable admin subject (same token-replacement as orders/index.js)
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
        from,
        to: toEmail,
        subject: adminSubject,
        html: buildOrderEmailHtml(confirmedOrder, cfg),
      }).catch(e => console.error("Webhook admin email failed:", e.message)),
    ];

    if (confirmedOrder.contactInfo?.email) {
      emailJobs.push(
        transporter.sendMail({
          from,
          to: confirmedOrder.contactInfo.email,
          subject: `Payment Confirmed — Order ${orderId}`,
          html: buildCustomerEmailHtml(confirmedOrder, cfg),
        }).catch(e => console.error("Webhook customer email failed:", e.message))
      );
    }

    await Promise.allSettled(emailJobs).then(results => {
      const sent = results.filter(r => r.status === "fulfilled").length;
      console.log(`Stripe webhook emails: ${sent}/${results.length} sent for order ${orderId}`);
    });
  }

  // Await SP uploads BEFORE responding 200 — Vercel Node serverless does NOT
  // keep executing past res.end() (there is no waitUntil shim here), and
  // `tryClaimStripeEvent` already burned the event ID so Stripe won't retry
  // if we drop the work. Emails (~6 s) and the SP IIFE (~3–5 s) ran in
  // parallel, so the wait here is usually a small tail — total handler time
  // stays within Stripe's 30 s timeout and Vercel's 10 s function limit.
  await spPromise;
  return res.status(200).json({ received: true });
}
