# Stripe Payment Gateway + Privacy Policy — Design Spec

**Date**: 2026-03-19
**Status**: Approved (v3 — post spec review round 2)

---

## Context

The TOCS OC Order Portal currently supports bank transfer and PayID as payment methods. Stripe (credit/debit card) exists in the UI but is disabled ("Coming Soon"). This spec covers activating Stripe via the Checkout Redirect flow, ensuring order status is updated to "Paid" after successful payment, and adding a TOCS Privacy Policy accessible from the payment step.

---

## Constraints

- **Vercel Hobby plan: 12 serverless functions maximum — already at capacity.** No new function files can be added.
- All Stripe logic must be folded into existing function files.
- `_lib/*.js` shared libraries do not count toward the 12-function limit.
- Start in Stripe test/sandbox mode (`sk_test_...` key).

---

## Stripe Integration Design

### Flow

1. User selects **Stripe** on the payment step and clicks "Place Order".
2. `POST /api/orders` receives `{ payment: "stripe", ... }`.
3. Server:
   - Validates `order.total > 0`. If not (e.g. Keys/Fobs where price is $0), returns HTTP 400 — Stripe cannot process zero-value sessions.
   - Creates order in Redis with `status: "Awaiting Stripe Payment"` and `stripeSessionId` field.
   - Creates a Stripe Checkout Session (`stripe.checkout.sessions.create`):
     - `payment_method_types: ["card"]`
     - `line_items`: one item — `"OC Certificate Order"`, amount = `order.total * 100` (cents), currency `"aud"`
     - `success_url`: derived from request origin (`req.headers['x-forwarded-proto'] + '://' + req.headers['host']`) + `/complete?orderId={id}&stripeOk=1` — **not hardcoded** so local dev and production both work
     - `cancel_url`: derived from request origin + `/?cancelled=1` (returns user to Step 1 — wizard state is not preserved; this is an accepted trade-off for the redirect flow)
     - `metadata: { orderId: id }`
   - Stores `stripeSessionId` on the order record.
   - **Does not send emails.** Emails fire after payment confirmation.
   - Returns `{ id, redirect: session.url }`.
4. Frontend detects `redirect` in response → `window.location.href = redirect`.
5. Customer pays on Stripe's hosted page.
6. Stripe redirects to `/complete?orderId=xxx&stripeOk=1`.
7. Complete page detects `stripeOk=1` → shows spinner → calls `POST /api/orders/{orderId}/stripe-confirm`.
8. `stripe-confirm` handler (see security section below):
   - Reads order from Redis first (this read is always required — idempotency check depends on it).
   - If `order.status === "Paid"` already → return `{ success: true, order }` immediately (idempotency — prevents duplicate emails on page refresh).
   - Reads `stripeSessionId` from the already-fetched order.
   - Calls `stripe.checkout.sessions.retrieve(stripeSessionId)`.
   - **Asserts `session.metadata.orderId === id` (the URL path param).** If mismatch → return HTTP 400. This is the primary guard against cross-order confirmation attacks.
   - If `session.payment_status === "paid"`:
     - Updates `order.status = "Paid"`.
     - Appends audit log: `"Payment confirmed via Stripe (session: {sessionId})"`.
     - Sends admin + customer emails (imported from `api/_lib/email.js`).
     - Returns `{ success: true, order }`.
   - If not paid → returns HTTP 402.
9. Complete page shows full order confirmation.

### Abandoned / Tab-closed checkouts

If a user abandons the Stripe checkout (clicks Cancel or closes the tab), the order remains in `"Awaiting Stripe Payment"` state. Admin can manually cancel via the admin panel.

**Important limitation**: If the customer completes payment but closes the browser before the Stripe redirect lands, the order will also stay in `"Awaiting Stripe Payment"` — the `stripe-confirm` endpoint never fires. This is an inherent risk of the redirect-based confirm approach. A Stripe webhook for `checkout.session.completed` is the production-grade solution; it is explicitly deferred to a future spec. The admin team should watch for orders in this state.

**Known race condition**: If two browser tabs concurrently call `stripe-confirm` on the same order (e.g. browser session restore after payment), both may pass the idempotency check before either writes `"Paid"` to Redis. This would result in duplicate emails. The risk is very low in practice (requires exact timing within a cold-start window) and is accepted for this test-mode rollout. Mitigation (optimistic status pre-write) is deferred to production hardening.

### Timeout budget for `stripe-confirm`

- `stripe.checkout.sessions.retrieve`: ~200–500ms
- Redis read + write: ~100–200ms
- Two emails in parallel via SMTP2GO: ~6.6s (documented behaviour)
- **Total: ~7–8 seconds** — within the 10s Vercel Hobby limit but tight.

Email transporter in `stripe-confirm` **must** use `connectionTimeout: 8000, socketTimeout: 10000` with **no `greetingTimeout`** — identical to the pattern in `orders/index.js` (the `greetingTimeout` removal was a critical fix on 2026-03-19; not replicating this will cause silent email failures).

To avoid reinventing the transporter config, `api/_lib/email.js` must also export a `createTransporter()` factory with the mandated timeout settings. The `stripe-confirm` handler imports and calls `createTransporter()` directly — it does not declare its own nodemailer config.

### Security

- `stripe-confirm` is a **public endpoint** (no admin auth) so the frontend can call it after redirect.
- Attack surface is closed by **server-side metadata verification**: `session.metadata.orderId` is written by the server during Checkout Session creation and cannot be forged. Comparing it to the URL path `id` ensures a caller cannot use someone else's paid session to force a different order to "Paid".
- The `stripeSessionId` is always read from Redis (the order record), never from request body.
- Idempotency guard prevents duplicate emails from replayed calls.

---

## Email Builder Extraction

`buildOrderEmailHtml` and `buildCustomerEmailHtml` currently live only in `api/orders/index.js`. The `stripe-confirm` handler in `[id]/[action].js` also needs them.

**Solution**: Extract both builder functions and a `createTransporter()` factory to `api/_lib/email.js`. Update `orders/index.js` to import from there. `_lib` files are not counted as serverless functions — the 12-function limit is unaffected.

**Note on customer email messaging**: `buildCustomerEmailHtml` uses `isPending = order.payment === "bank" || order.payment === "payid"` to choose between "awaiting payment" and "payment received" copy. For a Stripe order (`payment === "stripe"`), `isPending` is `false`, so the email correctly says "Your payment has been received." No changes to the builder logic are needed; this only works correctly because `stripe-confirm` (not `orders/index.js`) sends the Stripe customer email.

---

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add `"stripe": "^17"` dependency |
| `api/_lib/email.js` | **New library** — extract `buildOrderEmailHtml`, `buildCustomerEmailHtml`, and `createTransporter()` from `orders/index.js` |
| `api/orders/index.js` | (1) Import email builders from `_lib/email.js`. (2) POST handler: if `payment === "stripe"`, validate `total > 0`, create Checkout Session with dynamic origin URL, store `stripeSessionId`, return `{ id, redirect }`. Skip emails for Stripe orders. |
| `api/orders/[id]/[action].js` | Add `stripe-confirm` action (POST, public). Handles idempotency, metadata verification, status update, audit log, emails. Existing actions: `status` (PUT), `authority` (GET), `send-certificate` (POST), `send-invoice` (POST) remain unchanged. |
| `api/config/public.js` | Expose `stripeEnabled: !!(process.env.STRIPE_SECRET_KEY)` |
| `src/App.jsx` | (1) Enable Stripe option when `pubConfig.stripeEnabled`. (2) Handle `redirect` in order submit response (`window.location.href = redirect`). (3) Complete step: detect `?stripeOk=1` param, call `stripe-confirm`, show spinner then result. (4) Add `/privacy-policy` route. (5) Add Privacy Policy link on payment step. |

**Function count stays at 12.** `api/_lib/email.js` is a shared library, not a function.

---

## Privacy Policy Design

### Placement

Payment step (Step 5): a single line below the "Place Order" button:
*"By placing your order, you agree to our [Privacy Policy]."*
The link opens `/privacy-policy` in a new tab.

### Route

SPA route `/privacy-policy` rendered by React — no API endpoint needed. Covered by the existing `/((?!api/).*) → /index.html` rewrite in `vercel.json`.

### Content Structure (adapted from Network Pacific, TOCS branding)

1. **Introduction** — TOCS commitment to Australian Privacy Principles (APPs) under the *Privacy Act 1988 (Cth)*.
2. **What is Personal Information and why do we collect it?** — contact details, lot/property ownership info; collected for OC certificate processing and service delivery.
3. **Third Parties** — disclosure to strata managers, government bodies, or service providers only where necessary.
4. **Disclosure of Personal Information** — with consent or as required by law.
5. **Security of Personal Information** — stored securely; client records retained for minimum 7 years; securely destroyed when no longer required.
6. **Access to your Personal Information** — contact TOCS to request access; identity verification may be required.
7. **Maintaining the Quality of your Personal Information** — contact TOCS to correct inaccurate information.
8. **Policy Updates** — policy may change; current version always at `occorder.vercel.app/privacy-policy`.
9. **Privacy Policy Complaints and Enquiries** — TOCS Owner Corporation Services, Sydney NSW, `info@tocs.co`.

### Styling

Uses the existing TOCS design system (forest green `--forest`, Cormorant Garamond headings, Inter body). Full-width page, max-width container (~800px), section `h2` headings in `--forest` colour, same header/footer as the rest of the portal.

---

## Stripe Test Setup (One-time, done by developer)

1. Create or log in to Stripe account → switch to **Test mode**.
2. Copy `sk_test_...` secret key.
3. Add `STRIPE_SECRET_KEY=sk_test_...` to Vercel project env vars (Settings → Environment Variables) and to local `.env.local`.
4. No specific Product/Price object required in Stripe dashboard — amounts are dynamic per order.

---

## Verification Plan

1. Add `STRIPE_SECRET_KEY=sk_test_...` to `.env.local`.
2. Start dev server (`vercel dev`, port 3000).
3. Place a test order, select Stripe → confirm `redirect` is returned and browser navigates to Stripe's test checkout page.
4. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC.
5. Confirm redirect lands on `/complete?orderId=xxx&stripeOk=1` (using the dev server's origin, not prod).
6. Confirm spinner shows, then order confirmation appears.
7. Check admin panel → order status is **"Paid"**.
8. Confirm admin email and customer confirmation email are both received.
9. Test replay: reload the Complete page → confirm no duplicate emails sent.
10. Test abandoned checkout: start an order, redirect to Stripe, click "Cancel" → confirm order shows "Awaiting Stripe Payment" in admin panel.
11. Test zero-total guard: attempt a Keys/Fobs order with Stripe → confirm 400 error returned (Stripe option should ideally be hidden for Keys/Fobs orders).
12. Confirm Privacy Policy link on payment step opens `/privacy-policy` in new tab with correct TOCS content (9 sections, TOCS branding).
13. Remove `STRIPE_SECRET_KEY` from `.env.local` → confirm Stripe option shows "Coming Soon" badge.
