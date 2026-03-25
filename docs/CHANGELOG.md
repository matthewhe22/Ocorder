# TOCS OC Portal — Changelog

---

## 2026-03-25 — Admin E2E Security & Validation Hardening (server.js)

### Critical Bug Fixes

- **Fraud-proof order total** — `POST /api/orders` now recalculates `total = Σ(item.price)` server-side; any client-supplied `total` is overridden. Prevents a $1 submission for $220 items.
- **Plan data corruption** — `POST /api/plans` now validates each plan is an object with a non-empty `id` (string) and `name` (string). Sending garbage like `[42, null, "string"]` now returns 400 instead of overwriting the entire plans database.

### High Severity Bug Fixes

- **send-certificate crash on null contactInfo** — Extracted `recipientEmail = order.contactInfo?.email` before SMTP setup; returns `400 "Order has no customer email address."` instead of throwing `TypeError` when an order has no contactInfo.
- **Status enum validation** — `PUT /api/orders/:id/status` now requires status to be one of `["Pending Payment","Processing","Issued","Cancelled","On Hold","Awaiting Documents","Invoice to be issued"]`; null, empty string, and arbitrary values all return 400.
- **XSS in HTML emails** — Added `esc()` HTML-escape helper (encodes `&`, `<`, `>`, `"`, `'`); applied to all user-supplied fields (`name`, `email`, `phone`, `companyName`, `productName`, `ocName`, `lotNumber`, `address`) in all three email builders.
- **Empty plans wipe** — `POST /api/plans` with `plans: []` now returns `400 "Plans array cannot be empty."` instead of silently deleting all strata plan data.
- **Duplicate plan IDs** — Plans submitted with duplicate `id` values are deduplicated (last occurrence wins) before writing.

### Medium Severity Bug Fixes

- **Authority doc 404 ambiguity** — `GET /api/orders/:id/authority` now returns `"Order not found."` when the order ID doesn't exist, distinct from `"No authority document for this order."` when the order exists but has no file attached.
- **Negative product prices** — `POST /api/plans` validates each product's `price >= 0`; returns 400 with the offending product name.

### Input Validation Improvements (Gaps)

- **Empty items array** — `POST /api/orders` with `items: []` now returns `400 "Order must contain at least one item."`.
- **Required contact info** — `POST /api/orders` requires `contactInfo.name` and `contactInfo.email` as non-empty strings; returns 400 if missing.
- **Order date normalisation** — `date` field is parsed and normalised to ISO 8601 on arrival; defaults to server time if missing or unparseable (previously stored invalid strings like `"not-a-date"`).

### Minor Fixes

- **CSV export auth header** — `GET /api/orders/export` now accepts `Authorization: Bearer <token>` in addition to `?token=` query param, avoiding session token exposure in server logs.

---

## 2026-03-21 — Bug Fixes, Keys Shipping, SP Uploads for Stripe

### Bug Fixes
- **Admin Orders blank page (crash)** — Two root causes fixed:
  1. `<>` shorthand fragment inside `.map()` had no `key` prop → changed to `<React.Fragment key={o.id}>`
  2. `o.items.length` and `o.items.map()` crashed for orders with missing `items` array → guarded with `(o.items || [])`

- **SMTP Test Email always fails after page reload** — `test-email.js` was forwarding the masked `••••••••` placeholder as the actual SMTP password. Fixed: if body sends masked value, API falls back to the real stored password from Redis config.

- **Keys/Fobs "Added" visual feedback broken** — Product cards never showed quantity controls (−/qty/+) after adding a Keys product. Root cause: `allAdded` used `inCart()` which checks key format `pid-null-lotId`, but keys products were stored with key `pid-null-lotId-keys`. Fixed: compute `cartItem` first, then use `!!cartItem` for `allAdded` on keys orders.

- **Contact step subtitle incorrect for Keys orders** — Step 4 always said "We'll send your order confirmation and certificate to these details." Fixed to dynamically show "invoice" for keys orders and "certificate" for OC orders.

### New Features

#### Keys/Fob Shipping Options (Step 4)
Four fixed shipping options now shown on Step 4 for keys/fob orders:
| Option | Cost | Address Required |
|--------|------|-----------------|
| Pick up from BM | $0 (fixed) | No |
| Standard Delivery | Configurable per plan | Yes |
| Express Delivery | Configurable per plan | No |
| No Shipment Required | $0 (fixed) | No |

- Address fields show/hide dynamically based on selection
- "Pick up from BM" auto-selected on entry to Step 4
- Admin configures Standard/Express costs via **Plans → Keys Shipping** modal
- Data stored as `plan.keysShipping: { deliveryCost, expressCost }` in Redis
- `selectedShipping` stored on order object as `{ id, name, cost, requiresAddress }`

#### Test SharePoint Button (Admin → Storage)
The existing 4-step SharePoint diagnostic API (`POST /api/config/test-sharepoint`) now has a UI button in the Storage admin tab. Results show step-by-step: `config → auth → site_read → drive_read` with ✅/❌ per step.

#### Email Failure Audit Logging
When admin/customer emails fail to send (SMTP error), the failure message is now written to `order.auditLog` with action `"Email notification failed"`. Previously failures were only logged to Vercel console logs — now visible directly in the Orders admin view.

#### SharePoint Uploads for Stripe Orders
After Stripe payment is confirmed via `stripe-confirm`, three files are now uploaded to SharePoint:
1. `authority-{filename}` — the authority document submitted with the order
2. `order-summary.pdf` — generated order summary
3. `payment-receipt.pdf` — new Stripe payment receipt PDF showing ref, date paid, amount, Stripe session ID

New PDF generator: `generateReceiptPdf(order, sessionId)` added to `api/_lib/pdf.js`.

### SMTP Credentials Updated
- SMTP username changed from `OCCAPP` → `ocorder`
- Password updated in Admin → Settings → SMTP

---

## 2026-03-20 — Stripe, Privacy Policy, Security & Bug Fixes

### New Features
- **Stripe Checkout** — Card payment via Stripe redirect flow; `stripeEnabled` flag hides option if key not set
- **Privacy Policy** — SPA route `/privacy-policy` with 10 TOCS-branded sections
- **Payment cancelled banner** — Dismissible yellow banner when Stripe redirects back with `?cancelled=1`
- **Order deletion** — Admin can permanently delete Cancelled orders

### Bug Fixes
- **PII protection** — `GET /api/data` returns `orders: []` without valid Bearer token
- **CSV Export** — Now accepts `Authorization: Bearer` header in addition to `?token=`
- **SMTP password** — Masked as `"••••••••"` in settings GET; POST ignores the mask
- **Ghost Stripe orders** — Key + zero-total validation fires BEFORE Redis write
- **CORS** — `DELETE` added to `Access-Control-Allow-Methods`
- **Status whitelist** — `PUT /api/orders/:id/status` rejects invalid statuses

---

## 2026-03-19 — Email & SharePoint Stability

- Removed `greetingTimeout` from nodemailer (was causing silent SMTP2GO failures)
- Emails moved synchronous before `res.json()` (guaranteed delivery within timeout)
- Graph SDK replaced with raw `fetch()` + `AbortController` (8s per upload)
- SP uploads fire-and-forget in parallel with emails from T=0
- Azure AD admin consent granted for `Sites.ReadWrite.All` / `Files.ReadWrite.All`

---

## 2026-03-15 — Design System Overhaul

- "Editorial Luxury" design: Cormorant Garamond + Inter, forest green `#1c3326`, greige `#ceceCD`
- 6-step portal flow, sticky header, step bar, plan cards, search input redesign
