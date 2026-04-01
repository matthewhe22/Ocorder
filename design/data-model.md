# Design — Data Model (As-Built)

**Feature area:** Redis persistence layer
**Status:** Implemented
**Last updated:** 2026-03-30

---

## Overview

All application data is persisted in Redis under two primary keys (`tocs:data` and `tocs:config`) plus per-order authority document keys. The Redis client is a singleton reused across warm serverless function invocations.

---

## Redis Key Structure

| Key | Type | Description |
|---|---|---|
| `tocs:data` | String (JSON) | All strata plans, lots, products, owner corporations, and all orders |
| `tocs:config` | String (JSON) | Admin credentials, SMTP, SharePoint, payment details, email templates, branding |
| `tocs:authority:<orderId>` | String (JSON) | Authority document for a single order (base64 data + metadata) |

All values are stored as `JSON.stringify`-serialised objects. There are no Redis TTLs on any key; data persists indefinitely.

---

## `tocs:data` Schema

```
{
  strataPlans: StrataPlan[],
  orders: Order[]
}
```

### `StrataPlan`

```
{
  id: string,                    // e.g. "SP12345" — immutable after creation
  name: string,                  // Display name, e.g. "Harbour View Residences"
  address: string,               // Street address
  active: boolean,               // Only active plans appear in customer search
  lots: Lot[],
  ownerCorps: { [ocId: string]: OwnerCorp },
  products: Product[],
  shippingOptions: ShippingOption[],   // May be empty array; added by migration if absent
  keysShipping: {                      // Added by migration if absent
    deliveryCost: number,        // Cost (AUD) for Standard Delivery
    expressCost: number          // Cost (AUD) for Express Delivery
  }
}
```

### `Lot`

```
{
  id: string,                    // e.g. "L1"; generated as "L" + Date.now()
  number: string,                // Display lot number, e.g. "Lot 1"
  level: string,                 // e.g. "Level 2"
  type: "Residential" | "Commercial" | "Parking" | "Storage" | "Mixed",
  ownerCorps: string[]           // Array of OC IDs, e.g. ["OC-A", "OC-B"]
}
```

### `OwnerCorp`

```
{
  name: string,                  // Display name
  levy: number                   // Annual levy amount (AUD); present in data but not shown in UI
}
```

Note: Owner corps are stored as a map object keyed by OC ID (e.g. `"OC-A"`), not as an array. The OC ID is immutable after creation.

### `Product`

```
{
  id: string,                    // e.g. "P1"; generated as "P" + Date.now() for new products
  name: string,
  description: string,
  price: number,                 // First OC price (AUD incl. GST)
  secondaryPrice?: number,       // Additional OC price (only when perOC: true)
  turnaround: string,            // e.g. "5 business days"
  category: "oc" | "keys",
  perOC: boolean,                // If true, added once per OC on the lot
  shippingCosts?: {              // Per-option shipping cost overrides (keyed by ShippingOption.id)
    [optionId: string]: number
  }
}
```

### `ShippingOption`

```
{
  id: string,                    // e.g. "ship-std"; generated as "ship-" + Date.now()
  name: string,                  // e.g. "Standard Post"
  cost: number                   // Cost (AUD)
}
```

---

## `tocs:config` Schema

```
{
  user: string,                  // Admin username (email)
  pass: string,                  // Admin password (plaintext; HMAC key derived from this)
  orderEmail: string,            // Recipient address for order notifications
  logo: string,                  // Base64 data URL or external URL; empty string if not set
  smtp: {
    host: string,
    port: number,
    user: string,
    pass: string                 // Masked as "••••••••" in GET /api/config/settings responses
  },
  sharepoint: {
    tenantId: string,
    clientId: string,
    clientSecret: string,        // Masked as "••••••••" in GET responses
    siteId: string,
    folderPath: string           // Base folder path, e.g. "Top Owners Corporation Solution/ORDER DATABASE"
  },
  paymentDetails: {
    accountName: string,
    bsb: string,
    accountNumber: string,
    payid: string
  },
  emailTemplate: {
    certificateSubject: string,  // Supports {orderId} placeholder
    certificateGreeting: string, // Supports {name}, {lotNumber}, {address} placeholders
    footer: string
  }
}
```

Config is deep-merged with `DEFAULT_CONFIG` on every read so missing fields are always filled from env var fallbacks. The precedence order is: stored Redis value > env var > hardcoded default.

---

## `tocs:authority:<orderId>` Schema

```
{
  data: string,          // Base64-encoded file content
  filename: string,      // Original filename
  contentType: string    // MIME type, e.g. "application/pdf", "image/jpeg"
}
```

This key is written at order placement and serves as a fallback when SharePoint is not configured or has not yet been uploaded. There is no TTL; documents remain until manually cleaned up.

---

## `Order` Schema (within `tocs:data.orders`)

Orders are stored newest-first (prepended with `unshift`).

```
{
  id: string,                    // e.g. "TOCS-LVK2A-XYZ" (format: "TOCS-" + Date.now().toString(36).toUpperCase() + "-" + 3 random chars)
  date: string,                  // ISO 8601 timestamp, e.g. "2026-03-30T08:00:00.000Z"
  orderCategory: "oc" | "keys",
  planId: string,                // Strata plan ID
  lotId: string,
  status: OrderStatus,
  payment: "bank" | "payid" | "stripe" | "invoice",
  total: number,                 // AUD incl. GST
  selectedShipping?: {           // OC orders with shipping options
    id: string,
    name: string,
    cost: number
  },
  items: OrderItem[],
  contactInfo: ContactInfo,
  lotAuthFile?: string,          // Original authority document filename (set at placement)
  lotAuthorityUrl?: string,      // SharePoint view URL (set after successful SP upload)
  summaryUrl?: string,           // SharePoint URL for order-summary.pdf
  receiptUrl?: string,           // SharePoint URL for payment-receipt.pdf (Stripe orders only)
  certificateUrl?: string,       // SharePoint URL for certificate (set after send-certificate)
  invoiceUrl?: string,           // SharePoint URL for invoice (set after send-invoice)
  stripeSessionId?: string,      // Stripe Checkout Session ID (Stripe orders only)
  cancelReason?: string,         // Set when status = "Cancelled"
  auditLog: AuditEntry[]
}
```

### `OrderStatus` (valid values)

```
"Pending"
"Processing"
"Awaiting Payment"
"Awaiting Stripe Payment"
"Paid"
"Issued"
"Cancelled"
"Invoice to be issued"
"Invoice sent, awaiting payment"
```

### `OrderItem`

```
{
  productId: string,
  productName: string,
  planId: string,
  planName: string,
  lotId: string,
  lotNumber: string,
  ocId?: string,                 // OC this item is billed to (OC certificate products only)
  ocName?: string,
  turnaround: string,
  price: number,                 // Line price (AUD)
  qty?: number,                  // Quantity (keys orders only; defaults to 1)
  isAdditionalOC?: boolean       // True when billed at secondaryPrice
}
```

### `ContactInfo`

```
{
  name: string,                  // Full name
  email: string,
  phone: string,                 // Australian phone; spaces stripped before storage
  applicantType: "owner" | "agent",
  ownerName?: string,            // Required when applicantType = "owner"
  companyName?: string,          // Optional when applicantType = "agent"
  shippingAddress?: {
    street: string,
    suburb: string,
    state: string,
    postcode: string
  }
}
```

### `AuditEntry`

```
{
  ts: string,       // ISO 8601 timestamp
  action: string,   // Human-readable action description
  note?: string     // Optional detail (email address, URL, error message, etc.)
}
```

---

## In-Place Migrations

`readData()` in `api/_lib/store.js` performs the following migrations on every read:

| Migration | Trigger condition | Action |
|---|---|---|
| Add missing products | A plan in DEFAULT_DATA has products whose IDs are absent from the stored plan | Appends missing products to the plan's products array |
| Add `shippingOptions` | A plan in DEFAULT_DATA has no `shippingOptions` array | Sets `shippingOptions: []` |
| Add `keysShipping` | Any stored plan (including custom plans not in DEFAULT_DATA) has no `keysShipping` | Sets `keysShipping: { deliveryCost: 0, expressCost: 0 }` |

When any migration runs, the mutated data object is written back to Redis with `kvSet(DATA_KEY, d)` (best-effort; errors are logged but not rethrown).

---

## Default Seed Data

When `tocs:data` is absent from Redis, `DEFAULT_DATA` is returned. It contains one strata plan (`SP12345`, "Harbour View Residences") with:
- 7 lots (L1–L7; residential, commercial, and parking)
- 2 owner corporations (OC-A, OC-B)
- 6 OC products (P1–P6) and 3 Keys products (K1–K3)
- 2 shipping options (Standard Post $10, Express Post $20)
- `active: true`

When `tocs:config` is absent from Redis, `DEFAULT_CONFIG` is returned with env-var fallback values for all fields.

---

## Schema Migration Required

No — the data model is fully backward-compatible through in-place Redis migrations on every read. No offline migration script is needed.

---

## E2E Test Scenarios

These are data-layer concerns exercised through API-level tests rather than true E2E:

- Placing an order persists it to `tocs:data.orders[0]` with correct schema fields.
- Authority document appears under `tocs:authority:<orderId>` after order placement.
- Status update via `PUT /api/orders/<id>/status` appends to `auditLog` and sets `cancelReason` when status is "Cancelled".
- `readData()` on a Redis instance with a pre-migration plan returns the plan with `shippingOptions` and `keysShipping` added.
