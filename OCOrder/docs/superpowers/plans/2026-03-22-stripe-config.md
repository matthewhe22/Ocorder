# Stripe Configuration — Full Key Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store Stripe secret + publishable keys in Redis with masking, fall back to Vercel env vars, and expose a full Stripe Payments panel in the admin Settings tab with a live mode badge and Test Connection button.

**Architecture:** Six files changed, no new files (Vercel is at the 12-function limit). Key resolution priority: Redis config → `process.env.STRIPE_SECRET_KEY`. The test-stripe handler is a new branch inside the existing `api/config/settings.js`. UI mirrors the SMTP password pattern exactly.

**Tech Stack:** Node.js ESM serverless functions, Redis via `readConfig()`/`writeConfig()` helpers, React 18 useState/useEffect, Stripe SDK v17 (`stripe.accounts.retrieve()` for auth test).

---

## Chunk 1: Backend — Data Layer & Settings API

### Task 1: Add `stripe` to DEFAULT_CONFIG and `readConfig()` deep-merge (`api/_lib/store.js`)

**Files:**
- Modify: `api/_lib/store.js` (lines 95–130 for DEFAULT_CONFIG, lines 244–251 for readConfig merge)

- [ ] **Step 1: Add stripe block to DEFAULT_CONFIG**

In `api/_lib/store.js`, find the `emailTemplate` block (ends around line 127) and add the `stripe` block immediately after the closing brace:

```js
  emailTemplate: {
    certificateSubject:  "Your OC Certificate — Order #{orderId}",
    certificateGreeting: "Dear {name},\n\n...",
    footer: "TOCS Owner Corporation Services  |  info@tocs.co",
  },
  stripe: {
    secretKey:     "",
    publishableKey: "",
  },
};
```

- [ ] **Step 2: Add stripe to the readConfig() deep-merge block**

In `api/_lib/store.js`, find the `readConfig()` merge block (lines 244–251). Add the `stripe` line after `emailTemplate`:

```js
  const merged = {
    ...DEFAULT_CONFIG,
    ...c,
    smtp:           { ...DEFAULT_CONFIG.smtp,           ...(c.smtp           || {}) },
    sharepoint:     { ...DEFAULT_CONFIG.sharepoint,     ...(c.sharepoint     || {}) },
    paymentDetails: { ...DEFAULT_CONFIG.paymentDetails, ...(c.paymentDetails || {}) },
    emailTemplate:  { ...DEFAULT_CONFIG.emailTemplate,  ...(c.emailTemplate  || {}) },
    stripe:         { ...DEFAULT_CONFIG.stripe,         ...(c.stripe         || {}) },
  };
```

- [ ] **Step 3: Commit**

```bash
git add api/_lib/store.js
git commit -m "feat: add stripe block to DEFAULT_CONFIG and readConfig deep-merge"
```

---

### Task 2: Add Stripe to Settings API GET, POST, and test-stripe branch (`api/config/settings.js`)

**Files:**
- Modify: `api/config/settings.js` (full file replacement)

- [ ] **Step 1: Update GET to return stripe fields (with secretKey masked)**

In the GET handler, after the `sharepoint:` block in the return JSON, add:

```js
        stripe: {
          secretKey:     (cfg.stripe?.secretKey)     ? "••••••••" : "",
          publishableKey: cfg.stripe?.publishableKey || "",
        },
```

Full updated return becomes:
```js
      return res.status(200).json({
        orderEmail: cfg.orderEmail || "Orders@tocs.co",
        logo: cfg.logo || "",
        smtp: { ... },
        paymentDetails: { ... },
        emailTemplate: { ... },
        sharepoint: { ... },
        stripe: {
          secretKey:      cfg.stripe?.secretKey      ? "••••••••" : "",
          publishableKey: cfg.stripe?.publishableKey || "",
        },
      });
```

- [ ] **Step 2: Update POST to save stripe fields (preserve sentinel)**

In the POST handler, after the `sharepoint` block, add:

```js
      if (stripe && typeof stripe === "object") {
        cfg.stripe = cfg.stripe || {};
        // Only update secretKey if a real value is provided (not the masked placeholder)
        if (stripe.secretKey !== undefined && stripe.secretKey !== "••••••••") {
          cfg.stripe.secretKey = stripe.secretKey;
        }
        if (stripe.publishableKey !== undefined) {
          cfg.stripe.publishableKey = stripe.publishableKey;
        }
      }
```

Also destructure `stripe` from `req.body` at the top of the POST block:
```js
const { orderEmail, logo, smtp, paymentDetails, emailTemplate, sharepoint, stripe } = req.body || {};
```

- [ ] **Step 3: Add test-stripe branch BEFORE the generic POST block**

⚠️ Critical ordering: the test-stripe check must come BEFORE `if (req.method === "POST")`, because the generic POST block returns early (on success) and would consume the test-stripe request before it reaches our branch. Insert between the GET block's closing `}` and the POST block's `if (req.method === "POST")`:

```js
  // POST /api/config/settings?action=test-stripe  ← must be BEFORE generic POST block
  if (req.method === "POST" && req.query?.action === "test-stripe") {
    try {
      const cfg = await readConfig();
      const resolvedKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
      if (!resolvedKey) {
        return res.status(200).json({ ok: false, error: "No Stripe secret key configured." });
      }
      const keySource = cfg.stripe?.secretKey ? "config" : "env";
      const stripe = new Stripe(resolvedKey);
      const account = await stripe.accounts.retrieve();
      const mode = resolvedKey.startsWith("sk_live_") ? "live" : "test";
      return res.status(200).json({ ok: true, mode, accountId: account.id, keySource });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }
```

The file structure after this step should be:
```
GET block → test-stripe branch → generic POST block → 405
```

- [ ] **Step 4: Add `import Stripe from "stripe"` at top of settings.js**

```js
import { readConfig, writeConfig, validToken, extractToken, cors } from "../_lib/store.js";
import Stripe from "stripe";
```

- [ ] **Step 5: Verify the full settings.js looks correct**

Read the file and confirm:
- GET returns `stripe.secretKey` masked
- POST destructures `stripe` and saves it with sentinel check
- test-stripe branch exists before the 405
- Stripe is imported at top

- [ ] **Step 6: Commit**

```bash
git add api/config/settings.js
git commit -m "feat: add stripe config to settings API (GET/POST/test-stripe)"
```

---

### Task 3: Fix `stripeEnabled` in public config (`api/config/public.js`)

**Files:**
- Modify: `api/config/public.js` (one-line change, line ~12)

- [ ] **Step 1: Update stripeEnabled to read from cfg (cfg already exists at line 8)**

Find line 12:
```js
stripeEnabled: !!(process.env.STRIPE_SECRET_KEY),
```

Replace with:
```js
stripeEnabled: !!(cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY),
```

Do NOT add another `readConfig()` call — `cfg` is already assigned at line 8 via `const cfg = await readConfig()`.

- [ ] **Step 2: Commit**

```bash
git add api/config/public.js
git commit -m "fix: stripeEnabled reads from Redis config first, falls back to env var"
```

---

### Task 4: Resolve Stripe key from config in orders handler (`api/orders/index.js`)

**Files:**
- Modify: `api/orders/index.js` (lines 60–95)

- [ ] **Step 1: Add stripeKey resolution after readConfig (cfg already exists at top)**

`readConfig()` is already called near the top of this handler as `const cfg = await readConfig()` (around line 36). After that line, add:

```js
const stripeKey = cfg.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
```

- [ ] **Step 2: Update pre-validation guard (lines 60–65)**

Find:
```js
    if (order.payment === "stripe") {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(400).json({ error: "Stripe is not configured on this server." });
      }
```

Replace:
```js
    if (order.payment === "stripe") {
      if (!stripeKey) {
        return res.status(400).json({ error: "Stripe is not configured on this server." });
      }
```

- [ ] **Step 3: Update Stripe instantiation in session creation (~line 80)**

Find:
```js
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
```

Replace:
```js
        const stripe = new Stripe(stripeKey);
```

- [ ] **Step 4: Commit**

```bash
git add api/orders/index.js
git commit -m "feat: resolve Stripe key from Redis config with env var fallback (orders)"
```

---

### Task 5: Resolve Stripe key from config in stripe-confirm action (`api/orders/[id]/[action].js`)

**Files:**
- Modify: `api/orders/[id]/[action].js` (stripe-confirm block, lines 263–290)

Context: In this file, `readConfig()` is currently called at line 315 — AFTER the guard at line 264 and Stripe instantiation at line 284. We need to move key resolution to before line 264.

- [ ] **Step 1: Add readConfig + stripeKey resolution BEFORE the guard at line 264**

Find the stripe-confirm block opening:
```js
  if (action === "stripe-confirm" && req.method === "POST") {
    if (!process.env.STRIPE_SECRET_KEY) {
```

Replace the guard with:
```js
  if (action === "stripe-confirm" && req.method === "POST") {
    const cfgForStripe = await readConfig();
    const stripeKey = cfgForStripe.stripe?.secretKey || process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
```

Note: Use `cfgForStripe` (not `cfg`) to avoid naming conflicts — the existing `cfg` variable is assigned later at line 315.

- [ ] **Step 2: Update Stripe instantiation at line 284**

Find (one occurrence in the stripe-confirm block):
```js
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
```

Replace with:
```js
    const stripe = new Stripe(stripeKey);
```

- [ ] **Step 2b: Eliminate the duplicate readConfig() call at line 315**

The stripe-confirm block calls `readConfig()` again at line 315 (now after our new `cfgForStripe` at step 1). Eliminate the extra Redis round-trip by replacing the existing call:

Find (around line 315, after the emails/SP setup comments):
```js
    const cfg     = await readConfig();
```

Replace with:
```js
    const cfg     = cfgForStripe;   // reuse — already fetched above for Stripe key resolution
```

This saves ~100–200ms on every stripe-confirm request (one fewer Redis round-trip).

- [ ] **Step 3: Commit**

```bash
git add "api/orders/[id]/[action].js"
git commit -m "feat: resolve Stripe key from Redis config in stripe-confirm action"
```

---

## Chunk 2: Frontend — Stripe Settings UI

### Task 6: Add Stripe Payments section to SettingsTab (`src/App.jsx`)

**Files:**
- Modify: `src/App.jsx` — `SettingsTab` function (lines 3299–3492)

- [ ] **Step 1: Add stripe state variables at top of SettingsTab**

After the existing state declarations (around line 3314, after `const [testResult, setTestResult] = useState(null)`), add:

```jsx
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripePubKey, setStripePubKey] = useState("");
  const [showStripeKey, setShowStripeKey] = useState(false);
  const [testingStripe, setTestingStripe] = useState(false);
  const [stripeTestResult, setStripeTestResult] = useState(null);
```

- [ ] **Step 2: Populate stripe state in the useEffect fetch**

In the `useEffect` `.then(d => {...})` block, after `setEmailTpl(...)`, add:

```jsx
        setStripeSecretKey(d.stripe?.secretKey || "");
        setStripePubKey(d.stripe?.publishableKey || "");
```

- [ ] **Step 3: Add stripe to the save() POST body**

In the `save` function, find:
```jsx
        body: JSON.stringify({ orderEmail, smtp, paymentDetails: payDetails, emailTemplate: emailTpl }),
```

Replace with:
```jsx
        body: JSON.stringify({
          orderEmail, smtp, paymentDetails: payDetails, emailTemplate: emailTpl,
          stripe: { secretKey: stripeSecretKey, publishableKey: stripePubKey },
        }),
```

- [ ] **Step 4: Add testStripe handler function**

After the existing `testEmail` async function, add:

```jsx
  const testStripe = async () => {
    setTestingStripe(true); setStripeTestResult(null); setSaveErr("");
    try {
      const r = await fetch("/api/config/settings?action=test-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ stripe: { secretKey: stripeSecretKey } }),
      });
      const d = await r.json();
      if (d.ok) {
        setStripeTestResult({ ok: true, msg: `✅ Connected · ${d.mode === "test" ? "Test Mode" : "⚠️ Live Mode"} · ${d.accountId} (key from ${d.keySource})` });
      } else {
        setStripeTestResult({ ok: false, msg: d.error || "Connection failed." });
      }
    } catch { setStripeTestResult({ ok: false, msg: "Unable to connect to server." }); }
    setTestingStripe(false);
  };
```

- [ ] **Step 5: Add mode badge helper**

Just before the `return (` in SettingsTab, add:

```jsx
  const stripeModeFromKey = (k) => {
    if (!k || k === "••••••••") return null;
    if (k.startsWith("sk_live_")) return { label: "Live Mode", color: "#b45309" };
    if (k.startsWith("sk_test_")) return { label: "Test Mode", color: "#16a34a" };
    return null;
  };
  const stripeMode = stripeModeFromKey(stripeSecretKey);
```

- [ ] **Step 6: Insert the Stripe Payments UI panel**

Insert the following JSX block between the closing `</div>` of the "Payment Details" panel and the opening `<div className="panel">` of the "SMTP Server" panel:

```jsx
      {/* Stripe Payments */}
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>Stripe Payments</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Enable card payments via Stripe. Keys are stored securely and take priority over Vercel environment variables.
        </p>

        {/* Mode badge */}
        {stripeMode && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: stripeMode.color + "18", border: `1px solid ${stripeMode.color}40`, borderRadius: "20px", padding: "3px 12px", marginBottom: "16px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: stripeMode.color, display: "inline-block" }}/>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: stripeMode.color, letterSpacing: "0.06em" }}>{stripeMode.label}</span>
          </div>
        )}
        {!stripeMode && stripeSecretKey === "" && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "20px", padding: "3px 12px", marginBottom: "16px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#9ca3af", display: "inline-block" }}/>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", letterSpacing: "0.06em" }}>Not Configured</span>
          </div>
        )}

        {/* Secret Key */}
        <div className="form-row">
          <label className="f-label">Secret Key</label>
          <div className="pw-wrap">
            <input className="f-input" type={showStripeKey ? "text" : "password"}
              placeholder="sk_test_••••••••  or  sk_live_••••••••"
              value={stripeSecretKey}
              onChange={e => { setStripeSecretKey(e.target.value); setSaved(false); setSaveErr(""); setStripeTestResult(null); }}
              style={{ paddingRight: "42px" }}/>
            <button className="pw-toggle" type="button" onClick={() => setShowStripeKey(p => !p)}>
              <Ic n={showStripeKey ? "eyeOff" : "eye"} s={16}/>
            </button>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Find this in your Stripe Dashboard → Developers → API keys.
          </div>
        </div>

        {/* Publishable Key */}
        <div className="form-row" style={{ marginBottom: "1rem" }}>
          <label className="f-label">Publishable Key</label>
          <input className="f-input" type="text"
            placeholder="pk_test_••••••••  or  pk_live_••••••••"
            value={stripePubKey}
            onChange={e => { setStripePubKey(e.target.value); setSaved(false); setSaveErr(""); }}/>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Optional — used to display card brands and for future client-side integrations.
          </div>
        </div>

        {/* Test result */}
        {stripeTestResult?.ok === true  && <div className="alert alert-ok"  style={{ marginBottom: "10px" }}>{stripeTestResult.msg}</div>}
        {stripeTestResult?.ok === false && <div className="alert alert-err" style={{ marginBottom: "10px" }}>{stripeTestResult.msg}</div>}

        {/* Test button */}
        <button className="btn btn-out" onClick={testStripe} disabled={testingStripe || !stripeSecretKey || stripeSecretKey === "••••••••"}>
          {testingStripe
            ? <><span style={{display:"inline-block",animation:"spin 0.8s linear infinite",border:"2px solid rgba(0,0,0,0.15)",borderTop:"2px solid #1c3326",borderRadius:"50%",width:13,height:13}}/> Testing…</>
            : <><Ic n="check" s={15}/> Test Stripe Connection</>
          }
        </button>
      </div>
```

- [ ] **Step 7: Build and verify no compilation errors**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
```

Expected: `✅  Build complete → dist/`

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Stripe Payments settings panel with key management and test connection"
```

---

## Chunk 3: Deploy & End-to-End Test

### Task 7: Deploy to production and verify Stripe end-to-end

**Files:** None (deployment only)

- [ ] **Step 1: Deploy to Vercel production**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod
```

Expected: `Aliased: https://occorder.vercel.app`

- [ ] **Step 2: Verify Stripe appears in Settings UI**

1. Open https://occorder.vercel.app → Admin login
2. Go to Settings tab
3. Confirm "Stripe Payments" panel is visible between Payment Details and SMTP sections
4. Confirm Secret Key field shows `••••••••` (pre-loaded from Vercel env var via cfg fallback)
5. Confirm mode badge shows 🟢 Test Mode (since key starts with `sk_test_`)

- [ ] **Step 3: Test Stripe Connection button**

Click "Test Stripe Connection" — expect:
`✅ Connected · Test Mode · acct_xxx (key from env)`

If error: check that `STRIPE_SECRET_KEY` is set in Vercel env vars and starts with `sk_test_`.

- [ ] **Step 4: Test stripeEnabled in portal**

Open https://occorder.vercel.app (customer portal, not admin)
- Select a plan and building
- Proceed to payment step
- Confirm "Credit / Debit Card (Stripe)" option appears in payment methods

- [ ] **Step 5: Place a test Stripe order**

1. Select a building, add a product, fill contact details
2. Choose "Credit / Debit Card (Stripe)"
3. Click Place Order → should redirect to Stripe Checkout page
4. Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC
5. Complete payment → should redirect back to portal with confirmation

- [ ] **Step 6: Verify order in admin panel**

1. Log into admin → Orders tab
2. Find the test order — status should be "Paid"
3. Expand the order → audit log should show:
   - "Stripe Checkout Session created"
   - "Payment confirmed via Stripe"

- [ ] **Step 7: Save Stripe key via Settings UI (optional migration test)**

1. In Settings → Stripe Payments, clear the Secret Key field and paste the `sk_test_` key
2. Click Save Settings
3. Click Test Stripe Connection → expect `key from config` in result
4. This confirms the Redis-stored key path works

- [ ] **Step 8: Push to git**

```bash
git add -A && git commit -m "chore: post-deploy stripe config verified" 2>/dev/null || true
git push git@github.com:matthewhe22/Ocorder.git main
```
