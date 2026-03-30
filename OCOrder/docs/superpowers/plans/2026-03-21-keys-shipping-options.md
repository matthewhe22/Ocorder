# Keys/Fob Shipping Options Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four fixed shipping method options (Pick up from BM, Standard Delivery, Express Delivery, No Shipment Required) to the Keys/Fob order flow, with per-plan cost configuration in the admin panel.

**Architecture:** Four shipping constants are defined client-side; costs for the two paid options (Standard / Express) are stored in a new `keysShipping` field on each plan in Redis. The customer sees a shipping method selector on Step 4 of the keys order flow, and address fields appear only for delivery options. Admin configures costs via a new "Keys Shipping" modal in the Plans tab.

**Tech Stack:** React 18 (src/App.jsx, single file), Vercel Serverless (api/_lib/store.js for migration), Redis/Upstash KV.

---

## Chunk 1: Data model + admin UI

### Task 1: Add `keysShipping` migration to store.js

**Files:**
- Modify: `api/_lib/store.js` (migration block ~line 209)

- [ ] **Step 1: Read the migration block in store.js**

  Open `api/_lib/store.js` and locate the `// Migrate missing shippingOptions field` block (~line 209). Understand the pattern — a `if (!field) { field = default; migrated = true; }` guard followed by `await writeData(data)` if `migrated`.

- [ ] **Step 2: Add keysShipping migration**

  The existing migration loop (lines 197–215) only visits plans that match `DEFAULT_DATA.strataPlans` by ID. Custom plans added by the admin exist only in Redis and are never visited by that loop. Therefore `keysShipping` must be migrated in a **separate loop** that iterates all stored plans directly.

  After the existing `for (const defPlan of DEFAULT_DATA.strataPlans)` loop closing `}` at line 215, and **before** the `if (migrated)` block at line 216, insert:

  ```js
  // Migrate keysShipping on ALL stored plans (incl. custom plans not in DEFAULT_DATA).
  for (const plan of (d.strataPlans || [])) {
    if (!plan.keysShipping) {
      plan.keysShipping = { deliveryCost: 0, expressCost: 0 };
      migrated = true;
    }
  }
  ```

- [ ] **Step 3: Verify migration runs cleanly**

  Start the dev server (`vercel dev`) and open the admin panel. Navigate to Plans — no crash. Check that the browser network tab shows `keysShipping` on plan objects returned from `/api/data` (after first request triggers migration write).

---

### Task 2: Add Keys Shipping admin modal (App.jsx)

**Files:**
- Modify: `src/App.jsx`

Four sub-steps: button, state, save function, modal JSX.

- [ ] **Step 1: Add "Keys Shipping" button to the Plans tab row**

  In the Plans tab, find the existing `openManageShipping` button (search for `"manageShipping"` or `"Shipping"`). It looks like:
  ```jsx
  <button ... onClick={() => openManageShipping(p)}>Shipping</button>
  ```
  Add a sibling button immediately after it:
  ```jsx
  <button className="tbl-act-btn"
    style={{ background:"#e8f4f0", color:"#1c5c40", border:"1px solid #b0d9c8" }}
    onClick={() => openKeysShipping(p)}>
    <Ic n="truck" s={13}/> Keys Shipping
  </button>
  ```

- [ ] **Step 2: Add openKeysShipping handler**

  Near the existing `openManageShipping` function (~line 1668), add:
  ```js
  const openKeysShipping = (p) => {
    setEditTarget({ type: "plan", id: p.id });
    setForm({
      keysDeliveryCost: p.keysShipping?.deliveryCost ?? 0,
      keysExpressCost:  p.keysShipping?.expressCost  ?? 0,
    });
    setModal("keysShipping");
  };
  ```

- [ ] **Step 3: Add saveKeysShipping handler**

  Immediately after `openKeysShipping`, add:
  ```js
  const saveKeysShipping = async () => {
    const deliveryCost = Math.max(0, parseFloat(form.keysDeliveryCost) || 0);
    const expressCost  = Math.max(0, parseFloat(form.keysExpressCost)  || 0);
    const plans = data.strataPlans.map(p =>
      p.id !== editTarget.id ? p
        : { ...p, keysShipping: { deliveryCost, expressCost } }
    );
    await savePlans(plans);
    setModal(null);
    setEditTarget(null);
    setForm({});
  };
  ```

- [ ] **Step 4: Add the keysShipping modal JSX**

  Find the closing `})()}` of the existing `modal === "manageShipping"` block (~line 2512). Immediately after it, add:

  ```jsx
  {modal === "keysShipping" && editTarget && (() => {
    const targetPlan = data.strataPlans.find(p => p.id === editTarget.id);
    return (
      <div className="overlay" onClick={() => { setModal(null); setEditTarget(null); setForm({}); }}>
        <div className="modal" style={{ maxWidth: "420px" }} onClick={e => e.stopPropagation()}>
          <h2 className="modal-tt">Keys Shipping Costs — {targetPlan?.name}</h2>
          <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1rem" }}>
            Set delivery costs for Keys / Fob orders on this plan. Pick-up and No Shipment are always $0.
          </p>

          {/* Fixed $0 options (read-only) */}
          <table className="tbl" style={{ marginBottom: "1rem" }}>
            <thead><tr><th>Option</th><th>Cost</th></tr></thead>
            <tbody>
              <tr><td>Pick up from BM</td><td style={{ color:"var(--muted)" }}>$0.00 (fixed)</td></tr>
              <tr><td>No Shipment Required</td><td style={{ color:"var(--muted)" }}>$0.00 (fixed)</td></tr>
            </tbody>
          </table>

          {/* Configurable options */}
          <div className="form-row">
            <label className="f-label">Standard Delivery cost ($)</label>
            <input className="f-input" type="number" min="0" step="0.01" placeholder="0.00"
              value={form.keysDeliveryCost ?? ""}
              onChange={e => upd("keysDeliveryCost", e.target.value)}/>
          </div>
          <div className="form-row">
            <label className="f-label">Express Delivery cost ($)</label>
            <input className="f-input" type="number" min="0" step="0.01" placeholder="0.00"
              value={form.keysExpressCost ?? ""}
              onChange={e => upd("keysExpressCost", e.target.value)}/>
          </div>

          <div style={{ display:"flex", gap:"8px", marginTop:"1rem" }}>
            <button className="btn btn-blk" style={{ flex:1, justifyContent:"center" }}
              onClick={saveKeysShipping}>
              Save
            </button>
            <button className="btn btn-out" onClick={() => { setModal(null); setEditTarget(null); setForm({}); }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  })()}
  ```

- [ ] **Step 5: Manual verify admin modal**

  Open the dev server, go to Admin → Plans, click "Keys Shipping" on any plan. Confirm modal opens, costs default to 0, entering values and clicking Save updates the plan (verify via network tab that `/api/plans` receives correct payload).

---

## Chunk 2: Customer UI

### Task 3: Define keys shipping constants and selector (App.jsx)

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add KEYS_SHIPPING_OPTIONS constant**

  Near the top of `App.jsx`, after the existing constants (e.g. near `calcShippingCost` ~line 65), add:

  ```js
  // Fixed shipping options for Keys/Fob orders.
  // Costs for "keys-std" and "keys-express" come from plan.keysShipping.
  const KEYS_SHIPPING_OPTIONS = [
    { id: "keys-pickup",  name: "Pick up from BM",       requiresAddress: false },
    { id: "keys-std",     name: "Standard Delivery",      requiresAddress: true  },
    { id: "keys-express", name: "Express Delivery",       requiresAddress: true  },
    { id: "keys-none",    name: "No Shipment Required",   requiresAddress: false },
  ];
  ```

- [ ] **Step 2: Add helper to resolve keys shipping cost**

  Immediately after `KEYS_SHIPPING_OPTIONS`, add:
  ```js
  const getKeysShippingCost = (optId, keysShipping) => {
    if (optId === "keys-std")     return keysShipping?.deliveryCost ?? 0;
    if (optId === "keys-express") return keysShipping?.expressCost  ?? 0;
    return 0; // pickup and none are always $0
  };
  ```

- [ ] **Step 3: Add shipping method selector to Step 4 (keys orders)**

  Find the keys shipping address block (~line 1109):
  ```jsx
  {/* ── Shipping Address (keys orders only) ── */}
  {orderCategory === "keys" && (
    <>
      <div ...>Shipping Address</div>
      ...address fields...
    </>
  )}
  ```

  Replace this entire block with:

  ```jsx
  {/* ── Shipping Method + Address (keys orders only) ── */}
  {orderCategory === "keys" && (
    <>
      {/* Shipping Method selector */}
      <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", margin: "1.2rem 0 0.8rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        Shipping Method
      </div>
      {KEYS_SHIPPING_OPTIONS.map(opt => {
        const cost = getKeysShippingCost(opt.id, plan?.keysShipping);
        const isSelected = selectedShipping?.id === opt.id;
        return (
          <label key={opt.id} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"10px 14px", border:`1px solid ${isSelected ? "var(--sage)" : "var(--border)"}`, borderRadius:"4px", cursor:"pointer", marginBottom:"6px", background: isSelected ? "var(--sage-tint)" : "white" }}>
            <input type="radio" name="keysShipping" checked={isSelected}
              onChange={() => setSelectedShipping({ id: opt.id, name: opt.name, cost, requiresAddress: opt.requiresAddress })}
              style={{ accentColor:"var(--sage)" }}/>
            <span style={{ flex:1, fontSize:"0.88rem" }}>{opt.name}</span>
            <span style={{ fontWeight:600, fontSize:"0.88rem" }}>{cost > 0 ? fmt(cost) : <span style={{ color:"var(--muted)" }}>Free</span>}</span>
          </label>
        );
      })}

      {/* Shipping Address — only shown when delivery option selected */}
      {selectedShipping?.requiresAddress && (
        <>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", margin: "1.2rem 0 0.8rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
            Delivery Address
          </div>
          <div className="form-row">
            <label className="f-label">Street Address *</label>
            <input className="f-input" type="text" placeholder="123 Example Street"
              value={contact.shippingAddress.street}
              onChange={e => setContact(p => ({...p, shippingAddress: {...p.shippingAddress, street: e.target.value}}))}/>
          </div>
          <div className="form-row">
            <label className="f-label">Suburb *</label>
            <input className="f-input" type="text" placeholder="Sydney"
              value={contact.shippingAddress.suburb}
              onChange={e => setContact(p => ({...p, shippingAddress: {...p.shippingAddress, suburb: e.target.value}}))}/>
          </div>
          <div style={{ display:"flex", gap:"12px" }}>
            <div className="form-row" style={{ flex:2, marginBottom:0 }}>
              <label className="f-label">State *</label>
              <select className="f-input" value={contact.shippingAddress.state}
                onChange={e => setContact(p => ({...p, shippingAddress: {...p.shippingAddress, state: e.target.value}}))}>
                {["NSW","VIC","QLD","SA","WA","TAS","ACT","NT"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-row" style={{ flex:1, marginBottom:0 }}>
              <label className="f-label">Postcode *</label>
              <input className="f-input" type="text" maxLength={4} placeholder="2000"
                value={contact.shippingAddress.postcode}
                onChange={e => setContact(p => ({...p, shippingAddress: {...p.shippingAddress, postcode: e.target.value}}))}/>
            </div>
          </div>
        </>
      )}
    </>
  )}
  ```

- [ ] **Step 4: Update the Submit button validation for keys**

  Find the keys submit button (~line 1145):
  ```jsx
  disabled={!contact.name || !contact.email || !emailValid || keysPlacing || !contact.shippingAddress.street || !contact.shippingAddress.suburb || !contact.shippingAddress.postcode}
  ```

  Replace with:
  ```jsx
  disabled={
    !contact.name || !contact.email || !emailValid || keysPlacing ||
    !selectedShipping ||
    (selectedShipping?.requiresAddress && (
      !contact.shippingAddress.street ||
      !contact.shippingAddress.suburb ||
      !contact.shippingAddress.postcode
    ))
  }
  ```

- [ ] **Step 5: Update shippingAddress serialisation in placeOrder**

  Find (~line 516):
  ```js
  shippingAddress: orderCategory === "keys" ? contact.shippingAddress : undefined,
  ```

  Replace with:
  ```js
  shippingAddress: (orderCategory === "keys" && selectedShipping?.requiresAddress)
    ? contact.shippingAddress
    : undefined,
  ```

- [ ] **Step 6: Auto-select first keys shipping option on Step 4**

  Find the existing `useEffect` that auto-selects the first OC shipping option (~line 553):
  ```js
  useEffect(() => {
    if (step !== 3) return;
    const planShipping = plan?.shippingOptions || [];
    if (planShipping.length > 0 && !selectedShipping) {
      ...
    }
  }, [step, plan?.id]);
  ```

  Add a **separate** `useEffect` immediately after it for keys shipping auto-selection:
  ```js
  // Auto-select "Pick up from BM" when customer reaches Step 4 for a keys order
  useEffect(() => {
    if (step !== 4 || orderCategory !== "keys" || selectedShipping) return;
    const opt = KEYS_SHIPPING_OPTIONS[0]; // "Pick up from BM"
    setSelectedShipping({ id: opt.id, name: opt.name, cost: 0, requiresAddress: false });
  }, [step, orderCategory, selectedShipping]);
  ```

  This ensures the Submit button is not permanently disabled on first render of Step 4. `selectedShipping` is included in the dep array to avoid stale closure bugs.

- [ ] **Step 7: Reset selectedShipping when category changes**

  Find the category selector buttons (~line 740–741):
  ```jsx
  onClick={() => { setOrderCategory("keys"); setCart([]); }}
  ```

  Update to also clear selectedShipping:
  ```jsx
  onClick={() => { setOrderCategory("keys"); setCart([]); setSelectedShipping(null); }}
  ```

  Do the same for the "oc" button:
  ```jsx
  onClick={() => { setOrderCategory("oc"); setCart([]); setSelectedShipping(null); }}
  ```

- [ ] **Step 8: Manual verify customer flow**

  1. Start dev server
  2. Place a keys/fob order — confirm Step 4 shows "Shipping Method" with 4 options
  3. Select "Pick up from BM" → address fields hidden, Submit enabled (once name/email filled)
  4. Select "Standard Delivery" → address fields appear, Submit disabled until address filled
  5. Select "Express Delivery" → address fields appear
  6. Select "No Shipment Required" → address fields hidden
  7. Submit a keys order with "Standard Delivery" — confirm admin sees `selectedShipping: { id: "keys-std", name: "Standard Delivery", cost: <plan cost>, requiresAddress: true }` in the order and `shippingAddress` populated
  8. Submit a keys order with "Pick up from BM" — confirm `shippingAddress` is absent from order

---

## Chunk 3: Deploy

### Task 4: Build and deploy

- [ ] **Step 1: Deploy to production**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod
  ```

  Expected: successful deploy aliased to `https://occorder.vercel.app`

- [ ] **Step 2: Smoke-test production**

  1. Open `https://occorder.vercel.app`, select a plan, choose "Keys / Fobs / Remotes"
  2. Add an item to cart, proceed to Step 4
  3. Confirm shipping method selector is visible with all 4 options
  4. Confirm address fields show/hide correctly per selection
  5. In admin panel → Plans → Keys Shipping: set a delivery cost, confirm it appears next to "Standard Delivery" in the customer flow

