// api/stripe-webhook/index.js
// Handles Stripe webhook events — specifically checkout.session.completed.
// No admin auth required: security is provided by Stripe signature verification.
//
// Vercel serverless functions parse the body as JSON by default.
// Stripe signature verification requires the raw (unparsed) body,
// so we disable the built-in body parser and read the stream manually.

import Stripe from "stripe";
import { readData, writeData, readConfig, cors, withOrderLock, tryClaimStripeEvent } from "../_lib/store.js";
import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "../_lib/email.js";

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
  if (lockResult.alreadyPaid) {
    return res.status(200).json({ received: true, alreadyPaid: true });
  }
  const confirmedOrder = lockResult.order;

  // Send admin + customer emails (mirrors stripe-confirm handler)
  const smtp = cfg.smtp || {};
  const toEmail = cfg.orderEmail || "Orders@tocs.co";

  if (smtp.host && smtp.user && smtp.pass) {
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

  return res.status(200).json({ received: true });
}
