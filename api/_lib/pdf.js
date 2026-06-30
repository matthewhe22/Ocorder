// api/_lib/pdf.js — PDF generation using pdfkit
// Produces order summary, Stripe receipt, and admin order-list export PDFs.

// pdfkit bundles megabytes of embedded font data — loading it at module scope
// would tax the cold start of every handler that imports this file, including
// routes that never generate a PDF (e.g. public /track). Load it on first use
// instead and cache the promise so repeat calls pay nothing.
let pdfkitPromise = null;
function getPDFDocument() {
  if (!pdfkitPromise) pdfkitPromise = import("pdfkit").then(m => m.default);
  return pdfkitPromise;
}

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
export async function generateOrderPdf(order) {
  const PDFDocument = await getPDFDocument();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: {
      Title: `Order ${order.id} — TOCS`,
      Author: "Top Owners Corporation Solution",
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
       .text((() => {
         const d = order.date ? new Date(order.date) : new Date();
         const isValidDate = !isNaN(d.getTime());
         return isValidDate ? d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "long", timeStyle: "short" }) : "Date unavailable";
       })(), 0, 74, { align: "right", width: W + 50 });

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
       .text("Top Owners Corporation Solution  |  info@tocs.co  |  This document was generated automatically.", 50, y, {
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
export async function generateReceiptPdf(order, sessionId) {
  const PDFDocument = await getPDFDocument();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: {
      Title: `Payment Receipt — Order ${order.id} — TOCS`,
      Author: "Top Owners Corporation Solution",
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

    // ── LINE ITEMS ────────────────────────────────────────────────────────────
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

    y += 16;

    // ── FOOTER ───────────────────────────────────────────────────────────────
    doc.moveTo(50, y).lineTo(50 + W, y).stroke(BORDER);
    y += 10;
    doc.fillColor(MID).font("Helvetica").fontSize(7.5)
       .text("Top Owners Corporation Solution  |  info@tocs.co  |  This receipt was generated automatically.", 50, y, {
         align: "center", width: W,
       });

    doc.end();
  });
}

/**
 * Generate a formatted order-list export PDF (landscape A4).
 * @param {object[]} orders  — Full orders array
 * @param {object}   cfg     — Config object; cfg.logo may be a data-URL for the logo image
 * @returns {Promise<Buffer>}
 */
export async function generateOrderListPdf(orders, cfg = {}) {
  const PDFDocument = await getPDFDocument();

  const FOREST     = "#1c3326";
  const SAGE       = "#4a7255";
  const SAGE_LIGHT = "#e4ede7";
  const CREAM      = "#f7f3ec";
  const BORDER     = "#d8d2c8";
  const INK        = "#1a1f1c";
  const MID        = "#4a5248";
  const WHITE      = "#ffffff";

  const COLS = [
    { label: "Order ID",       w: 88,  align: "left"  },
    { label: "Date",           w: 52,  align: "left"  },
    { label: "Type",           w: 64,  align: "left"  },
    { label: "Name",           w: 82,  align: "left"  },
    { label: "Building / Lot", w: 92,  align: "left"  },
    { label: "Email",          w: 108, align: "left"  },
    { label: "Total",          w: 50,  align: "right" },
    { label: "Payment",        w: 54,  align: "left"  },
    { label: "Status",         w: 70,  align: "left"  },
    { label: "Admin $",        w: 56,  align: "right" },
  ];

  const PAGE_W     = 841.89;
  const PAGE_H     = 595.28;
  const MARGIN     = 40;
  const TABLE_W    = COLS.reduce((s, c) => s + c.w, 0);
  const TABLE_X    = MARGIN;
  const HEADER_H   = 66;
  const SUMMARY_H  = 36;
  const COL_HEAD_H = 22;
  const ROW_H      = 18;
  const FOOTER_H   = 26;
  const FONT_SZ    = 7.5;

  const totalOrders  = orders.length;
  const ocOrders     = orders.filter(o => o.orderCategory === "oc").length;
  const keysOrders   = orders.filter(o => o.orderCategory === "keys").length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

  const exportDate = new Date().toLocaleDateString("en-AU", {
    day: "2-digit", month: "long", year: "numeric",
  });

  let logoBuffer = null;
  const logoSrc = cfg.logo || "";
  if (logoSrc) {
    try {
      const m = logoSrc.match(/^data:[^;]+;base64,(.+)$/);
      if (m) logoBuffer = Buffer.from(m[1], "base64");
    } catch (_) { /* ignore */ }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margin: 0,
      info: { Title: `TOCS Order Export — ${exportDate}`, Author: "Top Owners Corporation Solution" },
    });

    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let pageNum = 0;
    let y = 0;

    function drawPageHeader() {
      pageNum++;
      y = 0;
      doc.rect(0, 0, PAGE_W, HEADER_H).fill(FOREST);

      if (logoBuffer) {
        try { doc.image(logoBuffer, MARGIN, 13, { height: 40, fit: [100, 40] }); }
        catch (_) {
          doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(22)
             .text("TOCS", MARGIN, 20, { width: 80, lineBreak: false });
        }
      } else {
        doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(22)
           .text("TOCS", MARGIN, 20, { width: 80, lineBreak: false });
      }

      doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(16)
         .text("ORDER EXPORT REPORT", 0, 17, { width: PAGE_W, align: "center", lineBreak: false });
      doc.fillColor("rgba(255,255,255,0.6)").font("Helvetica").fontSize(8)
         .text("Top Owners Corporation Solution", 0, 37, { width: PAGE_W, align: "center", lineBreak: false });

      doc.fillColor(WHITE).font("Helvetica").fontSize(8)
         .text(`Generated: ${exportDate}`, MARGIN, 20, { width: PAGE_W - MARGIN * 2, align: "right", lineBreak: false });
      doc.fillColor("rgba(255,255,255,0.6)").fontSize(7.5)
         .text(`${totalOrders} order${totalOrders !== 1 ? "s" : ""}  |  Page ${pageNum}`,
           MARGIN, 32, { width: PAGE_W - MARGIN * 2, align: "right", lineBreak: false });

      y = HEADER_H;
    }

    function drawSummaryBar() {
      doc.rect(0, y, PAGE_W, SUMMARY_H).fill(SAGE_LIGHT);
      const stats = [
        { label: "TOTAL ORDERS",    value: String(totalOrders) },
        { label: "OC CERTIFICATES", value: String(ocOrders) },
        { label: "KEYS / FOBS",     value: String(keysOrders) },
        { label: "TOTAL REVENUE",   value: `$${totalRevenue.toFixed(2)}` },
      ];
      const colW = PAGE_W / stats.length;
      stats.forEach((stat, i) => {
        const sx = i * colW;
        doc.fillColor(SAGE).font("Helvetica-Bold").fontSize(6.5)
           .text(stat.label, sx, y + 7, { width: colW, align: "center", lineBreak: false, characterSpacing: 0.4 });
        doc.fillColor(FOREST).font("Helvetica-Bold").fontSize(14)
           .text(stat.value, sx, y + 17, { width: colW, align: "center", lineBreak: false });
      });
      y += SUMMARY_H;
    }

    function drawColumnHeaders() {
      doc.rect(TABLE_X, y, TABLE_W, COL_HEAD_H).fill(FOREST);
      let x = TABLE_X;
      COLS.forEach(col => {
        const pad = 4;
        doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(FONT_SZ - 0.5)
           .text(col.label, x + pad, y + 7, { width: col.w - pad * 2, align: col.align, lineBreak: false });
        x += col.w;
      });
      y += COL_HEAD_H;
    }

    function drawFooter() {
      const fy = PAGE_H - FOOTER_H + 2;
      doc.moveTo(MARGIN, fy).lineTo(PAGE_W - MARGIN, fy).stroke(BORDER);
      doc.fillColor(MID).font("Helvetica").fontSize(7)
         .text(
           `Top Owners Corporation Solution  |  info@tocs.co  |  Exported ${exportDate}  |  Confidential`,
           MARGIN, fy + 6, { width: PAGE_W - MARGIN * 2, align: "center", lineBreak: false }
         );
    }

    function checkNewPage() {
      if (y + ROW_H > PAGE_H - FOOTER_H - 2) {
        drawFooter();
        doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
        drawPageHeader();
        drawColumnHeaders();
      }
    }

    function drawOrderRow(order, idx) {
      checkNewPage();

      const ci = order.contactInfo || {};
      const typeLabel = { oc: "OC Cert", keys: "Keys/Fobs" }[order.orderCategory] || "";
      const building  = order.items?.[0]?.planName  || "";
      const lot       = order.items?.[0]?.lotNumber || "";
      const bldgLot   = lot ? `${building} / ${lot}` : building;
      const adminCharge = (order.items || []).reduce(
        (sum, item) => sum + ((item.managerAdminCharge || 0) * (item.qty || 1)), 0
      );
      const payLabel = { bank: "Bank", payid: "PayID", stripe: "Stripe", invoice: "Invoice" }[order.payment]
        || (order.payment || "");
      const statusColor = /paid|issued/i.test(order.status || "") ? "#1e4a32"
        : /cancel/i.test(order.status || "") ? "#7a2020" : INK;

      doc.rect(TABLE_X, y, TABLE_W, ROW_H).fill(idx % 2 === 0 ? WHITE : CREAM);

      const cells = [
        { value: order.id || "",                                                         col: 0 },
        { value: order.date ? new Date(order.date).toLocaleDateString("en-AU") : "",     col: 1 },
        { value: typeLabel,                                                               col: 2 },
        { value: ci.name || "",                                                           col: 3 },
        { value: bldgLot,                                                                 col: 4 },
        { value: ci.email || "",                                                          col: 5 },
        { value: (order.total ?? 0) > 0 ? `$${Number(order.total).toFixed(2)}` : "",     col: 6 },
        { value: payLabel,                                                                col: 7 },
        { value: order.status || "",                                                      col: 8, color: statusColor },
        { value: adminCharge > 0 ? `$${adminCharge.toFixed(2)}` : "",                    col: 9 },
      ];

      let x = TABLE_X;
      doc.font("Helvetica").fontSize(FONT_SZ);
      cells.forEach(cell => {
        const col = COLS[cell.col];
        const pad = 4;
        doc.fillColor(cell.color || INK)
           .text(String(cell.value), x + pad, y + 5, {
             width: col.w - pad * 2,
             align: col.align,
             lineBreak: false,
             ellipsis: true,
           });
        x += col.w;
      });

      doc.moveTo(TABLE_X, y + ROW_H).lineTo(TABLE_X + TABLE_W, y + ROW_H).stroke(BORDER).opacity(0.45);
      doc.opacity(1);

      y += ROW_H;
    }

    drawPageHeader();
    drawSummaryBar();
    drawColumnHeaders();
    orders.forEach((order, i) => drawOrderRow(order, i));
    drawFooter();
    doc.end();
  });
}
