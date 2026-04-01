# Design — API Reference (As-Built)

**Feature area:** All Vercel Serverless Function endpoints
**Status:** Implemented
**Last updated:** 2026-03-30

---

## Overview

All API endpoints are Vercel Serverless Functions located in `api/`. Each file is an independent function handler. The shared library `api/_lib/store.js` provides Redis access, token validation, and CORS headers.

**Base URL:** All paths are relative to the deployment root (e.g. `https://occorder.vercel.app`).

**CORS:** All endpoints set `Access-Control-Allow-Origin: *` and handle `OPTIONS` preflight requests.

**Authentication:** Admin endpoints require `Authorization: Bearer <token>` where the token is an HMAC-SHA256 signed stateless session token with 8-hour expiry. Public endpoints require no authentication.

---

## Auth Endpoints

### `POST /api/auth/login`

**Auth required:** No

**Request body:**
```json
{
  "user": "string",
  "pass": "string"
}
```

**Response 200:**
```json
{
  "token": "string",
  "user": "string"
}
```

**Response 400:** `{ "error": "Username and password are required." }`
**Response 401:** `{ "error": "Incorrect username or password." }`
**Response 500:** `{ "error": "Server error: <message>" }`

---

### `POST /api/auth/change-credentials`

**Auth required:** Yes (Bearer token)

**Request body:**
```json
{
  "currentPass": "string",
  "newUser": "string",     // optional; trimmed before storage
  "newPass": "string"      // optional; minimum 8 characters
}
```

**Response 200:** `{ "ok": true }`
**Response 400:** `{ "error": "Current password is incorrect." }` or `{ "error": "New password must be at least 8 characters." }`
**Response 401:** `{ "error": "Not authenticated." }`

**Side effect:** Changing `cfg.pass` changes the HMAC signing key, invalidating all existing session tokens.

---

## Config Endpoints

### `GET /api/config/public`

**Auth required:** No

**Response 200:**
```json
{
  "logo": "string",             // base64 data URL or external URL; empty string if not set
  "stripeEnabled": boolean,     // true when STRIPE_SECRET_KEY env var is set
  "paymentDetails": {
    "accountName": "string",
    "bsb": "string",
    "accountNumber": "string",
    "payid": "string"
  }
}
```

---

### `GET /api/config/settings`

**Auth required:** Yes (Bearer token)

**Response 200:**
```json
{
  "orderEmail": "string",
  "logo": "string",
  "smtp": {
    "host": "string",
    "port": number,
    "user": "string",
    "pass": "string"            // "••••••••" if a password is stored; empty string if not
  },
  "paymentDetails": {
    "accountName": "string",
    "bsb": "string",
    "accountNumber": "string",
    "payid": "string"
  },
  "emailTemplate": {
    "certificateSubject": "string",
    "certificateGreeting": "string",
    "footer": "string"
  },
  "sharepoint": {
    "tenantId": "string",
    "clientId": "string",
    "clientSecret": "string",   // "••••••••" if stored; empty string if not
    "siteId": "string",
    "folderPath": "string"
  }
}
```

**Response 401:** `{ "error": "Not authenticated." }`

---

### `POST /api/config/settings`

**Auth required:** Yes (Bearer token)

**Request body:** Any subset of the fields returned by GET. All fields are optional — only provided fields are updated.

```json
{
  "orderEmail": "string",
  "logo": "string",
  "smtp": {
    "host": "string",
    "port": number,
    "user": "string",
    "pass": "string"            // Ignored if value is "••••••••"
  },
  "paymentDetails": {
    "accountName": "string",
    "bsb": "string",
    "accountNumber": "string",
    "payid": "string"
  },
  "emailTemplate": {
    "certificateSubject": "string",
    "certificateGreeting": "string",
    "footer": "string"
  },
  "sharepoint": {
    "tenantId": "string",
    "clientId": "string",
    "clientSecret": "string",   // Ignored if value is "••••••••"
    "siteId": "string",
    "folderPath": "string"
  }
}
```

**Response 200:** `{ "ok": true }`
**Response 401:** `{ "error": "Not authenticated." }`
**Response 500:** `{ "error": "Failed to save settings: <message>" }`

---

### `POST /api/config/test-email`

**Auth required:** Yes (Bearer token)

Sends a test email using the provided SMTP settings (or stored settings if not provided). Does not save anything to Redis.

**Request body:** (all optional; falls back to stored config if omitted)
```json
{
  "smtp": {
    "host": "string",
    "port": number,
    "user": "string",
    "pass": "string"
  },
  "orderEmail": "string"
}
```

**Response 200:** `{ "ok": true, "sentTo": "string" }`
**Response 400:** `{ "error": "SMTP credentials incomplete. ..." }`
**Response 401:** `{ "error": "Not authenticated." }`
**Response 500:** `{ "error": "<SMTP error message>" }`

---

### `POST /api/config/test-sharepoint`

**Auth required:** Yes (Bearer token via `Authorization: Bearer <token>` header)

Performs three sequential SharePoint credential checks using the stored config. Does not accept credentials in the request body.

**Request body:** None

**Response 200 (success):**
```json
{
  "ok": true,
  "siteName": "string",
  "siteWebUrl": "string",
  "folderPath": "string",
  "message": "Credentials valid — site accessible and drive readable"
}
```

**Response 200 (failure — always 200 even on error):**
```json
{
  "ok": false,
  "step": "config" | "auth" | "site_read" | "drive_read" | "graph_call",
  "error": "string",
  "httpStatus": number        // Only present for HTTP-level failures
}
```

Note: This endpoint always returns HTTP 200. Check `ok` in the response body to determine success.

---

## Data Endpoint

### `GET /api/data`

**Auth required:** Partially — strata plans are always returned; orders array is only populated when a valid Bearer token is provided.

**Query params:** `?token=<token>` (alternative to Authorization header; both accepted)

**Response 200:**
```json
{
  "strataPlans": "StrataPlan[]",    // Always present; see data-model.md for shape
  "orders": "Order[]"              // Empty array for unauthenticated callers
}
```

---

## Plans Endpoint

### `POST /api/plans`

**Auth required:** Yes (Bearer token)

Replaces the entire `strataPlans` array in `tocs:data`. This is the single write path for all plan, lot, product, owner corporation, shipping option, and keys shipping mutations — the full array is always posted.

**Request body:**
```json
{
  "plans": "StrataPlan[]"
}
```

**Response 200:** `{ "ok": true }`
**Response 400:** `{ "error": "Invalid plans." }`
**Response 401:** `{ "error": "Not authenticated." }`

---

## Orders Endpoints

### `POST /api/orders`

**Auth required:** No (public endpoint)

Places a new order. Handles Stripe redirect, authority document storage, SharePoint uploads, and email notifications.

**Request body:**
```json
{
  "order": {
    "id": "string",
    "date": "string",               // ISO 8601
    "orderCategory": "oc" | "keys",
    "planId": "string",
    "lotId": "string",
    "status": "string",
    "payment": "bank" | "payid" | "stripe" | "invoice",
    "total": number,
    "selectedShipping": {           // Optional
      "id": "string",
      "name": "string",
      "cost": number
    },
    "items": "OrderItem[]",
    "contactInfo": "ContactInfo"
  },
  "lotAuthority": {                 // Optional
    "data": "string",               // Base64-encoded file content
    "filename": "string",
    "contentType": "string"
  }
}
```

**Response 200 (non-Stripe):**
```json
{
  "ok": true,
  "order": "Order",
  "emailSentTo": "string"
}
```

**Response 200 (Stripe):**
```json
{
  "id": "string",
  "redirect": "string"             // Stripe Checkout Session URL
}
```

**Response 400:** `{ "error": "Invalid order." }` or `{ "error": "Stripe is not configured..." }` or `{ "error": "Stripe cannot process a zero-value order..." }`
**Response 402:** Not used directly here; used by stripe-confirm.
**Response 405:** Method not allowed.
**Response 500:** `{ "error": "<message>" }`

---

### `GET /api/orders/export`

**Auth required:** Yes (Bearer token via Authorization header OR `?token=<token>` query param)

Downloads all orders as a CSV file.

**Response 200:** CSV file with `Content-Disposition: attachment; filename="tocs-orders-<date>.csv"` and `Content-Type: text/csv`.

**CSV columns:** Order ID, Date, Name, Email, Phone, Applicant Type, Owner Name, Company, Delivery Address, Shipping Method, Shipping Cost (AUD), Items, Total (AUD), Payment, Status.

**Response 401:** `{ "error": "Not authenticated." }`

---

### `GET /api/orders/:id/authority`

**Auth required:** Yes (Bearer token via Authorization header OR `?token=<token>` query param)

Returns the authority document for an order. Redirects to SharePoint URL if available; falls back to serving the file from Redis.

**Response 302:** Redirect to `order.lotAuthorityUrl` (SharePoint).
**Response 200:** Raw file bytes with appropriate `Content-Type` and `Content-Disposition` headers (Redis fallback).
**Response 401:** `{ "error": "Not authenticated." }`
**Response 404:** `{ "error": "Order not found." }` or `{ "error": "No authority document for this order." }` or `{ "error": "Document not found in storage." }`
**Response 503:** `{ "error": "Document storage is not connected..." }` or `{ "error": "Document storage unavailable: <message>" }`

---

### `PUT /api/orders/:id/status`

**Auth required:** Yes (Bearer token)

Updates an order's status and appends an audit log entry.

**Request body:**
```json
{
  "status": "string",           // Must be one of the valid status values
  "note": "string"              // Optional; set as cancelReason when status = "Cancelled"
}
```

**Valid status values:** `"Pending"`, `"Processing"`, `"Awaiting Payment"`, `"Awaiting Stripe Payment"`, `"Paid"`, `"Issued"`, `"Cancelled"`, `"Invoice to be issued"`, `"Invoice sent, awaiting payment"`

**Response 200:** `{ "ok": true }`
**Response 400:** `{ "error": "status is required." }` or `{ "error": "Invalid status: \"<value>\"." }`
**Response 401:** `{ "error": "Not authenticated." }`
**Response 404:** `{ "error": "Order not found." }`

---

### `POST /api/orders/:id/send-certificate`

**Auth required:** Yes (Bearer token)

Sends an OC certificate email to the customer. Optionally uploads the certificate to SharePoint. Sets order status to "Issued".

**Request body:**
```json
{
  "message": "string",          // Email body text (newlines converted to <br>)
  "attachment": {               // Optional
    "filename": "string",
    "data": "string",           // Base64-encoded file content
    "contentType": "string"
  }
}
```

**Response 200:** `{ "ok": true }`
**Response 400:** `{ "error": "SMTP not configured." }`
**Response 401:** `{ "error": "Not authenticated." }`
**Response 404:** `{ "error": "Order not found." }`
**Response 500:** `{ "error": "<SMTP error message>" }`

**Side effects:**
- Order status set to `"Issued"`.
- Audit log entry appended: `{ action: "Certificate issued", note: "Sent to: <email>" }`.
- If attachment provided and SharePoint configured: attachment uploaded; `order.certificateUrl` set; audit log entry appended.

---

### `POST /api/orders/:id/send-invoice`

**Auth required:** Yes (Bearer token)

Sends a Keys/Fobs invoice email to the customer. Optionally uploads the invoice to SharePoint. Sets order status to "Invoice sent, awaiting payment".

**Request body:**
```json
{
  "message": "string",          // Email body text
  "attachment": {               // Optional
    "filename": "string",
    "data": "string",           // Base64-encoded
    "contentType": "string"
  }
}
```

**Response 200:** `{ "ok": true }`
**Response 400:** `{ "error": "SMTP not configured." }`
**Response 401:** `{ "error": "Not authenticated." }`
**Response 404:** `{ "error": "Order not found." }`
**Response 500:** `{ "error": "<SMTP error message>" }`

**Side effects:**
- Order status set to `"Invoice sent, awaiting payment"`.
- Audit log entry appended: `{ action: "Invoice sent", note: "Sent to: <email>" }`.
- If attachment provided and SharePoint configured: attachment uploaded; `order.invoiceUrl` set; audit log entry appended.

---

### `POST /api/orders/:id/stripe-confirm`

**Auth required:** No (public endpoint)

Verifies Stripe payment and updates order status. Called by the frontend after Stripe redirects to `/complete?orderId=<id>&stripeOk=1`.

**Request body:** None (order ID comes from URL path)

**Response 200:** `{ "success": true, "order": Order }`
**Response 400:** `{ "error": "No Stripe session associated with this order." }` or `{ "error": "Payment verification failed." }`
**Response 402:** `{ "error": "Payment not completed.", "payment_status": "string" }`
**Response 404:** `{ "error": "Order not found." }`
**Response 500:** `{ "error": "Could not verify payment. Please contact support." }`
**Response 503:** `{ "error": "Stripe is not configured on this server." }`

**Side effects on success:**
- Order status set to `"Paid"`.
- Audit log entry appended: `{ action: "Payment confirmed via Stripe", note: "Session: <sessionId>" }`.
- Admin notification email sent.
- Customer confirmation email sent.
- SharePoint uploads started (parallel): authority doc, order-summary.pdf, payment-receipt.pdf.

**Idempotency:** If order status is already `"Paid"`, returns 200 immediately without re-processing.

---

### `DELETE /api/orders/:id/delete`

**Auth required:** Yes (Bearer token)

Permanently removes an order from Redis. No undo.

**Response 200:** `{ "ok": true, "deleted": "string" }`
**Response 401:** `{ "error": "Not authenticated." }`
**Response 404:** `{ "error": "Order not found." }`

---

### `POST /api/lots/import`

**Auth required:** Yes (Bearer token)

Replaces all lots for a specific plan.

**Request body:**
```json
{
  "planId": "string",
  "lots": "Lot[]"
}
```

**Response 200:** `{ "ok": true, "count": number }`
**Response 400:** `{ "error": "Invalid import data." }`
**Response 401:** `{ "error": "Not authenticated." }`
**Response 404:** `{ "error": "Plan not found." }`

---

## Error Handling

All endpoints handle `OPTIONS` preflight requests with HTTP 200. Unrecognised action values in the `[action].js` handler return `{ "error": "Unknown action." }` with HTTP 404.

Redis write failures in `kvSet` throw an error (not caught silently); callers receive HTTP 500 with the Redis error message. Redis read failures in `kvGet` return `null` and fall back to default data (no error propagated).

---

## Vercel Function Count

The project uses a merged `[id]/[action].js` handler pattern to stay within Vercel Hobby plan's 12-function limit. The merged handler covers 6 distinct actions: `authority`, `status`, `send-certificate`, `send-invoice`, `stripe-confirm`, and `delete`.

---

## Schema Migration Required

No — all endpoints work against the current Redis schema. In-place migrations in `readData()` handle backward-compatible upgrades automatically.

---

## E2E Test Scenarios

- `POST /api/auth/login` with valid credentials returns token; with invalid credentials returns 401.
- `GET /api/data` without token returns empty orders array; with token returns all orders.
- `POST /api/orders` with a valid order body saves to Redis and returns `ok: true`.
- `POST /api/orders` with `payment: "stripe"` returns `{ redirect }` pointing to Stripe.
- `POST /api/orders/:id/stripe-confirm` with a valid Stripe session ID and `payment_status: "paid"` updates status to "Paid".
- `POST /api/orders/:id/stripe-confirm` called twice for the same order (idempotency) returns 200 on second call without sending duplicate emails.
- `PUT /api/orders/:id/status` with `status: "Cancelled"` and `note: "..."` sets `cancelReason` on the order.
- `DELETE /api/orders/:id/delete` permanently removes the order; subsequent `GET /api/data` does not include it.
- `GET /api/orders/:id/authority` redirects to SharePoint URL when present; serves from Redis when no SharePoint URL.
