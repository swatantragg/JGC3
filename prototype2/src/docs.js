/* ============================================================================
   Export document engine — generates Excel (.xls HTML-workbook) for all 40
   documents of the Jaikvin export process.

   Every builder pulls live data from ONE selected invoice + the order masters,
   so each document cross-references the same PO / invoice / shipment figures
   (the "enter once, generate everything" story). The highlighted, dynamic areas
   of the real PDFs — invoice no, dates, buyer, BL/vessel/container, marks,
   quantities, values — are filled from that context; the surrounding boilerplate
   is reproduced faithfully.

   ctx = { inv, buyer, items, buyerMaster, invoices, SUPPLIERS, BUYERS, EXPORTER, supCode }
   ============================================================================ */

/* ---- formatting (self-contained, matches App.jsx conventions) ---- */
const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");
const inr2 = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdp = (n) => "$" + Number(n || 0).toFixed(4);
const num = (n, d = 2) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const pad3 = (n) => String(Math.max(0, Math.round(n))).padStart(3, "0");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ddmm = (s) => { if (!s) return ""; const d = new Date(s); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`; };
const dmy = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const gstRate = (hsn) => (String(hsn).startsWith("4819") ? 0.05 : 0.18);

/* ---- .xls workbook writer (Excel opens the HTML natively, keeps layout) ---- */
const XLS_STYLE = `
  table{border-collapse:collapse;margin-bottom:8px;}
  td,th{border:1px solid #aebccb;padding:3px 7px;font-family:Calibri,Arial,sans-serif;font-size:10.5pt;vertical-align:top;mso-number-format:"\\@";}
  th{background:#0b2c4d;color:#ffffff;font-weight:700;text-align:center;}
  .title{font-size:16pt;font-weight:800;color:#0b2c4d;}
  .sub{font-size:9.5pt;color:#516170;}
  .r{text-align:right;} .c{text-align:center;} .b{font-weight:700;} .lg{font-size:12pt;font-weight:800;color:#0b2c4d;}
  .sec{background:#e6edf4;font-weight:700;color:#0b2c4d;}
  .tot{background:#fbe6c2;font-weight:800;color:#0b2c4d;}
  .k{background:#f2f5f8;font-weight:700;white-space:nowrap;color:#0b2c4d;}
  .amber{color:#B7791F;font-weight:700;}
  .plain td{border:none;padding:1px 7px;}
  .plain{margin-bottom:2px;}
`;
export function writeXLS(filename, inner) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>${XLS_STYLE}</style></head><body>${inner}</body></html>`;
  try {
    const url = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/vnd.ms-excel" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (e) { alert("Download blocked in this preview environment."); }
}

/* ---- shared derived data ---- */
function exRate(ctx) { return Number(ctx.inv.ship?.exRate) || 92.5; }
function marksStart(ctx) { const m = (ctx.inv.ship?.marks || "").match(/(\d{3,})/); return m ? Number(m[1]) : 2001; }
function supFor(ctx, id) { return ctx.SUPPLIERS.find((s) => s.id === id) || {}; }

// Shipment lines (from the selected invoice) with every derived figure a document may need
function L(ctx) {
  const ex = exRate(ctx);
  let sr = Number(ctx.inv.serialStart) || marksStart(ctx);
  return ctx.inv.lines.map((l) => {
    const it = ctx.items.find((x) => x.id === l.itemId) || l.item || {};
    const boxes = Number(l.boxes) || 0, packing = Number(it.packing) || 0;
    const pieces = boxes * packing;
    const volTotal = boxes * (Number(it.volume) || 0);
    const netTotal = boxes * (Number(it.netPerBox) || 0);
    const grossTotal = boxes * (Number(it.grossPerBox) || 0);
    const fobPc = (Number(it.unitFob100) || 0) / 100, fobTotal = pieces * fobPc;
    const valUnit = Number(it.unitValue) || 0, valTotal = pieces * valUnit;
    const rbiTotal = fobTotal * ex, rateKg = netTotal ? fobTotal / netTotal : 0;
    const bg = packing, pc = 1, ttl = bg + pc;
    const stickers = Math.ceil(boxes * ttl * 1.05), sheets = Math.ceil(stickers / 125) || 0;
    const from = sr, to = sr + boxes - 1; sr += boxes;
    const range = boxes ? `${from}-${to}` : "—";
    const pos = [...new Set(ctx.buyerMaster.filter((r) => r.itemId === it.id).map((r) => r.po))].sort();
    return { it, sup: supFor(ctx, l.supplierId), supId: l.supplierId, boxes, packing, pieces, volTotal, netTotal, grossTotal, fobPc, fobTotal, valUnit, valTotal, rbiTotal, rateKg, bg, pc, ttl, stickers, sheets, range, pos };
  });
}

// Buyer-order-stage rows — aggregate the whole order book by item (docs 2A–6)
function orderAgg(ctx) {
  const ex = exRate(ctx), g = {};
  ctx.buyerMaster.forEach((r) => {
    const it = ctx.items.find((x) => x.id === r.itemId) || r.item;
    if (!it) return;
    if (!g[it.id]) g[it.id] = { it, qty: 0, pos: new Set(), rbi: r.rbi };
    g[it.id].qty += Number(r.qty) || 0; g[it.id].pos.add(r.po); g[it.id].rbi = r.rbi;
  });
  return Object.values(g).map((x) => {
    const it = x.it, qty = x.qty, packing = Number(it.packing) || 0;
    const boxes = Math.ceil(qty / packing) || 0;
    const volTotal = boxes * (Number(it.volume) || 0);
    const netTotal = boxes * (Number(it.netPerBox) || 0), grossTotal = boxes * (Number(it.grossPerBox) || 0);
    const fobPc = (Number(it.unitFob100) || 0) / 100, fobTotal = qty * fobPc;
    const valUnit = Number(it.unitValue) || 0, valTotal = qty * valUnit;
    const rbiTotal = fobTotal * ex;
    const bg = packing, pc = 1, ttl = bg + pc;
    const stickers = Math.ceil(boxes * ttl * 1.05), sheets = Math.ceil(stickers / 125) || 0;
    const typeUp = Number(it.typeUp) || 0;
    return { it, pos: [...x.pos].sort(), qty, packing, boxes, volTotal, netTotal, grossTotal, fobPc, fobTotal, valUnit, valTotal, rbiTotal, bg, pc, ttl, stickers, sheets, typeUp };
  }).sort((a, b) => String(a.it.gd || "").localeCompare(String(b.it.gd || "")));
}

function poHeaderList(ctx) {
  const seen = {};
  ctx.buyerMaster.forEach((r) => { if (!seen[r.po]) seen[r.po] = r.date; });
  return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1])).map(([po, d]) => `${po} DT ${ddmm(d)}`).join(", ");
}

/* ---- reusable HTML fragments ---- */
function exporterBlock(ctx) {
  const E = ctx.EXPORTER;
  return `<div class="lg">${esc(E.name)}</div><div class="sub">${esc(E.sub)}</div>
    <div class="sub">${esc(E.addr)}</div>
    <div class="sub">Tel: ${esc(E.tel)} &nbsp;E-Mail: ${esc(E.email)}</div>
    <div class="sub">IEC ${esc(E.iec)} &nbsp;GSTIN ${esc(E.gstin)} &nbsp;PAN ${esc(E.pan)}</div>`;
}
// Two-column masthead: exporter identity (left) + invoice / shipment meta (right)
function masthead(ctx, docTitle, opts = {}) {
  const inv = ctx.inv, s = inv.ship || {}, b = ctx.buyer;
  const meta = [
    ["Invoice No.", `${inv.invoiceNo} DT ${ddmm(inv.date)}`],
    ["Buyer's Order No.", `${b.orderNo || "—"}`],
    opts.po ? ["PO No(s).", poHeaderList(ctx)] : null,
    ["IEC", ctx.EXPORTER.iec],
    s.blNo ? ["BL No.", `${s.blNo} DT ${ddmm(s.blDate)}`] : null,
    s.sbNo ? ["S/B No.", `${s.sbNo} DT ${ddmm(s.sbDate)}`] : null,
    s.vessel ? ["Shipped per", s.vessel] : null,
    ["Country of Origin", ctx.EXPORTER.origin],
    ["Final Destination", s.finalDest || b.country],
  ].filter(Boolean);
  const metaRows = meta.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="b">${esc(v)}</td></tr>`).join("");
  const consignee = `<tr><td class="k">On Account &amp; Risk of</td><td class="b">Messrs ${esc(b.name)} &nbsp;T/A ${esc(b.brand)}<br>${esc(b.addr || "")}</td></tr>`;
  return `<div class="title">${esc(docTitle)}</div>
    <table style="width:100%"><tr>
      <td style="width:52%">${exporterBlock(ctx)}</td>
      <td><table style="width:100%">${metaRows}</table></td>
    </tr>
    <tr><td colspan="2"><table style="width:100%">${consignee}</table></td></tr></table>`;
}
// generic data table: cols = [{h, r?, c?, f(row)->cell}], foot = [{v, r?, span?}]
function tableOf(cols, rows, foot, sectionRows) {
  const head = `<tr>${cols.map((c) => `<th>${c.h}</th>`).join("")}</tr>`;
  const body = rows.map((row, i) => {
    if (sectionRows && sectionRows[i]) return `<tr><td class="sec" colspan="${cols.length}">${esc(sectionRows[i])}</td></tr><tr>${cols.map((c) => `<td class="${c.r ? "r" : c.c ? "c" : ""}">${c.f(row)}</td>`).join("")}</tr>`;
    return `<tr>${cols.map((c) => `<td class="${c.r ? "r" : c.c ? "c" : ""}">${c.f(row)}</td>`).join("")}</tr>`;
  }).join("");
  const f = foot ? `<tr class="tot">${foot.map((cell) => `<td class="${cell.r ? "r" : ""}"${cell.span ? ` colspan="${cell.span}"` : ""}>${cell.v}</td>`).join("")}</tr>` : "";
  return `<table>${head}${body}${f}</table>`;
}
function fnameFor(no, name, ctx) { return `Doc_${no}_${name.replace(/[^A-Za-z0-9]+/g, "_")}_${ctx.inv.invoiceNo.replace(/\//g, "-")}.xls`; }
const sum = (a, k) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);
const declBlock = (ctx) => { const E = ctx.EXPORTER; return `<table style="width:100%"><tr><td class="k" style="width:20%">Place</td><td>Mumbai</td><td class="k" style="width:20%">Date</td><td>${ddmm(ctx.inv.date)}</td></tr>
  <tr><td class="k">Signature</td><td colspan="3">For ${esc(E.name)} &nbsp;— &nbsp;Mr Aalok M Shah, Proprietor</td></tr></table>`; };

/* ============================================================================
   BUILDERS — one per document number
   ============================================================================ */
const B = {};

/* ---------- Stage A · Buyer order ---------- */
B["1"] = (ctx) => {
  const rows = orderAgg(ctx);
  const body = rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.it.code)}</td><td>${esc(r.it.gd)}</td><td>${esc(r.it.description)}</td><td class="c">${esc(r.it.size)}</td><td class="r">${r.qty.toLocaleString("en-IN")}</td><td class="r">${usdp(r.fobPc)}</td><td class="r">${usd(r.fobTotal)}</td></tr>`).join("");
  const head = `<tr><th>#</th><th>Code</th><th>GD Code</th><th>Description</th><th>Size</th><th>Qty (Pcs)</th><th>Rate $/pc</th><th>Amount $</th></tr>`;
  const foot = `<tr class="tot"><td colspan="5">TOTAL</td><td class="r">${sum(rows, "qty").toLocaleString("en-IN")}</td><td></td><td class="r">${usd(sum(rows, "fobTotal"))}</td></tr>`;
  const html = `<div class="title">BUYER PURCHASE ORDER</div>
    <table style="width:100%"><tr><td style="width:55%">${exporterBlock(ctx)}</td>
      <td><table style="width:100%"><tr><td class="k">PO No.</td><td class="b">${esc(ctx.buyer.orderNo)}</td></tr>
      <tr><td class="k">Date</td><td class="b">${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Buyer</td><td class="b">${esc(ctx.buyer.name)} T/A ${esc(ctx.buyer.brand)}</td></tr>
      <tr><td class="k">Ship To</td><td>${esc(ctx.buyer.addr || ctx.buyer.shipTo)}</td></tr></table></td></tr></table>
    <table>${head}${body}${foot}</table>`;
  return { name: "Buyers_Order", html };
};

B["2A"] = (ctx) => {
  const rows = orderAgg(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size (MM)", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) },
    { h: "Pack/Unit", c: 1, f: (r) => r.packing }, { h: "Pack/Box", c: 1, f: (r) => r.boxes ? Math.round(r.qty / r.boxes) : "" },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Code", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, f: (r) => r.qty.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "Vol/Box", r: 1, f: (r) => num(r.it.volume, 3) }, { h: "Total Vol", r: 1, f: (r) => num(r.volTotal, 2) },
    { h: "Net/Box", r: 1, f: (r) => num(r.it.netPerBox) }, { h: "Gross/Box", r: 1, f: (r) => num(r.it.grossPerBox) },
    { h: "Total Net kg", r: 1, f: (r) => num(r.netTotal) }, { h: "Total Gross kg", r: 1, f: (r) => num(r.grossTotal) },
    { h: "Stickers", r: 1, f: (r) => r.stickers }, { h: "Type UPS", r: 1, f: (r) => r.typeUp }, { h: "Sheets", r: 1, f: (r) => r.sheets },
    { h: "Value Unit ₹", r: 1, f: (r) => num(r.valUnit) }, { h: "Value Total ₹", r: 1, f: (r) => num(r.valTotal) },
    { h: "FOB/pc $", r: 1, f: (r) => usdp(r.fobPc) }, { h: "FOB Total $", r: 1, f: (r) => usd(r.fobTotal) },
    { h: "RBI Ref ₹", r: 1, f: (r) => num(r.rbiTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 10 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 },
    { v: "", span: 2 }, { v: "", span: 2 }, { v: num(sum(rows, "netTotal")), r: 1 }, { v: num(sum(rows, "grossTotal")), r: 1 },
    { v: "", span: 3 }, { v: "", span: 1 }, { v: num(sum(rows, "valTotal")), r: 1 }, { v: "", span: 1 }, { v: usd(sum(rows, "fobTotal")), r: 1 }, { v: num(sum(rows, "rbiTotal")), r: 1 }];
  const html = `<div class="title">2A · MASTER (Buyer Order)</div><div class="sub">PO NO : ${esc(poHeaderList(ctx))} &nbsp;— &nbsp;Rate @ Rs. ${exRate(ctx)}/US$</div>${tableOf(cols, rows, foot)}`;
  return { name: "Master_2A", html };
};

B["2"] = (ctx) => {
  const rows = orderAgg(ctx);
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Bar Codes", f: (r) => esc(r.it.barcode) }, { h: "Labels", r: 1, f: (r) => r.stickers.toLocaleString("en-IN") },
    { h: "Type UPS", r: 1, f: (r) => r.typeUp }, { h: "Sheets Reqd", r: 1, f: (r) => r.sheets },
  ];
  const html = `<div class="title">2 · BARCODE</div><div class="sub">PO NO : ${esc(poHeaderList(ctx))}</div>${tableOf(cols, rows, [{ v: "TOTAL", span: 3 }, { v: sum(rows, "stickers").toLocaleString("en-IN"), r: 1 }, { v: "" }, { v: sum(rows, "sheets"), r: 1 }])}`;
  return { name: "Barcode_2", html };
};

B["3"] = (ctx) => {
  const rows = orderAgg(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) },
    { h: "Pack/Unit", c: 1, f: (r) => r.packing }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Bar Codes", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, f: (r) => r.qty.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "Volumn", r: 1, f: (r) => num(r.volTotal, 2) }, { h: "Total Net", r: 1, f: (r) => num(r.netTotal) }, { h: "Total Gross", r: 1, f: (r) => num(r.grossTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 9 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: num(sum(rows, "volTotal"), 2), r: 1 }, { v: num(sum(rows, "netTotal")), r: 1 }, { v: num(sum(rows, "grossTotal")), r: 1 }];
  const html = `<div class="title">3 · PACKING</div><div class="sub">PO NO : ${esc(poHeaderList(ctx))}</div>${tableOf(cols, rows, foot)}`;
  return { name: "Packing_3", html };
};

B["4"] = (ctx) => {
  const rows = orderAgg(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Size", c: 1, f: (r) => esc(r.it.size) },
    { h: "Length", c: 1, f: (r) => esc(r.it.length) }, { h: "Pack/Unit", c: 1, f: (r) => r.packing },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Codes", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, f: (r) => r.qty.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "Value Unit ₹", r: 1, f: (r) => num(r.valUnit) }, { h: "Value Total ₹", r: 1, f: (r) => num(r.valTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 8 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: "" }, { v: num(sum(rows, "valTotal")), r: 1 }];
  const html = `<div class="title">4 · PURCHASE</div><div class="sub">PO NO : ${esc(poHeaderList(ctx))}</div>${tableOf(cols, rows, foot)}`;
  return { name: "Purchase_4", html };
};

B["5"] = (ctx) => {
  const rows = orderAgg(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) }, { h: "Pack/Unit", c: 1, f: (r) => r.packing },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Codes", f: (r) => esc(r.it.barcode) },
    { h: "Qty Pcs", r: 1, f: (r) => r.qty.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "FOB/100 Unit $", r: 1, f: (r) => usd(r.fobPc * 100) }, { h: "FOB Total $", r: 1, f: (r) => usd(r.fobTotal) },
    { h: "RBI Ref ₹", r: 1, f: (r) => num(r.rbiTotal) },
  ];
  const foot = [{ v: `TOTAL · Rate @ Rs. ${exRate(ctx)}`, span: 8 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1 }, { v: num(sum(rows, "rbiTotal")), r: 1 }];
  const html = `<div class="title">5 · SALES</div><div class="sub">PO NO : ${esc(poHeaderList(ctx))}</div>${tableOf(cols, rows, foot)}`;
  return { name: "Sales_5", html };
};

B["6"] = (ctx) => {
  // Supplier purchase order — grouped by supplier
  const lines = L(ctx), bySup = {};
  lines.forEach((x) => { (bySup[x.supId] = bySup[x.supId] || []).push(x); });
  const blocks = Object.entries(bySup).map(([sid, arr]) => {
    const s = supFor(ctx, sid);
    const cols = [
      { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Size", c: 1, f: (r) => esc(r.it.size) },
      { h: "Description of Goods", f: (r) => esc(r.it.description) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
      { h: "Quantity (Pcs)", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Unit Price ₹", r: 1, f: (r) => num(r.valUnit) }, { h: "Total Value ₹", r: 1, f: (r) => num(r.valTotal) },
    ];
    const foot = [{ v: "TOTAL", span: 5 }, { v: sum(arr, "pieces").toLocaleString("en-IN"), r: 1 }, { v: "" }, { v: num(sum(arr, "valTotal")), r: 1 }];
    return `<div class="title">EXPORT PURCHASE ORDER</div>
      <table style="width:100%"><tr><td style="width:55%">${exporterBlock(ctx)}</td>
      <td><table style="width:100%"><tr><td class="k">Purchase Order No.</td><td class="b">${esc(ctx.buyer.orderNo)}-${esc(s.code)} DT ${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Order of</td><td>PP &amp; NYLON MOULDED FITTINGS</td></tr>
      <tr><td class="k">Shipping Marks</td><td>${esc(ctx.buyer.brand)}</td></tr></table></td></tr>
      <tr><td colspan="2" class="k">To: Messrs ${esc(s.name)}, ${esc(s.place)} &nbsp;— GSTIN ${esc(s.gstin)}</td></tr></table>
      ${tableOf(cols, arr, foot)}`;
  }).join("<br>");
  return { name: "Suppliers_PO_6", html: blocks };
};

/* ---------- Stage B · Supplier packing (7A–11) ---------- */
function supplierTable(ctx, cols, footBuilder, title, sub) {
  const rows = L(ctx);
  const foot = footBuilder ? footBuilder(rows) : null;
  return `<div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div>${tableOf(cols, rows, foot)}`;
}
B["7A"] = (ctx) => {
  const cols = [
    { h: "Sr No", c: 1, f: (r) => r.range }, { h: "PO No", f: (r) => r.pos.join(", ") },
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "OSWIN Code", f: (r) => esc(r.it.oswin) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) }, { h: "Packing", c: 1, f: (r) => r.packing },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Codes", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "Vol/Box", r: 1, f: (r) => num(r.it.volume, 3) }, { h: "Total Vol", r: 1, f: (r) => num(r.volTotal, 2) },
    { h: "BG", r: 1, f: (r) => r.bg }, { h: "PC", r: 1, f: (r) => r.pc }, { h: "TTL", r: 1, f: (r) => r.ttl },
    { h: "Barcode Stk", r: 1, f: (r) => r.stickers }, { h: "Sheets", r: 1, f: (r) => r.sheets },
    { h: "Cost/Unit ₹", r: 1, f: (r) => num(r.valUnit) }, { h: "Total Cost ₹", r: 1, f: (r) => num(r.valTotal) },
    { h: "FOB/pc $", r: 1, f: (r) => usdp(r.fobPc) }, { h: "Total FOB $", r: 1, f: (r) => usd(r.fobTotal) },
    { h: "RBI Ref ₹", r: 1, f: (r) => num(r.rbiTotal) },
  ];
  const foot = (rows) => [{ v: "TOTAL", span: 12 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: "" }, { v: num(sum(rows, "volTotal"), 2), r: 1 }, { v: "", span: 3 }, { v: sum(rows, "stickers"), r: 1 }, { v: sum(rows, "sheets"), r: 1 }, { v: "" }, { v: num(sum(rows, "valTotal")), r: 1 }, { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1 }, { v: num(sum(rows, "rbiTotal")), r: 1 }];
  return { name: "Supplier_Master_7A", html: supplierTable(ctx, cols, foot, "7A · MOULDED ORDER MASTER (Supplier)", `PO NO : ${poHeaderList(ctx)} · Rate @ Rs. ${exRate(ctx)}`) };
};
B["7"] = (ctx) => {
  const cols = [
    { h: "Sr No", c: 1, f: (r) => r.range }, { h: "PO No", f: (r) => r.pos.join(", ") },
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "OSWIN Code", f: (r) => esc(r.it.oswin) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) }, { h: "Packing", c: 1, f: (r) => r.packing },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Codes", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "Vol/Box", r: 1, f: (r) => num(r.it.volume, 3) }, { h: "Total Vol", r: 1, f: (r) => num(r.volTotal, 2) },
    { h: "Total Net Wt", r: 1, f: (r) => num(r.netTotal) }, { h: "Gross Wt", r: 1, f: (r) => num(r.grossTotal) },
  ];
  const foot = (rows) => [{ v: "TOTAL", span: 11 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: "" }, { v: num(sum(rows, "volTotal"), 2), r: 1 }, { v: num(sum(rows, "netTotal")), r: 1 }, { v: num(sum(rows, "grossTotal")), r: 1 }];
  return { name: "Packing_7", html: supplierTable(ctx, cols, foot, "7 · PACKING (Supplier)", `PO NO : ${poHeaderList(ctx)}`) };
};
B["8"] = (ctx) => {
  const cols = [
    { h: "Sr No", c: 1, f: (r) => r.range }, { h: "PO No", f: (r) => r.pos.join(", ") },
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "OSWIN Code", f: (r) => esc(r.it.oswin) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) }, { h: "Packing", c: 1, f: (r) => r.packing },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Codes", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "Value Unit ₹", r: 1, f: (r) => num(r.valUnit) }, { h: "Value Total ₹", r: 1, f: (r) => num(r.valTotal) },
  ];
  const foot = (rows) => [{ v: "TOTAL", span: 11 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: "" }, { v: num(sum(rows, "valTotal")), r: 1 }];
  return { name: "Purchase_8", html: supplierTable(ctx, cols, foot, "8 · PURCHASE (Supplier)", `PO NO : ${poHeaderList(ctx)}`) };
};
B["9"] = (ctx) => {
  const cols = [
    { h: "Sr No", c: 1, f: (r) => r.range }, { h: "PO No", f: (r) => r.pos.join(", ") },
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) }, { h: "Packing", c: 1, f: (r) => r.packing },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Codes", f: (r) => esc(r.it.barcode) },
    { h: "Qty Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "FOB/pc $", r: 1, f: (r) => usdp(r.fobPc) }, { h: "Total FOB $", r: 1, f: (r) => usd(r.fobTotal) },
    { h: "RBI Ref ₹", r: 1, f: (r) => num(r.rbiTotal) },
  ];
  const foot = (rows) => [{ v: `TOTAL · Rate @ Rs. ${exRate(ctx)}`, span: 10 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1 }, { v: num(sum(rows, "rbiTotal")), r: 1 }];
  return { name: "Sales_9", html: supplierTable(ctx, cols, foot, "9 · SALES (Supplier)", `PO NO : ${poHeaderList(ctx)} · Rate @ Rs. ${exRate(ctx)}`) };
};
// Resolve the transport (transporter name + vehicle no) for a supplier on this
// invoice — from the shipment vehicle details, falling back to the packing pick.
function transportInfo(ctx, sid) {
  const v = (ctx.inv.vehicles || {})[sid] || {};
  let name = v.transportName || "", veh = v.vehicleNo || "";
  if (!name) {
    const tid = v.transportId || (ctx.inv.packingTransports || {})[sid];
    const t = (ctx.transports || []).find((x) => x.id === tid);
    name = t?.name || ""; if (!v.vehicleNo && t) veh = veh || "";
  }
  return { name: name || "—", veh: veh || "—" };
}
// One supplier's inward e-way block, with the transport detail beneath it.
function eway10Block(ctx, sid, arr) {
  const sp = supFor(ctx, sid), tr = transportInfo(ctx, sid);
  const qty = sum(arr, "pieces"), taxable = sum(arr, "valTotal"), igst = taxable * 0.18;
  return `<div class="title">E-WAY BILL (Inward / Purchase) — ${esc(sp.code || sp.name)}</div>
    <table style="width:100%"><tr><td class="k">Transaction Type</td><td>Inward — Supply</td><td class="k">Document</td><td>Tax Invoice</td><td class="k">Date</td><td>${ddmm(ctx.inv.date)}</td></tr></table>
    <table style="width:100%"><tr><td class="sec" colspan="2">Bill From / Despatch From</td><td class="sec" colspan="2">Bill To / Ship To</td></tr>
      <tr><td class="k">Name</td><td>${esc(sp.name)}</td><td class="k">Name</td><td>${esc(ctx.EXPORTER.name)}</td></tr>
      <tr><td class="k">GSTIN</td><td>${esc(sp.gstin)}</td><td class="k">GSTIN</td><td>${esc(ctx.EXPORTER.gstin)}</td></tr>
      <tr><td class="k">Place</td><td>${esc(sp.place)}</td><td class="k">Place</td><td>Village Khopta, JNPT, Raigad 410206</td></tr></table>
    <table><tr><th>Product</th><th>HSN</th><th>Qty</th><th>Unit</th><th>Taxable Value ₹</th><th>IGST %</th><th>IGST ₹</th><th>Total ₹</th></tr>
      <tr><td>${esc(sp.name)} goods</td><td>${esc(arr[0].it.hsn)}</td><td class="r">${qty.toLocaleString("en-IN")}</td><td class="c">PCS</td><td class="r">${num(taxable)}</td><td class="c">18%</td><td class="r">${num(igst)}</td><td class="r">${num(taxable + igst)}</td></tr></table>
    <table style="width:100%"><tr><td class="sec" colspan="4">Transport Detail — ${esc(sp.code || sp.name)}</td></tr>
      <tr><td class="k">Transporter</td><td class="b">${esc(tr.name)}</td><td class="k">Vehicle No.</td><td class="b">${esc(tr.veh)}</td></tr></table>`;
}
// Supplier-wise e-way documents (one per supplier) — for the split download.
export function ewaySupplierDocs(ctx) {
  const lines = L(ctx), bySup = {}; lines.forEach((x) => { (bySup[x.supId] = bySup[x.supId] || []).push(x); });
  return Object.entries(bySup).map(([sid, arr]) => {
    const sp = supFor(ctx, sid);
    return { supplierId: sid, code: sp.code || sid, name: sp.name || sid, html: eway10Block(ctx, sid, arr) };
  });
}
B["10"] = (ctx) => ({ name: "Eway_Purchase_10", html: ewaySupplierDocs(ctx).map((d) => d.html).join("<br>") });
B["11A"] = (ctx) => {
  const s = ctx.inv.ship || {};
  const html = `<div class="title">DELIVERY ORDER (D.O.)</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">Ref No.</td><td>JG/${new Date(ctx.inv.date).getFullYear()}/DO</td><td class="k">Date</td><td>${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Invoice No.</td><td>${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td><td class="k">Container</td><td>${esc(s.container || "—")}</td></tr>
      <tr><td class="k">Vessel</td><td>${esc(s.vessel || "—")}</td><td class="k">POD</td><td>${esc(s.pod || ctx.buyer.shipTo)}</td></tr>
      <tr><td class="k">Marks &amp; Nos</td><td>${esc(s.marks || "—")}</td><td class="k">Packages</td><td>${esc(s.pkgs || "—")}</td></tr>
    </table>
    <p>Please deliver the below consignment for export shipment against the above invoice.</p>
    <table><tr><th>GD Code</th><th>Description</th><th>Boxes</th><th>Net Wt kg</th><th>Gross Wt kg</th></tr>
    ${L(ctx).map((r) => `<tr><td>${esc(r.it.gd)}</td><td>${esc(r.it.description)}</td><td class="r">${r.boxes}</td><td class="r">${num(r.netTotal)}</td><td class="r">${num(r.grossTotal)}</td></tr>`).join("")}
    <tr class="tot"><td colspan="2">TOTAL</td><td class="r">${sum(L(ctx), "boxes")}</td><td class="r">${num(sum(L(ctx), "netTotal"))}</td><td class="r">${num(sum(L(ctx), "grossTotal"))}</td></tr></table>`;
  return { name: "Delivery_Order_11A", html };
};
B["11"] = (ctx) => {
  const s = ctx.inv.ship || {};
  const sup = supFor(ctx, L(ctx)[0]?.supId);
  const html = `<div class="title">DESPATCH INSTRUCTIONS</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">Ref No.</td><td>JG/${new Date(ctx.inv.date).getFullYear()}/DI</td><td class="k">Date</td><td>${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">To (Supplier)</td><td>${esc(sup.name || "—")}, ${esc(sup.place || "")}</td><td class="k">Despatch Date</td><td>${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Ref Export Order</td><td colspan="3">${esc(poHeaderList(ctx))}</td></tr>
    </table>
    <p><b>1)</b> All packages to be marked as ${esc(s.marks || "GDW")} / ${esc(s.pkgs || "")}.<br>
    <b>2)</b> Book the consignment for delivery at JNPT / Dronagiri (Door Delivery).<br>
    <b>3)</b> Lorry receipt in our name a/c M/s Velji Dosabhai &amp; Sons Pvt Ltd, Mumbai, freight to pay.<br>
    <b>4)</b> L/R to show goods for export.<br>
    <b>5)</b> Container No. ${esc(s.container || "—")} · Vessel ${esc(s.vessel || "—")}.</p>
    <p>Upon despatch send us your invoice. For ${esc(ctx.EXPORTER.name)} — Proprietor.</p>`;
  return { name: "Despatch_Instructions_11", html };
};

/* ---------- Stage C · Pre-shipment (12–29) ---------- */
B["12"] = (ctx) => {
  const lines = L(ctx), ex = exRate(ctx), bySup = {};
  lines.forEach((x) => { const k = x.sup.code || "—"; (bySup[k] = bySup[k] || { hsn: x.it.hsn, box: 0, vol: 0, qty: 0, net: 0, gross: 0, pur: 0, sale: 0 }); const g = bySup[k]; g.box += x.boxes; g.vol += x.volTotal; g.qty += x.pieces; g.net += x.netTotal; g.gross += x.grossTotal; g.pur += x.valTotal; g.sale += x.fobTotal; });
  const rows = Object.entries(bySup).map(([k, g]) => ({ k, ...g }));
  const cols = [
    { h: "Supplier", f: (r) => esc(r.k) }, { h: "HSN", f: (r) => esc(r.hsn) },
    { h: "Box", r: 1, f: (r) => r.box }, { h: "Volume", r: 1, f: (r) => num(r.vol, 2) }, { h: "Quantity", r: 1, f: (r) => r.qty.toLocaleString("en-IN") },
    { h: "Net Wt", r: 1, f: (r) => num(r.net) }, { h: "Gross Wt", r: 1, f: (r) => num(r.gross) },
    { h: "Taxable Purchase ₹", r: 1, f: (r) => num(r.pur) }, { h: "GST 18% ₹", r: 1, f: (r) => num(r.pur * 0.18) },
    { h: "Taxable Sales $", r: 1, f: (r) => usd(r.sale) }, { h: "Taxable Sales ₹", r: 1, f: (r) => num(r.sale * ex) },
  ];
  const foot = [{ v: "TOTAL", span: 2 }, { v: sum(rows, "box"), r: 1 }, { v: num(sum(rows, "vol"), 2), r: 1 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1 }, { v: num(sum(rows, "net")), r: 1 }, { v: num(sum(rows, "gross")), r: 1 }, { v: num(sum(rows, "pur")), r: 1 }, { v: num(sum(rows, "pur") * 0.18), r: 1 }, { v: usd(sum(rows, "sale")), r: 1 }, { v: num(sum(rows, "sale") * ex), r: 1 }];
  const html = `<div class="title">12 · SHIPMENT BOXES &amp; VOLUME</div><div class="sub">Invoice ${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)} · Rate @ Rs. ${ex}/$</div>${tableOf(cols, rows, foot)}`;
  return { name: "Shipment_Boxes_Volume_12", html };
};
B["13"] = (ctx) => {
  const s = ctx.inv.ship || {};
  const html = `<div class="title">ANNEXURE-A · EXPORT VALUE DECLARATION</div>
    <div class="sub">(See Customs Valuation (Determination of Value of Export Goods) Rules, 2007)</div>
    <table style="width:100%">
      <tr><td class="k">1. Shipping Bill No. &amp; Date</td><td>${esc(s.sbNo || "—")} ${s.sbDate ? "DT " + ddmm(s.sbDate) : ""}</td></tr>
      <tr><td class="k">2. Invoice No. &amp; Date</td><td>${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">3. Nature of Transaction</td><td>Sale</td></tr>
      <tr><td class="k">4. Method of Valuation</td><td>Rule 3</td></tr>
      <tr><td class="k">5. Seller &amp; buyer related?</td><td>No</td></tr>
      <tr><td class="k">7. Terms of Payment</td><td>${esc(s.payment || "D.P. SIGHT DRAFT")}</td></tr>
      <tr><td class="k">8. Terms of Delivery</td><td>${esc(s.terms || "FOB MUMBAI")}</td></tr>
      <tr><td class="k">FOB Value</td><td class="b">${usd(sum(L(ctx), "fobTotal"))}</td></tr>
    </table>
    <p>DECLARATION: We hereby declare that the information furnished above is true, complete and correct in every respect.</p>${declBlock(ctx)}`;
  return { name: "Export_Value_Declaration_13", html };
};
B["14"] = (ctx) => {
  const E = ctx.EXPORTER;
  const html = `<div class="title">SCOMET DECLARATION</div>${exporterBlock(ctx)}<br>
    <table style="width:100%"><tr><td class="k">Invoice No &amp; Date</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr></table>
    <p>WE M/S. ${esc(E.name)} FURTHER UNDERTAKE AND CONFIRM:</p>
    <p>• Our products do not fall under the restricted / negative list under FTP nor are categorized under the SCOMET list.<br>
    • Exports are neither covered under EU Registration 423/2007 nor is the customer listed under OFAC SDN list.<br>
    • The goods are not meant for any military / nuclear activity or development.<br>
    • These supplies do not contravene UNSC Resolution 1929(2010) or IAEA document INFCIRC/254.</p>${declBlock(ctx)}`;
  return { name: "Scomet_Declaration_14", html };
};
B["15"] = (ctx) => {
  const html = `<div class="title">SDF DECLARATION</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">Invoice No</td><td class="b">${esc(ctx.inv.invoiceNo)}</td><td class="k">Date</td><td class="b">${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Name of Exporter</td><td>Mr Aalok M Shah</td><td class="k">Designation</td><td>Proprietor</td></tr>
    </table>
    <p>I/We declare that the particulars given herein above are true, correct and complete. I/We undertake to abide by the provisions of the Foreign Exchange Management Act, 1999, including realization / repatriation of foreign exchange.</p>
    <p>Documents enclosed: Invoice cum Packing-List — APPLICABLE.</p>${declBlock(ctx)}`;
  return { name: "SDF_Declaration_15", html };
};
B["16"] = (ctx) => {
  const html = `<div class="title">RoDTEP DECLARATION</div>${exporterBlock(ctx)}<br>
    <table style="width:100%"><tr><td class="k">Invoice No &amp; Date</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr></table>
    <p>I/We, in regard to our claim under the RoDTEP scheme made in this Shipping Bill / Bill of Export, hereby declare that:</p>
    <p>1. We undertake to abide by the provisions, conditions, restrictions, exclusions and time-limits under the RoDTEP scheme and relevant notifications.<br>
    2. Any claim made is not with respect to duties/taxes/levies exempted, remitted or credited under any other mechanism outside RoDTEP.<br>
    3. We undertake to preserve and make available relevant documents for audit per the Customs Audit Regulations, 2018.</p>${declBlock(ctx)}`;
  return { name: "RoDTEP_Declaration_16", html };
};
// Proforma groups items by FOB basis (per piece / per 100 / customize). The GD
// code and Box columns are intentionally left off this download format.
const fobModeOf = (it) => it?.fobMode || "100";
const modeLabel = (m) => (m === "piece" ? "Per piece" : m === "custom" ? "Customize" : "Per 100 pieces");
B["17"] = (ctx) => {
  const rows = L(ctx);
  const order = ["piece", "100", "custom"];
  const g = {}; rows.forEach((r) => { const m = fobModeOf(r.it); (g[m] = g[m] || []).push(r); });
  const groups = order.filter((m) => g[m]?.length);
  const head = `<tr><th>Code</th><th>Size</th><th>Len (MM)</th><th>Pieces</th><th>Rate $</th><th>Total Value $</th></tr>`;
  const section = (m) => {
    const arr = g[m], per100 = m === "100";
    const body = arr.map((r) => {
      const rate = per100 ? r.fobPc * 100 : r.fobPc;
      return `<tr><td>${esc(r.it.code)}</td><td class="c">${esc(r.it.size)}</td><td class="c">${esc(r.it.length)}</td><td class="r">${r.pieces.toLocaleString("en-IN")}</td><td class="r">${per100 ? usd(rate) + "/100" : usdp(rate) + "/pc"}</td><td class="r">${usd(r.fobTotal)}</td></tr>`;
    }).join("");
    return `<tr class="sec"><td colspan="6">${modeLabel(m)}</td></tr>${head}${body}<tr class="sec"><td colspan="3">Subtotal — ${modeLabel(m)}</td><td class="r">${sum(arr, "pieces").toLocaleString("en-IN")}</td><td></td><td class="r">${usd(sum(arr, "fobTotal"))}</td></tr>`;
  };
  const grand = `<tr class="tot"><td colspan="3">TOTAL</td><td class="r">${sum(rows, "pieces").toLocaleString("en-IN")}</td><td></td><td class="r">${usd(sum(rows, "fobTotal"))}</td></tr>`;
  const html = `<div class="title">17 · PROFORMA INVOICE (Buyer)</div>
    <table style="width:100%"><tr><td style="width:52%">${exporterBlock(ctx)}</td>
    <td><table style="width:100%"><tr><td class="k">PO No.</td><td class="b">${esc(ctx.buyer.orderNo)}</td></tr>
    <tr><td class="k">Date</td><td class="b">${ddmm(ctx.inv.date)}</td></tr>
    <tr><td class="k">Deliver To</td><td>${esc(ctx.buyer.name)} T/A ${esc(ctx.buyer.brand)}<br>${esc(ctx.buyer.addr || "")}</td></tr>
    <tr><td class="k">Terms</td><td>${esc(ctx.inv.ship?.terms || "FOB MUMBAI")}</td></tr></table></td></tr></table>
    <table>${groups.map(section).join("")}${grand}</table>
    <p class="sub">Freight to collect / payable at destination. Delivery ${dmy(ctx.inv.date)}. Items grouped by pricing basis.</p>`;
  return { name: "Proforma_Invoice_17", html };
};
B["18"] = (ctx) => {
  const rows = L(ctx), ex = exRate(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "HSN", f: (r) => esc(r.it.hsn) }, { h: "Size", c: 1, f: (r) => esc(r.it.size) },
    { h: "Pieces", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Rate $/pc", r: 1, f: (r) => usdp(r.fobPc) },
    { h: "FOB Amount $", r: 1, f: (r) => usd(r.fobTotal) }, { h: "Taxable ₹", r: 1, f: (r) => num(r.fobTotal * ex) },
    { h: "GST %", c: 1, f: (r) => (gstRate(r.it.hsn) * 100).toFixed(0) + "%" }, { h: "GST ₹", r: 1, f: (r) => num(r.fobTotal * ex * gstRate(r.it.hsn)) },
  ];
  const taxTot = sum(rows, "fobTotal") * ex, gstTot = rows.reduce((s, r) => s + r.fobTotal * ex * gstRate(r.it.hsn), 0);
  const foot = [{ v: `TOTAL FOB · ${sum(rows, "boxes")} boxes`, span: 3 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1 }, { v: num(taxTot), r: 1 }, { v: "" }, { v: num(gstTot), r: 1 }];
  const html = `${masthead(ctx, "18 · CUSTOM INVOICE")}${tableOf(cols, rows, foot)}
    <table style="width:100%"><tr><td class="k">Nett Wt</td><td>${num(sum(rows, "netTotal"))} kg</td><td class="k">Gross Wt</td><td>${num(sum(rows, "grossTotal"))} kg</td><td class="k">FOB Value</td><td class="b">${usd(sum(rows, "fobTotal"))} / ${inr(taxTot)}</td></tr></table>
    <p class="sub">Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX. We intend to claim rewards under RoDTEP. — For ${esc(ctx.EXPORTER.name)}</p>`;
  return { name: "Custom_Invoice_18", html };
};
function packingListDoc(ctx, title, no, boxLabel = "Boxes") {
  const rows = L(ctx), s = ctx.inv.ship || {};
  const cols = [
    { h: "Sr No / Marks", c: 1, f: (r) => r.range }, { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Qty Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: boxLabel, r: 1, f: (r) => r.boxes },
    { h: "Net Wt kg", r: 1, f: (r) => num(r.netTotal) }, { h: "Gross Wt kg", r: 1, f: (r) => num(r.grossTotal) }, { h: "Volume m³", r: 1, f: (r) => num(r.volTotal, 2) },
  ];
  const foot = [{ v: "TOTAL", span: 4 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: num(sum(rows, "netTotal")), r: 1 }, { v: num(sum(rows, "grossTotal")), r: 1 }, { v: num(sum(rows, "volTotal"), 2), r: 1 }];
  const shipRow = `<table style="width:100%"><tr><td class="k">BL</td><td>${esc(s.blNo || "—")} ${s.blDate ? "DT " + ddmm(s.blDate) : ""}</td><td class="k">Vessel</td><td>${esc(s.vessel || "—")}</td></tr>
    <tr><td class="k">Container</td><td>${esc(s.container || "—")}</td><td class="k">Seal</td><td>${esc(s.seal || "—")}</td></tr>
    <tr><td class="k">Marks</td><td>${esc(s.marks || "—")}</td><td class="k">Packages</td><td>${esc(s.pkgs || "—")}</td></tr></table>`;
  return `${masthead(ctx, title)}${shipRow}${tableOf(cols, rows, foot)}`;
}
B["19"] = (ctx) => ({ name: "Packing_List_19", html: packingListDoc(ctx, "19 · PACKING LIST", "19", "Packages") });
B["20"] = (ctx) => {
  const rows = L(ctx);
  const cols = [
    { h: "Marks", c: 1, f: (r) => r.range }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Pack/Box", r: 1, f: (r) => r.packing }, { h: "Qty Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Boxes", r: 1, f: (r) => r.boxes }, { h: "Net kg", r: 1, f: (r) => num(r.netTotal) }, { h: "Gross kg", r: 1, f: (r) => num(r.grossTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 5 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: num(sum(rows, "netTotal")), r: 1 }, { v: num(sum(rows, "grossTotal")), r: 1 }];
  return { name: "Packing_List_Itemwise_20", html: `${masthead(ctx, "20 · PACKING LIST (Item-wise Details)", { po: 1 })}${tableOf(cols, rows, foot)}` };
};
function packagingDeclaration(ctx, title, no) {
  const s = ctx.inv.ship || {};
  return `<div class="title">${esc(title)}</div>
    <table style="width:100%">
      <tr><td class="k">Vessel Name</td><td>${esc((s.vessel || "").split(" ")[0] || "—")}</td><td class="k">Voyage Number</td><td>${esc(s.vessel || "—")}</td></tr>
      <tr><td class="k">BL Number</td><td>${esc(s.blNo || "—")}</td><td class="k">Date</td><td>${ddmm(s.blDate)}</td></tr>
      <tr><td class="k">Container No.</td><td colspan="3">${esc(s.container || "—")}</td></tr>
      <tr><td class="k">Consignment</td><td colspan="3">${esc(s.marks || "GDW")} / ${esc(s.pkgs || "")} CONTAINING PP EXTRUDED PIPES, PP &amp; NYLON MOULDED FITTINGS &amp; CORRUGATED BOXES</td></tr>
    </table>
    <table style="width:100%">
      <tr><td class="k" style="width:75%">Q1. Have unacceptable packaging materials (straw, peat, hay, chaff, used cartons) been used?</td><td class="c">No ✓</td></tr>
      <tr><td class="k">Q2. Does the consignment contain timber / bamboo packaging or dunnage?</td><td class="c">No ✓</td></tr>
      <tr><td class="k">Q3. Is any packaging made of solid wood?</td><td class="c">No ✓</td></tr>
    </table>
    <p>We declare that the above information is true and correct. For ${esc(ctx.EXPORTER.name)}.</p>`;
}
B["21"] = (ctx) => ({ name: "Packaging_Declaration_21", html: packagingDeclaration(ctx, "21 · PACKAGING DECLARATION", "21") });
B["22"] = (ctx) => {
  const s = ctx.inv.ship || {};
  const html = `<div class="title">INSTRUCTION FOR PREPARATION OF SHIPPING BILL (Letter to CHA)</div>
    <table style="width:100%">
      <tr><td class="k">Shippers</td><td>${esc(ctx.EXPORTER.name)}, ${esc(ctx.EXPORTER.addr)}</td></tr>
      <tr><td class="k">Shipping Agents</td><td>M/s. Velji Dosabhai &amp; Sons P Ltd, Godrej Colliseum, Sion (E), Mumbai 400 022</td></tr>
      <tr><td class="k">Invoice No.</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Consignee</td><td>Messrs ${esc(ctx.buyer.name)} T/A ${esc(ctx.buyer.brand)}, ${esc(ctx.buyer.addr || "")}</td></tr>
      <tr><td class="k">Shipment From / To</td><td>Nhava Sheva → ${esc(s.pod || ctx.buyer.shipTo)}</td></tr>
      <tr><td class="k">Type of Shipping Bill</td><td>DRAWBACK</td></tr>
      <tr><td class="k">Container No.</td><td>${esc(s.container || "—")}</td></tr>
      <tr><td class="k">Vessel</td><td>${esc(s.vessel || "—")}</td></tr>
    </table>
    <p>Kindly prepare the Shipping Bill as per the above particulars and the attached invoice &amp; packing list. For ${esc(ctx.EXPORTER.name)}.</p>`;
  return { name: "Letter_to_CHA_22", html };
};
B["23"] = (ctx) => {
  const rows = L(ctx), s = ctx.inv.ship || {};
  const cols = [
    { h: "Item Code", f: (r) => esc(r.it.code) }, { h: "Quantity Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Supplier Name", f: (r) => esc(r.sup.name || "—") }, { h: "District", f: (r) => esc(r.sup.place || "—") },
    { h: "GSTIN", f: (r) => esc(r.sup.gstin || "—") }, { h: "Tax Inv No", f: (r) => "DN-" + pad3(r.boxes * 7) }, { h: "Date", c: 1, f: (r) => ddmm(ctx.inv.date) },
  ];
  const html = `<div class="title">23 · SUPPLIERS DETAILS</div>
    <table style="width:100%"><tr><td class="k">Inv No &amp; Dt</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td><td class="k">No of Pkgs</td><td>${esc(s.pkgs || "—")}</td><td class="k">Shipment to</td><td>${esc(s.pod || ctx.buyer.shipTo)}</td></tr></table>
    ${tableOf(cols, rows, [{ v: "TOTAL", span: 1 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: "", span: 5 }])}`;
  return { name: "Suppliers_Details_23", html };
};
B["24"] = (ctx) => {
  const rows = L(ctx), s = ctx.inv.ship || {};
  const cols = [
    { h: "Item Code", f: (r) => esc(r.it.code) }, { h: "Quantity Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "FOB/pc $", r: 1, f: (r) => usdp(r.fobPc) }, { h: "FOB Total $", r: 1, f: (r) => usd(r.fobTotal) },
    { h: "Net Wt kg", r: 1, f: (r) => num(r.netTotal) }, { h: "Rate/kg $", r: 1, f: (r) => num(r.rateKg, 3) },
  ];
  const foot = [{ v: "TOTAL", span: 1 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1 }, { v: num(sum(rows, "netTotal")), r: 1 }, { v: "" }];
  const html = `<div class="title">24 · ANNEXURE TO INVOICE (BL Annexure)</div>
    <table style="width:100%"><tr><td class="k">Inv No &amp; Dt</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td><td class="k">No of Pkgs</td><td>${esc(s.pkgs || "—")}</td><td class="k">Shipment to</td><td>${esc(s.pod || ctx.buyer.shipTo)}</td></tr></table>
    ${tableOf(cols, rows, foot)}`;
  return { name: "BL_Annexure_24", html };
};
B["25"] = (ctx) => {
  const rows = L(ctx), ex = exRate(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "HSN", f: (r) => esc(r.it.hsn) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Qty", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Taxable ₹", r: 1, f: (r) => num(r.fobTotal * ex) },
    { h: "IGST %", c: 1, f: (r) => (gstRate(r.it.hsn) * 100).toFixed(0) + "%" }, { h: "IGST ₹", r: 1, f: (r) => num(r.fobTotal * ex * gstRate(r.it.hsn)) },
    { h: "Total ₹", r: 1, f: (r) => num(r.fobTotal * ex * (1 + gstRate(r.it.hsn))) },
  ];
  const tax = sum(rows, "fobTotal") * ex, gst = rows.reduce((a, r) => a + r.fobTotal * ex * gstRate(r.it.hsn), 0);
  const html = `<div class="title">25 · E-INVOICE (IRN)</div>
    <table style="width:100%"><tr><td class="k">Invoice No.</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td><td class="k">IRN</td><td class="sub">5049ef43c7126a4c35bf29795ce49390de0338c2897a4b</td></tr>
    <tr><td class="k">Ack No</td><td>122632432448548</td><td class="k">Ack Dt</td><td>${ddmm(ctx.inv.date)}</td></tr></table>
    ${tableOf(cols, rows, [{ v: "TOTAL", span: 4 }, { v: num(tax), r: 1 }, { v: "" }, { v: num(gst), r: 1 }, { v: num(tax + gst), r: 1 }])}`;
  return { name: "E_Invoice_25", html };
};
B["26"] = (ctx) => {
  const s = ctx.inv.ship || {};
  const html = `<div class="title">26 · SHIPPING INSTRUCTIONS</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">Invoice No.</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Shipper</td><td>${esc(ctx.EXPORTER.name)}</td></tr>
      <tr><td class="k">Consignee</td><td>${esc(ctx.buyer.name)} T/A ${esc(ctx.buyer.brand)}, ${esc(ctx.buyer.addr || "")}</td></tr>
      <tr><td class="k">Vessel / Voyage</td><td>${esc(s.vessel || "—")}</td></tr>
      <tr><td class="k">Port of Loading</td><td>${esc(s.pol || "NHAVA SHEVA")}</td></tr>
      <tr><td class="k">Port of Discharge</td><td>${esc(s.pod || ctx.buyer.shipTo)}</td></tr>
      <tr><td class="k">Final Destination</td><td>${esc(s.finalDest || ctx.buyer.country)}</td></tr>
      <tr><td class="k">Container / Seal</td><td>${esc(s.container || "—")} / ${esc(s.seal || "—")}</td></tr>
      <tr><td class="k">Nett / Gross Wt</td><td>${esc(s.netWt || "—")} kg / ${esc(s.grossWt || "—")} kg</td></tr>
      <tr><td class="k">Freight</td><td>${esc(s.terms || "FOB")} — Freight to collect</td></tr>
    </table>`;
  return { name: "Shipping_Instructions_26", html };
};
B["27"] = (ctx) => {
  const s = ctx.inv.ship || {}, net = Number(s.netWt) || sum(L(ctx), "netTotal"), tare = 2185, vgm = net + tare;
  const rows = [
    ["1. Booking No.", "2327513270"], ["2. Name of the shipper", ctx.EXPORTER.name], ["3. Shipper IEC No.", ctx.EXPORTER.iec],
    ["4. Authorized official", "Mr. Aalok M Shah – Proprietor"], ["5. 24x7 contact", ctx.EXPORTER.tel],
    ["6. Container No.", (s.container || "—") + " (20')"], ["7. Container Size", "1 x 20' FCL"],
    ["8. Max permissible weight", "30480 Kgs per Container"], ["9. Weighbridge", "SHRI NARAYAN WEIGH BRIDGE, Khopte, Uran, Raigad"],
    ["10. Weighing Method", "METHOD-2"], ["11. Verified Gross Mass (VGM)", `NT WT ${num(net)} + TARE ${tare} = VGM ${num(vgm)} KGS`],
    ["12. Date &amp; time of weighing", ddmm(s.blDate || ctx.inv.date)], ["13. Weighing Slip No.", "29713"], ["14. Type", "NORMAL"],
  ];
  const html = `<div class="title">27 · DECLARATION OF VERIFIED GROSS MASS (VGM)</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">${rows.map(([k, v]) => `<tr><td class="k" style="width:38%">${k}</td><td>${esc(v)}</td></tr>`).join("")}</table>
    <p>Signature of authorized person of shipper — Mr Aalok M Shah, Proprietor, ${esc(ctx.EXPORTER.name)}.</p>`;
  return { name: "VGM_27", html };
};
B["28"] = (ctx) => costSheet(ctx, "28 · COST SHEETS", "Cost_Sheets_28");
function costSheet(ctx, title, fname) {
  const lines = L(ctx), ex = exRate(ctx), bySup = {};
  lines.forEach((x) => { const k = x.sup.code || "—"; (bySup[k] = bySup[k] || { sup: x.sup, fob: 0, raw: 0 }); bySup[k].fob += x.fobTotal * ex; bySup[k].raw += x.valTotal; });
  const blocks = Object.entries(bySup).map(([k, g]) => {
    const direct = g.raw * 0.08, overhead = (g.fob - g.raw - direct);
    return `<table style="width:100%">
      <tr><td class="sec" colspan="2">COST SHEET — ${esc(g.sup.name || k)}</td></tr>
      <tr><td class="k">Inv No / Date</td><td>${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Finished Product</td><td>PLASTIC (PP) &amp; (PA) MOULDED FITTINGS</td></tr>
      <tr><td class="k">HS Code</td><td>3917.4000</td></tr>
      <tr><td class="k">FOB / Ex-Work Price</td><td class="b">${num(g.fob)}</td></tr>
      <tr><td class="k">1. Imported raw material</td><td>NIL</td></tr>
      <tr><td class="k">2. Indigenous raw material</td><td>${num(g.raw)}</td></tr>
      <tr><td class="k">3. Direct cost of processing</td><td>${num(direct)}</td></tr>
      <tr><td class="k">4. Overhead + profit</td><td>${num(overhead)}</td></tr>
    </table>`;
  }).join("<br>");
  return { name: fname, html: `<div class="title">${esc(title)}</div>${blocks}` };
}
B["29"] = (ctx) => {
  const rows = L(ctx), ex = exRate(ctx), s = ctx.inv.ship || {};
  const taxable = sum(rows, "fobTotal") * ex, igst = taxable * 0.18;
  const html = `<div class="title">29 · E-WAY BILL (Export / Sales)</div>
    <table style="width:100%"><tr><td class="k">Transaction Type</td><td>Outward — Export</td><td class="k">Document</td><td>Tax Invoice ${esc(ctx.inv.invoiceNo)}</td><td class="k">Date</td><td>${ddmm(ctx.inv.date)}</td></tr></table>
    <table style="width:100%"><tr><td class="sec" colspan="2">Bill From / Despatch From</td><td class="sec" colspan="2">Bill To / Ship To</td></tr>
      <tr><td class="k">Name</td><td>${esc(ctx.EXPORTER.name)}</td><td class="k">Name</td><td>${esc(ctx.buyer.name)}</td></tr>
      <tr><td class="k">GSTIN</td><td>${esc(ctx.EXPORTER.gstin)}</td><td class="k">Country</td><td>${esc(ctx.buyer.country)}</td></tr>
      <tr><td class="k">Place</td><td>Mumbai</td><td class="k">POD</td><td>${esc(s.pod || ctx.buyer.shipTo)}</td></tr></table>
    <table><tr><th>Product</th><th>HSN</th><th>Qty Pcs</th><th>Taxable ₹</th><th>IGST %</th><th>IGST ₹</th><th>Total ₹</th></tr>
      <tr><td>PP / PA Moulded Fittings &amp; Pipes</td><td>3917</td><td class="r">${sum(rows, "pieces").toLocaleString("en-IN")}</td><td class="r">${num(taxable)}</td><td class="c">18%</td><td class="r">${num(igst)}</td><td class="r">${num(taxable + igst)}</td></tr></table>`;
  return { name: "Eway_Export_29", html };
};

/* ---------- Stage D · Post-shipment (30–34) ---------- */
B["30"] = (ctx) => {
  const s = ctx.inv.ship || {};
  const docs = ["Commercial Invoice", "Packing List", "Bill of Lading", "Certificate of Origin", "Packaging Declaration", "Insurance Certificate"];
  const html = `<div class="title">30 · LETTER TO BUYER</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">To</td><td>Messrs ${esc(ctx.buyer.name)} T/A ${esc(ctx.buyer.brand)}, ${esc(ctx.buyer.addr || "")}</td></tr>
      <tr><td class="k">Date</td><td>${ddmm(s.blDate || ctx.inv.date)}</td></tr>
      <tr><td class="k">Ref Shipment</td><td>${esc(s.pkgs || "—")} per ${esc(s.vessel || "—")}, sailed ${ddmm(s.blDate)}</td></tr>
      <tr><td class="k">Your PO Nos</td><td>${esc(poHeaderList(ctx))}</td></tr>
      <tr><td class="k">Invoice No.</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr>
    </table>
    <p>With reference to the above, please find enclosed the following scanned documents duly signed:</p>
    <table><tr><th>#</th><th>Document</th></tr>${docs.map((d, i) => `<tr><td class="c">${i + 1}</td><td>${d}</td></tr>`).join("")}</table>
    <p>Thanking you, For ${esc(ctx.EXPORTER.name)}.</p>`;
  return { name: "Letter_to_Buyer_30", html };
};
B["31"] = (ctx) => {
  const rows = L(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Pieces", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Boxes", r: 1, f: (r) => r.boxes },
    { h: "Rate $/pc", r: 1, f: (r) => usdp(r.fobPc) }, { h: "Amount $", r: 1, f: (r) => usd(r.fobTotal) },
  ];
  const foot = [{ v: `TOTAL FOB · ${sum(rows, "boxes")} boxes`, span: 4 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: sum(rows, "boxes"), r: 1 }, { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1 }];
  const html = `${masthead(ctx, "31 · COMMERCIAL INVOICE (Buyer · USD)", { po: 1 })}${tableOf(cols, rows, foot)}
    <p class="sub">Invoice of PP Extruded Pipes, PP &amp; Nylon Moulded Fittings and Corrugated Boxes. Terms ${esc(ctx.inv.ship?.terms || "FOB MUMBAI")}. Country of Origin: INDIA.</p>`;
  return { name: "Commercial_Invoice_31", html };
};
B["32"] = (ctx) => ({ name: "Packing_32", html: packingListDoc(ctx, "32 · PACKING (Post-shipment)", "32") });
B["33"] = (ctx) => ({ name: "Packaging_Declaration_Buyer_33", html: packagingDeclaration(ctx, "33 · PACKAGING DECLARATION (Buyer)", "33") });
B["34"] = (ctx) => {
  const rows = L(ctx), s = ctx.inv.ship || {};
  const net = sum(rows, "netTotal"), gross = sum(rows, "grossTotal"), tare = 2185;
  const html = `<div class="title">34 · CONTAINER WEIGHT DECLARATION (CWD)</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">Invoice No.</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Container No.</td><td>${esc(s.container || "—")}</td><td class="k">Seal No.</td><td>${esc(s.seal || "—")}</td></tr>
      <tr><td class="k">Vessel</td><td>${esc(s.vessel || "—")}</td><td class="k">BL No.</td><td>${esc(s.blNo || "—")}</td></tr>
      <tr><td class="k">No of Packages</td><td>${esc(s.pkgs || sum(rows, "boxes"))}</td><td class="k">Marks</td><td>${esc(s.marks || "—")}</td></tr>
    </table>
    <table><tr><th>Particulars</th><th>Weight (KGS)</th></tr>
      <tr><td>Nett Weight of Cargo</td><td class="r">${num(net)}</td></tr>
      <tr><td>Gross Weight of Cargo</td><td class="r">${num(gross)}</td></tr>
      <tr><td>Tare Weight of Container</td><td class="r">${num(tare)}</td></tr>
      <tr class="tot"><td>Verified Gross Mass (VGM)</td><td class="r">${num(gross + tare)}</td></tr></table>
    <p>We declare the above container weight is verified and correct. For ${esc(ctx.EXPORTER.name)}.</p>`;
  return { name: "CWD_34", html };
};

/* ---------- Stage E · Reports (35–39) & F · Banking (40) ---------- */
B["35"] = (ctx) => {
  const rows = L(ctx), ex = exRate(ctx);
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Qty Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") }, { h: "Box", r: 1, f: (r) => r.boxes },
    { h: "FOB $", r: 1, f: (r) => usd(r.fobTotal) }, { h: "Realised ₹", r: 1, f: (r) => num(r.fobTotal * ex) },
    { h: "Purchase ₹", r: 1, f: (r) => num(r.valTotal) }, { h: "Cartons ₹", r: 1, f: (r) => num(r.boxes * 16) },
    { h: "Overheads ₹", r: 1, f: (r) => num(r.fobTotal * ex * 0.11) }, { h: "Gross Profit ₹", r: 1, f: (r) => num(r.fobTotal * ex - r.valTotal - r.boxes * 16 - r.fobTotal * ex * 0.11) },
  ];
  const gp = rows.reduce((a, r) => a + (r.fobTotal * ex - r.valTotal - r.boxes * 16 - r.fobTotal * ex * 0.11), 0);
  const foot = [{ v: "TOTAL", span: 3 }, { v: usd(sum(rows, "fobTotal")), r: 1 }, { v: num(sum(rows, "fobTotal") * ex), r: 1 }, { v: num(sum(rows, "valTotal")), r: 1 }, { v: "", span: 2 }, { v: num(gp), r: 1 }];
  const html = `<div class="title">35 · COSTING</div><div class="sub">Invoice ${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)} · Rate @ Rs. ${ex}</div>${tableOf(cols, rows, foot)}`;
  return { name: "Costing_35", html };
};
// 36–39 balance reports need the ledger — pass it in ctx.report (from Reports state) when available
export function buildBalanceReport(no, ctx, data) {
  if (no === "36" || no === "38") return balanceSupplier(ctx, data, no);
  if (no === "37") return balanceItem(ctx, data);
  if (no === "39") return balanceBoxes(ctx, data);
}
function balanceItem(ctx, data) {
  const rows = data.itemRows || [];
  const cols = [
    { h: "Date", c: 1, f: (r) => dmy(r.date) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "PO(s)", f: (r) => r.pos.join(", ") }, { h: "Invoice(s)", f: (r) => [...(r.invoices || [])].join(", ") || "—" },
    { h: "Qty Pcs", r: 1, f: (r) => r.qty.toLocaleString("en-IN") }, { h: "Vol/Box", r: 1, f: (r) => num(r.it.volume, 3) },
    { h: "Total Boxes", r: 1, f: (r) => r.ordered }, { h: "Recd Boxes", r: 1, f: (r) => r.recd }, { h: "Pending Boxes", r: 1, f: (r) => r.pending },
    { h: "Total Vol m³", r: 1, f: (r) => num(r.volume, 2) },
  ];
  return { name: "Balance_Order_Itemwise_37", html: `<div class="title">37 · BALANCE ORDER ITEM WISE</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows)}` };
}
function balanceSupplier(ctx, data, no) {
  const rows = data.supRows || [];
  const cols = [
    { h: "Date", c: 1, f: (r) => dmy(r.date) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Supplier", f: (r) => esc(ctx.supCode ? ctx.supCode(r.supplierId) : r.supplierId) },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Invoice(s)", f: (r) => [...(r.invoices || [])].join(", ") || "—" },
    { h: "Recd Boxes", r: 1, f: (r) => r.recd }, { h: "Pending Boxes", r: 1, f: (r) => r.pending },
    { h: "Total Vol m³", r: 1, f: (r) => num(r.volume, 2) }, { h: "Invoice Value ₹", r: 1, f: (r) => num(r.value) },
  ];
  const title = no === "38" ? "38 · SUPPLY DETAILS (Item wise / Supplier wise)" : "36 · BALANCE ORDER SUPPLIER WISE";
  return { name: `Balance_Supplierwise_${no}`, html: `<div class="title">${title}</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows, [{ v: "TOTAL", span: 5 }, { v: sum(rows, "recd"), r: 1 }, { v: sum(rows, "pending"), r: 1 }, { v: num(sum(rows, "volume"), 2), r: 1 }, { v: num(sum(rows, "value")), r: 1 }])}` };
}
function balanceBoxes(ctx, data) {
  const rows = data.itemRows || [];
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Pending Boxes", r: 1, f: (r) => r.pending }, { h: "Vol/Box", r: 1, f: (r) => num(r.it.volume, 3) },
    { h: "Pending Vol m³", r: 1, f: (r) => num(r.pending * (r.it.volume || 0), 2) },
    { h: "Net/Box kg", r: 1, f: (r) => num(r.it.netPerBox) }, { h: "Pending Net kg", r: 1, f: (r) => num(r.pending * (r.it.netPerBox || 0)) },
  ];
  const pendVol = rows.reduce((a, r) => a + r.pending * (r.it.volume || 0), 0), pendNet = rows.reduce((a, r) => a + r.pending * (r.it.netPerBox || 0), 0);
  return { name: "Balance_Boxes_Volume_39", html: `<div class="title">39 · BALANCE ORDERS — BOXES &amp; VOLUME</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows, [{ v: "TOTAL", span: 2 }, { v: sum(rows, "pending"), r: 1 }, { v: "" }, { v: num(pendVol, 2), r: 1 }, { v: "" }, { v: num(pendNet), r: 1 }])}` };
}
// Fallback for 36–39 when the live balance register isn't supplied (context = this invoice only).
function balanceFallback(ctx, title, fname) {
  const rows = L(ctx);
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Supplier", f: (r) => esc(r.sup.code || "—") }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Invoice", f: () => esc(ctx.inv.invoiceNo) }, { h: "Recd Boxes", r: 1, f: (r) => r.boxes }, { h: "Qty Pcs", r: 1, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Total Vol m³", r: 1, f: (r) => num(r.volTotal, 2) }, { h: "Invoice Value $", r: 1, f: (r) => usd(r.fobTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 4 }, { v: sum(rows, "boxes"), r: 1 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1 }, { v: num(sum(rows, "volTotal"), 2), r: 1 }, { v: usd(sum(rows, "fobTotal")), r: 1 }];
  return { name: fname, html: `<div class="title">${esc(title)}</div><div class="sub">Invoice ${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)} · open the Reports tab for the full live balance register across all invoices.</div>${tableOf(cols, rows, foot)}` };
}
B["36"] = (ctx) => balanceFallback(ctx, "36 · BALANCE ORDER SUPPLIER WISE", "Balance_Supplierwise_36");
B["37"] = (ctx) => balanceFallback(ctx, "37 · BALANCE ORDER ITEM WISE", "Balance_Itemwise_37");
B["38"] = (ctx) => balanceFallback(ctx, "38 · SUPPLY DETAILS (Item / Supplier wise)", "Supply_Details_38");
B["39"] = (ctx) => balanceFallback(ctx, "39 · BALANCE ORDERS — BOXES & VOLUME", "Balance_Boxes_Volume_39");
B["40"] = (ctx) => {
  const rows = L(ctx), ex = exRate(ctx), s = ctx.inv.ship || {};
  const fob = sum(rows, "fobTotal");
  const html = `<div class="title">40 · EXPORT BILL REGULARISATION SUBMISSION</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">Invoice No. &amp; Date</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Buyer</td><td>${esc(ctx.buyer.name)} T/A ${esc(ctx.buyer.brand)} (${esc(ctx.buyer.country)})</td></tr>
      <tr><td class="k">BL No. &amp; Date</td><td>${esc(s.blNo || "—")} ${s.blDate ? "DT " + ddmm(s.blDate) : ""}</td></tr>
      <tr><td class="k">S/B No. &amp; Date</td><td>${esc(s.sbNo || "—")} ${s.sbDate ? "DT " + ddmm(s.sbDate) : ""}</td></tr>
      <tr><td class="k">Vessel</td><td>${esc(s.vessel || "—")}</td></tr>
      <tr><td class="k">Bank</td><td>${esc(s.bank || "HDFC BANK LTD, GHATKOPAR (E)")}</td></tr>
    </table>
    <table><tr><th>Particulars</th><th>Value</th></tr>
      <tr><td>FOB Value (Invoice Currency)</td><td class="r">${usd(fob)}</td></tr>
      <tr><td>Exchange Rate ₹/$</td><td class="r">${ex}</td></tr>
      <tr><td>FOB Value (INR equivalent)</td><td class="r">${num(fob * ex)}</td></tr>
      <tr class="tot"><td>Realisation to be regularised</td><td class="r">${usd(fob)}</td></tr></table>
    <p>Submitted for regularisation of the above export bill against the shipping documents. For ${esc(ctx.EXPORTER.name)}.</p>`;
  return { name: "Bill_Regularisation_40", html };
};

/* ---- catalogue + public API ---- */
export const DOC_META = {
  "1": "Buyers Order", "2A": "Master", "2": "Barcode", "3": "Packing", "4": "Purchase", "5": "Sales", "6": "Suppliers’ PO",
  "7A": "Master (7A)", "7": "Packing", "8": "Purchase", "9": "Sales", "10": "E-way (inward)", "11A": "Delivery order", "11": "Delivery instr.",
  "12": "Boxes & volume", "13": "Export value decl.", "14": "SCOMET", "15": "SDF", "16": "RoDTEP", "17": "Proforma", "18": "Custom invoice",
  "19": "Packing list", "20": "Packing itemwise", "21": "Packaging decl.", "22": "Letter to CHA", "23": "Supplier details", "24": "BL annexure",
  "25": "E-invoice", "26": "Shipping instr.", "27": "VGM", "28": "Cost sheets", "29": "E-way (export)", "30": "Letter to buyer",
  "31": "Commercial invoice", "32": "Packing", "33": "Packaging decl.", "34": "CWD", "35": "Costing", "36": "Balance, supplier",
  "37": "Balance, item", "38": "Supply details", "39": "Balance boxes/vol", "40": "Bill regularisation",
};

// Build & download any document. `report` (optional) carries the live balance register for 36–39.
export function buildDocument(no, ctx, report) {
  let out;
  if (["36", "37", "38", "39"].includes(no) && report) out = buildBalanceReport(no, ctx, report);
  else if (B[no]) out = B[no](ctx);
  if (!out) { alert("Document " + no + " generator not available."); return; }
  writeXLS(fnameFor(no, out.name, ctx), out.html);
}
export function hasBuilder(no) { return !!B[no] || ["36", "37", "38", "39"].includes(no); }

// Download the inward e-way bill for a single supplier (the split-by-supplier flow).
export function downloadEwaySupplier(ctx, supplierId) {
  const d = ewaySupplierDocs(ctx).find((x) => x.supplierId === supplierId);
  if (!d) return;
  writeXLS(`Eway_10_${d.code}_${ctx.inv.invoiceNo.replace(/\//g, "-")}.xls`, d.html);
}

// Return the document's inner HTML (for an on-screen live preview) without downloading.
export function renderDocument(no, ctx, report) {
  let out;
  try {
    if (["36", "37", "38", "39"].includes(no) && report) out = buildBalanceReport(no, ctx, report);
    else if (B[no]) out = B[no](ctx);
  } catch (e) { return `<div class="sub">Preview unavailable: ${esc(e.message)}</div>`; }
  return out ? out.html : "";
}
// CSS for the on-screen preview — mirrors the workbook styling, scoped to .docprev so it
// never leaks onto the rest of the app's tables.
export const PREVIEW_CSS = `
  .docprev{font-family:Calibri,Arial,sans-serif;font-size:13px;color:#243b53;}
  .docprev table{border-collapse:collapse;margin-bottom:10px;width:auto;}
  .docprev td,.docprev th{border:1px solid #cdd8e3;padding:4px 8px;vertical-align:top;}
  .docprev th{background:var(--c-brand,#0b2c4d);color:#fff;font-weight:700;text-align:center;}
  .docprev .title{font-size:17px;font-weight:800;color:var(--c-navy,#0b2c4d);display:block;margin-bottom:4px;}
  .docprev .sub{font-size:11.5px;color:#627587;display:block;margin-bottom:8px;}
  .docprev .r{text-align:right;} .docprev .c{text-align:center;} .docprev .b{font-weight:700;}
  .docprev .lg{font-size:14px;font-weight:800;color:var(--c-navy,#0b2c4d);}
  .docprev .sec{background:#e9eff5;font-weight:700;color:var(--c-navy,#0b2c4d);}
  .docprev .tot{background:#fbe6c2;font-weight:800;color:#0b2c4d;}
  .docprev .k{background:#f2f5f8;font-weight:700;white-space:nowrap;color:var(--c-navy,#0b2c4d);}
  .docprev .amber{color:#B7791F;font-weight:700;}
  .docprev .plain td{border:none;padding:1px 8px;}
  .docprev p{font-size:12px;line-height:1.5;margin:6px 0;}
`;
