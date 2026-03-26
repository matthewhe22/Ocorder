# E2E Bug Fixes & SharePoint/Email Verification Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 10 gaps found in E2E testing, verify SharePoint + email attachment functionality, then run a comprehensive multi-scenario E2E test.

**Architecture:** All fixes are surgical edits to existing files only (Vercel 12-function limit is already at capacity — no new `.js` files in `api/` except `_lib/`). Frontend changes are in `src/App.jsx`; backend fixes are in existing API handlers.

**Tech Stack:** React 18 SPA, Vercel Serverless Functions, Redis/Upstash KV, nodemailer/SMTP2GO, Stripe SDK, Microsoft Graph API (SharePoint)

---

## File Map

| File | Changes |
|---|---|
| `api/data.js` | Strip orders from unauthenticated response; return orders only when valid Bearer token present |
| `api/orders/export.js` | Accept `Authorization: Bearer` header in addition to `?token=` query param |
| `api/config/settings.js` | Mask `smtp.pass` in GET response; ignore `"••••••••"` on POST |
| `api/orders/index.js` | Move Stripe key + total check BEFORE Redis save to prevent ghost orders |
| `api/orders/[id]/[action].js` | Add `delete` action (admin auth); add status whitelist on PUT |
| `src/App.jsx` | Stripe cancel banner; order deletion button; filter dropdown fixes; footer privacy link; admin re-fetch orders with token; extended loading message |

---

## Chunk 1: Critical & High Security Fixes (Backend)

### Task 1: Fix PII exposure — strip orders from public /api/data

**Files:**
- Modify: `api/data.js`
- Modify: `src/App.jsx` (admin re-fetch after login)

**Context:** `GET /api/data` currently returns all orders with customer PII (names, emails, phones) to anyone — no auth. The frontend needs orders only for the admin panel, not the customer portal. Fix: return orders only when a valid Bearer token is present; also re-fetch with token when admin logs in.

- [ ] **Step 1.1: Update api/data.js to gate orders on auth**

Replace the entire file contents with:

```js
// GET /api/data — Returns strataPlans (public) + orders (admin only)
import { readData, validToken, extractToken, cors } from "./_lib/store.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const data = await readData();
  const token = extractToken(req) || req.query?.token;
  const isAdmin = !!(await validToken(token));

  return res.status(200).json({
    strataPlans: data.strataPlans,
    orders: isAdmin ? data.orders : [],
  });
}
```

- [ ] **Step 1.2: Update App.jsx — refetch data with token after admin login**

Find the login success handler in `src/App.jsx`. Search for `setAdminToken` where the token is stored after login. After that line, add a re-fetch call:

Find this pattern (inside the admin login success block, around line 600-700):
```js
setAdminToken(tok);
sessionStorage.setItem("admin_token", tok);
```

Add immediately after those two lines:
```js
// Re-fetch data with admin token to load orders (orders not returned to unauthenticated callers)
fetch("/api/data", { headers: { "Authorization": "Bearer " + tok } })
  .then(r => r.json()).then(d => setData(d)).catch(() => {});
```

- [ ] **Step 1.3: Verify locally**
```bash
# Without token — should return orders: []
curl -s https://occorder.vercel.app/api/data | python3 -c "import sys,json; d=json.load(sys.stdin); print('orders count (public):', len(d['orders']))"

# With token (get one first, or test locally)
```
Expected: `orders count (public): 0`

---

### Task 2: Fix CSV Export — accept Bearer token

**Files:**
- Modify: `api/orders/export.js`

**Context:** The admin UI sends `Authorization: Bearer <token>` but the export endpoint only reads `req.query.token`. One-line fix: use `extractToken(req)` as fallback.

- [ ] **Step 2.1: Update export.js to accept Bearer header**

Replace line 9 (`const token = req.query.token;`) with:
```js
const token = req.query.token || (req.headers["authorization"] || "").replace("Bearer ", "");
```

Full updated file for reference:
```js
// GET /api/orders/export — Download all orders as CSV (admin only)
// Accepts token via ?token= query param OR Authorization: Bearer header
import { readData, validToken, cors } from "../_lib/store.js";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  const token = req.query.token || (req.headers["authorization"] || "").replace("Bearer ", "");
  if (!await validToken(token)) return res.status(401).json({ error: "Not authenticated." });

  const { orders } = await readData();

  const rows = [
    ["Order ID","Date","Name","Email","Phone","Items","Total (AUD)","Payment","Status"],
    ...orders.map(o => [
      o.id,
      new Date(o.date).toLocaleDateString("en-AU"),
      o.contactInfo?.name  ?? "",
      o.contactInfo?.email ?? "",
      o.contactInfo?.phone ?? "",
      o.items?.length ?? 0,
      (o.total ?? 0).toFixed(2),
      o.payment ?? "",
      o.status  ?? "",
    ]),
  ];

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="tocs-orders-${date}.csv"`);
  return res.status(200).send(csv);
}
```

---

### Task 3: Mask SMTP password in settings GET

**Files:**
- Modify: `api/config/settings.js`

**Context:** SharePoint `clientSecret` is already masked as `"••••••••"` on GET and the POST ignores the mask. Apply the same pattern to `smtp.pass`.

- [ ] **Step 3.1: Mask smtp.pass in GET response**

In `api/config/settings.js`, in the GET handler, find:
```js
smtp: { host: smtp.host || "mail-au.smtp2go.com", port: smtp.port || 2525, user: smtp.user || "OCCAPP", pass: smtp.pass || "" },
```

Replace with:
```js
smtp: { host: smtp.host || "mail-au.smtp2go.com", port: smtp.port || 2525, user: smtp.user || "OCCAPP", pass: smtp.pass ? "••••••••" : "" },
```

- [ ] **Step 3.2: Ignore mask on POST for smtp.pass**

In the POST handler, find:
```js
if (smtp.pass !== undefined) cfg.smtp.pass = smtp.pass;
```

Replace with:
```js
if (smtp.pass !== undefined && smtp.pass !== "••••••••") cfg.smtp.pass = smtp.pass;
```

---

### Task 4: Fix ghost Stripe orders — validate before Redis save

**Files:**
- Modify: `api/orders/index.js`

**Context:** Currently the order is saved to Redis at ~line 58, then Stripe key/total validation fires at ~line 66. If validation fails, a broken ghost order is left in Redis permanently. Fix: move the Stripe validation block to BEFORE the Redis save.

- [ ] **Step 4.1: Move Stripe validation before writeData**

In `api/orders/index.js`, find the section that looks like:
```js
  // ── Save order to Redis immediately ──────────────────────────────────────────
  const data = await readData();
  data.orders.unshift(order);
  await writeData(data);

  // ── STRIPE CHECKOUT ────────────────────────────────────────────────────────
  if (order.payment === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(400).json({ error: "Stripe is not configured on this server." });
    }
    if (!order.total || order.total <= 0) {
      return res.status(400).json({ error: "Stripe cannot process a zero-value order. Please contact us." });
    }
```

Restructure so the Stripe pre-checks happen BEFORE the Redis save. The new order should be:

```js
  // ── STRIPE PRE-VALIDATION (before Redis save — prevents ghost orders) ───────
  if (order.payment === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(400).json({ error: "Stripe is not configured on this server." });
    }
    if (!order.total || order.total <= 0) {
      return res.status(400).json({ error: "Stripe cannot process a zero-value order. Please contact us." });
    }
  }

  // ── Save order to Redis immediately ──────────────────────────────────────────
  const data = await readData();
  data.orders.unshift(order);
  await writeData(data);

  // ── STRIPE CHECKOUT SESSION CREATION ────────────────────────────────────────
  if (order.payment === "stripe") {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      // ... rest of stripe session creation as-is
```

The key change: the two `return res.status(400)` validation guards move to BEFORE `writeData`. The `try { const stripe = ...` block stays after `writeData` because at that point the order is already validated and we want to persist it.

Exact edit — find:
```js
    order.auditLog = [{ ts: new Date().toISOString(), action: "Order created", note: `Customer: ${order.contactInfo?.name || "?"}` }];

    // ── Save order to Redis immediately ──────────────────────────────────────────
    const data = await readData();
    data.orders.unshift(order);
    await writeData(data);

    // ── STRIPE CHECKOUT ────────────────────────────────────────────────────────
    // If payment is "stripe", create a Checkout Session and redirect the customer.
    // Emails are sent later by the stripe-confirm endpoint after payment is verified.
    // NOTE: This returns early — SP uploads, Redis authority save, and email blocks
    // are all skipped for Stripe orders (accepted limitation for initial implementation).
    if (order.payment === "stripe") {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(400).json({ error: "Stripe is not configured on this server." });
      }
      if (!order.total || order.total <= 0) {
        return res.status(400).json({ error: "Stripe cannot process a zero-value order. Please contact us." });
      }
      try {
```

Replace with:
```js
    order.auditLog = [{ ts: new Date().toISOString(), action: "Order created", note: `Customer: ${order.contactInfo?.name || "?"}` }];

    // ── STRIPE PRE-VALIDATION (before Redis save — prevents ghost orders) ────────
    // Validate Stripe configuration BEFORE saving to Redis so failed validation
    // does not leave a ghost order in the database.
    if (order.payment === "stripe") {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(400).json({ error: "Stripe is not configured on this server." });
      }
      if (!order.total || order.total <= 0) {
        return res.status(400).json({ error: "Stripe cannot process a zero-value order. Please contact us." });
      }
    }

    // ── Save order to Redis immediately ──────────────────────────────────────────
    const data = await readData();
    data.orders.unshift(order);
    await writeData(data);

    // ── STRIPE CHECKOUT SESSION CREATION ────────────────────────────────────────
    if (order.payment === "stripe") {
      try {
```

---

## Chunk 2: Medium UX Fixes (Frontend)

### Task 5: Show cancellation banner when Stripe payment is cancelled

**Files:**
- Modify: `src/App.jsx`

**Context:** When customer cancels on Stripe, they land at `/?cancelled=1`. The URL is cleaned up but no message is shown. User has no idea why they're back at Step 1 with an empty cart.

- [ ] **Step 5.1: Add stripeCancelled state**

Find the state declarations block near the other stripe states (around line 403-406):
```js
  const [stripeConfirming, setStripeConfirming] = useState(false);
  const [stripeConfirmErr, setStripeConfirmErr] = useState("");
  const [stripeOrderId, setStripeOrderId] = useState(null);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
```

Add one new state:
```js
  const [stripeConfirming, setStripeConfirming] = useState(false);
  const [stripeConfirmErr, setStripeConfirmErr] = useState("");
  const [stripeOrderId, setStripeOrderId] = useState(null);
  const [stripeCancelled, setStripeCancelled] = useState(false);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
```

- [ ] **Step 5.2: Set stripeCancelled on detection**

Find in the mount useEffect:
```js
    if (params.get("cancelled") === "1") {
      window.history.replaceState({}, "", "/");
    }
```

Replace with:
```js
    if (params.get("cancelled") === "1") {
      window.history.replaceState({}, "", "/");
      setStripeCancelled(true);
    }
```

- [ ] **Step 5.3: Pass stripeCancelled to Portal and render banner**

Find the Portal component call in the main render (around line 554):
```js
              stripeConfirming={stripeConfirming} stripeConfirmErr={stripeConfirmErr} stripeOrderId={stripeOrderId} />
```

Replace with:
```js
              stripeConfirming={stripeConfirming} stripeConfirmErr={stripeConfirmErr} stripeOrderId={stripeOrderId}
              stripeCancelled={stripeCancelled} setStripeCancelled={setStripeCancelled} />
```

- [ ] **Step 5.4: Add stripeCancelled to Portal function signature**

Find:
```js
function Portal({ step, setStep, goToStep, plan, selPlan, setSelPlan, lot, selLot, setSelLot, data, cart, setCart, total, addProd, inCart, order, payMethod, setPayMethod, placeOrder, reset, contact, setContact, lotAuthFile, setLotAuthFile, STEPS, pubConfig, orderCategory, setOrderCategory, stripeConfirming, stripeConfirmErr, stripeOrderId }) {
```

Replace with:
```js
function Portal({ step, setStep, goToStep, plan, selPlan, setSelPlan, lot, selLot, setSelLot, data, cart, setCart, total, addProd, inCart, order, payMethod, setPayMethod, placeOrder, reset, contact, setContact, lotAuthFile, setLotAuthFile, STEPS, pubConfig, orderCategory, setOrderCategory, stripeConfirming, stripeConfirmErr, stripeOrderId, stripeCancelled, setStripeCancelled }) {
```

- [ ] **Step 5.5: Render cancellation banner in Portal**

Inside Portal, immediately after the opening `<div>` of the return statement (before the `{step < 6 && ...}` steps bar), add:

```jsx
      {/* ── Stripe cancellation banner ── */}
      {stripeCancelled && (
        <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:"8px", padding:"14px 20px", marginBottom:"1.5rem", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"1rem" }}>
          <div>
            <span style={{ fontWeight:600, color:"#92400e" }}>Payment cancelled.</span>
            {" "}<span style={{ color:"#78350f", fontSize:"0.88rem" }}>Your order was not processed. You can review your selections and try again.</span>
          </div>
          <button onClick={() => setStripeCancelled(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"#92400e", fontSize:"1.2rem", lineHeight:1, padding:"0 4px", flexShrink:0 }} aria-label="Dismiss">×</button>
        </div>
      )}
```

---

### Task 6: Extended loading message during order placement

**Files:**
- Modify: `src/App.jsx`

**Context:** Orders with SMTP take ~9.5s. The button already shows a spinner but just says "Processing…". Add a sub-message below the button during placement.

- [ ] **Step 6.1: Add placing-message below the Confirm button**

Find the block around the Confirm Order button (near line 1147-1157):
```jsx
        </button>
      </div>
      <p style={{ fontSize:"0.72rem", color:"var(--muted)", textAlign:"center", marginTop:"0.75rem" }}>
        By placing your order, you agree to our{" "}
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"var(--sage)", textDecoration:"underline" }}>Privacy Policy</a>.
      </p>
```

Replace with:
```jsx
        </button>
      </div>
      {placing && (
        <p style={{ fontSize:"0.78rem", color:"var(--sage)", textAlign:"center", marginTop:"0.75rem", fontStyle:"italic" }}>
          Saving your order and sending confirmation email — this may take up to 15 seconds…
        </p>
      )}
      {!placing && (
        <p style={{ fontSize:"0.72rem", color:"var(--muted)", textAlign:"center", marginTop:"0.75rem" }}>
          By placing your order, you agree to our{" "}
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"var(--sage)", textDecoration:"underline" }}>Privacy Policy</a>.
        </p>
      )}
```

---

## Chunk 3: Low-Priority UX Fixes

### Task 7: Add missing statuses to admin filter dropdown

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 7.1: Add Pending and Processing options**

Find the status filter select (around line 1873-1880):
```jsx
              <option value="">All statuses</option>
              <option>Awaiting Payment</option>
              <option>Awaiting Stripe Payment</option>
              <option>Paid</option>
              <option>Issued</option>
              <option>Cancelled</option>
              <option>Invoice to be issued</option>
```

Replace with:
```jsx
              <option value="">All statuses</option>
              <option>Pending</option>
              <option>Processing</option>
              <option>Awaiting Payment</option>
              <option>Awaiting Stripe Payment</option>
              <option>Paid</option>
              <option>Issued</option>
              <option>Cancelled</option>
              <option>Invoice to be issued</option>
```

---

### Task 8: Add order deletion (admin only)

**Files:**
- Modify: `api/orders/[id]/[action].js`
- Modify: `src/App.jsx`

**Context:** There is no way to remove ghost/test orders. Add a `DELETE /api/orders/:id/delete` action (requires admin auth) and a "Delete" button in the admin order row (only shown for Cancelled orders, to prevent accidental deletion of active orders).

- [ ] **Step 8.1: Add delete action in [action].js**

In `api/orders/[id]/[action].js`, find the final line:
```js
  return res.status(404).json({ error: "Unknown action." });
```

Insert BEFORE it:
```js
  // ── DELETE /api/orders/:id/delete ────────────────────────────────────────
  // Admin only. Permanently removes an order from Redis.
  if (action === "delete" && req.method === "DELETE") {
    const token = extractToken(req);
    if (!(await validToken(token))) return res.status(401).json({ error: "Not authenticated." });

    const data = await readData();
    const idx = data.orders.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found." });

    data.orders.splice(idx, 1);
    await writeData(data);
    return res.status(200).json({ ok: true, deleted: id });
  }

```

- [ ] **Step 8.2: Add status whitelist validation on PUT status**

In the PUT /status handler, find:
```js
    const { status, note } = req.body || {};
    if (!status) return res.status(400).json({ error: "status is required." });
```

Replace with:
```js
    const { status, note } = req.body || {};
    if (!status) return res.status(400).json({ error: "status is required." });
    const VALID_STATUSES = ["Pending","Processing","Awaiting Payment","Awaiting Stripe Payment","Paid","Issued","Cancelled","Invoice to be issued","Invoice sent, awaiting payment"];
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(", ")}` });
```

- [ ] **Step 8.3: Add Delete button in admin order table**

Find the admin order table action buttons block (around line 1920-1930):
```jsx
                        {o.status !== "Issued" && o.status !== "Cancelled" && o.orderCategory !== "keys" && (
                          <button className="tbl-act-btn" ...>Send Cert</button>
```

Find the Cancel button near the end of the actions cell:
```jsx
                        {o.status !== "Cancelled" && (
                          <button className="tbl-act-btn danger" onClick={...}>Cancel</button>
                        )}
```

After the Cancel button block (but still inside the `<td>` actions cell), add a Delete button that only shows for Cancelled orders:
```jsx
                        {o.status === "Cancelled" && (
                          <button className="tbl-act-btn danger"
                            title="Permanently delete this cancelled order"
                            onClick={e => {
                              e.stopPropagation();
                              if (!window.confirm(`Permanently delete order ${o.id}? This cannot be undone.`)) return;
                              fetch(`/api/orders/${o.id}/delete`, { method: "DELETE", headers: { "Authorization": "Bearer " + adminToken } })
                                .then(r => r.json())
                                .then(d => {
                                  if (d.ok) {
                                    setData(p => ({ ...p, orders: p.orders.filter(x => x.id !== o.id) }));
                                    showAdminToast("ok", `Order ${o.id} deleted.`);
                                  } else {
                                    showAdminToast("err", d.error || "Delete failed.");
                                  }
                                })
                                .catch(() => showAdminToast("err", "Delete failed."));
                            }}>Delete</button>
                        )}
```

---

### Task 9: Add Privacy Policy link in footer

**Files:**
- Modify: `src/App.jsx`

**Context:** Privacy Policy is only linked from the payment step. Add a global footer link visible on all portal steps.

- [ ] **Step 9.1: Add footer element inside Portal return**

In the Portal component return, find the closing `</div>` of the main Portal wrapper (the very last `</div>` before the close of the Portal return). Add a footer before it:

Find (near the end of the Portal JSX):
```jsx
      {/* Mobile lot picker modal */}
```

Add immediately after the `{step === 6 && ...}` block and before the mobile modal comment (or at the very end of the Portal main div), a footer:

Actually, add it at the very end of the Portal return, just before the final `</div>`:

Search for the end of Portal's return — look for the closing brace pattern. The safest anchor is to find the line:
```jsx
      {/* Mobile lot picker modal */}
      {showLotModal && (
```

And add just BEFORE that comment:
```jsx
      {/* ── Global footer ── */}
      {step < 6 && (
        <div style={{ textAlign:"center", padding:"2rem 0 0.5rem", marginTop:"3rem", borderTop:"1px solid var(--border)", fontSize:"0.75rem", color:"var(--muted)" }}>
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color:"var(--muted)", textDecoration:"underline" }}>Privacy Policy</a>
          {" · "}TOCS Owner Corporation Services
        </div>
      )}

```

---

## Chunk 4: Build, Local Verification & SharePoint/Email Test

### Task 10: Build and local smoke test

- [ ] **Step 10.1: Build the frontend**
```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
```
Expected: `✅  Build complete → dist/`

- [ ] **Step 10.2: Start dev server**
Use `mcp__Claude_Preview__preview_start` with name "Vercel Dev (full stack)" (port 3000).

- [ ] **Step 10.3: Verify public data no longer exposes orders**
```bash
curl -s http://localhost:3000/api/data | python3 -c "import sys,json; d=json.load(sys.stdin); print('orders (unauth):', len(d['orders']))"
```
Expected: `orders (unauth): 0`

- [ ] **Step 10.4: Verify export works with Bearer token**
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"info@tocs.co","password":"Tocs@Vote"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/orders/export | tail -1
```
Expected: `200`

- [ ] **Step 10.5: Verify smtp.pass masked in settings GET**
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"info@tocs.co","password":"Tocs@Vote"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/config/settings | python3 -c "import sys,json; cfg=json.load(sys.stdin); print('smtp.pass:', cfg['smtp']['pass'])"
```
Expected: `smtp.pass: ••••••••` (or empty if no password configured)

- [ ] **Step 10.6: Verify ghost order prevention — Stripe order with no key**

On dev server (no STRIPE_SECRET_KEY set), place a Stripe order and check it is NOT saved:
```bash
BEFORE=$(curl -s http://localhost:3000/api/data | python3 -c "import sys,json; print(len(json.load(sys.stdin)['orders']))")

curl -s -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"order":{"id":"GHOST-TEST-001","payment":"stripe","total":55,"status":"Awaiting Stripe Payment","items":[{"productName":"Test","price":55}],"contactInfo":{"name":"Ghost"}}}' \
  | python3 -m json.tool

AFTER=$(curl -s http://localhost:3000/api/data | python3 -c "import sys,json; print(len(json.load(sys.stdin)['orders']))")
echo "Orders before: $BEFORE, after: $AFTER (should be equal)"
```
Expected: error response + orders count unchanged

---

### Task 11: Deploy to production

- [ ] **Step 11.1: Deploy**
```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod 2>&1
```
Expected: `Aliased: https://occorder.vercel.app`

- [ ] **Step 11.2: Smoke test production public data endpoint**
```bash
curl -s https://occorder.vercel.app/api/data | python3 -c "import sys,json; d=json.load(sys.stdin); print('strataPlans:', len(d['strataPlans']), '| orders (public):', len(d['orders']))"
```
Expected: `strataPlans: N | orders (public): 0`

---

## Chunk 5: SharePoint & Email Verification

### Task 12: Verify SharePoint uploads and email attachment

**Context:** The E2E agent confirmed SP uploads were working based on audit log. This task does a direct, explicit verification to confirm:
1. Authority doc is uploaded to SharePoint under the correct folder path
2. Order summary PDF is uploaded to SharePoint
3. The admin notification email includes the authority doc as an attachment

- [ ] **Step 12.1: Place a test OCC order WITH authority doc via API**

Use the production endpoint to place a real order with a base64-encoded test PDF:
```bash
# Create a minimal valid PDF in base64
PDF_B64=$(python3 -c "
import base64
pdf = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
print(base64.b64encode(pdf).decode())
")

ORDER_ID="VERIFY-SP-$(date +%s)"

curl -s -X POST https://occorder.vercel.app/api/orders \
  -H "Content-Type: application/json" \
  -d "{
    \"order\": {
      \"id\": \"$ORDER_ID\",
      \"date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"payment\": \"bank\",
      \"status\": \"Awaiting Payment\",
      \"total\": 220.00,
      \"orderCategory\": \"certificates\",
      \"contactInfo\": {
        \"name\": \"SP Verify Test\",
        \"email\": \"matthew.he@tocs.co\",
        \"phone\": \"0400000000\",
        \"companyName\": \"TOCS Test\"
      },
      \"items\": [{
        \"productName\": \"OC Certificate — Standard\",
        \"ocName\": \"OC-A — Owner Corporation A\",
        \"planName\": \"Harbour View Residences\",
        \"price\": 220.00
      }]
    },
    \"lotAuthority\": {
      \"filename\": \"test-authority.pdf\",
      \"contentType\": \"application/pdf\",
      \"data\": \"$PDF_B64\"
    }
  }" | python3 -m json.tool

echo "Order ID: $ORDER_ID"
```

Expected: `{ "ok": true, ... }`

- [ ] **Step 12.2: Check audit log to confirm SharePoint uploads**
```bash
TOKEN=$(curl -s -X POST https://occorder.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"info@tocs.co","password":"Tocs@Vote"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# Fetch orders and find our test order
curl -s -H "Authorization: Bearer $TOKEN" "https://occorder.vercel.app/api/data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
orders = d.get('orders', [])
sp_orders = [o for o in orders if 'VERIFY-SP' in o.get('id','')]
for o in sp_orders[:1]:
    print('Order:', o['id'])
    print('lotAuthorityUrl:', o.get('lotAuthorityUrl', 'NOT SET'))
    print('summaryUrl:', o.get('summaryUrl', 'NOT SET'))
    print('Audit log:')
    for e in o.get('auditLog', []):
        print('  ', e.get('ts',''), '|', e.get('action',''), '|', e.get('note',''))
"
```

Expected output:
```
Order: VERIFY-SP-...
lotAuthorityUrl: https://... (SharePoint URL)
summaryUrl: https://... (SharePoint URL)
Audit log:
  ... | Order created | ...
  ... | Authority doc saved to Redis | ...
  ... | Authority doc saved to SharePoint | https://...
  ... | Order summary saved to SharePoint | https://...
```

If SP URLs are missing, check Vercel function logs.

- [ ] **Step 12.3: Verify authority document is accessible via admin**

If `lotAuthorityUrl` was set in step 12.2, confirm the redirect works:
```bash
TOKEN=$(curl -s -X POST https://occorder.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"info@tocs.co","password":"Tocs@Vote"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# Use ORDER_ID from step 12.1
curl -s -o /dev/null -w "%{http_code} → %{redirect_url}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://occorder.vercel.app/api/orders/VERIFY-SP-XXXXX/authority"
```
Expected: `302 → https://sharepoint.com/...`

- [ ] **Step 12.4: Check email was received at matthew.he@tocs.co**

Ask user to confirm:
- Admin notification email received
- Authority doc (`test-authority.pdf`) is attached to the email
- Customer confirmation email received at matthew.he@tocs.co (used as customer email in test)

---

## Chunk 6: Comprehensive Multi-Scenario E2E Test

### Task 13: Full E2E test via subagent

Launch a comprehensive E2E testing agent covering:

1. **OCC Standard Order (bank transfer)** — with authority doc
2. **OCC Urgent Order (PayID)** — without authority doc
3. **Keys/Fobs Order** — invoice flow
4. **Stripe Order (no key)** — should return error without creating ghost order
5. **Admin flows** — login, view order, mark paid, filter by status, export CSV, cancel order, delete cancelled order
6. **Privacy policy** — accessible from footer link and payment step
7. **Stripe cancel UX** — landing page shows cancellation banner

The subagent should:
- Test each scenario via direct API calls (curl) and note results
- Log pass/fail for each scenario
- Report any remaining gaps

Output: structured pass/fail report.
