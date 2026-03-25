# TOCS OC Portal — Changelog

---

## 2026-03-25 — Admin E2E Round 3: Docs, Email & Payment Hardening (server.js)

### Medium Severity Bug Fixes

- **CRLF in `lotAuthorityFile` crashed the server (DoS)** — `lotAuthorityFile` is now sanitised with `replace(/[^\w.\-]/g, "_")` before use in the `Content-Disposition` header. The `fs.readFile` callback is wrapped in try/catch so header errors cannot escape to an uncaught handler and crash the process.
- **Authority file overwritten before duplicate order check** — The duplicate ID check is now performed before `fs.writeFileSync`, so a repeated submission with the same order ID can no longer overwrite the original authority document on disk.
- **`paymentDetails` fields unescaped in customer confirmation email (XSS)** — `pd.accountName`, `pd.bsb`, `pd.accountNumber`, and `pd.payid` are now all wrapped in `esc()` in `buildCustomerEmailHtml`. A malicious admin storing XSS payloads in payment config can no longer inject HTML into customer bank-transfer/PayID emails.

### Low Severity Bug Fixes

- **`order.lotAuthorityFile` unescaped in admin notification email** — Wrapped in `esc()` in `buildOrderEmailHtml`.
- **`order.id` unescaped in all three email templates** — Wrapped in `esc()` in every HTML context across all three email builders.
- **`orderEmail` display text unescaped in customer email footer** — Both the `href` and display text of the contact link now use `esc()`.

### Input Validation

- **`orderEmail` not validated as a proper email address** — `POST /api/config/settings` now checks `orderEmail` against a basic email pattern before saving; returns 400 if it fails.

### Reliability

- **Email failures not recorded in auditLog** — `sendOrderEmail` and `sendCustomerEmail` are now awaited via `Promise.allSettled()`. If either send fails, a `"Email send failed"` entry with the error message is appended to the order's `auditLog`, giving admins an in-app record of delivery failures.

---

## 2026-03-25 — Admin E2E Round 2: Security & Integrity Hardening (server.js)

### Critical Bug Fixes

- **Path traversal via `lotAuthorityFile`** — `POST /api/orders` now uses a field whitelist; `lotAuthorityFile` and all other admin-only fields are stripped before persistence. `GET /api/orders/:id/authority` now resolves the path with `path.basename()` and asserts the result is inside `UPLOADS_DIR`, preventing arbitrary file reads (including `config.json` and `/etc/passwd`).

### High Severity Bug Fixes

- **Per-item prices not validated against catalog (fraud vector)** — `POST /api/orders` now looks up each `item.productId` in the plan's products list and overwrites `item.price` with the server-authoritative price (applying `secondaryPrice` for additional OC items on `perOC` products). Clients can no longer set item prices to 1 cent.
- **Arbitrary order fields persisted from client** — Field whitelist on order creation: only `id`, `planId`, `lotId`, `orderCategory`, `contactInfo`, `payment`, `items`, `selectedShipping` are stored. Client-supplied `status`, `cancelReason`, `adminNotes`, `lotAuthorityFile` and any other field are stripped before persistence.

### Medium Severity Bug Fixes

- **Order IDs with slashes/spaces permanently unreachable** — `POST /api/orders` rejects IDs containing `/`, `\`, `?`, whitespace, `#`, or control characters. Max length 100 characters.
- **Executable file extensions accepted for authority upload** — Extension now validated against `[.pdf, .jpg, .jpeg, .png]`; anything else stored as `.bin`.
- **Duplicate lot IDs accepted in lots import** — `POST /api/lots/import` deduplicates by `id` (last occurrence wins) before writing.
- **Empty lots array silently wiped all lots** — `POST /api/lots/import` now returns 400 if `lots` array is empty.

### Low Severity Bug Fixes

- **Embedded newlines in CSV fields broke row structure** — CSV export now strips `\r`, `\n`, `\t` from all field values before quoting.

### Input Validation & Error Improvements

- **Oversized body returned connection-reset with no HTTP status** — `readBody()` now sends HTTP 413 with a JSON error body before `req.destroy()`.
- **Wrong HTTP methods returned 404** — Known API routes now return 405 Method Not Allowed with an `Allow:` header.
- **Empty `orderEmail` accepted** — `POST /api/config/settings` rejects empty/non-string `orderEmail` with 400.
- **Non-numeric SMTP port silently fell back to 587** — `smtp.port` now validated as a finite positive number; invalid values return 400.

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
