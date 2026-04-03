# PRD — Integrations (As-Built)

**Feature area:** External integrations (Stripe, SharePoint, SMTP/email)
**Status:** Implemented
**Last updated:** 2026-03-30

---

## Overview

The TOCS Order Portal integrates with three external services to complete the order lifecycle: Stripe for card payments, Microsoft SharePoint for document storage, and SMTP for email delivery. These integrations are coordinated server-side within Vercel Serverless Functions and interact at specific points in the order lifecycle.

---

## User Stories

### US-INT-01 — Stripe Card Payment

**As a** customer, **I can** pay for my OC certificate order by credit or debit card so that I do not need to arrange a manual bank transfer.

**Acceptance criteria:**
- Stripe is only available when `pubConfig.stripeEnabled === true` (i.e. `STRIPE_SECRET_KEY` is configured server-side and Stripe is enabled in the public config response).
- When "Credit / Debit Card" is selected at step 5 and "Confirm Order" is clicked, the client calls `POST /api/orders` with `payment: "stripe"`.
- The server creates a Stripe Checkout Session with:
  - A single line item: description "OC Certificate Order", unit amount = `Math.round(order.total * 100)` cents AUD.
  - `metadata: { orderId: <id> }`.
  - `success_url`: `/complete?orderId=<id>&stripeOk=1`.
  - `cancel_url`: `/?cancelled=1`.
- The server validates the Stripe API key before writing the order to Redis. If Stripe key is invalid, the order is not saved and a 402 error is returned.
- The server returns `{ redirect: session.url }` and the client navigates to Stripe's hosted checkout page.
- The `stripeSessionId` is stored on the order in Redis.
- The order initial status is `"Awaiting Stripe Payment"`.
- On successful Stripe payment, Stripe redirects the customer to `/complete?orderId=<id>&stripeOk=1`.
- The frontend detects `?stripeOk=1` on mount and enters a "Confirming your payment…" loading state.
- The frontend calls `POST /api/orders/<id>/stripe-confirm`.
- On `?cancelled=1`, the app displays a dismissible cancellation banner on step 1.

---

### US-INT-02 — Stripe Payment Confirmation

**As a** developer, **I need** Stripe payment confirmation to be idempotent and verified server-side so that orders are not incorrectly marked as paid.

**Acceptance criteria:**
- `POST /api/orders/<id>/stripe-confirm` requires no auth (public endpoint).
- The endpoint retrieves the Stripe Checkout Session using the `stripeSessionId` stored on the order.
- It verifies `session.metadata.orderId === id` to prevent cross-order confirmation attacks.
- It verifies `session.payment_status === "paid"` before updating order status.
- If the order is already `"Paid"` (idempotency guard), the endpoint returns `{ success: true, order }` immediately without re-processing.
- On confirmed payment:
  - Order status is updated to `"Paid"`.
  - Admin notification email is sent.
  - Customer confirmation email is sent (with payment confirmation message).
  - Order summary PDF is uploaded to SharePoint as `order-summary-<orderId>.pdf`.
  - Payment receipt PDF is uploaded to SharePoint as `payment-receipt-<orderId>.pdf`.
  - Authority document (if present in Redis) is uploaded to SharePoint as `authority-<filename>`.
- The endpoint returns `{ success: true, order }`.
- If payment verification fails, the endpoint returns a 402 error. The frontend shows an error screen with the order ID and a "Contact Support" button.

---

### US-INT-03 — SharePoint Document Storage

**As an** admin, **I can** configure SharePoint credentials so that authority documents, order summaries, and certificates are automatically uploaded to the organisation's SharePoint site.

**Acceptance criteria:**
- SharePoint is optional. When not configured, all uploads are silently skipped and order processing continues normally.
- All uploads use the Microsoft Graph API with an OAuth2 `client_credentials` flow via Azure AD.
- SharePoint configuration fields: Azure Tenant ID, Client ID, Client Secret, Site ID, Folder Path.
- Authentication: `POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with `scope: https://graph.microsoft.com/.default`.
- Upload endpoint: `PUT https://graph.microsoft.com/v1.0/sites/{siteId}/drive/root:/{folderPath}/{subFolder}/{filename}:/content`.
- After upload, a view link is created via `POST .../createLink` with `type: "view"` and `scope: "organization"`.
- Folder path structure: `{baseFolder}/{buildingName}/{categoryFolder}/{orderId}/` where `categoryFolder` is `"OC Certificates"` or `"Keys-Fobs"`.
- `buildingName` is derived from the first order item's `planName`; non-alphanumeric characters (except spaces) are stripped.
- Each upload call uses an `AbortController` with an 8000ms timeout to prevent Vercel function hangs.
- SharePoint uploads run in parallel with email sending from T=0 (IIFE pattern).
- On order placement (`POST /api/orders`):
  - Authority document is uploaded as `authority-{originalFilename}`.
  - Order summary PDF is uploaded as `order-summary-{orderId}.pdf`.
- On Stripe confirm (`POST /api/orders/<id>/stripe-confirm`):
  - Authority document is re-uploaded (from Redis) as `authority-{lotAuthFileName}`.
  - Order summary PDF is uploaded as `order-summary-{orderId}.pdf`.
  - Payment receipt PDF is uploaded as `payment-receipt-{orderId}.pdf`.
- On certificate send (`POST /api/orders/<id>/send-certificate`):
  - If an attachment is provided, it is uploaded with its original filename.
- On invoice send (`POST /api/orders/<id>/send-invoice`):
  - If an attachment is provided, it is uploaded with its original filename.
- A "Test Connection" button in the admin panel calls `POST /api/config/test-sharepoint` which performs three sequential checks: OAuth token acquisition, site read, drive read. Results are displayed with site name and URL on success.

---

### US-INT-04 — Order Notification Email (Admin)

**As an** admin, **I receive** an email notification when a customer places an order so that I can begin processing it promptly.

**Acceptance criteria:**
- An HTML email is sent to the configured notification address (`cfg.orderEmail`) whenever a new order is placed via `POST /api/orders`.
- For Stripe orders, the notification email is sent after Stripe payment confirmation (`POST /api/orders/<id>/stripe-confirm`), not at order placement.
- The email subject is: `New OC Certificate Order: <orderId>` (or `Keys/Fobs Order:` for keys orders, using the plan name).
- The email body includes:
  - Order reference number, date, and plan/building name.
  - Customer section: Full Name, Email, Phone, Applicant Type, Owner Name (if owner), Company/Firm (if agent).
  - Items table: Product Name, Plan/Lot, OC name (for OC orders), Turnaround, Price.
  - Total amount.
  - Shipping method and delivery address (if provided).
  - Payment method.
  - Authority document notice (filename shown).
  - For pending payment orders: payment instructions (BSB, account number, PayID).
- Emails are sent synchronously; the server waits for SMTP delivery before responding (within the Vercel function timeout).
- SMTP settings: nodemailer with `connectionTimeout: 8000`, `socketTimeout: 10000`; greetingTimeout is NOT set (allows slow SMTP2GO greeting).

---

### US-INT-05 — Customer Confirmation Email

**As a** customer, **I receive** an order confirmation email so that I have a record of my request and payment instructions.

**Acceptance criteria:**
- An HTML confirmation email is sent to the customer's email address on order placement.
- For Stripe orders, the confirmation email is sent after Stripe payment confirmation, not at placement.
- The email subject uses the configured `emailTemplate.certificateSubject` with `{orderId}` replaced.
- The email body includes:
  - Thank-you message referencing the order ID.
  - Items ordered (product name, OC name for OC orders, quantity for keys orders, price).
  - GST breakdown (10% of total shown separately).
  - Total amount (AUD incl. GST).
  - For pending bank/PayID payment orders: payment instructions (account name, BSB, account number, PayID, and order ID as payment reference).
  - For keys orders: notice that an invoice will be sent.
  - For Stripe/paid orders: payment confirmation.
  - Delivery address block (if a shipping address was provided).
  - Email footer from `emailTemplate.footer`.
- An order summary PDF is attached to the customer confirmation email as `order-summary-<orderId>.pdf`.

---

### US-INT-06 — Certificate Delivery Email

**As an** admin, **I can** send a certificate to a customer by email with an optional PDF attachment from within the admin panel.

**Acceptance criteria:**
- Triggered via the SendCertificateModal from the "Orders" tab.
- The email is sent to the customer's address stored on the order.
- The email subject uses the configured `emailTemplate.certificateSubject` with `{orderId}` replaced.
- The email body pre-fills from `emailTemplate.certificateGreeting` with `{name}`, `{lotNumber}`, and `{address}` placeholders resolved from the order.
- The body is editable by the admin before sending.
- An optional PDF or image attachment can be included.
- If an attachment is provided and SharePoint is configured, the file is uploaded to the order's SharePoint folder.
- Endpoint: `POST /api/orders/<id>/send-certificate` with `{ message: string, attachment?: { name, type, data (base64) } }`.
- On success:
  - Order status is updated to `"Issued"`.
  - Audit log entry appended: `"Certificate issued — Sent to: <email>"`.

---

### US-INT-07 — Invoice Delivery Email (Keys Orders)

**As an** admin, **I can** send a formal invoice email to a Keys/Fobs customer so that they can make payment.

**Acceptance criteria:**
- Triggered via the SendInvoiceModal from the "Orders" tab on orders with status `"Invoice to be issued"`.
- The email is sent to the customer's address stored on the order.
- The email body pre-fills with a default message containing payment details (from `GET /api/config/settings`).
- The body is editable by the admin before sending.
- An optional PDF attachment can be included.
- If an attachment is provided and SharePoint is configured, the file is uploaded to the order's SharePoint folder.
- Endpoint: `POST /api/orders/<id>/send-invoice` with `{ message: string, attachment?: { name, type, data (base64) } }`.
- On success:
  - Order status is updated to `"Invoice sent, awaiting payment"`.
  - Audit log entry appended: `"Invoice sent — Sent to: <email>"`.

---

### US-INT-08 — PDF Generation

**As a** developer, **I need** order summary and payment receipt PDFs to be generated server-side so that they can be attached to emails and uploaded to SharePoint.

**Acceptance criteria:**
- `generateOrderPdf(order)` produces an A4 PDF (pdfkit) containing:
  - Header with "TOCS Order Summary" title and order ID.
  - Order metadata: date, plan/building name, lot number.
  - Contact details: name, email, phone, applicant type, owner/company name.
  - Delivery address block (if present).
  - Items table: Product Name, OC / Lot, Quantity, Price (AUD).
  - Total and GST breakdown.
  - Notes section (blank, for admin use).
  - Returns `Promise<Buffer>`.
- `generateReceiptPdf(order, sessionId)` produces an A4 PDF for Stripe-paid orders containing:
  - Header with "Payment Receipt" title and order ID.
  - Stripe Session ID.
  - Payment date (from audit log entry for status "Paid", or current date).
  - Amount paid (AUD).
  - Returns `Promise<Buffer>`.
- Both PDFs are generated in-memory and never written to disk.

---

## Integration Lifecycle Summary

| Event | Admin Email | Customer Email | SharePoint Uploads |
|---|---|---|---|
| `POST /api/orders` (non-Stripe) | Order notification | Order confirmation + PDF | Authority doc + order summary PDF |
| `POST /api/orders` (Stripe) | — | — | — (deferred to stripe-confirm) |
| `POST /api/orders/<id>/stripe-confirm` | Order notification | Order confirmation + PDF | Authority doc + order summary PDF + receipt PDF |
| `POST /api/orders/<id>/send-certificate` | — | Certificate email + optional attachment | Optional attachment |
| `POST /api/orders/<id>/send-invoice` | — | Invoice email + optional attachment | Optional attachment |

---

## Security Considerations

- The Stripe secret key is never exposed to the client. All Stripe API calls are made server-side.
- The `stripe-confirm` endpoint is public but verifies `session.metadata.orderId === id` to prevent cross-order confirmation attacks.
- SharePoint Client Secret is masked in GET responses (`cfg.settings`) and preserved unchanged if the masked placeholder is submitted in a POST.
- SMTP password is masked in GET responses and preserved unchanged if the masked placeholder is submitted.
- SharePoint and SMTP credentials are stored in Redis (`tocs:config`) and loaded at function startup.
- All admin-triggered email and SharePoint actions (`send-certificate`, `send-invoice`) require a valid Bearer token.

---

## E2E Test Scenarios

### Stripe payment — happy path
1. Complete order flow through step 5 with "Credit / Debit Card" selected.
2. Confirm order — verify browser redirects to Stripe hosted checkout.
3. Simulate `GET /complete?orderId=xxx&stripeOk=1` — verify loading spinner appears.
4. Verify `POST /api/orders/<id>/stripe-confirm` is called; verify confirmation page shows "Payment received".
5. Verify order status in admin panel is "Paid".

### Stripe cancel
1. Cancel at Stripe checkout.
2. Verify return to `/?cancelled=1` and cancellation banner shown on step 1.

### SharePoint upload failure (graceful degradation)
1. Configure invalid SharePoint credentials.
2. Place an OC order.
3. Verify order is saved and emails are sent normally despite SharePoint upload failure.
4. Verify no 500 error is returned to the client.

### Certificate email with attachment
1. In admin panel, click "Send Cert" on a Paid order.
2. Attach a PDF file.
3. Send.
4. Verify order status changes to "Issued".
5. Verify audit log shows "Certificate issued — Sent to: <email>".
6. If SharePoint configured: verify attachment appears in the order's SharePoint folder.

### SMTP failure handling
1. Configure invalid SMTP credentials.
2. Place an order.
3. Verify server returns an appropriate error response (email send failure).
