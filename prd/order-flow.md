# PRD — Order Flow (As-Built)

**Feature area:** Customer purchase flow
**Status:** Implemented
**Last updated:** 2026-03-30

---

## Overview

The TOCS Order Portal is a multi-step, single-page application that allows lot owners and their agents to purchase Owner Corporation (OC) certificates, registers, insurance certificates, meeting minutes, financial statements, Keys/Fobs/Remotes, and related services for strata lots in NSW.

---

## User Stories

### US-OF-01 — Plan Selection

**As a** customer, **I can** search for my building by name, address, or strata plan number so that I can find the correct plan before ordering.

**Acceptance criteria:**
- The step 1 screen shows a search input and a two-panel layout (animated "how it works" carousel on the left, search on the right).
- The search filters active plans in real time against `id`, `name`, and `address` fields (case-insensitive).
- Only plans with `active: true` appear in search results.
- Selecting a plan highlights it with a tick and persists the selection in React state.
- Changing the selected plan clears the cart and lot selection.
- A recent-order banner is shown if `localStorage.tocs_last_order` contains an order placed within the last 7 days.
- The "Continue" button is disabled until both a plan and an order category are selected.

---

### US-OF-02 — Category Selection

**As a** customer, **I can** choose between "OC Certificates" and "Keys / Fobs / Remotes" after selecting a plan so that the correct product catalogue is shown.

**Acceptance criteria:**
- Two category cards ("OC Certificates" and "Keys / Fobs / Remotes") appear once a plan is selected.
- Selecting a category clears the cart and resets `selectedShipping`.
- The chosen category controls which products appear in step 2 (`category === "oc"` or `category === "keys"`).
- Keys orders skip step 5 (Payment) and go directly from step 4 (Contact) to order submission.

---

### US-OF-03 — Lot and Product Selection (Step 2)

**As a** customer, **I can** select my lot and add products to my cart so that I order only what I need.

**Acceptance criteria:**
- A lot selector (native `<select>` on desktop; card-picker modal on mobile) lists all lots in the selected plan.
- Changing the lot clears the cart and lot authority file.
- The OC(s) belonging to the selected lot are displayed as pills.
- **Applicant type selector:** the customer selects "Owner" or "Agent / Representative".
  - Owner: must enter Owner Name (required).
  - Agent: may enter Company / Firm Name (optional).
- **Lot Authority Document upload** is shown and is required for all order types.
  - Agents: must upload authority-to-act / letter of engagement / power of attorney.
  - Owners: must upload levy notice or levy certificate.
  - Accepted file types: PDF, JPG, PNG; maximum 10 MB.
  - Drag-and-drop is supported.
- Products are filtered by category (`oc` or `keys`).
- **OC Certificate products** with `perOC: true` are added once per Owner Corporation in the lot.
  - The first OC is charged at `product.price`; additional OCs at `product.secondaryPrice` (if defined, otherwise `product.price`).
- **OC Certificate products** with `perOC: false` are added once per lot at a fixed price.
- **Keys/Fobs products** use a quantity +/− control; multiple units of the same product can be added; price = `product.price × qty`.
- An "Added" indicator replaces the "Add" button once a product is in the cart.
- Validation on clicking "Review Order":
  - Cart must not be empty.
  - Owner Name is required when `applicantType === "owner"`.
  - Lot authority document is required.
  - Validation errors scroll the first warning into view with a pulse animation.
- A sticky bottom bar shows cart count and running total while the cart is non-empty.

---

### US-OF-04 — Review Cart (Step 3)

**As a** customer, **I can** review my order before entering my contact details so that I can verify items and costs.

**Acceptance criteria:**
- All cart items are listed with product name, plan/lot, OC name, turnaround time, and price.
- "Additional OC rate" is shown for items billed at `secondaryPrice`.
- Multi-quantity items show the quantity.
- If the selected plan has `shippingOptions` configured, a shipping method selector is shown.
  - Shipping cost may be overridden per product via `product.shippingCosts[optionId]`; the effective cost is the maximum across all cart items.
  - The first available shipping option is auto-selected when entering step 3.
- GST breakdown (10% included in total) is displayed.
- Total (AUD, incl. GST) is shown.
- Edit button returns to step 2; Cancel resets to step 1.
- "Enter Contact Details" button is disabled if shipping options exist but none is selected.

---

### US-OF-05 — Contact Details (Step 4)

**As a** customer, **I can** enter my contact information so that TOCS can deliver my order and send confirmation.

**Acceptance criteria:**
- Required fields: Full Name, Email Address, Phone Number.
- Email is validated against `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Phone is validated against `/^(\+?61|0)[0-9]{8,9}$/` (Australian numbers only; spaces are stripped before validation).
- For **Keys orders**, a Shipping Method selector is shown:
  - Options: "Pick up from BM" (free), "Standard Delivery" (configurable cost), "Express Delivery" (configurable cost), "No Shipment Required" (free).
  - Costs for Standard and Express come from `plan.keysShipping.deliveryCost` and `plan.keysShipping.expressCost`.
  - When a delivery option requiring an address is selected, a Delivery Address form appears (Street, Suburb, State, Postcode — all required).
  - "Pick up from BM" is auto-selected when entering step 4 for a keys order.
- For **Keys orders**, "Submit Order" button is shown directly on step 4 (no step 5).
  - Disabled while fields are invalid or shipping/address is incomplete.
  - On click, calls `placeOrder()` with `payment: "invoice"` and `status: "Invoice to be issued"`.
- For **OC Certificate orders**, "Choose Payment" advances to step 5.

---

### US-OF-06 — Payment Selection (Step 5, OC orders only)

**As a** customer, **I can** choose how to pay for my OC certificates so that I can complete the order.

**Acceptance criteria:**
- Three payment methods are available:
  1. **Direct Bank Transfer** — always available; payment is manual; status becomes "Awaiting Payment".
  2. **PayID** — always available; instant bank transfer; status becomes "Awaiting Payment".
  3. **Credit / Debit Card (Stripe)** — only shown when `pubConfig.stripeEnabled === true`; status starts as "Awaiting Stripe Payment".
- If Stripe is not enabled, a notice explains card payment is unavailable.
- Bank account details (Account Name, BSB, Account No.) are shown when "Direct Bank Transfer" is selected.
- PayID details are shown when "PayID" is selected.
- An order summary sidebar shows cart items and total (sticky on scroll).
- "Confirm Order" calls `placeOrder()`.
  - For Stripe: response includes `{ redirect: <stripeUrl> }` and the browser navigates to Stripe's hosted checkout page.
  - For Bank/PayID: order is saved and step 6 (confirmation) is displayed.
- A privacy policy link is shown below the confirm button.

---

### US-OF-07 — Stripe Payment Flow

**As a** customer paying by card, **I am** redirected to Stripe and then returned to the confirmation page after payment.

**Acceptance criteria:**
- When Stripe order is placed, a Checkout Session is created server-side with a single line item (`OC Certificate Order`, total in cents AUD), `success_url` of `/complete?orderId=<id>&stripeOk=1`, and `cancel_url` of `/?cancelled=1`.
- The `stripeSessionId` is stored on the order in Redis.
- On `?stripeOk=1` redirect, the app enters a "Confirming your payment…" loading state and calls `POST /api/orders/<id>/stripe-confirm`.
- The confirmation endpoint retrieves the Stripe session, verifies `session.metadata.orderId === id`, confirms `session.payment_status === "paid"`, updates status to "Paid", sends admin and customer emails, uploads PDFs to SharePoint, and returns `{ success: true, order }`.
- If the Stripe session is already "Paid" (idempotency guard), the endpoint returns early with the existing order.
- On Stripe cancel, the app shows a dismissible cancellation banner on step 1.
- If payment verification fails, an error screen is shown with the order ID and a "Contact Support" button.

---

### US-OF-08 — Order Confirmation (Step 6)

**As a** customer, **I can** see my order confirmation and reference number so that I know my request was received.

**Acceptance criteria:**
- Order reference number is displayed prominently with a one-click copy button.
- For Bank Transfer orders: payment instructions (account name, BSB, account number, and order ID as reference) are shown.
- For PayID orders: PayID address and order ID as reference are shown.
- For Stripe (card) orders: confirmation that payment was received.
- For Keys orders: confirmation that an invoice will follow by email.
- An order summary table lists all items with prices, GST breakdown, and total.
- A "Print / Save Receipt" button triggers `window.print()`.
- The last order is persisted to `localStorage.tocs_last_order` so a "Recent order" banner appears on the next visit.
- A "Place Another Order" button resets all state to step 1.
- If a shipping address was provided, it is displayed.

---

### US-OF-09 — Order State and Status Assignment

**As a** developer, **I need** each order to receive a correct initial status so that admin workflows can progress orders.

**Acceptance criteria (initial status values by order type):**

| Order type | Initial status |
|---|---|
| Keys / Fobs | `"Invoice to be issued"` |
| OC + Stripe | `"Awaiting Stripe Payment"` |
| OC + Bank Transfer | `"Awaiting Payment"` |
| OC + PayID | `"Awaiting Payment"` |
| OC + Invoice | `"Paid"` (not used in normal flow; invoice payment type maps to "Paid" by default) |

---

### US-OF-10 — Lot Authority Document Handling

**As a** customer, **I can** upload an authority document during checkout so that TOCS can verify my entitlement to order.

**Acceptance criteria:**
- File is read as base64 client-side using `FileReader`.
- File, filename, and MIME type are included in the order POST request body as `body.lotAuthority`.
- Server saves the file to Redis under `tocs:authority:<orderId>` as a fast fallback.
- If SharePoint is configured, the file is also uploaded to SharePoint under `{buildingName}/{categoryFolder}/{orderId}/authority-{filename}`.
- Admin can download the file from the order detail view via either a SharePoint link redirect or a Redis-served download.

---

## Security Considerations

- No auth is required on the order placement endpoint (`POST /api/orders`); this is intentional as it is a public-facing checkout.
- The Stripe confirm endpoint is public but verifies the Stripe session metadata server-side to prevent cross-order confirmation attacks.
- The authority document download endpoint requires a valid admin token.

---

## E2E Test Scenarios

### Happy path
1. Search for a plan, select it, choose "OC Certificates" category.
2. Select a lot, choose "Owner" type, enter owner name, upload a levy notice.
3. Add "OC Certificate — Standard" to cart.
4. Review order; confirm shipping selection if applicable.
5. Enter contact details.
6. Select "Direct Bank Transfer" and confirm order.
7. Verify step 6 shows order ID, bank details, and summary.

### Keys / Fobs path
1. Select plan, choose "Keys / Fobs / Remotes" category.
2. Select a lot, upload authority document.
3. Add "Building Entry Key" with qty 2.
4. Enter contact details, select "Standard Delivery", fill delivery address.
5. Submit order.
6. Verify step 6 shows "Invoice will follow" message.

### Stripe payment path
1. Complete steps 1–5 with Stripe selected.
2. Confirm order → browser redirects to Stripe.
3. Simulate Stripe success redirect to `/complete?orderId=xxx&stripeOk=1`.
4. Verify loading spinner, then confirmation page with "Payment received" message.

### Stripe cancel path
1. Cancel at Stripe checkout.
2. Verify return to step 1 with cancellation banner.

### Validation failures
1. Attempt to advance from step 2 without uploading authority document → warning shown.
2. Attempt to advance from step 2 without owner name (owner type) → warning shown.
3. Attempt to advance from step 4 with invalid email → error shown.
4. Attempt to advance from step 4 with non-Australian phone number → error shown.
