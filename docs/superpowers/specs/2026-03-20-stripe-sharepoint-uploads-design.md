# Design: Stripe Order SharePoint Uploads + Payment Receipt PDF

**Date:** 2026-03-20
**Status:** Approved

---

## Problem

Non-Stripe orders upload the authority document and order summary PDF to SharePoint at the time the order is placed. Stripe orders skip all SharePoint activity because the early `return res.status(200).json({ redirect: session.url })` exits before the SP upload block.

Additionally, there is no payment receipt document generated for Stripe orders — no proof of card payment is saved anywhere beyond the Stripe dashboard.

---

## Goals

1. After a Stripe payment is confirmed, upload the authority document to SharePoint.
2. After a Stripe payment is confirmed, upload the order summary PDF to SharePoint.
3. After a Stripe payment is confirmed, generate and upload a simple payment receipt PDF to SharePoint.
4. Do not block the customer-facing response — all uploads are fire-and-forget.
5. Redis remains the guaranteed fallback for the authority document (no change to existing Redis save).

---

## Out of Scope

- Uploading to SharePoint at Stripe order creation time (before payment) — wasted upload for abandoned checkouts.
- Modifying the non-Stripe order flow — it already works correctly.
- Adding new Vercel serverless function files (Hobby plan is at the 12-function limit).

---

## Architecture

### Upload Trigger

All SharePoint activity for Stripe orders is triggered inside `stripe-confirm` (`api/orders/[id]/[action].js`), after the order status is set to "Paid". The SP upload IIFE is started (not awaited) at T=0, then emails are awaited synchronously, then the response is returned, and finally `await spPromise` is called to collect the remaining SP window. This mirrors the fire-and-forget pattern used in `api/orders/index.js` for non-Stripe orders. "Fire-and-forget" here means the IIFE runs concurrently with emails — not that it is never awaited.

**SP guard condition** — mirror the `orders/index.js` non-Stripe pattern exactly (not `send-certificate`, which uses a simpler subFolder):
```js
const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);
```
Both `SHAREPOINT_ENABLED` (env-var flag) and the runtime Redis-config path are checked. `spConfig` is read from `cfg.sharepoint || {}`. If `spEnabled` is false, the SP block is skipped in its entirety — no IIFE is started, no audit entries are added.

### Upload Flow (stripe-confirm)

```
stripe-confirm called
  │
  ├─ Verify Stripe session (server-side)
  ├─ Mark order status → "Paid" in Redis
  │
  ├─ START spPromise IIFE (fire-and-forget, concurrently with emails)
  │   │   NOTE: authDoc already fetched for email attachment — reuse it (no second readAuthority call)
  │   │   NOTE: use confirmedOrder (status already "Paid"), not original order object
  │   │   NOTE: cfg already fetched before IIFE starts — pass cfg.sharepoint as spConfig
  │   ├─ [reuse authDoc from outer scope — do NOT call readAuthority again]
  │   ├─ generateOrderPdf(confirmedOrder)       ← reuse existing generator; confirmedOrder.status = "Paid"
  │   ├─ generateReceiptPdf(confirmedOrder, stripeSessionId)  ← use already-destructured stripeSessionId var
  │   ├─ Promise.allSettled([
  │   │     authority?.data
  │   │       ? uploadToSharePoint(authority doc)  ← skip silently if null
  │   │       : Promise.resolve(null),
  │   │     uploadToSharePoint(order summary PDF),
  │   │     uploadToSharePoint(payment receipt PDF)
  │   │  ])
  │   └─ readData() fresh → find order → persist SP URLs + audit log → writeData()
  │
  ├─ Send emails (admin + customer) — synchronous, ~7s
  ├─ res.status(200).json({ ok: true })
  └─ await spPromise  ← ~1–2s remaining after emails
```

**`subFolder` value for SP uploads** — reconstructed inside `stripe-confirm` using the same logic as `orders/index.js`. Default category is `"OC-Certificates"` for all order types that are not `"keys"` (including `undefined`):
```js
const categoryFolder = order.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
const buildingName   = (order.items?.[0]?.planName || "Unknown Building")
  .replace(/[\\/:*?"<>|]/g, "-").trim();
const spSubFolder    = `${buildingName}/${categoryFolder}/${order.id}`;
```
This value is passed as the `subFolder` argument to `uploadToSharePoint(filename, contentType, base64Data, spConfig, subFolder)`.

**Buffer → base64 conversion** — `uploadToSharePoint` expects `base64Data` as a base64-encoded string, not a raw Buffer. The PDF generators return `Buffer` objects. Convert before uploading:
```js
const summaryBuf  = await generateOrderPdf(order);
const receiptBuf  = await generateReceiptPdf(order, sessionId);
const summaryB64  = summaryBuf.toString("base64");
const receiptB64  = receiptBuf.toString("base64");
```
The authority doc from `readAuthority(id)` returns `{ data, filename, contentType }` where `data` is already a base64 string — no conversion needed.

**Null / error authority doc handling** — `authDoc` is the value already fetched from Redis for the email attachment. It is accessed in the IIFE via closure — no second Redis read. If `authDoc` is `null` (no authority doc was uploaded, or `readAuthority` threw and was caught with `.catch(() => null)`), the authority SP upload is skipped silently. No audit entry is added for it. Order summary PDF and receipt PDF still upload normally.

**`cfg` prerequisite** — `cfg` (including `cfg.sharepoint`) must be fetched via `readConfig()` before the SP IIFE is launched. In `stripe-confirm` this is already the case — `readConfig()` runs at the top of the handler. The IIFE captures `cfg` via closure.

**Stale closure + Redis write** — the IIFE starts while `stripe-confirm` is still processing. By the time SP uploads complete (~2–3s later), `writeData` has already been called to persist the "Paid" status. To avoid overwriting that write with a stale `data` snapshot, the IIFE must call `readData()` fresh before persisting SP URLs:
```js
const freshData = await readData();
const oi = freshData.orders.find(o => o.id === id);
if (oi) {
  if (authUrl)    { oi.lotAuthorityUrl = authUrl;  oi.auditLog.push(...); }
  if (summaryUrl) { oi.summaryUrl = summaryUrl;    oi.auditLog.push(...); }
  if (receiptUrl) { oi.receiptUrl = receiptUrl;    oi.auditLog.push(...); }
}
await writeData(freshData);
```

### SharePoint Folder Structure (unchanged)

```
{folderPath}/{buildingName}/{OC-Certificates|Keys-Fobs}/{orderId}/
  authority-{originalFilename}   ← re-uploaded from Redis
  order-summary.pdf              ← same as non-Stripe orders
  payment-receipt.pdf            ← new, Stripe orders only
```

---

## New Function: `generateReceiptPdf(order, sessionId)`

**Location:** `api/_lib/pdf.js` (new export alongside existing `generateOrderPdf`)

**Output:** Single A4 page, portrait, TOCS branding consistent with order summary.

**Content:**
- Header: "TOCS Owner Corporation Services — Payment Receipt"
- Receipt reference: `order.id`
- Date paid: `new Date()` at receipt-generation time formatted as `DD MMM YYYY HH:mm` using `Australia/Sydney` locale (handles AEST/AEDT DST automatically). Note: this reflects when `stripe-confirm` ran, which may be seconds after actual card charge. Exact Stripe charge timestamp is out of scope for v1.
- Amount paid: `$X.XX AUD`
- Payment method: `Stripe (Card)`
- Stripe Session ID: `cs_live_...`
- Customer name and email
- Divider
- Footer: standard TOCS footer (same as order summary)

**Signature** (plain JS, matching existing `pdf.js` style — uses `new Promise` with pdfkit's pipe-to-buffer pattern, same as `generateOrderPdf`):
```js
/** @returns {Promise<Buffer>} */
export function generateReceiptPdf(order, sessionId)
```

The `sessionId` parameter should be the `stripeSessionId` variable already destructured at the top of `stripe-confirm` (`const { stripeSessionId } = order`). Do not use `order.stripeSessionId` — use the already-destructured variable. Zero-total Stripe orders are already blocked at order creation (`total > 0` is enforced), so `order.total` is always a positive number on the receipt.

---

## Order Object Changes

Two new optional fields added to the order record in Redis:

| Field | Type | Description |
|-------|------|-------------|
| `order.receiptUrl` | `string \| undefined` | SharePoint URL of `payment-receipt.pdf` |
| `order.summaryUrl` | `string \| undefined` | SharePoint URL of `order-summary.pdf`. Existing field shared with non-Stripe orders; now also set for Stripe orders when SP upload succeeds. |

`order.lotAuthorityUrl` already exists on non-Stripe orders; it is now also set for Stripe orders when SP upload succeeds.

---

## Audit Log Entries (stripe-confirm)

| Condition | Entry |
|-----------|-------|
| Authority doc SP upload succeeds | `"Authority doc saved to SharePoint"` + URL |
| Authority doc SP upload fails | `"Authority doc SP upload failed"` + "See Vercel logs" |
| Order summary SP upload succeeds | `"Order summary saved to SharePoint"` + URL |
| Order summary SP upload fails | `"Order summary SP upload failed"` + "See Vercel logs" |
| Payment receipt SP upload succeeds | `"Payment receipt saved to SharePoint"` + URL |
| Payment receipt SP upload fails | `"Payment receipt SP upload failed"` + "See Vercel logs" |
| No SP config present | No entries added (SP block skipped entirely) |

---

## Timeout Budget (Vercel Hobby — 10s limit)

| Operation | Duration | Notes |
|-----------|----------|-------|
| Stripe session verify | ~0.3s | Already done before SP block |
| Azure AD token fetch | ~0.5–1s | Internal to each `uploadToSharePoint` call; `ClientSecretCredential` may cache the token across the 3 parallel calls |
| Redis read (authority) | ~0.1s | Inside SP IIFE |
| PDF generation (×2) | ~0.2s | CPU-bound, very fast |
| SP uploads (×3 parallel) | ~2–9s per upload | Each `uploadToSharePoint` call makes TWO sequential Graph API requests internally: PUT (file upload) then POST (createLink). Each has its own 8s AbortController. Real-world: PUT ~1–2s, createLink ~1s. Abort ceiling per upload: 16s, but typical is ~2–3s. |
| Emails (parallel) | ~6.6s | SMTP2GO port 2525 |
| **Total (emails + SP overlap)** | **~7–9s** | SP IIFE starts at T=0 concurrently with emails; response after emails (~7s); `await spPromise` runs in remaining window |

**SP IIFE critical path** (sequential operations inside the IIFE before `Promise.allSettled` launches):
`0.1s (Redis) + 0.2s (PDFs) + 1s (token) = ~1.3s before uploads start`

Then `Promise.allSettled` runs 3 uploads in parallel. Typical: ~2–3s per upload. Worst-case abort: 16s per upload, but since they run in parallel the allSettled resolves in `max(upload1, upload2, upload3)` time.

Real-world p99 total: `1.3s + 3s (typical parallel uploads) = ~4.3s` — well within the window that remains after emails send at T=0 in parallel. The theoretical abort-ceiling worst case (`1.3s + 16s = 17.3s`) would exceed the Vercel timeout, but this represents all three uploads hitting both their internal AbortController limits simultaneously — an extreme edge case. The 8s ceiling is a safety net, not an expected duration; real Graph API PUT and createLink calls complete in 1–3s. This risk is the same for non-Stripe orders and is accepted as a known limitation.

SP uploads start at T=0 of the SP IIFE. Emails send while SP runs. Response is returned after emails (~7s). `await spPromise` occupies at most ~2–3s post-response. This mirrors the proven non-Stripe pattern.

---

## Files Changed

| File | Change |
|------|--------|
| `api/orders/[id]/[action].js` | Add import line: `import { generateOrderPdf, generateReceiptPdf } from "../../_lib/pdf.js";` — this import does not yet exist in the file. Also add fire-and-forget SP upload block in `stripe-confirm` case. Note: `readAuthority`, `uploadToSharePoint`, `SHAREPOINT_ENABLED`, `readData`, `writeData` are already imported. |
| `api/_lib/pdf.js` | Add `generateReceiptPdf(order, sessionId)` export |

---

## Files Not Changed

| File | Reason |
|------|--------|
| `api/orders/index.js` | Redis authority save for Stripe already added; no SP change needed |
| `api/_lib/store.js` | No schema changes required |
| `api/_lib/sharepoint.js` | `uploadToSharePoint()` is already generic; no changes needed |
| `api/_lib/email.js` | No email content changes for this feature |
| `src/App.jsx` | No frontend changes required |

---

## Validation Criteria

1. Place a Stripe order with an authority doc attached → complete payment → verify SharePoint subfolder contains `authority-{filename}`, `order-summary.pdf`, `payment-receipt.pdf`.
2. Place a Stripe order with **no** authority doc → complete payment → verify `order-summary.pdf` and `payment-receipt.pdf` uploaded, no authority file.
3. Place a Stripe order and **cancel** payment → verify no SharePoint uploads occur and no upload audit entries appear.
4. Verify admin order detail shows `lotAuthorityUrl`, `summaryUrl`, `receiptUrl` (via authority download button and audit log).
5. Verify Vercel function completes within 10s (check Vercel logs for duration).
6. Place a non-Stripe order → verify existing behaviour unchanged.
