# TOCS OC Portal — Changelog

---

## 2026-05-06 — Send-Certificate / Send-Invoice: multipart upload (fix for Vercel 4.5 MB body limit)

### Bug
Sending a ~3.9 MB OC certificate PDF through the admin portal failed with `Network error: Unexpected token 'R', "Request En"... is not valid JSON`. Root cause: the frontend base64-encoded the PDF into a JSON body, inflating it ~33% to ~5.3 MB — exceeding Vercel's 4.5 MB serverless request limit. Vercel returned a plain-text `Request Entity Too Large` page that the client tried to `JSON.parse`.

### Fix
- **Frontend (`src/App.jsx`)** — `SendCertificateModal` and `SendInvoiceModal` now upload the PDF as `multipart/form-data` (raw binary, no base64 inflation). Added `safeReadResponse()` helper that detects non-JSON error bodies (e.g. 413) and surfaces a meaningful error message instead of the JSON parse error.
- **Vercel handler (`api/orders/[id]/[action].js`)** — Added `parseMultipart()` + `readMessageAndAttachment()` helpers. Both routes now accept multipart (preferred) and legacy JSON+base64 (backward-compatible). Attachment is normalised to a Buffer.
- **Local server (`OCOrder/server.js`)** — `send-certificate` / `send-invoice` route now branches on Content-Type: multipart uses the existing `readMultipart()`, JSON uses `readBody()`.
- **`api/_lib/sharepoint.js`** — `uploadToSharePoint()` now accepts a Buffer or a base64 string for the file argument (avoids re-encoding round-trip on the multipart path).

A 3.9 MB PDF is now ~3.95 MB on the wire (multipart overhead is small) — well within the 4.5 MB cap.

---

## 2026-03-26 — Code Optimisation, Security & Demo/Shadow Environment

### Code Quality & Optimisation
- **`createSmtpTransporter` helper** — Extracted from 5 duplicated `nodemailer.createTransport` call sites into a single shared function.
- **`VALID_STATUSES` module constant** — Moved from local variable inside PUT handler to module level; used consistently across all status references.
- **`send-certificate` + `send-invoice` merged** — Single handler with `isCert` flag replaces two near-identical request handlers.
- **`filteredOrders` via `useMemo`** — Moved from inline recalculation on every render to memoized computation in Admin component.
- **SESSIONS expiry cleanup** — Added 30-min interval purge (with `.unref()`) to evict expired session tokens from memory.
- **TOCTOU fix: authority file deletion** — Replaced `existsSync` guard with `unlinkSync` + `ENOENT` catch.
- **Double `readData()` eliminated** — POST /api/orders now uses a single data read for both price validation and order write.
- **`useMemo` import added** to App.jsx.

### Security Fixes
- **Server-generated order IDs** — Client-supplied `id` field on POST /api/orders is now ignored; server generates `TOCS-{base36}-{hex4}` format.
- **Stripe payment gate** — Orders with `payment: "stripe"` rejected (400) if Stripe is not configured; bank/payid validated against `paymentMethods` flags.
- **Dead status strings removed from frontend** — `Mark Paid` button condition simplified from 4 dead status checks to just `"Pending Payment"`.
- **`orderCategory` dep fix** — Added `orderCategory` to `useEffect` dependency array fixing stale closure bug.

### Demo / Shadow Environment
- **Environment-variable driven multi-instance** — `DATA_FILE`, `CONFIG_FILE`, `UPLOADS_DIR`, `PORT`, `DEMO_MODE` env vars allow running production and demo instances from the same codebase.
- **`DEMO_SEED_DATA`** — 2 strata plans (SP10001 Harbour View, SP10002 Parkside Gardens) with 7 pre-seeded orders covering all order statuses.
- **`DEMO_DEFAULT_CONFIG`** — Demo admin credentials (`demo@tocs.co / Demo@1234`), demo payment details, no SMTP.
- **Auto-seed on first launch** — Demo mode writes seed data and config at startup if the files don't exist.
- **`/api/demo/reset` endpoint** — Resets both data and config to seed state, clears all sessions. Returns 403 in production mode.
- **`demoMode` in `/api/config/public`** — Frontend reads this flag to show/hide the demo banner.
- **Demo banner in App.jsx** — Yellow top bar displayed when `pubConfig.demoMode === true`, showing credentials and a "Reset Demo" button that calls the reset endpoint and reloads the page.
- **Startup banner** — Shows `Mode: DEMO 🔄 / Production`, `Data` file, and `Config` file paths.
- **`npm run demo` script** — `DATA_FILE=demo-data.json CONFIG_FILE=demo-config.json UPLOADS_DIR=uploads-demo PORT=3001 DEMO_MODE=true node server.js`.

---

## 2026-03-26 — Admin E2E Round 7: Config Parity, Plan Validation & Data Migration

### P2 Security / Crash Fixes

- **BUG-07-01: `paymentMethods` silently ignored on `POST /api/config/settings`** — Added `paymentMethods` handling; `bankEnabled`/`payidEnabled` booleans now persisted. `GET /api/config/settings` now returns `paymentMethods` object.
- **BUG-07-02: String `secondaryPrice` (e.g. `"99"`) stored in catalog → `toFixed()` crash in all email builders** — Plan validation now requires `secondaryPrice` to be a finite non-negative number. Order item price assignment now coerces both `price` and `secondaryPrice` through `Number()`.

### P3 Fixes

- **BUG-07-03: Products without an `id` field accepted silently into plan catalog** — Plan validation now requires every product to have a non-empty string `id`.
- **BUG-07-04: `logo` field returned by `GET /api/config/public` but unsettable** — `POST /api/config/settings` now accepts a `logo` string and persists it; `GET /api/config/settings` returns the current logo value.

### P4 Fixes

- **BUG-07-05: 84 legacy orders missing `status` field** — `readData()` now back-fills missing `status` as `"Pending Payment"` on every read (non-destructive migration).
- **BUG-07-06: `change-credentials` accepted new password identical to current** — Now returns 400 `"New password must differ from the current password."`.

---

## 2026-03-25 — Admin E2E Round 6: Admin Hardening, Shipping Total & Data Leaks

### P2 Security / Data Integrity Fixes

- **BUG-01: CRLF injected into admin `username` via add-admin** — Username now stripped of control chars (`\x00–\x1f`) before storage.
- **BUG-04: String product price (e.g. `"free"`) passed plan validation → NaN → $0 order** — Plan product validation now requires `typeof price === "number"` and `Number.isFinite(price)`.
- **BUG-05: `managerAdminCharge` exposed in unauthenticated `GET /api/data`** — Public response now strips `managerAdminCharge` from all plan products.
- **BUG-06: `selectedShipping.price` not included in `order.total`** — Total now sums item prices plus `selectedShipping.price`; shipping cost also re-validated server-side as non-negative.
- **BUG-07: `managerAdminCharge` returned to customer in order placement response** — `POST /api/orders` response now strips `managerAdminCharge` from item objects before returning to caller.
- **BUG-08: CRLF accepted in `paymentDetails` fields on config save** — `stripCRLF()` now applied to all `paymentDetails` string values.

### P3 Fixes

- **BUG-02: No max length on admin username** — `add-admin` now rejects usernames longer than 200 characters.
- **BUG-03: Negative `managerAdminCharge` accepted in plan products** — Plan product validation now rejects non-numeric or negative `managerAdminCharge`.
- **BUG-09: No upper cap on `item.qty`** — `qty` now capped at 100 per item.

---

## 2026-03-25 — Admin E2E Round 5: Field Whitelisting, Config Hardening & Parity

### P2 Security Fixes

- **BUG-01: `selectedShipping` stored verbatim including `__proto__` injection** — Now whitelisted to `{type, price}` only; `price` cast to non-negative number.
- **BUG-02: `items[]` used `...item` spread, persisting arbitrary client fields** — Replaced with explicit whitelist: `productId`, `lotId`, `lotNumber`, `planName`, `ocName`, `productName`, `ocId`, `qty` only; `price` and `managerAdminCharge` overridden from server catalog.
- **BUG-04: CRLF accepted in `emailTemplate` fields (header injection risk)** — `POST /api/config/settings` now strips `\r\n` from all email template string values via `stripCRLF()`.
- **BUG-05: CRLF accepted in `smtp.host` / `smtp.user`** — Both fields stripped of CRLF on save.
- **BUG-06: `adminNotificationIntro` rendered as raw HTML in admin notification email** — Now wrapped with `esc()` in `buildOrderEmailHtml`.

### P3 Fixes

- **BUG-03: New orders stored without `status` field** — Orders now created with `"Pending Payment"` (bank/payid/invoice) or `"Processing"` (stripe/card).
- **BUG-07: `smtp.pass` returned in plaintext in GET `/api/config/settings`** — Now masked as `"••••••••"` when set; POST handler ignores the placeholder on save.
- **BUG-08: Hardcoded default `adminNotificationSubject` still contained `{total}`** — Both occurrences updated to `"New Order — {orderType} #{orderId}"`.
- **BUG-09: Local server `/api/config/public` missing `bankEnabled`, `payidEnabled`, `stripeEnabled`, `logo`** — Local server now returns identical shape to Vercel `api/config/public.js`; `Cache-Control: no-store` header added.

### P4 Fixes

- **BUG-10: No length cap on `contactInfo.name` / `companyName`** — Now enforced at 200 chars each.
- **BUG-11: `qty` stored on items but not used in total (keys/fob orders)** — Non-perOC items now priced as `product.price × qty`; `qty` normalised to a positive integer in the item whitelist.
- **BUG-12: `smtp.host` accepted internal IPs / CRLF (SSRF vector)** — CRLF stripped from `smtp.host` on save (full hostname validation deferred).

---

## 2026-03-25 — Admin E2E Round 4: Order Integrity, Input Validation & XSS

### P2 Security Fixes

- **BUG-01: Order with missing/invalid `planId` bypassed all price enforcement** — `POST /api/orders` now requires `planId` to match a known plan; returns 400 `"A valid planId is required."` if absent or unrecognised.
- **BUG-02: Unknown `productId` bypassed item price enforcement** — Each item's `productId` is now validated against the plan catalog; returns 400 `"Unknown productId: ..."` rather than silently accepting the client-supplied price.

### P3 Functional / Security Fixes

- **BUG-03: Dead `/api/admin` route returned 405 for all requests** — Removed the stale entry from `knownRoutes`; the endpoint has no handler and all credential/admin actions are correctly at `POST /api/auth`.
- **BUG-04: `contactInfo.email` accepted malformed values including CRLF** — Same regex used for `cfg.orderEmail` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) now applied to the customer email at order placement.
- **BUG-05: CRLF and control characters accepted in `lotNumber`, `planName`, `ocName`, `productName`, `contactInfo` fields** — A `stripCtrl()` helper strips `\x00–\x1f` and `\x7f` from all string fields before they are stored or substituted into email subjects.
- **BUG-06: Lots without an `id` field silently dropped; import returned `{"ok":true,"count":0}`** — `POST /api/lots/import` now validates every lot object has a non-empty `id`; returns 400 `"Each lot must have a non-empty id field."`.
- **BUG-08: Admin `message` in certificate email rendered as raw HTML (XSS)** — `buildCertEmailHtml` now wraps `message` with `esc()` before inserting into the HTML body.

### P3 UX Fix

- **BUG-07: `POST /api/plans` with a flat array returned misleading `"Invalid plans."` error** — Error message updated to `'Body must be {"plans": [...]}'`.

---

## 2026-03-25 — Manager Admin Charge for Keys/Fob Products

### New Feature

- **Manager Admin Charge field on Keys/Fob products** — When setting up a Keys/Fobs/Remotes product for a building, admins can now enter a "Manager Admin Charge (AUD)" amount. This field is:
  - Only visible in the product add/edit modal when the category is "Keys / Fobs / Remotes"
  - Not shown to applicants at any point in the order flow
  - Stored in the strata plan's product record in `data.json`
  - Snapshotted onto each order item (`item.managerAdminCharge`) at order creation time, taken from the plan catalog server-side (tamper-proof)
  - Exported as a "Manager Admin Charge (AUD)" column in the admin CSV export — calculated as the sum of each item's charge multiplied by quantity; blank if zero

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
