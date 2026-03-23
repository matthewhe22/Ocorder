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
The admin notification email subject is hardcoded:
```
New Order #${order.id} — $${total} AUD
```
It gives no indication of what was ordered, requiring the admin to open the email to determine order type.

### Solution
Derive `orderType` from `order.orderCategory` at send time:
- `"oc"` → `"OC Certificate"`
- `"keys"` → `"Keys / Fobs"`
- anything else → `"Order"`

The subject is rendered from the configured `adminNotificationSubject` template (see Section 2) with these substitutions applied:
- `{orderType}` → derived order type string
- `{orderId}` → order ID
- `{total}` → formatted total (e.g. `$220.00`)

### Files changed
- `api/orders/index.js` — derive `orderType`, render subject from config template
- `api/orders/[id]/[action].js` — same change for the Stripe confirm flow admin email

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
  adminNotificationSubject: "New Order — {orderType} #{orderId} — ${total} AUD",
  adminNotificationIntro:   "A new order has been placed.",
}
```

The `readConfig()` deep-merge already handles `emailTemplate` — no structural changes needed there.

### Backend: `buildOrderEmailHtml(order, cfg)`

`buildOrderEmailHtml` gains a second `cfg` parameter. It renders the intro paragraph from `cfg?.emailTemplate?.adminNotificationIntro` with fallback to the current hardcoded string.

Call sites updated:
- `api/orders/index.js`
- `api/orders/[id]/[action].js`

### Settings tab UI (`src/App.jsx` — `SettingsTab`)

A new subsection added inside the existing "Email Templates" panel, labelled **"Admin Notification Email"**, positioned above the existing "Certificate Email Subject" subsection:

**Fields:**
- `adminNotificationSubject` — text input; placeholder hint shows available tokens: `{orderType}` `{orderId}` `{total}`
- `adminNotificationIntro` — textarea (3 rows); the intro sentence shown at the top of the admin notification email body

These fields are loaded/saved via the existing `emailTpl` state and `POST /api/config/settings` — no new API endpoints.

---

## Section 3: Product Save Reliability Fix

### Problem
`savePlans` in `Admin` component (`src/App.jsx`):
```js
const savePlans = async (plans) => {
  setData(p => ({ ...p, strataPlans: plans }));  // optimistic update
  try {
    await fetch("/api/plans", { ... });
  } catch {}  // ← silent failure
};
```
If the `POST /api/plans` call fails (network error, auth expiry, Redis unavailable), the in-memory UI shows the update but Redis is never written. On next page reload the edit is lost.

### Solution
- Replace silent `catch {}` with error capture
- On failure: revert the optimistic `setData` to the pre-edit plans
- Surface an error alert using the existing `alert-err` CSS class in the Admin panel
- The alert state (`planSaveErr`) lives in the `Admin` component and auto-clears after 5 seconds or on next successful save

### Files changed
- `src/App.jsx` — `savePlans` function + add `planSaveErr` state + render error alert in Admin panel

---

## Data Flow Summary

```
Admin edits product
  → saveProduct() / addProduct()
    → savePlans(updatedPlans)
      → setData optimistic update
      → POST /api/plans
        → success: no-op (state already updated)
        → failure: revert setData + set planSaveErr
          → alert-err shown to admin
```

```
Customer places order (POST /api/orders)
  → orderType derived from order.orderCategory
  → cfg.emailTemplate.adminNotificationSubject rendered with {orderType}, {orderId}, {total}
  → buildOrderEmailHtml(order, cfg) renders intro from cfg.emailTemplate.adminNotificationIntro
  → admin notification sent with enriched subject
```

---

## Out of Scope
- Full HTML body customisation for admin email
- Pagination on orders list
- Combined "Mark Paid + Send Certificate" action
