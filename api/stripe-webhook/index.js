// api/stripe-webhook/index.js
// Handles Stripe webhook events — specifically checkout.session.completed.
// No admin auth required: security is provided by Stripe signature verification.
//
// Vercel serverless functions parse the body as JSON by default.
// Stripe signature verification requires the raw (unparsed) body,
// so we disable the built-in body parser and read the stream manually.

import Stripe from "stripe";
import { readData, writeData, readConfig, cors } from "../_lib/store.js";
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
  if (!webhookSecret) {
    console.warn("STRIPE_WEBHOOK_SECRET is not set — skipping webhook signature verification (graceful no-op).");
    return res.status(200).json({ received: true, skipped: true });
  }

  // Read raw body for Stripe signature verification
  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  const cfg = await readConfig();
  const stripeKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("Stripe secret key is not configured — cannot initialise Stripe.");
    return res.status(200).json({ received: true, skipped: true });
  }

  const stripe = new Stripe(stripeKey);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  // Handle checkout.session.expired — customer abandoned or session timed out
  if (event.type === "checkout.session.expired") {
    const expiredSession = event.data.object;
    const expiredOrderId = expiredSession.metadata?.orderId;
    if (expiredOrderId) {
      const data = await readData();
      const idx = data.orders.findIndex(o => o.id === expiredOrderId);
      // Only remove if not already paid — also verify via Stripe payment_status to guard against
      // race conditions where stripe-confirm ran just before this webhook arrived.
      if (idx !== -1 && data.orders[idx].status !== "Paid" && expiredSession.payment_status !== "paid") {
        data.orders.splice(idx, 1);
        await writeData(data);
        console.log(`Stripe webhook: removed expired pending order ${expiredOrderId}`);
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

  const data = await readData();
  const idx = data.orders.findIndex(o => o.id === orderId);
  if (idx === -1) {
    console.warn(`Stripe webhook: order ${orderId} not found in Redis — ignoring.`);
    return res.status(200).json({ received: true, ignored: true });
  }

  const order = data.orders[idx];

  // Idempotency guard — do not re-process already-paid orders
  if (order.status === "Paid") {
    console.log(`Stripe webhook: order ${orderId} already Paid — skipping.`);
    return res.status(200).json({ received: true, alreadyPaid: true });
  }

  // Mark as Paid and add audit log entry
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

  const confirmedOrder = data.orders[idx];

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
