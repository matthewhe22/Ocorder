// api/_lib/pdf.js — Order summary PDF generation using pdfkit
// Produces an A4 PDF receipt for each order, saved to SharePoint alongside authority docs.

import PDFDocument from "pdfkit";

// Currency formatter
const fmt = (n) => "$" + Number(n || 0).toFixed(2);
const GST_RATE = 0.1;
const gstOf  = (total) => total / 11;
const exGst  = (total) => total - gstOf(total);

/**
 * Generate an order summary PDF.
 * @param {object} order  — Full order object from Redis
 * @returns {Promise<Buffer>} PDF file as a Node.js Buffer
 */
export function generateOrderPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: {
      Title: `Order ${order.id} — TOCS`,
      Author: "TOCS Owner Corporation Services",
    }});

    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 100; // usable width (margins 50 each side)
    const FOREST = "#1c3326";
    const SAGE   = "#4a7255";
    const MID    = "#4a5248";
    const BORDER = "#d8d2c8";

    // ── HEADER ──────────────────────────────────────────────────────────────────
    doc.rect(50, 40, W, 60).fill(FOREST);
    doc.fillColor("white")
       .font("Helvetica-Bold").fontSize(18)
       .text("TOCS", 68, 55)
       .font("Helvetica").fontSize(9).fillColor("rgba(255,255,255,0.7)")
       .text("OWNER CORPORATION SERVICES", 68, 76);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(9)
       .text("ORDER CONFIRMATION", 0, 60, { align: "right", width: W + 50 })
       .font("Helvetica").fontSize(8).fillColor("rgba(255,255,255,0.7)")
       .text(new Date(order.date).toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" }),
             0, 74, { align: "right", width: W + 50 });

    let y = 120;

    // ── ORDER META ───────────────────────────────────────────────────────────────
    doc.fillColor(FOREST).font("Helvetica-Bold").fontSize(10)
       .text("Order Reference", 50, y)
       .font("Helvetica-Bold").fontSize(13).fillColor(FOREST)
       .text(order.id, 50, y + 14);
    doc.fillColor(MID).font("Helvetica").fontSize(8)
       .text(`Status: ${order.status}   |   Payment: ${order.payment === "bank" ? "Bank Transfer" : order.payment === "payid" ? "PayID" : order.payment === "invoice" ? "Invoice" : order.payment}`,
             50, y + 32);

    y += 58;

    // ── CONTACT INFO ─────────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(50 + W, y).stroke(BORDER);
    y += 10;
    doc.fillColor(SAGE).font("Helvetica-Bold").fontSize(8)
       .text("APPLICANT DETAILS", 50, y, { characterSpacing: 0.8 });
    y += 14;

    const ci = order.contactInfo || {};
    const applicantLabel = ci.applicantType === "agent"
      ? `Agent / Representative${ci.companyName ? " — " + ci.companyName : ""}`
      : ci.ownerName
        ? `Owner: ${ci.ownerName}`
        : "Owner";
    const contactLines = [
      ci.name,
      applicantLabel,
      ci.email,
      ci.phone,
    ].filter(Boolean);
    doc.fillColor(MID).font("Helvetica").fontSize(9);
    contactLines.forEach(line => {
      doc.text(line, 50, y);
      y += 13;
    });

    y += 8;

    // ── DELIVERY ADDRESS (keys orders with shippingAddress) ───────────────────
    const sa = ci.shippingAddress;
    if (sa && sa.street) {
      doc.moveTo(50, y).lineTo(50 + W, y).stroke(BORDER);
      y += 10;
      doc.fillColor(SAGE).font("Helvetica-Bold").fontSize(8)
         .text("DELIVERY ADDRESS", 50, y, { characterSpacing: 0.8 });
      y += 14;
      const addrLines = [sa.street, `${sa.suburb} ${sa.state} ${sa.postcode}`].filter(Boolean);
      doc.fillColor(MID).font("Helvetica").fontSize(9);
      addrLines.forEach(line => { doc.text(line, 50, y); y += 13; });
      y += 8;
    }

    // ── ITEMS TABLE ───────────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(50 + W, y).stroke(BORDER);
    y += 10;
    doc.fillColor(SAGE).font("Helvetica-Bold").fontSize(8)
       .text("ORDER ITEMS", 50, y, { characterSpacing: 0.8 });
    y += 14;

    // Table header
    const COL = { desc: 50, lot: 290, oc: 370, price: 470 };
    doc.fillColor(MID).font("Helvetica-Bold").fontSize(8);
    doc.text("Description", COL.desc, y);
    doc.text("Lot", COL.lot, y);
    doc.text("OC", COL.oc, y);
    doc.text("Price", COL.price, y, { align: "right", width: 80 });
    y += 4;
    doc.moveTo(50, y + 6).lineTo(50 + W, y + 6).stroke(BORDER);
    y += 14;

    const items = order.items || [];
    doc.font("Helvetica").fontSize(8.5).fillColor("#1a1f1c");
    items.forEach(item => {
      // Wrap long product names
      const nameHeight = doc.heightOfString(item.productName, { width: 230, fontSize: 8.5 });
      doc.text(item.productName, COL.desc, y, { width: 230 });
      doc.text(item.lotNumber || "—", COL.lot, y, { width: 72 });
      doc.text(item.ocName ? item.ocName.replace(/Owner Corporation\s*/i, "OC ").slice(0, 20) : "—", COL.oc, y, { width: 90 });
      doc.text(fmt(item.price), COL.price, y, { align: "right", width: 80 });
      if (item.qty && item.qty > 1) {
        doc.fillColor(SAGE).fontSize(7.5)
           .text(`Qty: ${item.qty}`, COL.desc, y + nameHeight, { width: 230 });
        doc.fillColor("#1a1f1c").fontSize(8.5);
        y += 5;
      }
      y += Math.max(nameHeight, 13) + 6;
      doc.moveTo(50, y - 2).lineTo(50 + W, y - 2).stroke(BORDER).opacity(0.3);
      doc.opacity(1);
    });

    y += 6;

    // ── TOTALS ────────────────────────────────────────────────────────────────────
    const total   = order.total || items.reduce((s, i) => s + (i.price || 0), 0);
    const shippingAmt = order.selectedShipping?.cost || 0;
    const itemsSubtotal = total - shippingAmt;
    const gst     = gstOf(total);
    const subtotal = exGst(total);

    const totX = 360;
    const totW = 80;

    doc.font("Helvetica").fontSize(8.5).fillColor(MID);
    doc.text("Subtotal (excl. GST)", totX, y, { width: 100 });
    doc.text(fmt(subtotal), totX + 100, y, { align: "right", width: totW });
    y += 14;
    if (shippingAmt > 0) {
      doc.text(`Shipping — ${order.selectedShipping.name}`, totX, y, { width: 100 });
      doc.text(fmt(shippingAmt), totX + 100, y, { align: "right", width: totW });
      y += 14;
    }
    doc.text("GST (10%)", totX, y, { width: 100 });
    doc.text(fmt(gst), totX + 100, y, { align: "right", width: totW });
    y += 4;
    doc.moveTo(totX, y + 6).lineTo(totX + 180, y + 6).stroke(BORDER);
    y += 14;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(FOREST);
    doc.text("Total (incl. GST)", totX, y, { width: 100 });
    doc.text(fmt(total), totX + 100, y, { align: "right", width: totW });
    y += 24;

    // ── ORDER CATEGORY NOTE ───────────────────────────────────────────────────────
    if (order.orderCategory === "keys") {
      doc.rect(50, y, W, 28).fill("#e0f5f2");
      doc.fillColor("#0d6e62").font("Helvetica-Bold").fontSize(8)
         .text("Keys / Fobs / Remotes Order", 60, y + 6);
      doc.font("Helvetica").fontSize(8)
         .text("An invoice will be sent to your email address. Payment details will be included.", 60, y + 16);
      y += 38;
    } else if (order.payment === "bank") {
      doc.rect(50, y, W, 28).fill("#f0f5f1");
      doc.fillColor(SAGE).font("Helvetica-Bold").fontSize(8)
         .text("Bank Transfer", 60, y + 6);
      doc.font("Helvetica").fillColor(MID).fontSize(8)
         .text("Please use your order reference as the payment description. Details sent to your email.", 60, y + 16);
      y += 38;
    }

    y += 10;

    // ── FOOTER ────────────────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(50 + W, y).stroke(BORDER);
    y += 10;
    doc.fillColor(MID).font("Helvetica").fontSize(7.5)
       .text("TOCS Owner Corporation Services  |  info@tocs.co  |  This document was generated automatically.", 50, y, {
         align: "center", width: W,
       });

    doc.end();
  });
}

/**
 * Generate a Stripe payment receipt PDF.
 * @param {object} order       — Full order object from Redis (status already "Paid")
 * @param {string} sessionId   — Stripe checkout session ID (cs_live_... or cs_test_...)
 * @returns {Promise<Buffer>}  PDF file as a Node.js Buffer
 */
export function generateReceiptPdf(order, sessionId) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: {
      Title: `Payment Receipt — Order ${order.id} — TOCS`,
      Author: "TOCS Owner Corporation Services",
    }});

    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W      = doc.page.width - 100;
    const FOREST = "#1c3326";
    const SAGE   = "#4a7255";
    const MID    = "#4a5248";
    const BORDER = "#d8d2c8";

    // Use the payment-confirmed audit log timestamp when available (more accurate than wall clock)
    const paidEntry = (order.auditLog || []).find(e => e.action === "Payment confirmed via Stripe");
    const now = paidEntry ? new Date(paidEntry.ts) : new Date();

    // ── HEADER ───────────────────────────────────────────────────────────────
    doc.rect(50, 40, W, 60).fill(FOREST);
    doc.fillColor("white")
       .font("Helvetica-Bold").fontSize(18)
       .text("TOCS", 68, 55)
       .font("Helvetica").fontSize(9).fillColor("rgba(255,255,255,0.7)")
       .text("OWNER CORPORATION SERVICES", 68, 76);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(9)
       .text("PAYMENT RECEIPT", 0, 60, { align: "right", width: W + 50 })
       .font("Helvetica").fontSize(8).fillColor("rgba(255,255,255,0.7)")
       .text(now.toLocaleDateString("en-AU", {
          timeZone: "Australia/Sydney",
          day: "2-digit", month: "long", year: "numeric",
        }), 0, 74, { align: "right", width: W + 50 });

    let y = 120;

    // ── RECEIPT DETAILS ──────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(50 + W, y).stroke(BORDER);
    y += 10;
    doc.fillColor(SAGE).font("Helvetica-Bold").fontSize(8)
       .text("RECEIPT DETAILS", 50, y, { characterSpacing: 0.8 });
    y += 16;

    const datePaid = now.toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

    const rows = [
      ["Receipt / Order Reference", order.id],
      ["Date Paid",                 datePaid],
      ["Amount Paid",               "$" + Number(order.total || 0).toFixed(2) + " AUD"],
      ["Payment Method",            "Stripe (Card)"],
      ["Stripe Session ID",         sessionId || "—"],
    ];

    doc.font("Helvetica").fontSize(9).fillColor(MID);
    rows.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").fillColor(MID).text(label, 50, y, { width: 200, continued: false });
      doc.font("Helvetica").fillColor("#1a1f1c").text(value, 260, y, { width: W - 210 });
      y += 18;
    });

    y += 8;

    // ── CUSTOMER ─────────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(50 + W, y).stroke(BORDER);
    y += 10;
    doc.fillColor(SAGE).font("Helvetica-Bold").fontSize(8)
       .text("CUSTOMER", 50, y, { characterSpacing: 0.8 });
    y += 16;

    const ci = order.contactInfo || {};
    [ci.name, ci.email].filter(Boolean).forEach(line => {
      doc.fillColor(MID).font("Helvetica").fontSize(9).text(line, 50, y);
      y += 14;
    });

    y += 20;

    // ── FOOTER ───────────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(50 + W, y).stroke(BORDER);
    y += 10;
    doc.fillColor(MID).font("Helvetica").fontSize(7.5)
       .text("TOCS Owner Corporation Services  |  info@tocs.co  |  This receipt was generated automatically.", 50, y, {
         align: "center", width: W,
       });

    doc.end();
  });
}
