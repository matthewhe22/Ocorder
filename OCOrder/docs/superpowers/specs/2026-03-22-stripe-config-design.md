# Stripe Configuration — Full Key Management (Option C)

**Date:** 2026-03-22
**Status:** Approved
**Scope:** Admin Settings UI + backend key resolution for Stripe payments

---

## Overview

Add full Stripe key management to the admin Settings tab. Keys (secret + publishable) are stored in Redis alongside SMTP credentials, masked on GET, and preserved on POST when the sentinel value is sent. Backend falls back to Vercel env vars if the Redis value is empty, ensuring zero-downtime migration from env-only to UI-managed config.

---

## 1. Data Layer (`api/_lib/store.js`)

### DEFAULT_CONFIG
Add `stripe` block:
```js
stripe: {
  secretKey: "",
  publishableKey: "",
}
```

### `readConfig()` deep-merge (lines 244–251)
The existing function explicitly deep-merges only four sub-objects. `stripe` must be added to this list or the default is silently lost for any existing Redis config that lacks the key:

```js
const merged = {
  ...DEFAULT_CONFIG,
  ...c,
  smtp:           { ...DEFAULT_CONFIG.smtp,           ...(c.smtp           || {}) },
  sharepoint:     { ...DEFAULT_CONFIG.sharepoint,     ...(c.sharepoint     || {}) },
  paymentDetails: { ...DEFAULT_CONFIG.paymentDetails, ...(c.paymentDetails || {}) },
  emailTemplate:  { ...DEFAULT_CONFIG.emailTemplate,  ...(c.emailTemplate  || {}) },
  stripe:         { ...DEFAULT_CONFIG.stripe,         ...(c.stripe         || {}) },  // ADD THIS
};
```

Without this line, any admin-saved Stripe key would be silently lost on the next `readConfig()` call for existing deployments.

---

## 2. Settings API (`api/config/settings.js`)

### GET `/api/config/settings`
- Mask `cfg.stripe.secretKey` as `"••••••••"` if non-empty — identical pattern to `cfg.smtp.pass`.
- Return `cfg.stripe.publishableKey` unmasked (publishable keys are not secret).

### POST `/api/config/settings`
- If `body.stripe.secretKey === "••••••••"` (sentinel), preserve stored value — do not overwrite.
- Save `body.stripe.publishableKey` as-is.

### POST `/api/config/settings?action=test-stripe`
New branch inside the existing `settings.js` handler (no new file — Vercel is at 12-function limit):
- Resolve secret key: `cfg.stripe.secretKey || process.env.STRIPE_SECRET_KEY`.
- If no key: return `{ ok: false, error: "No Stripe secret key configured" }`.
- Instantiate `new Stripe(resolvedKey)` and call `stripe.accounts.retrieve()` (lightest valid auth call).
- Return `{ ok: true, mode: "test" | "live", accountId, keySource: "config" | "env" }`.
- On Stripe error: return `{ ok: false, error: message }`.
- Timeout: 8 seconds (consistent with SMTP test).

---

## 3. Key Resolution — `api/orders/index.js`

`readConfig()` is already called at the top of this handler. After it runs, resolve the Stripe key:

```js
const stripeKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
```

Two places to update:
1. **Pre-validation guard** (currently lines 60–65): change `!process.env.STRIPE_SECRET_KEY` → `!stripeKey`
2. **Session creation** (currently line ~80): change `new Stripe(process.env.STRIPE_SECRET_KEY)` → `new Stripe(stripeKey)`

---

## 4. Key Resolution — `api/orders/[id]/[action].js`

In the stripe-confirm action, the current code:
- Guards at line 264: `if (!process.env.STRIPE_SECRET_KEY)`
- Instantiates Stripe at line 284: `new Stripe(process.env.STRIPE_SECRET_KEY)`
- Calls `readConfig()` only at line 315 (too late for the guard and instantiation above)

**Fix:** Move `readConfig()` to the top of the stripe-confirm branch (before line 264), then:
1. Resolve: `const stripeKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY`
2. Update guard at 264: `if (!stripeKey)`
3. Update instantiation at 284: `new Stripe(stripeKey)`
4. Remove the duplicate `readConfig()` call at line 315 (or reuse the existing `cfg` variable)

---

## 5. `stripeEnabled` Flag (`api/config/public.js`)

`public.js` already calls `readConfig()` and has `const cfg = await readConfig()` at line 8. The `cfg` variable already exists — **do not add another `readData()` call**.

Change only line 12:
```js
// Before
stripeEnabled: !!(process.env.STRIPE_SECRET_KEY)

// After
stripeEnabled: !!(cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY)
```

---

## 6. Settings UI (`src/App.jsx` — SettingsTab)

### State variables (add alongside existing smtp/payDetails state)
```js
const [stripeKey, setStripeKey] = useState(cfg.stripe?.secretKey || "");
const [stripePubKey, setStripePubKey] = useState(cfg.stripe?.publishableKey || "");
const [showStripeKey, setShowStripeKey] = useState(false);
const [stripeTestResult, setStripeTestResult] = useState(null);
```

### `save()` function — update POST body
The existing `save()` call (line ~3338) currently posts:
```js
body: JSON.stringify({ orderEmail, smtp, paymentDetails: payDetails, emailTemplate: emailTpl })
```
Add `stripe` to this object:
```js
body: JSON.stringify({
  orderEmail, smtp, paymentDetails: payDetails, emailTemplate: emailTpl,
  stripe: { secretKey: stripeKey, publishableKey: stripePubKey }
})
```

### New "Stripe Payments" UI section
Inserted between "Payment Details" and "SMTP Server" sections.

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| Secret Key | Password input, show/hide toggle | Masked `••••••••`; sentinel logic same as SMTP password |
| Publishable Key | Text input | Not masked; `pk_test_…` / `pk_live_…` |
| Mode badge | Auto-detected display | From secret key prefix: `sk_test_` → 🟢 Test Mode · `sk_live_` → 🟡 Live Mode · empty → ⚪ Not configured |

**Test Stripe Connection button:**
- Calls `POST /api/config/settings?action=test-stripe` with `{ stripe: { secretKey: stripeKey } }`.
- Shows inline result: ✅ Connected · Test Mode · `acct_xxx` — or ❌ error message.
- Uses same button/result UI pattern as existing "Test Email" button.

**Behaviour:**
- Mode badge updates live as the user types (client-side prefix check only).
- Secret key show/hide toggle mirrors SMTP password toggle.
- Save persists all sections including stripe via the updated `save()` body.

---

## 7. Vercel Function Limit

Confirmed at exactly 12 functions. **No new files added to `api/`.**
The test-stripe handler is a new branch inside the existing `api/config/settings.js`.

---

## 8. Migration / Backward Compatibility

- Existing Vercel env vars (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`) continue to work unchanged.
- If Redis `stripe.secretKey` is empty, the env var is used as fallback — zero breaking change.
- Admins can optionally migrate by pasting keys into Settings and saving; env vars can then be removed from Vercel dashboard if desired.

---

## 9. Security

- `stripe.secretKey` masked identically to `smtp.pass` — never returned in plaintext from GET.
- `stripe.publishableKey` is a public key (safe to expose) — returned unmasked.
- Test-stripe endpoint is admin-gated (requires valid Bearer token, same as all Settings endpoints).
- Key is never logged to audit log.

---

## 10. Files Changed

| File | Change |
|------|--------|
| `api/_lib/store.js` | Add `stripe` to DEFAULT_CONFIG AND add to `readConfig()` deep-merge block |
| `api/config/settings.js` | Mask secretKey on GET; preserve sentinel on POST; add `?action=test-stripe` branch |
| `api/config/public.js` | One-line fix: `stripeEnabled` reads `cfg.stripe?.secretKey \|\| env` (cfg already exists) |
| `api/orders/index.js` | Resolve `stripeKey` from cfg first; update pre-validation guard + session creation |
| `api/orders/[id]/[action].js` | Move `readConfig()` before line 264; resolve `stripeKey`; update guard + instantiation |
| `src/App.jsx` | Add Stripe state vars; add `stripe` to save() body; add Stripe Payments UI section |

**No new files. No new Vercel functions.**
