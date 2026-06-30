import ExcelJS from 'exceljs';

const FOREST   = 'FF1C3326';
const SAGE     = 'FF4A7255';
const SAGE_LT  = 'FFE4EDE7';
const CREAM    = 'FFF7F3EC';
const BORDER   = 'FFD8D2C8';
const WHITE    = 'FFFFFFFF';
const INK      = 'FF1A1F1C';

const STATUS_FONT = {
  'Issued':               'FF1E4A32',
  'Cancelled':            'FF7A2020',
  'On Hold':              'FF8B5E00',
  'Pending Payment':      INK,
  'Processing':           INK,
  'Awaiting Documents':   INK,
  'Invoice to be issued': INK,
};

const COLS = [
  { header: 'Order ID',               key: 'orderId',        width: 18 },
  { header: 'Date',                   key: 'date',           width: 13 },
  { header: 'Order Type',             key: 'orderType',      width: 17 },
  { header: 'Name',                   key: 'name',           width: 22 },
  { header: 'Email',                  key: 'email',          width: 28 },
  { header: 'Phone',                  key: 'phone',          width: 15 },
  { header: 'Building Name',          key: 'building',       width: 26 },
  { header: 'Lot Number',             key: 'lot',            width: 13 },
  { header: 'Applicant Type',         key: 'applicantType',  width: 16 },
  { header: 'Owner Name',             key: 'ownerName',      width: 20 },
  { header: 'Company',                key: 'company',        width: 20 },
  { header: 'Delivery Address',       key: 'address',        width: 32 },
  { header: 'Shipping Method',        key: 'shippingMethod', width: 18 },
  { header: 'Shipping Cost (AUD)',    key: 'shippingCost',   width: 16 },
  { header: 'Items',                  key: 'items',          width: 8  },
  { header: 'Total (AUD)',            key: 'total',          width: 14 },
  { header: 'Payment',                key: 'payment',        width: 14 },
  { header: 'Status',                 key: 'status',         width: 22 },
  { header: 'Admin Charge (AUD)',     key: 'adminCharge',    width: 18 },
];

const N = COLS.length; // 19

function fill(cell, argb) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

export async function generateOrderListExcel(orders, cfg = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TOCS OC Portal';
  wb.created = new Date();

  const ws = wb.addWorksheet('Orders', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }],
  });

  ws.columns = COLS.map(c => ({ key: c.key, width: c.width }));

  // ── Header block: rows 1-3 ──────────────────────────────────────────────
  ws.getRow(1).height = 8;
  ws.getRow(2).height = 44;
  ws.getRow(3).height = 10;

  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= N; c++) fill(ws.getCell(r, c), FOREST);
  }

  // Logo
  let logoEndCol = 0;
  if (cfg.logo && cfg.logo.startsWith('data:image/')) {
    try {
      const [meta, b64] = cfg.logo.split(',');
      const ext  = /png/i.test(meta) ? 'png' : 'jpeg';
      const imgId = wb.addImage({ buffer: Buffer.from(b64, 'base64'), extension: ext });
      ws.addImage(imgId, {
        tl: { col: 0.3, row: 0.25 },
        br: { col: 3.7, row: 2.75 },
        editAs: 'oneCell',
      });
      logoEndCol = 4;
    } catch { /* no logo */ }
  }

  // Title
  const titleStart = logoEndCol > 0 ? logoEndCol + 1 : 1;
  const titleEnd   = N - 3; // leave 3 cols for date
  ws.mergeCells(1, titleStart, 3, titleEnd);
  const titleCell      = ws.getCell(1, titleStart);
  titleCell.value      = 'TOCS ORDER EXPORT';
  titleCell.font       = { bold: true, size: 22, color: { argb: WHITE }, name: 'Calibri' };
  titleCell.alignment  = { vertical: 'middle', horizontal: logoEndCol > 0 ? 'left' : 'center' };

  // Date stamp (top-right, last 3 cols)
  ws.mergeCells(1, N - 2, 3, N);
  const dateCell       = ws.getCell(1, N - 2);
  const dateStr        = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  dateCell.value       = `Generated: ${dateStr}`;
  dateCell.font        = { size: 9, color: { argb: 'FFAACCAA' }, name: 'Calibri' };
  dateCell.alignment   = { vertical: 'bottom', horizontal: 'right' };

  // ── Column header row (row 4) ───────────────────────────────────────────
  ws.getRow(4).height = 24;
  COLS.forEach((col, i) => {
    const cell      = ws.getCell(4, i + 1);
    cell.value      = col.header;
    fill(cell, SAGE);
    cell.font       = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' };
    cell.alignment  = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border     = {
      right:  { style: 'thin',   color: { argb: 'FF2D5540' } },
      bottom: { style: 'medium', color: { argb: FOREST } },
    };
  });

  // ── Data rows (row 5+) ──────────────────────────────────────────────────
  orders.forEach((o, idx) => {
    const rowNum  = 5 + idx;
    const rowBg   = idx % 2 === 0 ? WHITE : CREAM;
    const ci      = o.contactInfo || {};
    const effType = ci.applicantType || (ci.companyName ? 'agent' : 'owner');
    const sa      = ci.shippingAddress;
    const addr    = sa?.street ? [sa.street, sa.suburb, sa.state, sa.postcode].filter(Boolean).join(', ') : '';
    const adminChg = (o.items || []).reduce((s, it) => s + ((it.managerAdminCharge || 0) * (it.qty || 1)), 0);
    const orderType = { oc: 'OC Certificate', keys: 'Keys / Fobs' }[o.orderCategory] || '';

    ws.getRow(rowNum).height = 18;

    const values = [
      o.id,
      new Date(o.date).toLocaleDateString('en-AU'),
      orderType,
      ci.name        ?? '',
      ci.email       ?? '',
      ci.phone       ?? '',
      o.items?.[0]?.planName  ?? '',
      o.items?.[0]?.lotNumber ?? '',
      effType === 'agent' ? 'Agent' : 'Owner',
      ci.ownerName   ?? '',
      ci.companyName ?? '',
      addr,
      o.selectedShipping?.name ?? '',
      o.selectedShipping?.cost > 0 ? o.selectedShipping.cost : null,
      o.items?.length ?? 0,
      o.total ?? 0,
      o.payment ?? '',
      o.status  ?? '',
      adminChg  >  0 ? adminChg : null,
    ];

    values.forEach((val, i) => {
      const cell   = ws.getCell(rowNum, i + 1);
      const colKey = COLS[i].key;

      if ((colKey === 'total' || colKey === 'shippingCost' || colKey === 'adminCharge') && val !== null) {
        cell.value  = typeof val === 'number' ? val : parseFloat(val) || 0;
        cell.numFmt = '"$"#,##0.00';
      } else if (colKey === 'items') {
        cell.value  = val;
        cell.numFmt = '0';
      } else {
        cell.value = val ?? '';
      }

      fill(cell, rowBg);
      cell.font      = {
        size:  9.5,
        color: { argb: colKey === 'status' ? (STATUS_FONT[String(val)] || INK) : INK },
        name:  'Calibri',
        bold:  colKey === 'status',
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
      cell.border    = {
        bottom: { style: 'thin', color: { argb: BORDER } },
        right:  { style: 'thin', color: { argb: 'FFE8E4DE' } },
      };
    });
  });

  // ── Totals footer row ───────────────────────────────────────────────────
  if (orders.length > 0) {
    const footRow = 5 + orders.length;
    ws.getRow(footRow).height = 20;

    for (let c = 1; c <= N; c++) fill(ws.getCell(footRow, c), SAGE_LT);

    const labelCell     = ws.getCell(footRow, 1);
    labelCell.value     = `${orders.length} order${orders.length !== 1 ? 's' : ''}`;
    labelCell.font      = { bold: true, size: 10, color: { argb: FOREST }, name: 'Calibri' };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const totalColIdx   = COLS.findIndex(c => c.key === 'total') + 1;
    const grandTotal    = orders.reduce((s, o) => s + (o.total || 0), 0);
    const totalCell     = ws.getCell(footRow, totalColIdx);
    totalCell.value     = grandTotal;
    totalCell.numFmt    = '"$"#,##0.00';
    totalCell.font      = { bold: true, size: 10, color: { argb: FOREST }, name: 'Calibri' };
    totalCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const adminColIdx   = COLS.findIndex(c => c.key === 'adminCharge') + 1;
    const adminTotal    = orders.reduce((s, o) => s + (o.items || []).reduce((si, it) => si + ((it.managerAdminCharge || 0) * (it.qty || 1)), 0), 0);
    if (adminTotal > 0) {
      const adminCell     = ws.getCell(footRow, adminColIdx);
      adminCell.value     = adminTotal;
      adminCell.numFmt    = '"$"#,##0.00';
      adminCell.font      = { bold: true, size: 10, color: { argb: FOREST }, name: 'Calibri' };
      adminCell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
