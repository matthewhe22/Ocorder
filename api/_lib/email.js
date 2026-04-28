// api/_lib/email.js
// Shared email helpers — imported by orders/index.js and orders/[id]/[action].js
import nodemailer from "nodemailer";

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Shared inline-style fragments for HTML emails (email clients require inline styles)
const CELL      = "padding:7px 12px;border-bottom:1px solid #e8edf0;";
const LABEL     = "padding:6px 0;color:#666;";
const LABEL_W   = LABEL + "width:38%;";
const VAL       = "padding:6px 0;";
const HEADING   = "color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;";
const TBL       = "width:100%;border-collapse:collapse;margin-bottom:24px;";
const TH_LEFT   = "padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;";
const TH_RIGHT  = "padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;";
const WRAPPER   = "max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);";
const BANNER    = "background:#1c3326;padding:24px 32px;";

const PAYMENT_LABELS = {
  card: "Credit / Debit Card",
  stripe: "Stripe (Card)",
  bank: "Direct Bank Transfer",
  payid: "PayID",
};

function formatPayment(method) {
  return PAYMENT_LABELS[method] || method || "—";
}

function itemRowsHtml(items) {
  return items.map(item =>
    `<tr>
      <td style="${CELL}">${esc(item.productName) || "—"}</td>
      <td style="${CELL}">${esc(item.ocName) || "—"}</td>
      <td style="${CELL}text-align:right;">$${(item.price||0).toFixed(2)}</td>
    </tr>`).join("");
}

function deliveryAddressHtml(sa) {
  if (!sa || !sa.street) return "";
  return `<h3 style="${HEADING}">Delivery Address</h3>
    <table style="${TBL}">
      <tr><td style="${LABEL_W}">Street</td><td style="${VAL}">${esc(sa.street)}</td></tr>
      <tr><td style="${LABEL}">Suburb</td><td style="${VAL}">${esc(sa.suburb)}</td></tr>
      <tr><td style="${LABEL}">State</td><td style="${VAL}">${esc(sa.state)}</td></tr>
      <tr><td style="${LABEL}">Postcode</td><td style="${VAL}">${esc(sa.postcode)}</td></tr>
    </table>`;
}

export function buildOrderEmailHtml(order, cfg, opts = {}) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  let date = "—";
  try { date = new Date(order.date).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" }); } catch {}
  const payment = formatPayment(order.payment);
  const subtitle = opts.isAmendment ? "Order Amendment Notification" : "New Order Notification";
  const intro = opts.isAmendment
    ? "An existing order has been amended. The updated details are below."
    : (cfg?.emailTemplate?.adminNotificationIntro || "A new order has been placed.");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="${WRAPPER}">
    <div style="${BANNER}"><h1 style="color:#fff;margin:0;font-size:1.35rem;">TOCS Order Portal</h1><p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">${esc(subtitle)}</p></div>
    <div style="padding:32px;">
      <p style="margin-top:0;">${esc(intro)}</p>
      <h3 style="${HEADING}">Order Details</h3>
      <table style="${TBL}">
        <tr><td style="${LABEL_W}">Order ID</td><td style="${VAL}font-weight:600;">${esc(order.id)}</td></tr>
        <tr><td style="${LABEL}">Date</td><td style="${VAL}">${esc(date)}</td></tr>
        <tr><td style="${LABEL}">Payment</td><td style="${VAL}">${esc(payment)}</td></tr>
        <tr><td style="${LABEL}">Status</td><td style="${VAL}font-weight:600;color:${order.status==="Paid"?"#2e6b42":"#b45309"};">${esc(order.status)}</td></tr>
        <tr><td style="${LABEL}">Total</td><td style="${VAL}font-weight:700;font-size:1.1rem;color:#1c3326;">$${(order.total||0).toFixed(2)} AUD</td></tr>
      </table>
      <h3 style="${HEADING}">Customer</h3>
      <table style="${TBL}">
        <tr><td style="${LABEL_W}">Name</td><td style="${VAL}">${esc(contact.name)||"—"}</td></tr>
        <tr><td style="${LABEL}">Applicant Type</td><td style="${VAL}">${contact.applicantType === "agent" ? "Agent / Representative" : "Owner"}</td></tr>
        ${contact.applicantType === "agent" && contact.companyName ? `<tr><td style="${LABEL}">Company</td><td style="${VAL}">${esc(contact.companyName)}</td></tr>` : ""}
        ${contact.applicantType !== "agent" && contact.ownerName ? `<tr><td style="${LABEL}">Owner Name</td><td style="${VAL}">${esc(contact.ownerName)}</td></tr>` : ""}
        <tr><td style="${LABEL}">Email</td><td style="${VAL}"><a href="mailto:${esc(contact.email||"")}" style="color:#2e6b42;">${esc(contact.email)||"—"}</a></td></tr>
        <tr><td style="${LABEL}">Phone</td><td style="${VAL}">${esc(contact.phone)||"—"}</td></tr>
        <tr><td style="${LABEL}">Building</td><td style="${VAL}">${esc(items[0]?.planName)||"—"}</td></tr>
        <tr><td style="${LABEL}">Lot #</td><td style="${VAL}">${esc(items[0]?.lotNumber)||"—"}</td></tr>
      </table>
      ${deliveryAddressHtml(contact.shippingAddress)}
      <h3 style="${HEADING}">Items</h3>
      <table style="${TBL}">
        <tr style="background:#f5f7f5;"><th style="${TH_LEFT}">Product</th><th style="${TH_LEFT}">OC</th><th style="${TH_RIGHT}">Price</th></tr>
        ${itemRowsHtml(items)}
        ${order.selectedShipping?.name ? `<tr><td colspan="2" style="padding:8px 12px;color:#666;">Shipping — ${esc(order.selectedShipping.name)}</td><td style="padding:8px 12px;text-align:right;">$${(order.selectedShipping.cost||0).toFixed(2)}</td></tr>` : ""}
        <tr style="background:#f5f7f5;"><td colspan="2" style="padding:8px 12px;font-weight:700;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:700;">$${(order.total||0).toFixed(2)} AUD</td></tr>
      </table>
      <p style="font-size:0.78rem;color:#aaa;">Lot Authority Document: ${order.lotAuthorityFile ? `<strong>${esc(order.lotAuthorityFile)}</strong> — see attachment` : "Not provided"}</p>
    </div>
  </div>
</body></html>`;
}

function paymentDetailsHtml(order, pd) {
  const BOX = "background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;";
  const TITLE = "font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;";
  const PD_TBL = "width:100%;border-collapse:collapse;font-size:0.88rem;";
  const PD_LBL = "padding:4px 0;color:#666;width:38%;";
  const PD_VAL = "padding:4px 0;font-weight:600;";
  const refRow = `<tr><td style="${PD_LBL}">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${esc(order.id)}</td></tr>`;

  if (order.payment === "bank") {
    return `<div style="${BOX}"><div style="${TITLE}">Bank Transfer Details</div><table style="${PD_TBL}">
      <tr><td style="${PD_LBL}">Account Name</td><td style="${PD_VAL}">${esc(pd.accountName||"")}</td></tr>
      <tr><td style="${PD_LBL}">BSB</td><td style="${PD_VAL}">${esc(pd.bsb||"")}</td></tr>
      <tr><td style="${PD_LBL}">Account Number</td><td style="${PD_VAL}">${esc(pd.accountNumber||"")}</td></tr>
      ${refRow}</table></div>`;
  }
  if (order.payment === "payid") {
    return `<div style="${BOX}"><div style="${TITLE}">PayID Details</div><table style="${PD_TBL}">
      <tr><td style="${PD_LBL}">PayID</td><td style="${PD_VAL}">${esc(pd.payid||"")}</td></tr>
      ${refRow}</table></div>`;
  }
  return "";
}

export function buildCustomerEmailHtml(order, cfg, opts = {}) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  const pd = cfg.paymentDetails || {};
  const isPending = order.payment === "bank" || order.payment === "payid";
  const orderType = order.orderCategory === "keys" ? "Keys/Fobs order" : "OC Certificate order";
  const buildingName = items[0]?.planName || "";
  const lotNumber = items[0]?.lotNumber || "";
  const orderDesc = buildingName && lotNumber ? ` for ${buildingName} - ${lotNumber}` : buildingName ? ` for ${buildingName}` : "";
  const subtitle = opts.isAmendment ? "Order Amendment Confirmation" : "Order Confirmation";
  const shippingRow = order.selectedShipping?.name
    ? `<tr><td colspan="2" style="padding:8px 12px;font-size:0.78rem;color:#666;">Shipping — ${esc(order.selectedShipping.name)}</td><td style="padding:8px 12px;text-align:right;font-size:0.78rem;color:#666;">$${(order.selectedShipping.cost||0).toFixed(2)}</td></tr>`
    : "";
  const deliveryAddrBlock = (() => {
    const sa = contact.shippingAddress;
    if (!sa || !sa.street) return "";
    return `<h3 style="${HEADING}">Delivery Address</h3><table style="${TBL}"><tr><td style="${LABEL_W}">Address</td><td style="${VAL}">${esc(sa.street)}, ${esc(sa.suburb)} ${esc(sa.state)} ${esc(sa.postcode)}</td></tr></table>`;
  })();
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="${WRAPPER}">
    <div style="${BANNER}">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;">TOCS Order Portal</h1>
      <p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">${esc(subtitle)}</p>
    </div>
    <div style="padding:32px;">
      <p style="margin-top:0;">Dear ${esc(contact.name)||"Applicant"},</p>
      <p>${opts.isAmendment
        ? `Your ${orderType}${orderDesc} has been <strong>updated</strong>. The amended details and new total are below — your order reference number stays the same.`
        : isPending
          ? `Your ${orderType}${orderDesc} has been received and is <strong>awaiting payment</strong>. Processing will begin once payment is confirmed.`
          : order.orderCategory === "keys"
            ? esc(cfg?.emailTemplate?.keysOrderConfirmation || "Your Keys/Fobs order{orderDesc} has been received. The invoice will be sent in a separate email, once payment is received, your order will be processed within the stated turnaround time.").replace("{orderDesc}", orderDesc)
            : `Your ${orderType}${orderDesc} has been received and your ${orderType} will be processed within the stated turnaround time.`
      }</p>
      <div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:12px 16px;border-radius:4px;margin:20px 0;">
        <div style="font-size:0.78rem;color:#666;margin-bottom:4px;">Your order reference number</div>
        <div style="font-family:monospace;font-size:1.2rem;font-weight:700;color:#1c3326;">${esc(order.id)}</div>
        <div style="font-size:0.75rem;color:#666;margin-top:4px;">Please keep this for your records and use it as your payment reference for bank transfers.</div>
      </div>
      ${paymentDetailsHtml(order, pd)}
      ${deliveryAddrBlock}
      <h3 style="${HEADING}">Order Summary</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        <tr style="background:#f5f7f5;">
          <th style="${TH_LEFT}">Product</th>
          <th style="${TH_LEFT}">Owner Corporation</th>
          <th style="${TH_RIGHT}">Price</th>
        </tr>
        ${itemRowsHtml(items)}
        ${shippingRow}
        <tr>
          <td colspan="2" style="padding:8px 12px;font-size:0.78rem;color:#666;">GST (10%) included</td>
          <td style="padding:8px 12px;text-align:right;font-size:0.78rem;color:#666;">$${((order.total||0)/11).toFixed(2)}</td>
        </tr>
        <tr style="background:#f5f7f5;">
          <td colspan="2" style="padding:8px 12px;font-weight:700;">Total (incl. GST)</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;font-size:1.05rem;color:#1c3326;">$${(order.total||0).toFixed(2)}</td>
        </tr>
      </table>
      <hr style="border:none;border-top:1px solid #e8edf0;margin:28px 0 16px;">
      <p style="font-size:0.8rem;color:#555;margin:0;">Questions? Contact us at <a href="mailto:${esc(cfg.orderEmail||'info@tocs.co')}" style="color:#2e6b42;">${esc(cfg.orderEmail||'info@tocs.co')}</a> quoting your order reference.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Admin notification email sent when PIQ confirms payment of a special levy.
 * Triggered by both the hourly cron poll and the manual "Check Now" button.
 *
 * @param {object} order            - the order object from Redis
 * @param {string|null} paymentDate - ISO date string from PIQ receipt transaction
 * @param {string|null} paymentRef  - reference number from PIQ receipt transaction
 * @param {number} paymentAmount    - amount paid (from levy.totalPaid)
 */
export function buildPiqPaymentEmailHtml(order, paymentDate, paymentRef, paymentAmount) {
  const contact = order.contactInfo || {};
  const items   = order.items || [];

  // Format payment date for display
  let dateStr = "—";
  if (paymentDate) {
    try {
      dateStr = new Date(paymentDate).toLocaleDateString("en-AU", {
        timeZone: "Australia/Sydney",
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch { dateStr = paymentDate; }
  }

  const amountStr = paymentAmount != null ? `$${Number(paymentAmount).toFixed(2)} AUD` : "—";
  const planName  = items[0]?.planName  || "—";
  const lotNumber = items[0]?.lotNumber || "—";

  const itemRows = items.map(item =>
    `<tr>
      <td style="${CELL}">${esc(item.productName) || "—"}</td>
      <td style="${CELL}text-align:right;">${item.qty > 1 ? `×${item.qty}  ` : ""}$${(item.price || 0).toFixed(2)}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="${WRAPPER}">
    <div style="background:#1c6e3f;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:1.35rem;">TOCS Order Portal</h1>
      <p style="color:#a8d5b8;margin:4px 0 0;font-size:0.85rem;">Payment Received — PropertyIQ Confirmation</p>
    </div>
    <div style="padding:32px;">
      <div style="background:#e8f5ee;border:2px solid #2e6b42;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:1rem;font-weight:700;color:#1c6e3f;margin-bottom:4px;">✅ PAYMENT RECEIVED</div>
        <div style="font-size:0.82rem;color:#2e6b42;">Payment confirmed via PropertyIQ for Keys/Fob order <strong>${esc(order.id)}</strong></div>
      </div>

      <h3 style="${HEADING}">Payment Details</h3>
      <table style="${TBL}">
        <tr><td style="${LABEL_W}">Order ID</td><td style="${VAL}font-weight:700;font-family:monospace;">${esc(order.id)}</td></tr>
        <tr><td style="${LABEL}">Payment Date</td><td style="${VAL}font-weight:600;">${esc(dateStr)}</td></tr>
        <tr><td style="${LABEL}">PIQ Reference</td><td style="${VAL}font-weight:600;font-family:monospace;">${esc(paymentRef || "—")}</td></tr>
        <tr><td style="${LABEL}">Amount Paid</td><td style="${VAL}font-weight:700;color:#1c6e3f;font-size:1.05rem;">${esc(amountStr)}</td></tr>
        <tr><td style="${LABEL}">Confirmed via</td><td style="${VAL}">PropertyIQ</td></tr>
      </table>

      <h3 style="${HEADING}">Customer</h3>
      <table style="${TBL}">
        <tr><td style="${LABEL_W}">Name</td><td style="${VAL}">${esc(contact.name) || "—"}</td></tr>
        <tr><td style="${LABEL}">Email</td><td style="${VAL}"><a href="mailto:${esc(contact.email || "")}" style="color:#2e6b42;">${esc(contact.email) || "—"}</a></td></tr>
        <tr><td style="${LABEL}">Phone</td><td style="${VAL}">${esc(contact.phone) || "—"}</td></tr>
        <tr><td style="${LABEL}">Building</td><td style="${VAL}">${esc(planName)}</td></tr>
        <tr><td style="${LABEL}">Lot</td><td style="${VAL}">${esc(lotNumber)}</td></tr>
      </table>

      <h3 style="${HEADING}">Items</h3>
      <table style="${TBL}">
        <tr style="background:#f5f7f5;"><th style="${TH_LEFT}">Product</th><th style="${TH_RIGHT}">Price</th></tr>
        ${itemRows}
        <tr style="background:#f5f7f5;"><td style="padding:8px 12px;font-weight:700;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:700;">${esc(amountStr)}</td></tr>
      </table>

      <p style="font-size:0.78rem;color:#aaa;margin-top:24px;">This notification was generated automatically when PropertyIQ confirmed receipt of the special levy payment.</p>
    </div>
  </div>
</body></html>`;
}

/**
 * Creates a nodemailer transporter with the correct timeout settings.
 * IMPORTANT: Do NOT add greetingTimeout — it caused silent failures with SMTP2GO (2026-03-19).
 * connectionTimeout: 8000ms, socketTimeout: 10000ms are required.
 */
export function createTransporter(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 2525,  // SMTP2GO default port — match existing pattern in orders/index.js
    secure: Number(smtp.port) === 465,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 8000,   // 8 s to establish TCP connection
    socketTimeout:     10000,  // 10 s idle socket cut-off
    // NOTE: NO greetingTimeout — SMTP2GO's greeting can take >5 s and silent-fails with it
  });
}
