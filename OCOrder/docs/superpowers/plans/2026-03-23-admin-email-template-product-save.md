# Admin Email Notification Template + Product Save Fix — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable admin notification email subject/intro (with order type), and fix silent product-save failures in the admin panel.

**Architecture:** Three independent changes to existing files — (1) new config fields in the email template stored in Redis, surfaced via the settings API and settings UI; (2) order-type derivation + template rendering in the new-order email send path; (3) `savePlans` reliability fix with optimistic-revert and visible error.

**Tech Stack:** React 18 (src/App.jsx), Vercel Serverless Functions (api/), Redis/Upstash KV, nodemailer/SMTP2GO

**Spec:** `docs/superpowers/specs/2026-03-23-admin-email-template-product-save-design.md`

---

## Chunk 1: Backend — new config fields + buildOrderEmailHtml update

### Task 1: Add new emailTemplate fields to DEFAULT_CONFIG

**Files:**
- Modify: `api/_lib/store.js` lines 119-123

- [ ] **Step 1: Add the two new fields to DEFAULT_CONFIG.emailTemplate**

In `api/_lib/store.js`, change the `emailTemplate` block from:

```js
  emailTemplate: {
    certificateSubject:  "Your OC Certificate — Order #{orderId}",
    certificateGreeting: "Dear {name},\n\nPlease find attached your Owner Corporation Certificate for Lot {lotNumber} at {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team",
    footer: "Top Owners Corporation Solution  |  info@tocs.co",
  },
```

to:

```js
  emailTemplate: {
    certificateSubject:       "Your OC Certificate — Order #{orderId}",
    certificateGreeting:      "Dear {name},\n\nPlease find attached your Owner Corporation Certificate for Lot {lotNumber} at {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team",
    footer:                   "Top Owners Corporation Solution  |  info@tocs.co",
    adminNotificationSubject: "New Order — {orderType} #{orderId} — {total}",
    adminNotificationIntro:   "A new order has been placed.",
  },
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/store.js
git commit -m "feat: add adminNotificationSubject + adminNotificationIntro to DEFAULT_CONFIG"
```

---

### Task 2: Update settings.js GET handler to return new fields

**Files:**
- Modify: `api/config/settings.js` line 23

- [ ] **Step 1: Add the new fields to the GET response emailTemplate shape**

In `api/config/settings.js`, change line 23 from:

```js
        emailTemplate: { certificateSubject: et.certificateSubject || "Your OC Certificate — Order #{orderId}", certificateGreeting: et.certificateGreeting || "", footer: et.footer || "" },
```

to:

```js
        emailTemplate: {
          certificateSubject:       et.certificateSubject       || "Your OC Certificate — Order #{orderId}",
          certificateGreeting:      et.certificateGreeting      || "",
          footer:                   et.footer                   || "",
          adminNotificationSubject: et.adminNotificationSubject || "New Order — {orderType} #{orderId} — {total}",
          adminNotificationIntro:   et.adminNotificationIntro   || "A new order has been placed.",
        },
```

- [ ] **Step 2: Commit**

```bash
git add api/config/settings.js
git commit -m "feat: expose adminNotification email template fields in settings GET"
```

---

### Task 3: Update buildOrderEmailHtml to accept cfg and use configurable intro

**Files:**
- Modify: `api/_lib/email.js` line 5 (function signature) and line ~22 (hardcoded intro paragraph)

- [ ] **Step 1: Add cfg parameter and replace hardcoded intro**

In `api/_lib/email.js`, change the function signature and intro paragraph:

```js
// Change line 5:
export function buildOrderEmailHtml(order, cfg) {
```

Then find the hardcoded intro paragraph inside the returned HTML string. It looks like:
```
<p style="margin-top:0;">A new order has been placed.</p>
```

Replace with:
```js
<p style="margin-top:0;">${cfg?.emailTemplate?.adminNotificationIntro || "A new order has been placed."}</p>
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/email.js
git commit -m "feat: buildOrderEmailHtml accepts cfg for configurable intro text"
```

---

### Task 4: Update orders/index.js — order type + template subject + pass cfg

**Files:**
- Modify: `api/orders/index.js` lines ~211-215

The admin email send block (lines ~210-222) currently has:
```js
subject: `New Order #${order.id} — $${(order.total||0).toFixed(2)} AUD`,
html: buildOrderEmailHtml(order),
```

- [ ] **Step 1: Add orderType derivation and render subject from config template**

Note: Stripe orders return a redirect at line ~150 and never reach this email block — the derivation is only needed for bank/PayID orders (the only orders that reach this code path).

Add the following immediately before the `sendMail(smtp, {` call for the admin email (after `cfg` is already in scope at line ~36). Use plain string `.replace()` with literal string arguments (NOT regex) to avoid issues with special characters in order IDs:

```js
    const orderType = order.orderCategory === "oc" ? "OC Certificate"
                    : order.orderCategory === "keys" ? "Keys / Fobs"
                    : "Order";
    const adminSubject = (cfg.emailTemplate?.adminNotificationSubject || "New Order — {orderType} #{orderId} — {total}")
      .replace("{orderType}", orderType)
      .replace("{orderId}", order.id)
      .replace("{total}", "$" + (order.total || 0).toFixed(2) + " AUD");
```

Then update the admin sendMail call:
```js
          subject: adminSubject,
          html: buildOrderEmailHtml(order, cfg),
```

- [ ] **Step 2: Commit**

```bash
git add api/orders/index.js
git commit -m "feat: admin notification email subject includes order type, uses config template"
```

---

### Task 5: Update [action].js — pass cfgForStripe to buildOrderEmailHtml

**Files:**
- Modify: `api/orders/[id]/[action].js` line ~403

**This task is mandatory** — without it, the configurable admin intro text will not apply to Stripe-confirmed orders.

The call at line ~403 is:
```js
          html: buildOrderEmailHtml(confirmedOrder),
```

- [ ] **Step 1: Pass cfgForStripe so the configurable intro text is used**

`cfgForStripe` is in scope at this call site (it is the alias for `cfg` in the stripe-confirm block).

Change:
```js
          html: buildOrderEmailHtml(confirmedOrder),
```

to:
```js
          html: buildOrderEmailHtml(confirmedOrder, cfgForStripe),
```

Note: The admin email **subject** for the stripe-confirm path remains hardcoded as
`Payment Confirmed — Order #${id} — ...` — do NOT change it.

- [ ] **Step 2: Commit**

```bash
git add api/orders/[id]/[action].js
git commit -m "feat: pass cfgForStripe to buildOrderEmailHtml in stripe-confirm path"
```

---

## Chunk 2: Frontend — Settings UI + savePlans reliability fix

### Task 6: Update DEF_TPL in SettingsTab and add new UI fields

**Files:**
- Modify: `src/App.jsx` — `SettingsTab` component starting at line ~3276

- [ ] **Step 1: Update DEF_TPL constant (line ~3280)**

Change `DEF_TPL` from:
```js
  const DEF_TPL = { certificateSubject: "Your OC Certificate — Order #{orderId}", certificateGreeting: "Dear {name},\n\nPlease find attached your Owner Corporation Certificate for Lot {lotNumber} at {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team", footer: "Top Owners Corporation Solution  |  info@tocs.co" };
```

to:
```js
  const DEF_TPL = {
    certificateSubject:       "Your OC Certificate — Order #{orderId}",
    certificateGreeting:      "Dear {name},\n\nPlease find attached your Owner Corporation Certificate for Lot {lotNumber} at {address}.\n\nIf you have any questions please don't hesitate to contact us.\n\nKind regards,\nTOCS Team",
    footer:                   "Top Owners Corporation Solution  |  info@tocs.co",
    adminNotificationSubject: "New Order — {orderType} #{orderId} — {total}",
    adminNotificationIntro:   "A new order has been placed.",
  };
```

- [ ] **Step 2: Add new UI subsection in the Email Templates panel**

Locate the "Email Templates" panel in `SettingsTab`. It currently starts with:
```jsx
      {/* Email Templates */}
      <div className="panel">
        <h2 className="section-tt" style={{ marginBottom: "6px" }}>Email Templates</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Customise the certificate email sent to applicants. Placeholders: ...
        </p>
        <div className="form-row">
          <label className="f-label">Certificate Email Subject</label>
```

Insert the following new subsection **before** the existing `Certificate Email Subject` form-row and **after** the opening `<p>` description paragraph:

```jsx
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--forest)", marginBottom: "12px", marginTop: "8px" }}>Admin Notification Email</h3>
        <div className="form-row">
          <label className="f-label">Notification Subject</label>
          <input className="f-input" type="text"
            value={emailTpl.adminNotificationSubject || ""}
            onChange={e => updTpl("adminNotificationSubject", e.target.value)}/>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Tokens: <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{{orderType}}"}</code>{" "}
            <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{{orderId}}"}</code>{" "}
            <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{{total}}"}</code>
          </div>
        </div>
        <div className="form-row">
          <label className="f-label">Notification Intro Text</label>
          <textarea className="f-input" rows={3} style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            value={emailTpl.adminNotificationIntro || ""}
            onChange={e => updTpl("adminNotificationIntro", e.target.value)}/>
        </div>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--forest)", marginBottom: "12px", marginTop: "20px" }}>Certificate Email</h3>
```

Note: The token hint uses `{"{{orderType}}"}` JSX syntax to render literal curly braces — use single-brace placeholders `{orderType}` in the displayed text (the JSX escaping handles it).

Actually — the token display should show `{orderType}` literally to the user (since that's what they'll type in the subject field). Use this instead for the hint divs to display the tokens correctly:

```jsx
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "4px" }}>
            Tokens:{" "}
            <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{"+"orderType}"}</code>{" "}
            <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{"+"orderId}"}</code>{" "}
            <code style={{background:"var(--cream)",padding:"1px 4px",borderRadius:"3px"}}>{"{"+"total}"}</code>
          </div>
```

- [ ] **Step 3: Update the save handler to trim string fields**

Locate the `save` function in `SettingsTab`. It calls `POST /api/config/settings` with `emailTemplate: emailTpl`. Before the fetch, trim both new string fields (textarea content can accumulate trailing newlines):

```js
    const tplToSave = {
      ...emailTpl,
      adminNotificationSubject: (emailTpl.adminNotificationSubject || "").trim(),
      adminNotificationIntro:   (emailTpl.adminNotificationIntro   || "").trim(),
    };
```

Then pass `emailTemplate: tplToSave` instead of `emailTemplate: emailTpl` in the fetch body.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add admin notification email template fields to Settings UI"
```

---

### Task 7: Fix savePlans reliability — revert on failure + error banner

**Files:**
- Modify: `src/App.jsx` — `Admin` component, `savePlans` function (line ~1887) and the plans tab panel (line ~2205)

- [ ] **Step 1: Add planSaveErr state to Admin component**

Find the `Admin` function and its existing state declarations (near line ~1857). Add:

```js
  const [planSaveErr, setPlanSaveErr] = useState(null);
```

- [ ] **Step 2: Replace savePlans with reliable version**

Replace the current `savePlans` function (lines ~1887-1896):

```js
  const savePlans = async (plans) => {
    setData(p => ({ ...p, strataPlans: plans }));
    try {
      await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ plans }),
      });
    } catch {}
  };
```

with (CRITICAL: `previousPlans` snapshot MUST be captured before `setData` — if captured after, the revert will put back the already-updated value and accomplish nothing):

```js
  const savePlans = async (plans) => {
    const previousPlans = data.strataPlans;          // snapshot BEFORE optimistic update
    setData(p => ({ ...p, strataPlans: plans }));
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + adminToken },
        body: JSON.stringify({ plans }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Save failed (${res.status})`);
      }
      setPlanSaveErr(null);
    } catch (err) {
      setData(p => ({ ...p, strataPlans: previousPlans }));
      setPlanSaveErr(err.message || "Failed to save. Please try again.");
    }
  };
```

- [ ] **Step 3: Render dismissable error banner in Plans tab**

Find the plans tab panel (line ~2205):
```jsx
      {adminTab === "plans" && (
        <div className="panel">
          <div className="section-hd">
            <h2 className="section-tt">Strata Plans</h2>
```

Insert the error banner immediately after the opening `<div className="panel">`:

```jsx
          {planSaveErr && (
            <div className="alert alert-err" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{planSaveErr}</span>
              <button onClick={() => setPlanSaveErr(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "inherit", marginLeft: "12px" }}>×</button>
            </div>
          )}
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "fix: savePlans shows error and reverts on failure instead of silently discarding"
```

---

## Chunk 3: Build, deploy, and verify

### Task 8: Build and deploy to Vercel

- [ ] **Step 1: Build the frontend bundle**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy/.claude/worktrees/condescending-turing
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
```

Expected: `dist/app.js` and `dist/app.css` created/updated with no errors.

- [ ] **Step 2: Stage build output and commit**

```bash
git add dist/
git commit -m "chore: rebuild frontend bundle"
```

- [ ] **Step 3: Deploy to Vercel production**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod
```

Expected: deployment URL printed, e.g. `https://occorder.vercel.app`.

- [ ] **Step 4: Push branch to git remote**

```bash
git push origin claude/condescending-turing
```

- [ ] **Step 5: Merge to main and push**

```bash
git checkout main
git merge claude/condescending-turing --no-ff -m "feat: admin email notification template + product save reliability fix"
git push origin main
```

- [ ] **Step 6: Verify deployment — check Settings tab**

Open https://occorder.vercel.app (admin login required). Navigate to Settings → Email Templates.
Confirm "Admin Notification Email" subsection is visible with Subject and Intro Text fields pre-populated with defaults.

- [ ] **Step 7: Verify admin notification email subject**

Place a test bank-transfer order on the portal. Check the admin inbox for an email subject containing the order type (e.g. `New Order — OC Certificate #TOCS-... — $220.00 AUD`).

---

*Spec:* `docs/superpowers/specs/2026-03-23-admin-email-template-product-save-design.md`
