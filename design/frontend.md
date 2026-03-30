# Design — Frontend Architecture (As-Built)

**Feature area:** React SPA (`src/App.jsx`)
**Status:** Implemented
**Last updated:** 2026-03-30

---

## Overview

The frontend is a single-file React SPA (`src/App.jsx`, approximately 3600 lines). There is no external state management library; all state lives in `useState` hooks at the `App` component level. The application has two modes: the customer purchase flow (steps 1–6) and the admin panel (accessible via the header navigation).

The bundle is built with esbuild via `build.mjs` and outputs to `dist/bundle.js`. The entry point is `src/main.jsx`.

---

## Technology Stack

| Concern | Choice |
|---|---|
| UI framework | React 18 (no framework) |
| State management | `useState` at `App` root; no context or external store |
| Build tool | esbuild (via `build.mjs`) |
| Styling | Inline CSS injected via a `<style>` tag; CSS custom properties (`:root` variables) |
| Icons | Inline SVG via an `Ic` component (no icon library) |
| Fonts | Google Fonts: Cormorant Garamond (serif) + Inter (sans-serif) |
| Excel parsing | `xlsx` (dynamic import, used only in lot import flow) |
| File reading | Browser `FileReader` API |
| Routing | None — single-page; view state (`currentView`, `step`) controls what is rendered |

---

## App-Level State

All state is declared in the `App` component and passed to child components as props.

| State variable | Type | Description |
|---|---|---|
| `data` | object | Raw API data: `{ strataPlans, orders }` |
| `pubConfig` | object | Public config from `GET /api/config/public`: `{ logo, stripeEnabled, paymentDetails }` |
| `currentView` | `"portal"` or `"admin"` | Switches between customer portal and admin panel |
| `step` | number (1–6) | Current step in the purchase flow |
| `selPlan` | object or null | Selected strata plan object |
| `selLot` | object or null | Selected lot object |
| `orderCategory` | `"oc"` or `"keys"` or `""` | Selected order category |
| `cart` | array | Array of cart item objects |
| `lotAuthFile` | object or null | `{ name, type, base64 }` — uploaded authority document |
| `contact` | object | Contact info form state (see `DEFAULT_CONTACT`) |
| `selectedShipping` | object or null | Selected shipping option (OC orders) or keys shipping option |
| `order` | object or null | Completed order after submission |
| `payMethod` | string | Selected payment method: `"bank"`, `"payid"`, `"stripe"`, `"invoice"` |
| `adminToken` | string or null | Loaded from `sessionStorage.admin_token` on mount |
| `adminTab` | string | Active admin tab name |
| `stripeLoading` | boolean | True while calling `stripe-confirm` after Stripe redirect |
| `stripeError` | string or null | Error message from failed Stripe confirmation |
| `stripeCancelled` | boolean | True when `?cancelled=1` is detected on mount |
| `currentPath` | string | Current URL path/search, used to detect Stripe redirect params |

### `DEFAULT_CONTACT` structure

```javascript
{
  name: "", email: "", phone: "", companyName: "",
  applicantType: "owner", ownerName: "",
  shippingAddress: { street: "", suburb: "", state: "NSW", postcode: "" }
}
```

---

## Multi-Step Purchase Flow

The purchase flow is controlled by the `step` state variable. Steps are:

| Step | Label | Component/Screen |
|---|---|---|
| 1 | Select Plan | Plan search, category selector |
| 2 | Products | Lot selector, applicant type, authority doc upload, product grid |
| 3 | Review | Cart review, shipping selector (OC orders) |
| 4 | Contact | Contact info form, keys shipping selector |
| 5 | Payment | Payment method selection (OC orders only) |
| 6 | Complete | Order confirmation; rendered by `ConfirmationPage` |

The step bar is rendered at the top of the portal view. Completed step dots are clickable to navigate back (steps 1–4 only; steps 5 and 6 are not back-navigable from the bar).

Keys orders skip step 5 — after step 4 the customer clicks "Submit Order" which calls `placeOrder()` directly. OC orders proceed through step 5 before calling `placeOrder()`.

### Step transitions

- **Step 1 → 2:** Enabled when both `selPlan` and `orderCategory` are set.
- **Step 2 → 3 ("Review Order"):** Validates: cart non-empty, ownerName present (if owner type), lotAuthFile present. Validation errors scroll the first failing element into view with a pulse animation.
- **Step 3 → 4 ("Enter Contact Details"):** Disabled if OC shipping options exist but `selectedShipping` is null.
- **Step 4 → Submit (keys):** Validates contact fields and shipping/address completeness.
- **Step 4 → 5 ("Choose Payment", OC):** Validates contact fields.
- **Step 5 → Submit:** Calls `placeOrder()`.

---

## Order Placement (`placeOrder`)

`placeOrder()` is an async function declared at the `App` level:

1. Reads the authority file as base64 via `FileReader.readAsDataURL` → strips the data URL prefix → builds `lotAuthority` object.
2. Constructs the full `order` object including items, contact info, shipping, payment method, and generated order ID.
3. Sets `order.status` based on payment type (see US-OF-09 in `prd/order-flow.md`).
4. POSTs to `/api/orders` with `{ order, lotAuthority }`.
5. If response contains `redirect`, navigates to Stripe's checkout URL (`window.location.href = redirect`).
6. Otherwise: sets `order` state and advances to step 6.
7. Persists last order to `localStorage.tocs_last_order`.

### Order ID generation

```javascript
"TOCS-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2,5).toUpperCase()
```

---

## Stripe Redirect Handling

On mount (in a `useEffect`), the app checks `window.location.search` for `?stripeOk=1&orderId=xxx` or `?cancelled=1`:

- **`?stripeOk=1`:** Sets `stripeLoading: true`, calls `POST /api/orders/<orderId>/stripe-confirm`. On success: sets `order` state, sets `step` to 6, removes query params from URL via `window.history.replaceState`. On failure: sets `stripeError`.
- **`?cancelled=1`:** Sets `stripeCancelled: true`, which shows a dismissible cancellation banner on step 1.

---

## Recent Order Banner

On mount, if `localStorage.tocs_last_order` contains an order placed within the last 7 days, a "Recent order" banner is shown at the top of step 1.

---

## Admin Mode

The "Admin" button in the header switches `currentView` to `"admin"`. If `adminToken` is null, the `AdminLogin` component is shown. On successful login, the token is stored in `sessionStorage.admin_token` and `data` is re-fetched with the Bearer token to load orders.

### Admin Tabs

```
["plans", "products", "lots", "ownerCorps", "orders", "settings", "branding", "storage", "security"]
```

Each tab renders a separate section of the admin UI. Tab state is stored in `adminTab`.

---

## Components and Sub-Components

All components are co-located in `src/App.jsx`.

### Customer portal components

| Component | Description |
|---|---|
| `App` | Root component; all state, all step rendering, header |
| `Portal` | Renders the correct step screen based on `step` and `currentView` |
| `ConfirmationPage` | Step 6; displays order reference, summary, payment instructions |
| `PaymentStep` | Step 5; payment method selection, bank/PayID details, Stripe option |
| `PrivacyPolicy` | Modal overlay with privacy policy text |

### Admin components

| Component | Description |
|---|---|
| `Admin` | Admin panel shell; renders tab bar and active tab content |
| `AdminLogin` | Login form; submits to `POST /api/auth/login` |
| `CancelOrderModal` | Modal for order cancellation with reason and confirmation checkbox |
| `SendCertificateModal` | Modal for sending certificate email with optional attachment |
| `SendInvoiceModal` | Modal for sending invoice email with optional attachment |
| `SettingsTab` | SMTP, payment details, email templates, order notification email |
| `BrandingTab` | Logo upload and preview |
| `StorageTab` | SharePoint credentials, test connection |
| `SecurityTab` | Change admin username/password; logout |

### Utility components

| Component / Function | Description |
|---|---|
| `Ic` | Renders inline SVG icons by name; `{ n: string, s?: number }` |
| `calcShippingCost(opt, cartItems, products)` | Computes effective shipping cost using `Math.max` over per-product overrides |
| `getKeysShippingCost(optId, keysShipping)` | Returns cost for a keys shipping option from plan config |
| `getApplicantType(ci)` | Infers applicant type from contact info for backward compatibility |
| `genOrderId()` | Generates a unique order ID string |
| `fmt(n)` | Formats a number as `"$0.00"` |
| `gstOf(total)` | Returns the GST component of a GST-inclusive total (`total / 11`) |
| `exGst(total)` | Returns the ex-GST amount |

---

## Cart Pricing Logic

### OC certificate products (`perOC: true`)

For each `perOC: true` product added to the cart, one cart item is created per Owner Corporation on the selected lot:
- First OC: billed at `product.price`
- Each additional OC: billed at `product.secondaryPrice` if defined, otherwise `product.price`
- The second+ items have `isAdditionalOC: true`

### OC certificate products (`perOC: false`)

One cart item is created at `product.price` regardless of OC count.

### Keys/Fobs products

The customer can specify a quantity using +/- controls. Price = `product.price × qty`. Multiple units of the same product are represented as a single cart item with a `qty` field.

### Shipping cost calculation (OC orders)

When `plan.shippingOptions` is non-empty, the customer selects a shipping option in step 3. The effective shipping cost is:
```
calcShippingCost(opt, cartItems, products)
= Math.max(opt.cost, ...cartItems.map(item => product.shippingCosts?.[opt.id] ?? opt.cost))
```

This allows per-product shipping cost overrides. The maximum override wins.

### Total

```
total = sum of all cart item prices + effective shipping cost
```

GST is included in all prices (10% component = `total / 11`).

---

## Lot Authority Document Upload

The authority document upload is handled in step 2:
- Accepted types: PDF, JPG, PNG (max 10 MB)
- Drag-and-drop supported
- File is read client-side using `FileReader.readAsDataURL`, then the data-URL prefix is stripped to obtain raw base64
- Stored in `lotAuthFile` state as `{ name, type, base64 }`
- Included in the `POST /api/orders` request body as `lotAuthority: { data, filename, contentType }`

---

## Mobile Lot Selector

On mobile viewports, the lot selector is rendered as a full-screen card-picker modal instead of a native `<select>`. The implementation uses a `Portal` component (rendered via a React Portal into `document.body`) to escape the normal DOM flow for proper overlay behaviour.

---

## CSS Architecture

All styles are injected as a single `<style>` element with a global CSS string (`CSS` constant). The design uses CSS custom properties defined on `:root` for the colour palette:

- `--forest` / `--forest2` / `--forest3`: dark greens for primary backgrounds and text
- `--sage` / `--sage2` / `--sage-light` / `--sage-tint`: medium greens for accents
- `--cream` / `--sand` / `--sand2`: warm neutrals for secondary backgrounds
- `--border` / `--border2`: border colours
- `--ok` / `--ok-light`: success states (green)
- `--warn` / `--warn-light`: warning states (amber)
- `--red` / `--red-light`: error states (red)
- `--blue` / `--blue-light`: info states (blue)

Fonts: Cormorant Garamond is used for headings, order codes, and prices; Inter is used for all body text.

---

## Data Fetching Pattern

The app fetches data once on mount from `GET /api/data` and `GET /api/config/public` in parallel. Re-fetches are triggered manually:

- On admin login: `GET /api/data` is re-fetched with the Bearer token to load orders
- On logout: `GET /api/data` is re-fetched without token to clear orders from state
- Plan/order mutations in the admin panel update local `data` state directly after the API call succeeds (no re-fetch)
- Order status updates use optimistic updates with rollback on failure

There is no polling, no websocket, and no real-time updates.

---

## Local and Session Storage

| Key | Storage | Purpose |
|---|---|---|
| `localStorage.tocs_last_order` | localStorage | Last placed order (for recent order banner); shape: `{ id, date, email, total, payment, orderCategory }` |
| `sessionStorage.admin_token` | sessionStorage | Admin session token; cleared on logout or credential change |

---

## `KEYS_SHIPPING_OPTIONS` Constant

Fixed keys shipping options defined at module level:

```javascript
[
  { id: "keys-pickup",  name: "Pick up from BM",      requiresAddress: false },
  { id: "keys-std",     name: "Standard Delivery",     requiresAddress: true  },
  { id: "keys-express", name: "Express Delivery",      requiresAddress: true  },
  { id: "keys-none",    name: "No Shipment Required",  requiresAddress: false },
]
```

Costs for `keys-std` and `keys-express` are read from `plan.keysShipping.deliveryCost` and `plan.keysShipping.expressCost` at render time.

When a delivery option with `requiresAddress: true` is selected, a full delivery address form is shown in step 4 (Street, Suburb, State, Postcode — all required).

---

## Schema Migration Required

No — the frontend is stateless between sessions. All schema concerns are in the backend (see `design/data-model.md`).

---

## E2E Test Scenarios

### Multi-step OC certificate order (happy path)
1. Load the app; verify plan list renders from API data.
2. Search for "Harbour View", select the plan, select "OC Certificates".
3. Select a lot; verify OC pills appear.
4. Select "Owner" type, enter owner name, upload a PDF authority document.
5. Add "OC Certificate — Standard" to cart; verify "Added" indicator appears.
6. Click "Review Order"; verify cart total and GST breakdown are correct.
7. Advance to step 4; enter valid contact details.
8. Advance to step 5; select "Direct Bank Transfer"; confirm order.
9. Verify step 6 shows order ID and bank payment instructions.
10. Verify `localStorage.tocs_last_order` is set.

### Stripe cancel banner
1. Load app with `?cancelled=1` in URL.
2. Verify cancellation banner is shown on step 1.
3. Dismiss banner; verify it disappears.

### Validation — step 2
1. Click "Review Order" without uploading authority document; verify error shown and pulsed.
2. Select "Owner" type without entering owner name; click "Review Order"; verify error.

### Admin login and order view
1. Click "Admin" in nav; verify login form is shown.
2. Enter valid credentials; verify orders table loads.
3. Expand an order row; verify audit log, items, and contact details are shown.

### Admin optimistic update rollback
1. Mark an order as "Paid"; simulate API failure; verify status badge reverts and toast is shown.

### Existing E2E specs affected
All existing E2E scenarios for the customer purchase flow (defined in `prd/order-flow.md`) touch `App.jsx` directly. Any change to the step navigation, cart logic, or `placeOrder()` function requires updating the happy path and validation E2E scenarios. Admin panel scenarios (defined in `prd/admin-panel.md`) touch all admin components.

---

## Vertical Slice Decomposition Notes

The frontend is a single file with no meaningful slice boundaries at the code level. However, features can be split by tab (admin) or by step (customer flow) for parallel development:

- **Customer flow changes** (steps 1–5): Independent of admin panel changes if they do not touch shared state (`data`, `pubConfig`).
- **Admin tab changes**: Each admin tab is independently modifiable as long as mutations go through the same API endpoints.
- **Shared state changes** (e.g. adding a new top-level state variable): Must be done first before any dependent slice.
