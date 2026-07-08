/* ============================================================
   Seed data + pure business logic.
   Everything here is copied 1:1 from v1.2 so figures stay identical —
   the v2 rebuild is UI/UX only.
   ============================================================ */

export const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

export const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");
export const usd = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usdp = (n) => "$" + Number(n || 0).toFixed(4);
export const num = (n, d = 2) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const dmy = (s) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
export const pad3 = (n) => String(Math.max(0, Math.round(n))).padStart(3, "0");
export const TODAY = new Date().toISOString().slice(0, 10);

/* ===== Seed masters ===== */
export const SUPPLIERS = [
  { id: "s1", code: "OSWIN", name: "Oswin Plastics", place: "Daman", gstin: "26AAACO0802H1ZY", weights: "manual" },
  { id: "s2", code: "VP", name: "V. P. Plastics", place: "Daman", gstin: "24AAGFV1148R1Z3", weights: "auto" },
  { id: "s3", code: "HP", name: "Hansa Polymers", place: "Silvassa", gstin: "26AABFH9921K1Z8", weights: "auto" },
  { id: "s4", code: "KP", name: "Kiran Polyfab", place: "Daman", gstin: "24AAHFK3320M1Z1", weights: "auto" },
  { id: "s5", code: "PH", name: "Pushpam Industries", place: "Vapi", gstin: "24AAGFP7741C1Z9", weights: "auto" },
  { id: "s6", code: "SP", name: "Shree Poly Works", place: "Daman", gstin: "26AALFS2210N1Z4", weights: "auto" },
];

export const BUYERS = [
  { id: "b1", name: "Corecomp Pty Ltd", brand: "GD Watermark", country: "Australia", curr: "USD", shipTo: "Fremantle", addr: "13, Tesla Link, Wangara WA 6065 (Australia)", orderNo: "JG/26-P/09" },
  { id: "b2", name: "Aqua Distributors Ltd", brand: "AquaMark", country: "New Zealand", curr: "USD", shipTo: "Auckland", addr: "42 Marina Way, Auckland 1010 (New Zealand)", orderNo: "JG/26-P/11" },
];

export const EXPORTER = {
  name: "JAIKVIN GLOBAL", sub: "Merchant Exporters",
  addr: "A-101, Rajshree Royale, Navroji Lane, Ghatkopar (W), MUMBAI-400 086. Maharashtra (State Code : 27)",
  tel: "9987122600", email: "aalok.shah@jaikvinglobal.com",
  iec: "AVIPS4808H", gstin: "27AVIPS4808H1Z8", pan: "AVIPS4808H", origin: "INDIA",
};

// `req: true` marks the four fields that gate the customs invoice (18) and the post-shipment set.
export const SHIP_FIELDS = [
  { key: "blNo", label: "BL No", req: true }, { key: "blDate", label: "BL Date", type: "date" },
  { key: "sbNo", label: "S/B No" }, { key: "sbDate", label: "S/B Date", type: "date" },
  { key: "vessel", label: "Shipped per (vessel / voyage)", req: true }, { key: "pol", label: "Port of loading" },
  { key: "pod", label: "Port of discharge", req: true }, { key: "finalDest", label: "Final destination" },
  { key: "terms", label: "Terms of delivery" }, { key: "payment", label: "Terms of payment" },
  { key: "bank", label: "Through (bank)" }, { key: "marks", label: "Marks & Nos" },
  { key: "pkgs", label: "No & kinds of pkgs" }, { key: "container", label: "Container No", req: true },
  { key: "seal", label: "Seal No" }, { key: "netWt", label: "Nett wt (kg)", type: "number" },
  { key: "grossWt", label: "Gross wt (kg)", type: "number" }, { key: "exRate", label: "Exchange rate ₹/$", type: "number" },
];
export const SHIP_REQUIRED = ["blNo", "vessel", "container", "pod"];
export const EMPTY_SHIP = { blNo: "", blDate: "", sbNo: "", sbDate: "", vessel: "", pol: "NHAVA SHEVA-MUMBAI (INDIA)", pod: "", finalDest: "", terms: "FOB MUMBAI", payment: "D.P. SIGHT DRAFT", bank: "HDFC BANK LTD, GHATKOPAR (E) BRANCH", marks: "", pkgs: "", container: "", seal: "", netWt: "", grossWt: "", exRate: "92.50" };
export const shipComplete = (s) => !!(s && s.blNo && s.vessel && s.container && s.pod);

export const ITEM_GROUPS = ["PP Moulded", "PP Extruded", "PA / Nylon Moulded", "Corrugated Boxes", "Adhesive Tapes"];

export const SEED_ITEMS = [
  { id: "i1", code: "E-114", gd: "GD-2001", oswin: "OSW-114", gl: "GL-114", size: "20", length: "58", packing: 200, description: "PP threaded elbow", barcode: "8901234020014", hsn: "39174000", volume: 0.042, netPerBox: 9.2, grossPerBox: 10.1, bgPerBox: 1, pPerBox: 2, typeUp: 24, unitValue: 7.4, unitFob100: 15.8, group: "PP Moulded", supplierId: "s1" },
  { id: "i2", code: "T-220", gd: "GD-2050", oswin: "OSW-220", gl: "GL-220", size: "25", length: "62", packing: 150, description: "PP equal tee", barcode: "8901234020502", hsn: "39174000", volume: 0.040, netPerBox: 8.6, grossPerBox: 9.4, bgPerBox: 1, pPerBox: 2, typeUp: 24, unitValue: 9.1, unitFob100: 19.6, group: "PP Moulded", supplierId: "s2" },
  { id: "i3", code: "R-310", gd: "GD-2100", oswin: "OSW-310", gl: "GL-310", size: "32", length: "3000", packing: 50, description: "PP riser pipe", barcode: "8901234021003", hsn: "39172200", volume: 0.085, netPerBox: 14.0, grossPerBox: 15.2, bgPerBox: 1, pPerBox: 1, typeUp: 16, unitValue: 41.0, unitFob100: 88.0, group: "PP Extruded", supplierId: "s3" },
  { id: "i4", code: "N-410", gd: "GD-2200", oswin: "OSW-410", gl: "GL-410", size: "20", length: "44", packing: 100, description: "Nylon compression fitting", barcode: "8901234022000", hsn: "39174000", volume: 0.055, netPerBox: 11.5, grossPerBox: 12.4, bgPerBox: 2, pPerBox: 2, typeUp: 24, unitValue: 18.5, unitFob100: 40.0, group: "PA / Nylon Moulded", supplierId: "s4" },
  { id: "i5", code: "C-510", gd: "GD-2300", oswin: "OSW-510", gl: "GL-510", size: "—", length: "—", packing: 25, description: "Corrugated carton, 5-ply", barcode: "8901234023007", hsn: "48191010", volume: 0.120, netPerBox: 16.0, grossPerBox: 16.8, bgPerBox: 0, pPerBox: 1, typeUp: 12, unitValue: 22.0, unitFob100: 47.0, group: "Corrugated Boxes", supplierId: "s5" },
];

// Each order row keeps a snapshot of the item as ordered, so later master edits never rewrite history.
const rawBM = [
  { id: "r1", date: "2025-11-04", po: "03320", itemId: "i1", qty: 1000, rbi: 83.10, buyerId: "b1" },
  { id: "r2", date: "2025-11-04", po: "03320", itemId: "i3", qty: 300, rbi: 83.10, buyerId: "b1" },
  { id: "r3", date: "2026-02-16", po: "03455", itemId: "i1", qty: 2000, rbi: 83.60, buyerId: "b1" },
  { id: "r4", date: "2026-02-16", po: "03455", itemId: "i2", qty: 900, rbi: 83.60, buyerId: "b1" },
  { id: "r5", date: "2026-02-16", po: "03455", itemId: "i4", qty: 600, rbi: 83.60, buyerId: "b1" },
  { id: "r6", date: "2026-04-22", po: "03539", itemId: "i5", qty: 500, rbi: 83.40, buyerId: "b1" },
  { id: "r7", date: "2026-04-22", po: "03539", itemId: "i2", qty: 600, rbi: 83.40, buyerId: "b1" },
];
export const SEED_BM = rawBM.map((r) => ({ ...r, item: { ...SEED_ITEMS.find((x) => x.id === r.itemId) } }));

export const SHIPMENTS = [
  { shipId: "JG/26-27/6002", date: "2026-05-05", container: "OOCU0793142", vessel: "CAPE SYROS 092E", bl: "SFPM2605165498", pod: "Fremantle", invoice: "JG/26-27/6002",
    lines: [{ itemId: "i1", boxes: 5, po: "03320" }, { itemId: "i3", boxes: 6, po: "03320" }, { itemId: "i2", boxes: 4, po: "03455" }] },
  { shipId: "JG/26-27/5988", date: "2026-03-18", container: "TLLU2233019", vessel: "MAERSK CABO 411W", bl: "SFPM2603110233", pod: "Fremantle", invoice: "JG/26-27/5988",
    lines: [{ itemId: "i4", boxes: 3, po: "03455" }] },
];

export const SHIPMENT = { invoice: "JG/26-27/6002", date: "05-May-2026", container: "OOCU0793142", vessel: "CAPE SYROS 092E", pol: "Nhava Sheva", pod: "Fremantle", bl: "SFPM2605165498", marks: "GDW 2001–2421", pkgs: 421, terms: "FOB Mumbai" };

export const SEED_INVOICES = [
  { id: "inv1", invoiceNo: "JG/26-27/6002", date: "2026-05-05", buyerId: "b1",
    lines: [{ itemId: "i1", supplierId: "s1", boxes: 5 }, { itemId: "i3", supplierId: "s3", boxes: 6 }, { itemId: "i2", supplierId: "s2", boxes: 4 }],
    ship: { ...EMPTY_SHIP, blNo: "SFPM2605165498", blDate: "2026-05-19", sbNo: "2945305", sbDate: "2026-05-04", vessel: "CAPE SYROS VOYAGE 092E", pod: "FREMANTLE", finalDest: "FREMANTLE", marks: "GDW 2001-2421", pkgs: "421 PACKAGES", container: "OOCU0793142", seal: "IND-0054079", netWt: "6050.9", grossWt: "6400", exRate: "92.50" } },
];

export const invReceipts = (invoices) => invoices.flatMap((inv) => inv.lines.map((l) => ({ itemId: l.itemId, supplierId: l.supplierId, boxes: Number(l.boxes) || 0 })));

/* ===== Core calculations ===== */
export function deriveBuyer(it, qtyRaw, rbiRaw) {
  if (!it) return null;
  const qty = Number(qtyRaw) || 0, rbi = Number(rbiRaw) || 0;
  const boxes = Math.ceil(qty / it.packing) || 0;
  const stickersPerBox = (Number(it.bgPerBox) + Number(it.pPerBox)) * 1.1;
  const labels = qty * stickersPerBox;
  const sheets = it.typeUp ? Math.ceil(labels / it.typeUp) : 0;
  const netTotal = boxes * it.netPerBox, grossTotal = boxes * it.grossPerBox, volTotal = boxes * it.volume;
  const totalValueINR = it.unitValue * qty;
  const totalFobUSD = (qty * it.unitFob100) / 100;
  const rbiRefINR = rbi * totalFobUSD;
  const rate = qty ? rbiRefINR / qty : 0;
  return { qty, rbi, boxes, stickersPerBox, labels, sheets, netTotal, grossTotal, volTotal, totalValueINR, totalFobUSD, rbiRefINR, rate };
}

export function computeLedger(buyerMaster, receipts, items) {
  const byItem = {};
  items.forEach((it) => (byItem[it.id] = { item: it, demands: [], supplied: 0 }));
  buyerMaster.forEach((r) => {
    if (!byItem[r.itemId]) byItem[r.itemId] = { item: r.item, demands: [], supplied: 0 };
    byItem[r.itemId].demands.push({ po: r.po, date: r.date, ordered: Math.ceil(r.qty / r.item.packing) });
  });
  Object.values(byItem).forEach((b) => b.demands.sort((a, c) => new Date(a.date) - new Date(c.date)));
  receipts.forEach((r) => byItem[r.itemId] && (byItem[r.itemId].supplied += Number(r.boxes)));
  Object.values(byItem).forEach((b) => {
    let avail = b.supplied;
    b.demands.forEach((d) => { const a = Math.min(d.ordered, avail); d.allocated = a; d.remaining = d.ordered - a; avail -= a; });
    b.leftover = avail;
  });
  return byItem;
}

// 7A supplier master: aggregate orders by item for a supplier + date range, then allocate serial box ranges
export function buildSupplierMaster(buyerMaster, supplierId, from, to, rbi) {
  const rows = buyerMaster.filter((r) => r.item.supplierId === supplierId && r.date >= from && r.date <= to);
  const groups = {};
  rows.forEach((r) => {
    const k = r.item.gd;
    if (!groups[k]) groups[k] = { it: r.item, pos: [], qty: 0, latest: r.date };
    if (!groups[k].pos.includes(r.po)) groups[k].pos.push(r.po);
    groups[k].qty += r.qty;
    if (r.date >= groups[k].latest) { groups[k].latest = r.date; groups[k].it = r.item; }
  });
  let start = 1;
  return Object.values(groups).sort((a, b) => a.it.gd.localeCompare(b.it.gd)).map((g) => {
    const it = g.it;
    const boxes = Math.ceil(g.qty / it.packing) || 0;
    const sr = `${pad3(start)}–${pad3(start + boxes - 1)}`; start += boxes;
    const bg = it.packing, pc = 1, ttl = bg + pc;
    const totalVol = boxes * it.volume;
    const barcodeStickers = Math.ceil(boxes * ttl * 1.05);
    const sheets = Math.ceil(barcodeStickers / 125);
    const costPerUnit = it.unitValue, totalCost = costPerUnit * g.qty;
    const unitFobPc = it.unitFob100 / 100, totalFobPc = g.qty * unitFobPc;
    const rbiRefCost = Number(rbi) * totalFobPc;
    const rate = g.qty ? rbiRefCost / g.qty : 0;
    return { sr, po: g.pos.join(", "), it, qty: g.qty, boxes, totalVol, bg, pc, ttl, barcodeStickers, sheets, costPerUnit, totalCost, unitFobPc, totalFobPc, rbiRefCost, rate };
  });
}

/* One invoice → per-line figures for both buyer (USD/FOB) and supplier (INR/cost) views */
export function invoiceLines(inv, items) {
  return inv.lines.map((l) => {
    const it = items.find((x) => x.id === l.itemId) || l.item || {};
    const boxes = Number(l.boxes) || 0;
    const pieces = boxes * (it.packing || 0);
    const volume = boxes * (it.volume || 0);
    const netWt = boxes * (it.netPerBox || 0);
    const buyerRate = (it.unitFob100 || 0) / 100;
    const buyerAmt = pieces * buyerRate;
    const supRate = it.unitValue || 0;
    const supAmt = pieces * supRate;
    return { it, supplierId: l.supplierId, boxes, pieces, volume, netWt, buyerRate, buyerAmt, supRate, supAmt };
  });
}
export function invoiceTotals(inv, items) {
  const L = invoiceLines(inv, items);
  return {
    lines: L,
    boxes: L.reduce((s, x) => s + x.boxes, 0), volume: L.reduce((s, x) => s + x.volume, 0),
    netWt: L.reduce((s, x) => s + x.netWt, 0), pieces: L.reduce((s, x) => s + x.pieces, 0),
    buyerAmt: L.reduce((s, x) => s + x.buyerAmt, 0), supAmt: L.reduce((s, x) => s + x.supAmt, 0),
  };
}
export function bySupplier(inv, items) {
  const g = {};
  invoiceLines(inv, items).forEach((x) => { (g[x.supplierId] = g[x.supplierId] || { supplierId: x.supplierId, boxes: 0, volume: 0 }); g[x.supplierId].boxes += x.boxes; g[x.supplierId].volume += x.volume; });
  return Object.values(g);
}

/* Balance register trace — allocates each invoice's boxes to POs (FIFO) and records the link */
export function balanceData(buyerMaster, invoices, items) {
  const byItem = {};
  items.forEach((it) => (byItem[it.id] = { item: it, demands: [] }));
  buyerMaster.forEach((r) => {
    if (!byItem[r.itemId]) byItem[r.itemId] = { item: r.item, demands: [] };
    const ordered = Math.ceil(r.qty / r.item.packing) || 0;
    byItem[r.itemId].demands.push({ po: r.po, date: r.date, buyerId: r.buyerId, qty: r.qty, rbi: r.rbi, ordered, remaining: ordered, invoices: new Set() });
  });
  Object.values(byItem).forEach((b) => b.demands.sort((a, c) => new Date(a.date) - new Date(c.date)));
  const receipts = invoices.slice().sort((a, b) => new Date(a.date) - new Date(b.date))
    .flatMap((inv) => inv.lines.map((l) => ({ invoiceNo: inv.invoiceNo, invId: inv.id, date: inv.date, itemId: l.itemId, supplierId: l.supplierId, boxes: Number(l.boxes) || 0 })));
  receipts.forEach((rc) => {
    const b = byItem[rc.itemId]; if (!b) return;
    let avail = rc.boxes;
    b.demands.forEach((d) => { if (avail <= 0) return; const take = Math.min(d.remaining, avail); if (take > 0) { d.remaining -= take; avail -= take; d.invoices.add(rc.invoiceNo); } });
  });
  return { byItem, receipts };
}
export const joinInv = (set) => (set && set.size ? [...set].join(", ") : "—");

/* PO roll-up with receipt / pending status */
export function buildPoList(buyerMaster, items, receipts) {
  const ledger = computeLedger(buyerMaster, receipts, items);
  const poMap = {};
  buyerMaster.forEach((r) => { (poMap[r.po] = poMap[r.po] || []).push(r); });
  return Object.entries(poMap).map(([po, rows]) => {
    const date = rows.map((r) => r.date).sort()[0];
    let ordered = 0, completed = 0, pending = 0, volume = 0;
    const supSet = new Set();
    const detail = rows.map((r) => {
      const it = r.item, b = ledger[r.itemId];
      const dem = b ? b.demands.find((d) => d.po === po && d.date === r.date) : null;
      const ord = Math.ceil(r.qty / it.packing) || 0;
      const alloc = dem ? dem.allocated : 0, rem = dem ? dem.remaining : ord;
      ordered += ord; completed += alloc; pending += rem; volume += ord * it.volume; supSet.add(it.supplierId);
      return { it, qty: r.qty, ordered: ord, completed: alloc, pending: rem, volume: ord * it.volume, rate: deriveBuyer(it, r.qty, r.rbi).rate, supplierId: it.supplierId };
    });
    return { po, date, rows, detail, ordered, completed, pending, volume, suppliers: [...supSet], buyerId: rows[0].buyerId };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.po.localeCompare(a.po));
}

/* ===== Exports (CSV / XLS) ===== */
export function downloadCSV(filename, headers, rows) {
  const esc = (c) => `"${String(c).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  try {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { alert("Download blocked in preview — the table above shows the full data."); }
}
export function downloadXLS(filename, innerHtml) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>td,th{border:1px solid #999;padding:3px 6px;font-family:Calibri,Arial;font-size:11pt;} th{background:#0b2c4d;color:#fff;} .h{font-weight:bold;} .r{text-align:right;} .sec{background:#eaeff3;font-weight:bold;}</style></head><body>${innerHtml}</body></html>`;
  try {
    const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { alert("Download blocked in preview."); }
}

const gstRate = (hsn) => (String(hsn).startsWith("4819") ? 0.05 : 0.18);
function shipHtml(inv, buyer) {
  const s = inv.ship || {};
  const rows = [
    ["Invoice No.", inv.invoiceNo + " DT " + dmy(inv.date)], ["Buyer's Order No.", buyer.orderNo || "—"],
    ["Buyer", "Messrs " + buyer.name + " — T/A " + buyer.brand], ["Address", buyer.addr || "—"],
    ["Country of Origin", EXPORTER.origin], ["Final Destination", s.finalDest || buyer.country],
    ["BL No.", (s.blNo || "—") + (s.blDate ? " DT " + dmy(s.blDate) : "")], ["S/B No.", (s.sbNo || "—") + (s.sbDate ? " DT " + dmy(s.sbDate) : "")],
    ["Shipped per", s.vessel || "—"], ["Port of Loading", s.pol || "—"], ["Port of Discharge", s.pod || "—"],
    ["Terms of Delivery", s.terms || "—"], ["Terms of Payment", s.payment || "—"], ["Through (Bank)", s.bank || "—"],
    ["Marks & Nos", s.marks || "—"], ["No & Kinds of Pkgs", s.pkgs || "—"], ["Container No.", s.container || "—"], ["Seal No.", s.seal || "—"],
    ["Nett Wt (kg)", s.netWt || "—"], ["Gross Wt (kg)", s.grossWt || "—"], ["Exchange Rate ₹/$", s.exRate || "—"],
  ];
  return `<table>${rows.map(([k, v]) => `<tr><td class="h">${k}</td><td>${v}</td></tr>`).join("")}</table>`;
}
const exporterHtml = () => `<table><tr><td class="h">${EXPORTER.name} (${EXPORTER.sub})</td></tr><tr><td>${EXPORTER.addr}</td></tr><tr><td>Tel: ${EXPORTER.tel} · ${EXPORTER.email}</td></tr><tr><td>IEC ${EXPORTER.iec} · GSTIN ${EXPORTER.gstin} · PAN ${EXPORTER.pan}</td></tr></table>`;

export function buildProformaXLS(inv, items, buyer) {
  const L = invoiceLines(inv, items);
  const body = L.map((x) => `<tr><td>${x.it.code}</td><td>${x.it.gd}</td><td>${x.it.size}</td><td>${x.it.length}</td><td class="r">${x.pieces}</td><td class="r">${x.boxes}</td><td class="r">$${x.buyerRate.toFixed(2)}</td><td class="r">${usd(x.buyerAmt)}</td></tr>`).join("");
  const tot = invoiceTotals(inv, items);
  const html = `<h2>PROFORMA INVOICE (Buyer) — Doc 17</h2>${exporterHtml()}<br>
    <table><tr><td class="h">To</td><td>${buyer.name} — ${buyer.brand}</td><td class="h">PO No.</td><td>${buyer.orderNo || "—"}</td></tr>
    <tr><td class="h">Deliver to</td><td>${buyer.addr || "—"}</td><td class="h">Date</td><td>${dmy(inv.date)}</td></tr></table><br>
    <table><tr><th>Code</th><th>GD</th><th>Size</th><th>Len (mm)</th><th>Pieces</th><th>Boxes</th><th>Rate $/pc</th><th>Total value</th></tr>
    ${body}<tr class="sec"><td colspan="4">TOTAL · ${tot.boxes} boxes</td><td class="r">${tot.pieces}</td><td class="r">${tot.boxes}</td><td></td><td class="r">${usd(tot.buyerAmt)}</td></tr></table>`;
  downloadXLS(`Proforma_17_${inv.invoiceNo.replace(/\//g, "-")}.xls`, html);
}
export function buildCustomInvoiceXLS(inv, items, buyer) {
  const L = invoiceLines(inv, items);
  const ex = Number(inv.ship?.exRate) || 0;
  const body = L.map((x) => {
    const taxable = x.buyerAmt * ex, g = gstRate(x.it.hsn), gst = taxable * g;
    return `<tr><td>${x.it.code}</td><td>${x.it.hsn}</td><td>${x.it.size}</td><td class="r">${x.pieces}</td><td class="r">$${x.buyerRate.toFixed(2)}</td><td class="r">${usd(x.buyerAmt)}</td><td class="r">${inr(taxable)}</td><td class="r">${(g * 100).toFixed(0)}%</td><td class="r">${inr(gst)}</td></tr>`;
  }).join("");
  const tot = invoiceTotals(inv, items);
  const taxableTot = tot.buyerAmt * ex, gstTot = L.reduce((s, x) => s + x.buyerAmt * ex * gstRate(x.it.hsn), 0);
  const html = `<h2>CUSTOM INVOICE — Doc 18</h2>${exporterHtml()}<br>${shipHtml(inv, buyer)}<br>
    <table><tr><th>Code</th><th>HSN</th><th>Size</th><th>Pieces</th><th>Rate $/pc</th><th>FOB Amount $</th><th>Taxable ₹</th><th>GST %</th><th>GST ₹</th></tr>
    ${body}<tr class="sec"><td colspan="3">TOTAL FOB · ${tot.boxes} boxes</td><td class="r">${tot.pieces}</td><td></td><td class="r">${usd(tot.buyerAmt)}</td><td class="r">${inr(taxableTot)}</td><td></td><td class="r">${inr(gstTot)}</td></tr></table><br>
    <table><tr><td class="h">Nett Wt</td><td>${inv.ship?.netWt || "—"} kg</td><td class="h">Gross Wt</td><td>${inv.ship?.grossWt || "—"} kg</td><td class="h">FOB Value</td><td>${usd(tot.buyerAmt)} / ${inr(taxableTot)}</td></tr></table><br>
    <p>Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX. We intend to claim rewards under RoDTEP. — FOR ${EXPORTER.name}</p>`;
  downloadXLS(`Custom_Invoice_18_${inv.invoiceNo.replace(/\//g, "-")}.xls`, html);
}
export function buildSupplierXLS(inv, items, supCode) {
  const L = invoiceLines(inv, items);
  const body = L.map((x) => `<tr><td>${supCode(x.supplierId)}</td><td>${x.it.gd}</td><td>${x.it.code}</td><td class="r">${x.boxes}</td><td class="r">${x.pieces}</td><td class="r">${num(x.volume, 3)}</td><td class="r">${inr(x.supRate)}</td><td class="r">${inr(x.supAmt)}</td></tr>`).join("");
  const tot = invoiceTotals(inv, items);
  const html = `<h2>SUPPLIER SHEET — ${inv.invoiceNo}</h2>${exporterHtml()}<br>
    <table><tr><th>Supplier</th><th>GD</th><th>Code</th><th>Boxes</th><th>Pieces</th><th>Volume m³</th><th>Rate ₹/pc</th><th>Amount ₹</th></tr>
    ${body}<tr class="sec"><td colspan="3">TOTAL</td><td class="r">${tot.boxes}</td><td class="r">${tot.pieces}</td><td class="r">${num(tot.volume, 3)}</td><td></td><td class="r">${inr(tot.supAmt)}</td></tr></table>`;
  downloadXLS(`Supplier_Sheet_${inv.invoiceNo.replace(/\//g, "-")}.xls`, html);
}

/* ===== Row builders for the wide "full" sheets & CSV exports ===== */
export const BM_HEAD = ["Date", "PO", "Code", "GD", "Size", "Len", "Pack", "Description", "Barcode", "HSN", "Qty", "Boxes", "Vol m³", "Net kg", "Gross kg", "Stk/box", "Labels", "Sheets", "Unit ₹", "Total ₹", "FOB/100 $", "Total $", "RBI", "RBI ref ₹", "Rate ₹"];
export function bmRaw(r) {
  const it = r.item, d = deriveBuyer(it, r.qty, r.rbi);
  return [r.date, r.po, it.code, it.gd, it.size, it.length, it.packing, it.description, it.barcode, it.hsn, r.qty, d.boxes,
    d.volTotal.toFixed(3), d.netTotal.toFixed(2), d.grossTotal.toFixed(2), d.stickersPerBox.toFixed(2), Math.round(d.labels), d.sheets,
    it.unitValue, d.totalValueINR.toFixed(2), it.unitFob100, d.totalFobUSD.toFixed(2), r.rbi, d.rbiRefINR.toFixed(2), d.rate.toFixed(2)];
}
export const SM7_HEAD = ["Sr no", "PO", "Code", "GD", "OSWIN", "GL", "Size", "Len", "Packing", "Description", "Bar code", "HSN", "Qty", "Box", "Vol/box", "Total vol", "BG", "PC", "TTL", "Barcode stk", "Sheets", "Cost/unit ₹", "Total cost ₹", "FOB/pc $", "Total FOB $", "RBI", "RBI ref ₹", "Rate ₹"];
export function sm7Raw(g, rbi) {
  const it = g.it;
  return [g.sr, g.po, it.code, it.gd, it.oswin, it.gl, it.size, it.length, it.packing, it.description, it.barcode, it.hsn,
    g.qty, g.boxes, it.volume.toFixed(3), g.totalVol.toFixed(3), g.bg, g.pc, g.ttl, g.barcodeStickers, g.sheets,
    g.costPerUnit, g.totalCost.toFixed(2), g.unitFobPc.toFixed(4), g.totalFobPc.toFixed(2), rbi, g.rbiRefCost.toFixed(2), g.rate.toFixed(2)];
}

/* ===== Formula reference (shown in the "How is this calculated?" drawers) ===== */
export const BUYER_FORMULAS = [
  ["Boxes", "RoundUp ( Quantity ÷ Packing )"], ["Net weight (total)", "Boxes × Net weight per box"], ["Gross weight (total)", "Boxes × Gross weight per box"],
  ["Volume (total)", "Boxes × Volume per box"], ["Stickers per box", "( Bg per box + P per box ) × 1.1"], ["Labels", "Quantity × Stickers per box"],
  ["Sheets required", "RoundUp ( Labels ÷ Type UP )"], ["Total value (₹)", "Unit value × Quantity"], ["Total FOB / 100 pcs ($)", "( Quantity × Unit FOB/100 ) ÷ 100"],
  ["RBI reference value (₹)", "RBI day rate × Total FOB ($)"], ["Rate (₹)", "RBI reference value ÷ Quantity"],
];
export const SUPPLIER_FORMULAS = [
  ["Sr no (carton range)", "continuous box numbers, sized by each item’s box count"],
  ["Quantity", "Σ quantity of every PO for that item (POs listed together)"],
  ["Box", "RoundUp ( Quantity ÷ Packing )"],
  ["Total volume", "Box × Volume per box"],
  ["BG · PC · TTL", "BG = units/box, PC = 1 (carton), TTL = BG + PC"],
  ["Barcode stickers", "Box × TTL × 1.05"],
  ["Sheets required", "RoundUp ( Barcode stickers ÷ 125 )"],
  ["Total cost (₹)", "Cost per unit × Quantity"],
  ["FOB / pc ($)", "Unit FOB per 100 ÷ 100"],
  ["Total FOB ($)", "Quantity × FOB per pc"],
  ["RBI reference cost (₹)", "Current ₹/$ rate × Total FOB"],
  ["Rate (₹)", "RBI reference cost ÷ Quantity"],
];

/* ===== Edit schemas ===== */
export const ITEM_NUM = ["packing", "volume", "netPerBox", "grossPerBox", "bgPerBox", "pPerBox", "typeUp", "unitValue", "unitFob100"];
export const EMPTY_ITEM = { code: "", gd: "", oswin: "", gl: "", size: "", length: "", packing: "", description: "", barcode: "", hsn: "", volume: "", netPerBox: "", grossPerBox: "", bgPerBox: "", pPerBox: "", typeUp: "", unitValue: "", unitFob100: "", group: "PP Moulded", supplierId: "s1" };
export const itemSchema = (suppliers) => [
  { key: "code", label: "Code" }, { key: "gd", label: "GD code" }, { key: "oswin", label: "OSWIN code" }, { key: "gl", label: "GL code" },
  { key: "size", label: "Size (mm)" }, { key: "length", label: "Length (mm)" }, { key: "packing", label: "Packing (units/box)", type: "number" },
  { key: "description", label: "Description" }, { key: "barcode", label: "Bar code" }, { key: "hsn", label: "HSN code" },
  { key: "volume", label: "Volume/box (m³)", type: "number" }, { key: "netPerBox", label: "Net/box (kg)", type: "number" }, { key: "grossPerBox", label: "Gross/box (kg)", type: "number" },
  { key: "bgPerBox", label: "Bg per box", type: "number" }, { key: "pPerBox", label: "P per box", type: "number" }, { key: "typeUp", label: "Type UP", type: "number" },
  { key: "unitValue", label: "Unit value (₹)", type: "number" }, { key: "unitFob100", label: "Unit FOB/100 ($)", type: "number" },
  { key: "group", label: "Group", type: "select", options: ITEM_GROUPS.map((g) => ({ value: g, label: g })) },
  { key: "supplierId", label: "Supplier", type: "select", options: suppliers.map((s) => ({ value: s.id, label: s.code + " — " + s.name })) },
];
export const BUYER_SCHEMA = [{ key: "name", label: "Buyer name" }, { key: "brand", label: "Trading as" }, { key: "country", label: "Country" }, { key: "curr", label: "Currency" }, { key: "shipTo", label: "Ship to (port)" }, { key: "addr", label: "Address" }, { key: "orderNo", label: "Buyer order no." }];
export const SUP_SCHEMA = [{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "place", label: "Place" }, { key: "gstin", label: "GSTIN" }];

/* ===== Document catalogue, grouped into the six plain-English stages ===== */
export const DOC_GROUPS = [
  { k: "A", t: "Buyer order", hint: "Raised when the buyer places an order", docs: ["1", "2A", "2", "3", "4", "5", "6"] },
  { k: "B", t: "Supplier packing", hint: "Raised when suppliers deliver boxes", docs: ["7A", "7", "8", "9", "10", "11A", "11"] },
  { k: "C", t: "Pre-shipment", hint: "Everything customs needs before loading", docs: ["12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29"] },
  { k: "D", t: "Post-shipment", hint: "Sent after the container sails", docs: ["30", "31", "32", "33", "34"] },
  { k: "E", t: "Reports", hint: "Balance registers and costing", docs: ["35", "36", "37", "38", "39"] },
  { k: "F", t: "Banking", hint: "Export bill regularisation", docs: ["40"] },
];
