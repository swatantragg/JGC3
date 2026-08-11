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

   The layouts are the reference build's, unchanged. What did change is where
   the numbers come from: barcode stickers and label sheets now follow each
   item's own rule out of Masters.xlsx (see backend/app/calc.py) rather than
   one blanket formula, because the supplier ranges do not agree on it.
   `docCtx()` in lib/docCtx.js adapts the API's records into this shape.
   ============================================================================ */

import { downloadDocsExcel, downloadPDF } from "./download.js";
import { primeLogo, logoImage, LOGO_SRC } from "./logo.js";
import { colLetter } from "./xlsx.js";

// The supplier order prints on the letterhead, so the mark is fetched up front.
primeLogo();

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

/* Barcode stickers per box — the item's own rule, mirroring calc.stickers_per_box:
   a typed-in total wins, otherwise (bag + piece) x multiplier, rounded on the
   GRN range. Labels then carry the item's allowance (1.05 on Oswin). */
function stickersPerBox(it) {
  const fixed = Number(it.stickersFixed) || 0;
  if (fixed) return fixed;
  const base = (Number(it.bgPerBox) || 0) + (Number(it.pPerBox) || 0);
  const total = base * (it.stickerMult == null ? 1.1 : Number(it.stickerMult));
  return it.stickerRound ? Math.floor(total + 0.5) : total;
}
function labelsFor(it, boxes) {
  return boxes * stickersPerBox(it) * (Number(it.labelSpoilage) || 1);
}
function sheetsFor(it, boxes) {
  const up = Number(it.typeUp) || 0;
  const labels = labelsFor(it, boxes);
  return up && labels ? Math.ceil(labels / up) : 0;
}
/* FOB per piece — Oswin quotes per piece, the PP/GRN ranges per 100. */
function fobPerPiece(it) {
  const unit = Number(it.unitFob100) || 0;
  return (it.fobMode || "100") === "100" ? unit / 100 : unit;
}

/* ---- output ----------------------------------------------------------------
   Downloads go through lib/download.js: Excel is a real .xlsx with the
   arithmetic still live (lib/xlsx.js), PDF is the same HTML through the
   browser's print engine. The builders below annotate the cells that carry a
   calculation — see `tableOf` — and lib/sheet.js reads those annotations back
   out when it converts a document into a worksheet.                        */

/* ---- shared derived data ---- */
function exRate(ctx) { return Number(ctx.inv.ship?.exRate) || 92.5; }
function marksStart(ctx) { const m = (ctx.inv.ship?.marks || "").match(/(\d{3,})/); return m ? Number(m[1]) : 2001; }
function supFor(ctx, id) { return ctx.SUPPLIERS.find((s) => s.id === id) || {}; }

/* The order reference a buyer-stage document prints. A PO-stage context
   (Documents → PO Reports) is built around one purchase order, so that number
   is the reference; the invoice-stage contexts fall back to the buyer's own
   standing order number, as before. */
function orderRefOf(ctx) { return ctx.po || ctx.buyer.orderNo || "—"; }

// Shipment lines (from the selected invoice) with every derived figure a document may need
function L(ctx) {
  const ex = exRate(ctx);
  let sr = Number(ctx.inv.serialStart) || marksStart(ctx);
  return ctx.inv.lines.map((l) => {
    const master = ctx.items.find((x) => x.id === l.itemId) || l.item || {};
    /* Priced as invoiced, not as the master reads today. Everything else —
       packing, volume, weights, stickers — is a physical fact of the item and
       still comes from the master. */
    const it = l.unitValue == null && l.unitFob100 == null ? master : {
      ...master,
      unitValue: l.unitValue == null ? master.unitValue : Number(l.unitValue),
      valueMode: l.valueMode || master.valueMode,
      unitFob100: l.unitFob100 == null ? master.unitFob100 : Number(l.unitFob100),
      fobMode: l.fobMode || master.fobMode,
    };
    const boxes = Number(l.boxes) || 0, packing = Number(it.packing) || 0;
    const pieces = boxes * packing;
    const volTotal = boxes * (Number(it.volume) || 0);
    const netTotal = boxes * (Number(it.netPerBox) || 0);
    const grossTotal = boxes * (Number(it.grossPerBox) || 0);
    const fobPc = fobPerPiece(it), fobTotal = pieces * fobPc;
    const valUnit = Number(it.unitValue) || 0, valTotal = pieces * valUnit;
    const rbiTotal = fobTotal * ex, rateKg = netTotal ? fobTotal / netTotal : 0;
    const bg = Number(it.bgPerBox) || 0, pc = Number(it.pPerBox) || 0, ttl = stickersPerBox(it);
    const stickers = Math.ceil(labelsFor(it, boxes)), sheets = sheetsFor(it, boxes);
    const from = sr, to = sr + boxes - 1; sr += boxes;
    const range = boxes ? `${from}-${to}` : "—";
    const pos = [...new Set(ctx.buyerMaster.filter((r) => r.itemId === it.id).map((r) => r.po))].sort();
    // Stickers a single box consumes, allowance included — inlined into the
    // Excel formulas so the sticker and sheet counts follow the box count.
    const stkPerBox = ttl * (Number(it.labelSpoilage) || 1);
    const typeUp = Number(it.typeUp) || 0;
    return { it, sup: supFor(ctx, l.supplierId), supId: l.supplierId, boxes, packing, pieces, volTotal, netTotal, grossTotal, fobPc, fobTotal, valUnit, valTotal, rbiTotal, rateKg, bg, pc, ttl, stkPerBox, typeUp, stickers, sheets, range, pos };
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
    const fobPc = fobPerPiece(it), fobTotal = qty * fobPc;
    const valUnit = Number(it.unitValue) || 0, valTotal = qty * valUnit;
    const rbiTotal = fobTotal * ex;
    const bg = Number(it.bgPerBox) || 0, pc = Number(it.pPerBox) || 0, ttl = stickersPerBox(it);
    const stickers = Math.ceil(labelsFor(it, boxes)), sheets = sheetsFor(it, boxes);
    const typeUp = Number(it.typeUp) || 0;
    const stkPerBox = ttl * (Number(it.labelSpoilage) || 1);
    return { it, pos: [...x.pos].sort(), qty, packing, boxes, volTotal, netTotal, grossTotal, fobPc, fobTotal, valUnit, valTotal, rbiTotal, bg, pc, ttl, stkPerBox, stickers, sheets, typeUp };
  }).sort((a, b) => String(a.it.gd || "").localeCompare(String(b.it.gd || "")));
}

/* The order book seen the way the supplier PO needs it — one row per item,
   tagged with the factory that makes it. Ordered pieces, not packed boxes:
   the supplier's order exists the moment the buyer's does, long before
   anything has been invoiced. */
function orderRows(ctx) {
  return orderAgg(ctx).map((r) => ({
    ...r, pieces: r.qty, supId: r.it.supplierId, sup: supFor(ctx, r.it.supplierId),
  }));
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
/* Generic data table.

   cols = [{ h, r?, c?, f(row) -> cell html,
             key?, t?, v?(row) -> number, fml? }]

   The last four are what make the Excel download live rather than a picture
   of one. `key` names the column; `t` is the number format; `v` gives the
   exact value (no ₹, no thousands separator, no rounding); `fml` is a formula
   written in terms of other columns' names — "{qty}*{rate}" — which
   lib/sheet.js resolves to real cell references at conversion time. Anything
   a row genuinely holds as a constant is inlined into the formula, so the
   figures that depend on it still move when a quantity is edited.

   foot = [{ v, r?, span?, sum?, t? }] — `sum` names the column to total.  */
const attr = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function cellData(c, row) {
  const bits = [];
  if (c.t) bits.push(`data-t="${attr(c.t)}"`);
  if (c.fml) {
    const f = typeof c.fml === "function" ? c.fml(row) : c.fml;
    if (f) bits.push(`data-f="${attr(f)}"`);
  } else if (c.v) {
    const n = Number(c.v(row));
    if (Number.isFinite(n)) bits.push(`data-v="${n}"`);
  }
  return bits.length ? " " + bits.join(" ") : "";
}

function tableOf(cols, rows, foot, sectionRows) {
  const head = `<tr>${cols.map((c) => `<th${c.key ? ` data-k="${attr(c.key)}"` : ""}>${c.h}</th>`).join("")}</tr>`;
  const dataRow = (row) => `<tr>${cols.map((c) => `<td class="${c.r ? "r" : c.c ? "c" : ""}"${cellData(c, row)}>${c.f(row)}</td>`).join("")}</tr>`;
  const body = rows.map((row, i) => (sectionRows && sectionRows[i]
    ? `<tr><td class="sec" colspan="${cols.length}">${esc(sectionRows[i])}</td></tr>${dataRow(row)}`
    : dataRow(row))).join("");
  const f = foot
    ? `<tr class="tot">${foot.map((cell) => {
      const bits = [];
      if (cell.t) bits.push(`data-t="${attr(cell.t)}"`);
      if (cell.sum) bits.push(`data-sum="${attr(cell.sum)}"`);
      return `<td class="${cell.r ? "r" : ""}"${cell.span ? ` colspan="${cell.span}"` : ""}${bits.length ? " " + bits.join(" ") : ""}>${cell.v}</td>`;
    }).join("")}</tr>`
    : "";
  return `<table>${head}${body}${f}</table>`;
}

/* RoundUp that survives a zero divisor — Excel would show #DIV/0! and the
   client's sheets never do. */
const upDiv = (a, b) => `IF(${b}=0,0,ROUNDUP(${a}/${b},0))`;
/* Base filename, no extension — the download helper adds the right one.
   A PO-stage document is stamped with its purchase order, an invoice-stage
   one with its invoice. */
function fnameFor(no, name, ctx) {
  const stamp = String(ctx.po || ctx.inv.invoiceNo || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `Doc_${no}_${String(name).replace(/[^A-Za-z0-9]+/g, "_")}${stamp ? `_${stamp}` : ""}`;
}
const sum = (a, k) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);
/* Who signs the export papers, and where they are signed. */
const SIGNATORY = "Mr Aalok M Shah";
const declBlock = (ctx) => { const E = ctx.EXPORTER; return `<table style="width:100%"><tr><td class="k" style="width:20%">Place</td><td>Mumbai</td><td class="k" style="width:20%">Date</td><td>${ddmm(ctx.inv.date)}</td></tr>
  <tr><td class="k">Signature</td><td colspan="3">For ${esc(E.name)} &nbsp;— &nbsp;${SIGNATORY}, Proprietor</td></tr></table>`; };

/* ============================================================================
   BUILDERS — one per document number
   ============================================================================ */
const B = {};

/* ---------- Stage A · Buyer order ---------- */
B["1"] = (ctx) => {
  const rows = orderAgg(ctx);
  const cols = [
    { h: "#", c: 1, f: (r) => rows.indexOf(r) + 1 },
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Size", c: 1, f: (r) => esc(r.it.size) },
    { h: "Qty (Pcs)", r: 1, key: "qty", t: "int", v: (r) => r.qty, f: (r) => r.qty.toLocaleString("en-IN") },
    { h: "Rate $/pc", r: 1, key: "rate", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "Amount $", r: 1, key: "amount", t: "usd", fml: "{qty}*{rate}", f: (r) => usd(r.fobTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 5 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1, sum: "amount", t: "usd" }];
  const html = `<div class="title">BUYER PURCHASE ORDER</div>
    <table style="width:100%"><tr><td style="width:55%">${exporterBlock(ctx)}</td>
      <td><table style="width:100%"><tr><td class="k">PO No.</td><td class="b">${esc(orderRefOf(ctx))}</td></tr>
      <tr><td class="k">Date</td><td class="b">${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Buyer</td><td class="b">${esc(ctx.buyer.name)} T/A ${esc(ctx.buyer.brand)}</td></tr>
      <tr><td class="k">Our Reference</td><td class="b">${esc(ctx.buyer.ourReference || "")}</td></tr>
      <tr><td class="k">Ship To</td><td>${esc(ctx.buyer.addr || ctx.buyer.shipTo)}</td></tr></table></td></tr></table>
    ${tableOf(cols, rows, foot)}`;
  return { name: "Buyers_Order", html };
};

B["2A"] = (ctx) => {
  const rows = orderAgg(ctx);
  const ex = exRate(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size (MM)", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) },
    { h: "Pack/Unit", c: 1, key: "pack", t: "int", v: (r) => r.packing, f: (r) => r.packing },
    { h: "Pack/Box", c: 1, f: (r) => (r.boxes ? Math.round(r.qty / r.boxes) : "") },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Code", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", v: (r) => r.qty, f: (r) => r.qty.toLocaleString("en-IN") },
    { h: "Box", r: 1, key: "box", t: "int", fml: () => upDiv("{qty}", "{pack}"), f: (r) => r.boxes },
    { h: "Vol/Box", r: 1, key: "volbox", t: "num3", v: (r) => r.it.volume, f: (r) => num(r.it.volume, 3) },
    { h: "Total Vol", r: 1, key: "voltot", t: "num", fml: "{box}*{volbox}", f: (r) => num(r.volTotal, 2) },
    { h: "Net/Box", r: 1, key: "netbox", t: "num", v: (r) => r.it.netPerBox, f: (r) => num(r.it.netPerBox) },
    { h: "Gross/Box", r: 1, key: "grossbox", t: "num", v: (r) => r.it.grossPerBox, f: (r) => num(r.it.grossPerBox) },
    { h: "Total Net kg", r: 1, key: "nettot", t: "num", fml: "{box}*{netbox}", f: (r) => num(r.netTotal) },
    { h: "Total Gross kg", r: 1, key: "grosstot", t: "num", fml: "{box}*{grossbox}", f: (r) => num(r.grossTotal) },
    { h: "Stickers", r: 1, key: "stk", t: "int", fml: (r) => `ROUNDUP({box}*${r.stkPerBox},0)`, f: (r) => r.stickers },
    { h: "Type UPS", r: 1, key: "typeup", t: "int", v: (r) => r.typeUp, f: (r) => r.typeUp },
    { h: "Sheets", r: 1, key: "sheets", t: "int", fml: () => upDiv("{stk}", "{typeup}"), f: (r) => r.sheets },
    { h: "Value Unit ₹", r: 1, key: "valunit", t: "inr", v: (r) => r.valUnit, f: (r) => num(r.valUnit) },
    { h: "Value Total ₹", r: 1, key: "valtot", t: "inr", fml: "{qty}*{valunit}", f: (r) => num(r.valTotal) },
    { h: "FOB/pc $", r: 1, key: "fobpc", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "FOB Total $", r: 1, key: "fobtot", t: "usd", fml: "{qty}*{fobpc}", f: (r) => usd(r.fobTotal) },
    { h: "RBI Ref ₹", r: 1, key: "rbi", t: "inr", fml: `{fobtot}*${ex}`, f: (r) => num(r.rbiTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 10 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" },
    { v: "", span: 1 }, { v: num(sum(rows, "volTotal"), 2), r: 1, sum: "voltot", t: "num" },
    { v: "", span: 2 }, { v: num(sum(rows, "netTotal")), r: 1, sum: "nettot", t: "num" },
    { v: num(sum(rows, "grossTotal")), r: 1, sum: "grosstot", t: "num" },
    { v: sum(rows, "stickers"), r: 1, sum: "stk", t: "int" }, { v: "" }, { v: sum(rows, "sheets"), r: 1, sum: "sheets", t: "int" },
    { v: "" }, { v: num(sum(rows, "valTotal")), r: 1, sum: "valtot", t: "inr" },
    { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1, sum: "fobtot", t: "usd" },
    { v: num(sum(rows, "rbiTotal")), r: 1, sum: "rbi", t: "inr" }];
  const html = `<div class="title">2A · MASTER (Buyer Order)</div><div class="sub">PO NO : ${esc(poHeaderList(ctx))} &nbsp;— &nbsp;Rate @ Rs. ${ex}/US$</div>${tableOf(cols, rows, foot)}`;
  return { name: "Master_2A", html };
};

/* ---------- The client's own workbooks, rebuilt cell for cell ---------------
   Docs 2 and 3 are the sheets the client reads as files rather than as
   reports — 2 goes to the label printer, 3 to the packer — so both are
   reproduced against the workbooks in Docs/Jaikvin Process/Numbering:
   2-Barcode.xlsx and 3-Packing.xlsx. Same columns, same two-line header, the
   PO banner merged across the top, Arial 10 on a black hairline grid, codes in
   their green, and the derived columns still worked out by formula. They write
   the worksheet directly instead of going through htmlToSheet — the layout is
   theirs, not the app's — and the preview and PDF use the same grid.

   The description prints as they print it, with the size dropped to a second
   line where the master already ends on it.                                */
function bcDescription(it) {
  const d = String(it.description || "").trim();
  const size = String(it.size || "").trim();
  const length = String(it.length || "").trim();
  if (!size) return d;
  /* Their second line is the size as the master spells it — "15MM" on a plain
     item, "80 x 15MM" where there is a length — so the longest of those the
     description actually ends on is where it breaks. */
  const endings = [size, `${size}MM`, `${size} MM`];
  if (length) endings.push(`${length} x ${size}MM`, `${length} x ${size} MM`);
  const low = d.toLowerCase();
  const at = endings
    .map((e) => (low.endsWith(e.toLowerCase()) ? d.length - e.length : -1))
    .reduce((best, i) => (i > 0 && (best < 0 || i < best) ? i : best), -1);
  return at > 0 ? `${d.slice(0, at).trim()}\n${d.slice(at)}` : d;
}

/* Their packing sheet writes the HSN the customs way — 39174000 as 3917.4000
   — so an 8-digit code is printed on that scale. Anything else stays as typed. */
function hsnValue(it) {
  const raw = String(it.hsn || "").trim();
  return /^\d{8}$/.test(raw) ? Number(raw) / 10000 : null;
}
const hsnText = (it) => { const n = hsnValue(it); return n == null ? String(it.hsn || "") : n.toFixed(4); };

/* Their purchase sheet writes money as "₹ 1,234.00" — the rupee sign, a space,
   then the figure — and heads the price columns with the date the price list
   was agreed on, in red. */
const RUPEE = '"₹"\\ #,##0.00';
const RS = '"Rs."\\ #,##0.00';
const USD = '"$"#,##0.00';
const ddmmyy = (s) => { if (!s) return ""; const d = new Date(s); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`; };
/* On screen a figure has to read exactly as the cell it copies: "0.000" carries
   no separators at all, and their rupee format groups in thousands, not lakhs. */
const wbFixed = (n, d) => Number(n || 0).toFixed(d);
const wbRupee = (n) => `₹ ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Their column widths and row heights are the design, and they fit their own
   data — a five-digit order number, a two-line description. Ours is not always
   that short: a line can carry half a dozen purchase orders, and a description
   can run past the column. So the sheet is measured after it is built. A column
   may widen to what is actually in it (never past a point where the layout
   stops looking like theirs), and a row grows to as many lines as its wrapped
   cells need. Nothing is ever cut off, and a sheet whose data is as short as
   theirs comes out at exactly their sizes. */
const LINE_PT = 12.75;
function fitSheet(sheet, opts = {}) {
  const { widen = true, maxGrow = 2, maxWidth = 46 } = opts;
  const widths = (sheet.widths || []).slice();
  const heights = (sheet.heights || []).slice();
  const rows = sheet.rows || [];

  /* A run of merged cells is one cell on the page: its text says nothing about
     how wide any single column should be, and it has all of their widths to
     wrap into. */
  const covered = new Set();
  const spanOf = new Map();
  (sheet.merges || []).forEach((ref) => {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(ref));
    if (!m) return;
    const col = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const [c1, r1, c2, r2] = [col(m[1]), +m[2], col(m[3]), +m[4]];
    spanOf.set(`${r1}:${c1}`, [c1, c2]);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) covered.add(`${r}:${c}`);
  });
  const roomAt = (r, i) => {
    const span = spanOf.get(`${r}:${i + 1}`);
    if (!span) return widths[i] ?? 9.14;
    let w = 0;
    for (let c = span[0]; c <= span[1]; c++) w += widths[c - 1] ?? 9.14;
    return w;
  };

  if (widen) {
    rows.forEach((row, ri) => (row || []).forEach((cell, i) => {
      if (!cell || cell.f || widths[i] == null || covered.has(`${ri + 1}:${i + 1}`)) return;
      const text = String(cell.v ?? "");
      if (!text) return;
      /* Text left in a cell whose neighbour is empty simply runs on across it —
         that is how a section label sits over the columns beside it, and it
         needs no more room. A figure has nowhere to run to, so it always does. */
      const s = cell.s || {};
      const flows = !s.align || s.align === "left";
      const next = (row || [])[i + 1];
      const nextHasText = next && String(next.v ?? "") !== "";
      if (cell.t !== "n" && !s.fmt && flows && !nextHasText) return;
      const wrap = !!s.wrap;
      const longest = text.split("\n").reduce((m, s2) => Math.max(m, s2.length), 0);
      // A column's width is in characters, plus what Excel keeps for padding.
      const want = longest + 0.7;
      // A wrapped column grows only so far; past that the row takes the lines.
      const grown = Math.min(want, wrap ? 24 : maxWidth, widths[i] * maxGrow);
      if (grown > widths[i] + 0.1) widths[i] = grown;
    }));
  }

  rows.forEach((row, ri) => {
    let lines = 1;
    (row || []).forEach((cell, i) => {
      if (!cell || !cell.s || !cell.s.wrap) return;
      const text = String(cell.v ?? "");
      if (!text || (covered.has(`${ri + 1}:${i + 1}`) && !spanOf.has(`${ri + 1}:${i + 1}`))) return;
      const per = Math.max(4, Math.floor(roomAt(ri + 1, i) - 1));
      lines = Math.max(lines, text.split("\n")
        .reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / per)), 0));
    });
    const need = lines * LINE_PT;
    if (lines > 1 && need > (heights[ri] || 0)) heights[ri] = need;
  });

  return { ...sheet, widths, heights };
}

/* ---- printed forms ---------------------------------------------------------
   The e-way bill and the despatch instruction are not tables. They are runs of
   merged cells laid across one fixed grid — a label two columns wide, the box
   beside it five — and that is what makes the boxes on the sheet line up the
   way they line up on the form.

   A row is written as [span, cell] pairs whose spans add up to the grid, and
   the builder does the two things that are easy to get wrong by hand: it
   merges the run, and it gives the cells the run covers only the edges the run
   itself owns. Leave them their own left and right and Excel rules a line down
   every column the run crosses — the box comes out striped.               */
const trimEdges = (edges, first, last) =>
  [...edges].filter((c) => (c !== "l" || first) && (c !== "r" || last)).join("");

function formGrid(width) {
  const rows = [];
  const merges = [];
  const heights = [];

  const edgesOf = (s, first, last) => {
    const b = s ? s.border : undefined;
    // A border ruling its edges in different weights trims the same way: the
    // run's left edge stays on the first cell, its right edge on the last.
    if (b && typeof b === "object") {
      return { ...s, border: { ...b, l: first ? b.l : "", r: last ? b.r : "" } };
    }
    if (typeof b !== "string") return s;                 // false / undefined pass through
    const [raw, rgb] = b.split("#");
    const kept = trimEdges(raw === "box" ? "lrtb" : raw, first, last);
    return { ...s, border: kept ? (rgb ? `${kept}#${rgb}` : kept) : false };
  };

  /* `cells` is [[span, cell], …]; a cell is the workbook writer's own
     { v | f, t?, s? }. A trailing gap in the grid is left blank. A third
     element carries the run down that many further rows, for the few boxes on
     a form that are taller than the line they start on — the exporter's name
     on the customs invoice, set at 18pt across two of them. Those rows below
     must then leave the columns it covers alone. */
  const row = (cells = [], height) => {
    const out = [];
    (cells || []).forEach(([span, cell, down = 0]) => {
      const room = width - out.length;
      if (room < 1) return;                              // the grid is full
      const n = Math.max(1, Math.min(span, room));
      const at = out.length + 1;
      for (let k = 0; k < n; k++) {
        const s = edgesOf(cell.s, k === 0, k === n - 1);
        out.push(k === 0 ? { ...cell, s } : { v: "", s });
      }
      const r0 = rows.length + 1;
      if (n > 1 || down) merges.push(`${colLetter(at)}${r0}:${colLetter(at + n - 1)}${r0 + down}`);
    });
    rows.push(out);
    if (height) heights[rows.length - 1] = height;
    return rows.length;
  };
  /* A gap carries one blank styled cell: a row with nothing in it at all is
     left out of the file, and its height would go with it. */
  const gap = (height) => row([[1, { v: "", s: { border: false } }]], height);

  return { rows, merges, heights, row, gap, at: () => rows.length };
}

const WB = {
  poL: { font: "refb", border: "ltb", valign: "center" },
  poM: { font: "refb", border: "tb", valign: "center" },
  poR: { font: "refb", border: "rtb", valign: "center" },
  poB: { font: "refb", border: "b", valign: "center" },
  poBox: { font: "refb", border: "box", valign: "center" },
  head: { font: "refb", border: "box", align: "center", valign: "center" },
  headRed: { font: "refr", border: "box", align: "center", valign: "center" },
  money: { font: "ref", border: "box", valign: "center", fmt: RUPEE },
  totMoney: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
  usd: { font: "ref", border: "box", valign: "center", fmt: USD },
  totUsd: { font: "refb", border: "box", valign: "center", fmt: USD },
  rs: { font: "ref", border: "box", valign: "center", fmt: RS },
  totRs: { font: "refb", border: false, valign: "center", fmt: RS },
  rate: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
  plain: { font: "ref", border: "box", valign: "center" },
  headW: { font: "refb", border: "box", align: "center", valign: "center", wrap: true },
  headL: { font: "refb", border: "ltb", align: "center", valign: "center" },
  headR: { font: "refb", border: "rtb", align: "center", valign: "center" },
  gd: { font: "refg", border: "box", align: "left", valign: "center" },
  gdC: { font: "refg", border: "box", align: "center", valign: "center" },
  desc: { font: "ref", border: "box", valign: "center", wrap: true },
  code: { font: "refb", border: "box", align: "center", valign: "center", quote: true },
  hsn: { font: "ref", border: "box", align: "center", valign: "center", fmt: "0.0000", quote: true },
  textL: { font: "ref", border: "box", align: "left", valign: "center" },
  barNum: { font: "ref", border: "box", align: "center", valign: "center", fmt: "0" },
  numC: { font: "ref", border: "box", align: "center", valign: "center" },
  num: { font: "ref", border: "box", valign: "center" },
  num2: { font: "ref", border: "box", valign: "center", fmt: "0.00" },
  num3: { font: "ref", border: "box", valign: "center", fmt: "0.000" },
  endGd: { font: "refg", border: "tb", align: "left", valign: "center" },
  endB: { font: "refb", border: "tb", align: "left", valign: "center" },
  end: { font: "ref", border: "tb", align: "left", valign: "center" },
  endDesc: { font: "ref", border: "tb", valign: "center", wrap: true },
  tot: { font: "refb", border: "box", valign: "center" },
  totC: { font: "refb", border: "box", align: "center", valign: "center" },
  tot2: { font: "refb", border: "box", valign: "center", fmt: "0.00" },
  tot3: { font: "refb", border: "box", valign: "center", fmt: "0.000" },
};

function barcodeSheet(ctx, rows) {
  const out = [
    [{ v: `PO NO : ${poHeaderList(ctx)}`, s: WB.poL }, { v: "", s: WB.poM }, { v: "", s: WB.poM },
      { v: "", s: WB.poM }, { v: "", s: WB.poM }, { v: "", s: WB.poR }],
    ["GD CODE ", "DESCRIPTION", "Bar Codes", "Lables", "TYPE", "SHEETS"].map((h) => ({ v: h, s: WB.head })),
    ["", "", "", "", "UPS", "REQD"].map((h) => ({ v: h, s: WB.head })),
  ];
  const heights = [undefined, 19.5, 19.5];

  const first = out.length + 1;
  rows.forEach((r) => {
    const line = out.length + 1;
    out.push([
      { v: r.it.gd || "", s: WB.gd },
      { v: bcDescription(r.it), s: WB.desc },
      { v: String(r.it.barcode || ""), t: "s", s: WB.code },
      { v: r.stickers, t: "n", s: WB.numC },
      { v: r.typeUp, t: "n", s: WB.numC },
      { f: upDiv(`D${line}`, `E${line}`), s: WB.num },
    ]);
    heights.push(25.5);
  });
  const last = out.length;

  /* The client totals the labels with SUBTOTAL so a filtered sheet re-totals
     itself, and the sheets column with a plain SUM. Both kept as they are. */
  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endDesc }, { v: "TOTAL", s: WB.tot },
    { f: `SUBTOTAL(9,D${first}:D${last})`, s: WB.totC },
    { v: "", s: WB.tot }, { f: `SUM(F${first}:F${last})`, s: WB.tot },
  ] : []);

  return fitSheet({
    name: "Barcode",
    rows: out,
    heights,
    merges: ["A1:F1"],
    widths: [11.28515625, 32.7109375, 14.140625, 7, 7, 8.28515625],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    tabColor: "FF00B0F0",
    page: {
      paper: 9, orientation: "portrait", scale: 19, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  });
}

/* The same grid on screen and in the PDF: the banner row, the two-line header,
   green GD codes on a black hairline grid — the client's sheet, not the app's
   house style, which is why this one document builds its own table rather than
   going through `tableOf`. The data annotations are still on the cells, so the
   HTML converts to a worksheet correctly if it is ever asked to. */
B["2"] = (ctx) => {
  const rows = orderAgg(ctx);
  const sheetFml = attr(upDiv("{stk}", "{typeup}"));
  const body = rows.map((r) => `<tr>
      <td class="gd">${esc(r.it.gd)}</td>
      <td class="desc">${esc(bcDescription(r.it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(r.it.barcode)}</td>
      <td class="c" data-t="int" data-v="${r.stickers}">${r.stickers}</td>
      <td class="c" data-t="int" data-v="${r.typeUp}">${r.typeUp}</td>
      <td class="r" data-t="int" data-f="${sheetFml}">${r.sheets}</td>
    </tr>`).join("");

  const html = `<div class="title">2 · BARCODE</div>
    <table class="wb fit">
      <colgroup><col style="width:14%"><col style="width:40.7%"><col style="width:17.6%">
        <col style="width:8.7%"><col style="width:8.7%"><col style="width:10.3%"></colgroup>
      <tr class="sec po"><td colspan="6">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr><th>GD CODE</th><th>DESCRIPTION</th><th>Bar Codes</th>
        <th data-k="stk">Lables</th><th data-k="typeup">TYPE</th><th data-k="sheets">SHEETS</th></tr>
      <tr class="hd2"><th></th><th></th><th></th><th></th><th>UPS</th><th>REQD</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td>TOTAL</td>
        <td class="c" data-t="int" data-sum="stk">${sum(rows, "stickers")}</td>
        <td></td>
        <td class="r" data-t="int" data-sum="sheets">${sum(rows, "sheets")}</td></tr>
    </table>`;
  return { name: "Barcode_2", html, sheet: barcodeSheet(ctx, rows), page: "portrait" };
};

/* Doc 3 · Packing — the same treatment against 3-Packing.xlsx: fifteen
   columns under a two-line header with PACKING split into UNIT / BOX and
   Quantity into Pcs / Box, the weights carried to three decimals, and the row
   totals taken with SUBTOTAL so a filtered sheet re-totals itself.

   Boxes are rounded up rather than divided straight, as their sheet does — a
   part box is still a box — and the volume and weights follow the box count so
   editing a quantity re-totals the sheet. */
function packingSheet(ctx, rows) {
  const banner = [{ v: `PO NO : ${poHeaderList(ctx)}`, s: WB.poL }];
  for (let i = 1; i < 14; i++) banner.push({ v: "", s: WB.poM });
  banner.push({ v: "", s: WB.poR });

  const H = (v) => ({ v, s: WB.head });
  const out = [
    banner,
    [H("CODE"), H("GD CODE "), H("GL CODE"), H("SIZE"), H("LENGTH"),
      { v: "PACKING", s: WB.headL }, { v: "", s: WB.headR }, H("DESCRIPTION"), H("Bar Codes"), H("HSN CODES"),
      { v: "Quantity", s: WB.headL }, { v: "", s: WB.headR }, H("Volumn"),
      { v: "Total Nett\nKGS", s: WB.headW }, { v: "Total Gross\nKgs", s: WB.headW }],
    [H(""), H(""), H(""), H("MM"), H("MM"), H("UNIT "), H("BOX"), H(""), H(""), H(""),
      H("Pcs"), H("Box"), H(""), { v: "", s: WB.headW }, { v: "", s: WB.headW }],
  ];
  const heights = [undefined, 19.5, 19.5];

  const first = out.length + 1;
  rows.forEach((r) => {
    const line = out.length + 1;
    const it = r.it;
    const hsn = hsnValue(it);
    const box = `L${line}`;
    out.push([
      { v: it.code || "", s: WB.gd },
      { v: it.gd || "", s: WB.gd },
      { v: it.gl || "", s: WB.gdC },
      { v: it.size || "", s: WB.head },
      { v: it.length || "", s: WB.head },
      { v: it.packUnit || "", s: WB.numC },
      { v: r.packing, t: "n", s: WB.numC },
      { v: bcDescription(it), s: WB.desc },
      { v: String(it.barcode || ""), t: "s", s: WB.code },
      hsn == null ? { v: String(it.hsn || ""), t: "s", s: WB.numC } : { v: hsn, t: "n", s: WB.hsn },
      { v: r.qty, t: "n", s: WB.num },
      { f: upDiv(`K${line}`, `G${line}`), s: WB.num },
      { f: `${box}*${Number(it.volume) || 0}`, s: WB.num2 },
      { f: `${box}*${Number(it.netPerBox) || 0}`, s: WB.num3 },
      { f: `${box}*${Number(it.grossPerBox) || 0}`, s: WB.num3 },
    ]);
    heights.push(25.5);
  });
  const last = out.length;
  const st = (col, style) => ({ f: `SUBTOTAL(9,${col}${first}:${col}${last})`, s: style });

  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endGd }, { v: "", s: WB.endGd },
    { v: "", s: WB.endB }, { v: "", s: WB.endB }, { v: "", s: WB.end }, { v: "", s: WB.end },
    { v: "", s: WB.endDesc }, { v: "TOTAL", s: WB.tot }, { v: "", s: WB.tot },
    st("K", WB.tot), st("L", WB.tot), st("M", WB.tot2), st("N", WB.tot3), st("O", WB.tot3),
  ] : []);

  return fitSheet({
    name: "Packing",
    rows: out,
    heights,
    merges: ["A1:O1", "F2:G2", "K2:L2", "N2:N3", "O2:O3"],
    widths: [13.42578125, 11.28515625, 13.42578125, 5.140625, 8.5703125, 6, 6.28515625,
      32.7109375, 14.140625, 14.140625, 7, 7.28515625, 8, 9.140625, 9.140625],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    tabColor: "FFC00000",
    page: {
      paper: 9, orientation: "landscape", scale: 84, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  });
}

B["3"] = (ctx) => {
  const rows = orderAgg(ctx);
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const body = rows.map((r) => {
    const it = r.it;
    return `<tr>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="gdc">${esc(it.gl)}</td>
      <td class="bh">${esc(it.size)}</td>
      <td class="bh">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="c">${esc(hsnText(it))}</td>
      <td class="r" data-t="int" data-v="${r.qty}">${r.qty}</td>
      <td class="r" data-t="int" data-f="${boxFml}">${r.boxes}</td>
      <td class="r" data-t="num" data-f="{box}*${Number(it.volume) || 0}">${wbFixed(r.volTotal, 2)}</td>
      <td class="r" data-t="num3" data-f="{box}*${Number(it.netPerBox) || 0}">${wbFixed(r.netTotal, 3)}</td>
      <td class="r" data-t="num3" data-f="{box}*${Number(it.grossPerBox) || 0}">${wbFixed(r.grossTotal, 3)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">3 · PACKING</div>
    <table class="wb">
      <tr class="sec po"><td colspan="15">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr><th>CODE</th><th>GD CODE</th><th>GL CODE</th><th>SIZE</th><th>LENGTH</th>
        <th colspan="2">PACKING</th><th>DESCRIPTION</th><th>Bar Codes</th><th>HSN CODES</th>
        <th colspan="2">Quantity</th><th data-k="voltot">Volumn</th>
        <th rowspan="2" data-k="nettot">Total Nett<br>KGS</th><th rowspan="2" data-k="grosstot">Total Gross<br>Kgs</th></tr>
      <tr class="hd2"><th></th><th></th><th></th><th>MM</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th></th><th></th><th></th><th data-k="qty">Pcs</th><th data-k="box">Box</th><th></th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "qty")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td class="r" data-t="num" data-sum="voltot">${wbFixed(sum(rows, "volTotal"), 2)}</td>
        <td class="r" data-t="num3" data-sum="nettot">${wbFixed(sum(rows, "netTotal"), 3)}</td>
        <td class="r" data-t="num3" data-sum="grosstot">${wbFixed(sum(rows, "grossTotal"), 3)}</td></tr>
    </table>`;
  return { name: "Packing_3", html, sheet: packingSheet(ctx, rows) };
};

/* Doc 4 · Purchase — against 4-Purchase.xlsx. The packing sheet without its
   GL code and volumes, and with what we pay the factory on the end: unit price
   and line value in rupees, under a red heading carrying the date the price
   list was agreed. The banner rules off rather than boxing in, as theirs does. */
function purchaseSheet(ctx, rows) {
  const banner = [{ v: `PO NO : ${poHeaderList(ctx)}`, s: WB.poB }];
  for (let i = 1; i < 13; i++) banner.push({ v: "", s: WB.poB });

  const H = (v) => ({ v, s: WB.head });
  const out = [
    banner,
    [H("CODE"), H("GD CODE "), H("SIZE"), H("LENGTH"),
      { v: "PACKING", s: WB.headL }, { v: "", s: WB.headR }, H("DESCRIPTION"), H("Bar Codes"), H("HSN CODES"),
      { v: "Quantity", s: WB.headL }, { v: "", s: WB.headR },
      { v: `VALUE - ${ddmmyy(ctx.inv.date)}`, s: WB.headRed }, { v: "", s: WB.headRed }],
    [H(""), H(""), H("MM"), H("MM"), H("UNIT "), H("BOX"), H(""), H(""), H(""),
      H("Pcs"), H("Box"), H("UNIT"), H("Total")],
  ];
  const heights = [undefined, 19.5, 19.5];

  const first = out.length + 1;
  rows.forEach((r) => {
    const line = out.length + 1;
    const it = r.it;
    const hsn = hsnValue(it);
    out.push([
      { v: it.code || "", s: WB.gd },
      { v: it.gd || "", s: WB.gd },
      { v: it.size || "", s: WB.head },
      { v: it.length || "", s: WB.head },
      { v: it.packUnit || "", s: WB.numC },
      { v: r.packing, t: "n", s: WB.numC },
      { v: bcDescription(it), s: WB.desc },
      { v: String(it.barcode || ""), t: "s", s: WB.code },
      hsn == null ? { v: String(it.hsn || ""), t: "s", s: WB.numC } : { v: hsn, t: "n", s: WB.hsn },
      { v: r.qty, t: "n", s: WB.num },
      { f: upDiv(`J${line}`, `F${line}`), s: WB.num },
      { v: r.valUnit, t: "n", s: WB.money },
      { f: `J${line}*L${line}`, s: WB.money },
    ]);
    heights.push(25.5);
  });
  const last = out.length;
  const st = (col, style) => ({ f: `SUBTOTAL(9,${col}${first}:${col}${last})`, s: style });

  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endGd }, { v: "", s: WB.endB }, { v: "", s: WB.endB },
    { v: "", s: WB.end }, { v: "", s: WB.end }, { v: "", s: WB.endDesc },
    { v: "TOTAL", s: WB.tot }, { v: "", s: WB.tot },
    st("J", WB.tot), st("K", WB.tot), { v: "", s: WB.totMoney }, st("M", WB.totMoney),
  ] : []);

  return fitSheet({
    name: "Purchase",
    rows: out,
    heights,
    merges: ["A1:M1", "E2:F2", "J2:K2", "L2:M2"],
    widths: [13.42578125, 11.28515625, 5.140625, 8.5703125, 6, 6.28515625, 32.7109375,
      14.140625, 14.140625, 7, 7.28515625, 9.140625, 11.7109375],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    tabColor: "FF00B050",
    page: {
      paper: 9, orientation: "portrait", scale: 19, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  });
}

B["4"] = (ctx) => {
  const rows = orderAgg(ctx);
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const body = rows.map((r) => {
    const it = r.it;
    return `<tr>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="bh">${esc(it.size)}</td>
      <td class="bh">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="c">${esc(hsnText(it))}</td>
      <td class="r" data-t="int" data-v="${r.qty}">${r.qty}</td>
      <td class="r" data-t="int" data-f="${boxFml}">${r.boxes}</td>
      <td class="r" data-t="inr" data-v="${r.valUnit}">${wbRupee(r.valUnit)}</td>
      <td class="r" data-t="inr" data-f="{qty}*{valunit}">${wbRupee(r.valTotal)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">4 · PURCHASE</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="13">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr><th>CODE</th><th>GD CODE</th><th>SIZE</th><th>LENGTH</th>
        <th colspan="2">PACKING</th><th>DESCRIPTION</th><th>Bar Codes</th><th>HSN CODES</th>
        <th colspan="2">Quantity</th><th class="red" colspan="2">VALUE - ${esc(ddmmyy(ctx.inv.date))}</th></tr>
      <tr class="hd2"><th></th><th></th><th>MM</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th></th><th></th><th></th><th data-k="qty">Pcs</th><th data-k="box">Box</th>
        <th data-k="valunit">UNIT</th><th data-k="valtot">Total</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "qty")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="inr" data-sum="valtot">${wbRupee(sum(rows, "valTotal"))}</td></tr>
    </table>`;
  return { name: "Purchase_4", html, sheet: purchaseSheet(ctx, rows), page: "portrait" };
};

/* Doc 5 · Sales — against 5-Sales.xlsx. The purchase sheet's twin, priced the
   other way round: FOB per hundred pieces in dollars, then the RBI reference in
   rupees at the day's rate. That rate lives in one cell (O3) exactly as it does
   in their sheet, so changing it there re-values the whole column — which is
   the point of the sheet. The price date sits beside the banner, in red. */
function salesSheet(ctx, rows) {
  const ex = exRate(ctx);
  const banner = [{ v: `PO NO : ${poHeaderList(ctx)}`, s: WB.poBox }];
  for (let i = 1; i < 11; i++) banner.push({ v: "", s: WB.poBox });
  banner.push({ v: ddmm(ctx.inv.date), s: WB.headRed }, { v: "", s: WB.headRed },
    { v: "", s: WB.plain }, { v: "", s: WB.plain });

  const H = (v) => ({ v, s: WB.head });
  const out = [
    banner,
    [H("CODE"), H("GD CODE "), H("GL CODE"), H("SIZE"), H("LENGTH"),
      { v: "PACKING", s: WB.headL }, { v: "", s: WB.headR }, H("DESCRIPTION"), H("Bar Codes"),
      { v: "Quantity", s: WB.headL }, { v: "", s: WB.headR },
      H("FOB/100 PCS US$"), H(""), H("RBI REFERENCE"), H("")],
    [H(""), H(""), H(""), H("MM"), H("MM"), H("UNIT "), H("BOX"), H(""), H(""),
      H("Pcs"), H("Box"), H("Unit"), H("Total"), H("RATE @ Rs."), { v: ex, t: "n", s: WB.rate }],
  ];
  const heights = [undefined, 19.5, 19.5];

  const first = out.length + 1;
  rows.forEach((r) => {
    const line = out.length + 1;
    const it = r.it;
    out.push([
      { v: it.code || "", s: WB.gd },
      { v: it.gd || "", s: WB.gd },
      { v: it.gl || "", s: WB.gdC },
      { v: it.size || "", s: WB.head },
      { v: it.length || "", s: WB.head },
      { v: it.packUnit || "", s: WB.numC },
      { v: r.packing, t: "n", s: WB.numC },
      { v: bcDescription(it), s: WB.desc },
      { v: String(it.barcode || ""), t: "s", s: WB.code },
      { v: r.qty, t: "n", s: WB.num },
      { f: upDiv(`J${line}`, `G${line}`), s: WB.num },
      { v: r.fobPc * 100, t: "n", s: WB.usd },
      { f: `J${line}*L${line}/100`, s: WB.usd },
      { f: `IF(J${line}=0,0,O${line}/J${line})`, s: WB.rs },
      { f: `M${line}*$O$3`, s: WB.money },
    ]);
    heights.push(25.5);
  });
  const last = out.length;
  const st = (col, style) => ({ f: `SUBTOTAL(9,${col}${first}:${col}${last})`, s: style });

  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endGd }, { v: "", s: WB.endGd },
    { v: "", s: WB.endB }, { v: "", s: WB.endB }, { v: "", s: WB.end }, { v: "", s: WB.end },
    { v: "", s: WB.endDesc }, { v: "TOTAL", s: WB.tot },
    st("J", WB.tot), st("K", WB.tot), { v: "", s: WB.usd },
    st("M", WB.totUsd), { v: "", s: WB.totRs }, st("O", WB.totMoney),
  ] : []);

  return fitSheet({
    name: "Sales",
    rows: out,
    heights,
    merges: ["A1:K1", "L1:M1", "N1:O1", "F2:G2", "J2:K2", "L2:M2", "N2:O2"],
    /* Their money columns are the default 9.14 — wide enough only because the
       rate cell in their copy is empty. Filled in, the rupee columns print
       ###, so the three that carry a total are given room. */
    widths: [13.42578125, 11.28515625, 13.42578125, 5.140625, 8.5703125, 6, 6.28515625,
      32.7109375, 14.140625, 7, 7.28515625, 9.140625, 11.5, 12, 13.5],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    tabColor: "FF903C3A",
    page: {
      paper: 9, orientation: "portrait", scale: 19, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  });
}

B["5"] = (ctx) => {
  const rows = orderAgg(ctx);
  const ex = exRate(ctx);
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const usd2 = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rs2 = (n) => `Rs. ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const body = rows.map((r) => {
    const it = r.it;
    return `<tr>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="gdc">${esc(it.gl)}</td>
      <td class="bh">${esc(it.size)}</td>
      <td class="bh">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="r" data-t="int" data-v="${r.qty}">${r.qty}</td>
      <td class="r" data-t="int" data-f="${boxFml}">${r.boxes}</td>
      <td class="r" data-t="usd" data-v="${r.fobPc * 100}">${usd2(r.fobPc * 100)}</td>
      <td class="r" data-t="usd" data-f="{qty}*{fob100}/100">${usd2(r.fobTotal)}</td>
      <td class="r" data-t="inr" data-v="${r.qty ? r.rbiTotal / r.qty : 0}">${rs2(r.qty ? r.rbiTotal / r.qty : 0)}</td>
      <td class="r" data-t="inr" data-f="{fobtot}*${ex}">${wbRupee(r.rbiTotal)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">5 · SALES</div>
    <table class="wb">
      <tr class="sec po"><td colspan="11">PO NO : ${esc(poHeaderList(ctx))}</td>
        <td class="red c" colspan="2">${esc(ddmm(ctx.inv.date))}</td><td colspan="2"></td></tr>
      <tr><th>CODE</th><th>GD CODE</th><th>GL CODE</th><th>SIZE</th><th>LENGTH</th>
        <th colspan="2">PACKING</th><th>DESCRIPTION</th><th>Bar Codes</th>
        <th colspan="2">Quantity</th><th colspan="2">FOB/100 PCS US$</th><th colspan="2">RBI REFERENCE</th></tr>
      <tr class="hd2"><th></th><th></th><th></th><th>MM</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th></th><th></th><th data-k="qty">Pcs</th><th data-k="box">Box</th>
        <th data-k="fob100">Unit</th><th data-k="fobtot">Total</th>
        <th>RATE @ Rs.</th><th class="r" data-k="rbi">${wbRupee(ex)}</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td>TOTAL</td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "qty")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="usd" data-sum="fobtot">${usd2(sum(rows, "fobTotal"))}</td>
        <td class="nb"></td>
        <td class="r" data-t="inr" data-sum="rbi">${wbRupee(sum(rows, "rbiTotal"))}</td></tr>
    </table>`;
  return { name: "Sales_5", html, sheet: salesSheet(ctx, rows), page: "portrait" };
};

/* ---------- Doc 6 · Suppliers' PO ------------------------------------------
   Rebuilt against 6-Suppliers' PO.xlsx, which is not a report but a letter:
   a printed order form on the exporter's letterhead, then an annexure sheet of
   the items per range. Each factory still receives its own paper — that split
   is what the whole document is for — so a supplier's workbook is the letter
   followed by its annexures, and the downloads stay supplier by supplier.

   Their letter groups the goods the way their master does, PP mouldings first
   and nylon (GRN) after, each under its own sub-heading, with one annexure
   sheet per range. `stickerRule` on the item is what says which range it is.  */
const RANGES = [
  { key: "pp", head: "PP MOULDED FITTINGS", tab: "PP", tabColor: "FFC00000", scale: 78, is: (r) => (r.it.stickerRule || "pp") !== "grn" },
  { key: "grn", head: "NYLON MOULDED FITTINGS", tab: "GRN", tabColor: "FFFFFF00", scale: 88, is: (r) => r.it.stickerRule === "grn" },
];
const rangesOf = (arr) => RANGES.map((g) => ({ ...g, rows: arr.filter(g.is) })).filter((g) => g.rows.length);

const perUnitOf = (it) => (it.uom === "MTR" ? "Per Metre" : "Per Piece");
const poRefOf = (ctx, s) => `${orderRefOf(ctx)}-${s.code || ""} DT ${ddmm(ctx.inv.date)}`;
/* The exporter's own lines, as the letterhead prints them. */
const addrLines = (E) => String(E.addr || "").split(",").reduce((out, part) => {
  const line = out[out.length - 1];
  if (line && (line + "," + part).length <= 52) out[out.length - 1] = `${line},${part}`;
  else out.push(part.trim());
  return out;
}, []);

/* --- the letter (their "Page1") --- */
function supplierLetterSheet(ctx, s, arr) {
  const E = ctx.EXPORTER;
  const [addr1 = "", addr2 = ""] = addrLines(E);
  const groups = rangesOf(arr);
  const marks = ctx.inv.ship?.marks || "";

  const L = {                                            // the form's own styles
    title: { font: "refr", border: "ltb", align: "center" },
    brand: { font: "brand", border: "lt", align: "right" },
    sub: { font: "refmn", border: "l", align: "right" },
    addr: { font: "refbl", border: "l", align: "right" },
    addrEnd: { font: "refbl", border: "lb", align: "right" },
    label: { font: "refbb", border: "lt" },
    labelB: { font: "refbb", border: "lb" },
    value: { font: "ref", border: "t" },
    valueP: { font: "ref", border: false },
    to: { font: "refbb", border: "lt" },
    party: { font: "ref", border: "l", align: "left" },
    partyEnd: { font: "ref", border: "lb", align: "left" },
    gst: { font: "refbb", border: "lt", align: "center", valign: "center", wrap: true },
    marksHd: { font: "refbb", border: "lt", align: "center" },
    marks: { font: "refbb", border: "l", align: "center" },
    goods: { font: "refbb", border: "ltb" },
    colHd: { font: "refbb", border: "box", align: "center" },
    band: { font: "refb", border: "ltb", valign: "center" },
    bandC: { font: "refb", border: "lr", align: "center" },
    exw: { font: "refbu", border: "lrt", align: "center" },
    rs: { font: "refb", border: "lr", align: "center" },
    hCode: { font: "refb", border: "ltb" },
    hDesc: { font: "refb", border: "tb" },
    hHsn: { font: "refb", border: "box" },
    code: { font: "ref", border: "box", align: "left", valign: "center" },
    desc: { font: "ref", border: "box", valign: "center", wrap: true },
    hsn: { font: "ref", border: "box", align: "left", valign: "center", wrap: true, fmt: "0.0000" },
    qty: { font: "ref", border: "box", align: "center", valign: "center", fmt: "0" },
    price: { font: "ref", border: "box", align: "center", valign: "center", fmt: RUPEE },
    per: { font: "ref", border: "box", align: "center", valign: "center" },
    total: { font: "ref", border: "box", align: "right", valign: "center", fmt: RUPEE },
    totLabel: { font: "ref", border: "l", align: "right", valign: "center" },
    totLabelU: { font: "refun", border: "l", align: "left", valign: "center" },
    totVal: { font: "ref", border: "lr", align: "right", valign: "center", fmt: RUPEE },
    nettVal: { font: "ref", border: "box", align: "right", valign: "center", fmt: RUPEE },
    term: { font: "refbb", border: "l" },
    termT: { font: "refbb", border: "lt" },
    termB: { font: "refbb", border: "lb" },
    termVal: { font: "refbb", border: false },
    termValT: { font: "refbb", border: "t" },
    docLine: { font: "ref", border: false },
    conf: { font: "refbb", border: "lt" },
    confR: { font: "refbl", border: "lt", align: "right" },
    blankL: { font: "ref", border: "l" },
    blankR: { font: "ref", border: "r" },
    note: { font: "refb", border: "lb" },
    buyer: { font: "refur", border: "b", align: "right" },
    juris: { font: "refb", border: "t" },
  };
  const out = [];
  const merges = [];
  const heights = [];
  const CL = (n) => "ABCDEFG"[n - 1];
  const row = (cells) => { out.push(cells); return out.length; };
  /* A merged run is one cell on the page, so the cells it covers must not rule
     their own left and right edges — Excel and the PDF printers both draw them
     and the form ends up striped. Only the horizontal edges carry over. */
  const spans = [];
  const span = (from, to, r) => { merges.push(`${CL(from)}${r}:${CL(to)}${r}`); spans.push([r, from, to]); };
  const midStyle = (s) => {
    const b = s && s.border;
    if (b === false || b == null) return s;
    const kept = String(b === "box" ? "lrtb" : b).replace(/[lr]/g, "");
    return { ...s, border: kept || false };
  };
  const closeSpans = () => spans.forEach(([r, from, to]) => {
    for (let c = from + 1; c <= to; c++) {
      const cell = out[r - 1][c - 1];
      if (cell && cell.s) out[r - 1][c - 1] = { ...cell, s: midStyle(cell.s) };
    }
  });

  // 1 · title + letterhead
  let r = row([{ v: "EXPORT PURCHASE ORDER", s: L.title }, ...Array(6).fill({ v: "", s: L.title })]);
  span(1, 7, r);
  r = row([{ v: E.name, s: L.brand }, { v: "", s: L.brand }, { v: "", s: L.brand },
    { v: "Purchase Order", s: L.label }, { v: poRefOf(ctx, s), s: L.value }, { v: "", s: L.value }, { v: "", s: L.value }]);
  span(1, 3, r); span(5, 7, r);
  // The name runs across two rows in their sheet, so no rule under it here.
  r = row([{ v: "", s: L.party }, { v: "", s: L.party }, { v: "", s: L.party },
    { v: "No and Date :", s: L.labelB }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }]);
  span(1, 3, r); span(5, 7, r);
  r = row([{ v: E.sub || "Merchant Exporters", s: L.sub }, { v: "", s: L.sub }, { v: "", s: L.sub },
    { v: "Your Ref:", s: L.label }, { v: s.yourReference || "", s: L.value }, { v: "", s: L.value }, { v: "", s: L.value }]);
  span(1, 3, r); span(5, 7, r);
  r = row([{ v: addr1, s: L.addr }, { v: "", s: L.addr }, { v: "", s: L.addr },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }]);
  span(1, 3, r); span(5, 7, r);
  r = row([{ v: addr2, s: L.addr }, { v: "", s: L.addr }, { v: "", s: L.addr },
    { v: "Order of:", s: L.label }, { v: "PP & NYLON MOULDED FITTINGS", s: L.value }, { v: "", s: L.value }, { v: "", s: L.value }]);
  span(1, 3, r); span(5, 7, r);
  r = row([{ v: `Tel: ${E.tel} E-Mail: ${E.email}`, s: L.addrEnd }, { v: "", s: L.addrEnd }, { v: "", s: L.addrEnd },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }]);
  span(1, 3, r); span(5, 7, r);

  /* 2 · addressee on the left, our own GSTIN and the buyer's marks on the
     right. At order stage there are no marks yet — the field prints empty,
     which is how the client's own copy leaves it until the buyer confirms. */
  const party = [`Messrs. ${s.name || ""}`, s.addr || "", s.place || "",
    s.gstin ? `GSTIN : ${s.gstin}` : ""].filter(Boolean);
  const rightOf = (i) => (i === 1 ? { v: "Shipping Marks", s: L.marksHd }
    : i === 2 ? { v: marks, s: L.marks } : { v: "", s: L.party });

  r = row([{ v: "To,", s: L.to }, { v: "", s: L.to }, { v: "", s: L.to },
    { v: `GSTIN : ${E.gstin}\nPAN No: ${E.pan}`, s: L.gst }, { v: "", s: L.gst }, { v: "", s: L.gst }, { v: "", s: L.gst }]);
  span(1, 3, r); span(4, 7, r);
  heights[r - 1] = 26;
  party.forEach((line, i) => {
    const last = i === party.length - 1;
    const right = rightOf(i);
    r = row([{ v: line, s: last ? L.partyEnd : L.party }, { v: "", s: last ? L.partyEnd : L.party },
      { v: "", s: last ? L.partyEnd : L.party },
      right, { v: "", s: right.s }, { v: "", s: right.s }, { v: "", s: right.s }]);
    span(1, 3, r); span(4, 7, r);
  });

  // 3 · the goods table
  r = row([{ v: "DESCRIPTION OF GOODS.", s: L.goods }, { v: "", s: L.goods }, { v: "", s: L.goods },
    { v: "QUANTITY", s: L.colHd }, { v: "Unit Price.", s: L.colHd }, { v: "Per Unit", s: L.colHd }, { v: "Total Value.", s: L.colHd }]);
  span(1, 3, r);
  r = row([{ v: "PP & NYLON MOULDED FITTINGS", s: L.band }, { v: "", s: L.band }, { v: "", s: L.band },
    { v: "PIECES", s: L.bandC }, { v: "Rs.", s: L.bandC }, { v: "", s: L.bandC }, { v: "Ex-Works.", s: L.exw }]);
  span(1, 3, r);

  let first = 0;
  let last = 0;
  groups.forEach((g, gi) => {
    r = row([{ v: g.head, s: L.band }, { v: "", s: L.band }, { v: "", s: L.band },
      { v: "", s: L.bandC }, { v: "", s: L.bandC }, { v: "", s: L.bandC },
      gi === 0 ? { v: "Rs.", s: L.rs } : { v: "", s: L.rs }]);
    span(1, 3, r);
    if (gi === 0) {
      row([{ v: "CODE ", s: L.hCode }, { v: "DESCRIPTION", s: L.hDesc }, { v: "HSN CODE", s: L.hHsn },
        { v: "", s: L.bandC }, { v: "", s: L.bandC }, { v: "", s: L.bandC }, { v: "", s: L.rs }]);
    }
    g.rows.forEach((x) => {
      const line = out.length + 1;
      const hsn = hsnValue(x.it);
      out.push([
        { v: x.it.code || "", s: L.code },
        { v: bcDescription(x.it), s: L.desc },
        hsn == null ? { v: String(x.it.hsn || ""), t: "s", s: L.hsn } : { v: hsn, t: "n", s: L.hsn },
        { v: x.pieces, t: "n", s: L.qty },
        { v: x.valUnit, t: "n", s: L.price },
        { v: perUnitOf(x.it), s: L.per },
        { f: `E${line}*D${line}`, s: L.total },
      ]);
      if (!first) first = line;
      last = line;
      heights[line - 1] = 25.5;
    });
  });

  // 4 · totals
  const sumRange = first ? `SUM(G${first}:G${last})` : "0";
  r = row(Array(7).fill(null).map((_, i) => ({ v: "", s: i === 0 ? L.totLabel : i === 6 ? L.totVal : L.valueP })));
  r = row([{ v: "TOTAL VALUE….", s: L.totLabel }, { v: "", s: L.totLabel }, { v: "", s: L.totLabel },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { f: sumRange, s: L.totVal }]);
  span(1, 3, r);
  const valueRow = r;
  r = row([{ v: "ADD : IGST @ 18%", s: L.totLabelU }, { v: "", s: L.totLabelU }, { v: "", s: L.totLabelU },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { f: `ROUND(G${valueRow}*18%,0)`, s: L.totVal }]);
  span(1, 3, r);
  const gstRowNo = r;
  r = row([{ v: "TOTAL  NETT VALUE…………………", s: L.totLabel }, { v: "", s: L.totLabel }, { v: "", s: L.totLabel },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP },
    { f: `SUM(G${valueRow}:G${gstRowNo})`, s: L.nettVal }]);
  span(1, 3, r);

  // 5 · terms and signatures
  const term = (label, value, right, style, vstyle) => {
    const rr = row([{ v: label, s: style }, { v: value, s: vstyle }, { v: "", s: vstyle },
      { v: right ? right[0] : "", s: right ? L.termValT : L.valueP },
      { v: right ? right[1] : "", s: L.docLine }, { v: "", s: L.docLine }, { v: "", s: L.docLine }]);
    span(2, 3, rr);
    span(5, 7, rr);
    return rr;
  };
  term("Delivery", "", ["Documents:", "1. Invoice"], L.termT, L.termValT);
  term("Payment", "Against Delivery as usual", ["", "2. Packing cum weight List"], L.term, L.termVal);
  term("Packing", "As per attached Sheet", null, L.term, L.termVal);
  term("GST", "IGST @ 18% TO BE CHARGED", null, L.termB, L.termVal);
  r = row([{ v: "SELLER'S CONFIRMATION", s: L.conf }, { v: "", s: L.conf }, { v: "", s: L.conf },
    { v: `For ${E.name}`, s: L.confR }, { v: "", s: L.confR }, { v: "", s: L.confR }, { v: "", s: L.confR }]);
  span(1, 3, r); span(4, 7, r);
  const signFrom = out.length + 1;
  for (let i = 0; i < 3; i++) {
    r = row([{ v: "", s: L.blankL }, { v: "", s: L.valueP }, { v: "", s: L.valueP },
      { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.blankR }]);
    span(1, 3, r);
  }
  merges.push(`D${signFrom}:G${signFrom + 2}`);
  r = row([{ v: "(Please send us one copy duly signed & stamped as confirmation)", s: L.note },
    { v: "", s: L.note }, { v: "", s: L.note }, { v: "", s: L.note }, { v: "", s: L.note },
    { v: "BUYER.", s: L.buyer }, { v: "", s: L.buyer }]);
  span(1, 5, r); span(6, 7, r);
  r = row([{ v: "Subject to Mumbai Jurisdiction", s: L.juris }, { v: "", s: L.juris }, { v: "", s: L.juris },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }]);
  span(1, 3, r);
  closeSpans();

  return fitSheet({
    name: "Page1",
    rows: out,
    heights,
    merges,
    image: logoImage(),
    widths: [11.6640625, 32.5, 22.5, 16.6640625, 16.6640625, 16.6640625, 16.6640625],
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "portrait", scale: 76, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  }, { widen: false });
}

/* --- the annexure (their "PP" / "GRN" tabs): the items, no prices ---------
   The two tabs are not the same sheet. The PP range carries a works code and a
   length; the nylon range has neither, and its descriptions run to one line, so
   that tab is nine columns of shorter rows. Both are reproduced as they are. */
const ANNEX = {
  pp: {
    widths: [15.6640625, 13.1640625, 6, 10, 7, 7.33203125, 38.1640625, 16.5, 16.5, 8.1640625, 8.5],
    span: "K", packCol: "F", qtyCol: "J", totalAt: 8, headHt: 19.5, rowHt: 25.5,
    merges: ["A1:K1", "E2:F2", "J2:K2"],
    head: [
      ["CODE", "GD CODE ", "SIZE", "LENGTH", ["PACKING"], "DESCRIPTION", "Bar Codes", "HSN CODES", ["Quantity"]],
      ["", "", "MM", "MM", "UNIT ", "BOX", "", "", "", "Pcs", "Box"],
    ],
    cells: (x, hsn, line) => [
      { v: x.it.code || "", s: WB.gd },
      { v: x.it.gd || "", s: WB.gd },
      { v: x.it.size || "", s: WB.head },
      { v: x.it.length || "", s: WB.head },
      { v: x.it.packUnit || "", s: WB.numC },
      { v: x.packing, t: "n", s: WB.numC },
      { v: bcDescription(x.it), s: WB.desc },
      { v: String(x.it.barcode || ""), t: "s", s: WB.code },
      hsn == null ? { v: String(x.it.hsn || ""), t: "s", s: WB.numC } : { v: hsn, t: "n", s: WB.hsn },
      { v: x.pieces, t: "n", s: WB.num },
      { f: upDiv(`J${line}`, `F${line}`), s: WB.num },
    ],
    tail: [WB.endGd, WB.endGd, WB.endB, WB.endB, WB.end, WB.end, WB.endDesc],
    html: (x) => [["gd", esc(x.it.code)], ["gd", esc(x.it.gd)], ["bh", esc(x.it.size)], ["bh", esc(x.it.length)],
      ["c", esc(x.it.packUnit || "")], ["c", x.packing, "int"], ["desc", esc(bcDescription(x.it)).replace(/\n/g, "<br>")],
      ["code", esc(x.it.barcode)], ["c", esc(hsnText(x.it))], ["r", x.pieces, "int"], ["r", x.boxes, "fml"]],
    htmlHead: [
      ["CODE", 1], ["GD CODE", 1], ["SIZE", 1], ["LENGTH", 1], ["PACKING", 2],
      ["DESCRIPTION", 1], ["Bar Codes", 1], ["HSN CODES", 1], ["Quantity", 2]],
    htmlSub: ["", "", "MM", "MM", "UNIT", "BOX", "", "", "", "Pcs", "Box"],
  },
  /* The nylon tab is plainer than the PP one in their book: codes in black
     rather than the green, sizes unbolded, and the bar code held as a number
     rather than as text. Reproduced as it stands. */
  grn: {
    widths: [13.1640625, 6, 7, 7.33203125, 38.1640625, 16.5, 16.5, 10.6640625, 10.83203125],
    span: "I", packCol: "D", qtyCol: "H", totalAt: 6, headHt: 20.25, rowHt: undefined,
    merges: ["A1:I1", "C2:D2", "H2:I2"],
    banner: "box", pairs: { Quantity: "box" },
    margins: { left: 0.51181102362204722, right: 0.51181102362204722, top: 0.51181102362204722, bottom: 0.51181102362204722, header: 0, footer: 0 },
    head: [
      ["GD CODE ", "SIZE", ["PACKING"], "DESCRIPTION", "Bar Codes", "HSN CODES", ["Quantity"]],
      ["", "MM", "UNIT ", "BOX", "", "", "", "Pcs", "Box"],
    ],
    cells: (x, hsn, line) => {
      const bar = String(x.it.barcode || "");
      return [
        { v: x.it.gd || "", s: WB.textL },
        { v: x.it.size || "", s: WB.numC },
        { v: x.it.packUnit || "", s: WB.numC },
        { v: x.packing, t: "n", s: WB.numC },
        { v: bcDescription(x.it), s: WB.desc },
        /^\d+$/.test(bar) ? { v: Number(bar), t: "n", s: WB.barNum } : { v: bar, t: "s", s: WB.numC },
        hsn == null ? { v: String(x.it.hsn || ""), t: "s", s: WB.numC } : { v: hsn, t: "n", s: WB.hsn },
        { v: x.pieces, t: "n", s: WB.num },
        { f: upDiv(`H${line}`, `D${line}`), s: WB.num },
      ];
    },
    tail: [WB.endGd, WB.endB, WB.end, WB.end, WB.endDesc],
    html: (x) => [["", esc(x.it.gd)], ["c", esc(x.it.size)], ["c", esc(x.it.packUnit || "")],
      ["c", x.packing, "int"], ["desc", esc(bcDescription(x.it)).replace(/\n/g, "<br>")],
      ["c", esc(x.it.barcode)], ["c", esc(hsnText(x.it))], ["r", x.pieces, "int"], ["r", x.boxes, "fml"]],
    htmlHead: [["GD CODE", 1], ["SIZE", 1], ["PACKING", 2], ["DESCRIPTION", 1], ["Bar Codes", 1], ["HSN CODES", 1], ["Quantity", 2]],
    htmlSub: ["", "MM", "UNIT", "BOX", "", "", "", "Pcs", "Box"],
  },
};

function supplierAnnexSheet(ctx, group) {
  const A = ANNEX[group.key];
  const n = A.widths.length;
  const H = (v) => ({ v, s: WB.head });
  /* A pair under one heading is normally open between its two cells; on the
     nylon tab their book boxes both, and boxes the banner too. */
  const headRow = A.head[0].flatMap((h) => (Array.isArray(h)
    ? (A.pairs?.[h[0]] === "box" ? [H(h[0]), H("")] : [{ v: h[0], s: WB.headL }, { v: "", s: WB.headR }])
    : [H(h)]));
  const banner = A.banner === "box"
    ? Array(n).fill(null).map(() => ({ v: "", s: WB.poBox }))
    : [...Array(n - 1).fill({ v: "", s: WB.poM }), { v: "", s: WB.poM }];
  banner[0] = { v: `PO NO : ${poHeaderList(ctx)}`, s: A.banner === "box" ? WB.poBox : WB.poL };
  const out = [banner, headRow, A.head[1].map(H)];
  const heights = [undefined, A.headHt, A.headHt];

  const first = out.length + 1;
  group.rows.forEach((x) => {
    const line = out.length + 1;
    out.push(A.cells(x, hsnValue(x.it), line));
    heights.push(A.rowHt);
  });
  const last = out.length;
  const st = (col) => ({ f: `SUBTOTAL(9,${col}${first}:${col}${last})`, s: WB.tot });
  const boxCol = String.fromCharCode(A.qtyCol.charCodeAt(0) + 1);

  out.push(group.rows.length ? [
    ...A.tail.map((s) => ({ v: "", s })),
    { v: "TOTAL", s: WB.tot }, { v: "", s: WB.tot }, st(A.qtyCol), st(boxCol),
  ] : []);

  return fitSheet({
    name: group.tab,
    rows: out,
    heights,
    merges: A.merges,
    widths: A.widths,
    defaultColWidth: 10.6640625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    tabColor: group.tabColor,
    page: {
      paper: 9, orientation: "landscape", scale: group.scale, fit: true,
      margins: A.margins || { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  });
}

/* The same letter on screen and on paper. */
function supplierPoBlock(ctx, sid, arr) {
  const s = supFor(ctx, sid);
  const E = ctx.EXPORTER;
  const [addr1 = "", addr2 = ""] = addrLines(E);
  const groups = rangesOf(arr);
  const marks = ctx.inv.ship?.marks || "";
  const party = [`Messrs. ${s.name || ""}`, s.addr || "", s.place || "", s.gstin ? `GSTIN : ${s.gstin}` : ""].filter(Boolean);
  const value = sum(arr, "valTotal");
  const igst = Math.round(value * 0.18);

  const items = groups.map((g, gi) => `
      <tr class="band"><td class="l" colspan="3">${esc(g.head)}</td><td></td><td></td><td></td><td class="c b">${gi === 0 ? "Rs." : ""}</td></tr>
      ${gi === 0 ? `<tr><th class="l">CODE</th><th class="l">DESCRIPTION</th><th class="l">HSN CODE</th><th></th><th></th><th></th><th></th></tr>` : ""}
      ${g.rows.map((x) => `<tr>
        <td>${esc(x.it.code)}</td>
        <td class="desc">${esc(bcDescription(x.it)).replace(/\n/g, "<br>")}</td>
        <td>${esc(hsnText(x.it))}</td>
        <td class="c" data-t="int" data-v="${x.pieces}">${x.pieces}</td>
        <td class="c" data-t="inr" data-v="${x.valUnit}">${wbRupee(x.valUnit)}</td>
        <td class="c">${esc(perUnitOf(x.it))}</td>
        <td class="r" data-t="inr" data-v="${x.valTotal}">${wbRupee(x.valTotal)}</td>
      </tr>`).join("")}`).join("");

  return `<table class="wb letter">
      <colgroup><col style="width:11%"><col style="width:26%"><col style="width:18%">
        <col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:12%"></colgroup>
      <tr><td class="ttl" colspan="7">EXPORT PURCHASE ORDER</td></tr>
      <tr><td class="brand" colspan="3" rowspan="2"><img class="logo" src="${LOGO_SRC}" alt="">${esc(E.name)}</td>
        <td class="lbl">Purchase Order</td><td class="val" colspan="3">${esc(poRefOf(ctx, s))}</td></tr>
      <tr><td class="lbl">No and Date :</td><td colspan="3"></td></tr>
      <tr><td class="sub" colspan="3">${esc(E.sub || "Merchant Exporters")}</td>
        <td class="lbl">Your Ref:</td><td class="val" colspan="3">${esc(s.yourReference || "")}</td></tr>
      <tr><td class="addr" colspan="3">${esc(addr1)}</td><td></td><td colspan="3"></td></tr>
      <tr><td class="addr" colspan="3">${esc(addr2)}</td>
        <td class="lbl">Order of:</td><td class="val" colspan="3">PP &amp; NYLON MOULDED FITTINGS</td></tr>
      <tr><td class="addr" colspan="3">Tel: ${esc(E.tel)} E-Mail: ${esc(E.email)}</td><td></td><td colspan="3"></td></tr>
      <tr><td class="lbl" colspan="3">To,</td>
        <td class="gst c" colspan="4">GSTIN : ${esc(E.gstin)}<br>PAN No: ${esc(E.pan)}</td></tr>
      ${party.map((line, i) => `<tr><td class="party" colspan="3">${esc(line)}</td>
        <td class="lbl c" colspan="4">${i === 1 ? "Shipping Marks" : i === 2 ? esc(marks) : ""}</td></tr>`).join("")}
      <tr><td class="lbl l" colspan="3">DESCRIPTION OF GOODS.</td>
        <th>QUANTITY</th><th>Unit Price.</th><th>Per Unit</th><th>Total Value.</th></tr>
      <tr class="band"><td class="l" colspan="3">PP &amp; NYLON MOULDED FITTINGS</td>
        <td class="c b">PIECES</td><td class="c b">Rs.</td><td></td><td class="c b u">Ex-Works.</td></tr>
      ${items}
      <tr><td colspan="6"></td><td></td></tr>
      <tr><td class="r" colspan="3">TOTAL VALUE….</td><td colspan="3"></td>
        <td class="r" data-t="inr" data-v="${value}">${wbRupee(value)}</td></tr>
      <tr><td class="u" colspan="3">ADD : IGST @ 18%</td><td colspan="3"></td>
        <td class="r" data-t="inr" data-v="${igst}">${wbRupee(igst)}</td></tr>
      <tr><td class="r" colspan="3">TOTAL  NETT VALUE…………………</td><td colspan="3"></td>
        <td class="r bx" data-t="inr" data-v="${value + igst}">${wbRupee(value + igst)}</td></tr>
      <tr><td class="lbl">Delivery</td><td class="lbl" colspan="2"></td>
        <td class="lbl">Documents:</td><td colspan="3">1. Invoice</td></tr>
      <tr><td class="lbl">Payment</td><td class="lbl" colspan="2">Against Delivery as usual</td>
        <td></td><td colspan="3">2. Packing cum weight List</td></tr>
      <tr><td class="lbl">Packing</td><td class="lbl" colspan="2">As per attached Sheet</td><td></td><td colspan="3"></td></tr>
      <tr><td class="lbl">GST</td><td class="lbl" colspan="2">IGST @ 18% TO BE CHARGED</td><td></td><td colspan="3"></td></tr>
      <tr><td class="lbl" colspan="3">SELLER'S CONFIRMATION</td>
        <td class="sgn r" colspan="4">For ${esc(E.name)}</td></tr>
      <tr class="sign"><td colspan="3"></td><td colspan="4"></td></tr>
      <tr><td class="b" colspan="5">(Please send us one copy duly signed &amp; stamped as confirmation)</td>
        <td class="buyer r" colspan="2">BUYER.</td></tr>
      <tr><td class="b" colspan="3">Subject to Mumbai Jurisdiction</td><td colspan="4"></td></tr>
    </table>`;
}

/* The annexure as it reads on screen — the same columns as its tab. */
function supplierAnnexBlock(ctx, group) {
  const A = ANNEX[group.key];
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const cell = ([cls, v, kind]) => {
    if (kind === "int") return `<td class="${cls}" data-t="int" data-v="${v}">${v}</td>`;
    if (kind === "fml") return `<td class="${cls}" data-t="int" data-f="${boxFml}">${v}</td>`;
    return `<td class="${cls}">${v}</td>`;
  };
  return `<div class="sub">ANNEXURE · ${esc(group.tab)} — PO NO : ${esc(poHeaderList(ctx))}</div>
    <table class="wb">
      <tr>${A.htmlHead.map(([h, span]) => `<th${span > 1 ? ` colspan="${span}"` : ""}>${h}</th>`).join("")}</tr>
      <tr class="hd2">${A.htmlSub.map((h, i) => {
    const key = h === "BOX" ? " data-k=\"packbox\"" : h === "Pcs" ? " data-k=\"qty\"" : h === "Box" ? " data-k=\"box\"" : "";
    return `<th${key}>${h}</th>`;
  }).join("")}</tr>
      ${group.rows.map((x) => `<tr>${A.html(x).map(cell).join("")}</tr>`).join("")}
      <tr class="tot">${A.tail.map(() => '<td class="o"></td>').join("")}<td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(group.rows, "pieces")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(group.rows, "boxes")}</td></tr>
    </table>`;
}

/* One supplier purchase order per supplier — for the split download. Each
   carries its own workbook: the letter, then an annexure per range. */
export function supplierPoDocs(ctx) {
  const rows = orderRows(ctx);
  const bySup = {};
  rows.forEach((x) => { (bySup[x.supId] = bySup[x.supId] || []).push(x); });
  return Object.entries(bySup).map(([sid, arr]) => {
    const sp = supFor(ctx, sid);
    const groups = rangesOf(arr);
    return {
      supplierId: sid, code: sp.code || sid, name: sp.name || sid,
      docName: `Suppliers_PO_6_${(sp.code || sid).replace(/[^A-Za-z0-9]+/g, "_")}`,
      html: supplierPoBlock(ctx, sid, arr)
        + groups.map((g) => `<div class="pgbrk">${supplierAnnexBlock(ctx, g)}</div>`).join(""),
      sheets: [supplierLetterSheet(ctx, sp, arr), ...groups.map((g) => supplierAnnexSheet(ctx, g))],
    };
  });
}

B["6"] = (ctx) => ({
  name: "Suppliers_PO_6",
  html: supplierPoDocs(ctx).map((d) => d.html).join('<div class="pgbrk"></div>'),
  page: "portrait",
});

/* ---------- Stage B · Supplier packing (7A–11) ---------- */
function supplierTable(ctx, cols, footBuilder, title, sub) {
  const rows = L(ctx);
  const foot = footBuilder ? footBuilder(rows) : null;
  return `<div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div>${tableOf(cols, rows, foot)}`;
}
/* On the supplier sheets the boxes are the packed fact and the pieces follow
   from them, so the formulas run the other way round to the buyer sheets:
   Qty = Box × Packing. */
const QTY_FROM_BOX = "{box}*{pack}";

B["7A"] = (ctx) => {
  const ex = exRate(ctx);
  const cols = [
    { h: "Sr No", c: 1, f: (r) => r.range }, { h: "PO No", f: (r) => r.pos.join(", ") },
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "OSWIN Code", f: (r) => esc(r.it.oswin) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) },
    { h: "Packing", c: 1, key: "pack", t: "int", v: (r) => r.packing, f: (r) => r.packing },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Codes", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", fml: QTY_FROM_BOX, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Box", r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "Vol/Box", r: 1, key: "volbox", t: "num3", v: (r) => r.it.volume, f: (r) => num(r.it.volume, 3) },
    { h: "Total Vol", r: 1, key: "voltot", t: "num", fml: "{box}*{volbox}", f: (r) => num(r.volTotal, 2) },
    { h: "BG", r: 1, key: "bg", t: "int", v: (r) => r.bg, f: (r) => r.bg },
    { h: "PC", r: 1, key: "pc", t: "int", v: (r) => r.pc, f: (r) => r.pc },
    { h: "TTL", r: 1, key: "ttl", t: "num1", v: (r) => r.ttl, f: (r) => r.ttl },
    { h: "Barcode Stk", r: 1, key: "stk", t: "int", fml: (r) => `ROUNDUP({box}*${r.stkPerBox},0)`, f: (r) => r.stickers },
    { h: "Sheets", r: 1, key: "sheets", t: "int", fml: (r) => upDiv("{stk}", String(r.typeUp || 0)), f: (r) => r.sheets },
    { h: "Cost/Unit ₹", r: 1, key: "costunit", t: "inr", v: (r) => r.valUnit, f: (r) => num(r.valUnit) },
    { h: "Total Cost ₹", r: 1, key: "costtot", t: "inr", fml: "{qty}*{costunit}", f: (r) => num(r.valTotal) },
    { h: "FOB/pc $", r: 1, key: "fobpc", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "Total FOB $", r: 1, key: "fobtot", t: "usd", fml: "{qty}*{fobpc}", f: (r) => usd(r.fobTotal) },
    { h: "RBI Ref ₹", r: 1, key: "rbi", t: "inr", fml: `{fobtot}*${ex}`, f: (r) => num(r.rbiTotal) },
  ];
  const foot = (rows) => [{ v: "TOTAL", span: 12 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" }, { v: "" },
    { v: num(sum(rows, "volTotal"), 2), r: 1, sum: "voltot", t: "num" }, { v: "", span: 3 },
    { v: sum(rows, "stickers"), r: 1, sum: "stk", t: "int" }, { v: sum(rows, "sheets"), r: 1, sum: "sheets", t: "int" },
    { v: "" }, { v: num(sum(rows, "valTotal")), r: 1, sum: "costtot", t: "inr" }, { v: "" },
    { v: usd(sum(rows, "fobTotal")), r: 1, sum: "fobtot", t: "usd" },
    { v: num(sum(rows, "rbiTotal")), r: 1, sum: "rbi", t: "inr" }];
  return { name: "Supplier_Master_7A", html: supplierTable(ctx, cols, foot, "7A · MOULDED ORDER MASTER (Supplier)", `PO NO : ${poHeaderList(ctx)} · Rate @ Rs. ${ex}`) };
};
/* Doc 7 · Packing (Supplier) — against 7-Packing.xlsx.

   The packer's own sheet: eighteen columns under a two-line header, the goods
   broken into the size bands their master keeps them in ("15 MM (1/2\")",
   "25mm(1\")", "PP PIPES M/F THREADED" …), which is the item's Group. A band is
   ruled in wherever the group changes — the rows are left in the order they
   were packed, never re-sorted, because the serial numbers run down the sheet.

   Its arithmetic, kept as theirs: Box = Pcs ÷ pack, Volume = Box × per-box, and
   the weights follow the box count too. Pieces, quantities and volumes total
   with SUBTOTAL so a filtered sheet re-totals itself; the weights with SUM. */
const P7 = {
  banner: { font: "refb", border: "b", valign: "center" },
  head: { font: "refb", border: "box", align: "center", valign: "center" },
  headW: { font: "refb", border: "box", align: "center", valign: "center", wrap: true },
  headV: { font: "refb", border: "box", valign: "center" },
  headL: { font: "refb", border: "ltb", align: "center", valign: "center" },
  headR: { font: "refb", border: "rtb", align: "center", valign: "center" },
  headT: { font: "refb", border: "lrt", align: "center", valign: "center" },
  headTL: { font: "refb", border: "lrt", valign: "center" },
  headB: { font: "refb", border: "lrb", align: "center", valign: "center" },
  headRT: { font: "refb", border: "rt", valign: "center" },
  bandC: { font: "refb", border: "tb", align: "left", valign: "center" },
  bandD: { font: "refb", border: "ltb", align: "left", valign: "center" },
  bandFill: { font: "ref", border: "box", valign: "center" },
  sr: { font: "ref", border: "box", valign: "center" },
  po: { font: "ref", border: "box", align: "center", valign: "center", wrap: true, quote: true },
  codeC: { font: "refgd", border: "rtb", align: "left", valign: "center" },
  code: { font: "refgd", border: "box", align: "left", valign: "center" },
  mid: { font: "ref", border: "box", align: "center", valign: "center" },
  desc: { font: "refb", border: "box", align: "left", valign: "center", wrap: true },
  bar: { font: "refb", border: "box", align: "center", valign: "center", quote: true },
  hsn: { font: "refb", border: "box", align: "center", valign: "center", fmt: "0.0000" },
  num: { font: "ref", border: "box", valign: "center" },
  num2: { font: "ref", border: "box", valign: "center", fmt: "0.00" },
  num3: { font: "ref", border: "box", valign: "center", fmt: "0.000" },
  endGd: { font: "refgd", border: "t", valign: "center" },
  end: { font: "ref", border: "t", valign: "center" },
  endL: { font: "ref", border: "t", align: "left", valign: "center" },
  endR: { font: "ref", border: "rt", valign: "center" },
  tot: { font: "refb", border: "box", align: "center", valign: "center" },
  totV: { font: "refb", border: "box", valign: "center" },
  tot2: { font: "refb", border: "box", valign: "center", fmt: "0.00" },
  tot3: { font: "refb", border: "box", valign: "center", fmt: "0.000" },
};
/* Their PO column stacks the orders a line each, rather than running them
   together and letting the column decide where to break. */
const poStack = (pos) => (pos || []).join(",\n");
/* Their banner writes the order list with a stop after DT. */
const poBannerList = (ctx) => {
  const seen = {};
  ctx.buyerMaster.forEach((r) => { if (!seen[r.po]) seen[r.po] = r.date; });
  return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1]))
    .map(([po, d]) => `${po} DT.${ddmm(d)}`).join(", ");
};

function supplierPackingSheet(ctx, rows) {
  const H = (v) => ({ v, s: P7.head });
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  const firstBand = groups.length ? groups[0] : "";

  const out = [
    [{ v: `PO NO. ${poBannerList(ctx)}`, s: P7.banner }, ...Array(17).fill({ v: "", s: P7.banner })],
    [{ v: "SR. NO.", s: P7.headW }, { v: "PO NO.", s: P7.headW },
      { v: "CODE ", s: P7.headRT }, { v: "GD CODE", s: P7.headV }, { v: "OSWIN CODE", s: P7.headTL },
      H("SIZE "), H("LENGTH"), { v: "PACKING ", s: P7.headL }, { v: "", s: P7.headR },
      { v: "DESCRIPTION", s: P7.headT }, { v: "BAR CODES", s: P7.headT }, { v: "HSN CODE", s: P7.headT },
      { v: "QUANTITY", s: P7.headL }, { v: "", s: P7.headR },
      H("VOLUMN"), H(""), H("TOTAL"), H("")],
    [{ v: "", s: P7.headW }, { v: "", s: P7.headW },
      { v: firstBand, s: P7.bandC }, { v: "", s: P7.bandD }, { v: "", s: P7.bandD },
      H("MM / IN"), H("MM"), H("UNIT"), H("BOX"),
      { v: "", s: P7.headB }, { v: "", s: P7.headB }, { v: "", s: P7.headB },
      H("PCS"), H("BOX"), H("PER BOX"), H("TOTAL"),
      { v: "NET WT", s: P7.headV }, { v: "GROSS WT", s: P7.headV }],
  ];
  const heights = [undefined, 12.75, undefined];

  let band = firstBand;
  let first = 0;
  let last = 0;
  rows.forEach((r) => {
    const g = String(r.it.group || "").trim();
    if (g && g !== band) {                       // a new size band opens
      band = g;
      /* The cells either side of the label keep their column's own formatting,
         as theirs do — the band is a break in the list, not a different table. */
      out.push([{ v: "", s: P7.sr }, { v: "", s: P7.po },
        { v: g, s: P7.bandC }, { v: "", s: P7.bandD }, { v: "", s: P7.bandD },
        ...[P7.mid, P7.mid, P7.mid, P7.mid, P7.desc, P7.bar, P7.hsn,
          P7.num, P7.num, P7.num2, P7.num2, P7.num3, P7.num3].map((s) => ({ v: "", s }))]);
      heights.push(15);
    }
    const line = out.length + 1;
    const it = r.it;
    const hsn = hsnValue(it);
    out.push([
      { v: r.range || "", s: P7.sr },
      { v: poStack(r.pos), s: P7.po },
      { v: it.code || "", s: P7.codeC },
      { v: it.gd || "", s: P7.code },
      { v: it.oswin || "", s: P7.code },
      { v: it.size || "", s: P7.mid },
      { v: it.length || "", s: P7.mid },
      { v: it.packUnit || "", s: P7.mid },
      { v: r.packing, t: "n", s: P7.mid },
      { v: bcDescription(it), s: P7.desc },
      { v: String(it.barcode || ""), t: "s", s: P7.bar },
      hsn == null ? { v: String(it.hsn || ""), t: "s", s: P7.mid } : { v: hsn, t: "n", s: P7.hsn },
      { v: r.pieces, t: "n", s: P7.num },
      { f: `$M${line}/$I${line}`, s: P7.num },
      { v: Number(it.volume) || 0, t: "n", s: P7.num2 },
      { f: `$N${line}*$O${line}`, s: P7.num2 },
      { f: `$N${line}*${Number(it.netPerBox) || 0}`, s: P7.num3 },
      { f: `$N${line}*${Number(it.grossPerBox) || 0}`, s: P7.num3 },
    ]);
    if (!first) first = line;
    last = line;
    heights.push(25.5);
  });

  const st = (col, style) => ({ f: first ? `SUBTOTAL(9,${col}${first}:${col}${last})` : "0", s: style });
  const sm = (col, style) => ({ f: first ? `SUM(${col}${first}:${col}${last})` : "0", s: style });
  // Their totals row starts at the code column; A and B are left untouched.
  out.push(rows.length ? [
    null, null, { v: "", s: P7.endGd }, { v: "", s: P7.end }, { v: "", s: P7.end },
    { v: "", s: P7.endL }, { v: "", s: P7.endL }, { v: "", s: P7.endL }, { v: "", s: P7.endL },
    { v: "", s: P7.endR }, { v: "TOTAL", s: P7.tot }, { v: "", s: P7.tot },
    st("M", P7.totV), st("N", P7.totV), { v: "", s: P7.num },
    st("P", P7.tot2), sm("Q", P7.tot3), sm("R", P7.tot3),
  ] : []);

  return fitSheet({
    name: "Packing",
    rows: out,
    heights,
    merges: ["A1:R1", "A2:A3", "B2:B3", "H2:I2", "J2:J3", "K2:K3", "L2:L3", "M2:N2", "O2:P2", "Q2:R2"],
    widths: [9.140625, 9.140625, 13.42578125, 12.5703125, 14.5703125, 7.7109375, 8.5703125, 6, 6.140625,
      25.140625, 14.28515625, 14.28515625, 9.140625, 9.140625, 9.140625, 9.140625, 9.140625, 11],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", scale: 74, fit: true, fitH: 0,
      margins: { left: 0.39370078740157499, right: 0.39370078740157499, top: 0.39370078740157499, bottom: 0.39370078740157499, header: 0, footer: 0 },
    },
  });
}

B["7"] = (ctx) => {
  const rows = L(ctx);
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  let band = groups.length ? groups[0] : "";
  const body = rows.map((r) => {
    const it = r.it;
    const g = String(it.group || "").trim();
    const open = g && g !== band ? (band = g, `<tr class="band"><td></td><td></td>`
      + `<td class="gd" colspan="3">${esc(g)}</td>${"<td></td>".repeat(13)}</tr>`) : "";
    return `${open}<tr>
      <td class="c">${esc(r.range)}</td>
      <td class="po">${esc(poStack(r.pos)).replace(/\n/g, "<br>")}</td>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="gd">${esc(it.oswin)}</td>
      <td class="c">${esc(it.size)}</td>
      <td class="c">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc b">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="code">${esc(hsnText(it))}</td>
      <td class="r" data-t="int" data-v="${r.pieces}">${r.pieces}</td>
      <td class="r" data-t="int" data-f="{qty}/{packbox}">${r.boxes}</td>
      <td class="r" data-t="num" data-v="${Number(it.volume) || 0}">${wbFixed(it.volume, 2)}</td>
      <td class="r" data-t="num" data-f="{box}*{volbox}">${wbFixed(r.volTotal, 2)}</td>
      <td class="r" data-t="num3" data-f="{box}*${Number(it.netPerBox) || 0}">${wbFixed(r.netTotal, 3)}</td>
      <td class="r" data-t="num3" data-f="{box}*${Number(it.grossPerBox) || 0}">${wbFixed(r.grossTotal, 3)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">7 · PACKING (Supplier)</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="18">PO NO. ${esc(poBannerList(ctx))}</td></tr>
      <tr><th rowspan="2">SR. NO.</th><th rowspan="2">PO NO.</th><th>CODE</th><th>GD CODE</th><th>OSWIN CODE</th>
        <th>SIZE</th><th>LENGTH</th><th colspan="2">PACKING</th>
        <th rowspan="2">DESCRIPTION</th><th rowspan="2">BAR CODES</th><th rowspan="2">HSN CODE</th>
        <th colspan="2">QUANTITY</th><th colspan="2">VOLUMN</th><th colspan="2">TOTAL</th></tr>
      <tr class="hd2"><th class="gd" colspan="3">${esc(groups[0] || "")}</th>
        <th>MM / IN</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th data-k="qty">PCS</th><th data-k="box">BOX</th><th data-k="volbox">PER BOX</th><th data-k="voltot">TOTAL</th>
        <th data-k="nettot">NET WT</th><th data-k="grosstot">GROSS WT</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "pieces")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="num" data-sum="voltot">${wbFixed(sum(rows, "volTotal"), 2)}</td>
        <td class="r" data-t="num3" data-sum="nettot">${wbFixed(sum(rows, "netTotal"), 3)}</td>
        <td class="r" data-t="num3" data-sum="grosstot">${wbFixed(sum(rows, "grossTotal"), 3)}</td></tr>
    </table>`;
  return { name: "Packing_7", html, sheet: supplierPackingSheet(ctx, rows) };
};
/* Doc 8 · Purchase (Supplier) — against 8-Purchase.xlsx. The packing sheet
   without the volumes and weights, and with what we pay the factory on the end:
   the price columns are headed with the date the rate was agreed, and the sheet
   closes on TOTAL → IGST @ 18% → INV VALUE, all three by formula. */
function supplierPurchaseSheet(ctx, rows) {
  const S = {
    ...P7,
    money: { font: "ref", border: "box", valign: "center", fmt: RUPEE },
    totMoney: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
    // Their two closing lines are set a point larger than the sheet.
    tailLabel: { font: "refb11", border: "box", valign: "center", fmt: RUPEE },
    tailBlank: { font: "ref", border: false, valign: "center" },
  };
  const H = (v) => ({ v, s: S.head });
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  const firstBand = groups.length ? groups[0] : "";

  const out = [
    [{ v: `PO NO. ${poBannerList(ctx)}`, s: S.banner }, ...Array(15).fill({ v: "", s: S.banner })],
    [{ v: "SR. NO.", s: S.headW }, { v: "PO NO.", s: S.headW },
      { v: "CODE ", s: S.headRT }, { v: "GD CODE", s: S.headV }, { v: "OSWIN CODE", s: S.headTL },
      H("SIZE "), H("LENGTH"), { v: "PACKING ", s: S.headL }, { v: "", s: S.headR },
      { v: "DESCRIPTION", s: S.headT }, { v: "BAR CODES", s: S.headT }, { v: "HSN CODE", s: S.headT },
      { v: "QUANTITY", s: S.headL }, { v: "", s: S.headR },
      { v: ddmm(ctx.inv.date), s: S.head }, { v: "", s: S.head }],
    [{ v: "", s: S.headW }, { v: "", s: S.headW },
      { v: firstBand, s: S.bandC }, { v: "", s: S.bandD }, { v: "", s: S.bandD },
      H("MM / IN"), H("MM"), H("UNIT"), H("BOX"),
      { v: "", s: S.headB }, { v: "", s: S.headB }, { v: "", s: S.headB },
      H("PCS"), H("BOX"), H("UNIT"), H("TOTAL")],
  ];
  const heights = [undefined, 12.75, undefined];

  let band = firstBand;
  let first = 0;
  let last = 0;
  rows.forEach((r) => {
    const g = String(r.it.group || "").trim();
    if (g && g !== band) {
      band = g;
      out.push([{ v: "", s: S.sr }, { v: "", s: S.po },
        { v: g, s: S.bandC }, { v: "", s: S.bandD }, { v: "", s: S.bandD },
        ...[S.mid, S.mid, S.mid, S.mid, S.desc, S.bar, S.hsn, S.num, S.num, S.money, S.money]
          .map((s) => ({ v: "", s }))]);
      heights.push(15);
    }
    const line = out.length + 1;
    const it = r.it;
    const hsn = hsnValue(it);
    out.push([
      { v: r.range || "", s: S.sr },
      { v: poStack(r.pos), s: S.po },
      { v: it.code || "", s: S.codeC },
      { v: it.gd || "", s: S.code },
      { v: it.oswin || "", s: S.code },
      { v: it.size || "", s: S.mid },
      { v: it.length || "", s: S.mid },
      { v: it.packUnit || "", s: S.mid },
      { v: r.packing, t: "n", s: S.mid },
      { v: bcDescription(it), s: S.desc },
      { v: String(it.barcode || ""), t: "s", s: S.bar },
      hsn == null ? { v: String(it.hsn || ""), t: "s", s: S.mid } : { v: hsn, t: "n", s: S.hsn },
      { v: r.pieces, t: "n", s: S.num },
      { f: `$M${line}/$I${line}`, s: S.num },
      { v: r.valUnit, t: "n", s: S.money },
      { f: `O${line}*$M${line}`, s: S.money },
    ]);
    if (!first) first = line;
    last = line;
    heights.push(25.5);
  });

  const st = (col, style) => ({ f: first ? `SUBTOTAL(9,${col}${first}:${col}${last})` : "0", s: style });
  if (rows.length) {
    out.push([
      null, null, { v: "", s: S.endGd }, { v: "", s: S.end }, { v: "", s: S.end },
      { v: "", s: S.endL }, { v: "", s: S.endL }, { v: "", s: S.endL }, { v: "", s: S.endL },
      { v: "", s: S.endR }, { v: "TOTAL", s: S.tot }, { v: "", s: S.tot },
      st("M", S.totV), st("N", S.totV), { v: "", s: S.money }, st("P", S.totMoney),
    ]);
    const valueRow = out.length;
    const blanks = Array(14).fill(null).map(() => ({ v: "", s: S.tailBlank }));
    out.push([...blanks, { v: "IGST @ 18%", s: S.tailLabel },
      { f: `ROUND(P${valueRow}*18%,0)`, s: S.totMoney }]);
    heights[out.length - 1] = 15;
    out.push([...blanks, { v: "INV VALUE", s: S.tailLabel },
      { f: `SUM(P${valueRow}:P${valueRow + 1})`, s: S.totMoney }]);
    heights[out.length - 1] = 15;
  }

  return fitSheet({
    name: "Purchase",
    rows: out,
    heights,
    merges: ["A1:P1", "A2:A3", "B2:B3", "H2:I2", "J2:J3", "K2:K3", "L2:L3", "M2:N2", "O2:P2"],
    widths: [9.140625, 9.140625, 13.42578125, 12.5703125, 14.5703125, 7.7109375, 8.5703125, 6, 6.140625,
      25.140625, 14.28515625, 14.28515625, 9.140625, 9.140625, 11.140625, 13.42578125],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", scale: 40, fit: true, fitH: 0,
      margins: { left: 0.39370078740157499, right: 0.39370078740157499, top: 0.39370078740157499, bottom: 0.39370078740157499, header: 0, footer: 0 },
    },
  });
}

B["8"] = (ctx) => {
  const rows = L(ctx);
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  let band = groups.length ? groups[0] : "";
  const value = sum(rows, "valTotal");
  const igst = Math.round(value * 0.18);
  const body = rows.map((r) => {
    const it = r.it;
    const g = String(it.group || "").trim();
    const open = g && g !== band ? (band = g, `<tr class="band"><td></td><td></td>`
      + `<td class="gd" colspan="3">${esc(g)}</td>${"<td></td>".repeat(11)}</tr>`) : "";
    return `${open}<tr>
      <td class="c">${esc(r.range)}</td>
      <td class="po">${esc(poStack(r.pos)).replace(/\n/g, "<br>")}</td>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="gd">${esc(it.oswin)}</td>
      <td class="c">${esc(it.size)}</td>
      <td class="c">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc b">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="code">${esc(hsnText(it))}</td>
      <td class="r" data-t="int" data-v="${r.pieces}">${r.pieces}</td>
      <td class="r" data-t="int" data-f="{qty}/{packbox}">${r.boxes}</td>
      <td class="r" data-t="inr" data-v="${r.valUnit}">${wbRupee(r.valUnit)}</td>
      <td class="r" data-t="inr" data-f="{qty}*{valunit}">${wbRupee(r.valTotal)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">8 · PURCHASE (Supplier)</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="16">PO NO. ${esc(poBannerList(ctx))}</td></tr>
      <tr><th rowspan="2">SR. NO.</th><th rowspan="2">PO NO.</th><th>CODE</th><th>GD CODE</th><th>OSWIN CODE</th>
        <th>SIZE</th><th>LENGTH</th><th colspan="2">PACKING</th>
        <th rowspan="2">DESCRIPTION</th><th rowspan="2">BAR CODES</th><th rowspan="2">HSN CODE</th>
        <th colspan="2">QUANTITY</th><th colspan="2">${esc(ddmm(ctx.inv.date))}</th></tr>
      <tr class="hd2"><th class="gd" colspan="3">${esc(groups[0] || "")}</th>
        <th>MM / IN</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th data-k="qty">PCS</th><th data-k="box">BOX</th>
        <th data-k="valunit">UNIT</th><th data-k="valtot">TOTAL</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "pieces")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="inr" data-sum="valtot">${wbRupee(value)}</td></tr>
      <tr class="tot"><td class="nb" colspan="14"></td><td>IGST @ 18%</td>
        <td class="r" data-t="inr" data-v="${igst}">${wbRupee(igst)}</td></tr>
      <tr class="tot"><td class="nb" colspan="14"></td><td>INV VALUE</td>
        <td class="r" data-t="inr" data-v="${value + igst}">${wbRupee(value + igst)}</td></tr>
    </table>`;
  return { name: "Purchase_8", html, sheet: supplierPurchaseSheet(ctx, rows) };
};
/* Doc 9 · Sales (Supplier) — against 9-Sales.xlsx. The purchase sheet priced
   the other way round: FOB per piece in dollars, then the RBI reference in
   rupees at the day's rate, which lives in one cell (Q3) exactly as it does in
   their sheet — change it there and the whole column re-values. The price date
   sits beside the banner in red, and there is no HSN column on this one. */
function supplierSalesSheet(ctx, rows) {
  const ex = exRate(ctx);
  const S = {
    ...P7,
    dateRed: { font: "refr", border: "b", align: "center", valign: "center" },
    gdC: { font: "refgd", border: "box", align: "center", valign: "center" },
    usd: { font: "ref", border: "box", valign: "center", fmt: USD },
    rs: { font: "ref", border: "box", valign: "center", fmt: RS },
    inr: { font: "ref", border: "box", valign: "center", fmt: RUPEE },
    rateHd: { font: "refb", border: "box", align: "center", valign: "center", fmt: RS },
    rate: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
    totUsd: { font: "refb", border: "box", valign: "center", fmt: USD },
    totRs: { font: "refb", border: "box", valign: "center", fmt: RS },
    totInr: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
  };
  const H = (v) => ({ v, s: S.head });
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  const firstBand = groups.length ? groups[0] : "";

  const out = [
    [{ v: `PO NO. ${poBannerList(ctx)}`, s: S.banner }, ...Array(12).fill({ v: "", s: S.banner }),
      { v: ddmm(ctx.inv.date), s: S.dateRed }, { v: "", s: S.dateRed },
      { v: "", s: S.banner }, { v: "", s: S.banner }],
    [{ v: "SR. NO.", s: S.headW }, { v: "PO NO.", s: S.headW },
      { v: "CODE ", s: S.headRT }, { v: "GD CODE", s: S.headV }, { v: "GL CODE", s: S.head },
      H("SIZE "), H("LENGTH"), { v: "PACKING ", s: S.headL }, { v: "", s: S.headR },
      { v: "DESCRIPTION", s: S.headT }, { v: "BAR CODES", s: S.headT },
      { v: "QUANTITY", s: S.headL }, { v: "", s: S.headR },
      H("FOB/PC US$"), H(""), H("RBI REFERENCE"), H("")],
    [{ v: "", s: S.headW }, { v: "", s: S.headW },
      { v: firstBand, s: S.bandC }, { v: "", s: S.bandD }, { v: "", s: S.head },
      H("MM / IN"), H("MM"), H("UNIT"), H("BOX"),
      { v: "", s: S.headB }, { v: "", s: S.headB },
      H("PCS"), H("BOX"), H("Unit"), H("Total"),
      { v: "RATE @ Rs.", s: S.rateHd }, { v: ex, t: "n", s: S.rate }],
  ];
  const heights = [undefined, 12.75, undefined];

  let band = firstBand;
  let first = 0;
  let last = 0;
  rows.forEach((r) => {
    const g = String(r.it.group || "").trim();
    if (g && g !== band) {
      band = g;
      out.push([{ v: "", s: S.sr }, { v: "", s: S.po },
        { v: g, s: S.bandC }, { v: "", s: S.bandD }, { v: "", s: S.gdC },
        ...[S.mid, S.mid, S.mid, S.mid, S.desc, S.bar, S.num, S.num, S.usd, S.usd, S.rs, S.inr]
          .map((s) => ({ v: "", s }))]);
      heights.push(15);
    }
    const line = out.length + 1;
    const it = r.it;
    out.push([
      { v: r.range || "", s: S.sr },
      { v: poStack(r.pos), s: S.po },
      { v: it.code || "", s: S.codeC },
      { v: it.gd || "", s: S.code },
      { v: it.gl || "", s: S.gdC },
      { v: it.size || "", s: S.mid },
      { v: it.length || "", s: S.mid },
      { v: it.packUnit || "", s: S.mid },
      { v: r.packing, t: "n", s: S.mid },
      { v: bcDescription(it), s: S.desc },
      { v: String(it.barcode || ""), t: "s", s: S.bar },
      { v: r.pieces, t: "n", s: S.num },
      { f: `$L${line}/$I${line}`, s: S.num },
      { v: r.fobPc, t: "n", s: S.usd },
      { f: `$L${line}*N${line}`, s: S.usd },
      { f: `IF(L${line}=0,0,Q${line}/L${line})`, s: S.rs },
      { f: `O${line}*$Q$3`, s: S.inr },
    ]);
    if (!first) first = line;
    last = line;
    heights.push(25.5);
  });

  const st = (col, style) => ({ f: first ? `SUBTOTAL(9,${col}${first}:${col}${last})` : "0", s: style });
  out.push(rows.length ? [
    null, null, { v: "", s: S.endGd }, { v: "", s: S.end }, { v: "", s: S.endGd },
    { v: "", s: S.endL }, { v: "", s: S.endL }, { v: "", s: S.endL }, { v: "", s: S.endL },
    { v: "", s: S.endR }, { v: "TOTAL", s: S.tot },
    st("L", S.totV), st("M", S.totV), { v: "", s: S.num },
    st("O", S.totUsd), { v: "", s: S.totRs }, st("Q", S.totInr),
  ] : []);

  return fitSheet({
    name: "Sales",
    rows: out,
    heights,
    merges: ["A1:M1", "N1:O1", "A2:A3", "B2:B3", "E2:E3", "H2:I2", "J2:J3", "K2:K3", "L2:M2", "N2:O2", "P2:Q2"],
    widths: [9.140625, 9.140625, 13.42578125, 12.5703125, 13.42578125, 7.7109375, 8.5703125, 6, 6.140625,
      25.140625, 14.28515625, 9.140625, 9.140625, 9.140625, 10.140625, 11.5703125, 13.42578125],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", scale: 40, fit: true, fitH: 0,
      margins: { left: 0.39370078740157499, right: 0.39370078740157499, top: 0.39370078740157499, bottom: 0.39370078740157499, header: 0, footer: 0 },
    },
  });
}

B["9"] = (ctx) => {
  const rows = L(ctx);
  const ex = exRate(ctx);
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  let band = groups.length ? groups[0] : "";
  const usd2 = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rs2 = (n) => `Rs. ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const body = rows.map((r) => {
    const it = r.it;
    const g = String(it.group || "").trim();
    const open = g && g !== band ? (band = g, `<tr class="band"><td></td><td></td>`
      + `<td class="gd" colspan="2">${esc(g)}</td>${"<td></td>".repeat(13)}</tr>`) : "";
    const perPc = r.pieces ? r.rbiTotal / r.pieces : 0;
    return `${open}<tr>
      <td class="c">${esc(r.range)}</td>
      <td class="po">${esc(poStack(r.pos)).replace(/\n/g, "<br>")}</td>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="gdc">${esc(it.gl)}</td>
      <td class="c">${esc(it.size)}</td>
      <td class="c">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc b">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="r" data-t="int" data-v="${r.pieces}">${r.pieces}</td>
      <td class="r" data-t="int" data-f="{qty}/{packbox}">${r.boxes}</td>
      <td class="r" data-t="usd" data-v="${r.fobPc}">${usd2(r.fobPc)}</td>
      <td class="r" data-t="usd" data-f="{qty}*{fobpc}">${usd2(r.fobTotal)}</td>
      <td class="r" data-t="inr" data-v="${perPc}">${rs2(perPc)}</td>
      <td class="r" data-t="inr" data-f="{fobtot}*${ex}">${wbRupee(r.rbiTotal)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">9 · SALES (Supplier)</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="13">PO NO. ${esc(poBannerList(ctx))}</td>
        <td class="red c" colspan="2">${esc(ddmm(ctx.inv.date))}</td><td colspan="2"></td></tr>
      <tr><th rowspan="2">SR. NO.</th><th rowspan="2">PO NO.</th><th>CODE</th><th>GD CODE</th><th rowspan="2">GL CODE</th>
        <th>SIZE</th><th>LENGTH</th><th colspan="2">PACKING</th>
        <th rowspan="2">DESCRIPTION</th><th rowspan="2">BAR CODES</th>
        <th colspan="2">QUANTITY</th><th colspan="2">FOB/PC US$</th><th colspan="2">RBI REFERENCE</th></tr>
      <tr class="hd2"><th class="gd" colspan="2">${esc(groups[0] || "")}</th>
        <th>MM / IN</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th data-k="qty">PCS</th><th data-k="box">BOX</th>
        <th data-k="fobpc">Unit</th><th data-k="fobtot">Total</th>
        <th>RATE @ Rs.</th><th class="r" data-k="rbi">${wbRupee(ex)}</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td>TOTAL</td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "pieces")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="usd" data-sum="fobtot">${usd2(sum(rows, "fobTotal"))}</td>
        <td class="nb"></td>
        <td class="r" data-t="inr" data-sum="rbi">${wbRupee(sum(rows, "rbiTotal"))}</td></tr>
    </table>`;
  return { name: "Sales_9", html, sheet: supplierSalesSheet(ctx, rows) };
};
// Resolve the transport (transporter name + vehicle no) for a supplier on this
// invoice — from the shipment vehicle details, falling back to the packing pick.
function transportInfo(ctx, sid) {
  const v = (ctx.inv.vehicles || {})[sid] || {};
  let name = v.transportName || "", veh = v.vehicleNo || "";
  const tid = v.transportId || (ctx.inv.packingTransports || {})[sid];
  const t = (ctx.transports || []).find((x) => x.id === tid);
  if (!name) {
    name = t?.name || ""; if (!v.vehicleNo && t) veh = veh || "";
  }
  // The transporter's own GST/enrolment id — the e-way form asks for it.
  return { name: name || "—", veh: veh || "—", transportId: t?.transportId || "" };
}
/* Doc 10 · E-way bill (inward) — laid out as the portal's own entry form
   (Docs/Jaikvin Process/Numbering/10-E Way Bill - Format.pdf), so whoever keys
   it in reads the boxes in the order the site asks for them. What the form
   leaves for the operator to type — the supplier's own tax invoice number and
   date, the distance, the truck number, the LR — prints as grey prompts, the
   way their format sheet does.

   The consignment is one line, as the portal takes it: the range's name, the
   four-digit HSN chapter heading, total pieces, and the taxable value. Coming
   from Daman to Maharashtra it is interstate, so the tax is all IGST.       */
const EW_SHIP_TO = {
  name: "ALL CARGO TERMINALS LTD", addr: "NEXT TO AMEYA CFS, JNPT AREA",
  place: "Village Khopta", pin: "410206", state: "MAHARASHTRA",
};
/* The value that turns up most often in a set of lines — what a paper that
   describes a whole consignment in one line has to print for it. */
const commonOf = (arr, pick) => {
  const seen = {};
  arr.forEach((x) => { const k = String(pick(x) || "").trim(); if (k) seen[k] = (seen[k] || 0) + 1; });
  return Object.entries(seen).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
};
/* The form gives the street two lines and the town its own field, so an
   address held as one string is broken at a comma near the middle. */
const ewAddr = (addr) => {
  const parts = String(addr || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return [parts[0] || "", ""];
  let n = 1;                                   // the first part always starts line one
  let len = parts[0].length;
  while (n < parts.length - 1 && len + parts[n].length <= 24) { len += parts[n].length + 2; n += 1; }
  return [`${parts.slice(0, n).join(", ")},`, parts.slice(n).join(", ")];
};
/* What the consignment is called on the bill — the factory's range, not the
   size band a particular line happens to sit in. */
const ewGoods = (arr) => {
  const rule = commonOf(arr, (x) => x.it.stickerRule || "pp");
  if (rule === "grn") return "NYLON MOULDED FITTINGS";
  if (rule === "oswin") return "PP EXTRUDED PIPES";
  return "PP MOULDED FITTINGS";
};

function eway10Block(ctx, sid, arr) {
  const sp = supFor(ctx, sid);
  const tr = transportInfo(ctx, sid);
  const qty = sum(arr, "pieces");
  const taxable = sum(arr, "valTotal");
  const igst = Math.round(taxable * 0.18 * 100) / 100;
  const goods = ewGoods(arr);
  const hsn = (commonOf(arr, (x) => x.it.hsn) || "").slice(0, 4);
  const [sAddr1, sAddr2] = ewAddr(sp.addr);
  const money = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const box = (v, cls = "") => `<td class="fld ${cls}">${v === "" ? "&nbsp;" : v}</td>`;
  const ph = (v) => `<td class="fld ph">${esc(v)}</td>`;

  const party = (title, right, name, gstin, state, addr1, addr2, place, pin, pinState) => `
      <tr><td class="hd" colspan="2">${title}</td><td class="hd" colspan="3">${right}</td></tr>
      <tr><td class="lbl">Name</td>${box(esc(name))}<td class="lbl">Address</td>${box(esc(addr1), "wide")}<td></td></tr>
      <tr><td class="lbl">GSTIN</td>${box(esc(gstin))}<td class="lbl"></td>${box(esc(addr2), "wide")}<td></td></tr>
      <tr><td class="lbl">State</td>${box(esc(state))}<td class="lbl">Place</td>${box(esc(place), "wide")}<td></td></tr>
      <tr><td></td><td></td><td class="lbl">Pincode</td>${box(esc(pin))}${box(esc(pinState), "c")}</tr>`;

  return `<div class="ew">
    <table class="ewtop"><tr><td class="b">EWAY BILL FORMAT</td>
      <td class="c">E - WAY BILL SYSTEM<br>e - WayBill Entry Form</td></tr></table>

    <div class="lbl">Transaction details</div>
    <table class="ewband"><tr>
      <td class="b">Transaction&nbsp; Type</td><td class="i">Outward</td><td class="i on">Inward</td>
      <td class="b">Sub Type</td><td class="i on">Supply</td><td class="i">Export</td><td class="i">Job Work</td>
      <td class="i">SKD / CKD</td><td class="i">Recipient Not Known</td><td class="i">For Own Use</td>
      <td class="i">Exhibition Or Fairs</td><td class="i">Line Sales</td><td class="i">Others</td></tr></table>

    <table class="ewline"><tr>
      <td class="lbl">Document Type</td>${ph("Tax Invoice")}
      <td class="lbl">Document No</td>${ph("Your Tax Invoice No")}
      <td class="lbl">Document Date</td>${ph("Your Tax Invoice Date")}</tr></table>

    <table class="ewgrid">
      ${party("Bill From", "Despatch From", sp.name, sp.gstin, sp.state || "DAMAN AND DIU",
    sAddr1, sAddr2, sp.place, sp.pin, sp.state || "DAMAN AND DIU")}
      <tr class="gap"><td colspan="5"></td></tr>
      ${party("Bill To", "Ship To", ctx.EXPORTER.name, ctx.EXPORTER.gstin, "MAHARASHTRA",
    EW_SHIP_TO.name, EW_SHIP_TO.addr, EW_SHIP_TO.place, EW_SHIP_TO.pin, EW_SHIP_TO.state)}
    </table>

    <div class="lbl">Item Details</div>
    <table class="ewitems">
      <tr class="hd"><td>Product Name</td><td>Descripton</td><td>HSN</td><td>Quantity</td><td>Unit</td>
        <td>Value/Taxable<br>Value(RS)</td><td colspan="4">Tax Rate (C+S+I+C)</td></tr>
      <tr>${box(esc(goods))}${box(esc(goods))}${box(esc(hsn), "c")}${box(qty, "c")}${box("PCS", "c")}
        ${box(money(taxable), "c")}${box("0.00", "c")}${box("0.00", "c")}${box("18.00", "c")}${box("0.00", "c")}</tr>
    </table>

    <table class="ewtot">
      <tr class="hd"><td>Total Amt / Taxable Amt</td><td>CGST Amount</td><td>SGST Amount</td>
        <td>IGST Amount</td><td>CESS Amount</td><td>Total Inv . Value</td></tr>
      <tr>${box(money(taxable), "c")}${box("0.00", "c")}${box("0.00", "c")}
        ${box(money(igst), "c")}${box("0.00", "c")}${box(money(taxable + igst), "c")}</tr>
    </table>

    <div class="lbl">Transportation Details</div>
    <table class="ewline"><tr>
      <td class="lbl">Transpoter Name</td>${box(esc(tr.name === "—" ? "" : tr.name), "c")}
      <td class="lbl">Transpoter ID</td>${box(esc(tr.transportId || ""), "c")}
      <td class="lbl">Approximate Distance (inKM)</td>${box("", "c")}</tr></table>

    <div class="lbl">PART - B</div>
    <table class="ewpart">
      <tr><td class="lbl">Mode</td><td class="fld c on">Road</td><td class="fld c">Rail</td><td class="fld c">Air</td><td class="fld c">Ship</td></tr>
      <tr><td class="lbl">Vehicle Type</td><td class="fld c on">Regular</td><td class="fld c" colspan="3">Over Dimensional Cargo</td></tr>
      <tr><td class="lbl">Vehicle No</td>${tr.veh && tr.veh !== "—"
    ? `<td class="fld c" colspan="4">${esc(tr.veh)}</td>`
    : `<td class="fld c ph" colspan="4">Please give the Truck Number Here</td>`}</tr>
      <tr><td class="lbl">Transpoter Doc. No &amp; Date</td><td class="fld c ph" colspan="2">LR Number</td>
        <td class="fld c ph" colspan="2">LR Date</td></tr>
    </table>
  </div>`;
}
/* The same form as a worksheet. Thirteen columns carry every band of it: the
   thirteen transaction-type options set the grid, and each of the other bands
   is a run of merged cells across the same thirteen — which is what keeps the
   boxes under one another instead of each table finding its own edges.

   The figures are live: the item's taxable value drives the IGST and the
   invoice total, so an operator who corrects a quantity or a value in the
   sheet before keying it in sees the tax follow.                            */
const EW = {                                     // the form's own styles
  b: { font: "refb", border: false, valign: "center" },
  lbl: { font: "ref", border: false, valign: "center" },
  lblW: { font: "ref", border: false, valign: "center", wrap: true },
  hd: { font: "ref", border: false, valign: "bottom" },
  hdC: { font: "ref", border: false, align: "center", valign: "bottom", wrap: true },
  sys: { font: "ref", border: false, align: "center", valign: "center" },
  fld: { font: "ref", border: "box", valign: "center", wrap: true },
  fldC: { font: "ref", border: "box", align: "center", valign: "center", wrap: true },
  ph: { font: "refgy", border: "box", valign: "center", wrap: true },
  phC: { font: "refgy", border: "box", align: "center", valign: "center", wrap: true },
  num: { font: "ref", border: "box", align: "center", valign: "center", fmt: "int" },
  money: { font: "ref", border: "box", align: "center", valign: "center", fmt: "num" },
  bandB: { font: "refb", border: "tb", align: "center", valign: "center", wrap: true },
  bandI: { font: "refi", border: "tb", align: "center", valign: "center", wrap: true },
  bandOn: { font: "refb", border: "tb", align: "center", valign: "center", wrap: true },
  optOn: { font: "refb", border: "box", align: "center", valign: "center" },
  opt: { font: "refi", border: "box", align: "center", valign: "center" },
};
function eway10Sheet(ctx, sid, arr) {
  const sp = supFor(ctx, sid);
  const tr = transportInfo(ctx, sid);
  const goods = ewGoods(arr);
  const hsn = (commonOf(arr, (x) => x.it.hsn) || "").slice(0, 4);
  const [sAddr1, sAddr2] = ewAddr(sp.addr);
  const G = formGrid(13);
  const { row, gap } = G;
  const cell = (v, s, extra) => [1, { v, s, ...extra }];
  const run = (span, v, s, extra) => [span, { v, s, ...extra }];

  /* Bill From / Bill To — label, box, label, box, and the state at the right,
     the five fields the portal puts on each of these lines. */
  const party = (title, right, p) => {
    row([run(5, title, EW.hd), run(8, right, EW.hd)]);
    row([run(2, "Name", EW.lbl), run(3, p.name, EW.fld), run(1, "Address", EW.lbl), run(5, p.addr1, EW.fld), run(2, "", EW.lbl)]);
    row([run(2, "GSTIN", EW.lbl), run(3, p.gstin, EW.fld), run(1, "", EW.lbl), run(5, p.addr2, EW.fld), run(2, "", EW.lbl)]);
    row([run(2, "State", EW.lbl), run(3, p.state, EW.fld), run(1, "Place", EW.lbl), run(5, p.place, EW.fld), run(2, "", EW.lbl)]);
    row([run(2, "", EW.lbl), run(3, "", EW.lbl), run(1, "Pincode", EW.lbl), run(5, p.pin, EW.fld), run(2, p.pinState, EW.fldC)]);
  };

  row([run(4, "EWAY BILL FORMAT", EW.b), run(3, "", EW.lbl), run(6, "E - WAY BILL SYSTEM", EW.sys)]);
  row([run(7, "", EW.lbl), run(6, "e - WayBill Entry Form", EW.sys)]);
  gap();
  row([run(4, "Transaction details", EW.lbl)]);
  row([cell("Transaction  Type", EW.bandB), cell("Outward", EW.bandI), cell("Inward", EW.bandOn),
    cell("Sub Type", EW.bandB), cell("Supply", EW.bandOn), cell("Export", EW.bandI), cell("Job Work", EW.bandI),
    cell("SKD / CKD", EW.bandI), cell("Recipient Not Known", EW.bandI), cell("For Own Use", EW.bandI),
    cell("Exhibition Or Fairs", EW.bandI), cell("Line Sales", EW.bandI), cell("Others", EW.bandI)]);
  gap();
  row([run(2, "Document Type", EW.lbl), run(3, "Tax Invoice", EW.ph),
    run(2, "Document No", EW.lbl), run(2, "Your Tax Invoice No", EW.ph),
    run(2, "Document Date", EW.lbl), run(2, "Your Tax Invoice Date", EW.ph)]);
  gap();

  party("Bill From", "Despatch From", {
    name: sp.name || "", gstin: sp.gstin || "", state: sp.state || "DAMAN AND DIU",
    addr1: sAddr1, addr2: sAddr2, place: sp.place || "", pin: sp.pin || "", pinState: sp.state || "DAMAN AND DIU",
  });
  gap(9);
  party("Bill To", "Ship To", {
    name: ctx.EXPORTER.name, gstin: ctx.EXPORTER.gstin, state: "MAHARASHTRA",
    addr1: EW_SHIP_TO.name, addr2: EW_SHIP_TO.addr, place: EW_SHIP_TO.place,
    pin: EW_SHIP_TO.pin, pinState: EW_SHIP_TO.state,
  });
  gap();

  row([run(4, "Item Details", EW.lbl)]);
  row([run(2, "Product Name", EW.hdC), run(2, "Descripton", EW.hdC), run(1, "HSN", EW.hdC),
    run(1, "Quantity", EW.hdC), run(1, "Unit", EW.hdC), run(2, "Value/Taxable\nValue(RS)", EW.hdC),
    run(4, "Tax Rate (C+S+I+C)", EW.hdC)], 26);
  const item = G.at() + 1;
  row([run(2, goods, EW.fld), run(2, goods, EW.fld), run(1, hsn, EW.fldC, { t: "s" }),
    run(1, sum(arr, "pieces"), EW.num, { t: "n" }), run(1, "PCS", EW.fldC),
    run(2, sum(arr, "valTotal"), EW.money, { t: "n" }),
    run(1, 0, EW.money, { t: "n" }), run(1, 0, EW.money, { t: "n" }),
    run(1, 18, EW.money, { t: "n" }), run(1, 0, EW.money, { t: "n" })], 25.5);
  gap();

  row([run(3, "Total Amt / Taxable Amt", EW.hdC), run(2, "CGST Amount", EW.hdC), run(2, "SGST Amount", EW.hdC),
    run(2, "IGST Amount", EW.hdC), run(2, "CESS Amount", EW.hdC), run(2, "Total Inv . Value", EW.hdC)]);
  const tot = G.at() + 1;
  row([[3, { f: `H${item}`, s: EW.money }], run(2, 0, EW.money, { t: "n" }), run(2, 0, EW.money, { t: "n" }),
    [2, { f: `ROUND(H${item}*L${item}/100,2)`, s: EW.money }], run(2, 0, EW.money, { t: "n" }),
    [2, { f: `A${tot}+D${tot}+F${tot}+H${tot}+J${tot}`, s: EW.money }]]);
  gap();

  row([run(4, "Transportation Details", EW.lbl)]);
  row([run(2, "Transpoter Name", EW.lbl), run(3, tr.name === "—" ? "" : tr.name, EW.fldC),
    run(2, "Transpoter ID", EW.lbl), run(2, tr.transportId || "", EW.fldC),
    run(2, "Approximate Distance (inKM)", EW.lblW), run(2, "", EW.fldC)]);
  gap();

  row([run(4, "PART - B", EW.lbl)]);
  row([run(3, "Mode", EW.lbl), run(3, "Road", EW.optOn), run(3, "Rail", EW.opt), run(2, "Air", EW.opt), run(2, "Ship", EW.opt)]);
  row([run(3, "Vehicle Type", EW.lbl), run(3, "Regular", EW.optOn), run(7, "Over Dimensional Cargo", EW.opt)]);
  const veh = tr.veh && tr.veh !== "—";
  row([run(3, "Vehicle No", EW.lbl), run(10, veh ? tr.veh : "Please give the Truck Number Here", veh ? EW.fldC : EW.phC)]);
  row([run(3, "Transpoter Doc. No & Date", EW.lbl), run(5, "LR Number", EW.phC), run(5, "LR Date", EW.phC)]);

  return fitSheet({
    name: "E-way",
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: [12, 10, 10, 10, 10, 12, 10, 10, 12, 12, 12, 10, 12],
    defaultRowHeight: 15,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", fit: true, fitH: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

// Supplier-wise e-way documents (one per supplier) — for the split download.
export function ewaySupplierDocs(ctx) {
  const lines = L(ctx), bySup = {}; lines.forEach((x) => { (bySup[x.supId] = bySup[x.supId] || []).push(x); });
  return Object.entries(bySup).map(([sid, arr]) => {
    const sp = supFor(ctx, sid);
    return {
      supplierId: sid, code: sp.code || sid, name: sp.name || sid,
      docName: `Eway_Purchase_10_${(sp.code || sid).replace(/[^A-Za-z0-9]+/g, "_")}`,
      html: eway10Block(ctx, sid, arr),
      sheets: [eway10Sheet(ctx, sid, arr)],
    };
  });
}
B["10"] = (ctx) => {
  const docs = ewaySupplierDocs(ctx);
  return {
    name: "Eway_Purchase_10",
    html: docs.map((d) => d.html).join("<br>"),
    sheets: docs.map((d) => ({ ...d.sheets[0], name: docs.length > 1 ? `${d.code} E-way` : "E-way" })),
  };
};
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
/* Doc 11 · Despatch Instructions — the letter each factory receives telling it
   how to send the goods (Docs/Jaikvin Process/Numbering/11-Despatch
   Instructions.pdf). On the letterhead, and addressed to one supplier, so it is
   raised supplier by supplier like the supplier order and the e-way bill.

   Everything the client highlights on their copy is what changes per despatch —
   the reference and date, the export orders, the despatch day, and the marks
   and package count — and every one of those is filled from the invoice here.
   The five instructions themselves are their standing terms, printed as they
   stand.                                                                    */
const CFS = {
  agent: "Velji Dosabhai & Sons Pvt. Ltd.",
  lines: ["All Cargo Terminals Ltd (Transindia Logistics Pvt Ltd),",
    "Next To Ameya CFS, Village Khopta, JNPT Area, Raigad-410 206."],
  contacts: "Mr Ganpat Shinde Mobile: 9867873029 / Mr Gorakh Mobile: 9321349118 / Mr. Khandu Mobile : 7498802940",
};
const LETTER_DAY = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return `${d.toLocaleDateString("en-GB", { weekday: "long" }).toUpperCase()}, ${ddmm(s)}`;
};
const LETTER_DATE = (s) => (s ? new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
const letterRef = (ctx) => {
  const yr = new Date(ctx.inv.date).getFullYear();
  const n = String(ctx.inv.invoiceNo || "").match(/\d+/);
  return `JG/${yr}/${n ? n[0].slice(-4) : "DI"}`;
};

/* The marking line: the buyer's mark, the serial run this supplier's boxes
   carry, and how many packages that comes to. */
function despatchMarks(ctx, arr) {
  const s = ctx.inv.ship || {};
  const mark = (s.marks || "G.D.W").replace(/[\d\s.–-]+$/, "").trim() || "G.D.W";
  const from = String(arr[0]?.range || "").split("-")[0] || "";
  const to = String(arr[arr.length - 1]?.range || "").split("-").pop() || "";
  const pkgs = sum(arr, "boxes");
  const kinds = s.pkgs ? ` (${s.pkgs})` : "";
  return `All Packages to be marked as ${mark}${from ? ` ${from} – ${to}` : ""} / ${pkgs} Packages${kinds}`;
}

/* The letterhead itself — the name in Centaur maroon with the mark against the
   right margin, the rule in the house red, and the contact strip along the
   foot. Both letters in the library are printed on it. */
const letterheadBlock = (E) => `<table class="dlhead"><tr>
      <td><div class="brand">${esc(E.name)}</div><div class="sub">${esc(E.sub || "Merchant Exporters")}</div></td>
      <td class="lg"><img src="${LOGO_SRC}" alt=""></td></tr></table>
    <div class="rule"></div>`;
const letterFootBlock = (E) => `<div class="rule"></div>
    <table class="dlfoot"><tr>
      <td><div>${esc(E.iec)}</div><div class="b">${esc(E.gstin)}</div></td>
      <td class="r"><div>+91-${esc(E.tel)}</div><div class="b">${esc(E.email)}</div><div>${esc(E.addr)}</div></td>
    </tr></table>`;

/* Both letters that end this way — the undertaking, then the signature over
   the printed name, then the date and the space for the signature itself. */
function letterSignRows(G, ctx, E) {
  G.row([[3, { v: "", s: DL.body }], [3, { v: `For M/s. ${E.name}`, s: DL.body }]]);
  G.gap(18);
  G.gap(18);
  G.row([[3, { v: "", s: DL.body }], [3, { v: `Proprietor- ${SIGNATORY}`, s: DL.body }]]);
  G.row([[2, { v: `Date   :   ${ddmm(ctx.inv.date)}`, s: DL.body }], [2, { v: "Signature   :", s: DL.body }], [2, { v: "", s: DL.body }]]);
  G.gap();
}
const letterFieldBlock = (label, value) => `<table class="fld"><tr>
      <td class="lbl">${esc(label)}</td><td class="b">${esc(value)}</td></tr></table>`;
const letterSignBlock = (ctx, E) => `<p class="sign">For M/s. ${esc(E.name)}<br>Proprietor- ${esc(SIGNATORY)}</p>
    <p>Date &nbsp; : &nbsp; ${ddmm(ctx.inv.date)} &nbsp;&nbsp;&nbsp;&nbsp; Signature &nbsp; :</p>`;

function despatch11Block(ctx, sid, arr) {
  const sp = supFor(ctx, sid);
  const E = ctx.EXPORTER;
  const [addr1, addr2] = ewAddr(sp.addr);
  // The town is only added if the street lines have not already named it.
  const place = String(sp.place || "");
  const named = place && addr2.toLowerCase().includes(place.toLowerCase());
  const to = [`Messrs. ${sp.name || ""},`, addr1, [addr2, named ? "" : place, sp.pin].filter(Boolean).join(" ").replace(/\s+/g, " ")]
    .filter(Boolean).map(esc).join("<br>");

  const step = (n, body) => `<tr><td class="n">${n})</td><td>${body}</td></tr>`;
  return `<div class="dl">
    ${letterheadBlock(E)}

    <div class="ref">${esc(letterRef(ctx))}<br>${esc(LETTER_DATE(ctx.inv.date))}</div>
    <p class="to">${to}</p>
    <p class="refline"><span class="k">Ref</span>&nbsp;&nbsp;&nbsp;Our Export Order ${esc(poBannerList(ctx))}</p>
    <p class="b">DESPATCH DATE: ${esc(LETTER_DAY(ctx.inv.date))}</p>
    <p>With reference to the above, we give hereunder the dispatch instructions:</p>

    <table class="ins">
      ${step(1, esc(despatchMarks(ctx, arr)))}
      ${step(2, "Book the consignment for delivery at JNPT/Dhronagiri (Door Delivery)")}
      ${step(3, `Lorry receipt to be made in our name a/c. M/s. ${esc(CFS.agent)} Mumbai, on freight to pay.`)}
      ${step(4, "L/R to show goods for export")}
      ${step(5, `Goods to be delivered at:<br>Messrs ${esc(CFS.agent)},<br>${CFS.lines.map(esc).join("<br>")}`
    + `<br>Person to contact: ${esc(CFS.contacts)}`
    + `<br>They will assist them to off-load the cargo. All the contacts are of the representative of M/s. ${esc(CFS.agent)}`)}
    </table>

    <p>We hope the matter is clear and awaiting your early response.&nbsp; Upon dispatch of the goods send us your Invoice.</p>
    <p>Thanking you,</p>
    <p>Yours faithfully,<br>For ${esc(E.name)},</p>
    <p class="sign">Proprietor</p>

    ${letterFootBlock(E)}
  </div>`;
}

/* The same letter as a worksheet — six columns: a narrow one for the numbers
   of the instructions, four for the body, and the last for what the footer
   sets against the right margin. Nothing here is a table, so the sheet is the
   letter's own blocks laid on that grid, the mark anchored top right and the
   two rules drawn in the letterhead's red. */
const DL = {
  brand: { font: "brand", border: false, valign: "center" },
  sub: { font: "brands", border: false, valign: "center" },
  rule: { font: "base", border: "b#C00000", valign: "center" },
  body: { font: "base", border: false, valign: "top", wrap: true },
  b: { font: "letb", border: false, valign: "top", wrap: true },
  key: { font: "base", border: false, valign: "top" },
  n: { font: "base", border: false, align: "left", valign: "top" },
  mid: { font: "base", border: false, align: "center", valign: "top", wrap: true },
  midB: { font: "letb", border: false, align: "center", valign: "top" },
  bx: { font: "base", border: "box", valign: "center", wrap: true },
  // The declarations are typed to both margins, as their copies are.
  just: { font: "base", border: false, valign: "top", wrap: true, align: "justify" },
  foot: { font: "letmn", border: false, valign: "center" },
  footB: { font: "letmnb", border: false, valign: "center" },
  footR: { font: "letmn", border: false, align: "right", valign: "center" },
  footRB: { font: "letmnb", border: false, align: "right", valign: "center" },
};
/* The same letterhead on the worksheet side: the masthead rows, the contact
   strip, and the paper both letters are set up on. */
function letterheadRows(G, E) {
  G.row([[4, { v: E.name, s: DL.brand }], [2, { v: "", s: DL.brand }]], 30);
  G.row([[4, { v: E.sub || "Merchant Exporters", s: DL.sub }], [2, { v: "", s: DL.sub }]], 16);
  G.row([[6, { v: "", s: DL.rule }]], 6);
  G.gap(6);
}
function letterFootRows(G, E) {
  G.row([[6, { v: "", s: DL.rule }]], 6);
  G.row([[3, { v: E.iec, s: DL.foot }], [3, { v: `+91-${E.tel}`, s: DL.footR }]]);
  G.row([[3, { v: E.gstin, s: DL.footB }], [3, { v: E.email, s: DL.footRB }]]);
  // The address is longer than the half-row it sits in on paper; a merged cell
  // clips rather than runs on, so it takes the width of the sheet.
  G.row([[6, { v: E.addr, s: { ...DL.footR, wrap: true } }]]);
}
function letterSheet(name, G) {
  const mark = logoImage();
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: [6, 18, 18, 18, 18, 18],
    defaultRowHeight: 14.25,
    colStyle: { font: "base", border: false, valign: "top" },
    // Top right of the letterhead, level with the exporter's name.
    image: mark ? { ...mark, col: 5, colOff: 190500, row: 0, rowOff: 19050, cy: 533400, cx: Math.round(533400 * (172 / 165)) } : null,
    page: {
      paper: 9, orientation: "portrait", fit: true, fitH: 0,
      margins: { left: 0.6, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

function despatch11Sheet(ctx, sid, arr) {
  const sp = supFor(ctx, sid);
  const E = ctx.EXPORTER;
  const [addr1, addr2] = ewAddr(sp.addr);
  const place = String(sp.place || "");
  const named = place && addr2.toLowerCase().includes(place.toLowerCase());
  const to = [`Messrs. ${sp.name || ""},`, addr1,
    [addr2, named ? "" : place, sp.pin].filter(Boolean).join(" ").replace(/\s+/g, " ")].filter(Boolean);

  const G = formGrid(6);
  const { row, gap } = G;
  const line = (text, s = DL.body) => row([[6, { v: text, s }]]);
  const step = (n, text) => row([[1, { v: `${n})`, s: DL.n }], [5, { v: text, s: DL.body }]]);

  letterheadRows(G, E);

  line(letterRef(ctx));
  line(LETTER_DATE(ctx.inv.date));
  gap();
  to.forEach((l) => line(l));
  gap();
  row([[1, { v: "Ref", s: DL.key }], [5, { v: `Our Export Order ${poBannerList(ctx)}`, s: DL.body }]]);
  gap();
  line(`DESPATCH DATE: ${LETTER_DAY(ctx.inv.date)}`, DL.b);
  gap();
  line("With reference to the above, we give hereunder the dispatch instructions:");
  gap();

  step(1, despatchMarks(ctx, arr));
  step(2, "Book the consignment for delivery at JNPT/Dhronagiri (Door Delivery)");
  step(3, `Lorry receipt to be made in our name a/c. M/s. ${CFS.agent} Mumbai, on freight to pay.`);
  step(4, "L/R to show goods for export");
  step(5, [`Goods to be delivered at:`, `Messrs ${CFS.agent},`, ...CFS.lines,
    `Person to contact: ${CFS.contacts}`,
    `They will assist them to off-load the cargo. All the contacts are of the representative of M/s. ${CFS.agent}`].join("\n"));
  gap();

  line("We hope the matter is clear and awaiting your early response.  Upon dispatch of the goods send us your Invoice.");
  gap();
  line("Thanking you,");
  gap();
  line("Yours faithfully,");
  line(`For ${E.name},`);
  gap(18);
  gap(18);
  line("Proprietor");
  gap();

  letterFootRows(G, E);
  return letterSheet("Despatch", G);
}

/* One despatch instruction per supplier — for the split download. */
export function despatchSupplierDocs(ctx) {
  const lines = L(ctx), bySup = {};
  lines.forEach((x) => { (bySup[x.supId] = bySup[x.supId] || []).push(x); });
  return Object.entries(bySup).map(([sid, arr]) => {
    const sp = supFor(ctx, sid);
    return {
      supplierId: sid, code: sp.code || sid, name: sp.name || sid,
      docName: `Despatch_Instructions_11_${(sp.code || sid).replace(/[^A-Za-z0-9]+/g, "_")}`,
      html: despatch11Block(ctx, sid, arr),
      sheets: [despatch11Sheet(ctx, sid, arr)],
    };
  });
}

B["11"] = (ctx) => {
  const docs = despatchSupplierDocs(ctx);
  return {
    name: "Despatch_Instructions_11",
    html: docs.map((d) => d.html).join('<div class="pgbrk"></div>'),
    sheets: docs.map((d) => ({ ...d.sheets[0], name: docs.length > 1 ? `${d.code} Despatch` : "Despatch" })),
    page: "portrait",
  };
};

/* ---------- Stage C · Pre-shipment (12–29) ---------- */

/* Doc 12 · Shipment boxes & volume — against 12-Shipment Boxes & volume.xlsx.

   Their sheet is the container weighed and valued: a line for every range a
   factory sent, that factory's lines totalled under them, and the whole
   shipment totalled at the foot — then the container's capacity in cubic
   metres and what is still free.

   Three cells drive the arithmetic and they sit in the heading, exactly where
   their sheet keeps them: the GST rate on the purchase (I1), the GST rate on
   the sale (M1) and the day's exchange rate (O1). Every line points at those,
   so correcting one re-values the sheet — which is the whole reason the client
   works in this file rather than reading a printout.

   The last two columns are the check the sheet exists for: O is the sales
   value converted at that rate and P is what it differs from the rupee figure
   the papers were raised at.                                              */

/* Their accounting format — figures aligned on the decimal, a dash for nil. */
const ACC = '_ * #,##0.00_ ;_ * \\-#,##0.00_ ;_ * "-"??_ ;_ @_ ';
/* A 20ft container's usable volume. Their sheet types it in and takes the
   balance off it, so it stays a cell the client can overwrite for a 40ft. */
const CONTAINER_CBM = 29;

const BV = {                                     // 12 · their sheet's styles
  hd: { font: "calb", fill: "grey", border: "box", valign: "center" },
  hdC: { font: "calb", fill: "grey", border: "box", align: "center", valign: "center", wrap: true },
  hdPct: { font: "calb", fill: "grey", border: "box", align: "center", valign: "center", fmt: "0%" },
  hdRate: { font: "calb", fill: "grey", border: "box", align: "center", valign: "center", fmt: "0.00" },
  lbl: { font: "calb", fill: "grey", border: "box" },
  hsn: { font: "calb", fill: "grey", border: "box", fmt: "0.0000" },
  band: { font: "calb", fill: "grey", border: "box" },
  int: { font: "cal", border: "box", fmt: "0" },
  vol: { font: "cal", border: "box", fmt: "0.00" },
  wt: { font: "cal", border: "box", fmt: "0.000" },
  acc: { font: "cal", border: "box", fmt: ACC },
  tInt: { font: "calb", fill: "grey", border: "box", fmt: "0" },
  tVol: { font: "calb", fill: "grey", border: "box", fmt: "0.00" },
  tWt: { font: "calb", fill: "grey", border: "box", fmt: "0.000" },
  tAcc: { font: "calb", fill: "grey", border: "box", fmt: ACC },
};

/* A block per factory, a line per range inside it — OSWIN on its own, VP as
   VP-PP and VP-GRN, which is how their column A reads. */
function boxVolBlocks(ctx) {
  const bySup = new Map();
  L(ctx).forEach((x) => {
    if (!bySup.has(x.supId)) bySup.set(x.supId, { code: x.sup.code || x.supId, ranges: new Map() });
    const b = bySup.get(x.supId);
    const key = (x.it.stickerRule || "pp") === "grn" ? "GRN" : "PP";
    if (!b.ranges.has(key)) b.ranges.set(key, { key, hsn: [], box: 0, vol: 0, qty: 0, net: 0, gross: 0, pur: 0, usd: 0, inr: 0 });
    const g = b.ranges.get(key);
    g.hsn.push(x.it.hsn);
    g.box += x.boxes; g.vol += x.volTotal; g.qty += x.pieces;
    g.net += x.netTotal; g.gross += x.grossTotal;
    g.pur += x.valTotal; g.usd += x.fobTotal; g.inr += x.rbiTotal;
  });
  return [...bySup.values()].map((b) => ({
    code: b.code,
    rows: [...b.ranges.values()]
      .sort((p, q) => (p.key === q.key ? 0 : p.key === "PP" ? -1 : 1))
      .map((g) => {
        // One line stands for a whole range, so it takes the range's own HSN.
        const raw = commonOf(g.hsn, (h) => h);
        return {
          ...g,
          label: b.ranges.size > 1 ? `${b.code}-${g.key}` : b.code,
          hsn: hsnValue({ hsn: raw }),
          hsnText: raw,
        };
      }),
  }));
}

function boxesVolumeSheet(ctx, blocks, ex) {
  const H = (v) => ({ v, s: BV.hdC });
  const out = [[
    { v: "", s: BV.hd }, { v: "HSN", s: BV.hd }, H("BOX"), H("VOLUME"), H("QUANTITY"), H("NET WT"), H("GROSS WT"),
    H("Taxable Purchase"), { v: 0.18, t: "n", s: BV.hdPct }, H("Total Pur value"),
    H("Taxable Sales (USD)"), H("Taxable Sales (INR)"), { v: 0.18, t: "n", s: BV.hdPct }, H("Total Sale value"),
    { v: ex, t: "n", s: BV.hdRate }, H("DIFF"),
  ]];
  const heights = [30];

  const blank = () => Array(16).fill(null).map(() => ({ v: "", s: BV.band }));
  const totals = [];                       // the row each block totals on
  blocks.forEach((b) => {
    const first = out.length + 1;
    b.rows.forEach((g) => {
      const r = out.length + 1;
      out.push([
        { v: g.label, s: BV.lbl },
        g.hsn == null ? { v: g.hsnText, s: { ...BV.hsn, fmt: undefined } } : { v: g.hsn, t: "n", s: BV.hsn },
        { v: g.box, t: "n", s: BV.int },
        { v: g.vol, t: "n", s: BV.vol },
        { v: g.qty, t: "n", s: BV.int },
        { v: g.net, t: "n", s: BV.wt },
        { v: g.gross, t: "n", s: BV.wt },
        { v: g.pur, t: "n", s: BV.acc },
        { f: `H${r}*$I$1`, s: BV.acc },
        { f: `H${r}+I${r}`, s: BV.acc },
        { v: g.usd, t: "n", s: BV.acc },
        { v: g.inr, t: "n", s: BV.acc },
        { f: `L${r}*$M$1`, s: BV.acc },
        { f: `L${r}+M${r}`, s: BV.acc },
        { f: `K${r}*$O$1`, s: BV.acc },
        { f: `L${r}-O${r}`, s: BV.acc },
      ]);
    });
    const last = out.length;
    const sumOf = (col, style) => ({ f: `SUM(${col}${first}:${col}${last})`, s: style });
    out.push([
      { v: "TOTAL", s: BV.lbl }, { v: "", s: BV.lbl },
      sumOf("C", BV.tInt), sumOf("D", BV.tVol), sumOf("E", BV.tInt), sumOf("F", BV.tWt), sumOf("G", BV.tWt),
      ..."HIJKLMNOP".split("").map((c) => sumOf(c, BV.tAcc)),
    ]);
    totals.push(out.length);
    out.push(blank());
  });

  const add = (col, style) => (totals.length
    ? { f: totals.map((r) => `${col}${r}`).join("+"), s: style }
    : { v: "", s: style });
  out.push([
    { v: "TOTAL", s: BV.lbl }, { v: "", s: BV.lbl },
    add("C", BV.tInt), add("D", BV.tVol), add("E", BV.tInt), add("F", BV.tWt), add("G", BV.tWt),
    ..."HIJKLMNOP".split("").map((c) => add(c, BV.tAcc)),
  ]);
  const grand = out.length;

  const foot = (label, cell) => {
    const row = Array(16).fill(null).map(() => ({ v: "", s: BV.band }));
    row[0] = { v: label, s: BV.lbl };
    row[3] = cell;
    out.push(row);
    return out.length;
  };
  const cap = foot("CAPACITY", { v: CONTAINER_CBM, t: "n", s: BV.tVol });
  foot("BALANCE", { f: `D${cap}-D${grand}`, s: BV.tVol });

  /* Their widths are the design and the headings are wrapped to fit them, so
     the sheet is not re-measured. Only the label column is: their factories
     are OSWIN and KP, ours can be VPPlastics-GRN. */
  const label = out.reduce((m, r) => Math.max(m, String(r[0]?.v ?? "").length), 8);
  return fitSheet({
    name: "Boxes & volume",
    rows: out,
    heights,
    widths: [Math.max(9.85546875, label + 1.5), 10.42578125, 9.140625, 9.140625, 9.140625, 9.140625, 9.140625,
      16, 13.28515625, 13.85546875, 12.85546875, 12.5703125, 12.28515625, 12.5703125, 12.85546875, 13.5703125],
    defaultColWidth: 9.140625,
    defaultRowHeight: 15,
    colStyle: { font: "cal", border: false },
    freeze: 1,
    /* Their copy was never set up to print — A4 portrait, default margins —
       and sixteen columns do not go on portrait paper. It is turned and fitted
       to one page across, which is how the PDF of it prints too. */
    page: {
      paper: 9, orientation: "landscape", fit: true, fitH: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

B["12"] = (ctx) => {
  const ex = exRate(ctx);
  const blocks = boxVolBlocks(ctx);
  const acc = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cell = (v, t, val) => `<td class="r" data-t="${t}" data-v="${val}">${v}</td>`;
  const money = (n) => cell(acc(n), "num", n);

  const lineRow = (g) => `<tr>
      <td class="g b">${esc(g.label)}</td>
      <td class="g b r">${esc(g.hsn == null ? g.hsnText : g.hsn.toFixed(4))}</td>
      ${cell(g.box, "int", g.box)}
      ${cell(wbFixed(g.vol, 2), "num", g.vol)}
      ${cell(g.qty, "int", g.qty)}
      ${cell(wbFixed(g.net, 3), "num3", g.net)}
      ${cell(wbFixed(g.gross, 3), "num3", g.gross)}
      ${money(g.pur)}${money(g.pur * 0.18)}${money(g.pur * 1.18)}
      ${money(g.usd)}${money(g.inr)}${money(g.inr * 0.18)}${money(g.inr * 1.18)}
      ${money(g.usd * ex)}${money(g.inr - g.usd * ex)}
    </tr>`;

  const totalRow = (label, rows) => {
    const t = (k) => rows.reduce((s, g) => s + (Number(g[k]) || 0), 0);
    const g = { box: t("box"), vol: t("vol"), qty: t("qty"), net: t("net"), gross: t("gross"), pur: t("pur"), usd: t("usd"), inr: t("inr") };
    return `<tr class="g b">
      <td class="g b">${label}</td><td class="g"></td>
      <td class="r g">${g.box}</td><td class="r g">${wbFixed(g.vol, 2)}</td><td class="r g">${g.qty}</td>
      <td class="r g">${wbFixed(g.net, 3)}</td><td class="r g">${wbFixed(g.gross, 3)}</td>
      <td class="r g">${acc(g.pur)}</td><td class="r g">${acc(g.pur * 0.18)}</td><td class="r g">${acc(g.pur * 1.18)}</td>
      <td class="r g">${acc(g.usd)}</td><td class="r g">${acc(g.inr)}</td><td class="r g">${acc(g.inr * 0.18)}</td>
      <td class="r g">${acc(g.inr * 1.18)}</td><td class="r g">${acc(g.usd * ex)}</td>
      <td class="r g">${acc(g.inr - g.usd * ex)}</td></tr>`;
  };

  const all = blocks.flatMap((b) => b.rows);
  const spacer = `<tr class="g">${Array(16).fill('<td class="g"></td>').join("")}</tr>`;
  const volume = all.reduce((s, g) => s + g.vol, 0);
  const footRow = (label, value) => `<tr><td class="g b">${label}</td><td class="g"></td><td class="g"></td>
      <td class="r g b">${wbFixed(value, 2)}</td>${Array(12).fill('<td class="g"></td>').join("")}</tr>`;

  const html = `<div class="title">12 · SHIPMENT BOXES &amp; VOLUME</div>
    <div class="sub">Invoice ${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)} · GST 18% · Rate @ Rs. ${ex}/$</div>
    <table class="wb">
      <tr>
        <th class="g"></th><th class="g">HSN</th><th class="g">BOX</th><th class="g">VOLUME</th><th class="g">QUANTITY</th>
        <th class="g">NET WT</th><th class="g">GROSS WT</th><th class="g">Taxable Purchase</th><th class="g">18%</th>
        <th class="g">Total Pur value</th><th class="g">Taxable Sales (USD)</th><th class="g">Taxable Sales (INR)</th>
        <th class="g">18%</th><th class="g">Total Sale value</th><th class="g">${ex}</th><th class="g">DIFF</th>
      </tr>
      ${blocks.map((b) => b.rows.map(lineRow).join("") + totalRow("TOTAL", b.rows) + spacer).join("")}
      ${totalRow("TOTAL", all)}
      ${footRow("CAPACITY", CONTAINER_CBM)}
      ${footRow("BALANCE", CONTAINER_CBM - volume)}
    </table>`;
  return { name: "Shipment_Boxes_Volume_12", html, sheet: boxesVolumeSheet(ctx, blocks, ex) };
};
/* Doc 13 · Export value declaration — against 13-Export Value Declaration.pdf.

   The customs Annexure-A: a typed form, ticked box by ticked box, not a table
   of answers. What changes per shipment is what their copy highlights — the
   shipping bill and invoice, the terms of payment and delivery, and the date
   under the signature; the rest is the form as printed.

   Their own copy carries boxes after only some of the options on lines 3 and
   4, so the X for a plain sale ended up in the first box there was. Every
   option is given its own box here and the one that applies is the one
   ticked — a declaration that reads "sale on consignment basis" against an
   FOB sale is worse than a form that does not match theirs box for box.

   The form is described once, as runs across a 24-column grid, and the page
   and the worksheet are both laid out from that description, so the paper the
   CHA signs and the sheet the office keeps cannot drift apart.            */
const EV = {
  t: { font: "tnr", border: false, align: "center", valign: "center" },
  n: { font: "tnr", border: false, valign: "center" },
  nt: { font: "tnr", border: false, valign: "top" },
  w: { font: "tnr", border: false, valign: "top", wrap: true },
  u: { font: "tnru", border: false, valign: "center" },
  x: { font: "tnr", border: "box", align: "center", valign: "center" },
  c: { font: "tnr", border: false, align: "center", valign: "center" },
};
const EVD_CLASS = { t: "ttl", n: "", nt: "nt", w: "w", u: "u", x: "bx", c: "c" };

function evd13Rows(ctx) {
  const s = ctx.inv.ship || {};
  const E = ctx.EXPORTER;
  // The bill is numbered when the CHA files it, which is after this is signed;
  // until then the line prints blank, as their copy does.
  const sb = s.sbNo ? `: ${s.sbNo} Dt. ${s.sbDate ? ddmm(s.sbDate) : ""}`.trim() : "";
  const R = (...cells) => ({ cells });
  const GAP = { gap: true };
  const tick = (on) => [1, on ? "X" : "", "x"];

  return [
    R([24, "ANNEXURE-A", "t"]),
    R([24, "EXPORT VALUE DECLARATION", "t"]),
    R([24, "(See Rule of customs Valuation (Determination of Value of export goods) Rules 2007)", "t"]),
    GAP,
    R([12, "1.  Shipping Bill No. & Date.", "n"], [12, sb, "n"]),
    GAP,
    R([12, "2.  Invoice No. & Date.", "n"], [12, `: ${ctx.inv.invoiceNo} Dt. ${ddmm(ctx.inv.date)}`, "n"]),
    GAP,
    R([24, "3.  Nature of Transaction.", "n"]),
    R([3, "Sale", "n"], tick(true), [9, "Sale on consignment basis", "n"], tick(false),
      [3, "Gift", "n"], tick(false), [6, "", "n"]),
    R([3, "Sample", "n"], tick(false), [3, "Other", "n"], tick(false), [16, "", "n"]),
    GAP,
    R([10, "4.  Method of Valuation", "n"], [2, "Rule 3", "n"], tick(true), [2, "Rule 4", "n"], tick(false),
      [2, "Rule 5", "n"], tick(false), [2, "Rule 6", "n"], tick(false), [2, "", "n"]),
    R([10, "", "n"], [14, "(See Export Valuation Rules)", "n"]),
    GAP,
    R([13, "5.  Whether seller and buyer are related", "n"], [2, "Yes", "n"], tick(false),
      [2, "No", "n"], tick(true), [5, "", "n"]),
    GAP,
    R([13, "6.  If yes, whether relationship", "n"], [2, "Yes", "n"], tick(false),
      [2, "No", "n"], tick(false), [5, "", "n"]),
    GAP,
    R([12, "7.  Terms of Payment", "n"], [12, `: ${s.payment || "D.P. SIGHT DRAFT"}`, "n"]),
    GAP,
    R([12, "8.  Terms of Delivery", "n"], [12, `: ${s.terms || "FOB MUMBAI"}`, "n"]),
    GAP,
    R([24, "9.  Previous exports of identical/similar goods if any", "n"]),
    R([12, "Shipping Bill No. & date.", "n"], [12, ": No.", "n"]),
    GAP,
    R([19, "10.  Any other relevant information (Attach separate sheet, if necessary)", "n"], [5, ":NIL", "n"]),
    GAP,
    R([24, "DECLARATION:", "u"]),
    R([1, "1.", "nt"], [23, "We hereby declare that the information furnished above is true, complete and correct in every respect.", "w"]),
    GAP,
    R([1, "2.", "nt"], [23, "We also undertake to bring to the notice of proper officer any particulars, which subsequently come to our knowledge, which will have bearing on a valuation.", "w"]),
    GAP,
    R([10, "Place: Mumbai", "n"], [14, `For M/s. ${E.name}`, "c"]),
    R([10, `Date: ${ddmm(ctx.inv.date)}`, "n"], [14, "", "c"]),
    { gap: true, h: 40 },                       // the stamp and the signature go here
    R([10, "", "n"], [14, `Proprietor- ${SIGNATORY}`, "c"]),
    R([10, "", "n"], [14, "Signature of the Exporter", "c"]),
    R([10, "", "n"], [14, "Name of the Signatory.", "c"]),
  ];
}

function evd13Sheet(ctx) {
  const G = formGrid(24);
  evd13Rows(ctx).forEach((r) => {
    if (r.gap) { G.gap(r.h || 8); return; }
    G.row(r.cells.map(([span, v, k]) => [span, { v, s: EV[k] }]));
  });
  return fitSheet({
    name: "Declaration",
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: Array(24).fill(4),
    defaultRowHeight: 16.5,
    colStyle: { font: "tnr", border: false },
    page: {
      paper: 9, orientation: "portrait", fit: true, fitH: 0,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

B["13"] = (ctx) => {
  const body = evd13Rows(ctx).map((r) => (r.gap
    ? '<tr class="gap"><td colspan="24"></td></tr>'
    : `<tr>${r.cells.map(([span, v, k]) => {
      const cls = EVD_CLASS[k];
      return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v)}</td>`;
    }).join("")}</tr>`)).join("");
  const html = `<div class="evd"><table><colgroup>${'<col>'.repeat(24)}</colgroup>${body}</table></div>`;
  return { name: "Export_Value_Declaration_13", html, sheet: evd13Sheet(ctx), page: "portrait" };
};
/* Doc 14 · SCOMET declaration — against 14-Scomet Declaration.pdf. The four
   undertakings the DGFT wants from an exporter, on the same letterhead as the
   despatch instruction. Only the invoice and the date change with the
   shipment; the undertakings are their standing text and are printed word for
   word, including the two slips their copy carries ("contravene the contravene
   the", "do not confirm to unclear transfer") — this is a declaration that has
   been filed in this wording for years, and editing it is the client's call,
   not ours. */
const SCOMET_TERMS = [
  "Our products do not fall under restricted or negative list of items under FTP 2009-2014 nor these are categorized under SCOMET (Special Chemicals, Organisms, Materials, Equipment & Technologies) list.",
  "Export of our products are neither covered under EU Registration 423/2007 nor the Customer is listed under OFAC (Office of the Foreign Asset Control under U.S. Department of Treasury) SDN list.",
  "Supplier stated in the export invoice(s) are not meant for any military/nuclear activities or development. The Goods stated in the invoice do not confirm to unclear transfer or proliferation activities.",
  "These supplies do not contravene the contravene the Resolution 1929(2010) of United Nations Security Council or Provisions of INECIRC/254/Rev-9/Part2(IAEA Document)",
];
const scometRef = (ctx) => `${ctx.inv.invoiceNo} Dt ${ddmm(ctx.inv.date)}`;

function scomet14Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;

  letterheadRows(G, E);
  row([[2, { v: "Invoice No & Date", s: DL.body }], [4, { v: scometRef(ctx), s: DL.b }]]);
  gap();
  row([[6, { v: `WE M/S. ${E.name} FURTHER UNDERTAKE AND CONFIRM`, s: DL.mid }]]);
  gap();
  SCOMET_TERMS.forEach((t) => {
    row([[1, { v: "•", s: DL.n }], [5, { v: t, s: DL.just }]]);
    gap(6);
  });
  gap();
  row([[6, { v: "Thanking you.", s: DL.body }]]);
  gap();
  row([[3, { v: `For M/s. ${E.name}`, s: DL.body }]]);
  gap(18);
  gap(18);
  row([[3, { v: `Proprietor- ${SIGNATORY}`, s: DL.body }]]);
  gap();
  row([[3, { v: ddmm(ctx.inv.date), s: DL.body }]]);
  gap();

  letterFootRows(G, E);
  return letterSheet("SCOMET", G);
}

B["14"] = (ctx) => {
  const E = ctx.EXPORTER;
  const html = `<div class="dl just">
    ${letterheadBlock(E)}

    ${letterFieldBlock("Invoice No & Date", scometRef(ctx))}
    <p class="mid">WE M/S. ${esc(E.name)} FURTHER UNDERTAKE AND CONFIRM</p>

    <table class="ins">
      ${SCOMET_TERMS.map((t) => `<tr><td class="n">•</td><td>${esc(t)}</td></tr>`).join("")}
    </table>

    <p>Thanking you.</p>
    <p class="sign">For M/s. ${esc(E.name)}<br>Proprietor- ${esc(SIGNATORY)}</p>
    <p>${ddmm(ctx.inv.date)}</p>

    ${letterFootBlock(E)}
  </div>`;
  return { name: "Scomet_Declaration_14", html, sheet: scomet14Sheet(ctx), page: "portrait" };
};
/* Doc 15 · SDF declaration — against 15-SDF Declaration.pdf. The customs SDF,
   on the letterhead: what is declared, what is enclosed and against which of
   the four heads, the particulars of the exporter, and the undertaking under
   FEMA. The customs broker's half of the particulars is left empty — the CHA
   fills it in when the shipping bill is filed. */
const SDF_ENCLOSURES = [
  // The first head runs to three lines on their form, with its answer against
  // the middle one; the rest are a line each.
  [["Duty Exemption Entitlement Certificate /", "Advance Authorisation /", "Duty Free Import Authorisation Declaration"], "NOT APPLICABLE", 1],
  [["Invoice cum Packing-List"], "APPLICABLE", 0],
  [["Quota / Inspection Certificates"], "NOT APPLICABLE", 0],
  [["Others (Specify)"], "NOT APPLICABLE", 0],
];
const SDF_FEMA = "I/We undertake to abide by the provisions of Foreign Exchange Management Act, 1999, as amended from time to time, including realization or repatriation of foreign exchange to or from India.";

/* The particulars box: ours on the left, the customs broker's on the right. */
const sdfParticulars = (ctx) => [
  ["Invoice No", ctx.inv.invoiceNo, "Date", ddmm(ctx.inv.date)],
  ["Name of the Exporter", SIGNATORY, "Name of Customs Broker", ""],
  ["Designation", "Proprietor", "Designation", ""],
  ["", "", "Identity Card Number", ""],
];

function sdf15Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;

  letterheadRows(G, E);
  row([[6, { v: "D E C L A R A T I O N", s: DL.midB }]]);
  gap();
  row([[6, { v: "I/We declare that the particulars given herein above are true, correct and complete.", s: DL.body }]]);
  gap();
  row([[6, { v: "I/We enclose herewith copies of the following documents *:", s: DL.body }]]);
  gap();

  SDF_ENCLOSURES.forEach(([lines, answer, at], n) => lines.forEach((text, i) => {
    row([[1, { v: i === 0 ? `${n + 1}.` : "", s: DL.n }],
      [3, { v: text, s: DL.body }],
      [2, { v: i === at ? answer : "", s: DL.body }]]);
  }));
  gap();

  sdfParticulars(ctx).forEach((cells) => row([
    [2, { v: cells[0], s: DL.bx }], [1, { v: cells[1], s: DL.bx }],
    [2, { v: cells[2], s: DL.bx }], [1, { v: cells[3], s: DL.bx }],
  ]));
  gap();

  row([[6, { v: SDF_FEMA, s: DL.just }]]);
  gap();
  row([[6, { v: "* To be submitted with the exports goods in the warehouse.", s: DL.body }]]);
  gap();

  letterSignRows(G, ctx, E);
  letterFootRows(G, E);
  return letterSheet("SDF", G);
}

B["15"] = (ctx) => {
  const E = ctx.EXPORTER;
  const encl = SDF_ENCLOSURES.map(([lines, answer, at], n) => lines.map((text, i) => `<tr>
        <td class="n">${i === 0 ? `${n + 1}.` : ""}</td>
        <td>${esc(text)}</td>
        <td class="ans">${i === at ? answer : ""}</td>
      </tr>`).join("")).join("");
  const box = sdfParticulars(ctx).map((cells) => `<tr>${cells
    .map((v, i) => `<td${i === 0 || i === 2 ? ' class="lbl"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("");

  const html = `<div class="dl just">
    ${letterheadBlock(E)}

    <p class="mid b">D E C L A R A T I O N</p>
    <p>I/We declare that the particulars given herein above are true, correct and complete.</p>
    <p>I/We enclose herewith copies of the following documents *:</p>

    <table class="ins encl">${encl}</table>
    <table class="bx">${box}</table>

    <p>${esc(SDF_FEMA)}</p>
    <p>* To be submitted with the exports goods in the warehouse.</p>

    ${letterSignBlock(ctx, E)}

    ${letterFootBlock(E)}
  </div>`;
  return { name: "SDF_Declaration_15", html, sheet: sdf15Sheet(ctx), page: "portrait" };
};
/* Doc 16 · RoDTEP declaration — against 16-RoDTEP Declaration.pdf. The
   annexure the shipping bill is filed with when the shipment claims RoDTEP,
   on the letterhead. The three undertakings are the scheme's own wording and
   are printed as they stand; only the invoice and the date change. */
const RODTEP_TITLE = "DECLARATION TO BE FILED AS PART OF SHIPPING BILL OR BILL OF EXPORT FOR EXPORT OF GOODS UNDER RoDTEP SCHEME";
const RODTEP_LEAD = "“I/We, in regard to my/our claim under RoDTEP scheme made in this Shipping Bill or Bill of Export, hereby declare that:";
const RODTEP_TERMS = [
  "1. I/ We undertake to abide by the provisions, including conditions, restrictions, exclusions and time-limits as provided under RoDTEP scheme, and relevant notifications, regulations, etc., as amended from time to time.",
  "2. Any claim made in this shipping bill or bill of export is not with respect to any duties or taxes or levies which are exempted or remitted or credited under any other mechanism outside RoDTEP.",
  "3. I/We undertake to preserve and make available relevant documents relating to the exported goods for the purposes of audit in the manner and for the time period prescribed in the Customs Audit Regulations, 2018.”",
];

function rodtep16Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;

  letterheadRows(G, E);
  row([[6, { v: "Annexure", s: DL.mid }]]);
  gap();
  row([[6, { v: RODTEP_TITLE, s: DL.mid }]]);
  gap();
  row([[2, { v: "Invoice No & Date", s: DL.body }], [4, { v: scometRef(ctx), s: DL.b }]]);
  gap();
  row([[6, { v: RODTEP_LEAD, s: DL.just }]]);
  gap();
  RODTEP_TERMS.forEach((t) => { row([[6, { v: t, s: DL.just }]]); gap(6); });
  gap();

  letterSignRows(G, ctx, E);
  letterFootRows(G, E);
  return letterSheet("RoDTEP", G);
}

B["16"] = (ctx) => {
  const E = ctx.EXPORTER;
  const html = `<div class="dl just">
    ${letterheadBlock(E)}

    <p class="mid">Annexure</p>
    <p class="mid">${esc(RODTEP_TITLE)}</p>
    ${letterFieldBlock("Invoice No & Date", scometRef(ctx))}

    <p>${esc(RODTEP_LEAD)}</p>
    ${RODTEP_TERMS.map((t) => `<p>${esc(t)}</p>`).join("")}

    ${letterSignBlock(ctx, E)}

    ${letterFootBlock(E)}
  </div>`;
  return { name: "RoDTEP_Declaration_16", html, sheet: rodtep16Sheet(ctx), page: "portrait" };
};

/* Doc 17 · Proforma invoice — against 17-Proforma Invoice of Buyer.pdf, which
   is the buyer's own purchase order form: their name and tagline over the
   words PURCHASE ORDER, the order number and date, us in the TO box and their
   warehouse in the DELIVER TO box, the account code they file us under, then
   the goods banded by range — a band per item group, as their form bands them
   — priced per piece or per hundred, and the freight and delivery terms under
   it with their contact strip along the foot.

   Their letterhead is the buyer's, not ours, so it is held on the buyer master
   (Setup → Buyers) and prints from there — including the mark above their
   name, uploaded once as `logo` and carried as a data: URL. A buyer whose form
   we do not reproduce simply leaves those fields blank and the boxes print
   empty, which is what a blank form does.

   One thing about their paper this cannot follow: their grid is a fixed frame
   that carries its running value to the next page as "Balance c/f" and totals
   on the last; ours is one flow, so it rules the frame out to a full page and
   totals once. */
const fobModeOf = (it) => it?.fobMode || "100";
const perLabel = (it) => (fobModeOf(it) === "piece" ? "Per Piece" : "Per 100 Pieces");
/* Their purchase order bands the goods by product family, in the order the
   form runs — not by the size band the master groups them under. A pipe is a
   pipe to the buyer whether it is 15MM or 50MM; what separates the bands is
   what the thing IS: extruded pipe threaded male-to-male, the same male-to-
   female, moulded fittings, nylon fittings, and the cartons they travel in.
   The master's own group is what says which: the size bands and the plain
   pipe/tube groups are the MxM pipes, "PP PIPES M/F THREADED" the MxF ones. */
const PROFORMA_FAMILIES = [
  ["mxm", "PP EXTRUDED PIPES : MxM THREADED"],
  ["mxf", "PP EXTRUDED PIPES : MxF THREADED"],
  ["ppm", "PP MOULDED FITTINGS"],
  ["grn", "NYLON MOULDED FITTINGS"],
  ["box", "CORRUGATED BOXES"],
];
function familyOf(it) {
  const g = String(it.group || "").trim().toLowerCase();
  const code = String(it.code || it.gd || "").toUpperCase();
  if (g.includes("corrugated") || g.includes("carton") || /^GD\d/.test(code)) return "box";
  if ((it.stickerRule || "pp") === "grn" || g.includes("grn") || g.includes("nylon")) return "grn";
  if (g.includes("m/f") || g.includes("mxf")) return "mxf";
  if (g.includes("moulded")) return "ppm";
  if (/\d\s*mm|pipe|tube/.test(g)) return "mxm";
  return "ppm";
}
const bandOf = (it) => PROFORMA_FAMILIES.find(([k]) => k === familyOf(it))[1];
/* Their form is a ruled frame, not a table that stops with the goods. */
const PROFORMA_ROWS = 22;
/* The room their paper leaves between the line the order is signed for and the
   contact strip, for the stamp and the signature to be put in once it is
   printed — about five-eighths of an inch, in points. */
const SIGN_PT = 44;
/* The contact strip is set small and close, not on the row the rest of the
   sheet is ruled to. */
const FOOT_PT = 11;

/* A band per item group, in the order the invoice runs. A band whose goods have
   no length loses that column, as their moulded-fitting pages do. */
function proformaBands(ctx) {
  const bands = new Map();
  L(ctx).forEach((r) => {
    const key = familyOf(r.it);
    if (!bands.has(key)) bands.set(key, []);
    bands.get(key).push(r);
  });
  // Families in the order their form prints them, whatever order they were
  // packed in; anything unrecognised follows, under its own heading.
  return PROFORMA_FAMILIES.filter(([k]) => bands.has(k)).map(([k, head]) => {
    const rows = bands.get(k);
    return {
      head,
      rows,
      boxes: k === "box",
      lengths: rows.some((r) => String(r.it.length || "").trim()),
      per: commonOf(rows, (r) => fobModeOf(r.it)) === "piece" ? "Per Piece" : "Per 100 Pieces",
    };
  });
}
/* Who the order is signed for, as their form sets it — in capitals, above the
   space their stamp and signature go in. */
const forLine = (b) => `FOR ${b.name || ""}${b.brand ? ` T/A ${b.brand}` : ""}`.toUpperCase();
/* The month the goods are due — their form names it, in capitals. */
const deliveryMonth = (ctx) => (ctx.inv.date
  ? new Date(ctx.inv.date).toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase() : "");
/* What one line is priced at: per piece as quoted, or per hundred. */
const proformaRate = (r) => (fobModeOf(r.it) === "piece" ? r.fobPc : r.fobPc * 100);
/* The buyer's own contact strip, as the four centred lines their form ends on:
   who they are, where they are and how to call them set close together, then
   their web and email a line below — `spaced` is that line's own break, which
   their paper leaves. A line with nothing in it is left out rather than
   printed empty. */
function proformaFooter(b) {
  const join = (parts, sep) => parts.filter(Boolean).join(sep);
  return [
    { text: join([b.name, b.abn && `ABN ${b.abn}`, b.acn && `ACN ${b.acn}`], " - ") },
    { text: join([b.addr, b.poBox], " * ") },
    { text: join([b.tel && `Tel : ${b.tel}`, b.fax && `Fax : ${b.fax}`], " * ") },
    { text: join([b.web && `Web : ${b.web}`, b.email && `Email : ${b.email}`], " * "), spaced: true },
  ].filter((l) => l.text);
}
/* Setup's upload keeps the buyer's mark as a data: URL — decoded here into the
   raw bytes a oneCellAnchor picture wants, the same shape logo.js builds for
   the exporter's own mark. It is anchored to sit above their name, roughly
   centred on the four columns the name is centred on, and stands about the
   five-eighths of an inch it stands on their own paper. */
const LOGO_CY = 553000;              // EMU, 914400 to the inch
const PROFORMA_COL_EMU = 766762;     // one column of the eight, at 11.5 characters

/* A PNG carries its pixel size in the IHDR chunk, at a fixed offset; a JPEG
   does not, so one is taken as square and the sheet shows it a shade wide
   rather than refusing to place it. */
function pngAspect(data) {
  const be = (o) => (data[o] << 24 | data[o + 1] << 16 | data[o + 2] << 8 | data[o + 3]) >>> 0;
  if (data.length < 24 || data[0] !== 0x89 || data[1] !== 0x50) return 1;
  const w = be(16), h = be(20);
  return w && h ? w / h : 1;
}

function buyerLogoImage(b) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(b.logo || "");
  if (!m) return null;
  const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const cx = Math.round(LOGO_CY * pngAspect(data));
  // Centred on columns A–D, which is where their name sits under it.
  const left = Math.round((PROFORMA_COL_EMU * 4 - cx) / 2);
  return {
    data,
    ext,
    col: Math.floor(left / PROFORMA_COL_EMU),
    colOff: left % PROFORMA_COL_EMU,
    row: 0,
    rowOff: 20000,
    cy: LOGO_CY,
    cx,
  };
}

function proforma17Sheet(ctx, bands) {
  const E = ctx.EXPORTER;
  const b = ctx.buyer;
  const P = {
    ttl: { font: "refb11", border: false, align: "right", valign: "center" },
    brand: { font: "refb14", border: false, align: "center", valign: "center" },
    sub: { font: "ref", border: false, align: "center", valign: "center" },
    lbl: { font: "ref", border: false, valign: "center" },
    val: { font: "refb", border: false, valign: "center" },
    box: { font: "ref", border: "box", valign: "top", wrap: true },
    boxC: { font: "ref", border: "box", align: "center", valign: "center" },
    band: { font: "refb", border: "box", valign: "center" },
    head: { font: "refb", border: "box", align: "center", valign: "center", wrap: true },
    code: { font: "ref", border: "box", align: "center", valign: "center" },
    per: { font: "ref", border: "box", align: "center", valign: "center", wrap: true },
    num: { font: "ref", border: "box", align: "center", valign: "center", fmt: "int" },
    money: { font: "ref", border: "box", align: "right", valign: "center", fmt: USD },
    blank: { font: "ref", border: "box", valign: "center" },
    tot: { font: "refb", border: "rt", align: "right", valign: "center", fmt: USD },
    totLbl: { font: "refb", border: "t", align: "center", valign: "center" },
    plain: { font: "ref", border: false, valign: "center" },
    /* The contact strip along the foot, set small as their paper sets it, and
       the line the order is signed for — held to the top of the freight run so
       the space beneath it is left clear to sign in. */
    foot: { font: "ref8", border: false, align: "center", valign: "center" },
    signTop: { font: "ref", border: false, align: "center", valign: "top" },
    /* The runs their form rules as one unbroken box rather than a row of
       cells. Only the edges the box itself owns are drawn, so no rule falls
       between the columns it crosses. */
    boxTL: { font: "refb", border: "lt", align: "center", valign: "center" },
    boxT: { font: "refb", border: "t", align: "center", valign: "center" },
    boxTR: { font: "ref", border: "rt", valign: "center" },
    boxML: { font: "ref", border: "l", align: "center", valign: "center" },
    boxM: { font: "ref", border: false, align: "center", valign: "center" },
    boxMR: { font: "ref", border: "r", valign: "center" },
    boxBL: { font: "ref", border: "lb", valign: "center" },
    boxB: { font: "ref", border: "b", valign: "center" },
    boxBR: { font: "ref", border: "rb", valign: "center" },
    frLbl: { font: "refb", border: "lt", align: "center", valign: "center" },
    frVal: { font: "ref", border: "rt", valign: "center" },
    frLblB: { font: "refb", border: "lb", align: "center", valign: "center" },
    frValB: { font: "ref", border: "rb", valign: "center" },
  };
  const G = formGrid(8);
  const { row, gap } = G;

  // The mark stands in this row, so it is given the height to hold it.
  row([[5, { v: "", s: P.plain }], [2, { v: "PURCHASE ORDER", s: P.ttl }], [1, { v: "", s: P.plain }]],
    b.logo ? 46 : undefined);
  row([[4, { v: b.name || "", s: P.brand }], [1, { v: "NO.", s: P.lbl }], [3, { v: b.orderNo || "", s: P.val }]], 21);
  row([[4, { v: b.tagline || (b.brand ? `T/A ${b.brand}` : ""), s: P.sub }],
    [1, { v: "DATE", s: P.lbl }], [3, { v: ddmm(ctx.inv.date), s: P.val }]]);
  gap();

  row([[1, { v: "", s: P.plain }], [3, { v: "TO:", s: P.lbl }],
    [1, { v: "", s: P.plain }], [3, { v: "DELIVER TO:", s: P.lbl }]]);
  row([[1, { v: "", s: P.plain }], [3, { v: [E.name, E.addr].filter(Boolean).join("\n"), s: P.box }],
    [1, { v: "", s: P.plain }],
    [3, { v: [`${b.name || ""}${b.brand ? ` T/A ${b.brand}` : ""}`, b.addr || b.shipTo || ""].filter(Boolean).join("\n"), s: P.box }]], 42);
  gap();

  // The account-code strip: one box, three rows deep, no rule down the middle.
  row([[3, { v: "A/C CODE", s: P.boxTL }], [3, { v: "TEL NUMBER", s: P.boxT }], [2, { v: "", s: P.boxTR }]]);
  row([[3, { v: b.acCode || "", s: P.boxML }], [3, { v: `+91-${E.tel}`, s: P.boxM }], [2, { v: "", s: P.boxMR }]]);
  row([[3, { v: "", s: P.boxBL }], [3, { v: "", s: P.boxB }], [2, { v: "", s: P.boxBR }]]);
  gap();

  const first = G.at() + 1;
  let lines = 0;
  /* The eighths a band's own columns take — the length is worth two of them,
     and a band without one gives the size all three. */
  const shapeOf = (band) => (band.lengths ? [1, 1, 2, 1, 1, 1, 1] : [1, 3, 1, 1, 1, 1]);
  bands.forEach((band) => {
    row([[8, { v: band.head, s: P.band }]]);
    const H = band.boxes
      ? ["CODE", "SIZE (MM)", "PIECES", "Unit Price.", "Per Piece", "Total Value."]
      : band.lengths
        ? ["CODE", "SIZE (MM / IN)", "LEN (MM)", "PIECES", "RATE", band.per, "TOTAL VALUE"]
        : ["CODE", "SIZE (MM)", "PIECES", "RATE", band.per, "TOTAL VALUE"];
    const shape = shapeOf(band);
    row(H.map((v, i) => [shape[i], { v, s: P.head }]));
    band.rows.forEach((r) => {
      const line = G.at() + 1;
      const per100 = fobModeOf(r.it) !== "piece";
      const cells = [
        [1, { v: r.it.code || "", s: P.code }],
        [shape[1], { v: r.it.size || "", s: P.code }],
      ];
      if (band.lengths) cells.push([shape[2], { v: r.it.length || "", s: P.code }]);
      /* Whatever the band's shape, the pieces land on E and the rate on F —
         the size takes up the slack — so one formula serves both. */
      cells.push(
        [1, { v: r.pieces, t: "n", s: P.num }],
        [1, { v: proformaRate(r), t: "n", s: P.money }],
        [1, { v: perLabel(r.it), s: P.per }],
        [1, { f: `E${line}*F${line}${per100 ? "/100" : ""}`, s: P.money }],
      );
      row(cells);
      lines += 1;
    });
  });
  // The rest of the frame, ruled and empty, keeping the last band's columns.
  const fillShape = bands.length ? shapeOf(bands[bands.length - 1]) : [8];
  for (let i = lines; i < PROFORMA_ROWS; i++) row(fillShape.map((n) => [n, { v: "", s: P.blank }]));
  const last = G.at();
  row([[5, { v: "", s: { border: "lt" } }], [2, { v: "Total", s: P.totLbl }],
    [1, { f: first <= last ? `SUM(H${first}:H${last})` : "0", s: P.tot }]]);
  row([[5, { v: "", s: { border: "lb" } }], [2, { v: "", s: P.boxB }], [1, { v: "", s: P.boxBR }]]);
  gap();

  /* The freight terms and the line the order is signed for stand side by side,
     the name on the first of the two rows so the space below it stays clear —
     that is where the stamp and the signature go once it is printed. */
  row([[1, { v: "FREIGHT", s: P.frLbl }], [3, { v: "TO COLLECT / PAYABLE AT DESTINATION", s: P.frVal }],
    [4, { v: forLine(b), s: P.signTop }]]);
  row([[1, { v: "DELIVERY", s: P.frLblB }], [3, { v: deliveryMonth(ctx), s: P.frValB }],
    [4, { v: "", s: P.plain }]]);
  gap(SIGN_PT);
  proformaFooter(b).forEach((l) => {
    if (l.spaced) gap(FOOT_PT);
    row([[8, { v: l.text, s: P.foot }]], FOOT_PT);
  });

  return fitSheet({
    name: "Proforma",
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: Array(8).fill(11.5),
    defaultRowHeight: 14.25,
    colStyle: { font: "ref", border: false, valign: "center" },
    image: buyerLogoImage(b),
    page: {
      paper: 9, orientation: "portrait", fit: true, fitH: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

/* A blank line in the form, matching the worksheet's own gap rows. */
const SPACE = '<tr class="nb"><td class="nb" colspan="8" style="height:9px"></td></tr>';
/* The space their paper leaves under the line the order is signed for, for the
   stamp and the signature, and the shorter break before the last line of the
   contact strip — the same two gaps the worksheet leaves, in pixels. */
const SIGN_SPACE = '<tr class="nb"><td class="nb" colspan="8" style="height:44px"></td></tr>';
const FOOT_SPACE = '<tr class="nb"><td class="nb" colspan="8" style="height:11px"></td></tr>';

/* Several runs of their form are one ruled box with the text set at fixed
   points inside it rather than a row of cells — the account-code strip, the
   total line, the freight block. Each is one cell of the eight-column grid
   holding a table of its own that draws no rules, so the box stays unbroken
   while the text still lands on the eighths. `parts` are [width%, class, html]. */
const bpoBox = (rows) => `<table class="in">${rows.map((cells) => `<tr>${cells
  .map(([w, cls, v]) => `<td style="width:${w}%"${cls ? ` class="${cls}"` : ""}>${v == null ? "" : v}</td>`)
  .join("")}</tr>`).join("")}</table>`;

B["17"] = (ctx) => {
  const E = ctx.EXPORTER;
  const b = ctx.buyer;
  const bands = proformaBands(ctx);
  const total = sum(L(ctx), "fobTotal");
  const addr = (lines) => lines.filter(Boolean).map(esc).join("<br>");
  const lines = bands.reduce((n, band) => n + band.rows.length, 0);

  /* The eighths a band's own columns take. The length is worth two of them;
     a band without one gives the size all three. */
  const shapeOf = (band) => (band.lengths ? [1, 1, 2, 1, 1, 1, 1] : [1, 3, 1, 1, 1, 1]);
  const span = (n) => (n > 1 ? ` colspan="${n}"` : "");

  const section = (band) => {
    /* The cartons are headed in their own words on their form — "Unit Price."
       and "Total Value." where the goods above say RATE and TOTAL VALUE. */
    const H = band.boxes
      ? ["CODE", "SIZE (MM)", "PIECES", "Unit Price.", "Per Piece", "Total Value."]
      : band.lengths
        ? ["CODE", "SIZE (MM / IN)", "LEN (MM)", "PIECES", "RATE", band.per, "TOTAL VALUE"]
        : ["CODE", "SIZE (MM)", "PIECES", "RATE", band.per, "TOTAL VALUE"];
    const shape = shapeOf(band);
    const head = `<tr>${H.map((h, i) => `<th${span(shape[i])}>${esc(h)}</th>`).join("")}</tr>`;
    /* Their goods are ruled down the columns but not across: a line separates
       the heading from the first item and nothing separates the items from one
       another, so a band reads as one block. Hence `ln` — see the print CSS. */
    const body = band.rows.map((r) => {
      const rate = proformaRate(r);
      return `<tr class="ln"><td class="c">${esc(r.it.code)}</td>
        <td class="c"${span(shape[1])}>${esc(r.it.size)}</td>
        ${band.lengths ? `<td class="c"${span(shape[2])}>${esc(r.it.length)}</td>` : ""}
        <td class="c" data-t="int" data-v="${r.pieces}">${r.pieces.toLocaleString("en-IN")}</td>
        <td class="r" data-t="usd" data-v="${rate}">${usd(rate)}</td>
        <td class="c">${esc(perLabel(r.it))}</td>
        <td class="r" data-t="usd" data-v="${r.fobTotal}">${usd(r.fobTotal)}</td></tr>`;
    }).join("");
    return `<tr class="po"><td colspan="8">${esc(band.head)}</td></tr>${head}${body}`;
  };

  /* The frame runs on past the goods to the foot of the page, and the empty
     rows keep the rules of the band above them, as their form leaves them. */
  const fillShape = bands.length ? shapeOf(bands[bands.length - 1]) : [8];
  const filler = `<tr class="ln">${fillShape.map((n) => `<td${span(n)}>&nbsp;</td>`).join("")}</tr>`;

  /* The masthead, the addresses and the account code repeat at the top of
     every printed page, as they do on page 2 of their own form.

     Their sheet rules everything on eight equal columns: the mark and their
     name over the first four, the order number and date on the fifth and what
     follows, the two address boxes on the second-to-fourth and sixth-to-last
     with a column of air between them. */
  const html = `<table class="wb bpo">
      <colgroup>${Array(8).fill('<col style="width:12.5%">').join("")}</colgroup>
      <thead>
        <tr class="nb"><td class="nb c" colspan="4">${b.logo ? `<img class="bpo-logo" src="${esc(b.logo)}" alt="">` : ""}</td>
          <td class="nb"></td><td class="nb b c ttl" colspan="2">PURCHASE ORDER</td><td class="nb"></td></tr>
        <tr class="nb"><td class="nb big c" colspan="4">${esc(b.name || "")}</td>
          <td class="nb">NO.</td><td class="nb b val" colspan="3">${esc(b.orderNo || "")}</td></tr>
        <tr class="nb"><td class="nb c tag" colspan="4">${esc(b.tagline || (b.brand ? `T/A ${b.brand}` : ""))}</td>
          <td class="nb">DATE</td><td class="nb b val" colspan="3">${ddmm(ctx.inv.date)}</td></tr>
        ${SPACE}
        <tr class="nb"><td class="nb"></td><td class="nb" colspan="3">TO:</td>
          <td class="nb"></td><td class="nb" colspan="3">DELIVER TO:</td></tr>
        <tr><td class="nb"></td><td class="party" colspan="3">${addr([E.name, E.addr])}</td>
          <td class="nb"></td>
          <td class="party" colspan="3">${addr([`${b.name || ""}${b.brand ? ` T/A ${b.brand}` : ""}`, b.addr || b.shipTo])}</td></tr>
        ${SPACE}
        <tr><td class="bx" colspan="8">${bpoBox([
          [[37.5, "c", "A/C CODE"], [37.5, "c", "TEL NUMBER"], [25, null, null]],
          [[37.5, "c", esc(b.acCode || "")], [37.5, "c", `+91-${esc(E.tel)}`], [25, null, null]],
          [[37.5, null, "&nbsp;"], [37.5, null, null], [25, null, null]],
        ])}</td></tr>
        ${SPACE}
      </thead>
      <tbody>
        ${bands.map(section).join("")}
        ${Array(Math.max(0, PROFORMA_ROWS - lines)).fill(filler).join("")}
        <tr><td class="bx" colspan="8">${bpoBox([
          [[62.5, null, null], [25, "c", "Total"], [12.5, "r b", usd(total)]],
          [[62.5, null, "&nbsp;"], [25, null, null], [12.5, null, null]],
        ])}</td></tr>
        ${SPACE}
        <tr class="sig"><td class="bx" colspan="4">${bpoBox([
          [[25, "c b", "FREIGHT"], [75, null, "TO COLLECT / PAYABLE AT DESTINATION"]],
          [[25, "c b", "DELIVERY"], [75, null, esc(deliveryMonth(ctx))]],
        ])}</td>
          <td class="nb c sign" colspan="4">${esc(forLine(b))}</td></tr>
        ${SIGN_SPACE}
        ${proformaFooter(b).map((l) => `${l.spaced ? FOOT_SPACE : ""}<tr class="ft"><td class="nb c foot" colspan="8">${esc(l.text)}</td></tr>`).join("")}
      </tbody>
    </table>`;
  return { name: "Proforma_Invoice_17", html, sheet: proforma17Sheet(ctx, bands), page: "portrait" };
};
/* Doc 18 · Custom invoice — against 18-Custom Invoice.xlsx, the copy of the
   invoice that travels to customs with the shipping bill.

   Their file is three sheets. Page1 and Page2 are the printed form, one A4
   each at 72% and centred across the paper; Annx is the annexure customs asks
   for, every line's FOB against its net weight so the rate per kilo can be
   checked. The form is eleven columns wide and ruled as one continuous frame:
   solid down the columns, hairline between the goods, so a band of items reads
   as one block rather than a row of boxes.

   The goods are banded by what they are, priced on the band's own basis — per
   piece for the pipes and the cartons, per hundred for the moulded fittings —
   with the HSN code in the band heading, because the GST breakup at the foot
   of Page2 is totalled by code. Page1 carries its running value down as
   "Total C/F Page :2" and Page2 brings it back as "BAL B/F", which is how
   their book adds up; the grand totals, the breakup and the amount in words
   all sit on Page2.

   Everything on it stays live. Only the pieces and the rate are typed: the
   amount, the taxable value, the rupee rate and the GST are formulas off them,
   so a corrected quantity re-totals both pages and the breakup with them. The
   head of Page2 is a reference back to Page1, cell for cell, as their own
   sheet has it — the two pages cannot then drift apart. The one thing not
   copied is their taxable column, which is pasted in as constants; written as
   `amount x exchange rate` it prints the same figures and keeps the chain
   whole. */

/* Their number formats, off the reference file: dollars and rupees that print
   nothing at all in an empty cell (the ";;@" tail), and a whole-number percent
   for the GST rate. */
const CI_USD = '"$"0.00;\\-0.00;;@';
const CI_USDT = '"$"0.00;\\-"$"0.00;;@';
const CI_PCT = "0%";
const CI_PLAIN = "0.00;\\-0.00;;@";

/* The form's own frame. Page1 holds this many lines of goods between the head
   of the invoice and the carried-forward total, Page2 this many between the
   brought-forward line and the totals; a band's heading and its column header
   each take one of them, as they do on their sheet. */
const CI_P1_BODY = 56;
const CI_P2_BODY = 49;
const CI_P1_TOP = 26;                  // first row of Page1's goods frame
const CI_P2_TOP = 26;                  // and of Page2's
/* The breakup at the foot of Page2 has a line per HSN code, and their form
   leaves room for the three they ship under. Fewer than that still takes the
   three lines — blank, but ruled — so the total, the two lines of words and
   the declaration stay on the rows the form prints them on. More than three
   and the block has to grow, which is better than leaving a code off it. */
const CI_HSN_ROWS = 3;

/* The bands their invoice prints, in its order — the same five families the
   buyer's own purchase order (17) bands by, headed as customs wants them and
   with the HSN code the breakup totals by. */
const CI_BANDS = [
  ["mxm", "PLASTIC (PP) EXTRUDED PIPES : BOTH SIDE THREADED PIPES"],
  ["mxf", "PLASTIC (PP) EXTRUDED PIPES : M / F THREADED PIPES"],
  ["ppm", "PLASTIC (PP) MOULDED FITTINGS"],
  ["grn", "PLASTIC (PA) MOULDED FITTINGS"],
  ["box", "CORRUGATED BOXES"],
];

function invoiceBands(ctx) {
  const by = new Map();
  L(ctx).forEach((r) => {
    const k = familyOf(r.it);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  });
  return CI_BANDS.filter(([k]) => by.has(k)).map(([k, label]) => {
    const rows = by.get(k);
    const per100 = commonOf(rows, (r) => fobModeOf(r.it)) !== "piece";
    const hsn = hsnText(rows[0].it);
    return {
      key: k, rows, hsn, per100, label,
      head: hsn ? `${label} (HSN CODE : ${hsn})` : label,
      // The pipes carry a length; the fittings do not, and the cartons give
      // the size that column as well — their size is three dimensions.
      len: k !== "box" && rows.some((r) => String(r.it.length || "").trim()),
      wide: k === "box",
      rate: per100 ? "PER 100 PCS" : "PER PC",
      size: k === "box" ? "SIZE ( MM)" : "SIZE (IN / MM)",
    };
  });
}

/* One line of the frame per heading, per column header and per item, split
   over the two pages. A band cut by the page break picks its heading and its
   columns back up at the top of the next one, as their form does; a band whose
   columns match the band above it does not repeat them. */
function invoiceLayout(bands) {
  const all = [];
  let shape = null;
  bands.forEach((band) => {
    const sig = `${band.len}|${band.wide}|${band.rate}`;
    all.push({ kind: "head", band });
    if (sig !== shape) { all.push({ kind: "cols", band }); shape = sig; }
    band.rows.forEach((r) => all.push({ kind: "item", band, r }));
  });
  const p1 = all.slice(0, CI_P1_BODY);
  let p2 = all.slice(CI_P1_BODY);
  if (p2.length) {
    const band = p2[0].band;
    if (p2[0].kind === "item") p2 = [{ kind: "head", band }, { kind: "cols", band }, ...p2];
    else if (p2[0].kind === "cols") p2 = [{ kind: "head", band }, ...p2];
    else if (p2[1]?.kind !== "cols") p2 = [p2[0], { kind: "cols", band }, ...p2.slice(1)];
  }
  return { p1, p2 };
}
/* Page2's frame is as deep as their form draws it, or deeper if the goods need
   it. A consignment longer than the two pages hold runs the second one on and
   pushes its totals down rather than losing the lines off the end — the paper
   grows, the invoice stays whole. */
const ciP2Body = (p2) => Math.max(CI_P2_BODY, p2.length);

/* Where a given HSN's goods sit, as the few contiguous runs of rows a SUM can
   name — a code can be split over two bands and both pages, which is why the
   breakup's formulas are built rather than written. */
function hsnRuns(lines, top, hsn) {
  const runs = [];
  lines.forEach((l, i) => {
    if (l.kind !== "item" || l.band.hsn !== hsn) return;
    const at = top + i, last = runs[runs.length - 1];
    if (last && at === last[1] + 1) last[1] = at; else runs.push([at, at]);
  });
  return runs;
}
const rangeRefs = (runs, col, sheet) =>
  runs.map(([a, b]) => `${sheet ? `${sheet}!` : ""}${col}${a}:${col}${b}`).join(",");

/* The amount in words, as the invoice states it twice — the dollars in
   international scale, the rupees in lakh and crore. */
const W_ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
  "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const W_TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
const words99 = (n) => (n < 20 ? W_ONES[n]
  : [W_TENS[Math.floor(n / 10)], W_ONES[n % 10]].filter(Boolean).join(" "));
const words999 = (n) => [Math.floor(n / 100) ? `${W_ONES[Math.floor(n / 100)]} HUNDRED` : "", words99(n % 100)]
  .filter(Boolean).join(" ");
function wordsBy(n, scales) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (!n) return "ZERO";
  const out = [];
  scales.forEach(([v, name]) => {
    const q = Math.floor(n / v);
    if (q) { out.push(`${words999(q)} ${name}`); n -= q * v; }
  });
  if (n) out.push(words999(n));
  return out.join(" ");
}
const wordsIntl = (n) => wordsBy(n, [[1e9, "BILLION"], [1e6, "MILLION"], [1e3, "THOUSAND"]]);
const wordsIndian = (n) => wordsBy(n, [[1e7, "CRORE"], [1e5, "LAKH"], [1e3, "THOUSAND"]]);
/* The fraction is read out as its own two digits — ninety cents, not nine. */
const fracOf = (n) => Math.round((Math.abs(Number(n) || 0) % 1) * 100);
function amountWords(n, unit, part, indian) {
  const whole = (indian ? wordsIndian : wordsIntl)(n);
  const f = fracOf(n);
  return `${unit} ${whole}${f ? ` AND ${part} ${words99(f)}` : ""} ONLY`;
}

/* The goods as the invoice describes them in prose — the families it actually
   carries, wrapped to the width of the box it is typed into. */
const CI_DESCRIBE = {
  mxm: "PLASTIC (PP) EXTRUDED PIPES", mxf: "PLASTIC (PP) EXTRUDED PIPES",
  ppm: "PLASTIC (PP) MOULDED FITTINGS", grn: "PLASTIC (PA) MOULDED FITTINGS",
  box: "CORRUGATED BOXES",
};
function goodsWrapped(bands, width, lines) {
  const seen = [];
  bands.forEach((b) => { const t = CI_DESCRIBE[b.key]; if (t && !seen.includes(t)) seen.push(t); });
  const out = [];
  seen.join(", ").split(" ").forEach((w) => {
    const at = out.length - 1;
    if (at >= 0 && `${out[at]} ${w}`.length <= width) out[at] += ` ${w}`;
    else out.push(w);
  });
  return Array.from({ length: lines }, (_, i) => out[i] || "");
}

/* A code that is all digits is a customs tariff number and their sheet holds
   it as one, so it is written back as a number rather than as text. */
const codeCell = (code, s) => (/^\d+$/.test(String(code || "").trim())
  ? { v: Number(code), t: "n", s } : { v: String(code || ""), s });

const ciMarks = (ctx, rows) => {
  const s = ctx.inv.ship || {};
  const start = Number(ctx.inv.serialStart) || marksStart(ctx);
  const boxes = sum(rows, "boxes");
  const prefix = String(s.marks || "").replace(/[\d\-–\s]+/g, " ").trim() || "GDW";
  return { prefix, start, end: start + Math.max(0, boxes - 1) };
};

function customsInvoiceSheets(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx), ex = exRate(ctx);
  const bands = invoiceBands(ctx);
  const { p1, p2 } = invoiceLayout(bands);
  const marks = ciMarks(ctx, rows);

  /* Their whole form is Arial 9; only the masthead and the labels stand out,
     and every cell is set to shrink rather than wrap so a long entry stays on
     its one ruled line. */
  const F = { font: "ref9", border: false, valign: "center", shrink: true };
  const C = {
    txt: F,
    lbl: { ...F, font: "ref9b" },
    mer: { ...F, font: "ref9bu" },
    ttl: { ...F, font: "ref9b", align: "center" },
    brand: { ...F, font: "brandk", align: "right" },
    ctr: { ...F, align: "center" },
    rgt: { ...F, align: "right" },
  };
  /* The frame: solid down the columns, hairline across between the goods. */
  const rule = (t, b2, font = "ref9", extra = {}) =>
    ({ ...F, font, border: { l: "thin", r: "thin", t, b: b2 }, ...extra });
  const V = rule("", "");                                   // the columns only
  const G = {
    colA: V,
    head: rule("thin", "thin", "ref9b", { align: "center" }),   // a band heading
    cols: rule("thin", "thin", "ref9b", { align: "center" }),   // its column header
    code: rule("hair", "hair", "ref9", { align: "center" }),
    ctr: rule("hair", "hair", "ref9", { align: "center" }),
    num: rule("hair", "hair", "ref9", { align: "center", fmt: "#,##0" }),
    usd: rule("hair", "hair", "ref9", { align: "center", fmt: CI_USD }),
    usdL: rule("hair", "hair", "ref9", { fmt: CI_USD }),
    inr: rule("hair", "hair", "ref9", { fmt: RUPEE }),
    pct: rule("hair", "hair", "ref9", { align: "center", fmt: CI_PCT }),
    fill: V,
    totL: rule("", "thin", "ref9b", { align: "center" }),
    totV: rule("", "thin", "ref9"),
    sumU: { ...F, font: "ref9b", border: { l: "thin", r: "thin", t: "thin", b: "double" }, fmt: CI_USDT },
    sumR: { ...F, font: "ref9b", border: { l: "thin", r: "thin", t: "thin", b: "double" }, fmt: RUPEE },
  };
  const blank = (n, s2 = C.txt) => Array.from({ length: n }, () => [1, { v: "", s: s2 }]);

  /* ---- the head of the invoice, rows 1-25 -------------------------------- */
  const invRef = `${ctx.inv.invoiceNo || ""}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}`;
  const orderRef = ctx.buyer.orderNo
    ? `${ctx.buyer.orderNo}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}` : poHeaderList(ctx);
  const dated = (no, d) => (no ? `${no}${d ? ` DT. ${ddmm(d)}` : ""}` : "");
  const desc3 = goodsWrapped(bands, 42, 3);
  const desc2 = goodsWrapped(bands, 44, 2);
  const irn = String(s.irn || "");

  function headBlock(grid) {
    const { row } = grid;
    row([[1, { v: "MERCHANT", s: C.mer }], [10, { v: "INVOICE", s: { ...C.ttl, border: "b" } }]]);
    row([[5, { v: E.name, s: { ...C.brand, border: "lt" } }, 1],
      [1, { v: "Invoice No. ", s: { ...C.lbl, border: "lt" } }],
      [4, { v: invRef, s: { ...C.txt, border: "rt" } }],
      [1, { v: "Exporter's Ref.", s: { ...C.lbl, border: "rt" } }]], 12.75);
    row([...blank(1, { ...C.txt, border: "l" }), ...blank(4),
      [1, { v: "Date:", s: { ...C.lbl, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }],
      [1, { v: E.iec ? `IEC ${E.iec}` : "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[5, { v: E.sub || "", s: { ...C.txt, border: "l" } }],
      [2, { v: "Buyers Order No: ", s: { ...C.lbl, border: "l" } }],
      [4, { v: orderRef, s: { ...C.txt, border: "r" } }]]);
    const addr = addrLines(E);
    row([[5, { v: addr[0] || "", s: { ...C.txt, border: "l" } }],
      [2, { v: "", s: { ...C.txt, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }]]);
    row([[5, { v: addr[1] || "", s: { ...C.txt, border: "l" } }],
      [2, { v: "Other Reference(s):", s: { ...C.lbl, border: "l" } }],
      [4, { v: s.otherRef || "", s: { ...C.txt, border: "r" } }]]);
    row([[5, { v: [E.tel && `Tel: ${E.tel}`, E.email && `E-Mail: ${E.email}`].filter(Boolean).join(" "), s: { ...C.txt, border: "lb" } }],
      [2, { v: "", s: { ...C.txt, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }]]);
    row([[2, { v: "On Account & Risks of:", s: { ...C.lbl, border: "lt" } }],
      [3, { v: "", s: { ...C.txt, border: "t" } }],
      [1, { v: "IRN No", s: { ...C.lbl, border: "lt" } }],
      [5, { v: irn.slice(0, 38), s: { ...C.txt, border: "rt" } }]], 12.75);
    row([[5, { v: b.name ? `Messrs ${b.name},` : "", s: { ...C.txt, border: "l" } }],
      [1, { v: "", s: { ...C.txt, border: "l" } }],
      [5, { v: irn.slice(38), s: { ...C.txt, border: "r" } }]], 12.75);
    row([[5, { v: b.brand ? `T/A ${b.brand}` : "", s: { ...C.txt, border: "l" } }],
      [1, { v: "Ack No", s: { ...C.lbl, border: "l" } }],
      [5, { v: s.ackNo || "", s: { ...C.txt, border: "r" } }]], 12.75);
    const bAddr = addrLines({ addr: b.addr });
    row([[5, { v: bAddr[0] || "", s: { ...C.txt, border: "l" } }],
      [1, { v: "", s: { ...C.txt, border: "l" } }], [5, { v: "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[5, { v: [bAddr[1], b.country && `(${b.country})`].filter(Boolean).join(" "), s: { ...C.txt, border: "lb" } }],
      [1, { v: "Ack Dt", s: { ...C.lbl, border: "l" } }],
      [5, { v: s.ackDt || "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[1, { v: "Invoice of:", s: { ...C.lbl, border: "lt" } }],
      [4, { v: desc3[0], s: { ...C.txt, border: "t", align: "left" } }],
      [3, { v: "Country of Origin", s: { ...C.lbl, border: "lt", align: "center" } }],
      [3, { v: "Country of Final Destination", s: { ...C.lbl, border: "rt", align: "center" } }]]);
    row([[1, { v: "", s: { ...C.txt, border: "l" } }],
      [4, { v: desc3[1], s: { ...C.txt, align: "left" } }],
      [3, { v: E.origin || "INDIA", s: { ...C.txt, border: "lb", align: "center" } }],
      [3, { v: (s.finalDest || b.country || "").toUpperCase(), s: { ...C.txt, border: "rb", align: "center" } }]], 12.75);
    row([[1, { v: "", s: { ...C.txt, border: "l" } }],
      [4, { v: desc3[2], s: { ...C.txt, align: "left" } }],
      [1, { v: "BL. NO.", s: { ...C.lbl, border: "l" } }],
      [5, { v: dated(s.blNo, s.blDate), s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Pre-Carraige by:", s: { ...C.lbl, border: "lt" } }],
      [3, { v: "Place of Receipt by Pre-Carraige", s: { ...C.lbl, border: "lrt" } }],
      [1, { v: "Shipped Per", s: { ...C.lbl, border: "l" } }],
      [5, { v: s.vessel || "", s: { ...C.txt, border: "r" } }]]);
    row([[2, { v: s.preCarriage || "", s: { ...C.txt, border: "lb" } }],
      [3, { v: s.receiptPlace || "", s: { ...C.txt, border: "lrb" } }],
      [1, { v: "S/B No:", s: { ...C.lbl, border: "l" } }],
      [5, { v: dated(s.sbNo, s.sbDate), s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Shipped per:", s: { ...C.lbl, border: "lt" } }],
      [3, { v: "Port of Loading:", s: { ...C.lbl, border: "lrt" } }],
      [2, { v: "Terms of Delivery:", s: { ...C.lbl, border: "lt" } }],
      [4, { v: (s.terms || "").toUpperCase(), s: { ...C.txt, border: "rt" } }]], 12.75);
    row([[2, { v: s.vessel || "", s: { ...C.txt, border: "lb" } }],
      [3, { v: s.pol || "", s: { ...C.txt, border: "lrb" } }],
      [2, { v: "Terms of Payment:", s: { ...C.lbl, border: "l" } }],
      [4, { v: s.payment || "D.P.SIGHT DRAFT", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Port of Discharge:", s: { ...C.lbl, border: "lt" } }],
      [3, { v: "Port of destination", s: { ...C.lbl, border: "lrt" } }],
      [2, { v: "Through:", s: { ...C.lbl, border: "l" } }],
      [4, { v: s.bank || "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: (s.pod || b.shipTo || "").toUpperCase(), s: { ...C.txt, border: "lb" } }],
      [3, { v: (s.finalDest || s.pod || b.shipTo || "").toUpperCase(), s: { ...C.txt, border: "lrb" } }],
      [2, { v: "", s: { ...C.txt, border: "lb" } }],
      [4, { v: s.bankAddr || "", s: { ...C.txt, border: "rb" } }]], 12.75);
  }

  /* Row 22 is the column header of the goods, and 23-25 the marks and the
     description that stand beside them. Both pages carry them. */
  function goodsHead(grid, mirror) {
    const { row } = grid;
    const H = (v) => ({ v, s: { ...C.lbl, border: "box", align: "center" } });
    row([[1, H("Marks & Nos.")], [3, H("No & Kinds of Pkgs   Description of Goods")],
      [1, H("Quantity")], [1, H("Rate")], [1, H("Amount")], [1, H("Rate")],
      [1, H("Taxable Amount")], [1, H("GST Rate")], [1, H("GST Amount")]]);
    const M = (v, r) => (mirror ? { f: `Page1!${r}`, s: { ...C.txt, border: "lr" } } : { v, s: { ...C.txt, border: "lr" } });
    row([[1, M(`${marks.prefix} NOS :`, "A23")],
      [4, mirror ? { f: "Page1!B23", s: { ...C.txt, border: "lr", align: "left" } }
        : { v: `${s.pkgs || `${sum(rows, "boxes")} PACKAGES`} CONTAINING`, s: { ...C.txt, border: "lr", align: "left" } }],
      [2, { v: "FOB MUMBAI IN US$", s: { ...C.lbl, border: "lr", align: "center" } }],
      [2, { v: "FOB MUMBAI IN INR", s: { ...C.lbl, border: "lr", align: "center" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }]]);
    row([[1, M(`${marks.start} - ${marks.end}`, "A24")],
      [4, mirror ? { f: "Page1!B24", s: { ...C.txt, border: "lr", align: "left" } }
        : { v: desc2[0], s: { ...C.txt, border: "lr", align: "left" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }],
      [2, { v: `EX. RATE @ Rs.${num(ex)}`, s: { ...C.txt, border: "lr", align: "center" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }]], 12.75);
  }

  /* One line of the goods frame, whichever page it lands on. */
  function bodyLine(grid, line, at) {
    const { row } = grid;
    if (!line) { row([[1, { v: "", s: G.colA }], [10, { v: "", s: G.fill }]]); return; }
    if (line.kind === "head") {
      row([[1, { v: "", s: G.colA }], [6, { v: line.band.head, s: { ...G.head, align: "left" } }],
        ...blank(4, G.fill)]);
      return;
    }
    if (line.kind === "cols") {
      const B = line.band;
      const cells = [[1, { v: "", s: G.colA }], [1, { v: "CODE", s: G.cols }],
        [B.wide ? 2 : 1, { v: B.size, s: G.cols }]];
      if (B.len) cells.push([1, { v: "LEN (MM)", s: G.cols }]);
      else if (!B.wide) cells.push([1, { v: "", s: G.fill }]);
      cells.push([1, { v: "PIECES", s: G.cols }], [1, { v: B.rate, s: G.cols }], ...blank(5, G.fill));
      row(cells);
      return;
    }
    const { band, r } = line;
    const rate = band.per100 ? r.fobPc * 100 : r.fobPc;
    const gst = gstRate(r.it.hsn);
    const cells = [[1, { v: "", s: G.colA }], [1, codeCell(r.it.code, G.code)],
      [band.wide ? 2 : 1, { v: r.it.size || "", s: G.ctr }]];
    if (band.len) cells.push([1, { v: r.it.length || "", s: G.ctr }]);
    else if (!band.wide) cells.push([1, { v: "", s: G.ctr }]);
    cells.push(
      [1, { v: r.pieces, t: "n", s: G.num }],
      [1, { v: rate, t: "n", s: G.usd }],
      [1, { f: `E${at}*F${at}${band.per100 ? "/100" : ""}`, s: G.usdL }],
      [1, { f: `I${at}/E${at}`, s: G.inr }],
      [1, { f: `G${at}*${ex}`, s: G.inr }],
      [1, { v: gst, t: "n", s: G.pct }],
      [1, { f: `ROUND(I${at}*J${at},)`, s: G.inr }],
    );
    row(cells);
  }

  /* The declaration and the signature, at the foot of both pages. */
  function footBlock(grid) {
    const { row } = grid;
    const L7 = (v, edge) => [7, { v, s: { ...C.lbl, border: edge } }];
    const R4 = (v, edge, fmt) => [4, { v, s: { ...C.lbl, border: edge, align: "right", ...(fmt ? { fmt } : {}) } }];
    row([L7(E.gstin ? `GSTIN : ${E.gstin}` : "", "lt"), R4(" FOR JAIKVIN GLOBAL".replace("JAIKVIN GLOBAL", E.name), "rt", CI_PLAIN)], 13.5);
    row([L7(E.pan ? `PAN No: ${E.pan}` : "", "l"), R4("", "r")], 12.75);
    row([L7("Declaration:-", "l"), R4("", "r")], 12.75);
    row([L7("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", "l"), R4("", "r")], 12.75);
    row([L7("SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX", "l"), R4("", "r")], 12.75);
    row([L7("We intend to claim rewards under RoDTEP", "lb"), R4(" PROPRIETOR", "rb", CI_PLAIN)]);
  }

  const SHEET = {
    widths: [13.83203125, 14.1640625, 11.83203125, 11.83203125, 11.83203125,
      13.33203125, 13.33203125, 13.33203125, 17, 13.33203125, 13.33203125],
    defaultRowHeight: 12,
    colStyle: F,
    page: {
      paper: 9, orientation: "portrait", scale: 72, fit: true, centered: true,
      margins: { left: 0.511811, right: 0.236220, top: 0.236220, bottom: 0.236220, header: 0, footer: 0 },
    },
  };

  /* ---- Page 1 ------------------------------------------------------------ */
  const g1 = formGrid(11);
  headBlock(g1);
  goodsHead(g1, false);
  // Row 25 closes the description box; Page 2 mirrors it rather than repeat it.
  g1.row([[1, { v: String(marks.end), s: { ...C.txt, border: "lr" } }],
    [4, { v: desc2[1], s: { ...C.txt, border: "lr", align: "left" } }],
    ...blank(6, { ...C.txt, border: "lr" })], 12.75);
  for (let i = 0; i < CI_P1_BODY; i++) bodyLine(g1, p1[i], CI_P1_TOP + i);
  const p1First = CI_P1_TOP + p1.findIndex((l) => l.kind === "item");
  const p1Last = CI_P1_TOP + CI_P1_BODY - 1;
  const p1Has = p1.some((l) => l.kind === "item");
  const cf = (col) => (p1Has ? `SUM(${col}${p1First}:${col}${p1Last})` : "0");
  g1.row([[1, { v: "", s: G.totV }], [3, { v: "Total C/F Page :2", s: { ...G.totL, align: "left" } }],
    [2, { v: "", s: G.totV }], [1, { f: cf("G"), s: G.sumU }], [1, { v: "", s: G.totV }],
    [1, { f: cf("I"), s: G.sumR }], [1, { v: "", s: G.totV }], [1, { f: cf("K"), s: G.sumR }]], 12.75);
  footBlock(g1);

  /* ---- Page 2 — its head is Page 1's, cell for cell ---------------------- */
  const g2 = formGrid(11);
  const mirror = (r) => (g1.rows[r - 1] || []).map((c, i) => (c && (c.f || (c.v !== "" && c.v != null))
    ? { s: c.s, f: `Page1!${colLetter(i + 1)}${r}` } : c));
  for (let r = 1; r <= 21; r++) {
    const cells = mirror(r);
    if (r === 1) cells[10] = { v: "Page 2", s: { ...C.lbl, border: "b", align: "center" } };
    g2.rows.push(cells);
    g2.heights[r - 1] = g1.heights[r - 1];
  }
  // Rows 2-21's merges are Page 1's, and row 2's name box runs down into row 3.
  g1.merges.filter((m) => /^[A-K](\d+):/.test(m) && Number(/^[A-K](\d+):/.exec(m)[1]) <= 21)
    .forEach((m) => g2.merges.push(m));
  goodsHead(g2, true);
  g2.row([[1, { f: "Page1!A25", s: { ...C.txt, border: "lr" } }],
    [4, { f: "Page1!B25", s: { ...C.txt, border: "lr", align: "left" } }],
    [1, { v: "BAL B/F…", s: { ...C.lbl, border: "lr" } }],
    [1, { f: "Page1!G82", s: { ...C.txt, border: "lr", fmt: CI_USD } }],
    [1, { v: "", s: { ...C.txt, border: "lr" } }],
    [1, { f: "Page1!I82", s: { ...C.txt, border: "lr", fmt: RUPEE } }],
    [1, { v: "", s: { ...C.txt, border: "lr" } }],
    [1, { f: "Page1!K82", s: { ...C.txt, border: "lr", fmt: RUPEE } }]], 12.75);
  const p2Body = ciP2Body(p2);
  for (let i = 0; i < p2Body; i++) bodyLine(g2, p2[i], CI_P2_TOP + i);

  /* The left margin of Page 2 states the container, the weights and the freight
     terms — the only things on the form that are not part of the grid. */
  const netWt = Number(s.netWt) || sum(rows, "netTotal");
  const grossWt = Number(s.grossWt) || sum(rows, "grossTotal");
  const fobUsd = sum(rows, "fobTotal");
  const margin = {
    5: ["Container No.", C.lbl], 6: [s.container || "", C.txt],
    15: ["Seal No.", C.lbl], 16: [s.seal || "", C.txt],
    24: ["Nett Wt.", C.lbl], 25: [netWt, C.txt], 26: ["KGS", C.txt],
    33: ["Gross Wt", C.lbl], 34: [grossWt, C.txt], 35: ["KGS", C.txt],
    41: ["Freight", C.lbl], 42: ["Payable at", C.txt], 43: ["Destination", C.txt],
  };
  /* Keyed by how far down the frame each stands rather than by an absolute
     row, so they keep their place however deep the goods run. */
  const setA = (r, cell, st) => {
    const was = g2.rows[r - 1]?.[0];
    if (was) g2.rows[r - 1][0] = { ...was, ...cell, s: { ...st, border: was.s?.border } };
  };
  Object.entries(margin).forEach(([i, [v, st]]) => setA(CI_P2_TOP + Number(i), { v }, st));

  const p2First = CI_P2_TOP - 1;                 // the brought-forward line
  const p2Last = CI_P2_TOP + p2Body - 1;
  /* The FOB value box hangs off the totals rather than off a fixed row: the
     label, the dollars under it, and the rupees on the totals line itself. */
  const totRow = p2Last + 1;
  setA(totRow - 2, { v: "FOB VALUE" }, C.lbl);
  setA(totRow - 1, { v: undefined, f: `G${totRow}` }, { ...C.txt, fmt: CI_USD });
  const tot = (col) => `SUM(${col}${p2First}:${col}${p2Last})`;
  g2.row([[1, { f: "I75", s: { ...C.txt, border: "lr", fmt: RUPEE } }],
    [3, { v: "Total FOB Mumbai Value :", s: { ...G.totL, align: "left" } }],
    [2, { v: "", s: G.totV }], [1, { f: tot("G"), s: G.sumU }], [1, { v: "", s: G.totV }],
    [1, { f: tot("I"), s: G.sumR }], [1, { v: "", s: G.totV }], [1, { f: tot("K"), s: G.sumR }]], 12.75);

  /* ---- the GST breakup, totalled by HSN code ---------------------------- */
  const box = (v, st = C.txt, fmt) => ({ v, s: { ...st, border: "box", ...(fmt ? { fmt } : {}) } });
  const bh = (v) => box(v, { ...C.lbl, align: "center" });
  /* The breakup starts a column in from the frame, as their sheet sets it: the
     marks column runs on blank beside it. */
  g2.row([[1, { v: "", s: { ...C.txt, border: "lb" } }], [2, bh("BREAKUP OF GST")], [1, bh("UOM")],
    [1, bh("VALUE (US$)")], [2, bh("TAXABLE VALUE (INR)")], [1, bh("CGST")], [1, bh("SGST")],
    [1, bh("IGST")], [1, bh("TOTAL GST")]], 12.75);

  const codes = [...new Set(bands.map((x) => x.hsn).filter(Boolean))];
  const first = g2.at() + 1;
  const slots = Math.max(codes.length, CI_HSN_ROWS);
  Array.from({ length: slots }, (_, i) => codes[i]).forEach((hsn) => {
    const at = g2.at() + 1;
    if (!hsn) {                                    // a reserved line, ruled but empty
      const e = { ...C.txt, border: "box" };
      g2.row([[1, { v: "", s: C.txt }], [2, { v: "", s: e }], [1, { v: "", s: e }], [1, { v: "", s: e }],
        [2, { v: "", s: e }], [1, { v: "", s: e }], [1, { v: "", s: e }], [1, { v: "", s: e }],
        [1, { v: "", s: e }]], 13.5);
      return;
    }
    const r1 = hsnRuns(p1, CI_P1_TOP, hsn), r2 = hsnRuns(p2, CI_P2_TOP, hsn);
    const agg = (col) => {
      const refs = [rangeRefs(r1, col, "Page1"), rangeRefs(r2, col, "")].filter(Boolean).join(",");
      return refs ? `SUM(${refs})` : "0";
    };
    g2.row([[1, { v: "", s: C.txt }], [2, box(`HSN CODE : ${hsn}`, C.lbl)],
      [1, { f: agg("E"), s: { ...C.txt, border: "box", align: "center", fmt: "#,##0" } }],
      [1, { f: agg("G"), s: { ...C.txt, border: "box", fmt: CI_USD } }],
      [2, { f: agg("I"), s: { ...C.txt, border: "box", fmt: RUPEE } }],
      [1, box(0, C.txt, RUPEE)], [1, box(0, C.txt, RUPEE)],
      [1, { f: agg("K"), s: { ...C.txt, border: "box", fmt: RUPEE } }],
      [1, { f: `SUM(H${at}:J${at})`, s: { ...C.lbl, border: "box", fmt: RUPEE } }]], 13.5);
  });
  const last = g2.at();
  const down = (col) => (codes.length ? `SUM(${col}${first}:${col}${last})` : "0");
  g2.row([[1, { v: "", s: C.txt }], [2, box("TOTAL", C.lbl)],
    [1, { f: down("D"), s: { ...C.lbl, border: "box", align: "center", fmt: "#,##0" } }],
    [1, { f: down("E"), s: { ...C.lbl, border: "box", fmt: CI_USD } }],
    [2, { f: down("F"), s: { ...C.lbl, border: "box", fmt: RUPEE } }],
    [1, { f: down("H"), s: { ...C.lbl, border: "box", fmt: RUPEE } }],
    [1, { f: down("I"), s: { ...C.lbl, border: "box", fmt: RUPEE } }],
    [1, { f: down("J"), s: { ...C.lbl, border: "box", fmt: RUPEE } }],
    [1, { f: down("K"), s: { ...C.lbl, border: "box", fmt: RUPEE } }]], 13.5);

  const taxTot = fobUsd * ex;
  g2.row([[1, { v: "", s: { ...C.txt, border: "lb" } }],
    [10, { v: amountWords(fobUsd, "US DOLLARS", "CENTS", false), s: { ...C.lbl, border: "rb" } }]], 12.75);
  g2.row([[1, { v: "", s: { ...C.txt, border: "l" } }],
    [10, { v: amountWords(taxTot, "INDIAN RUPEES", "PAISE", true), s: { ...C.lbl, border: "r" } }]], 12.75);
  footBlock(g2);

  /* ---- Annx — the annexure customs asks for ----------------------------- */
  const A = { font: "ref9", border: false, valign: "center" };
  const AB = { ...A, font: "ref9b" };
  const abox = (v, st = A, extra = {}) => ({ v, s: { ...st, border: "box", ...extra } });
  const ga = formGrid(7);
  ga.row([[7, { v: "", s: A }]]);
  for (let i = 0; i < 6; i++) ga.row([[1, { v: "", s: A }]]);
  ga.row([[7, { v: "ANNEXTURE TO INVOICE", s: { ...AB, align: "center" } }]]);
  ga.row([[1, { v: "", s: A }]]);
  ga.row([[1, abox("Inv No & Dt", AB)], [1, abox(invRef)], [1, abox("NO OF PKGS", AB)],
    [1, abox(sum(rows, "boxes"), A, { fmt: "#,##0", align: "center" })],
    [1, abox("Shipment to", AB)], [2, abox((s.pod || b.shipTo || "").toUpperCase())]]);

  bands.forEach((band) => {
    ga.row([[1, { v: "", s: A }]]);
    const per = band.per100 ? "FOB / 100 PCS US$" : "FOB / PC US$";
    ga.row([[2, abox("ITEM CODE", AB, { align: "center" })], [1, abox("QUANTITY", AB, { align: "center" })],
      [2, abox(per, AB, { align: "center" })], [1, abox("NET WT", AB, { align: "center" })],
      [1, abox("RATE / KG", AB, { align: "center" })]]);
    ga.row([[2, abox(band.label, AB)], [1, abox("PCS", A, { align: "center" })],
      [1, abox("Unit ", A, { align: "center" })], [1, abox("Total ", A, { align: "center" })],
      [1, abox("KGS", A, { align: "center" })], [1, abox("US$", A, { align: "center" })]]);
    band.rows.forEach((r) => {
      const at = ga.at() + 1;
      ga.row([[1, codeCell(r.it.code, { ...A, border: "box" })], [1, { v: "", s: { ...A, border: "box" } }],
        [1, abox(r.pieces, A, { fmt: "#,##0", align: "center" })],
        [1, { v: band.per100 ? r.fobPc * 100 : r.fobPc, t: "n", s: { ...A, border: "box", fmt: CI_USD } }],
        [1, { f: `C${at}*D${at}${band.per100 ? "/100" : ""}`, s: { ...A, border: "box", fmt: CI_USD } }],
        [1, { v: r.netTotal, t: "n", s: { ...A, border: "box", fmt: "#,##0.000" } }],
        [1, { f: `IF(F${at},E${at}/F${at},0)`, s: { ...A, border: "box", fmt: "#,##0.00" } }]]);
    });
  });
  ga.row([[1, { v: "", s: A }]]);
  const aRows = [];
  ga.rows.forEach((r, i) => { if (r[4] && r[4].f && String(r[4].f).startsWith("C")) aRows.push(i + 1); });
  const aRuns = aRows.reduce((acc, n) => {
    const l = acc[acc.length - 1];
    if (l && n === l[1] + 1) l[1] = n; else acc.push([n, n]);
    return acc;
  }, []);
  const aSum = (col) => (aRuns.length ? `SUM(${rangeRefs(aRuns, col, "")})` : "0");
  ga.row([[1, { v: "TOTAL", s: { ...AB, border: "box" } }], ...blank(3, { ...A, border: "box" }),
    [1, { f: aSum("E"), s: { ...AB, border: "box", fmt: CI_USD } }],
    [1, { f: aSum("F"), s: { ...AB, border: "box", fmt: "#,##0.000" } }],
    [1, { v: "", s: { ...A, border: "box" } }]]);

  return [
    fitSheet({ name: "Page1", rows: g1.rows, merges: g1.merges, heights: g1.heights, ...SHEET }, { widen: false }),
    fitSheet({ name: "Page2", rows: g2.rows, merges: g2.merges, heights: g2.heights, ...SHEET }, { widen: false }),
    fitSheet({
      name: "Annx", rows: ga.rows, merges: ga.merges, heights: ga.heights,
      widths: [12.6640625, 30.83203125, 13.83203125, 13.33203125, 14.33203125, 13.33203125, 11.5],
      defaultColWidth: 13.1640625, defaultRowHeight: 15, colStyle: A,
      page: {
        paper: 9, orientation: "portrait", scale: 83, fit: true, fitH: 0,
        margins: { left: 0.511811, right: 0.511811, top: 0.511811, bottom: 0.511811, header: 0, footer: 0 },
      },
    }, { widen: false }),
  ];
}

/* The same form on screen and on paper. The worksheet above rules the frame
   with cell borders; here the eleven columns are one table per page, ruled by
   the same rules — solid down, hairline between the goods — so the preview,
   the PDF and the .xlsx are the one document. */
function customsInvoiceHtml(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx), ex = exRate(ctx);
  const bands = invoiceBands(ctx);
  const { p1, p2 } = invoiceLayout(bands);
  const marks = ciMarks(ctx, rows);
  const desc3 = goodsWrapped(bands, 42, 3);
  const desc2 = goodsWrapped(bands, 44, 2);
  const addr = addrLines(E), bAddr = addrLines({ addr: b.addr });
  const dated = (no, d) => (no ? `${no}${d ? ` DT. ${ddmm(d)}` : ""}` : "");
  const invRef = `${ctx.inv.invoiceNo || ""}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}`;
  const orderRef = b.orderNo ? `${b.orderNo}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}` : poHeaderList(ctx);
  const irn = String(s.irn || "");
  const fobUsd = sum(rows, "fobTotal"), taxTot = fobUsd * ex;

  const td = (v, cls = "", span = 1) =>
    `<td${span > 1 ? ` colspan="${span}"` : ""}${cls ? ` class="${cls}"` : ""}>${v == null || v === "" ? "&nbsp;" : v}</td>`;
  const lb = (v, span = 1) => td(esc(v), "k", span);
  const vl = (v, span = 1) => td(esc(v), "", span);

  const head = () => `
    <tr class="nb"><td class="nb mer">MERCHANT</td>${td("INVOICE", "nb ttl bb", 10)}</tr>
    <tr><td class="brand lt" rowspan="2" colspan="5">${esc(E.name)}</td>
      ${td(esc("Invoice No. "), "k lt")}${td(esc(invRef), "rt", 4)}${td(esc("Exporter's Ref."), "k rt")}</tr>
    <tr>${td("Date:", "k lf")}${td("", "rt0", 4)}${td(esc(E.iec ? `IEC ${E.iec}` : ""), "rt0")}</tr>
    <tr>${td(esc(E.sub || ""), "lf", 5)}${td(esc("Buyers Order No: "), "k lf", 2)}${td(esc(orderRef), "rt0", 4)}</tr>
    <tr>${td(esc(addr[0] || ""), "lf", 5)}${td("", "lf", 2)}${td("", "rt0", 4)}</tr>
    <tr>${td(esc(addr[1] || ""), "lf", 5)}${td("Other Reference(s):", "k lf", 2)}${td(esc(s.otherRef || ""), "rt0", 4)}</tr>
    <tr>${td(esc([E.tel && `Tel: ${E.tel}`, E.email && `E-Mail: ${E.email}`].filter(Boolean).join(" ")), "lf bb", 5)}
      ${td("", "lf", 2)}${td("", "rt0", 4)}</tr>
    <tr>${td("On Account &amp; Risks of:", "k lt", 2)}${td("", "lt0", 3)}${td("IRN No", "k lt")}${td(esc(irn.slice(0, 38)), "rt", 5)}</tr>
    <tr>${td(esc(b.name ? `Messrs ${b.name},` : ""), "lf", 5)}${td("", "lf")}${td(esc(irn.slice(38)), "rt0", 5)}</tr>
    <tr>${td(esc(b.brand ? `T/A ${b.brand}` : ""), "lf", 5)}${td("Ack No", "k lf")}${td(esc(s.ackNo || ""), "rt0", 5)}</tr>
    <tr>${td(esc(bAddr[0] || ""), "lf", 5)}${td("", "lf")}${td("", "rt0", 5)}</tr>
    <tr>${td(esc([bAddr[1], b.country && `(${b.country})`].filter(Boolean).join(" ")), "lf bb", 5)}
      ${td("Ack Dt", "k lf")}${td(esc(s.ackDt || ""), "rt0", 5)}</tr>
    <tr>${td("Invoice of:", "k lt")}${td(esc(desc3[0]), "lt", 4)}
      ${td("Country of Origin", "k lt c", 3)}${td("Country of Final Destination", "k rt c", 3)}</tr>
    <tr>${td("", "lf")}${td(esc(desc3[1]), "", 4)}
      ${td(esc(E.origin || "INDIA"), "lf bb c", 3)}${td(esc((s.finalDest || b.country || "").toUpperCase()), "rt0 bb c", 3)}</tr>
    <tr>${td("", "lf")}${td(esc(desc3[2]), "", 4)}${td("BL. NO.", "k lf")}${td(esc(dated(s.blNo, s.blDate)), "rt0", 5)}</tr>
    <tr>${td("Pre-Carraige by:", "k lt", 2)}${td("Place of Receipt by Pre-Carraige", "k lrt", 3)}
      ${td("Shipped Per", "k lf")}${td(esc(s.vessel || ""), "rt0", 5)}</tr>
    <tr>${td(esc(s.preCarriage || ""), "lf bb", 2)}${td(esc(s.receiptPlace || ""), "lrb", 3)}
      ${td("S/B No:", "k lf")}${td(esc(dated(s.sbNo, s.sbDate)), "rt0", 5)}</tr>
    <tr>${td("Shipped per:", "k lt", 2)}${td("Port of Loading:", "k lrt", 3)}
      ${td("Terms of Delivery:", "k lt", 2)}${td(esc((s.terms || "").toUpperCase()), "rt", 4)}</tr>
    <tr>${td(esc(s.vessel || ""), "lf bb", 2)}${td(esc(s.pol || ""), "lrb", 3)}
      ${td("Terms of Payment:", "k lf", 2)}${td(esc(s.payment || "D.P.SIGHT DRAFT"), "rt0", 4)}</tr>
    <tr>${td("Port of Discharge:", "k lt", 2)}${td("Port of destination", "k lrt", 3)}
      ${td("Through:", "k lf", 2)}${td(esc(s.bank || ""), "rt0", 4)}</tr>
    <tr>${td(esc((s.pod || b.shipTo || "").toUpperCase()), "lf bb", 2)}${td(esc((s.finalDest || s.pod || b.shipTo || "").toUpperCase()), "lrb", 3)}
      ${td("", "lf bb", 2)}${td(esc(s.bankAddr || ""), "rt0 bb", 4)}</tr>
    <tr>${["Marks &amp; Nos."].map((h) => td(h, "h")).join("")}${td("No &amp; Kinds of Pkgs   Description of Goods", "h", 3)}
      ${["Quantity", "Rate", "Amount", "Rate", "Taxable Amount", "GST Rate", "GST Amount"].map((h) => td(h, "h")).join("")}</tr>
    <tr>${vl(`${marks.prefix} NOS :`)}${td(esc(`${s.pkgs || `${sum(rows, "boxes")} PACKAGES`} CONTAINING`), "l", 4)}
      ${lb("FOB MUMBAI IN US$", 2)}${lb("FOB MUMBAI IN INR", 2)}${td("", "", 2)}</tr>
    <tr>${vl(`${marks.start} - ${marks.end}`)}${td(esc(desc2[0]), "l", 4)}${td("", "", 2)}
      ${td(esc(`EX. RATE @ Rs.${num(ex)}`), "c", 2)}${td("", "", 2)}</tr>
    <tr>${vl(String(marks.end))}${td(esc(desc2[1]), "l", 4)}${td("", "", 6)}</tr>`;

  const line = (l) => {
    if (!l) return `<tr class="gd">${td("")}${td("", "", 10)}</tr>`;
    if (l.kind === "head") return `<tr class="gd"><td>&nbsp;</td>${td(esc(l.band.head), "bnd l", 6)}${td("", "", 4)}</tr>`;
    if (l.kind === "cols") {
      const B = l.band;
      const cells = [td("CODE", "hd"), td(esc(B.size), "hd", B.wide ? 2 : 1)];
      if (B.len) cells.push(td("LEN (MM)", "hd"));
      else if (!B.wide) cells.push(td(""));
      cells.push(td("PIECES", "hd"), td(esc(B.rate), "hd"), td("", "", 5));
      return `<tr class="gd"><td>&nbsp;</td>${cells.join("")}</tr>`;
    }
    const { band, r } = l;
    const rate = band.per100 ? r.fobPc * 100 : r.fobPc;
    const g = gstRate(r.it.hsn), tax = r.fobTotal * ex;
    const cells = [td(esc(r.it.code), "c"), td(esc(r.it.size), "c", band.wide ? 2 : 1)];
    if (band.len) cells.push(td(esc(r.it.length), "c"));
    else if (!band.wide) cells.push(td(""));
    cells.push(
      `<td class="c" data-t="int" data-v="${r.pieces}">${r.pieces.toLocaleString("en-IN")}</td>`,
      `<td class="c" data-t="usd" data-v="${rate}">${usd(rate)}</td>`,
      `<td data-t="usd" data-v="${r.fobTotal}">${usd(r.fobTotal)}</td>`,
      `<td data-t="inr" data-v="${r.pieces ? tax / r.pieces : 0}">${inr2(r.pieces ? tax / r.pieces : 0)}</td>`,
      `<td data-t="inr" data-v="${tax}">${inr2(tax)}</td>`,
      `<td class="c">${(g * 100).toFixed(0)}%</td>`,
      `<td data-t="inr" data-v="${Math.round(tax * g)}">${inr2(Math.round(tax * g))}</td>`,
    );
    return `<tr class="ln"><td>&nbsp;</td>${cells.join("")}</tr>`;
  };

  const foot = () => `
    <tr>${td(esc(E.gstin ? `GSTIN : ${E.gstin}` : ""), "lt", 7)}${td(esc(` FOR ${E.name}`), "k rt r", 4)}</tr>
    <tr>${td(esc(E.pan ? `PAN No: ${E.pan}` : ""), "lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("Declaration:-", "k lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", "lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX", "lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("We intend to claim rewards under RoDTEP", "lf bb", 7)}${td(" PROPRIETOR", "k rt0 bb r", 4)}</tr>`;

  const cfUsd = p1.reduce((n, l) => n + (l.kind === "item" ? l.r.fobTotal : 0), 0);
  const cfTax = cfUsd * ex;
  const cfGst = p1.reduce((n, l) => n + (l.kind === "item" ? Math.round(l.r.fobTotal * ex * gstRate(l.r.it.hsn)) : 0), 0);
  const gstAll = rows.reduce((n, r) => n + Math.round(r.fobTotal * ex * gstRate(r.it.hsn)), 0);

  const colg = `<colgroup>${[12.6, 12.9, 10.8, 10.8, 10.8, 12.1, 12.1, 12.1, 15.5, 12.1, 12.1]
    .map((w) => `<col style="width:${(w / 133.9) * 100}%">`).join("")}</colgroup>`;

  const page1 = `<table class="wb ci">${colg}<tbody>${head()}
    ${Array.from({ length: CI_P1_BODY }, (_, i) => line(p1[i])).join("")}
    <tr class="tt">${td("")}${td("Total C/F Page :2", "k l", 3)}${td("", "", 2)}
      ${td(usd(cfUsd), "b dbl")}${td("")}${td(inr2(cfTax), "b dbl")}${td("")}${td(inr2(cfGst), "b dbl")}</tr>
    ${foot()}</tbody></table>`;

  /* Page 2's left margin carries the container, the weights and the freight
     terms; the rest of it is the same frame continued. */
  const netWt = Number(s.netWt) || sum(rows, "netTotal");
  const grossWt = Number(s.grossWt) || sum(rows, "grossTotal");
  // Keyed by the line's place in the frame, so it lands on the same row of the
  // form as the worksheet puts it — the frame starts at row CI_P2_TOP.
  const margin = {
    5: ["Container No.", "k"], 6: [s.container || "", ""],
    15: ["Seal No.", "k"], 16: [s.seal || "", ""],
    24: ["Nett Wt.", "k"], 25: [num(netWt, 3), ""], 26: ["KGS", ""],
    33: ["Gross Wt", "k"], 34: [num(grossWt, 3), ""], 35: ["KGS", ""],
    41: ["Freight", "k"], 42: ["Payable at", ""], 43: ["Destination", ""],
    // The FOB value box sits at the foot of the frame, whatever its depth.
    [ciP2Body(p2) - 2]: ["FOB VALUE", "k"], [ciP2Body(p2) - 1]: [usd(fobUsd), ""],
  };
  const body2 = Array.from({ length: ciP2Body(p2) }, (_, i) => {
    const html = line(p2[i]);
    const m = margin[i];
    return m ? html.replace("<td>&nbsp;</td>", td(esc(String(m[0])), m[1])) : html;
  }).join("");

  const hsnCodes = [...new Set(bands.map((x) => x.hsn).filter(Boolean))];
  const breakup = Array.from({ length: Math.max(hsnCodes.length, CI_HSN_ROWS) },
    (_, i) => hsnCodes[i]).map((hsn) => {
    if (!hsn) return `<tr>${td("", "lf")}${td("", "bx", 2)}${td("", "bx")}${td("", "bx")}${td("", "bx", 2)}
      ${td("", "bx")}${td("", "bx")}${td("", "bx")}${td("", "bx")}</tr>`;
    const mine = rows.filter((r) => hsnText(r.it) === hsn);
    const pcs = sum(mine, "pieces"), val = sum(mine, "fobTotal");
    const tax = val * ex, g = mine.reduce((n, r) => n + Math.round(r.fobTotal * ex * gstRate(r.it.hsn)), 0);
    return `<tr>${td("", "lf")}${td(esc(`HSN CODE : ${hsn}`), "k bx", 2)}
      ${td(pcs.toLocaleString("en-IN"), "bx c")}${td(usd(val), "bx")}${td(inr2(tax), "bx", 2)}
      ${td(inr2(0), "bx")}${td(inr2(0), "bx")}${td(inr2(g), "bx")}${td(inr2(g), "bx b")}</tr>`;
  }).join("");

  const page2 = `<table class="wb ci">${colg}<tbody>${head()}
    <tr class="ln">${td("")}${td("", "l", 4)}${td("BAL B/F…", "k")}${td(usd(cfUsd))}${td("")}
      ${td(inr2(cfTax))}${td("")}${td(inr2(cfGst))}</tr>
    ${body2}
    <tr class="tt">${td(inr2(taxTot), "")}${td("Total FOB Mumbai Value :", "k l", 3)}${td("", "", 2)}
      ${td(usd(fobUsd), "b dbl")}${td("")}${td(inr2(taxTot), "b dbl")}${td("")}${td(inr2(gstAll), "b dbl")}</tr>
    <tr>${td("", "lf bb")}${td("BREAKUP OF GST", "k bx c", 2)}${td("UOM", "k bx c")}${td("VALUE (US$)", "k bx c")}
      ${td("TAXABLE VALUE (INR)", "k bx c", 2)}${td("CGST", "k bx c")}${td("SGST", "k bx c")}
      ${td("IGST", "k bx c")}${td("TOTAL GST", "k bx c")}</tr>
    ${breakup}
    <tr>${td("", "lf")}${td("TOTAL", "k bx", 2)}${td(sum(rows, "pieces").toLocaleString("en-IN"), "k bx c")}
      ${td(usd(fobUsd), "k bx")}${td(inr2(taxTot), "k bx", 2)}${td(inr2(0), "k bx")}${td(inr2(0), "k bx")}
      ${td(inr2(gstAll), "k bx")}${td(inr2(gstAll), "k bx")}</tr>
    <tr>${td("", "lf bb")}${td(esc(amountWords(fobUsd, "US DOLLARS", "CENTS", false)), "k rt0 bb", 10)}</tr>
    <tr>${td("", "lf")}${td(esc(amountWords(taxTot, "INDIAN RUPEES", "PAISE", true)), "k rt0", 10)}</tr>
    ${foot()}</tbody></table>`;

  const annx = `<table class="wb ci annx">
    <colgroup>${[12.7, 30.8, 13.8, 13.3, 14.3, 13.3, 11.5]
    .map((w) => `<col style="width:${(w / 109.7) * 100}%">`).join("")}</colgroup>
    <tr class="nb"><td class="nb ttl" colspan="7">ANNEXTURE TO INVOICE</td></tr>
    <tr>${lb("Inv No & Dt")}${vl(invRef)}${lb("NO OF PKGS")}${td(sum(rows, "boxes"), "c")}
      ${lb("Shipment to")}${td(esc((s.pod || b.shipTo || "").toUpperCase()), "", 2)}</tr>
    ${bands.map((band) => `
      <tr class="nb"><td class="nb" colspan="7">&nbsp;</td></tr>
      <tr>${td("ITEM CODE", "h", 2)}${td("QUANTITY", "h")}${td(band.per100 ? "FOB / 100 PCS US$" : "FOB / PC US$", "h", 2)}
        ${td("NET WT", "h")}${td("RATE / KG", "h")}</tr>
      <tr>${td(esc(band.label), "k", 2)}${td("PCS", "c")}${td("Unit", "c")}${td("Total", "c")}
        ${td("KGS", "c")}${td("US$", "c")}</tr>
      ${band.rows.map((r) => {
    const rate = band.per100 ? r.fobPc * 100 : r.fobPc;
    return `<tr>${td(esc(r.it.code))}${td("")}${td(r.pieces.toLocaleString("en-IN"), "c")}
        ${td(usd(rate), "c")}${td(usd(r.fobTotal), "c")}${td(num(r.netTotal, 3), "c")}
        ${td(r.netTotal ? num(r.fobTotal / r.netTotal, 2) : "—", "c")}</tr>`;
  }).join("")}`).join("")}
    <tr class="nb"><td class="nb" colspan="7">&nbsp;</td></tr>
    <tr>${td("TOTAL", "k")}${td("", "", 3)}${td(usd(fobUsd), "k c")}${td(num(sum(rows, "netTotal"), 3), "k c")}${td("")}</tr>
  </table>`;

  return `${page1}<div class="pgbrk"></div>${page2}<div class="pgbrk"></div>${annx}`;
}

B["18"] = (ctx) => ({
  name: "Custom_Invoice_18",
  html: customsInvoiceHtml(ctx),
  sheets: customsInvoiceSheets(ctx),
  page: "portrait",
});
function packingListDoc(ctx, title, no, boxLabel = "Boxes") {
  const rows = L(ctx), s = ctx.inv.ship || {};
  const cols = [
    { h: "Sr No / Marks", c: 1, f: (r) => r.range }, { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) },
    { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", fml: (r) => `{box}*${Number(r.packing) || 0}`, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: boxLabel, r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "Net Wt kg", r: 1, key: "net", t: "num", fml: (r) => `{box}*${Number(r.it.netPerBox) || 0}`, f: (r) => num(r.netTotal) },
    { h: "Gross Wt kg", r: 1, key: "gross", t: "num", fml: (r) => `{box}*${Number(r.it.grossPerBox) || 0}`, f: (r) => num(r.grossTotal) },
    { h: "Volume m³", r: 1, key: "vol", t: "num", fml: (r) => `{box}*${Number(r.it.volume) || 0}`, f: (r) => num(r.volTotal, 2) },
  ];
  const foot = [{ v: "TOTAL", span: 4 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" },
    { v: num(sum(rows, "netTotal")), r: 1, sum: "net", t: "num" },
    { v: num(sum(rows, "grossTotal")), r: 1, sum: "gross", t: "num" },
    { v: num(sum(rows, "volTotal"), 2), r: 1, sum: "vol", t: "num" }];
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
    { h: "Size", c: 1, f: (r) => esc(r.it.size) },
    { h: "Pack/Box", r: 1, key: "pack", t: "int", v: (r) => r.packing, f: (r) => r.packing },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", fml: QTY_FROM_BOX, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Boxes", r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "Net kg", r: 1, key: "net", t: "num", fml: (r) => `{box}*${Number(r.it.netPerBox) || 0}`, f: (r) => num(r.netTotal) },
    { h: "Gross kg", r: 1, key: "gross", t: "num", fml: (r) => `{box}*${Number(r.it.grossPerBox) || 0}`, f: (r) => num(r.grossTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 5 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" },
    { v: num(sum(rows, "netTotal")), r: 1, sum: "net", t: "num" },
    { v: num(sum(rows, "grossTotal")), r: 1, sum: "gross", t: "num" }];
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
    { h: "Item Code", f: (r) => esc(r.it.code) },
    { h: "Quantity Pcs", r: 1, key: "qty", t: "int", v: (r) => r.pieces, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "FOB/pc $", r: 1, key: "rate", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "FOB Total $", r: 1, key: "fobtot", t: "usd", fml: "{qty}*{rate}", f: (r) => usd(r.fobTotal) },
    { h: "Net Wt kg", r: 1, key: "net", t: "num", v: (r) => r.netTotal, f: (r) => num(r.netTotal) },
    { h: "Rate/kg $", r: 1, key: "ratekg", t: "num3", fml: "IF({net}=0,0,{fobtot}/{net})", f: (r) => num(r.rateKg, 3) },
  ];
  const foot = [{ v: "TOTAL", span: 1 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1, sum: "fobtot", t: "usd" },
    { v: num(sum(rows, "netTotal")), r: 1, sum: "net", t: "num" }, { v: "" }];
  const html = `<div class="title">24 · ANNEXURE TO INVOICE (BL Annexure)</div>
    <table style="width:100%"><tr><td class="k">Inv No &amp; Dt</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td><td class="k">No of Pkgs</td><td>${esc(s.pkgs || "—")}</td><td class="k">Shipment to</td><td>${esc(s.pod || ctx.buyer.shipTo)}</td></tr></table>
    ${tableOf(cols, rows, foot)}`;
  return { name: "BL_Annexure_24", html };
};
B["25"] = (ctx) => {
  const rows = L(ctx), ex = exRate(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "HSN", f: (r) => esc(r.it.hsn) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Qty", r: 1, key: "qty", t: "int", v: (r) => r.pieces, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Taxable ₹", r: 1, key: "taxable", t: "inr", v: (r) => r.fobTotal * ex, f: (r) => num(r.fobTotal * ex) },
    { h: "IGST %", c: 1, f: (r) => (gstRate(r.it.hsn) * 100).toFixed(0) + "%" },
    { h: "IGST ₹", r: 1, key: "igst", t: "inr", fml: (r) => `{taxable}*${gstRate(r.it.hsn)}`, f: (r) => num(r.fobTotal * ex * gstRate(r.it.hsn)) },
    { h: "Total ₹", r: 1, key: "total", t: "inr", fml: "{taxable}+{igst}", f: (r) => num(r.fobTotal * ex * (1 + gstRate(r.it.hsn))) },
  ];
  const tax = sum(rows, "fobTotal") * ex, gst = rows.reduce((a, r) => a + r.fobTotal * ex * gstRate(r.it.hsn), 0);
  const html = `<div class="title">25 · E-INVOICE (IRN)</div>
    <table style="width:100%"><tr><td class="k">Invoice No.</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td><td class="k">IRN</td><td class="sub">5049ef43c7126a4c35bf29795ce49390de0338c2897a4b</td></tr>
    <tr><td class="k">Ack No</td><td>122632432448548</td><td class="k">Ack Dt</td><td>${ddmm(ctx.inv.date)}</td></tr></table>
    ${tableOf(cols, rows, [{ v: "TOTAL", span: 4 }, { v: num(tax), r: 1, sum: "taxable", t: "inr" }, { v: "" },
    { v: num(gst), r: 1, sum: "igst", t: "inr" }, { v: num(tax + gst), r: 1, sum: "total", t: "inr" }])}`;
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
    { h: "Size", c: 1, f: (r) => esc(r.it.size) },
    { h: "Pieces", r: 1, key: "pieces", t: "int", fml: (r) => `{box}*${Number(r.packing) || 0}`, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Boxes", r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "Rate $/pc", r: 1, key: "rate", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "Amount $", r: 1, key: "amount", t: "usd", fml: "{pieces}*{rate}", f: (r) => usd(r.fobTotal) },
  ];
  const foot = [{ v: `TOTAL FOB · ${sum(rows, "boxes")} boxes`, span: 4 },
    { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "pieces", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" }, { v: "" },
    { v: usd(sum(rows, "fobTotal")), r: 1, sum: "amount", t: "usd" }];
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
    { h: "GD Code", f: (r) => esc(r.it.gd) },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", v: (r) => r.pieces, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Box", r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "FOB $", r: 1, key: "fob", t: "usd", v: (r) => r.fobTotal, f: (r) => usd(r.fobTotal) },
    { h: "Realised ₹", r: 1, key: "real", t: "inr", fml: `{fob}*${ex}`, f: (r) => num(r.fobTotal * ex) },
    { h: "Purchase ₹", r: 1, key: "pur", t: "inr", v: (r) => r.valTotal, f: (r) => num(r.valTotal) },
    { h: "Cartons ₹", r: 1, key: "carton", t: "inr", fml: "{box}*16", f: (r) => num(r.boxes * 16) },
    { h: "Overheads ₹", r: 1, key: "oh", t: "inr", fml: "{real}*0.11", f: (r) => num(r.fobTotal * ex * 0.11) },
    { h: "Gross Profit ₹", r: 1, key: "gp", t: "inr", fml: "{real}-{pur}-{carton}-{oh}", f: (r) => num(r.fobTotal * ex - r.valTotal - r.boxes * 16 - r.fobTotal * ex * 0.11) },
  ];
  const gp = rows.reduce((a, r) => a + (r.fobTotal * ex - r.valTotal - r.boxes * 16 - r.fobTotal * ex * 0.11), 0);
  const foot = [{ v: "TOTAL", span: 1 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" },
    { v: usd(sum(rows, "fobTotal")), r: 1, sum: "fob", t: "usd" },
    { v: num(sum(rows, "fobTotal") * ex), r: 1, sum: "real", t: "inr" },
    { v: num(sum(rows, "valTotal")), r: 1, sum: "pur", t: "inr" },
    { v: "", span: 2 }, { v: num(gp), r: 1, sum: "gp", t: "inr" }];
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
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", v: (r) => r.qty, f: (r) => r.qty.toLocaleString("en-IN") },
    { h: "Vol/Box", r: 1, key: "volbox", t: "num3", v: (r) => r.it.volume, f: (r) => num(r.it.volume, 3) },
    { h: "Total Boxes", r: 1, key: "ordered", t: "int", v: (r) => r.ordered, f: (r) => r.ordered },
    { h: "Recd Boxes", r: 1, key: "recd", t: "int", v: (r) => r.recd, f: (r) => r.recd },
    { h: "Pending Boxes", r: 1, key: "pending", t: "int", fml: "{ordered}-{recd}", f: (r) => r.pending },
    { h: "Total Vol m³", r: 1, key: "vol", t: "num", fml: "{ordered}*{volbox}", f: (r) => num(r.volume, 2) },
  ];
  const foot = [{ v: "TOTAL", span: 5 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" }, { v: "" },
    { v: sum(rows, "ordered"), r: 1, sum: "ordered", t: "int" }, { v: sum(rows, "recd"), r: 1, sum: "recd", t: "int" },
    { v: sum(rows, "pending"), r: 1, sum: "pending", t: "int" }, { v: num(sum(rows, "volume"), 2), r: 1, sum: "vol", t: "num" }];
  return { name: "Balance_Order_Itemwise_37", html: `<div class="title">37 · BALANCE ORDER ITEM WISE</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows, foot)}` };
}
function balanceSupplier(ctx, data, no) {
  const rows = data.supRows || [];
  const cols = [
    { h: "Date", c: 1, f: (r) => dmy(r.date) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Supplier", f: (r) => esc(ctx.supCode ? ctx.supCode(r.supplierId) : r.supplierId) },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Invoice(s)", f: (r) => [...(r.invoices || [])].join(", ") || "—" },
    { h: "Recd Boxes", r: 1, key: "recd", t: "int", v: (r) => r.recd, f: (r) => r.recd },
    { h: "Pending Boxes", r: 1, key: "pending", t: "int", v: (r) => r.pending, f: (r) => r.pending },
    { h: "Total Vol m³", r: 1, key: "vol", t: "num", fml: (r) => `{recd}*${Number(r.it.volume) || 0}`, f: (r) => num(r.volume, 2) },
    { h: "Invoice Value ₹", r: 1, key: "value", t: "inr", v: (r) => r.value, f: (r) => num(r.value) },
  ];
  const title = no === "38" ? "38 · SUPPLY DETAILS (Item wise / Supplier wise)" : "36 · BALANCE ORDER SUPPLIER WISE";
  const foot = [{ v: "TOTAL", span: 5 }, { v: sum(rows, "recd"), r: 1, sum: "recd", t: "int" },
    { v: sum(rows, "pending"), r: 1, sum: "pending", t: "int" },
    { v: num(sum(rows, "volume"), 2), r: 1, sum: "vol", t: "num" },
    { v: num(sum(rows, "value")), r: 1, sum: "value", t: "inr" }];
  return { name: `Balance_Supplierwise_${no}`, html: `<div class="title">${title}</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows, foot)}` };
}
function balanceBoxes(ctx, data) {
  const rows = data.itemRows || [];
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Pending Boxes", r: 1, key: "pending", t: "int", v: (r) => r.pending, f: (r) => r.pending },
    { h: "Vol/Box", r: 1, key: "volbox", t: "num3", v: (r) => r.it.volume, f: (r) => num(r.it.volume, 3) },
    { h: "Pending Vol m³", r: 1, key: "pendvol", t: "num", fml: "{pending}*{volbox}", f: (r) => num(r.pending * (r.it.volume || 0), 2) },
    { h: "Net/Box kg", r: 1, key: "netbox", t: "num", v: (r) => r.it.netPerBox, f: (r) => num(r.it.netPerBox) },
    { h: "Pending Net kg", r: 1, key: "pendnet", t: "num", fml: "{pending}*{netbox}", f: (r) => num(r.pending * (r.it.netPerBox || 0)) },
  ];
  const pendVol = rows.reduce((a, r) => a + r.pending * (r.it.volume || 0), 0), pendNet = rows.reduce((a, r) => a + r.pending * (r.it.netPerBox || 0), 0);
  const foot = [{ v: "TOTAL", span: 2 }, { v: sum(rows, "pending"), r: 1, sum: "pending", t: "int" }, { v: "" },
    { v: num(pendVol, 2), r: 1, sum: "pendvol", t: "num" }, { v: "" }, { v: num(pendNet), r: 1, sum: "pendnet", t: "num" }];
  return { name: "Balance_Boxes_Volume_39", html: `<div class="title">39 · BALANCE ORDERS — BOXES &amp; VOLUME</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows, foot)}` };
}
// Fallback for 36–39 when the live balance register isn't supplied (context = this invoice only).
function balanceFallback(ctx, title, fname) {
  const rows = L(ctx);
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Supplier", f: (r) => esc(r.sup.code || "—") }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Invoice", f: () => esc(ctx.inv.invoiceNo) },
    { h: "Recd Boxes", r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", fml: QTY_FROM_BOX, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Pcs / box", r: 1, key: "pack", t: "int", v: (r) => r.packing, f: (r) => r.packing },
    { h: "Total Vol m³", r: 1, key: "vol", t: "num", fml: (r) => `{box}*${Number(r.it.volume) || 0}`, f: (r) => num(r.volTotal, 2) },
    { h: "FOB/pc $", r: 1, key: "fobpc", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "Invoice Value $", r: 1, key: "val", t: "usd", fml: "{qty}*{fobpc}", f: (r) => usd(r.fobTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 4 }, { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" },
    { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" }, { v: "" },
    { v: num(sum(rows, "volTotal"), 2), r: 1, sum: "vol", t: "num" }, { v: "" },
    { v: usd(sum(rows, "fobTotal")), r: 1, sum: "val", t: "usd" }];
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

/* The 40 papers grouped under the client's own menu heads
   (Docs/Jaikvin Process/Menu Bar.xlsx) — each key `k` matches a navigation
   entry, so every document lives under the menu it belongs to. */
export const DOC_GROUPS = [
  // PO Reports are raised off the purchase order itself, so they exist the
  // moment the buyer's order is entered — nothing here waits on an invoice.
  { k: "PO", t: "PO Reports", hint: "Raised when the buyer places an order", docs: ["1", "2", "3", "4", "5", "6"], source: "po" },
  { k: "SUP", t: "Suppliers' Reports", hint: "Raised when suppliers deliver boxes", docs: ["7", "8", "9", "10", "11"] },
  { k: "PRE", t: "Pre-Shipment Reports", hint: "Everything customs needs before loading", docs: ["12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "24", "25", "26", "27", "28", "29"] },
  { k: "POST", t: "Post Shipment Reports", hint: "Sent after the container sails, incl. bill regularisation for the bank", docs: ["30", "31", "32", "33", "34", "40"] },
  { k: "OTH", t: "Other Reports", hint: "Costing, supplier details and balance registers", docs: ["35", "23", "38", "36", "37", "39"] },
];

export const DOC_META = {
  "1": "Buyers Order", "2A": "Master", "2": "Barcode", "3": "Packing", "4": "Purchase", "5": "Sales", "6": "Suppliers’ PO",
  "7A": "Master (7A)", "7": "Packing", "8": "Purchase", "9": "Sales", "10": "E-way (inward)", "11A": "Delivery order", "11": "Delivery instr.",
  "12": "Boxes & volume", "13": "Export value decl.", "14": "SCOMET", "15": "SDF", "16": "RoDTEP", "17": "Proforma", "18": "Custom invoice",
  "19": "Packing list", "20": "Packing itemwise", "21": "Packaging decl.", "22": "Letter to CHA", "23": "Supplier details", "24": "BL annexure",
  "25": "E-invoice", "26": "Shipping instr.", "27": "VGM", "28": "Cost sheets", "29": "E-way (export)", "30": "Letter to buyer",
  "31": "Commercial invoice", "32": "Packing", "33": "Packaging decl.", "34": "CWD", "35": "Costing", "36": "Balance, supplier",
  "37": "Balance, item", "38": "Supply details", "39": "Balance boxes/vol", "40": "Bill regularisation",
};

/* Which documents belong to the purchase-order stage — they are built from a
   PO, never from an invoice (see DOC_GROUPS above). */
export const PO_DOCS = DOC_GROUPS.find((g) => g.k === "PO").docs.slice();
export const isPoDoc = (no) => PO_DOCS.includes(String(no));

/* The three papers each supplier receives on their own, rather than as one
   combined sheet: the purchase order, the inward e-way bill and the despatch
   instruction. */
export const SUPPLIER_SPLIT_DOCS = { 6: supplierPoDocs, 10: ewaySupplierDocs, 11: despatchSupplierDocs };
export function supplierSplitDocs(no, ctx) {
  const fn = SUPPLIER_SPLIT_DOCS[String(no)];
  try { return fn ? fn(ctx) : []; } catch (e) { return []; }
}

function buildOne(no, ctx, report) {
  if (["36", "37", "38", "39"].includes(no) && report) return buildBalanceReport(no, ctx, report);
  return B[no] ? B[no](ctx) : null;
}

/** One document as [{ name, html, sheet? }] — several entries when it splits
 *  per supplier, so Excel gets a sheet each and the PDF a page each.
 *
 *  A builder that copies one of the client's own workbooks hands back a `sheet`
 *  as well — or `sheets`, when the document is a workbook of its own. The Excel
 *  download uses those verbatim instead of converting the HTML, which is how
 *  doc 2 comes out looking like 2-Barcode.xlsx and doc 10 like the portal's
 *  entry form. */
export function documentParts(no, ctx, report) {
  const split = supplierSplitDocs(no, ctx);
  if (split.length > 1) return split.map((d) => ({ name: `${d.code}`, html: d.html, sheets: d.sheets, docName: d.docName }));
  const out = buildOne(no, ctx, report);
  return out ? [{ name: DOC_META[no] || out.name, html: out.html, sheet: out.sheet, sheets: out.sheets, page: out.page, docName: out.name }] : [];
}

export function documentFilename(no, ctx, report) {
  const out = buildOne(no, ctx, report);
  return fnameFor(no, out ? out.name : `Document_${no}`, ctx);
}

export function hasBuilder(no) { return !!B[no] || ["36", "37", "38", "39"].includes(no); }

/* ---- downloads ----
   Both formats come off the same parts, so an Excel and a PDF of the same
   document can never show different figures. */
export function downloadDocumentExcel(no, ctx, report) {
  const parts = documentParts(no, ctx, report);
  if (!parts.length) { alert(`Document ${no} generator not available.`); return false; }
  downloadDocsExcel(documentFilename(no, ctx, report), parts);
  return true;
}

export function downloadDocumentPDF(no, ctx, report) {
  const parts = documentParts(no, ctx, report);
  if (!parts.length) { alert(`Document ${no} generator not available.`); return false; }
  // A document that copies a client workbook prints on that workbook's paper.
  const orientation = parts.every((p) => p.page === "portrait") ? "portrait" : undefined;
  downloadPDF(`${no} · ${DOC_META[no] || ""}`, parts, { orientation });
  return true;
}

/* A whole stage at once. `ctxFor` may be one context or a function of the
   document number — the full library mixes PO-stage and invoice-stage papers,
   and each has to be built from its own source. A document whose source does
   not exist yet is skipped rather than failing the batch. */
const resolveCtx = (ctxFor, no) => (typeof ctxFor === "function" ? ctxFor(no) : ctxFor);

function stageParts(numbers, ctxFor, report) {
  return numbers.flatMap((no) => {
    const ctx = resolveCtx(ctxFor, no);
    if (!ctx) return [];
    try { return documentParts(no, ctx, report); } catch (e) { return []; }
  });
}

/** The whole of a stage in one workbook — a sheet per document. */
export function downloadStageExcel(filename, numbers, ctxFor, report) {
  const parts = numbers.flatMap((no) => {
    const ctx = resolveCtx(ctxFor, no);
    if (!ctx) return [];
    let p = [];
    try { p = documentParts(no, ctx, report); } catch (e) { return []; }
    return p.map((x, i) => ({ ...x, name: `${no}${i || p.length > 1 ? ` ${x.name}` : ""}` }));
  });
  if (!parts.length) return false;
  downloadDocsExcel(filename, parts);
  return true;
}

export function downloadStagePDF(title, numbers, ctxFor, report) {
  const parts = stageParts(numbers, ctxFor, report);
  if (!parts.length) return false;
  downloadPDF(title, parts);
  return true;
}

/* Kept for the screens that offer a single one-click Excel grab. */
export const buildDocument = (no, ctx, report) => downloadDocumentExcel(no, ctx, report);

/** One supplier's copy of a split document (6 · PO, 10 · e-way, 11 · despatch). */
export function downloadSupplierDoc(no, ctx, supplierId, format = "excel") {
  const d = supplierSplitDocs(no, ctx).find((x) => x.supplierId === supplierId);
  if (!d) return false;
  const filename = `${d.docName}_${String(ctx.po || ctx.inv.invoiceNo || "").replace(/[^A-Za-z0-9]+/g, "-")}`;
  if (format === "pdf") downloadPDF(`${no} · ${DOC_META[no] || ""} · ${d.code}`, [{ html: d.html }], { orientation: "portrait" });
  else downloadDocsExcel(filename, [{ name: d.code, html: d.html, sheets: d.sheets }]);
  return true;
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

  /* 2 · Barcode and 3 · Packing are copies of the client's own workbooks, so on
     screen they keep those workbooks' look rather than the app's: Arial on a
     black hairline grid, codes in their green, barcodes and totals bold, the PO
     banner across the top and the header split over two lines — what the
     download opens as, cell for cell. */
  .docprev table.wb{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;}
  .docprev table.wb.fit{width:100%;max-width:760px;}
  /* Codes and figures are single tokens and never break; headings and
     descriptions wrap, so a long one grows its row rather than being cut. */
  .docprev table.wb td,.docprev table.wb th{border:1px solid #000;padding:4px 6px;height:26px;vertical-align:middle;white-space:normal;word-break:normal;}
  .docprev table.wb .gd,.docprev table.wb .gdc,.docprev table.wb .bh,
  .docprev table.wb .code,.docprev table.wb td.c,.docprev table.wb td.r{white-space:nowrap;}
  /* A line can carry half a dozen order numbers — they wrap rather than
     stretching the column, as they do in the sheet. */
  .docprev table.wb td.po{white-space:normal;text-align:center;max-width:190px;}
  .docprev table.wb th{background:#fff;color:#000;font-weight:700;text-align:center;}
  .docprev table.wb tr.po td{background:#fff;color:#000;font-weight:700;text-align:left;}
  .docprev table.wb tr.po.rule td{border-left:none;border-right:none;border-top:none;}
  .docprev table.wb tr.po td.red,.docprev table.wb th.red{color:#ff0000;}
  .docprev table.wb th.r{text-align:right;}
  .docprev table.wb .nb{border:none;}
  /* 12 · Boxes & volume bands its headings, labels and totals in the 25% grey
     its workbook uses, rather than leaving them white like the older sheets. */
  .docprev table.wb td.g,.docprev table.wb th.g,.docprev table.wb tr.g td{background:#bfbfbf;color:#000;}
  .docprev table.wb tr.hd2 th{height:20px;}
  .docprev table.wb tr.tot td{background:#fff;color:#000;font-weight:700;}
  .docprev table.wb tr.tot td.o{border-left:none;border-right:none;}
  .docprev table.wb .gd{color:#339966;font-weight:700;}
  .docprev table.wb .gdc{color:#339966;font-weight:700;text-align:center;}
  .docprev table.wb .bh{font-weight:700;text-align:center;}
  .docprev table.wb .code{font-weight:700;text-align:center;}
  .docprev table.wb .desc{white-space:normal;}
  /* 17 · Proforma is the buyer's own purchase order form: their name across the
     top, the two address boxes under it, and the goods banded by range. */
  .docprev table.bpo .big{font-size:16px;font-weight:700;color:#000;}
  /* Both parties are set bold and in capitals on their form — it is the one
     thing on the page a warehouse reads across the room — whatever case the
     master itself keeps the name and address in. */
  /* Their paper is set tighter than the rest of the library — a small body
     under their name at full size. The preview keeps the same proportions as
     the print, a shade larger so it stays readable on screen. */
  /* The width has to be a definite length, not 100%. The preview paper sizes
     itself to max-content (see .docprev-paper — a wide sheet makes the paper as
     wide as it needs to be and the shell scrolls to it), so a percentage here
     has no definite basis to resolve against and computes to auto; and under a
     fixed table layout the cells never get to size the columns from their own
     content. All eight collapsed, and every cell narrower than the full span
     printed blank. 760px is the width .wb.fit gives a portrait sheet. */
  .docprev table.bpo{table-layout:fixed;width:760px;}
  .docprev table.bpo td,.docprev table.bpo th{font-size:10px;padding:0 5px;line-height:1.3;}
  .docprev table.bpo .big{font-size:20px;font-weight:700;color:#000;}
  .docprev table.bpo .tag{font-size:14px;}
  .docprev table.bpo .ttl{font-size:11.5px;}
  .docprev table.bpo .val{font-size:12px;}
  .docprev table.bpo .foot{font-size:8px;letter-spacing:.1px;}
  /* The freight terms and the line the order is signed for stand side by side.
     Both are set to the top of the run — the rest of the sheet centres in its
     row — so the name sits level with the top of the freight box and the space
     under it is left clear to stamp and sign in. */
  .docprev table.bpo tr.sig td{vertical-align:top;}
  .docprev table.bpo .sign{font-size:9.5px;padding-top:2px;}
  /* The contact strip is small print set close, not on the 26px row the goods
     above it are ruled to — four lines that read as one block. */
  .docprev table.bpo tr.ft td{height:auto;padding:0 5px;line-height:1.5;}
  .docprev table.bpo .party{text-align:left;vertical-align:top;white-space:normal;font-weight:700;text-transform:uppercase;padding:4px 6px;}
  .docprev table.bpo td.nb,.docprev table.bpo th.nb{border:none;}
  /* The mark above their name, uploaded on the buyer master — held to the
     name's own width below it so the two sit centred on one another. */
  .docprev table.bpo .bpo-logo{height:62px;width:auto;display:block;margin:0 auto 1px;}
  /* Ruled down the columns but not across, as their goods are. */
  .docprev table.bpo tr.ln td{border-top:none;border-bottom:none;}
  /* A run of the form that is one unbroken box: the cell gives up its padding
     to the table inside it, and that table draws no rules of its own. */
  .docprev table.bpo td.bx{padding:0;}
  .docprev table.bpo table.in{width:100%;table-layout:fixed;border-collapse:collapse;margin:0;}
  .docprev table.bpo table.in td{border:none;padding:1px 6px;font-size:10px;}

  /* 18 · Custom invoice is the customs copy, and their file rules it as one
     frame rather than as a grid of boxes: solid down the eleven columns,
     hairline between the goods, and open everywhere the form is just typing.
     So the cells start with no rule at all and each names the edges it draws —
     the opposite way round from the workbook sheets above, which are grids. */
  .docprev table.ci{table-layout:fixed;width:820px;font-family:Arial,Helvetica,sans-serif;}
  /* Their form is typed on plain paper: no cell on it is banded or coloured,
     so the app's own key/value tints are cleared rather than inherited. */
  .docprev table.ci td{border:none;font-size:9px;line-height:1.3;padding:0 3px;height:14px;
    white-space:nowrap;overflow:hidden;text-overflow:clip;vertical-align:middle;
    color:#000;background:none;}
  .docprev table.ci .lt{border-left:1px solid #000;border-top:1px solid #000;}
  .docprev table.ci .rt{border-right:1px solid #000;border-top:1px solid #000;}
  .docprev table.ci .lf{border-left:1px solid #000;}
  .docprev table.ci .rt0{border-right:1px solid #000;}
  .docprev table.ci .lrt{border-left:1px solid #000;border-right:1px solid #000;border-top:1px solid #000;}
  .docprev table.ci .lrb{border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px solid #000;}
  .docprev table.ci .lt0{border-top:1px solid #000;}
  .docprev table.ci .bb{border-bottom:1px solid #000;}
  .docprev table.ci .bx,.docprev table.ci .h,.docprev table.ci .bnd{border:1px solid #000;}
  .docprev table.ci .k,.docprev table.ci .b,.docprev table.ci .h,.docprev table.ci .bnd{font-weight:700;}
  .docprev table.ci .h{text-align:center;}
  .docprev table.ci .c{text-align:center;}
  .docprev table.ci .l{text-align:left;}
  .docprev table.ci .r{text-align:right;}
  .docprev table.ci .mer{font-weight:700;text-decoration:underline;}
  .docprev table.ci .ttl{font-weight:700;text-align:center;}
  .docprev table.ci .nb{border:none;}
  .docprev table.ci .brand{font-family:Centaur,Georgia,serif;font-size:18px;font-weight:700;text-align:right;
    vertical-align:middle;}
  /* The goods: every line keeps the columns, and only the lines between items
     are ruled — faintly, so a band reads as one block. */
  .docprev table.ci tr.gd td,.docprev table.ci tr.ln td{border-left:1px solid #000;border-right:1px solid #000;}
  .docprev table.ci tr.ln td{border-top:1px solid #d9d9d9;border-bottom:1px solid #d9d9d9;}
  .docprev table.ci tr.gd td:first-child,.docprev table.ci tr.ln td:first-child{border-top:none;border-bottom:none;}
  .docprev table.ci tr.gd .bnd,.docprev table.ci tr.gd .h{border:1px solid #000;}
  .docprev table.ci tr.tt td{border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px solid #000;}
  /* The three figures the page carries forward are closed with a double rule,
     as an added column is on their paper. */
  .docprev table.ci tr.tt .dbl{border-top:1px solid #000;border-bottom:3px double #000;}
  .docprev table.ci.annx{width:640px;}
  .docprev table.ci.annx td{height:16px;font-size:9.5px;}

  /* 6 · Suppliers' PO is a letter, not a table: the exporter's name in Centaur
     maroon, the form's labels in blue, the title in red, and the whole page
     inside one frame — as the workbook's Page1 prints it. */
  .docprev table.wb.letter{width:100%;max-width:960px;table-layout:fixed;border:1px solid #000;}
  .docprev table.wb.letter td,.docprev table.wb.letter th{border:none;height:auto;padding:2px 6px;white-space:normal;}
  .docprev table.wb.letter th{border:1px solid #000;background:#fff;color:#000;}
  .docprev table.wb.letter .ttl{color:#f00;font-weight:700;text-align:center;border-bottom:1px solid #000;}
  .docprev table.wb.letter .brand{font-family:Centaur,Georgia,serif;font-size:22px;font-weight:700;color:#800000;text-align:right;vertical-align:top;}
  .docprev table.wb.letter .logo{float:left;width:62px;height:auto;margin:2px 0 0 2px;}
  .docprev table.wb.letter td.sub{display:table-cell;color:#800000;text-align:right;font-size:12px;margin:0;}
  .docprev table.wb.letter .addr{color:#3366ff;text-align:right;}
  .docprev table.wb.letter .lbl{color:#00f;font-weight:700;}
  .docprev table.wb.letter .gst{color:#00f;font-weight:700;text-align:center;vertical-align:top;}
  .docprev table.wb.letter .val,.docprev table.wb.letter .party{color:#000;}
  .docprev table.wb.letter tr.band td{font-weight:700;}
  .docprev table.wb.letter .u{text-decoration:underline;}
  .docprev table.wb.letter .bx{border:1px solid #000;}
  .docprev table.wb.letter .sgn{color:#3366ff;}
  .docprev table.wb.letter tr.sign td{height:52px;}
  .docprev table.wb.letter .buyer{color:#f00;text-decoration:underline;}
  .docprev table.wb.letter tr td.l,.docprev table.wb.letter tr.band td{border-top:1px solid #000;border-bottom:1px solid #000;}
  .docprev .pgbrk{margin-top:18px;}

  /* 10 · E-way bill — the portal's own entry form, boxes and all, so it can be
     keyed in field by field. Grey text is what the operator still has to fill. */
  .docprev .ew{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;max-width:1000px;}
  .docprev .ew table{border-collapse:collapse;width:100%;margin:0 0 4px;}
  .docprev .ew td{border:none;padding:2px 5px;vertical-align:middle;}
  .docprev .ew .lbl{color:#000;font-weight:400;white-space:nowrap;background:none;}
  .docprev .ew .hd{font-weight:400;padding-top:8px;}
  .docprev .ew .fld{border:1px solid #000;}
  .docprev .ew .ph{color:#9aa3ad;}
  .docprev .ew .b{font-weight:700;}
  .docprev .ew .c{text-align:center;}
  .docprev .ew .i{font-style:italic;text-align:center;}
  .docprev .ew .on{font-weight:700;font-style:normal;}
  .docprev .ew .ewtop td{padding-bottom:10px;}
  .docprev .ew .ewband td{border:1px solid #000;border-left:none;border-right:none;padding:6px 5px;}
  .docprev .ew .ewband td:first-child{border-left:1px solid #000;}
  .docprev .ew .ewband td:last-child{border-right:1px solid #000;}
  .docprev .ew .ewitems .hd td,.docprev .ew .ewtot .hd td{text-align:center;border:none;}
  .docprev .ew .ewgrid .gap td{height:14px;}
  .docprev .ew .ewpart{width:auto;margin-left:120px;}
  .docprev .ew .ewpart .lbl{padding-right:12px;}
  .docprev .ew .ewline .fld{min-width:120px;}

  /* 13 · Export value declaration — the customs form as it is typed: Times,
     centred heading, and a box against every option so the ticked one reads
     unambiguously. */
  /* A fixed table layout needs a width it can divide, and the paper around it
     is only as wide as its content — so the form states its own. */
  .docprev .evd{font-family:"Times New Roman",Times,serif;font-size:14px;color:#000;width:760px;}
  .docprev .evd table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .evd td{border:none;padding:1px 3px;vertical-align:middle;white-space:nowrap;}
  .docprev .evd .ttl{text-align:center;}
  .docprev .evd .c{text-align:center;}
  .docprev .evd .u{text-decoration:underline;}
  .docprev .evd .w{white-space:normal;vertical-align:top;}
  .docprev .evd .nt{vertical-align:top;}
  .docprev .evd .bx{border:1px solid #000;text-align:center;font-weight:700;}
  .docprev .evd tr.gap td{height:10px;}

  /* 11 · Despatch instructions — the letter, on the letterhead. */
  .docprev .dl{font-family:Calibri,Arial,sans-serif;font-size:13px;color:#000;max-width:820px;line-height:1.45;}
  .docprev .dl table{border-collapse:collapse;width:100%;margin:0;}
  .docprev .dl td{border:none;padding:0;vertical-align:top;}
  .docprev .dl .ins td,.docprev .dl table.fld td,.docprev .dl table.bx td{font-size:13px;}
  .docprev .dl .brand{font-family:Centaur,Georgia,serif;font-size:44px;font-weight:700;color:#8b0000;letter-spacing:1px;line-height:1;}
  .docprev .dl .sub{font-family:Centaur,Georgia,serif;font-size:17px;color:#8b0000;letter-spacing:2px;padding-left:60px;}
  .docprev .dl .lg{width:120px;text-align:right;}
  .docprev .dl .lg img{width:104px;height:auto;}
  .docprev .dl .rule{border-top:1px solid #c00;margin:8px 0 14px;}
  .docprev .dl .ref{margin-bottom:16px;}
  .docprev .dl p{margin:0 0 12px;font-size:13px;}
  .docprev .dl .to{margin-bottom:16px;}
  .docprev .dl .refline .k{display:inline-block;min-width:34px;}
  .docprev .dl .k{background:none;color:#000;font-weight:400;white-space:normal;}
  .docprev .dl .b{font-weight:700;}
  .docprev .dl .sign{margin-top:42px;}
  .docprev .dl .ins{margin:0 0 12px;width:auto;}
  .docprev .dl .ins td{padding:0 0 4px;}
  .docprev .dl .ins .n{width:56px;padding-left:26px;}
  .docprev .dl .mid{text-align:center;}
  .docprev .dl.just p,.docprev .dl.just .ins td{text-align:justify;}
  .docprev .dl.just .mid,.docprev .dl.just .sign{text-align:left;}
  .docprev .dl.just .mid{text-align:center;}
  .docprev .dl table.fld{width:100%;margin:0 0 12px;}
  .docprev .dl table.fld .lbl{width:25%;}
  .docprev .dl .encl .ans{padding-left:30px;white-space:nowrap;}
  .docprev .dl table.bx{margin:14px 0;width:100%;}
  .docprev .dl table.bx td{border:1px solid #000;padding:3px 6px;}
  .docprev .dl .dlfoot{margin-top:2px;font-size:12px;color:#8b0000;}
  .docprev .dl .dlfoot .r{text-align:right;}
`;
