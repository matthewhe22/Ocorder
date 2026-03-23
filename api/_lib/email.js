// api/_lib/email.js
// Shared email helpers — imported by orders/index.js and orders/[id]/[action].js
import nodemailer from "nodemailer";

export function buildOrderEmailHtml(order, cfg) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  let date = "—";
  try { date = new Date(order.date).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" }); } catch {}
  const payment = order.payment === "card" ? "Credit / Debit Card" : order.payment === "stripe" ? "Stripe (Card)" : order.payment === "bank" ? "Direct Bank Transfer" : order.payment === "payid" ? "PayID" : order.payment || "—";
  const itemRows = items.map(item =>
    `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.productName || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.ocName || "—"}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(item.price||0).toFixed(2)}</td>
    </tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1c3326;padding:24px 32px;"><h1 style="color:#fff;margin:0;font-size:1.35rem;">TOCS Order Portal</h1><p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">New Order Notification</p></div>
    <div style="padding:32px;">
      <p style="margin-top:0;">${cfg?.emailTemplate?.adminNotificationIntro || "A new order has been placed."}</p>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Details</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Order ID</td><td style="padding:6px 0;font-weight:600;">${order.id}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Date</td><td style="padding:6px 0;">${date}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Payment</td><td style="padding:6px 0;">${payment}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Status</td><td style="padding:6px 0;font-weight:600;color:${order.status==="Paid"?"#2e6b42":"#b45309"};">${order.status}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Total</td><td style="padding:6px 0;font-weight:700;font-size:1.1rem;color:#1c3326;">$${(order.total||0).toFixed(2)} AUD</td></tr>
      </table>
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Customer</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#666;width:38%;">Name</td><td style="padding:6px 0;">${contact.name||"—"}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Applicant Type</td><td style="padding:6px 0;">${contact.applicantType === "agent" ? "Agent / Representative" : "Owner"}</td></tr>
        ${contact.applicantType === "agent" && contact.companyName ? `<tr><td style="padding:6px 0;color:#666;">Company</td><td style="padding:6px 0;">${contact.companyName}</td></tr>` : ""}
        ${contact.applicantType !== "agent" && contact.ownerName ? `<tr><td style="padding:6px 0;color:#666;">Owner Name</td><td style="padding:6px 0;">${contact.ownerName}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${contact.email||""}" style="color:#2e6b42;">${contact.email||"—"}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${contact.phone||"—"}</td></tr>
      </table>
      ${(() => {
        const sa = contact.shippingAddress;
        if (!sa || !sa.street) return "";
        return `<h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Delivery Address</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:6px 0;color:#666;width:38%;">Street</td><td style="padding:6px 0;">${sa.street}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Suburb</td><td style="padding:6px 0;">${sa.suburb}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">State</td><td style="padding:6px 0;">${sa.state}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Postcode</td><td style="padding:6px 0;">${sa.postcode}</td></tr>
        </table>`;
      })()}
      <h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Items</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f5f7f5;"><th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Product</th><th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">OC</th><th style="padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;">Price</th></tr>
        ${itemRows}
        ${order.selectedShipping?.name ? `<tr><td colspan="2" style="padding:8px 12px;color:#666;">Shipping — ${order.selectedShipping.name}</td><td style="padding:8px 12px;text-align:right;">$${(order.selectedShipping.cost||0).toFixed(2)}</td></tr>` : ""}
        <tr style="background:#f5f7f5;"><td colspan="2" style="padding:8px 12px;font-weight:700;">Total</td><td style="padding:8px 12px;text-align:right;font-weight:700;">$${(order.total||0).toFixed(2)} AUD</td></tr>
      </table>
      <p style="font-size:0.78rem;color:#aaa;">Lot Authority Document: ${order.lotAuthorityFile ? `<strong>${order.lotAuthorityFile}</strong> — see attachment` : "Not provided"}</p>
    </div>
  </div>
</body></html>`;
}

export function buildCustomerEmailHtml(order, cfg) {
  const contact = order.contactInfo || {};
  const items = order.items || [];
  const pd = cfg.paymentDetails || {};
  const isPending = order.payment === "bank" || order.payment === "payid";
  const itemRows = items.map(item =>
    `<tr><td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.productName||"—"}</td><td style="padding:7px 12px;border-bottom:1px solid #e8edf0;">${item.ocName||"—"}</td><td style="padding:7px 12px;border-bottom:1px solid #e8edf0;text-align:right;">$${(item.price||0).toFixed(2)}</td></tr>`).join("");
  const bankRows = order.payment === "bank" ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;"><div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;">Bank Transfer Details</div><table style="width:100%;border-collapse:collapse;font-size:0.88rem;"><tr><td style="padding:4px 0;color:#666;width:38%;">Account Name</td><td style="padding:4px 0;font-weight:600;">${pd.accountName||""}</td></tr><tr><td style="padding:4px 0;color:#666;">BSB</td><td style="padding:4px 0;font-weight:600;">${pd.bsb||""}</td></tr><tr><td style="padding:4px 0;color:#666;">Account Number</td><td style="padding:4px 0;font-weight:600;">${pd.accountNumber||""}</td></tr><tr><td style="padding:4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${order.id}</td></tr></table></div>` : order.payment === "payid" ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:16px 20px;margin:20px 0;"><div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#92400e;margin-bottom:10px;">PayID Details</div><table style="width:100%;border-collapse:collapse;font-size:0.88rem;"><tr><td style="padding:4px 0;color:#666;width:38%;">PayID</td><td style="padding:4px 0;font-weight:600;">${pd.payid||""}</td></tr><tr><td style="padding:4px 0;color:#666;">Reference</td><td style="padding:4px 0;font-weight:700;color:#1c3326;">${order.id}</td></tr></table></div>` : "";
  const shippingRow = order.selectedShipping?.name
    ? `<tr><td colspan="2" style="padding:8px 12px;font-size:0.78rem;color:#666;">Shipping — ${order.selectedShipping.name}</td><td style="padding:8px 12px;text-align:right;font-size:0.78rem;color:#666;">$${(order.selectedShipping.cost||0).toFixed(2)}</td></tr>`
    : "";
  const deliveryAddrBlock = (() => {
    const sa = contact.shippingAddress;
    if (!sa || !sa.street) return "";
    return `<h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Delivery Address</h3><table style="width:100%;border-collapse:collapse;margin-bottom:24px;"><tr><td style="padding:6px 0;color:#666;width:38%;">Address</td><td style="padding:6px 0;">${sa.street}, ${sa.suburb} ${sa.state} ${sa.postcode}</td></tr></table>`;
  })();
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:Arial,sans-serif;color:#222;background:#f5f7f5;margin:0;padding:20px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);"><div style="background:#1c3326;padding:24px 32px;"><h1 style="color:#fff;margin:0;font-size:1.35rem;">TOCS Order Portal</h1><p style="color:#a8c5b0;margin:4px 0 0;font-size:0.85rem;">Order Confirmation</p></div><div style="padding:32px;"><p style="margin-top:0;">Dear ${contact.name||"Applicant"},</p><p>${isPending?"Your order has been received and is <strong>awaiting payment</strong>. Certificate processing will begin once payment is confirmed.":"Your payment has been received and your certificate(s) will be processed within the stated turnaround time."}</p><div style="background:#f0f7f3;border-left:4px solid #2e6b42;padding:12px 16px;border-radius:4px;margin:20px 0;"><div style="font-size:0.78rem;color:#666;margin-bottom:4px;">Your order reference number</div><div style="font-family:monospace;font-size:1.2rem;font-weight:700;color:#1c3326;">${order.id}</div><div style="font-size:0.75rem;color:#666;margin-top:4px;">Please keep this for your records and use it as your payment reference for bank transfers.</div></div>${bankRows}${deliveryAddrBlock}<h3 style="color:#1c3326;border-bottom:2px solid #e8edf0;padding-bottom:8px;margin-top:28px;">Order Summary</h3><table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr style="background:#f5f7f5;"><th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Product</th><th style="padding:8px 12px;text-align:left;font-size:0.78rem;text-transform:uppercase;color:#666;">Owner Corporation</th><th style="padding:8px 12px;text-align:right;font-size:0.78rem;text-transform:uppercase;color:#666;">Price</th></tr>${itemRows}${shippingRow}<tr><td colspan="2" style="padding:8px 12px;font-size:0.78rem;color:#666;">GST (10%) included</td><td style="padding:8px 12px;text-align:right;font-size:0.78rem;color:#666;">$${((order.total||0)/11).toFixed(2)}</td></tr><tr style="background:#f5f7f5;"><td colspan="2" style="padding:8px 12px;font-weight:700;">Total (incl. GST)</td><td style="padding:8px 12px;text-align:right;font-weight:700;font-size:1.05rem;color:#1c3326;">$${(order.total||0).toFixed(2)}</td></tr></table><hr style="border:none;border-top:1px solid #e8edf0;margin:28px 0 16px;"><p style="font-size:0.8rem;color:#555;margin:0;">Questions? Contact us at <a href="mailto:${cfg.orderEmail||'info@tocs.co'}" style="color:#2e6b42;">${cfg.orderEmail||'info@tocs.co'}</a> quoting your order reference.</p></div></div></body></html>`;
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
