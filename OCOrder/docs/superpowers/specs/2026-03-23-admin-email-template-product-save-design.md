# Design: Admin Email Notification Template + Product Save Fix

**Date:** 2026-03-23
**Status:** Approved

---

## Overview

Three related improvements to the TOCS Order Portal:

1. Admin notification email subject now includes order type (OC Certificate / Keys/Fobs)
2. Admin notification email subject and intro text are configurable in the Settings tab
3. Product edit/save reliability fix — errors surface instead of being silently swallowed

---

## Section 1: Order Type in Admin Notification Subject

### Problem
The admin notification email subject for non-Stripe orders (`api/orders/index.js`) is hardcoded:
```
New Order #${order.id} — $${total} AUD
```
It gives no indication of what was ordered, requiring the admin to open the email to determine order type.

### Admin email flow — two separate emails, only one is in scope

There are two distinct admin notification emails:

1. **New-order notification** — sent in `api/orders/index.js` for bank/PayID orders only (Stripe orders
   return a redirect URL and skip this). Subject: `New Order #...`. **This is in scope.**

2. **Payment-confirmed notification** — sent in `api/orders/[id]/[action].js` (stripe-confirm action
   only) when Stripe payment is verified. Subject: `Payment Confirmed — Order #...` (line ~402).
   **This is explicitly OUT OF SCOPE.** The hardcoded subject at that line is intentionally preserved.

### Solution (applies to `api/orders/index.js` only)

Derive `orderType` from `order.orderCategory` at send time:
- `"oc"` → `"OC Certificate"`
- `"keys"` → `"Keys / Fobs"`
- anything else → `"Order"`

The subject is rendered from the configured `adminNotificationSubject` template (see Section 2)
using plain string `.replace()` calls (NOT template literals):
- `{orderType}` → derived order type string
- `{orderId}` → order ID
- `{total}` → e.g. `"$220.00 AUD"`

Default subject: `"New Order — {orderType} #{orderId} — {total}"`

### Files changed (Section 1)
- `api/orders/index.js` only — derive `orderType`, render subject from cfg template

---

## Section 2: Admin Notification Email Template in Settings

### New config fields

Two new fields added to `emailTemplate` in `DEFAULT_CONFIG` (`api/_lib/store.js`):

```js
emailTemplate: {
  // existing fields (unchanged)
  certificateSubject:  "Your OC Certificate — Order #{orderId}",
  certificateGreeting: "...",
  footer: "...",

  // new fields
  adminNotificationSubject: "New Order — {orderType} #{orderId} — {total}",
  adminNotificationIntro:   "A new order has been placed.",
}
```

The `readConfig()` deep-merge already handles `emailTemplate` — no structural changes needed there.

### Backend: `api/config/settings.js` GET handler

The GET handler explicitly names each `emailTemplate` field. Add the two new fields with fallback defaults:

```js
adminNotificationSubject: et.adminNotificationSubject || "New Order — {orderType} #{orderId} — {total}",
adminNotificationIntro:   et.adminNotificationIntro   || "A new order has been placed.",
```

### Backend: `buildOrderEmailHtml(order, cfg)`

`buildOrderEmailHtml` gains a second `cfg` parameter (optional, defaults to undefined). It replaces
the existing hardcoded `"A new order has been placed."` paragraph (line ~22 of `api/_lib/email.js`)
with:

```js
cfg?.emailTemplate?.adminNotificationIntro || "A new order has been placed."
```

**Both call sites must be updated to pass `cfg`:**
- `api/orders/index.js` (~line 215): `buildOrderEmailHtml(order)` → `buildOrderEmailHtml(order, cfg)`
- `api/orders/[id]/[action].js` (~line 403, inside the `stripe-confirm` block):
  `buildOrderEmailHtml(confirmedOrder)` → `buildOrderEmailHtml(confirmedOrder, cfgForStripe)`
  (use the `cfgForStripe` alias which is in scope at that call site)
  This ensures the **intro text** is configurable for the payment-confirmed admin email, even though
  the **subject** of that email remains hardcoded (out of scope from Section 1).

  **Accepted limitation:** The `adminNotificationIntro` template is shared between both the
  new-order notification and the stripe payment-confirmed notification. A admin who sets the intro
  to "A new order has been received" will see that same text in the payment-confirmed email, where
  it is semantically inaccurate. A separate `adminNotificationIntroConfirmed` field is deferred
  to avoid scope creep — the current default ("A new order has been placed.") is no worse than
  what exists today for the stripe-confirm path.

### Frontend: `SettingsTab` in `src/App.jsx`

**`DEF_TPL` constant** (inside `SettingsTab`, ~line 3280) — add the two new fields with defaults
so React controlled inputs never receive `undefined` on first render:

```js
const DEF_TPL = {
  certificateSubject:       "...",
  certificateGreeting:      "...",
  footer:                   "...",
  adminNotificationSubject: "New Order — {orderType} #{orderId} — {total}",
  adminNotificationIntro:   "A new order has been placed.",
};
```

`DEF_TPL` stays in `SettingsTab` — it is not moved to `Admin`.

**New UI subsection** inside the existing "Email Templates" panel, labelled
**"Admin Notification Email"**, positioned **above** the existing "Certificate Email Subject"
subsection:

- Text input for `adminNotificationSubject` — show token hint text below the field:
  `Available tokens: {orderType} {orderId} {total}`
- Textarea for `adminNotificationIntro` (match the row count of the existing `certificateGreeting`
  textarea for visual consistency)

These fields are loaded/saved via the existing `emailTpl` state and `POST /api/config/settings` —
no new API endpoints.

Subject value is trimmed (`.trim()`) before saving.

---

## Section 3: Product Save Reliability Fix

### Problem
`savePlans` in `Admin` component (`src/App.jsx`):

```js
const savePlans = async (plans) => {
  setData(p => ({ ...p, strataPlans: plans }));  // optimistic update
  try {
    await fetch("/api/plans", { ... });
  } catch {}  // ← silent failure on both network errors and HTTP errors (4xx/5xx)
              //   fetch() only rejects on network-level errors, not on non-2xx responses
};
```

### Solution

Capture a `previousPlans` snapshot before the optimistic update; check `response.ok`; revert and
show error on failure.

```js
const savePlans = async (plans) => {
  const previousPlans = data.strataPlans;          // snapshot BEFORE optimistic update
  setData(p => ({ ...p, strataPlans: plans }));    // optimistic update
  try {
    const res = await fetch("/api/plans", { ... });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Save failed (${res.status})`);
    }
    setPlanSaveErr(null);                           // clear any previous error
  } catch (err) {
    setData(p => ({ ...p, strataPlans: previousPlans }));  // revert
    setPlanSaveErr(err.message || "Failed to save. Please try again.");
  }
};
```

**`planSaveErr` state** lives in the `Admin` component. Render an error banner near the plans UI:
a red `alert-err` div that includes a dismiss button (`×`) which calls `setPlanSaveErr(null)`.
The error also clears automatically on the next successful save.

No `setTimeout` auto-clear: `Admin` is never unmounted while the admin is working, so there is no
risk of calling setState on an unmounted component.

Error extraction pattern follows the existing convention in `SettingsTab` (line ~3329):
`const d = await res.json(); setErr(d.error || "Save failed.")`.

**`previousPlans` scope:** The snapshot captures `data.strataPlans` (the array only), not the full
`data` object. The revert calls `setData(p => ({ ...p, strataPlans: previousPlans }))` — this
restores only the plans array and leaves `orders` and other state untouched.

**Banner render location:** The `planSaveErr` error banner is rendered **inside the Plans tab panel**
(inside the `adminTab === "plans"` branch), not at the top of the `Admin` component. This prevents
the error from appearing on unrelated tabs. Render it at the top of the plans content area, above
the plan list.

### Files changed (Section 3)
- `src/App.jsx` — `savePlans` function, add `planSaveErr` state to `Admin`, render dismiss-able
  error banner inside the Plans tab panel

---

## Data Flow Summary

```
Admin edits product
  → saveProduct() / addProduct()
    → savePlans(updatedPlans)
      → snapshot previousPlans
      → setData optimistic update
      → POST /api/plans
        → res.ok: setPlanSaveErr(null)
        → !res.ok or network error: setData revert + setPlanSaveErr(message)
          → dismissable alert-err shown in Admin panel
```

```
Customer places order — bank/PayID (POST /api/orders)
  → cfg loaded from Redis
  → orderType derived from order.orderCategory
  → subject = cfg.emailTemplate.adminNotificationSubject
              .replace("{orderType}", orderType)
              .replace("{orderId}", order.id)
              .replace("{total}", "$" + order.total.toFixed(2) + " AUD")
  → buildOrderEmailHtml(order, cfg) renders intro from cfg.emailTemplate.adminNotificationIntro
  → admin notification sent with enriched subject

Customer places Stripe order → pays → stripe-confirm
  → buildOrderEmailHtml(confirmedOrder, cfgForStripe) renders configurable intro text
  → admin subject remains hardcoded "Payment Confirmed — Order #..." (out of scope)
```

---

## Files Modified Summary

| File | Change |
|------|--------|
| `api/_lib/store.js` | Add `adminNotificationSubject` + `adminNotificationIntro` to `DEFAULT_CONFIG.emailTemplate` |
| `api/_lib/email.js` | `buildOrderEmailHtml(order, cfg)` — accept cfg param, replace hardcoded intro |
| `api/config/settings.js` | GET handler: add new fields to returned `emailTemplate` shape with fallback defaults |
| `api/orders/index.js` | Derive `orderType`, render subject from cfg template, pass `cfg` to `buildOrderEmailHtml` |
| `api/orders/[id]/[action].js` | Update `buildOrderEmailHtml(confirmedOrder)` call to pass `cfgForStripe` for configurable intro text |
| `src/App.jsx` | `DEF_TPL` + new UI fields in `SettingsTab`; `savePlans` reliability fix + `planSaveErr` dismissable banner in `Admin` |

**No new API files** (Vercel 12-function limit respected).

---

## Out of Scope
- Stripe payment-confirmation admin email subject (intentionally hardcoded, different notification type)
- Full HTML body customisation for admin email
- Pagination on orders list
- Combined "Mark Paid + Send Certificate" action
