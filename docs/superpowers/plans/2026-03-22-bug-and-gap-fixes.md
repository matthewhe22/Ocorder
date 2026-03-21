# Bug & Gap Fixes — E2E Test Findings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 4 bugs and 5 actionable UX gaps identified in the E2E test of the TOCS Order Platform.

**Architecture:** All changes are confined to a single file — `src/App.jsx` (~3000 lines). The file contains the CSS const string, all React components, and all JSX rendered inline inside the main `Portal` function. After each task, rebuild with `node build.mjs` and verify visually. Deploy once at the end with `vercel --prod`.

**Tech Stack:** React 18 (no JSX transform — uses `React.createElement` via esbuild), esbuild bundler (`build.mjs`), Vercel serverless, no test framework.

---

## Scope

### What is being fixed

| # | Type | Item |
|---|---|---|
| Bug 1 | HIGH | Levy notice warning missing for OC + Owner applicant (silent block) |
| Bug 2 | MED | "ORDER PORTAL" header button doesn't restart the wizard when mid-order |
| Bug 3 | LOW | Keys order Step 3 review doesn't show item quantity |
| Bug 4 | LOW | Animation slide 3 hardcodes "Stripe" regardless of `stripeEnabled` flag |
| Gap 1 | UX | Admin keys shipping modal: no warning when delivery costs are $0 |
| Gap 2 | UX | Payment step: narrow 560px max-width feels unbalanced at wide viewports |
| Gap 3 | UX | No "Start New Order" / reset button visible during checkout |
| Gap 4 | UX | Contact step: name field has no inline error; errors only show after blur |
| Gap 5 | UX | Payment step: no notice when Stripe card payment is disabled |

### What is NOT being fixed (confirmed non-issues)
- Gap 6 ("Forgot password?" is non-clickable) — **FALSE POSITIVE**: code already has `<a href="mailto:info@tocs.co">`. No fix needed.
- Gap 7 (Recent order banner) — test limitation, code is already correct.
- Gap 8 (Mobile responsive) — CSS media query already present. No fix needed.

---

## File to Modify

| File | Responsibility |
|---|---|
| `src/App.jsx` | All CSS, all components, all JSX — single source of truth |

Build command: `PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs`
Deploy command: `PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod`

---

## Chunk 1: Bugs 1–4

---

### Task 1: Bug 1 — Levy notice warning for OC + Owner applicant

**File:** `src/App.jsx` ~lines 1097–1106

**Context:** Two warning blocks exist in the Step 2 validation area:
- Lines 1097–1101: warns when `(orderCategory === "keys" || applicantType === "agent") && !lotAuthFile`
- Lines 1102–1106: warns when `applicantType === "owner" && !contact.ownerName`

There is NO warning when `orderCategory === "oc" && applicantType === "owner" && !lotAuthFile`. The button at line 1112 correctly blocks on `!lotAuthFile` but no message tells the user why. Insert the new warning **between** these two existing blocks — after line 1101's closing `)}` and before line 1102's opening `{selLot && contact.applicantType === "owner" && !contact.ownerName`.

- [ ] **Step 1: Find the two existing warning blocks**

  Find this exact sequence (~lines 1097–1106):
  ```jsx
  {selLot && (orderCategory === "keys" || contact.applicantType === "agent") && !lotAuthFile && (
    <div className={`alert alert-warn${step2Attempted ? " pulse-warn" : ""}`} style={{ marginBottom: "8px" }}>
      <Ic n="shield" s={13}/> {contact.applicantType === "agent" ? "An authorisation document..." : "An authority document..."}
    </div>
  )}
  {selLot && contact.applicantType === "owner" && !contact.ownerName && (
    <div className={`alert alert-warn${step2Attempted ? " pulse-warn" : ""}`} style={{ marginBottom: "8px" }}>
      <Ic n="x" s={13}/> Owner Name is required...
    </div>
  )}
  ```

- [ ] **Step 2: Insert the new OC + Owner levy notice warning between the two blocks**

  Between the closing `)}` of the first block (line 1101) and the opening `{selLot && contact.applicantType === "owner" && !contact.ownerName` of the second block (line 1102), insert:
  ```jsx
  {selLot && orderCategory === "oc" && contact.applicantType === "owner" && !lotAuthFile && (
    <div className={`alert alert-warn${step2Attempted ? " pulse-warn" : ""}`} style={{ marginBottom: "8px" }}>
      <Ic n="shield" s={13}/> A Levy Notice is required when applying as an Owner. Please upload it in the Applicant Details section above.
    </div>
  )}
  ```

- [ ] **Step 3: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 4: Verify visually**

  Step 2 → select lot → set applicant type to "Owner" → leave levy notice empty → add a product → click "Review Order". Confirm yellow banner: *"A Levy Notice is required when applying as an Owner..."*

---

### Task 2: Bug 2 — "ORDER PORTAL" resets wizard to Step 1

**File:** `src/App.jsx` ~line 656

**Context:** The "Order Portal" button in the `App` component's header only calls `setCurrentView("portal")`. `search` and `setSearch` are declared inside the `Portal` function (not in `App`) so they are **not in scope** at line 656. Fix resets only the state that is in scope at `App` level: `step`, `cart`, `selPlan`, `selLot`, `orderCategory`. The `search` field will clear naturally when the user types a new query on Step 1.

The reset only triggers when `currentView === "portal"` and `step > 1` — i.e. when the user is already in the portal mid-order and clicks the button. Clicking from admin → portal (navigational) is unaffected.

- [ ] **Step 1: Find the ORDER PORTAL button (~line 656)**

  Find:
  ```jsx
  <button className={`hn ${currentView === "portal" ? "act" : ""}`} onClick={() => setCurrentView("portal")}>
    <Ic n="doc" s={14}/> Order Portal
  </button>
  ```

- [ ] **Step 2: Update onClick — reset wizard state (no `setSearch`)**

  Replace the `onClick` with:
  ```jsx
  onClick={() => {
    if (currentView === "portal" && step > 1) {
      setStep(1);
      setCart([]);
      setSelPlan(null);
      setSelLot(null);
      setOrderCategory(null);
    }
    setCurrentView("portal");
  }}
  ```

- [ ] **Step 3: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 4: Verify visually**

  Advance to Step 4, then click "Order Portal" in the header. Confirm the wizard returns to Step 1 with no plan selected.

---

### Task 3: Bug 3 — Show quantity in Step 3 review for keys items

**File:** `src/App.jsx` ~line 1161

**Context:** The cart-item review in Step 3 renders `item.productName` but not `item.qty`. Keys items have a `qty` field. Show it after the product name when qty > 1.

- [ ] **Step 1: Find the cart item name rendering (~line 1161)**

  Find:
  ```jsx
  <div className="ci-name">{item.productName}{item.isSecondaryOC && <span style={{fontSize:"0.68rem",color:"var(--sage)",marginLeft:"6px",fontWeight:500}}>Additional OC rate</span>}</div>
  ```

- [ ] **Step 2: Add quantity display**

  Replace that line with:
  ```jsx
  <div className="ci-name">
    {item.productName}
    {item.qty && item.qty > 1 && (
      <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontWeight: 400, marginLeft: "6px" }}>× {item.qty}</span>
    )}
    {item.isSecondaryOC && <span style={{ fontSize: "0.68rem", color: "var(--sage)", marginLeft: "6px", fontWeight: 500 }}>Additional OC rate</span>}
  </div>
  ```

- [ ] **Step 3: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 4: Verify visually**

  Keys flow → add a key with qty 3 → Step 3 review → confirm "Building Entry Key × 3".

---

### Task 4: Bug 4 — Animation slide 3 conditionally shows Stripe

**File:** `src/App.jsx` — `story-slide slide-3` JSX in Step 1 render (~line 804)

**Context:** Slide 3 hardcodes `"Bank transfer · PayID · Stripe"`. The `pubConfig` state is declared at `Portal`-function level and is directly accessible in the Step 1 JSX where the animation renders.

- [ ] **Step 1: Find the animation slide 3**

  Find:
  ```jsx
  <div className="story-slide slide-3">
    <div className="story-step">Step 3 of 4</div>
    <div className="story-icon">💳</div>
    <div className="story-title">Pay Your Way</div>
    <div className="story-desc">Bank transfer · PayID · Stripe</div>
  </div>
  ```

- [ ] **Step 2: Make the description dynamic**

  Replace only the `story-desc` div:
  ```jsx
  <div className="story-desc">
    {pubConfig?.stripeEnabled
      ? "Bank transfer · PayID · Stripe"
      : "Bank transfer · PayID"}
  </div>
  ```

- [ ] **Step 3: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 4: Verify visually**

  Home page → wait for slide 3. Since Stripe is currently disabled, confirm it shows "Bank transfer · PayID" (no Stripe).

---

## Chunk 2: Gaps 1–5

---

### Task 5: Gap 1 — Admin keys shipping modal $0 cost warning

**File:** `src/App.jsx` — admin plans tab, keys shipping modal (~line 2750)

**Context:** The keys shipping cost inputs have no validation. Add a yellow warning when both `deliveryCost` and `expressCost` are 0 (or empty).

- [ ] **Step 1: Find the Express Delivery input's closing form-row**

  Find the block ending with:
  ```jsx
  <label className="f-label">Express Delivery cost ($)</label>
  <input className="f-input" type="number" min="0" step="0.01" placeholder="0.00"
    value={form.keysExpressCost ?? ""}
    onChange={e => upd("keysExpressCost", e.target.value)}/>
  </div>
  ```
  (The `</div>` closes the `form-row` div for Express Delivery.)

- [ ] **Step 2: Add the $0 warning banner immediately after that closing `</div>`**

  ```jsx
  {(!form.keysDeliveryCost || Number(form.keysDeliveryCost) === 0) &&
   (!form.keysExpressCost  || Number(form.keysExpressCost)  === 0) && (
    <div className="alert alert-warn" style={{ marginTop: "10px", fontSize: "0.78rem" }}>
      <Ic n="shield" s={13}/> Both delivery costs are $0. Customers will see "Free" for Standard and Express delivery. Update these if delivery fees apply.
    </div>
  )}
  ```

- [ ] **Step 3: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 4: Verify visually**

  Admin → Plans → Keys Shipping modal. Confirm yellow warning appears when both costs are 0. Set one cost > 0 — confirm warning disappears.

---

### Task 6: Gap 2 — Payment step wider layout with order summary sidebar

**File:** `src/App.jsx` — `PaymentStep` function (~lines 1427–1524)

**Context:** `PaymentStep` returns a single `<div style={{ maxWidth: "560px" }}>` that wraps everything. The closing `</div>` of this wrapper is at approximately line 1524, just after the inline `<style>{...}</style>` tag (the last element inside the component). Convert to a two-column grid: the existing content becomes the left column; a new order summary card becomes the right column.

- [ ] **Step 1: Find the PaymentStep function signature and outer wrapper**

  Find:
  ```jsx
  function PaymentStep({ cart, total, contact, payMethod, setPayMethod, onBack, placeOrder, pubConfig, selectedShipping }) {
    return (
      <div style={{ maxWidth: "560px" }}>
  ```

- [ ] **Step 2: Replace outer `<div>` with a two-column grid wrapper**

  Replace `<div style={{ maxWidth: "560px" }}>` with:
  ```jsx
  <div className="payment-grid" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "32px", alignItems: "start" }}>
  ```

- [ ] **Step 3: Wrap all existing content in the left column**

  Immediately after the new opening grid `<div>`, add:
  ```jsx
  <div>{/* left column — all existing content */}
  ```

  Then find the closing `</div>` of the old outer wrapper (after the inline `<style>` tag, at approximately line 1524). Replace that single `</div>` with:
  ```jsx
  </div>{/* end left column */}
  ```

- [ ] **Step 4: Add the right column order summary**

  Immediately after `</div>{/* end left column */}` and before the grid's closing `</div>`, insert:
  ```jsx
  {/* right column — order summary */}
  <div style={{ background: "var(--sage-tint)", border: "1.5px solid var(--border2)", borderRadius: "10px", padding: "20px", position: "sticky", top: "20px" }}>
    <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sage)", marginBottom: "14px" }}>Order Summary</div>
    {cart.map((item, i) => (
      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "8px", gap: "8px" }}>
        <span style={{ color: "var(--ink)" }}>
          {item.productName}{item.qty && item.qty > 1 ? ` × ${item.qty}` : ""}
        </span>
        <span style={{ color: "var(--forest)", fontWeight: 600, flexShrink: 0 }}>{fmt(item.price)}</span>
      </div>
    ))}
    {selectedShipping && selectedShipping.cost > 0 && (
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "8px" }}>
        <span style={{ color: "var(--muted)" }}>{selectedShipping.label}</span>
        <span style={{ color: "var(--forest)", fontWeight: 600 }}>{fmt(selectedShipping.cost)}</span>
      </div>
    )}
    <div style={{ borderTop: "1px solid var(--border2)", marginTop: "10px", paddingTop: "10px", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "0.88rem" }}>
      <span style={{ color: "var(--forest)" }}>Total (incl. GST)</span>
      <span style={{ color: "var(--forest)" }}>{fmt(total)}</span>
    </div>
  </div>
  ```

- [ ] **Step 5: Add responsive CSS**

  In the CSS const string, after the existing `@media(max-width:640px)` rule, add:
  ```css
  @media(max-width:800px){ .payment-grid{ grid-template-columns:1fr !important; } }
  ```

- [ ] **Step 6: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 7: Verify visually**

  Payment step at wide viewport: left column = payment options, right column = order summary. At < 800px: columns stack vertically.

---

### Task 7: Gap 3 — "Start New Order" button beside the step bar

**File:** `src/App.jsx` — `Portal` function, step bar at `<div className="steps">` (~line 740)

**Context:** The step bar renders inside `{step < 6 && (...)}`. The outer wrapper is `<div className="steps">` at approximately line 740, closing at approximately line 762. Add a "↩ Start New Order" ghost button to the right of the step bar using a flex wrapper, visible only when `step > 1`. Note: `search`/`setSearch` are in `Portal` scope here, so they CAN be included in the reset.

- [ ] **Step 1: Find `<div className="steps">` (~line 740)**

  Find:
  ```jsx
  {step < 6 && (
    ...
    <div className="steps">
      {[...].map(...)}  {/* step dots */}
    </div>
    ...
  )}
  ```
  Confirm you have the opening `<div className="steps">` and its closing `</div>` (~line 762).

- [ ] **Step 2: Wrap the `<div className="steps">` in a flex container and add the reset button**

  Replace the `<div className="steps">` wrapper (keeping its children unchanged) with:
  ```jsx
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
    <div className="steps">
      {/* … existing step dots unchanged … */}
    </div>
    {step > 1 && (
      <button
        style={{ fontSize: "0.72rem", color: "var(--muted)", background: "none", border: "1px solid var(--border)", borderRadius: "5px", padding: "5px 12px", cursor: "pointer", letterSpacing: "0.04em" }}
        onClick={() => {
          setStep(1);
          setCart([]);
          setSelPlan(null);
          setSelLot(null);
          setOrderCategory(null);
          setSearch("");
        }}
      >
        ↩ Start New Order
      </button>
    )}
  </div>
  ```

  > `setSearch` is valid here because this code is inside the `Portal` function where `search`/`setSearch` are declared.

  > If the existing `<div className="steps">` already has a `marginBottom` style, remove it — the outer flex wrapper now owns the bottom margin.

- [ ] **Step 3: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 4: Verify visually**

  Advance to Step 3. Confirm "↩ Start New Order" appears at the right of the step bar. Click it — wizard resets to Step 1 with cleared search and no plan selected.

---

### Task 8: Gap 4 — Contact step inline name error + reveal errors on blocked-click

**File:** `src/App.jsx` — `Portal` function, Step 4 contact form (~lines 1233–1355)

**Context:** There is NO separate `ContactStep` component. All Step 4 contact UI is rendered inline inside the `Portal` function. The `phoneTouched` and `emailTouched` states are declared at **Portal level** (~line 699). New states must be added at the same level.

The "Choose Payment" button (OC flow) and "Submit Order" button (keys flow) are two **separate branches** of a `orderCategory === "keys"` ternary (~line 1324). Apply the `<div onClick>` wrapper **only to the OC branch** "Choose Payment" button (~line 1345), not the keys "Submit Order" button.

- [ ] **Step 1: Find where `phoneTouched` and `emailTouched` are declared (~line 699)**

  Find the `Portal` function's state block. Look for:
  ```jsx
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  ```

- [ ] **Step 2: Add `nameTouched` alongside the existing touched states**

  ```jsx
  const [nameTouched, setNameTouched] = useState(false);
  ```

- [ ] **Step 3: Find the Full Name input (~line 1235) and add `onBlur` + inline error**

  Find the Full Name `<input>` element. Add `onBlur={() => setNameTouched(true)}` to it. Then immediately after the input (before the next `</div>` closing its form-row), add:
  ```jsx
  {nameTouched && !contact.name && (
    <div className="f-err"><Ic n="x" s={12}/> Full name is required.</div>
  )}
  ```

- [ ] **Step 4: Find the OC-flow "Choose Payment" button (~line 1345)**

  Find the ternary branch for the OC flow button — this is the `else` branch of `orderCategory === "keys"` ternary at approximately line 1324:
  ```jsx
  ) : (
    <div style={{ display: "flex", justifyContent: "space-between" ...}}>
      <button ... disabled={!canProceed} onClick={...}>
        Choose Payment <Ic n="arrow" s={15}/>
      </button>
      ...
    </div>
  )}
  ```
  Do **not** modify the keys `Submit Order` button in the other branch.

- [ ] **Step 5: Wrap the "Choose Payment" button in a click-interceptor div**

  Find the `<button ... disabled={!canProceed}>` element for the OC flow. Wrap it in:
  ```jsx
  <div onClick={() => {
    if (!canProceed) {
      setNameTouched(true);
      setPhoneTouched(true);
      setEmailTouched(true);
    }
  }}>
    <button className="btn btn-blk btn-lg" disabled={!canProceed} onClick={...existing handler...}>
      Choose Payment <Ic n="arrow" s={15}/>
    </button>
  </div>
  ```

- [ ] **Step 6: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 7: Verify visually**

  OC flow → Contact step → leave all fields empty → click the greyed "Choose Payment" area. Confirm inline errors appear under all three fields. Then fill in name only → error clears for name but remains for phone/email.

---

### Task 9: Gap 5 — "Card payment unavailable" notice on payment step

**File:** `src/App.jsx` — `PaymentStep` function, after the payment method `.filter().map()` block

**Context:** When `pubConfig?.stripeEnabled` is false, the Stripe option is silently filtered out. Add a subtle notice after the method list.

- [ ] **Step 1: Find the payment method list's closing `)}` (~line 1490)**

  Find the block ending with:
  ```jsx
  ].filter(m => m.enabled).map(m => (
    ...
  ))}
  ```

- [ ] **Step 2: Add the unavailability notice immediately after the closing `)}` of the `.map()`**

  ```jsx
  {!pubConfig?.stripeEnabled && (
    <div style={{ fontSize: "0.75rem", color: "var(--muted)", background: "var(--sand)", border: "1px solid var(--border2)", borderRadius: "6px", padding: "10px 14px", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "1rem" }}>💳</span>
      <span>Card payment is temporarily unavailable. Please use bank transfer or PayID.</span>
    </div>
  )}
  ```

- [ ] **Step 3: Verify build succeeds**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 4: Verify visually**

  Payment step → confirm "💳 Card payment is temporarily unavailable..." notice appears below the payment options.

---

## Chunk 3: Final build, deploy and verification

---

### Task 10: Full build, deploy, and smoke test

- [ ] **Step 1: Clean build**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node build.mjs
  ```
  Expected: `✅  Build complete → dist/`

- [ ] **Step 2: Deploy to production**

  ```bash
  PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod
  ```
  Expected: `Aliased: https://occorder.vercel.app`

- [ ] **Step 3: Bug 1** — OC flow → Step 2 → Owner applicant → add product → click Review Order without levy notice. ✅ Yellow banner: "A Levy Notice is required when applying as an Owner."
- [ ] **Step 4: Bug 2** — Advance to Step 4 → click "Order Portal" in header. ✅ Resets to Step 1.
- [ ] **Step 5: Bug 3** — Keys flow → add key qty 3 → Step 3 review. ✅ Shows "× 3".
- [ ] **Step 6: Bug 4** — Home page slide 3. ✅ Shows "Bank transfer · PayID" (no Stripe).
- [ ] **Step 7: Gap 1** — Admin → Plans → Keys Shipping. ✅ Yellow warning when both costs are 0.
- [ ] **Step 8: Gap 2** — Payment step at wide viewport. ✅ Two-column layout with order summary sidebar.
- [ ] **Step 9: Gap 3** — Step 3 → "↩ Start New Order" visible in step bar → click → resets to Step 1.
- [ ] **Step 10: Gap 4** — Contact step → click disabled "Choose Payment" area. ✅ All field errors appear.
- [ ] **Step 11: Gap 5** — Payment step. ✅ "💳 Card payment is temporarily unavailable." shown.

---

## Implementation Notes

- **No new files** — all changes in `src/App.jsx`.
- **Build after every task** — don't batch; catch errors early.
- **`fmt` and `gstOf` helpers** — both defined near the top of App.jsx, available everywhere in the file.
- **`pubConfig` availability** — `pubConfig` is `Portal`-function state, directly accessible wherever Step 1 and `PaymentStep` JSX renders (both inside `Portal`).
- **State scope** — all contact-step state (`nameTouched`, `phoneTouched`, `emailTouched`) is declared at `Portal` level (~line 699). There is no separate `ContactStep` component.
- **"Start New Order" vs ORDER PORTAL reset** — both reset the same state. Task 7 (step bar button, inside `Portal`) can include `setSearch("")`. Task 2 (ORDER PORTAL button, inside `App`) must **not** include `setSearch("")` as `setSearch` is not in scope at `App` level.
- **Keys "Submit Order" button** — do NOT apply the click-interceptor div from Task 8 to the keys flow button. Apply only to the OC flow "Choose Payment" button.
