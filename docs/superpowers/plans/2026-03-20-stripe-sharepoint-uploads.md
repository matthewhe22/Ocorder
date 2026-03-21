# Stripe SharePoint Uploads + Payment Receipt PDF

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a Stripe payment is confirmed, upload the authority document, order summary PDF, and a new payment receipt PDF to SharePoint — matching the behaviour non-Stripe orders already have.

**Architecture:** The `stripe-confirm` handler in `api/orders/[id]/[action].js` starts a fire-and-forget SP upload IIFE after marking the order Paid, concurrently with sending emails. A new `generateReceiptPdf` function in `api/_lib/pdf.js` produces a one-page payment receipt. The IIFE re-reads Redis before writing SP URLs back, avoiding stale-closure overwrites.

**Tech Stack:** Node.js (ESM), pdfkit (already installed), @azure/identity + raw fetch via existing `uploadToSharePoint` helper, Redis/Upstash via existing `readData`/`writeData`/`readAuthority` helpers.

**Spec:** `docs/superpowers/specs/2026-03-20-stripe-sharepoint-uploads-design.md`

---

## File Map

| File | Change |
|------|--------|
| `api/_lib/pdf.js` | Add `generateReceiptPdf(order, sessionId)` export (~60 lines) |
| `api/orders/[id]/[action].js` | Add import for `generateOrderPdf`/`generateReceiptPdf`; move `authDoc` fetch outside SMTP block; add SP upload IIFE in `stripe-confirm` (~40 lines) |

No other files change.

---

## Chunk 1: Add `generateReceiptPdf` to `api/_lib/pdf.js`

### Task 1: Add `generateReceiptPdf` function

**Files:**
- Modify: `api/_lib/pdf.js` (append after `generateOrderPdf`, line 200)

**Background:** `pdf.js` uses pdfkit. The existing `generateOrderPdf` pattern is:
```js
export function generateOrderPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    // ... draw content ...
    doc.end();
  });
}
```
Follow this same pattern exactly. Do **not** use `async/await` inside the new function.

- [ ] **Step 1.1: Append `generateReceiptPdf` to `api/_lib/pdf.js`**

Add this function after the closing `}` of `generateOrderPdf` (after line 200):

```js
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
       .text(new Date().toLocaleDateString("en-AU", {
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

    const datePaid = new Date().toLocaleString("en-AU", {
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
```

- [ ] **Step 1.2: Verify the function is exported correctly**

Run a quick syntax check:
```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node --input-type=module <<'EOF'
import { generateOrderPdf, generateReceiptPdf } from "./api/_lib/pdf.js";
console.log("generateOrderPdf:", typeof generateOrderPdf);
console.log("generateReceiptPdf:", typeof generateReceiptPdf);
EOF
```

Expected output:
```
generateOrderPdf: function
generateReceiptPdf: function
```

If you see a syntax error, fix it before proceeding.

- [ ] **Step 1.3: Smoke-test receipt PDF generation**

Run:
```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node --input-type=module <<'EOF'
import { generateReceiptPdf } from "./api/_lib/pdf.js";
const fakeOrder = {
  id: "TOCS-TEST-001",
  total: 220,
  status: "Paid",
  contactInfo: { name: "Jane Smith", email: "jane@example.com" },
};
const buf = await generateReceiptPdf(fakeOrder, "cs_test_abc123");
console.log("Receipt PDF size:", buf.length, "bytes — OK");
if (buf.length < 1000) throw new Error("PDF too small — likely empty");
EOF
```

Expected: prints `Receipt PDF size: XXXX bytes — OK` with a size > 1000.

---

## Chunk 2: Update `stripe-confirm` in `api/orders/[id]/[action].js`

### Task 2: Add SP upload IIFE and move `authDoc` fetch

**Files:**
- Modify: `api/orders/[id]/[action].js`

**Key existing code to understand before editing:**

```
Line 8-12:  imports (no pdf.js import yet)
Line 278:   const { stripeSessionId } = order;
Line 302:   data.orders[idx].status = "Paid";
Line 309:   await writeData(data);  ← "Paid" is committed here
Line 314:   const cfg = await readConfig();
Line 317:   const confirmedOrder = data.orders[idx];
Line 319:   if (smtp.host && smtp.user && smtp.pass) {
Line 321:     const authDoc = await readAuthority(id).catch(() => null);  ← MOVE THIS OUT
Line 344:   await Promise.allSettled(emailJobs)...
Line 350:   return res.status(200).json({ success: true, order: confirmedOrder });
```

The plan makes three changes:
1. Add pdf.js import at line 13
2. Move `authDoc` fetch to after line 317 (outside the SMTP block)
3. Insert SP IIFE after `authDoc` fetch, before the SMTP block
4. Add `await spPromise` after the return — wait, Vercel serverless functions do not continue after `return`. Instead, restructure the return to come AFTER `await spPromise`. But we can't await SP before returning because that blocks the user. **Solution:** Send the response and then await. In Vercel serverless Node.js, code after `res.end()` can continue briefly. Restructure the end of the function to:
   ```js
   res.status(200).json({ success: true, order: confirmedOrder });
   await spPromise;
   return;
   ```
   This matches the exact pattern in `api/orders/index.js` lines 236-239.

- [ ] **Step 2.1: Add `pdf.js` import**

In `api/orders/[id]/[action].js`, change the import block from:
```js
import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "../../_lib/email.js";
```
to:
```js
import { buildOrderEmailHtml, buildCustomerEmailHtml, createTransporter } from "../../_lib/email.js";
import { generateOrderPdf, generateReceiptPdf } from "../../_lib/pdf.js";
```

(Add the new import immediately after the email import on line 12.)

- [ ] **Step 2.2: Replace lines 309–350 of `api/orders/[id]/[action].js` with the new block**

This is a single, complete replacement. Find the exact text below (lines 309–350) and replace it in full. The replacement moves `authDoc` before the SMTP block, adds the SP IIFE, and restructures the return so the response is sent before `await spPromise`.

**Find this exact block** (from `await writeData(data);` through `return res.status(200).json({ success: true, order: confirmedOrder });`):

```js
    await writeData(data);

    // Send admin + customer emails using shared helpers from _lib/email.js
    // Timeout config: connectionTimeout:8000, socketTimeout:10000, NO greetingTimeout
    // (matches orders/index.js pattern — greetingTimeout causes silent failures with SMTP2GO)
    const cfg     = await readConfig();
    const smtp    = cfg.smtp || {};
    const toEmail = cfg.orderEmail || "Orders@tocs.co";
    const confirmedOrder = data.orders[idx];

    if (smtp.host && smtp.user && smtp.pass) {
      // Fetch authority doc from Redis to attach to admin notification
      const authDoc = await readAuthority(id).catch(() => null);
      const authAttachment = (authDoc?.data && authDoc.filename)
        ? [{ filename: authDoc.filename, content: authDoc.data, encoding: "base64", contentType: authDoc.contentType || "application/octet-stream" }]
        : [];
      const emailJobs = [
        createTransporter(smtp).sendMail({
          from: `"TOCS Order Platform" <${toEmail}>`,
          to: toEmail,
          subject: `Payment Confirmed — Order #${id} — $${(confirmedOrder.total||0).toFixed(2)} AUD`,
          html: buildOrderEmailHtml(confirmedOrder),
          attachments: authAttachment,
        }).catch(e => console.error("Admin stripe email failed:", e.message)),
      ];
      if (confirmedOrder.contactInfo?.email) {
        emailJobs.push(
          createTransporter(smtp).sendMail({
            from: `"TOCS Order Platform" <${toEmail}>`,
            to: confirmedOrder.contactInfo.email,
            subject: `Payment Confirmed — Order ${id}`,
            html: buildCustomerEmailHtml(confirmedOrder, cfg),
          }).catch(e => console.error("Customer stripe email failed:", e.message))
        );
      }
      await Promise.allSettled(emailJobs).then(results => {
        const sent = results.filter(r => r.status === "fulfilled").length;
        console.log(`Stripe-confirm emails: ${sent}/${results.length} sent for order ${id}`);
      });
    }

    return res.status(200).json({ success: true, order: confirmedOrder });
```

**Replace with this complete block** (do not include the closing `}` and comment lines that follow — those stay as-is):

```js
    await writeData(data);

    // Send admin + customer emails using shared helpers from _lib/email.js
    // Timeout config: connectionTimeout:8000, socketTimeout:10000, NO greetingTimeout
    // (matches orders/index.js pattern — greetingTimeout causes silent failures with SMTP2GO)
    const cfg     = await readConfig();
    const smtp    = cfg.smtp || {};
    const toEmail = cfg.orderEmail || "Orders@tocs.co";
    const confirmedOrder = data.orders[idx];

    // Fetch authority doc once — shared by SP IIFE and email attachment below.
    // Intentionally unconditional: SP may be enabled even when SMTP is not.
    const authDoc = await readAuthority(id).catch(() => null);

    // ── START SP uploads immediately (fire-and-forget, parallel to emails) ─────
    // Pattern mirrors api/orders/index.js: IIFE starts at T=0, emails await in
    // parallel, response is sent after emails, then await spPromise (~1–2s left).
    let spPromise = Promise.resolve();
    const spConfig  = cfg?.sharepoint || {};
    const spEnabled = SHAREPOINT_ENABLED || !!(spConfig.tenantId && spConfig.clientId && spConfig.clientSecret && spConfig.siteId);
    if (spEnabled) {
      const categoryFolder = confirmedOrder.orderCategory === "keys" ? "Keys-Fobs" : "OC-Certificates";
      const buildingName   = (confirmedOrder.items?.[0]?.planName || "Unknown Building")
        .replace(/[\\/:*?"<>|]/g, "-").trim();
      const spSubFolder    = `${buildingName}/${categoryFolder}/${id}`;

      spPromise = (async () => {
        try {
          const [summaryBuf, receiptBuf] = await Promise.all([
            generateOrderPdf(confirmedOrder),
            generateReceiptPdf(confirmedOrder, stripeSessionId),
          ]);
          const summaryB64 = summaryBuf.toString("base64");
          const receiptB64 = receiptBuf.toString("base64");

          const [authResult, summaryResult, receiptResult] = await Promise.allSettled([
            authDoc?.data
              ? uploadToSharePoint(
                  `authority-${authDoc.filename}`,
                  authDoc.contentType || "application/octet-stream",
                  authDoc.data,
                  spConfig,
                  spSubFolder
                ).catch(e => { console.error("SP authority upload:", e.message); return null; })
              : Promise.resolve(null),
            uploadToSharePoint("order-summary.pdf", "application/pdf", summaryB64, spConfig, spSubFolder)
              .catch(e => { console.error("SP summary upload:", e.message); return null; }),
            uploadToSharePoint("payment-receipt.pdf", "application/pdf", receiptB64, spConfig, spSubFolder)
              .catch(e => { console.error("SP receipt upload:", e.message); return null; }),
          ]);

          const authUrl    = authResult.status    === "fulfilled" ? authResult.value    : null;
          const summaryUrl = summaryResult.status === "fulfilled" ? summaryResult.value : null;
          const receiptUrl = receiptResult.status === "fulfilled" ? receiptResult.value : null;

          // Fresh readData — avoids overwriting the "Paid" status committed above
          const freshData = await readData();
          const oi = freshData.orders.find(o => o.id === id);
          if (oi) {
            if (authUrl)            { oi.lotAuthorityUrl = authUrl;  oi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc saved to SharePoint", note: authUrl }); }
            else if (authDoc?.data) { oi.auditLog.push({ ts: new Date().toISOString(), action: "Authority doc SP upload failed", note: "See Vercel logs" }); }
            if (summaryUrl)         { oi.summaryUrl = summaryUrl;   oi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary saved to SharePoint", note: summaryUrl }); }
            else                    { oi.auditLog.push({ ts: new Date().toISOString(), action: "Order summary SP upload failed", note: "See Vercel logs" }); }
            if (receiptUrl)         { oi.receiptUrl = receiptUrl;   oi.auditLog.push({ ts: new Date().toISOString(), action: "Payment receipt saved to SharePoint", note: receiptUrl }); }
            else                    { oi.auditLog.push({ ts: new Date().toISOString(), action: "Payment receipt SP upload failed", note: "See Vercel logs" }); }
          }
          await writeData(freshData).catch(e => console.error("SP result persist failed:", e.message));
          console.log(`SP uploads done for stripe order ${id}: auth=${!!authUrl} summary=${!!summaryUrl} receipt=${!!receiptUrl}`);
        } catch (e) {
          console.error("SP upload block failed:", e.message);
        }
      })();
    }
    // ── END SP uploads ──────────────────────────────────────────────────────────

    if (smtp.host && smtp.user && smtp.pass) {
      const authAttachment = (authDoc?.data && authDoc.filename)
        ? [{ filename: authDoc.filename, content: authDoc.data, encoding: "base64", contentType: authDoc.contentType || "application/octet-stream" }]
        : [];
      const emailJobs = [
        createTransporter(smtp).sendMail({
          from: `"TOCS Order Platform" <${toEmail}>`,
          to: toEmail,
          subject: `Payment Confirmed — Order #${id} — $${(confirmedOrder.total||0).toFixed(2)} AUD`,
          html: buildOrderEmailHtml(confirmedOrder),
          attachments: authAttachment,
        }).catch(e => console.error("Admin stripe email failed:", e.message)),
      ];
      if (confirmedOrder.contactInfo?.email) {
        emailJobs.push(
          createTransporter(smtp).sendMail({
            from: `"TOCS Order Platform" <${toEmail}>`,
            to: confirmedOrder.contactInfo.email,
            subject: `Payment Confirmed — Order ${id}`,
            html: buildCustomerEmailHtml(confirmedOrder, cfg),
          }).catch(e => console.error("Customer stripe email failed:", e.message))
        );
      }
      await Promise.allSettled(emailJobs).then(results => {
        const sent = results.filter(r => r.status === "fulfilled").length;
        console.log(`Stripe-confirm emails: ${sent}/${results.length} sent for order ${id}`);
      });
    }

    // Send response before awaiting SP — customer should not wait for uploads
    res.status(200).json({ success: true, order: confirmedOrder });

    // Allow SP uploads to finish if still in-flight (mirrors orders/index.js pattern)
    await spPromise;
    return;
```

After applying this replacement, the lines that follow (`  }` and `  // ── END stripe-confirm ─`) remain unchanged.

- [ ] **Step 2.3: Verify the file parses without errors**

Run:
```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH node --input-type=module <<'EOF'
import handler from "./api/orders/[id]/[action].js";
console.log("Handler loaded OK:", typeof handler);
EOF
```

Expected: `Handler loaded OK: function`

If you see a syntax error, fix it before continuing.

- [ ] **Step 2.4: Start Vercel dev server and verify the full handler loads**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel dev --listen 3000
```

Navigate to the admin panel at http://localhost:3000. Verify no errors in the terminal.

Stop the server with Ctrl+C.

---

## Chunk 3: Deploy and Verify

### Task 3: Deploy to production and verify in Vercel logs

- [ ] **Step 3.1: Deploy to Vercel**

```bash
cd /Users/matthewhe/Documents/ClaudeProject/OCC_Order/tocs-deploy
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel --prod
```

Wait for deployment to complete.

- [ ] **Step 3.2: Verify production deployment loaded the new code**

Check the Vercel deployment logs to confirm no build errors.

- [ ] **Step 3.3: Place a test Stripe order and complete payment**

1. Go to https://occorder.vercel.app
2. Select a plan, add a product, fill contact details
3. Upload a test authority document (any PDF)
4. Choose Stripe payment and complete the checkout using Stripe's test card: `4242 4242 4242 4242` (exp: any future date, CVC: any 3 digits) — **only if running in Stripe test mode**
5. After redirect back to `/complete`, check the admin panel
6. Find the order in the admin Orders tab → expand the row → look at the audit log
7. Expected audit log entries:
   - `"Authority doc saved to SharePoint"` (or `"Authority doc SP upload failed"` if SP not configured)
   - `"Order summary saved to SharePoint"` (or failure)
   - `"Payment receipt saved to SharePoint"` (or failure)

- [ ] **Step 3.4: Check Vercel function logs**

```bash
PATH=/Users/matthewhe/.nvm/versions/node/v24.14.0/bin:$PATH vercel logs --prod --follow
```

Look for:
- `SP uploads done for stripe order TOCS-xxx: auth=true summary=true receipt=true`
- No `SP upload block failed` errors
- Function duration should be < 10s

- [ ] **Step 3.5: Verify SharePoint files exist (if SP is configured)**

Log into the SharePoint site and navigate to:
```
{folderPath}/{buildingName}/OC-Certificates/{orderId}/
```

Confirm three files exist:
- `authority-{filename}` — the uploaded levy notice
- `order-summary.pdf` — open it and verify it shows the order details with "Paid" status
- `payment-receipt.pdf` — open it and verify it shows: order ID, date paid, amount, "Stripe (Card)", Stripe session ID, customer name and email

- [ ] **Step 3.6: Test with no authority doc (optional)**

Place a Stripe order without attaching an authority document. After payment:
- Verify `order-summary.pdf` and `payment-receipt.pdf` are in SharePoint
- Verify no `authority-` file was uploaded
- Verify no "Authority doc SP upload failed" audit entry (it should be silently skipped)

- [ ] **Step 3.7: Verify non-Stripe order still works correctly**

Place a bank-transfer order. Verify:
- Authority doc uploads to SharePoint at order creation (not at confirmation)
- Order summary PDF uploads to SharePoint at order creation
- No `receiptUrl` or `payment-receipt.pdf` for non-Stripe orders
- Existing behaviour unchanged

---

## Summary of All Changes

**`api/_lib/pdf.js`** — added `generateReceiptPdf(order, sessionId)` export (~70 lines). Produces a single-page A4 PDF with receipt details, customer info, and TOCS footer. Follows the exact same pdfkit `new Promise` pattern as `generateOrderPdf`.

**`api/orders/[id]/[action].js`** — three changes to the `stripe-confirm` action:
1. New import: `import { generateOrderPdf, generateReceiptPdf } from "../../_lib/pdf.js";`
2. `authDoc` fetch moved outside the SMTP block (saves one Redis call; shared by both SP IIFE and email attachment)
3. SP upload IIFE inserted after `confirmedOrder` is set, before emails — fires concurrently, awaited after response is sent
