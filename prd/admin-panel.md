# PRD — Admin Panel (As-Built)

**Feature area:** Admin panel
**Status:** Implemented
**Last updated:** 2026-03-30

---

## Overview

The admin panel is embedded in the same React SPA as the customer portal, accessible via the "Admin" navigation button. It provides management of strata plans, lots, products, owner corporations, orders, settings, branding, SharePoint storage, and admin credentials.

---

## User Stories

### US-AP-01 — Admin Authentication

**As an** admin, **I can** log in to the admin panel using a username and password so that only authorised users can manage orders and configuration.

**Acceptance criteria:**
- Clicking "Admin" in the nav bar shows an `AdminLogin` component when `adminToken` is null.
- The login form requires username (email format) and password.
- Password can be toggled visible/hidden.
- On successful login, the server returns a stateless HMAC-signed token (expiry: 8 hours).
- The token is stored in `sessionStorage` (key: `admin_token`).
- On failed login, the error message from the server is displayed.
- Pressing Enter in either field submits the form.
- After login, `/api/data` is re-fetched with the Bearer token so orders are returned (unauthenticated callers receive an empty orders array).
- Logging out clears `sessionStorage` and shows the login form.
- The token is invalidated when the admin password is changed (HMAC key changes).

---

### US-AP-02 — Plan Management

**As an** admin, **I can** create, edit, and delete strata plans so that the portal reflects the buildings managed by TOCS.

**Acceptance criteria:**
- The "Plans" tab shows a table of all strata plans with columns: Plan ID, Name, Address, Lots count, Products count, Shipping options count.
- "Add Plan" button opens a modal requiring Plan ID (e.g. SP99999), Plan Name, and Address.
- "Edit" button opens a modal to update Plan Name and Address (Plan ID is immutable after creation).
- "Delete" button shows a browser confirm dialog and removes the plan plus all its lots, products, and owner corporations. Deleting the selected plan switches the active plan selector to the first remaining plan.
- All plan CRUD persists to Redis via `POST /api/plans`.
- Each plan has a "Shipping" button to manage OC certificate shipping options and a "Keys Shipping" button to configure Keys/Fobs delivery costs.

---

### US-AP-03 — Product Management

**As an** admin, **I can** add, edit, and delete products on each plan so that the correct products and prices are available to customers.

**Acceptance criteria:**
- The "Products" tab shows a plan selector followed by a product table for the selected plan.
- Columns: Name, Description, Price (incl. GST), 2nd OC Price, Turnaround, Category badge (OC Certs / Keys/Fobs), Per OC badge (Yes/No).
- "Add Product" opens a modal requiring:
  - Name, Description, Turnaround string
  - Category: "OC Certificates" (`oc`) or "Keys / Fobs / Remotes" (`keys`)
  - Charged Per OC: Yes / No
  - 1st OC Price (AUD incl. GST)
  - Additional OC Price (only shown when Per OC = Yes; optional)
  - Per-option shipping cost overrides (optional; shown only when the plan has shipping options configured)
- Generated product ID uses `"P" + Date.now()`.
- "Edit" pre-fills the modal with existing values.
- "Delete" shows a confirm dialog and removes the product.

---

### US-AP-04 — Lot Management

**As an** admin, **I can** add, edit, delete, and bulk-import lots for each plan so that all lots in the building are available for ordering.

**Acceptance criteria:**
- The "Lots" tab shows a plan selector followed by a lot table for the selected plan.
- Columns: Lot Number, Level, Type badge (Residential/Commercial/Parking), Owner Corp IDs (resolved to names).
- "Add Lot" opens a modal requiring: Lot Number, Level, Type (Residential/Commercial/Parking/Storage/Mixed), Owner Corp IDs (comma-separated).
- Generated lot ID uses `"L" + Date.now()`.
- "Edit" pre-fills the modal.
- "Delete" shows a confirm dialog.
- "Import Excel" accepts `.xlsx`, `.xls`, and `.csv` files and replaces all lots for the plan after user confirmation.
  - Column mapping is case-insensitive and space/underscore/hyphen tolerant.
  - Recognised columns: Lot Number/Lot No/Lot/Number, Level/Floor, Type/Lot Type/Use, Owner Corp IDs/OC IDs/OC/Owner Corporation.
  - Calls `POST /api/lots/import` to persist.

---

### US-AP-05 — Owner Corporation Management

**As an** admin, **I can** add, edit, and delete Owner Corporations on each plan so that lots can be correctly associated with their managing corporations.

**Acceptance criteria:**
- The "Owner Corps" tab shows a plan selector followed by a table of OCs for the selected plan.
- Columns: OC ID, Name, Lots count (number of lots in the plan that reference this OC).
- "Add Owner Corp" opens a modal requiring: OC ID (e.g. OC-C; immutable after creation), Display Name.
  - The levy field is present in data but is not shown in the current UI.
- "Edit" allows changing the Display Name only.
- "Delete" shows a confirm dialog warning that lots referencing the OC will retain the ID but lose the display name.

---

### US-AP-06 — Shipping Options Management (OC Orders)

**As an** admin, **I can** configure shipping methods and costs for OC certificate orders on each plan so that applicable delivery fees are charged at checkout.

**Acceptance criteria:**
- The "Shipping" button on the Plans tab opens a modal for the selected plan's `shippingOptions`.
- The modal lists existing options (Name, Cost AUD) with a remove button for each.
- A form at the bottom allows adding a new option (Name, Cost in AUD).
- Generated option ID uses `"ship-" + Date.now()`.
- Changes persist via `POST /api/plans`.
- When shipping options are present, a shipping method selector appears at step 3 (Review Cart) of the customer flow.

---

### US-AP-07 — Keys Shipping Configuration

**As an** admin, **I can** configure delivery costs for Keys/Fobs orders on each plan so that shipping fees are correctly shown to customers.

**Acceptance criteria:**
- The "Keys Shipping" button on the Plans tab opens a modal for `plan.keysShipping`.
- Four shipping options are fixed: "Pick up from BM" ($0), "Standard Delivery" (configurable), "Express Delivery" (configurable), "No Shipment Required" ($0).
- The modal allows editing Standard Delivery cost and Express Delivery cost.
- A warning is shown when both costs are $0.
- Changes persist via `POST /api/plans`.

---

### US-AP-08 — Order Management

**As an** admin, **I can** view, filter, update, and action all orders so that I can process customer requests efficiently.

**Acceptance criteria:**
- The "Orders" tab shows a table of all orders filtered by the current filter state.
- Filter controls:
  - Category toggle: All Orders / OC Certificates / Keys/Fobs.
  - Text search: matches order ID, customer name, company name, building name, lot number, email.
  - Building/plan filter.
  - Lot number filter.
  - Status filter (dropdown).
  - "Clear" button resets all filters.
- Order table columns: Order ID (monospace), Date, Building/Lot, Applicant (name, company/owner name, email), Items count, Total, Status badge.
- Each row expands to show:
  - Order items table (Product, Plan/Lot, Owner Corp, Turnaround, Price).
  - Customer details (Applicant Type, Owner Name or Company, Delivery Address, Shipping method if applicable).
  - Documents section (Order Summary link, Authority Doc link/download, Certificate link, Invoice link).
  - Audit Log table (timestamp, action, note).
- Per-row action buttons (context-sensitive):
  - "Send Invoice" — shown when status is `"Invoice to be issued"`; opens SendInvoiceModal.
  - "Mark Paid" — shown when status is `"Awaiting Payment"`, `"Invoice sent, awaiting payment"`, or `"Awaiting Stripe Payment"`; calls `PUT /api/orders/<id>/status` with `status: "Paid"`.
  - "Send Cert" — shown for non-keys orders not yet Issued or Cancelled; opens SendCertificateModal.
  - "Cancel" — shown for orders not yet Issued or Cancelled; opens CancelOrderModal.
  - "Delete" — shown only for Cancelled orders; permanently removes the order after browser confirm.
  - "Auth Doc" — shown when `lotAuthFileName`, `lotAuthorityFile`, or `lotAuthorityUrl` is present; either links to SharePoint URL (new tab) or serves the document from Redis as a file download.
- Status updates use an optimistic update with rollback on failure.
- A toast notification is shown for status update failures.
- "Export CSV" downloads all orders as a CSV file via `GET /api/orders/export`.

---

### US-AP-09 — Certificate Delivery

**As an** admin, **I can** send an OC certificate to a customer by email directly from the admin panel so that I can fulfil orders without leaving the application.

**Acceptance criteria:**
- The SendCertificateModal shows recipient name, email, and order ID.
- The email body pre-fills from the stored `emailTemplate.certificateGreeting` with `{name}`, `{lotNumber}`, and `{address}` placeholders resolved.
- The body is editable before sending.
- A PDF file (or image) can optionally be attached.
- On send, calls `POST /api/orders/<id>/send-certificate` with `{ message, attachment? }`.
- On success:
  - Order status is updated to `"Issued"` in local state.
  - Audit log entry is added: "Certificate issued — Sent to: <email>".
- If an attachment is provided and SharePoint is configured, the attachment is also uploaded to SharePoint.

---

### US-AP-10 — Invoice Delivery (Keys Orders)

**As an** admin, **I can** send a formal invoice to a customer for their Keys/Fobs order so that the customer can make payment.

**Acceptance criteria:**
- The SendInvoiceModal shows recipient name, email, and order ID.
- The email body pre-fills with a default message containing payment details (fetched from `GET /api/config/settings`).
- The body is editable.
- A PDF file can optionally be attached.
- On send, calls `POST /api/orders/<id>/send-invoice` with `{ message, attachment? }`.
- On success:
  - Order status updates to `"Invoice sent, awaiting payment"` in local state.
  - Audit log entry added: "Invoice sent — Sent to: <email>".
- If an attachment is provided and SharePoint is configured, the attachment is uploaded to SharePoint.

---

### US-AP-11 — Order Cancellation

**As an** admin, **I can** cancel an order with a reason so that the order history accurately reflects its disposition.

**Acceptance criteria:**
- The CancelOrderModal requires a cancellation reason (non-empty text).
- A checkbox confirmation is required before the cancel button becomes actionable.
- On confirm, calls `PUT /api/orders/<id>/status` with `{ status: "Cancelled", note: <reason> }`.
- On success:
  - Order status updates to `"Cancelled"` in local state.
  - `cancelReason` is set on the order.
  - Audit log entry added: "Order cancelled — <reason>".
- Once Cancelled, a "Delete" button appears to permanently remove the order.

---

### US-AP-12 — Settings Management

**As an** admin, **I can** configure SMTP, payment details, and email templates so that order notifications and certificate emails work correctly.

**Acceptance criteria:**
- The "Settings" tab contains four sections:
  1. **Order Notifications** — recipient email address for new order notifications.
  2. **Payment Details** — Account Name, BSB, Account Number, PayID; shown to customers at checkout and on emails.
  3. **SMTP Server** — Host, Port, Username, Password (masked); "Test Email" button sends a test email and reports success/failure.
  4. **Email Templates** — Certificate email subject (supports `{orderId}` placeholder), certificate greeting body (supports `{name}`, `{lotNumber}`, `{address}` placeholders), email footer.
- All settings are saved together via `POST /api/config/settings`.
- SMTP password is displayed as "••••••••" by the GET endpoint to avoid exposing credentials; the POST endpoint ignores this placeholder and leaves the stored value unchanged.
- "Test Email" sends current form values (not yet saved) to `POST /api/config/test-email`.

---

### US-AP-13 — Branding

**As an** admin, **I can** upload a custom logo so that the portal matches TOCS's brand identity.

**Acceptance criteria:**
- The "Branding" tab allows uploading a PNG, SVG, JPEG, GIF, or WebP image up to 500 KB.
- A preview is shown against the sage-tinted background.
- The logo is stored as a base64 data URL or external URL in `cfg.logo`.
- Saving updates `pubConfig.logo` in React state so the header logo refreshes immediately without a page reload.
- The logo is returned by `GET /api/config/public` and displayed in the site header.

---

### US-AP-14 — SharePoint Storage Configuration

**As an** admin, **I can** configure SharePoint credentials so that authority documents and order PDFs are automatically uploaded to the organisation's SharePoint site.

**Acceptance criteria:**
- The "Storage" tab accepts: Azure Tenant ID, Client ID, Client Secret, Site ID, Folder Path.
- Client Secret is masked by the GET endpoint; stored value is preserved if the masked placeholder is submitted.
- A "Test Connection" button calls `POST /api/config/test-sharepoint` and reports: OAuth token acquisition success/failure, site read success/failure, drive read success/failure.
- Test result shows site name, site URL, and configured folder path on success.

---

### US-AP-15 — Security / Credential Management

**As an** admin, **I can** change the admin username and password so that access remains secure.

**Acceptance criteria:**
- The "Security" tab shows the current username (read-only) and a "Change Credentials" form.
- The form requires: Current Password, New Username (optional), New Password (optional; minimum 8 characters).
- Calls `POST /api/auth/change-credentials` with Bearer token.
- On success, all existing sessions are invalidated (HMAC key changes) and the admin is logged out.
- Current password must be correct to change credentials.

---

## Security Considerations

- All admin API calls require a valid Bearer token in the `Authorization` header.
- Tokens are stateless HMAC-SHA256 signed with 8-hour expiry.
- Changing the admin password invalidates all existing tokens.
- SMTP and SharePoint passwords are masked in GET responses.
- Order deletion is guarded by a browser confirm and requires Cancelled status.

---

## E2E Test Scenarios

### Happy path — login and order management
1. Navigate to Admin, log in with valid credentials.
2. Verify orders table loads with correct counts.
3. Expand an order row and verify audit log, items, and customer details.
4. Mark a "Awaiting Payment" order as Paid; verify status badge updates.

### Certificate sending
1. Click "Send Cert" on a Paid order.
2. Verify email body pre-fills from template.
3. Attach a PDF and send.
4. Verify order status changes to "Issued".

### Plan/lot management
1. Add a new strata plan.
2. Add a lot to the new plan.
3. Add an owner corporation and assign it to the lot.
4. Delete the plan; verify it is removed from the table.

### Settings
1. Update SMTP host/port/user/pass.
2. Click "Test Email"; verify success message.
3. Save; reload settings and verify values persist.
