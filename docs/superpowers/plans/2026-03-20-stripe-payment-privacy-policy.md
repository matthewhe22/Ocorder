# Stripe Payment Gateway + Privacy Policy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe Checkout (test-mode) as a live payment option that marks orders "Paid" after successful card payment, plus a TOCS Privacy Policy page linked from the payment step.

**Architecture:** Stripe logic folds into existing API files (Hobby plan is at 12-function limit). Email builder functions are extracted to `api/_lib/email.js` so both `orders/index.js` and `orders/[id]/[action].js` can share them. The frontend uses `window.location.pathname/search` (no React Router) to detect the Stripe redirect and the privacy policy route.

**Tech Stack:** Node.js ESM, Vercel Serverless Functions, Stripe Node SDK v17, React 18 state-driven SPA, Redis/Upstash KV, nodemailer/SMTP2GO

---

## Chunk 1: Backend — email extraction + Stripe integration

### Task 1: Install Stripe dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1.1: Add stripe to package.json dependencies**

Open `package.json` and add `"stripe": "^17"` to `dependencies`:

```json
"dependencies": {
  "@azure/identity": "^4.13.0",
  "@microsoft/microsoft-graph-client": "^3.0.7",
  "@vercel/kv": "^2.0.0",
  "nodemailer": "^6.9.14",
  "pdfkit": "^0.18.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "redis": "^5.11.0",
  "stripe": "^17",
  "xlsx": "^0.18.5"
}
```

- [ ] **Step 1.2: Install dependencies**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH npm install
```

Expected: `stripe@17.x.x` appears in node_modules. No errors.

---

### Task 2: Create `api/_lib/email.js` — shared email helpers

**Files:**
- Create: `api/_lib/email.js`
- Modify: `api/orders/index.js` (import from new lib, remove duplicated code)

- [ ] **Step 2.1: Create `api/_lib/email.js`**

Create this new file. It exports `buildOrderEmailHtml`, `buildCustomerEmailHtml`, and `createTransporter`. These are extracted verbatim from `api/orders/index.js` lines 7–73.

```js
// api/_lib/email.js
// Shared email helpers — imported by orders/index.js and orders/[id]/[action].js
import nodemailer from "nodemailer";

export function buildOrderEmailHtml(order) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  let date = "—";
  try { date = new Date(order.date).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" }); } catch {}
  const payment = order.payment === "card" ? "Credit / Debit Card" : order.payment === "stripe" ? "Stripe (Card)" : order.payment === "bank" ? "Direct Bank Transfer" : order.payment === "payid" ? "PayID" : order.payment || "—";
  const itemRows = items.map(item =>
    `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.productName || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.ocName || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(item.price||0).toFixed(2)}</td>
    </tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;"><h1 style="color:#fff;margin:0;font-size:1.35rem;">TOCS Order Platform</h1><p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">New Order Notification</p></div>
    <div style="padding:32px;">
      <p style="margin-top:0;">A new order has been placed.</p>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Details</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Order ID</td><td style="padding:6px 0;font-weight:600;">${order.id}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Date</td><td style="padding:6px 0;">${date}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Payment</td><td style="padding:6px 0;">${payment}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Status</td><td style="padding:6px 0;font-weight:600;color:${order.status==="Paid"?"#2e6b42":"#b45309"};">${order.status}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Total</td><td style="padding:6px 0;font-weight:700;font-size:1.1rem;color:#1c3326;">$${(order.total||0).toFixed(2)} AUD</td></tr>
      </table>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Customer</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Name</td><td style="padding:6px 0;">${contact.name||"—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${contact.email||""}" style="color:#2e6b42;">${contact.email||"—"}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${contact.phone||"—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Company</td><td style="padding:6px 0;">${contact.companyName||"—"}</td></tr>
      </table>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Items</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f5f7f5;"><th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Product</th><th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">OC</th><th style="padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;">Price</th></tr>
        ${itemRows}
        <tr style="background:#f5f7f5;"><td colspan="2" style="padding:8px 12px;font-weight:700;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:700;">$${(order.total||0).toFixed(2)} AUD</td></tr>
      </table>
      <p style="font-size:0.78rem;color:#aaa;">Lot Authority Document: ${order.lotAuthorityFile ? `<strong>${order.lotAuthorityFile}</strong> — see attachment` : "Not provided"}</p>
    </div>
  </div>
</body></html>`;
}

export function buildCustomerEmailHtml(order, cfg) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  const pd = cfg.paymentDetails || {};
  const isPending = order.payment === "bank" || order.payment === "payid";
  const itemRows = items.map(item =>
    `<tr><td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.productName||"—"}</td><td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.ocName||"—"}</td><td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(item.price||0).toFixed(2)}</td></tr>`).join("");
  const bankRows = order.payment === "bank" ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;"><div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;">Bank Transfer Details</div><table style="width:100%;border-collapse:collapse;font-size:0.88rem;"><tr><td style="padding:4px 0;color:#666;width:38%;">Account Name</td><td style="padding:4px 0;font-weight:600;">${pd.accountName||""}</td></tr><tr><td style="padding:4px 0;color:#666;">BSB</td><td style="padding:4px 0;font-weight:600;">${pd.bsb||""}</td></tr><tr><td style="padding:4px 0;color:#666;">Account Number</td><td style="padding:4px 0;font-weight:600;">${pd.accountNumber||""}</td></tr><tr><td style="padding:4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${order.id}</td></tr></table></div>` : order.payment === "payid" ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;"><div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;">PayID Details</div><table style="width:100%;border-collapse:collapse;font-size:0.88rem;"><tr><td style="padding:4px 0;color:#666;width:38%;">PayID</td><td style="padding:4px 0;font-weight:600;">${pd.payid||""}</td></tr><tr><td style="padding:4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${order.id}</td></tr></table></div>` : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);"><div style="background:#1c3326;padding:24px 32px;"><h1 style="color:#fff;margin:0;font-size:1.35rem;">TOCS Order Platform</h1><p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">Order Confirmation</p></div><div style="padding:32px;"><p style="margin-top:0;">Dear ${contact.name||"Applicant"},</p><p>${isPending?"Your order has been received and is <strong>awaiting payment</strong>. Certificate processing will begin once payment is confirmed.":"Your payment has been received and your certificate(s) will be processed within the stated turnaround time."}</p><div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:12px 16px;border-radius:4px;margin:20px 0;"><div style="font-size:0.78rem;color:#666;margin-bottom:4px;">Your order reference number</div><div style="font-family:monospace;font-size:1.2rem;font-weight:700;color:#1c3326;">${order.id}</div><div style="font-size:0.75rem;color:#666;margin-top:4px;">Please keep this for your records and use it as your payment reference for bank transfers.</div></div>${bankRows}<h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Summary</h3><table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr style="background:#f5f7f5;"><th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Product</th><th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Owner Corporation</th><th style="padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;">Price</th></tr>${itemRows}<tr><td colspan="2" style="padding:8px 12px;font-size:0.78rem;color:#666;">GST (10%) included</td><td style="padding:8px 12px;text-align:right;font-size:0.78rem;color:#666;">$${((order.total||0)/11).toFixed(2)}</td></tr><tr style="background:#f5f7f5;"><td colspan="2" style="padding:8px 12px;font-weight:700;">Total (incl. GST)</td><td style="padding:8px 12px;text-align:right;font-weight:700;font-size:1.05rem;color:#1c3326;">$${(order.total||0).toFixed(2)}</td></tr></table><hr style="border:none;border-top:1px solid #e8edf0;margin:28px 0 16px;"><p style="font-size:0.8rem;color:#555;margin:0;">Questions? Contact us at <a href="mailto:${cfg.orderEmail||'info@tocs.co'}" style="color:#2e6b42;">${cfg.orderEmail||'info@tocs.co'}</a> quoting your order reference.</p></div></div></body></html>`;
}

/**
 * Creates a nodemailer transporter with the correct timeout settings.
 * IMPORTANT: Do NOT add greetingTimeout — it caused silent failures with SMTP2GO (2026-03-19).
 * connectionTimeout: 8000ms, socketTimeout: 10000ms are required.
 */
export function createTransporter(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 2525,  // SMTP2GO default port — match existing pattern in orders/index.js
    secure: Number(smtp.port) === 465,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 8000,   // 8 s to establish TCP connection
    socketTimeout:     10000,  // 10 s idle socket cut-off
    // NOTE: NO greetingTimeout — SMTP2GO's greeting can take >5 s and silent-fails with it
  });
}
```

- [ ] **Step 2.2: Update `api/orders/index.js` to import from `_lib/email.js`**

At the top of `api/orders/index.js`, replace the `import nodemailer` line and the three functions `buildOrderEmailHtml`, `buildCustomerEmailHtml`, and `sendMail` (lines 2–73) with:

```js
import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "../_lib/email.js";
```

Then replace the `sendMail` helper (lines 63–73 of the original) with a local wrapper that uses `createTransporter` from the lib:

```js
async function sendMail(smtp, mailOpts) {
  const transporter = createTransporter(smtp);
  await transporter.sendMail(mailOpts);
}
```

The `withTimeout` helper function (lines 76–84) stays — it is not email-specific.

- [ ] **Step 2.3: Verify the import works — start dev server and check for errors**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel dev --listen 3001 &
sleep 4
curl -s http://localhost:3001/api/config/public | head -c 200
pkill -f "vercel dev" 2>/dev/null || true
```

Expected: JSON response from `/api/config/public` with no import errors in terminal output.

---

### Task 3: Add `stripeEnabled` to public config

**Files:**
- Modify: `api/config/public.js`

- [ ] **Step 3.1: Add `stripeEnabled` field to the public config response**

Replace the return statement in `api/config/public.js` with:

```js
  return res.status(200).json({
    logo: cfg.logo || "",
    stripeEnabled: !!(process.env.STRIPE_SECRET_KEY),
    paymentDetails: {
      accountName: pd.accountName || "Top Owners Corporation",
      bsb: pd.bsb || "033-065",
      accountNumber: pd.accountNumber || "522011",
      payid: pd.payid || "accounts@tocs.com.au",
    },
  });
```

---

### Task 4: Add Stripe Checkout Session creation to `api/orders/index.js`

**Files:**
- Modify: `api/orders/index.js`

The Stripe path: if `order.payment === "stripe"`, validate total > 0, create a Checkout Session, store the session ID on the order, and return `{ id, redirect: session.url }`. Emails are skipped — they fire in `stripe-confirm` after payment.

- [ ] **Step 4.1: Add Stripe import at the top of `api/orders/index.js`**

After the existing imports, add:

```js
import Stripe from "stripe";
```

- [ ] **Step 4.2: Add the Stripe Checkout branch inside the POST handler**

The Stripe block must be placed **after** `await writeData(data)` (so the order is in Redis) and **immediately before** the SP upload block (the comment `// ── START SP uploads immediately at T=0`). This means: when payment is "stripe", the handler returns early — skipping the SP upload IIFE, the Redis authority doc save, and the email block. This is correct because:
- Stripe orders do not have authority documents at this stage (customer is redirected to Stripe before doc upload applies)
- Emails fire in `stripe-confirm` after confirmed payment
- **Known accepted limitation**: if a user attaches a Lot Authority doc AND pays by Stripe, that doc will not be saved to Redis or SharePoint at order creation time. Accepted for initial implementation.

Find this comment in `orders/index.js`:
```
// ── START SP uploads immediately at T=0 (parallel to emails) ────────────
```

Insert the Stripe block immediately **before** that comment:

```js
    // ── STRIPE CHECKOUT ────────────────────────────────────────────────────────
    // If payment is "stripe", create a Checkout Session and redirect the customer.
    // Emails are sent later by the stripe-confirm endpoint after payment is verified.
    if (order.payment === "stripe") {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(400).json({ error: "Stripe is not configured on this server." });
      }
      if (!order.total || order.total <= 0) {
        return res.status(400).json({ error: "Stripe cannot process a zero-value order. Please contact us." });
      }
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
        // Return redirect — browser will navigate to Stripe's hosted checkout page
        return res.status(200).json({ id: order.id, redirect: session.url });
      } catch (stripeErr) {
        console.error("Stripe session creation failed:", stripeErr.message);
        return res.status(500).json({ error: "Could not create payment session. Please try again." });
      }
    }
    // ── END STRIPE CHECKOUT ────────────────────────────────────────────────────
```

The code must be placed so execution only reaches the email block for non-Stripe orders.

---

### Task 5: Add `stripe-confirm` action to `api/orders/[id]/[action].js`

**Files:**
- Modify: `api/orders/[id]/[action].js`

- [ ] **Step 5.1: Add imports at the top of `[action].js`**

After the existing import lines, add:

```js
import Stripe from "stripe";
import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "../../_lib/email.js";
```

- [ ] **Step 5.2: Add the `stripe-confirm` handler block**

Add this block **before** the final `return res.status(404).json({ error: "Unknown action." });` line (currently the last line of the handler):

```js
  // ── POST /api/orders/:id/stripe-confirm ──────────────────────────────────
  // PUBLIC — no admin auth (customer's browser calls this after Stripe redirect).
  // Security: session.metadata.orderId is compared to the URL id to prevent
  // cross-order confirmation attacks.
  if (action === "stripe-confirm" && req.method === "POST") {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: "Stripe is not configured on this server." });
    }

    // Always read order from Redis first — idempotency check depends on it
    const data = await readData();
    const idx  = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });
    const order = data.orders[idx];

    // Idempotency guard — prevents duplicate emails on page refresh
    if (order.status === "Paid") {
      return res.status(200).json({ success: true, order });
    }

    const { stripeSessionId } = order;
    if (!stripeSessionId) {
      return res.status(400).json({ error: "No Stripe session associated with this order." });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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

    // Send admin + customer emails using shared helpers
    // Timeout config: connectionTimeout:8000, socketTimeout:10000, NO greetingTimeout
    // (matches orders/index.js pattern — greetingTimeout causes silent failures with SMTP2GO)
    const cfg     = await readConfig();
    const smtp    = cfg.smtp || {};
    const toEmail = cfg.orderEmail || "Orders@tocs.co";
    const confirmedOrder = data.orders[idx];

    if (smtp.host && smtp.user && smtp.pass) {
      const emailJobs = [
        createTransporter(smtp).sendMail({
          from: `"TOCS Order Platform" <${toEmail}>`,
          to: toEmail,
          subject: `Payment Confirmed — Order #${id} — $${(confirmedOrder.total||0).toFixed(2)} AUD`,
          html: buildOrderEmailHtml(confirmedOrder),
        }).catch(e => console.error("Admin stripe email failed:", e.message)),
      ];
      if (confirmedOrder.contactInfo?.email) {
        emailJobs.push(
          createTransporter(smtp).sendMail({
            from: `"TOCS Order Platform" <${toEmail}>`,
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

    return res.status(200).json({ success: true, order: confirmedOrder });
  }
  // ── END stripe-confirm ─────────────────────────────────────────────────────
```

---

## Chunk 2: Frontend — Stripe + Privacy Policy

### Task 6: Update `placeOrder` and `PaymentStep` for Stripe

**Files:**
- Modify: `src/App.jsx` (multiple locations)

- [ ] **Step 6.1: Update `orderStatus` in `placeOrder` to handle Stripe**

In `App()`, find the `placeOrder` function (around line 432). The current line is:
```js
    const orderStatus = isKeys ? "Invoice to be issued" : (payMethod === "bank" ? "Awaiting Payment" : "Paid");
```

Replace it with:
```js
    const orderStatus = isKeys ? "Invoice to be issued"
      : orderPayment === "stripe" ? "Awaiting Stripe Payment"
      : orderPayment === "bank"   ? "Awaiting Payment"
      : "Paid";
```

Note: `orderPayment` is defined on the next line (`const orderPayment = isKeys ? "invoice" : payMethod`), so move the `orderPayment` line to be **before** `orderStatus`:
```js
    const orderPayment = isKeys ? "invoice" : payMethod;
    const orderStatus = isKeys ? "Invoice to be issued"
      : orderPayment === "stripe" ? "Awaiting Stripe Payment"
      : orderPayment === "bank"   ? "Awaiting Payment"
      : "Paid";
```

- [ ] **Step 6.2: Handle `redirect` in `placeOrder` response**

In `placeOrder`, after `const r = await fetch("/api/orders", ...)`, find the block:
```js
      if (!r.ok) {
        // Server returned an error (e.g. KV unavailable) — surface it to the user
        const d = await r.json().catch(() => ({}));
        if (setErr) setErr(d.error || `Submission failed (${r.status}). Please try again.`);
        setPlacing(false);
        return; // Do NOT advance to confirmation
      }
```

Replace with:
```js
      const respData = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (setErr) setErr(respData.error || `Submission failed (${r.status}). Please try again.`);
        setPlacing(false);
        return; // Do NOT advance to confirmation
      }
      // Stripe payment: redirect to Stripe's hosted checkout page
      if (respData.redirect) {
        window.location.href = respData.redirect;
        return; // Page navigates away — do not advance to step 6
      }
```

- [ ] **Step 6.3: Add new state variables at the top of `App()`**

After the existing `const [pubConfig, setPubConfig] = useState(null);` line (around line 401), add:
```js
  const [stripeConfirming, setStripeConfirming] = useState(false);
  const [stripeConfirmErr, setStripeConfirmErr] = useState("");
  const [stripeOrderId, setStripeOrderId] = useState(null);
```

- [ ] **Step 6.4: Detect Stripe redirect on app mount**

In the existing `useEffect` that loads data (around line 403–407), add URL param detection:
```js
  useEffect(() => {
    fetch("/api/data").then(r => r.json()).then(d => setData(d)).catch(() => {});
    fetch("/api/config/public").then(r => r.json()).then(d => setPubConfig(d)).catch(() => {});
    // Detect Stripe payment redirect: /complete?orderId=xxx&stripeOk=1
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripeOk") === "1" && params.get("orderId")) {
      const oid = params.get("orderId");
      setStripeOrderId(oid);
      setStripeConfirming(true);
      setStep(6);
      setCurrentView("portal");
    }
    // Detect Stripe cancel redirect: /?cancelled=1
    if (params.get("cancelled") === "1") {
      // Just clean URL — user is back at Step 1 (wizard state was not preserved)
      window.history.replaceState({}, "", "/");
    }
  }, []);
```

- [ ] **Step 6.5: Add `useEffect` to call `stripe-confirm` when `stripeConfirming` becomes true**

After the existing `useEffect`, add a new one:
```js
  useEffect(() => {
    if (!stripeConfirming || !stripeOrderId) return;
    fetch(`/api/orders/${stripeOrderId}/stripe-confirm`, { method: "POST" })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.order) {
          setOrder(d.order);
          setStripeConfirming(false);
          // Clean up URL params
          window.history.replaceState({}, "", `/complete?orderId=${stripeOrderId}`);
        } else {
          setStripeConfirmErr(d.error || "Payment could not be verified. Please contact support.");
          setStripeConfirming(false);
        }
      })
      .catch(() => {
        setStripeConfirmErr("Network error. Please contact support at info@tocs.co.");
        setStripeConfirming(false);
      });
  }, [stripeConfirming, stripeOrderId]);
```

- [ ] **Step 6.6: Update step-6 render to handle Stripe states**

Find the step-6 render block (around line 966–969):
```jsx
      {/* ── STEP 6: CONFIRMATION ── */}
      {step === 6 && order && (
        <ConfirmationPage order={order} reset={reset} pubConfig={pubConfig} />
      )}
```

Replace with:
```jsx
      {/* ── STEP 6: CONFIRMATION ── */}
      {step === 6 && stripeConfirming && (
        <div style={{ textAlign: "center", padding: "4rem 0" }}>
          <div style={{ display:"inline-block", animation:"spin 1s linear infinite", border:"3px solid rgba(28,51,38,0.15)", borderTop:"3px solid var(--forest)", borderRadius:"50%", width:48, height:48, marginBottom:"1.5rem" }}/>
          <p style={{ color:"var(--forest)", fontFamily:"'Cormorant Garamond',serif", fontSize:"1.4rem" }}>Confirming your payment…</p>
          <p style={{ color:"var(--muted)", fontSize:"0.85rem" }}>Please wait while we verify your payment with Stripe.</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {step === 6 && stripeConfirmErr && (
        <div style={{ maxWidth: "500px", textAlign: "center", padding: "3rem 0" }}>
          <div style={{ fontSize:"2.5rem", marginBottom:"1rem" }}>⚠️</div>
          <h2 style={{ color:"var(--forest)", fontFamily:"'Cormorant Garamond',serif" }}>Payment Verification Issue</h2>
          <p style={{ color:"var(--muted)", fontSize:"0.88rem" }}>{stripeConfirmErr}</p>
          <p style={{ fontSize:"0.82rem", color:"var(--muted)" }}>Your order may have been recorded. Please quote order ID: <strong style={{ fontFamily:"monospace" }}>{stripeOrderId}</strong> when contacting support.</p>
          <a href="mailto:info@tocs.co" className="btn btn-sage" style={{ display:"inline-flex", marginTop:"1rem" }}>Contact Support</a>
        </div>
      )}
      {step === 6 && order && !stripeConfirming && !stripeConfirmErr && (
        <ConfirmationPage order={order} reset={reset} pubConfig={pubConfig} />
      )}
```

- [ ] **Step 6.7: Enable the Stripe payment option in `PaymentStep`**

Find the payment methods array in `PaymentStep` (around line 1029–1047):
```js
      {[
        { id: "bank",   icon: <Ic n="bank" s={20}/>,   name: "Direct Bank Transfer", desc: "..." },
        { id: "stripe", icon: <Ic n="credit" s={20}/>, name: <>Stripe — Credit / Debit Card <span className="coming-soon-badge">Coming Soon</span></>, desc: "..." },
        { id: "payid",  ... },
      ].map(m => (
        <div
          key={m.id}
          className={`pay-method ${payMethod === m.id ? "sel" : ""} ${m.id === "stripe" ? "no-print" : ""}`}
          style={m.id === "stripe" ? { opacity: 0.6, cursor: "not-allowed" } : {}}
          onClick={() => m.id !== "stripe" && setPayMethod(m.id)}
        >
```

Replace the entire methods array and the mapping with:
```jsx
      {[
        { id: "bank",   icon: <Ic n="bank" s={20}/>,   name: "Direct Bank Transfer",             desc: "Manual transfer — processing begins on receipt. No fees.", enabled: true },
        { id: "stripe", icon: <Ic n="credit" s={20}/>, name: "Credit / Debit Card (Stripe)",      desc: "Secure online card payment. Visa, Mastercard, Amex.", enabled: !!pubConfig?.stripeEnabled },
        { id: "payid",  icon: <span style={{fontWeight:800,fontSize:"0.7rem",letterSpacing:"0.05em"}}>PayID</span>, name: "PayID", desc: "Instant bank transfer via PayID. No transaction fees.", enabled: true },
      ].filter(m => m.enabled).map(m => (
        <div
          key={m.id}
          className={`pay-method ${payMethod === m.id ? "sel" : ""} ${m.id === "stripe" ? "no-print" : ""}`}
          onClick={() => setPayMethod(m.id)}
        >
```

When `pubConfig?.stripeEnabled` is falsy, the Stripe option is filtered out entirely — bank and PayID are always shown. This replaces the previous "Coming Soon" disabled stripe button.

- [ ] **Step 6.8: Add privacy policy link below the Place Order button in `PaymentStep`**

Find the Place Order button in `PaymentStep` (around line 1069–1083). After the closing `</div>` of the button row, add:
```jsx
      <p style={{ fontSize:"0.72rem", color:"var(--muted)", textAlign:"center", marginTop:"0.75rem" }}>
        By placing your order, you agree to our{" "}
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"var(--sage)", textDecoration:"underline" }}>Privacy Policy</a>.
      </p>
```

- [ ] **Step 6.9: Update `ConfirmationPage` to handle `payment === "stripe"`**

Find the payment status block in `ConfirmationPage` (around line 1149–1157):
```jsx
        ) : order.payment === "bank" ? (
          <div className="alert alert-warn" style={{ marginTop: "1rem" }}>
            Please transfer ...
          </div>
        ) : (
          <div className="alert alert-ok" style={{ marginTop: "1rem" }}>
            Payment received. Your certificate(s) will be processed...
          </div>
        )}
```

The existing `else` branch (`:`) already shows "Payment received" for Stripe orders because `isPending` is `false` when `payment === "stripe"`. No changes needed here. ✅

- [ ] **Step 6.10: Add "Awaiting Stripe Payment" to admin order filter, badge, and Mark Paid button**

**6.10a — Filter dropdown:** In the admin order filter `<select>` (around line 1726–1735), add:
```jsx
              <option>Awaiting Stripe Payment</option>
```

**6.10b — Badge color:** In the badge color logic (around line 1764–1771), add a case for `"Awaiting Stripe Payment"` before the final `"bg-gold"` fallback:
```jsx
                        o.status==="Awaiting Stripe Payment"?"bg-blue":
```

Add a CSS class `bg-blue` for the badge. Find where the other badge classes are defined (search for `.bg-gold` in the CSS near the top of the file) and add:
```css
  .badge.bg-blue { background: #eff6ff; color: #1d4ed8; }
```

**6.10c — Mark Paid button:** Find the "Mark Paid" button condition (around line 1776–1777):
```jsx
                        {(o.status === "Awaiting Payment" || o.status === "Invoice sent, awaiting payment") && (
                          <button className="tbl-act-btn success" onClick={e => { e.stopPropagation(); markPaid(o.id); }}>Mark Paid</button>
                        )}
```
Add `"Awaiting Stripe Payment"` to the condition so admin can manually resolve orders stuck in that state (e.g. customer closed browser before redirect):
```jsx
                        {(o.status === "Awaiting Payment" || o.status === "Invoice sent, awaiting payment" || o.status === "Awaiting Stripe Payment") && (
                          <button className="tbl-act-btn success" onClick={e => { e.stopPropagation(); markPaid(o.id); }}>Mark Paid</button>
                        )}
```

---

### Task 7: Add Privacy Policy SPA route

**Files:**
- Modify: `src/App.jsx` (add `PrivacyPolicy` component + routing)

- [ ] **Step 7.1: Add a `currentPath` state and detect pathname on mount**

In `App()`, add state:
```js
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
```

In the existing `useEffect` on mount, the path detection is already handled by `stripeOk` check. We just need to add privacy policy detection. In the same `useEffect`, add **before** the Stripe check:
```js
    if (window.location.pathname === "/privacy-policy") {
      setCurrentPath("/privacy-policy");
    }
```

- [ ] **Step 7.2: Add the `PrivacyPolicy` component**

Add this component after `ConfirmationPage` (around line 1210) and before the `Admin` component:

```jsx
// ─── PRIVACY POLICY PAGE ──────────────────────────────────────────────────────
function PrivacyPolicy({ onBack }) {  // pubConfig not needed — logo is in the shared header above <main>
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem 0 4rem" }}>
      <button className="btn btn-out" style={{ marginBottom: "2rem", display: "inline-flex", gap: "6px" }} onClick={onBack}>
        ← Back
      </button>

      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "2.5rem", fontWeight: 600, color: "var(--forest)", marginBottom: "0.5rem" }}>
        Privacy Policy
      </h1>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "2.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "1.5rem" }}>
        TOCS Owner Corporation Services · Last updated: March 2026
      </p>

      {[
        {
          heading: "Introduction",
          body: `TOCS Owner Corporation Services ("TOCS", "we", "our", "us") is committed to providing quality services to you and this policy outlines our ongoing obligations to you in respect of how we manage your Personal Information. We have adopted the Australian Privacy Principles (APPs) contained in the Privacy Act 1988 (Cth) (the Privacy Act). The NPPs govern the way in which we collect, use, disclose, store, secure and dispose of your Personal Information. A copy of the Australian Privacy Principles may be obtained from the website of The Office of the Australian Information Commissioner at www.aoic.gov.au.`,
        },
        {
          heading: "What is Personal Information and why do we collect it?",
          body: `Personal Information is information or an opinion that identifies an individual. Examples of Personal Information we collect include: names, addresses, email addresses, phone numbers, lot and property ownership details. This Personal Information is obtained in many ways including correspondence, by telephone, by email, via our website occorder.vercel.app and from third parties. We don't guarantee website links or policy of authorised third parties. We collect your Personal Information for the primary purpose of providing our services to you, providing information to our clients and marketing. We may also use your Personal Information for secondary purposes closely related to the primary purpose, in circumstances where you would reasonably expect such use or disclosure. You may unsubscribe from our mailing/marketing lists at any time by contacting us in writing. When we collect Personal Information we will, where appropriate and where possible, explain to you why we are collecting the information and how we plan to use it.`,
        },
        {
          heading: "Sensitive Information",
          body: `Sensitive information is defined in the Privacy Act to include information or opinion about such things as an individual's racial or ethnic origin, political opinions, membership of a political association, religious or philosophical beliefs, membership of a trade union or other professional body, criminal record or health information. Sensitive information will be used by us only: For the primary purpose for which it was obtained; For a secondary purpose that is directly related to the primary purpose; With your consent; or where required or authorised by law.`,
        },
        {
          heading: "Third Parties",
          body: `Where reasonable and practicable to do so, we will collect your Personal Information only from you. However, in some circumstances we may be provided with information by third parties. In such a case we will take reasonable steps to ensure that you are made aware of the information provided to us by the third party.`,
        },
        {
          heading: "Disclosure of Personal Information",
          body: `Your Personal Information may be disclosed in a number of circumstances including the following: Third parties where you consent to the use or disclosure; and Where required or authorised by law. We will only disclose your personal information to relevant strata managers, government bodies, or service providers where necessary to fulfill your OC Certificate order.`,
        },
        {
          heading: "Security of Personal Information",
          body: `Your Personal Information is stored in a manner that reasonably protects it from misuse and loss and from unauthorised access, modification or disclosure. When your Personal Information is no longer needed for the purpose for which it was obtained, we will take reasonable steps to destroy or permanently de-identify your Personal Information. However, most of the Personal Information is or will be stored in client files which will be kept by us for a minimum of 7 years.`,
        },
        {
          heading: "Access to your Personal Information",
          body: `You may access the Personal Information we hold about you and to update and/or correct it, subject to certain exceptions. If you wish to access your Personal Information, please contact us in writing. TOCS Owner Corporation Services will not charge any fee for your access request, but may charge an administrative fee for providing a copy of your Personal Information. In order to protect your Personal Information we may require identification from you before releasing the requested information.`,
        },
        {
          heading: "Maintaining the Quality of your Personal Information",
          body: `It is an important to us that your Personal Information is up to date. We will take reasonable steps to make sure that your Personal Information is accurate, complete and up-to-date. If you find that the information we have is not up to date or is inaccurate, please advise us as soon as practicable so we can update our records and ensure we can continue to provide quality services to you.`,
        },
        {
          heading: "Policy Updates",
          body: `This Policy may change from time to time and is available on our website at occorder.vercel.app/privacy-policy.`,
        },
        {
          heading: "Privacy Policy Complaints and Enquiries",
          body: `If you have any queries or complaints about our Privacy Policy please contact us at:\n\nTOCS Owner Corporation Services\nSydney, NSW, Australia\nEmail: info@tocs.co`,
        },
      ].map(({ heading, body }) => (
        <div key={heading} style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.4rem", fontWeight: 600, color: "var(--forest)", marginBottom: "0.6rem", borderBottom: "1px solid var(--border2)", paddingBottom: "0.4rem" }}>
            {heading}
          </h2>
          <p style={{ fontSize: "0.88rem", lineHeight: 1.75, color: "var(--ink)", whiteSpace: "pre-line", margin: 0 }}>
            {body}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7.3: Wire the privacy policy route into the `App` render**

In the `App()` return JSX, find the `<main className="main">` block. The current structure is:
```jsx
        <main className="main">
          {currentView === "portal" ? (
            <Portal ... />
          ) : (
            <Admin ... />
          )}
        </main>
```

Replace with:
```jsx
        <main className="main">
          {currentPath === "/privacy-policy" ? (
            <PrivacyPolicy onBack={() => { setCurrentPath("/"); window.history.pushState({}, "", "/"); }} />
          ) : currentView === "portal" ? (
            <Portal ... />
          ) : (
            <Admin ... />
          )}
        </main>
```

(Keep the existing `Portal` and `Admin` props exactly as-is.)

---

### Task 8: Build and verify

**Files:**
- No file changes — build + manual test

- [ ] **Step 8.1: Build the frontend**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
```

Expected: `dist/bundle.js` and `dist/index.html` created with no errors.

- [ ] **Step 8.2: Add Stripe test key to `.env.local`**

Check if `.env.local` already exists. If not, you can still run `vercel dev` — Stripe will be disabled (stripeEnabled=false) and the Stripe option will be filtered out from the payment methods. That's correct "Coming Soon" replacement behaviour.

If you have a Stripe test key (from the TOCS Stripe test account), add to `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_...
```

- [ ] **Step 8.3: Start dev server**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel dev
```

Expected: Server starts on port 3000 with no import errors.

- [ ] **Step 8.4: Test `stripeEnabled` flag**

```bash
curl -s http://localhost:3000/api/config/public
```

Expected (with key set): `{"logo":"...","stripeEnabled":true,"paymentDetails":{...}}`
Expected (no key): `{"logo":"...","stripeEnabled":false,"paymentDetails":{...}}`

- [ ] **Step 8.5: Manual smoke test — Stripe payment flow (requires Stripe key)**

1. Open http://localhost:3000
2. Select a plan and lot, add products, fill contact details
3. On Step 5 (Payment), confirm "Credit / Debit Card (Stripe)" is selectable
4. Select Stripe and click "Confirm Order"
5. Browser should redirect to Stripe's test checkout page
6. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC
7. Complete payment — browser redirects to `http://localhost:3000/complete?orderId=xxx&stripeOk=1`
8. Spinner shows "Confirming your payment…"
9. Spinner clears → "Order Confirmed" page with order details
10. In admin panel, order shows status "Paid" with badge in blue

- [ ] **Step 8.6: Test Privacy Policy link**

1. Go to Step 5 (Payment)
2. Click the "Privacy Policy" link below the button
3. Confirm it opens `/privacy-policy` in a new tab with 9 sections, TOCS branding, dark green headings

- [ ] **Step 8.7: Test `stripeEnabled=false` hides Stripe option**

Without `STRIPE_SECRET_KEY` in `.env.local`: Payment step should show only Bank Transfer and PayID. Stripe option is not shown at all.

---

### Task 9: Deploy to production

**Files:**
- No changes

- [ ] **Step 9.1: Set `STRIPE_SECRET_KEY` in Vercel project (if deploying with Stripe active)**

In Vercel dashboard → TOCS project → Settings → Environment Variables, add:
```
STRIPE_SECRET_KEY = sk_test_...   (test mode key)
```

- [ ] **Step 9.2: Deploy**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod
```

Expected: Deployment succeeds. Production URL: https://occorder.vercel.app

- [ ] **Step 9.3: Smoke test production**

```bash
curl -s https://occorder.vercel.app/api/config/public
```

Expected: `stripeEnabled: true` if key is set, `false` if not set.

---

## Summary of all files changed

| File | What changes |
|---|---|
| `package.json` | Add `"stripe": "^17"` |
| `api/_lib/email.js` | **NEW** — `buildOrderEmailHtml`, `buildCustomerEmailHtml`, `createTransporter` |
| `api/orders/index.js` | Import from `_lib/email.js`; add Stripe Checkout Session creation branch |
| `api/orders/[id]/[action].js` | Import Stripe + `_lib/email.js`; add `stripe-confirm` action handler |
| `api/config/public.js` | Add `stripeEnabled` field |
| `src/App.jsx` | `placeOrder` Stripe status + redirect; Stripe confirm `useEffect`; payment step Stripe option; privacy policy link; `PrivacyPolicy` component; privacy policy routing; admin badge/filter |
