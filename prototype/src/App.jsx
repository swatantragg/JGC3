import { useState, useEffect } from "react";
import {
  LayoutDashboard, Database, ClipboardList, PackageCheck, BarChart3, FileText,
  Ship, Plus, ArrowRight, Check, Boxes, Building2, ChevronRight, Anchor,
  Package, Layers, Truck, RotateCcw, Globe, ListOrdered, History, Download, Pencil, X, Sun, Moon,
  SlidersHorizontal, GripVertical, Trash2
} from "lucide-react";
import { buildDocument, DOC_META, writeXLS, renderDocument, PREVIEW_CSS } from "./docs.js";

/* ===== Global Trade identity =====
   Colours resolve to CSS variables so light/dark themes swap centrally (see index.css).
   `brand` = the fixed dark-navy surface (header, hero, table heads) — stays dark in both themes.
   `navy`  = primary foreground/text — dark in light mode, light in dark mode. */
const C = {
  brand: "var(--c-brand)", navy: "var(--c-navy)", navy2: "var(--c-brand-2)",
  amber: "var(--c-amber)", amberDark: "var(--c-amber-dark)", amberTint: "var(--c-amber-tint)",
  teal: "var(--c-teal)", tealTint: "var(--c-teal-tint)", tealDark: "var(--c-teal-dark)",
  canvas: "var(--c-canvas)", card: "var(--c-card)", border: "var(--c-border)",
  ink: "var(--c-ink)", muted: "var(--c-muted)", faint: "var(--c-faint)",
  navyTint: "var(--c-navy-tint)", code: "var(--c-code)",
};
const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");
const usd = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdp = (n) => "$" + Number(n || 0).toFixed(4);
const num = (n, d = 2) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const dmy = (s) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const pad3 = (n) => String(Math.max(0, Math.round(n))).padStart(3, "0");
const TODAY = new Date().toISOString().slice(0, 10);

/* ===== Seed data ===== */
const SUPPLIERS = [
  { id: "s1", code: "OSWIN", name: "Oswin Plastics", place: "Daman", gstin: "26AAACO0802H1ZY", weights: "manual" },
  { id: "s2", code: "VP", name: "V. P. Plastics", place: "Daman", gstin: "24AAGFV1148R1Z3", weights: "auto" },
  { id: "s3", code: "HP", name: "Hansa Polymers", place: "Silvassa", gstin: "26AABFH9921K1Z8", weights: "auto" },
  { id: "s4", code: "KP", name: "Kiran Polyfab", place: "Daman", gstin: "24AAHFK3320M1Z1", weights: "auto" },
  { id: "s5", code: "PH", name: "Pushpam Industries", place: "Vapi", gstin: "24AAGFP7741C1Z9", weights: "auto" },
  { id: "s6", code: "SP", name: "Shree Poly Works", place: "Daman", gstin: "26AALFS2210N1Z4", weights: "auto" },
];
const supCode = (id) => SUPPLIERS.find((s) => s.id === id)?.code || "—";
const BUYERS = [
  { id: "b1", name: "Corecomp Pty Ltd", brand: "GD Watermark", country: "Australia", curr: "USD", shipTo: "Fremantle", addr: "13, Tesla Link, Wangara WA 6065 (Australia)", orderNo: "JG/26-P/09" },
  { id: "b2", name: "Aqua Distributors Ltd", brand: "AquaMark", country: "New Zealand", curr: "USD", shipTo: "Auckland", addr: "42 Marina Way, Auckland 1010 (New Zealand)", orderNo: "JG/26-P/11" },
];
const BUYER = BUYERS[0];
const buyerById = (id) => BUYERS.find((b) => b.id === id) || BUYERS[0];
// Exporter identity + shipment field template — sourced from document 18 (Custom Invoice)
const EXPORTER = { name: "JAIKVIN GLOBAL", sub: "Merchant Exporters", addr: "A-101, Rajshree Royale, Navroji Lane, Ghatkopar (W), MUMBAI-400 086. Maharashtra (State Code : 27)", tel: "9987122600", email: "aalok.shah@jaikvinglobal.com", iec: "AVIPS4808H", gstin: "27AVIPS4808H1Z8", pan: "AVIPS4808H", origin: "INDIA" };
const SHIP_FIELDS = [
  { key: "blNo", label: "BL No" }, { key: "blDate", label: "BL Date", type: "date" },
  { key: "sbNo", label: "S/B No" }, { key: "sbDate", label: "S/B Date", type: "date" },
  { key: "vessel", label: "Shipped per (vessel / voyage)" }, { key: "pol", label: "Port of loading" },
  { key: "pod", label: "Port of discharge" }, { key: "finalDest", label: "Final destination" },
  { key: "terms", label: "Terms of delivery" }, { key: "payment", label: "Terms of payment" },
  { key: "bank", label: "Through (bank)" }, { key: "marks", label: "Marks & Nos" },
  { key: "pkgs", label: "No & kinds of pkgs" }, { key: "container", label: "Container No" },
  { key: "seal", label: "Seal No" }, { key: "netWt", label: "Nett wt (kg)", type: "number" },
  { key: "grossWt", label: "Gross wt (kg)", type: "number" }, { key: "exRate", label: "Exchange rate ₹/$", type: "number" },
];
const EMPTY_SHIP = { blNo: "", blDate: "", sbNo: "", sbDate: "", vessel: "", pol: "NHAVA SHEVA-MUMBAI (INDIA)", pod: "", finalDest: "", terms: "FOB MUMBAI", payment: "D.P. SIGHT DRAFT", bank: "HDFC BANK LTD, GHATKOPAR (E) BRANCH", marks: "", pkgs: "", container: "", seal: "", netWt: "", grossWt: "", exRate: "92.50" };
const shipComplete = (s) => !!(s && s.blNo && s.vessel && s.container && s.pod);

const SEED_ITEMS = [
  { id: "i1", code: "E-114", gd: "GD-2001", oswin: "OSW-114", gl: "GL-114", size: "20", length: "58", packing: 200, description: "PP threaded elbow", barcode: "8901234020014", hsn: "39174000", volume: 0.042, netPerBox: 9.2, grossPerBox: 10.1, bgPerBox: 1, pPerBox: 2, typeUp: 24, unitValue: 7.4, unitFob100: 15.8, group: "PP Moulded", supplierId: "s1" },
  { id: "i2", code: "T-220", gd: "GD-2050", oswin: "OSW-220", gl: "GL-220", size: "25", length: "62", packing: 150, description: "PP equal tee", barcode: "8901234020502", hsn: "39174000", volume: 0.040, netPerBox: 8.6, grossPerBox: 9.4, bgPerBox: 1, pPerBox: 2, typeUp: 24, unitValue: 9.1, unitFob100: 19.6, group: "PP Moulded", supplierId: "s2" },
  { id: "i3", code: "R-310", gd: "GD-2100", oswin: "OSW-310", gl: "GL-310", size: "32", length: "3000", packing: 50, description: "PP riser pipe", barcode: "8901234021003", hsn: "39172200", volume: 0.085, netPerBox: 14.0, grossPerBox: 15.2, bgPerBox: 1, pPerBox: 1, typeUp: 16, unitValue: 41.0, unitFob100: 88.0, group: "PP Extruded", supplierId: "s3" },
  { id: "i4", code: "N-410", gd: "GD-2200", oswin: "OSW-410", gl: "GL-410", size: "20", length: "44", packing: 100, description: "Nylon compression fitting", barcode: "8901234022000", hsn: "39174000", volume: 0.055, netPerBox: 11.5, grossPerBox: 12.4, bgPerBox: 2, pPerBox: 2, typeUp: 24, unitValue: 18.5, unitFob100: 40.0, group: "PA / Nylon Moulded", supplierId: "s4" },
  { id: "i5", code: "C-510", gd: "GD-2300", oswin: "OSW-510", gl: "GL-510", size: "—", length: "—", packing: 25, description: "Corrugated carton, 5-ply", barcode: "8901234023007", hsn: "48191010", volume: 0.120, netPerBox: 16.0, grossPerBox: 16.8, bgPerBox: 0, pPerBox: 1, typeUp: 12, unitValue: 22.0, unitFob100: 47.0, group: "Corrugated Boxes", supplierId: "s5" },
];

// Each order row carries a snapshot of the item as it was when ordered (so editing prices later never rewrites history)
const rawBM = [
  { id: "r1", date: "2025-11-04", po: "03320", itemId: "i1", qty: 1000, rbi: 83.10 },
  { id: "r2", date: "2025-11-04", po: "03320", itemId: "i3", qty: 300, rbi: 83.10 },
  { id: "r3", date: "2026-02-16", po: "03455", itemId: "i1", qty: 2000, rbi: 83.60 },
  { id: "r4", date: "2026-02-16", po: "03455", itemId: "i2", qty: 900, rbi: 83.60 },
  { id: "r5", date: "2026-02-16", po: "03455", itemId: "i4", qty: 600, rbi: 83.60 },
  { id: "r6", date: "2026-04-22", po: "03539", itemId: "i5", qty: 500, rbi: 83.40 },
  { id: "r7", date: "2026-04-22", po: "03539", itemId: "i2", qty: 600, rbi: 83.40 },
];
const SEED_BM = rawBM.map((r) => ({ ...r, item: { ...SEED_ITEMS.find((x) => x.id === r.itemId) } }));

const SHIPMENTS = [
  { shipId: "JG/26-27/6002", date: "2026-05-05", container: "OOCU0793142", vessel: "CAPE SYROS 092E", bl: "SFPM2605165498", pod: "Fremantle", invoice: "JG/26-27/6002",
    lines: [ { itemId: "i1", boxes: 5, po: "03320" }, { itemId: "i3", boxes: 6, po: "03320" }, { itemId: "i2", boxes: 4, po: "03455" } ] },
  { shipId: "JG/26-27/5988", date: "2026-03-18", container: "TLLU2233019", vessel: "MAERSK CABO 411W", bl: "SFPM2603110233", pod: "Fremantle", invoice: "JG/26-27/5988",
    lines: [ { itemId: "i4", boxes: 3, po: "03455" } ] },
];
const SHIPMENT = { invoice: "JG/26-27/6002", date: "05-May-2026", exporter: "Jaikvin Global, Mumbai", iec: "0391012345", gstin: "27AAACJ1234A1Z5",
  container: "OOCU0793142", vessel: "CAPE SYROS 092E", pol: "Nhava Sheva", pod: "Fremantle", bl: "SFPM2605165498", marks: "GDW 2001–2421", pkgs: 421, terms: "FOB Mumbai" };

// Packing receipts are grouped into invoices; ledger reads the flattened lines. One seed invoice ships some boxes.
const SEED_INVOICES = [
  { id: "inv1", invoiceNo: "JG/26-27/6002", date: "2026-05-05", buyerId: "b1",
    lines: [{ itemId: "i1", supplierId: "s1", boxes: 5 }, { itemId: "i3", supplierId: "s3", boxes: 6 }, { itemId: "i2", supplierId: "s2", boxes: 4 }],
    ship: { ...EMPTY_SHIP, blNo: "SFPM2605165498", blDate: "2026-05-19", sbNo: "2945305", sbDate: "2026-05-04", vessel: "CAPE SYROS VOYAGE 092E", pod: "FREMANTLE", finalDest: "FREMANTLE", marks: "GDW 2001-2421", pkgs: "421 PACKAGES", container: "OOCU0793142", seal: "IND-0054079", netWt: "6050.9", grossWt: "6400", exRate: "92.50" } },
];
const invReceipts = (invoices) => invoices.flatMap((inv) => inv.lines.map((l) => ({ itemId: l.itemId, supplierId: l.supplierId, boxes: Number(l.boxes) || 0 })));

/* ===== Logic ===== */
function deriveBuyer(it, qtyRaw, rbiRaw) {
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
function computeLedger(buyerMaster, receipts, items) {
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
function buildSupplierMaster(buyerMaster, supplierId, from, to, rbi) {
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
function downloadCSV(filename, headers, rows) {
  const esc = (c) => `"${String(c).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  try {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { alert("Download blocked in preview — the table above shows the full data."); }
}
// Download an .xls that Excel opens natively (HTML-table workbook — keeps the multi-section invoice layout)
function downloadXLS(filename, innerHtml) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>td,th{border:1px solid #999;padding:3px 6px;font-family:Calibri,Arial;font-size:11pt;} th{background:#0b2c4d;color:#fff;} .h{font-weight:bold;} .r{text-align:right;} .sec{background:#eaeff3;font-weight:bold;}</style></head><body>${innerHtml}</body></html>`;
  try {
    const url = URL.createObjectURL(new Blob([html], { type: "application/vnd.ms-excel" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) { alert("Download blocked in preview."); }
}
// One invoice → per-line figures for both buyer (USD/FOB) and supplier (INR/cost) views
function invoiceLines(inv, items) {
  return inv.lines.map((l) => {
    const it = items.find((x) => x.id === l.itemId) || l.item || {};
    const boxes = Number(l.boxes) || 0;
    const pieces = boxes * (it.packing || 0);
    const volume = boxes * (it.volume || 0);
    const netWt = boxes * (it.netPerBox || 0);
    const buyerRate = (it.unitFob100 || 0) / 100;            // FOB $/pc
    const buyerAmt = pieces * buyerRate;                     // USD
    const supRate = it.unitValue || 0;                       // ₹/pc
    const supAmt = pieces * supRate;                         // INR
    return { it, supplierId: l.supplierId, boxes, pieces, volume, netWt, buyerRate, buyerAmt, supRate, supAmt };
  });
}
function invoiceTotals(inv, items) {
  const L = invoiceLines(inv, items);
  return {
    lines: L,
    boxes: L.reduce((s, x) => s + x.boxes, 0), volume: L.reduce((s, x) => s + x.volume, 0),
    netWt: L.reduce((s, x) => s + x.netWt, 0), buyerAmt: L.reduce((s, x) => s + x.buyerAmt, 0), supAmt: L.reduce((s, x) => s + x.supAmt, 0),
  };
}
// Boxes + volume grouped by supplier within one invoice
function bySupplier(inv, items) {
  const g = {};
  invoiceLines(inv, items).forEach((x) => { (g[x.supplierId] = g[x.supplierId] || { supplierId: x.supplierId, boxes: 0, volume: 0 }); g[x.supplierId].boxes += x.boxes; g[x.supplierId].volume += x.volume; });
  return Object.values(g);
}

/* ===== Excel-style frozen leading columns =====
   Fixed widths on the first N cells let sticky-left offsets stack predictably.
   `bg` must be opaque (row/header colour) so scrolled cells pass underneath. */
function freezeStyle(widths, i, bg, header) {
  if (!widths || i >= widths.length) return null;
  const left = widths.slice(0, i).reduce((a, b) => a + b, 0);
  return {
    position: "sticky", left, zIndex: header ? 6 : 2, background: bg,
    minWidth: widths[i], maxWidth: widths[i], width: widths[i],
    boxShadow: i === widths.length - 1 ? "6px 0 8px -6px rgba(11,44,77,0.28)" : undefined,
  };
}
// Prototype: every item is offered by two suppliers (primary from master + the next in the list)
function suppliersForItem(it) {
  const primary = SUPPLIERS.find((s) => s.id === it.supplierId) || SUPPLIERS[0];
  const idx = SUPPLIERS.findIndex((s) => s.id === primary.id);
  const secondary = SUPPLIERS[(idx + 1) % SUPPLIERS.length];
  return [primary, secondary];
}

/* ===== UI atoms ===== */
function Btn({ children, onClick, kind = "amber", icon: Icon, disabled, small }) {
  const styles = { amber: { background: disabled ? "#E8C893" : C.amber, color: C.brand }, teal: { background: "#1C7C8C", color: "#fff" }, ghost: { background: C.card, color: C.navy, border: `1px solid ${C.border}` } };
  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-lg font-semibold transition ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      style={{ ...styles[kind], opacity: disabled ? 0.7 : 1, cursor: disabled ? "default" : "pointer" }}>
      {Icon && <Icon size={small ? 14 : 16} strokeWidth={2.4} />} {children}
    </button>
  );
}
const Card = ({ children, pad = true, style }) => <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, ...style }} className={pad ? "p-5" : ""}>{children}</div>;
const Code = ({ children }) => <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.code }}>{children}</span>;
const Eyebrow = ({ children }) => <div className="uppercase font-semibold" style={{ fontSize: 11, letterSpacing: 1.4, color: C.teal }}>{children}</div>;
const Pill = ({ children, tint = C.navyTint, color = C.navy }) => <span className="px-2 py-0.5 rounded-md font-medium" style={{ background: tint, color, fontSize: 11.5 }}>{children}</span>;
const Field = ({ label, children }) => <label className="block"><div className="mb-1 font-medium" style={{ fontSize: 12, color: C.muted }}>{label}</div>{children}</label>;
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 15, color: C.ink, background: C.card, outline: "none", fontFamily: FONT };
const smInput = { ...inputStyle, padding: "8px 10px", fontSize: 14 };
const EditBtn = ({ onClick }) => <button onClick={onClick} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", color: C.teal, padding: 4, display: "inline-flex" }}><Pencil size={14} /></button>;

/* ===== Edit modal ===== */
function EditModal({ title, schema, value, onSave, onClose }) {
  const [f, setF] = useState({ ...value });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,44,77,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: "100%", maxWidth: 760, maxHeight: "86vh", overflowY: "auto", boxShadow: "0 24px 70px rgba(0,0,0,0.35)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.card }}>
          <div className="flex items-center gap-2"><Pencil size={16} color={C.teal} /><span className="font-bold" style={{ color: C.navy, fontSize: 16 }}>{title}</span></div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint }}><X size={18} /></button>
        </div>
        <div className="px-6 py-5">
          <div className="grid grid-cols-3 gap-3">
            {schema.map((s) => (
              <Field key={s.key} label={s.label}>
                {s.type === "select"
                  ? <select style={smInput} value={f[s.key]} onChange={(e) => set(s.key, e.target.value)}>{s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  : <input style={smInput} type={s.type === "number" ? "number" : s.type === "date" ? "date" : "text"} value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)} />}
              </Field>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${C.border}`, position: "sticky", bottom: 0, background: C.canvas }}>
          <span style={{ fontSize: 11.5, color: C.muted, maxWidth: 420 }}>Changes apply to future transactions only — orders already placed keep their original values.</span>
          <div className="flex gap-2"><Btn kind="ghost" small onClick={onClose}>Cancel</Btn><Btn icon={Check} small onClick={() => onSave(f)}>Save changes</Btn></div>
        </div>
      </div>
    </div>
  );
}
const ITEM_NUM = ["packing", "volume", "netPerBox", "grossPerBox", "bgPerBox", "pPerBox", "typeUp", "unitValue", "unitFob100"];
const ITEM_SCHEMA = [
  { key: "code", label: "Code" }, { key: "gd", label: "GD code" }, { key: "oswin", label: "OSWIN code" }, { key: "gl", label: "GL code" },
  { key: "size", label: "Size (mm)" }, { key: "length", label: "Length (mm)" }, { key: "packing", label: "Packing (units/box)", type: "number" },
  { key: "description", label: "Description" }, { key: "barcode", label: "Bar code" }, { key: "hsn", label: "HSN code" },
  { key: "volume", label: "Volume/box (m³)", type: "number" }, { key: "netPerBox", label: "Net/box (kg)", type: "number" }, { key: "grossPerBox", label: "Gross/box (kg)", type: "number" },
  { key: "bgPerBox", label: "Bg per box", type: "number" }, { key: "pPerBox", label: "P per box", type: "number" }, { key: "typeUp", label: "Type UP", type: "number" },
  { key: "unitValue", label: "Unit value (₹)", type: "number" }, { key: "unitFob100", label: "Unit FOB/100 ($)", type: "number" },
  { key: "group", label: "Group", type: "select", options: ["PP Moulded", "PP Extruded", "PA / Nylon Moulded", "Corrugated Boxes", "Adhesive Tapes"].map((g) => ({ value: g, label: g })) },
  { key: "supplierId", label: "Supplier", type: "select", options: SUPPLIERS.map((s) => ({ value: s.id, label: s.code + " — " + s.name })) },
];
const RP_FREEZE = [108, 96]; // Reports: Date · GD code stay frozen in all three tabs
const BD_FREEZE = [82, 74, 66, 66, 92]; // Buyers data: GD · Code · Size · Len · Packing
const SD_FREEZE = [82, 74, 96, 84, 66]; // Supplier data: GD · Code · OSWIN · GL · Size
const BUYER_SCHEMA = [{ key: "name", label: "Buyer name" }, { key: "brand", label: "Trading as" }, { key: "country", label: "Country" }, { key: "curr", label: "Currency" }, { key: "shipTo", label: "Ship to (port)" }];
const SUP_SCHEMA = [{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "place", label: "Place" }, { key: "gstin", label: "GSTIN" }];

/* ===== Buyer master table (2A, one row per order line) ===== */
const BM_HEAD = ["Date", "PO", "Code", "GD", "Size", "Len", "Pack", "Description", "Barcode", "HSN", "Qty", "Boxes", "Vol m³", "Net kg", "Gross kg", "Stk/box", "Labels", "Sheets", "Unit ₹", "Total ₹", "FOB/100 $", "Total $", "RBI", "RBI ref ₹", "Rate ₹"];
const BM_FREEZE = [104, 64, 74, 86, 58]; // Date · PO · Code · GD · Size
function bmRow(r) {
  const it = r.item, d = deriveBuyer(it, r.qty, r.rbi);
  return [dmy(r.date), r.po, it.code, it.gd, it.size, it.length, it.packing, it.description, it.barcode, it.hsn, r.qty, d.boxes,
    num(d.volTotal, 3), num(d.netTotal), num(d.grossTotal), num(d.stickersPerBox), Math.round(d.labels), d.sheets,
    inr(it.unitValue), inr(d.totalValueINR), usd(it.unitFob100), usd(d.totalFobUSD), num(r.rbi), inr(d.rbiRefINR), num(d.rate)];
}
function bmRaw(r) {
  const it = r.item, d = deriveBuyer(it, r.qty, r.rbi);
  return [r.date, r.po, it.code, it.gd, it.size, it.length, it.packing, it.description, it.barcode, it.hsn, r.qty, d.boxes,
    d.volTotal.toFixed(3), d.netTotal.toFixed(2), d.grossTotal.toFixed(2), d.stickersPerBox.toFixed(2), Math.round(d.labels), d.sheets,
    it.unitValue, d.totalValueINR.toFixed(2), it.unitFob100, d.totalFobUSD.toFixed(2), r.rbi, d.rbiRefINR.toFixed(2), d.rate.toFixed(2)];
}
function BuyerMasterTable({ rows, emptyMsg }) {
  if (!rows.length) return <div className="p-8 text-center" style={{ color: C.faint, fontSize: 13 }}>{emptyMsg || "No buyer orders for this selection."}</div>;
  return (
    <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
        <thead><tr style={{ background: C.brand, color: "#fff", textAlign: "left", position: "sticky", top: 0, zIndex: 5 }}>{BM_HEAD.map((h, i) => <th key={h} className="px-2.5 py-2 font-semibold" style={{ ...(freezeStyle(BM_FREEZE, i, C.brand, true) || {}) }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => { const rowBg = i % 2 ? C.canvas : C.card; return (
          <tr key={r.id} style={{ background: rowBg, borderTop: `1px solid ${C.border}` }}>
            {bmRow(r).map((c, j) => <td key={j} className="px-2.5 py-1.5" style={{ color: j < 2 || j === 3 ? C.code : C.ink, fontFamily: [3, 8, 9].includes(j) ? MONO : FONT, fontWeight: j === 11 ? 600 : 400, ...(freezeStyle(BM_FREEZE, j, rowBg) || {}) }}>{c}</td>)}
          </tr>
        ); })}</tbody>
      </table>
    </div>
  );
}

/* ===== 7A supplier master ===== */
const SM7_HEAD = ["Sr no", "PO", "Code", "GD", "OSWIN", "GL", "Size", "Len", "Packing", "Description", "Bar code", "HSN", "Qty", "Box", "Vol/box", "Total vol", "BG", "PC", "TTL", "Barcode stk", "Sheets", "Cost/unit ₹", "Total cost ₹", "FOB/pc $", "Total FOB $", "RBI", "RBI ref ₹", "Rate ₹"];
const SM7_FREEZE = [92, 70, 74, 86, 88]; // Sr no · PO · Code · GD · OSWIN
function sm7Cells(g, rbi) {
  const it = g.it;
  return [g.sr, g.po, it.code, it.gd, it.oswin, it.gl, it.size, it.length, it.packing + " / box", it.description, it.barcode, it.hsn,
    g.qty, g.boxes, num(it.volume, 3), num(g.totalVol, 3), g.bg, g.pc, g.ttl, g.barcodeStickers, g.sheets,
    inr(g.costPerUnit), inr(g.totalCost), usdp(g.unitFobPc), usd(g.totalFobPc), num(rbi), inr(g.rbiRefCost), num(g.rate)];
}
function sm7Raw(g, rbi) {
  const it = g.it;
  return [g.sr, g.po, it.code, it.gd, it.oswin, it.gl, it.size, it.length, it.packing, it.description, it.barcode, it.hsn,
    g.qty, g.boxes, it.volume.toFixed(3), g.totalVol.toFixed(3), g.bg, g.pc, g.ttl, g.barcodeStickers, g.sheets,
    g.costPerUnit, g.totalCost.toFixed(2), g.unitFobPc.toFixed(4), g.totalFobPc.toFixed(2), rbi, g.rbiRefCost.toFixed(2), g.rate.toFixed(2)];
}
function SupplierMaster7A({ rows, rbi }) {
  if (!rows.length) return <div className="p-8 text-center" style={{ color: C.faint, fontSize: 13 }}>No supplier orders for this selection.</div>;
  return (
    <div style={{ overflowX: "auto", maxHeight: 440, overflowY: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
        <thead><tr style={{ background: C.brand, color: "#fff", textAlign: "left", position: "sticky", top: 0, zIndex: 5 }}>{SM7_HEAD.map((h, i) => <th key={h} className="px-2 py-2 font-semibold" style={{ ...(freezeStyle(SM7_FREEZE, i, C.brand, true) || {}) }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((g, i) => { const rowBg = i % 2 ? C.canvas : C.card; return (
          <tr key={i} style={{ background: rowBg, borderTop: `1px solid ${C.border}` }}>
            {sm7Cells(g, rbi).map((c, j) => <td key={j} className="px-2 py-1.5" style={{ color: C.ink, fontFamily: [0, 2, 3, 4, 5, 10, 11].includes(j) ? MONO : FONT, fontWeight: [0, 12, 13].includes(j) ? 600 : 400, ...(freezeStyle(SM7_FREEZE, j, rowBg) || {}) }}>{c}</td>)}
          </tr>
        ); })}</tbody>
      </table>
    </div>
  );
}
function SupplierFormulasPanel() {
  const rows = [
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
  return (
    <Card>
      <Eyebrow>7A supplier master — how each field is built</Eyebrow>
      <p style={{ fontSize: 12.5, color: C.muted }} className="mt-1 mb-4">The PO comes from the buyer order; the day’s ₹/$ rate is asked above when you build the 7A. Everything else derives from the masters. Adjust a formula here if the logic changes.</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1">
        {rows.map(([f, formula]) => (
          <div key={f} className="flex items-baseline justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12.5, color: C.navy, fontWeight: 600, whiteSpace: "nowrap" }}>{f}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.tealDark, textAlign: "right" }}>{formula}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ===== Invoice documents (Excel export) ===== */
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
function exporterHtml() {
  return `<table><tr><td class="h">${EXPORTER.name} (${EXPORTER.sub})</td></tr><tr><td>${EXPORTER.addr}</td></tr><tr><td>Tel: ${EXPORTER.tel} · ${EXPORTER.email}</td></tr><tr><td>IEC ${EXPORTER.iec} · GSTIN ${EXPORTER.gstin} · PAN ${EXPORTER.pan}</td></tr></table>`;
}
// Document 17 — Proforma / buyer purchase order (USD, before shipment details)
function buildProformaXLS(inv, items, buyer) {
  const L = invoiceLines(inv, items);
  const body = L.map((x) => `<tr><td>${x.it.code}</td><td>${x.it.gd}</td><td>${x.it.size}</td><td>${x.it.length}</td><td class="r">${x.pieces}</td><td class="r">${x.boxes}</td><td class="r">$${x.buyerRate.toFixed(2)}</td><td class="r">${usd(x.buyerAmt)}</td></tr>`).join("");
  const tot = invoiceTotals(inv, items);
  const html = `<h2>PROFORMA INVOICE (Buyer) — Doc 17</h2>${exporterHtml()}<br>
    <table><tr><td class="h">To</td><td>${buyer.name} — ${buyer.brand}</td><td class="h">PO No.</td><td>${buyer.orderNo || "—"}</td></tr>
    <tr><td class="h">Deliver to</td><td>${buyer.addr || "—"}</td><td class="h">Date</td><td>${dmy(inv.date)}</td></tr></table><br>
    <table><tr><th>Code</th><th>GD</th><th>Size</th><th>Len (mm)</th><th>Pieces</th><th>Boxes</th><th>Rate $/pc</th><th>Total value</th></tr>
    ${body}<tr class="sec"><td colspan="4">TOTAL · ${tot.boxes} boxes</td><td class="r">${L.reduce((s, x) => s + x.pieces, 0)}</td><td class="r">${tot.boxes}</td><td></td><td class="r">${usd(tot.buyerAmt)}</td></tr></table>`;
  downloadXLS(`Proforma_17_${inv.invoiceNo.replace(/\//g, "-")}.xls`, html);
}
// Document 18 — Custom Invoice (INR + GST + FOB, after shipment details)
function buildCustomInvoiceXLS(inv, items, buyer) {
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
    ${body}<tr class="sec"><td colspan="3">TOTAL FOB · ${tot.boxes} boxes</td><td class="r">${L.reduce((s, x) => s + x.pieces, 0)}</td><td></td><td class="r">${usd(tot.buyerAmt)}</td><td class="r">${inr(taxableTot)}</td><td></td><td class="r">${inr(gstTot)}</td></tr></table><br>
    <table><tr><td class="h">Nett Wt</td><td>${inv.ship?.netWt || "—"} kg</td><td class="h">Gross Wt</td><td>${inv.ship?.grossWt || "—"} kg</td><td class="h">FOB Value</td><td>${usd(tot.buyerAmt)} / ${inr(taxableTot)}</td></tr></table><br>
    <p>Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX. We intend to claim rewards under RoDTEP. — FOR ${EXPORTER.name}</p>`;
  downloadXLS(`Custom_Invoice_18_${inv.invoiceNo.replace(/\//g, "-")}.xls`, html);
}
function buildSupplierXLS(inv, items) {
  const L = invoiceLines(inv, items);
  const body = L.map((x) => `<tr><td>${supCode(x.supplierId)}</td><td>${x.it.gd}</td><td>${x.it.code}</td><td class="r">${x.boxes}</td><td class="r">${x.pieces}</td><td class="r">${num(x.volume, 3)}</td><td class="r">${inr(x.supRate)}</td><td class="r">${inr(x.supAmt)}</td></tr>`).join("");
  const tot = invoiceTotals(inv, items);
  const html = `<h2>SUPPLIER SHEET — ${inv.invoiceNo}</h2>${exporterHtml()}<br>
    <table><tr><th>Supplier</th><th>GD</th><th>Code</th><th>Boxes</th><th>Pieces</th><th>Volume m³</th><th>Rate ₹/pc</th><th>Amount ₹</th></tr>
    ${body}<tr class="sec"><td colspan="3">TOTAL</td><td class="r">${tot.boxes}</td><td class="r">${L.reduce((s, x) => s + x.pieces, 0)}</td><td class="r">${num(tot.volume, 3)}</td><td></td><td class="r">${inr(tot.supAmt)}</td></tr></table>`;
  downloadXLS(`Supplier_Sheet_${inv.invoiceNo.replace(/\//g, "-")}.xls`, html);
}

/* ===== Generic modal shell ===== */
function Modal({ title, icon: Icon = FileText, onClose, children, footer, maxWidth = 900 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,44,77,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: "100%", maxWidth, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(0,0,0,0.35)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2"><Icon size={16} color={C.teal} /><span className="font-bold" style={{ color: C.navy, fontSize: 16 }}>{title}</span></div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint }}><X size={18} /></button>
        </div>
        <div style={{ overflowY: "auto", padding: "18px 22px" }}>{children}</div>
        {footer && <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-2" style={{ borderTop: `1px solid ${C.border}`, background: C.canvas, borderRadius: "0 0 16px 16px" }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ===== Invoice detail modal (buyer / supplier tabs) ===== */
function InvoiceModal({ inv, items, onEditShip, onClose }) {
  const [tab, setTab] = useState("buyer");
  const buyer = buyerById(inv.buyerId);
  const { lines, boxes, volume, buyerAmt, supAmt } = invoiceTotals(inv, items);
  const done = shipComplete(inv.ship);
  const th = (h) => <th key={h} className="px-3 py-2 font-semibold" style={{ textAlign: h.match(/Rate|Amount|Boxes|Pieces|Vol/) ? "right" : "left" }}>{h}</th>;
  return (
    <Modal title={`Invoice · ${inv.invoiceNo}`} onClose={onClose} maxWidth={940}
      footer={<>
        <span style={{ fontSize: 11.5, color: C.muted }}>{dmy(inv.date)} · {buyer.name} · {boxes} boxes · {num(volume, 3)} m³ {done ? "· shipment details complete" : "· shipment details pending"}</span>
        <div className="flex gap-2 flex-wrap">
          <Btn kind="ghost" small icon={Pencil} onClick={onEditShip}>Edit invoice (shipment)</Btn>
          {tab === "buyer"
            ? <>
                <Btn kind="ghost" small icon={Download} onClick={() => buildProformaXLS(inv, items, buyer)}>Proforma (17)</Btn>
                <Btn small icon={Download} disabled={!done} onClick={() => buildCustomInvoiceXLS(inv, items, buyer)}>Custom invoice (18)</Btn>
              </>
            : <Btn small icon={Download} onClick={() => buildSupplierXLS(inv, items)}>Supplier sheet</Btn>}
        </div>
      </>}>
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: C.navyTint, width: "fit-content" }}>
        {[["buyer", "Buyer (" + buyer.brand + ") · USD", Globe], ["supplier", "Supplier · INR", Truck]].map(([k, lbl, I]) => (
          <button key={k} onClick={() => setTab(k)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold" style={{ fontSize: 13, background: tab === k ? C.card : "transparent", color: tab === k ? C.navy : C.muted, cursor: "pointer" }}><I size={14} /> {lbl}</button>
        ))}
      </div>
      {!done && <div className="mb-3 p-2.5 rounded-lg" style={{ background: C.amberTint, fontSize: 12, color: C.amberDark }}>Shipment details not filled — the custom invoice (18) unlocks after you add BL, vessel, container and port via <b>Edit invoice</b>. The proforma (17) is available now.</div>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
          {tab === "buyer" ? (
            <>
              <thead><tr style={{ background: C.brand, color: "#fff" }}>{["GD code", "Description", "Supplier", "Boxes", "Pieces", "Vol m³", "Rate $/pc", "Amount $"].map(th)}</tr></thead>
              <tbody>{lines.map((x, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.canvas : C.card }}>
                  <td className="px-3 py-2"><Code>{x.it.gd}</Code></td><td className="px-3 py-2" style={{ color: C.navy }}>{x.it.description}</td><td className="px-3 py-2"><Pill>{supCode(x.supplierId)}</Pill></td>
                  <td className="px-3 py-2 r" style={{ textAlign: "right", fontWeight: 600 }}>{x.boxes}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{x.pieces.toLocaleString("en-IN")}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{num(x.volume, 3)}</td>
                  <td className="px-3 py-2" style={{ textAlign: "right" }}>{usd(x.buyerRate)}</td><td className="px-3 py-2" style={{ textAlign: "right", fontWeight: 600 }}>{usd(x.buyerAmt)}</td>
                </tr>))}</tbody>
              <tfoot><tr style={{ background: C.amberTint, fontWeight: 700, color: C.navy }}><td className="px-3 py-2" colSpan={3}>Total</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{boxes}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{lines.reduce((s, x) => s + x.pieces, 0).toLocaleString("en-IN")}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{num(volume, 3)}</td><td></td><td className="px-3 py-2" style={{ textAlign: "right" }}>{usd(buyerAmt)}</td></tr></tfoot>
            </>
          ) : (
            <>
              <thead><tr style={{ background: C.brand, color: "#fff" }}>{["Supplier", "GD code", "Code", "Boxes", "Pieces", "Vol m³", "Rate ₹/pc", "Amount ₹"].map(th)}</tr></thead>
              <tbody>{lines.slice().sort((a, b) => supCode(a.supplierId).localeCompare(supCode(b.supplierId))).map((x, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.canvas : C.card }}>
                  <td className="px-3 py-2"><Pill>{supCode(x.supplierId)}</Pill></td><td className="px-3 py-2"><Code>{x.it.gd}</Code></td><td className="px-3 py-2"><Code>{x.it.code}</Code></td>
                  <td className="px-3 py-2" style={{ textAlign: "right", fontWeight: 600 }}>{x.boxes}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{x.pieces.toLocaleString("en-IN")}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{num(x.volume, 3)}</td>
                  <td className="px-3 py-2" style={{ textAlign: "right" }}>{inr(x.supRate)}</td><td className="px-3 py-2" style={{ textAlign: "right", fontWeight: 600 }}>{inr(x.supAmt)}</td>
                </tr>))}</tbody>
              <tfoot><tr style={{ background: C.amberTint, fontWeight: 700, color: C.navy }}><td className="px-3 py-2" colSpan={3}>Total</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{boxes}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{lines.reduce((s, x) => s + x.pieces, 0).toLocaleString("en-IN")}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{num(volume, 3)}</td><td></td><td className="px-3 py-2" style={{ textAlign: "right" }}>{inr(supAmt)}</td></tr></tfoot>
            </>
          )}
        </table>
      </div>
    </Modal>
  );
}

/* ===== Dashboard ===== */
function Dashboard({ ledger, shipments, items, go }) {
  const pendingBoxes = Object.values(ledger).reduce((s, b) => s + b.demands.reduce((t, d) => t + d.remaining, 0), 0);
  const recent = shipments.flatMap((s) => s.lines.map((l) => ({ ...l, shipId: s.shipId, date: s.date }))).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  return (
    <div className="space-y-6">
      <div style={{ background: C.brand, borderRadius: 16, color: "#fff", overflow: "hidden", position: "relative" }} className="p-7">
        <div style={{ position: "absolute", right: -30, top: -30, fontFamily: MONO, fontSize: 120, color: "rgba(255,255,255,0.04)" }}>2001–2421</div>
        <Eyebrow>Jaikvin Global · Export operations</Eyebrow>
        <h1 className="font-bold mt-2" style={{ fontSize: 30, letterSpacing: -0.5, lineHeight: 1.1 }}>Enter once. Generate everything.<br />Always balanced.</h1>
        <div className="flex flex-wrap gap-2 mt-5" style={{ fontSize: 12.5 }}>
          {[["Invoice", SHIPMENT.invoice], ["Container", SHIPMENT.container], ["Route", `${SHIPMENT.pol} → ${SHIPMENT.pod}`], ["Marks", SHIPMENT.marks]].map(([k, v]) => (
            <span key={k} className="px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }}><span style={{ color: "#8FA6BC" }}>{k} </span><span style={{ fontFamily: MONO }}>{v}</span></span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[{ l: "Buyer", v: "1", s: BUYER.brand, i: Globe }, { l: "Suppliers", v: "6", s: "Daman · Vapi · Silvassa", i: Truck },
          { l: "Pending boxes", v: pendingBoxes, s: "FIFO, oldest first", i: Boxes, a: true }, { l: "Shipments", v: shipments.length, s: "this season", i: Ship }].map((s) => (
          <Card key={s.l}><span style={{ color: s.a ? C.amberDark : C.teal }}><s.i size={18} /></span>
            <div className="font-bold mt-3" style={{ fontSize: 30, color: C.navy, lineHeight: 1 }}>{s.v}</div>
            <div className="font-medium mt-1" style={{ fontSize: 13, color: C.ink }}>{s.l}</div><div style={{ fontSize: 11.5, color: C.faint }}>{s.s}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2" style={{ color: C.navy, fontWeight: 600, fontSize: 13 }}><PackageCheck size={15} color={C.teal} /> Recently shipped — cleared from FIFO</div>
            <button onClick={() => go("history")} style={{ fontSize: 12, color: C.teal, fontWeight: 600, cursor: "pointer", background: "none", border: "none" }}>Full history →</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: "left", color: C.muted }}>{["Item", "Boxes", "Cleared PO", "Ship ID", "Date"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{recent.map((r, i) => { const it = items.find((x) => x.id === r.itemId); return (
              <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                <td className="px-4 py-2.5"><Code>{it.gd}</Code> <span style={{ color: C.navy }}>{it.description}</span></td>
                <td className="px-4 py-2.5" style={{ fontWeight: 600 }}>{r.boxes}</td>
                <td className="px-4 py-2.5"><Pill tint={C.amberTint} color={C.amberDark}>PO {r.po}</Pill></td>
                <td className="px-4 py-2.5"><Code>{r.shipId}</Code></td><td className="px-4 py-2.5" style={{ color: C.muted }}>{dmy(r.date)}</td>
              </tr>); })}</tbody>
          </table>
        </Card>
        <Card>
          <Eyebrow>The six-stage workflow</Eyebrow>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {[["A", "Buyer order", "order"], ["B", "Packing · FIFO", "fifo"], ["C", "Pre-shipment", "docs"], ["D", "Post-shipment", "docs"], ["E", "Reports", "reports"], ["F", "Banking", "docs"]].map(([k, t, v]) => (
              <button key={k} onClick={() => go(v)} className="text-left p-2.5 rounded-xl transition" style={{ border: `1px solid ${C.border}`, background: C.canvas, cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, color: C.amber, fontSize: 12 }}>{k}</span><div className="font-semibold mt-1" style={{ fontSize: 12, color: C.navy }}>{t}</div>
              </button>
            ))}
          </div>
          <div className="mt-3"><Btn icon={ArrowRight} small onClick={() => go("order")}>Start a buyer order</Btn></div>
        </Card>
      </div>
    </div>
  );
}

/* ===== Masters ===== */
const EMPTY_ITEM = { code: "", gd: "", oswin: "", gl: "", size: "", length: "", packing: "", description: "", barcode: "", hsn: "", volume: "", netPerBox: "", grossPerBox: "", bgPerBox: "", pPerBox: "", typeUp: "", unitValue: "", unitFob100: "", group: "PP Moulded", supplierId: "s1" };
function AddItemForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY_ITEM);
  const set = (k, v) => setF({ ...f, [k]: v });
  const fields = [
    ["code", "Code"], ["gd", "GD Code"], ["oswin", "OSWIN code"], ["gl", "GL code"], ["size", "Size (mm)"], ["length", "Length (mm)"], ["packing", "Packing (units / box)"],
    ["description", "Description"], ["barcode", "Bar code number"], ["hsn", "HSN code"], ["volume", "Volume / box (m³)"],
    ["netPerBox", "Net weight / box (kg)"], ["grossPerBox", "Gross weight / box (kg)"], ["bgPerBox", "Bg per box"], ["pPerBox", "P per box"],
    ["typeUp", "Type UP (labels / sheet)"], ["unitValue", "Unit value (₹)"], ["unitFob100", "Unit FOB / 100 pcs (US $)"],
  ];
  const stick = (Number(f.bgPerBox) + Number(f.pPerBox)) * 1.1;
  const save = () => { const o = { ...f, id: "i" + Date.now(), oswin: f.oswin || "OSW-" + f.code, gl: f.gl || "GL-" + f.code }; ITEM_NUM.forEach((k) => (o[k] = Number(o[k]))); onAdd(o); setF(EMPTY_ITEM); setOpen(false); };
  if (!open) return <Btn icon={Plus} onClick={() => setOpen(true)}>Add item</Btn>;
  return (
    <Card style={{ background: C.canvas }}>
      <div className="flex items-center justify-between mb-4"><Eyebrow>New item — enter once, derive forever</Eyebrow><button onClick={() => setOpen(false)} style={{ color: C.faint, fontSize: 12, cursor: "pointer", background: "none", border: "none" }}>Cancel</button></div>
      <div className="grid grid-cols-4 gap-3">
        {fields.map(([k, lbl]) => <Field key={k} label={lbl}><input style={smInput} value={f[k]} onChange={(e) => set(k, e.target.value)} /></Field>)}
        <Field label="Group"><select style={smInput} value={f.group} onChange={(e) => set("group", e.target.value)}>{["PP Moulded", "PP Extruded", "PA / Nylon Moulded", "Corrugated Boxes", "Adhesive Tapes"].map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Supplier"><select style={smInput} value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)}>{SUPPLIERS.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select></Field>
      </div>
      <div className="flex items-center justify-between mt-4"><div style={{ fontSize: 12, color: C.muted }}>Stickers / box auto = (Bg + P) × 1.1 = <b style={{ color: C.navy }}>{isNaN(stick) ? "—" : num(stick)}</b></div><Btn icon={Check} onClick={save} disabled={!f.code || !f.gd || !f.packing}>Save item</Btn></div>
    </Card>
  );
}
/* Items master columns — driven by state so they can be reordered / hidden / added */
const DEFAULT_ITEM_COLS = [
  { key: "gd", label: "GD code", w: 92, visible: true, render: (it) => <Code>{it.gd}</Code> },
  { key: "code", label: "Code", w: 74, visible: true, render: (it) => <Code>{it.code}</Code> },
  { key: "oswin", label: "OSWIN", w: 96, visible: true, render: (it) => <Code>{it.oswin}</Code> },
  { key: "gl", label: "GL", w: 84, visible: true, render: (it) => <Code>{it.gl}</Code> },
  { key: "description", label: "Description", w: 190, visible: true, render: (it) => <span style={{ color: C.navy, fontWeight: 600 }}>{it.description}<div style={{ color: C.faint, fontWeight: 400, fontSize: 11 }}>{it.group}</div></span> },
  { key: "size", label: "Size mm", w: 72, visible: true, render: (it) => it.size },
  { key: "length", label: "Len mm", w: 72, visible: true, render: (it) => it.length },
  { key: "packing", label: "Packing", w: 92, visible: true, render: (it) => it.packing + " / box" },
  { key: "barcode", label: "Bar code", w: 124, visible: true, render: (it) => <Code>{it.barcode}</Code> },
  { key: "hsn", label: "HSN", w: 84, visible: true, render: (it) => <Code>{it.hsn}</Code> },
  { key: "volume", label: "Vol/box", w: 74, visible: true, render: (it) => num(it.volume, 3) },
  { key: "netPerBox", label: "Net/box", w: 74, visible: true, render: (it) => it.netPerBox },
  { key: "grossPerBox", label: "Gross/box", w: 82, visible: true, render: (it) => it.grossPerBox },
  { key: "bgPerBox", label: "Bg", w: 50, visible: true, render: (it) => it.bgPerBox },
  { key: "pPerBox", label: "P", w: 46, visible: true, render: (it) => it.pPerBox },
  { key: "stk", label: "Stk/box", w: 76, visible: true, render: (it) => <span style={{ fontWeight: 600 }}>{num((it.bgPerBox + it.pPerBox) * 1.1)}</span> },
  { key: "typeUp", label: "Type UP", w: 78, visible: true, render: (it) => it.typeUp },
  { key: "unitValue", label: "Unit ₹", w: 76, visible: true, render: (it) => inr(it.unitValue) },
  { key: "unitFob100", label: "FOB/100 $", w: 92, visible: true, render: (it) => usd(it.unitFob100) },
  { key: "supplier", label: "Supplier", w: 92, visible: true, render: (it) => <Pill>{supCode(it.supplierId)}</Pill> },
];
const customCol = (name) => ({ key: "c" + Date.now(), label: name, w: 120, visible: true, custom: true, render: () => <span style={{ color: C.faint }}>—</span> });

/* Column manager — reorder (drag), hide (checkbox), add custom, then Save */
function ColumnManager({ cols, onSave, onClose }) {
  const [list, setList] = useState(cols.map((c) => ({ ...c })));
  const [dragI, setDragI] = useState(null);
  const [overI, setOverI] = useState(null);
  const [name, setName] = useState("");
  const toggle = (i) => setList((l) => l.map((c, j) => (j === i ? { ...c, visible: !c.visible } : c)));
  const removeCustom = (i) => setList((l) => l.filter((_, j) => j !== i));
  const drop = (i) => { if (dragI === null || dragI === i) { setDragI(null); setOverI(null); return; } setList((l) => { const a = [...l]; const [m] = a.splice(dragI, 1); a.splice(i, 0, m); return a; }); setDragI(null); setOverI(null); };
  const add = () => { const n = name.trim(); if (!n) return; setList((l) => [...l, customCol(n)]); setName(""); };
  const shown = list.filter((c) => c.visible).length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,44,77,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(0,0,0,0.35)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2"><SlidersHorizontal size={16} color={C.teal} /><span className="font-bold" style={{ color: C.navy, fontSize: 16 }}>Columns</span></div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint }}><X size={18} /></button>
        </div>
        <div style={{ padding: "10px 16px", fontSize: 11.5, color: C.muted, borderBottom: `1px solid ${C.border}` }}>Drag <GripVertical size={12} className="inline" /> to reorder · untick to remove a column · add a custom one below. First five stay frozen.</div>
        <div style={{ overflowY: "auto", padding: 8 }}>
          {list.map((c, i) => (
            <div key={c.key} draggable onDragStart={() => setDragI(i)} onDragOver={(e) => { e.preventDefault(); setOverI(i); }} onDrop={() => drop(i)} onDragEnd={() => { setDragI(null); setOverI(null); }}
              className="flex items-center gap-2 px-2 py-2 rounded-lg"
              style={{ borderTop: overI === i && dragI !== null ? `2px solid ${C.amber}` : "2px solid transparent", background: dragI === i ? C.amberTint : "transparent", cursor: "grab" }}>
              <GripVertical size={15} color={C.faint} />
              <input type="checkbox" checked={c.visible} onChange={() => toggle(i)} style={{ width: 15, height: 15, accentColor: C.teal, cursor: "pointer" }} />
              <span style={{ fontSize: 13, color: c.visible ? C.navy : C.faint, fontWeight: 500, flex: 1 }}>{c.label}{c.custom && <Pill tint={C.tealTint} color={C.tealDark}>&nbsp;custom&nbsp;</Pill>}</span>
              {i < 5 && c.visible && <Pill tint={C.amberTint} color={C.amberDark}>frozen</Pill>}
              {c.custom && <button onClick={() => removeCustom(i)} title="Delete column" style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2 }}><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
          <input style={smInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="New column name" onKeyDown={(e) => e.key === "Enter" && add()} />
          <Btn kind="ghost" small icon={Plus} onClick={add}>Add</Btn>
        </div>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: `1px solid ${C.border}`, background: C.canvas, borderRadius: "0 0 16px 16px" }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>{shown} column(s) shown</span>
          <div className="flex gap-2"><Btn kind="ghost" small onClick={onClose}>Cancel</Btn><Btn icon={Check} small onClick={() => onSave(list)}>Save</Btn></div>
        </div>
      </div>
    </div>
  );
}

function Masters({ items, setItems }) {
  const [tab, setTab] = useState("items");
  const [itemCols, setItemCols] = useState(DEFAULT_ITEM_COLS);
  const [colMgr, setColMgr] = useState(false);
  const [sup, setSup] = useState(SUPPLIERS);
  const [draft, setDraft] = useState({ name: "", place: "", gstin: "" });
  const [supFilter, setSupFilter] = useState("all");
  const [buyers, setBuyers] = useState([BUYER]);
  const [bDraft, setBDraft] = useState({ name: "", brand: "", country: "", curr: "USD", shipTo: "" });
  const [editing, setEditing] = useState(null);
  const shownItems = items.filter((it) => supFilter === "all" || it.supplierId === supFilter);
  const tabs = [["items", "Items", Layers], ["buyers", "Buyer", Globe], ["suppliers", "Suppliers", Truck], ["buyersData", "Buyers data", ClipboardList], ["supplierData", "Supplier data", Boxes]];
  const saveItem = (f) => { const o = { ...f }; ITEM_NUM.forEach((k) => (o[k] = Number(o[k]))); setItems(items.map((it) => (it.id === o.id ? o : it))); setEditing(null); };

  return (
    <div className="space-y-5">
      <div><Eyebrow>Master data · the single source of truth</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Masters</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Set up once. Every document downstream reads from here — so an order only needs a code and a quantity. Use the pencil to edit any value; changes apply to new transactions only.</p></div>
      <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: C.navyTint, width: "fit-content" }}>
        {tabs.map(([k, lbl, I]) => <button key={k} onClick={() => setTab(k)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition"
          style={{ fontSize: 13, background: tab === k ? C.card : "transparent", color: tab === k ? C.navy : C.muted, cursor: "pointer" }}><I size={15} /> {lbl}</button>)}
      </div>

      {tab === "items" && (() => {
        const visCols = itemCols.filter((c) => c.visible);
        const freezeW = visCols.slice(0, 5).map((c) => c.w);
        return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <AddItemForm onAdd={(it) => setItems([...items, it])} />
            <Btn kind="ghost" icon={SlidersHorizontal} onClick={() => setColMgr(true)}>Add / remove columns</Btn>
          </div>
          <div className="flex items-center justify-end gap-2">
            <span style={{ fontSize: 12, color: C.muted }}>Filter by supplier</span>
            <select style={{ ...smInput, width: 220 }} value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
              <option value="all">All suppliers ({items.length} items)</option>{SUPPLIERS.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </div>
          <Card pad={false} style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
                <thead><tr style={{ background: C.brand, color: "#fff", textAlign: "left" }}>
                  {visCols.map((c, i) => <th key={c.key} className="px-2.5 py-2.5 font-semibold" style={{ ...(freezeStyle(freezeW, i, C.brand, true) || {}) }}>{c.label}</th>)}
                  <th className="px-2.5 py-2.5"></th>
                </tr></thead>
                <tbody>
                  {shownItems.map((it, ri) => { const rowBg = ri % 2 ? C.canvas : C.card; return (
                    <tr key={it.id} style={{ background: rowBg, borderTop: `1px solid ${C.border}` }}>
                      {visCols.map((c, i) => <td key={c.key} className="px-2.5 py-2.5" style={{ ...(freezeStyle(freezeW, i, rowBg) || {}) }}>{c.render(it)}</td>)}
                      <td className="px-2.5 py-2.5"><EditBtn onClick={() => setEditing({ type: "item", value: it })} /></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2.5" style={{ background: C.amberTint, fontSize: 12, color: C.amberDark }}>Constant master fields only — these never change with an order. Quantities, totals, labels, sheets and rate are calculated per buyer order (see formulas below).</div>
          </Card>
          <FormulasPanel />
        </div>
        );
      })()}

      {tab === "buyers" && (
        <div className="grid grid-cols-2 gap-5">
          <Card pad={false} style={{ overflow: "hidden" }}>
            <div className="px-5 py-3 font-semibold" style={{ background: C.canvas, color: C.navy, borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>{buyers.length} buyer(s)</div>
            {buyers.map((b, i) => (
              <div key={i} className="px-5 py-3.5" style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <div className="flex items-center justify-between">
                  <div><div style={{ color: C.navy, fontWeight: 600, fontSize: 14 }}>{b.name}</div><div style={{ fontSize: 11.5, color: C.faint }}>Trading as {b.brand || "—"}</div></div>
                  <div className="flex items-center gap-2">{i === 0 && <Pill tint={C.tealTint} color={C.tealDark}>Active</Pill>}<EditBtn onClick={() => setEditing({ type: "buyer", value: b })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">{[["Country", b.country], ["Currency", b.curr], ["Ship to", b.shipTo]].map(([k, v]) => <div key={k}><div style={{ fontSize: 10.5, color: C.faint }}>{k}</div><div style={{ fontSize: 12.5, color: C.ink, fontWeight: 500 }}>{v || "—"}</div></div>)}</div>
              </div>
            ))}
          </Card>
          <Card>
            <Eyebrow>Add a buyer</Eyebrow>
            <p style={{ fontSize: 12.5, color: C.muted }} className="mt-1 mb-4">The client can add new buyers anytime — same as suppliers, it’s just a form.</p>
            <div className="space-y-3">
              <Field label="Buyer name"><input style={inputStyle} value={bDraft.name} onChange={(e) => setBDraft({ ...bDraft, name: e.target.value })} placeholder="e.g. Aqua Distributors Ltd" /></Field>
              <Field label="Trading as (brand)"><input style={inputStyle} value={bDraft.brand} onChange={(e) => setBDraft({ ...bDraft, brand: e.target.value })} placeholder="e.g. AquaMark" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Country"><input style={inputStyle} value={bDraft.country} onChange={(e) => setBDraft({ ...bDraft, country: e.target.value })} placeholder="e.g. Australia" /></Field>
                <Field label="Currency"><input style={inputStyle} value={bDraft.curr} onChange={(e) => setBDraft({ ...bDraft, curr: e.target.value })} /></Field>
              </div>
              <Field label="Ship to (port)"><input style={inputStyle} value={bDraft.shipTo} onChange={(e) => setBDraft({ ...bDraft, shipTo: e.target.value })} placeholder="e.g. Sydney" /></Field>
              <Btn icon={Plus} disabled={!bDraft.name} onClick={() => { setBuyers([...buyers, { ...bDraft, id: "b" + buyers.length }]); setBDraft({ name: "", brand: "", country: "", curr: "USD", shipTo: "" }); }}>Add buyer</Btn>
            </div>
          </Card>
        </div>
      )}

      {tab === "suppliers" && (
        <div className="grid grid-cols-2 gap-5">
          <Card pad={false} style={{ overflow: "hidden" }}>
            <div className="px-5 py-3 font-semibold" style={{ background: C.canvas, color: C.navy, borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>{sup.length} suppliers</div>
            {sup.map((s, i) => <div key={s.id} className="px-5 py-3 flex items-center justify-between" style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
              <div><div style={{ color: C.navy, fontWeight: 600, fontSize: 13.5 }}>{s.name} <Pill>{s.code}</Pill></div><div style={{ fontSize: 11.5, color: C.faint }}>{s.place} · <Code>{s.gstin}</Code></div></div>
              <div className="flex items-center gap-2">{s.weights === "manual" && <Pill tint={C.amberTint} color={C.amberDark}>weights manual</Pill>}<EditBtn onClick={() => setEditing({ type: "supplier", value: s })} /></div>
            </div>)}
          </Card>
          <Card>
            <Eyebrow>Add a future supplier</Eyebrow>
            <p style={{ fontSize: 12.5, color: C.muted }} className="mt-1 mb-4">The client adds buyers and suppliers anytime — it’s just a form.</p>
            <div className="space-y-3">
              <Field label="Supplier name"><input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Anand Polymers" /></Field>
              <Field label="Place"><input style={inputStyle} value={draft.place} onChange={(e) => setDraft({ ...draft, place: e.target.value })} /></Field>
              <Field label="GSTIN"><input style={inputStyle} value={draft.gstin} onChange={(e) => setDraft({ ...draft, gstin: e.target.value })} /></Field>
              <Btn icon={Plus} disabled={!draft.name} onClick={() => { setSup([...sup, { id: "n" + sup.length, code: draft.name.slice(0, 2).toUpperCase(), name: draft.name, place: draft.place || "—", gstin: draft.gstin || "—", weights: "auto" }]); setDraft({ name: "", place: "", gstin: "" }); }}>Add supplier</Btn>
            </div>
          </Card>
        </div>
      )}

      {tab === "buyersData" && (
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="px-5 py-3 font-semibold" style={{ background: C.brand, color: "#fff", fontSize: 13 }}>Buyer master (2A) — constant fields for verification</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.canvas, color: C.navy, textAlign: "left" }}>{["GD", "Code", "Size", "Len", "Packing", "Description", "Bar code", "HSN", "Vol/box", "Net/box", "Gross/box", "Stk/box", "Unit ₹", "FOB/100 $", "Supplier", ""].map((h, i) => <th key={i} className="px-2.5 py-2.5 font-semibold" style={{ ...(freezeStyle(BD_FREEZE, i, C.canvas, true) || {}) }}>{h}</th>)}</tr></thead>
              <tbody>{items.map((it, i) => { const rowBg = i % 2 ? C.canvas : C.card; return (
                <tr key={it.id} style={{ background: rowBg, borderTop: `1px solid ${C.border}` }}>
                  <td className="px-2.5 py-2.5" style={{ ...(freezeStyle(BD_FREEZE, 0, rowBg) || {}) }}><Code>{it.gd}</Code></td><td className="px-2.5 py-2.5" style={{ ...(freezeStyle(BD_FREEZE, 1, rowBg) || {}) }}><Code>{it.code}</Code></td><td className="px-2.5 py-2.5" style={{ ...(freezeStyle(BD_FREEZE, 2, rowBg) || {}) }}>{it.size}</td><td className="px-2.5 py-2.5" style={{ ...(freezeStyle(BD_FREEZE, 3, rowBg) || {}) }}>{it.length}</td>
                  <td className="px-2.5 py-2.5" style={{ ...(freezeStyle(BD_FREEZE, 4, rowBg) || {}) }}>{it.packing} / box</td><td className="px-2.5 py-2.5" style={{ color: C.navy }}>{it.description}</td><td className="px-2.5 py-2.5"><Code>{it.barcode}</Code></td><td className="px-2.5 py-2.5"><Code>{it.hsn}</Code></td>
                  <td className="px-2.5 py-2.5">{num(it.volume, 3)}</td><td className="px-2.5 py-2.5">{it.netPerBox}</td><td className="px-2.5 py-2.5">{it.grossPerBox}</td><td className="px-2.5 py-2.5">{num((it.bgPerBox + it.pPerBox) * 1.1)}</td>
                  <td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{inr(it.unitValue)}</td><td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{usd(it.unitFob100)}</td><td className="px-2.5 py-2.5"><Pill>{supCode(it.supplierId)}</Pill></td>
                  <td className="px-2.5 py-2.5"><EditBtn onClick={() => setEditing({ type: "item", value: it })} /></td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
          <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Constant values only — easy for the client to verify item pricing. Quantities and totals are added per order.</div>
        </Card>
      )}

      {tab === "supplierData" && (
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="px-5 py-3 font-semibold" style={{ background: C.brand, color: "#fff", fontSize: 13 }}>Supplier master (7A) — constant fields for verification</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.canvas, color: C.navy, textAlign: "left" }}>{["GD", "Code", "OSWIN", "GL", "Size", "Len", "Packing", "Description", "Bar code", "HSN", "Vol/box", "BG", "PC", "TTL", "Cost/unit ₹", "FOB/pc $", "Supplier", ""].map((h, i) => <th key={i} className="px-2.5 py-2.5 font-semibold" style={{ ...(freezeStyle(SD_FREEZE, i, C.canvas, true) || {}) }}>{h}</th>)}</tr></thead>
              <tbody>{items.map((it, i) => { const rowBg = i % 2 ? C.canvas : C.card; return (
                <tr key={it.id} style={{ background: rowBg, borderTop: `1px solid ${C.border}` }}>
                  <td className="px-2.5 py-2.5" style={{ ...(freezeStyle(SD_FREEZE, 0, rowBg) || {}) }}><Code>{it.gd}</Code></td><td className="px-2.5 py-2.5" style={{ ...(freezeStyle(SD_FREEZE, 1, rowBg) || {}) }}><Code>{it.code}</Code></td><td className="px-2.5 py-2.5" style={{ ...(freezeStyle(SD_FREEZE, 2, rowBg) || {}) }}><Code>{it.oswin}</Code></td><td className="px-2.5 py-2.5" style={{ ...(freezeStyle(SD_FREEZE, 3, rowBg) || {}) }}><Code>{it.gl}</Code></td>
                  <td className="px-2.5 py-2.5" style={{ ...(freezeStyle(SD_FREEZE, 4, rowBg) || {}) }}>{it.size}</td><td className="px-2.5 py-2.5">{it.length}</td><td className="px-2.5 py-2.5">{it.packing} / box</td><td className="px-2.5 py-2.5" style={{ color: C.navy }}>{it.description}</td>
                  <td className="px-2.5 py-2.5"><Code>{it.barcode}</Code></td><td className="px-2.5 py-2.5"><Code>{it.hsn}</Code></td><td className="px-2.5 py-2.5">{num(it.volume, 3)}</td>
                  <td className="px-2.5 py-2.5">{it.packing}</td><td className="px-2.5 py-2.5">1</td><td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{it.packing + 1}</td>
                  <td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{inr(it.unitValue)}</td><td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{usdp(it.unitFob100 / 100)}</td><td className="px-2.5 py-2.5"><Pill>{supCode(it.supplierId)}</Pill></td>
                  <td className="px-2.5 py-2.5"><EditBtn onClick={() => setEditing({ type: "item", value: it })} /></td>
                </tr>
              ); })}</tbody>
            </table>
          </div>
          <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Constant values only. BG = units/box, PC = 1 carton, TTL = BG + PC. Quantities, barcode stickers, totals and rate are built per order in the Orders → Supplier tab.</div>
        </Card>
      )}

      {colMgr && <ColumnManager cols={itemCols} onClose={() => setColMgr(false)} onSave={(l) => { setItemCols(l); setColMgr(false); }} />}
      {editing && editing.type === "item" && <EditModal title={`Edit item · ${editing.value.gd}`} schema={ITEM_SCHEMA} value={editing.value} onClose={() => setEditing(null)} onSave={saveItem} />}
      {editing && editing.type === "buyer" && <EditModal title={`Edit buyer · ${editing.value.name}`} schema={BUYER_SCHEMA} value={editing.value} onClose={() => setEditing(null)} onSave={(f) => { setBuyers(buyers.map((b) => (b.id === f.id ? f : b))); setEditing(null); }} />}
      {editing && editing.type === "supplier" && <EditModal title={`Edit supplier · ${editing.value.name}`} schema={SUP_SCHEMA} value={editing.value} onClose={() => setEditing(null)} onSave={(f) => { setSup(sup.map((s) => (s.id === f.id ? { ...s, ...f } : s))); setEditing(null); }} />}
    </div>
  );
}
function FormulasPanel() {
  const rows = [
    ["Boxes", "RoundUp ( Quantity ÷ Packing )"], ["Net weight (total)", "Boxes × Net weight per box"], ["Gross weight (total)", "Boxes × Gross weight per box"],
    ["Volume (total)", "Boxes × Volume per box"], ["Stickers per box", "( Bg per box + P per box ) × 1.1"], ["Labels", "Quantity × Stickers per box"],
    ["Sheets required", "RoundUp ( Labels ÷ Type UP )"], ["Total value (₹)", "Unit value × Quantity"], ["Total FOB / 100 pcs ($)", "( Quantity × Unit FOB/100 ) ÷ 100"],
    ["RBI reference value (₹)", "RBI day rate × Total FOB ($)"], ["Rate (₹)", "RBI reference value ÷ Quantity"],
  ];
  return (
    <Card>
      <Eyebrow>2A buyer master — how fields are calculated after an order</Eyebrow>
      <p style={{ fontSize: 12.5, color: C.muted }} className="mt-1 mb-4">These depend on the order quantity and the day’s RBI rate, so they’re computed per order — not stored in the item master. Change a formula here if the logic ever needs to change.</p>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1">
        {rows.map(([f, formula]) => (
          <div key={f} className="flex items-baseline justify-between gap-3 py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12.5, color: C.navy, fontWeight: 600, whiteSpace: "nowrap" }}>{f}</span><span style={{ fontFamily: MONO, fontSize: 11, color: C.tealDark, textAlign: "right" }}>{formula}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ===== Buyer order ===== */
function BuyerOrder({ items, buyerMaster, setBuyerMaster }) {
  const [rbi, setRbi] = useState("83.50");
  const [po, setPo] = useState("03540");
  const [date, setDate] = useState(TODAY);
  const [buyerId, setBuyerId] = useState("b1");
  const [qtys, setQtys] = useState({}); // key `${itemId}|${supplierId}` -> qty string
  const sorted = [...items].sort((a, b) => a.gd.localeCompare(b.gd));
  const setQ = (k, v) => setQtys((p) => ({ ...p, [k]: v }));
  // Live derived rows — one per supplier the user typed a quantity against
  const rows = [];
  sorted.forEach((it) => suppliersForItem(it).forEach((sp) => {
    const k = it.id + "|" + sp.id, q = Number(qtys[k]) || 0;
    if (q > 0) { const boxes = Math.ceil(q / it.packing) || 0; rows.push({ key: k, it, sp, qty: q, boxes, volume: boxes * it.volume }); }
  }));
  const totalBoxes = rows.reduce((s, r) => s + r.boxes, 0);
  const totalVol = rows.reduce((s, r) => s + r.volume, 0);
  const add = () => {
    if (!rows.length) return;
    const added = rows.map((r, n) => ({ id: "r" + Date.now() + "_" + n, date, po, buyerId, itemId: r.it.id, qty: r.qty, rbi: Number(rbi), item: { ...r.it, supplierId: r.sp.id } }));
    setBuyerMaster([...added, ...buyerMaster]); setQtys({});
  };
  return (
    <div className="space-y-5">
      <div><Eyebrow>Stage A · Buyer order</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Enter quantities by supplier, derive the sheet</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Set the PO, date and today’s RBI rate, then run down the item list and drop a quantity next to whichever supplier fills it. Boxes and volume total live on the right.</p></div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "440px 1fr" }}>
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="p-4" style={{ borderBottom: `1px solid ${C.border}` }}>
            <Field label="Buyer"><select style={smInput} value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>{BUYERS.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.brand}</option>)}</select></Field>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Field label="PO number"><input style={smInput} value={po} onChange={(e) => setPo(e.target.value)} /></Field>
              <Field label="Date"><input style={smInput} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="RBI ($→₹)"><input style={{ ...smInput, borderColor: C.amber, background: C.amberTint }} type="number" value={rbi} onChange={(e) => setRbi(e.target.value)} placeholder="83.50" /></Field>
            </div>
          </div>
          <div className="px-4 py-2 flex items-center justify-between" style={{ background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>Item · supplier</span><span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>Quantity (pcs)</span>
          </div>
          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            {sorted.map((it) => (
              <div key={it.id} className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <Code>{it.gd}</Code><span style={{ fontSize: 12.5, color: C.navy, fontWeight: 600 }}>{it.description}</span>
                  <span style={{ fontSize: 11, color: C.faint, marginLeft: "auto" }}>{it.packing} / box</span>
                </div>
                <div className="space-y-2">
                  {suppliersForItem(it).map((sp, si) => { const k = it.id + "|" + sp.id; return (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2" style={{ minWidth: 0 }}>
                        <Pill tint={si ? C.navyTint : C.tealTint} color={si ? C.navy : C.tealDark}>{sp.code}</Pill>
                        <span style={{ fontSize: 11.5, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.name}</span>
                      </span>
                      <input style={{ ...smInput, width: 118, textAlign: "right", background: qtys[k] ? C.amberTint : C.card }} type="number" min="0" placeholder="0" value={qtys[k] || ""} onChange={(e) => setQ(k, e.target.value)} />
                    </div>
                  ); })}
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 flex items-center justify-between" style={{ borderTop: `1px solid ${C.border}`, background: C.canvas }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>{rows.length} line(s) ready</span>
            <Btn icon={Plus} onClick={add} disabled={!rows.length}>Add to Buyer master</Btn>
          </div>
        </Card>
        <Card pad={false} style={{ overflow: "hidden", alignSelf: "start" }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
            <Eyebrow>Order summary — boxes &amp; volume</Eyebrow><Pill tint={C.amberTint} color={C.amberDark}>live</Pill>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: C.brand, color: "#fff", textAlign: "left" }}>{["GD code", "Supplier", "Boxes", "Volume m³"].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td className="px-4 py-2.5"><Code>{r.it.gd}</Code></td>
                  <td className="px-4 py-2.5"><Pill>{r.sp.code}</Pill></td>
                  <td className="px-4 py-2.5" style={{ fontWeight: 600, color: C.navy }}>{r.boxes}</td>
                  <td className="px-4 py-2.5">{num(r.volume, 3)}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="px-4 py-10 text-center" style={{ color: C.faint, fontSize: 13 }}>Type a quantity on the left — rows appear here as you go.</td></tr>}
            </tbody>
            {rows.length > 0 && <tfoot><tr style={{ background: C.amberTint, fontWeight: 700, color: C.navy }}>
              <td className="px-4 py-2.5" colSpan={2}>Total · {rows.length} line(s)</td>
              <td className="px-4 py-2.5">{totalBoxes}</td><td className="px-4 py-2.5">{num(totalVol, 3)}</td>
            </tr></tfoot>}
          </table>
        </Card>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2"><ClipboardList size={15} color={C.teal} /><span className="font-semibold" style={{ color: C.navy, fontSize: 14 }}>Buyer master sheet</span><span style={{ color: C.faint, fontSize: 12 }}>— lines dated {dmy(date)} (past orders live in the Orders tab)</span></div>
        <Card pad={false} style={{ overflow: "hidden" }}><BuyerMasterTable rows={buyerMaster.filter((r) => r.date === date)} emptyMsg="Nothing on this date yet — add lines above to see them here." /></Card>
      </div>
    </div>
  );
}

/* ===== By PO view — receipt/pending status, click a row for item-wise detail ===== */
function buildPoList(buyerMaster, items, receipts) {
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
function POView({ buyerMaster, items, receipts }) {
  const [sel, setSel] = useState(null);
  const poList = buildPoList(buyerMaster, items, receipts);
  if (!poList.length) return <Card><div style={{ color: C.faint, fontSize: 13 }}>No purchase orders yet.</div></Card>;
  const th = (h, r) => <th key={h} className="px-3 py-2.5 font-semibold" style={{ textAlign: r ? "right" : "left" }}>{h}</th>;
  return (
    <>
      <Card pad={false} style={{ overflow: "hidden" }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: C.brand, color: "#fff", fontSize: 13 }}>
          <span className="font-semibold">{poList.length} purchase order(s) · receipt status</span>
          <span style={{ fontSize: 11.5, color: "#8FA6BC" }}>Fill deliveries in Packing &amp; FIFO — pending / completed update here automatically. Click a row for item-wise detail.</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: C.canvas, color: C.navy, textAlign: "left" }}>{[["PO"], ["Date"], ["Pending boxes", 1], ["Completed boxes", 1], ["Suppliers"], ["Total volume m³", 1], [""]].map(([h, r]) => th(h, r))}</tr></thead>
            <tbody>{poList.map((p, i) => (
              <tr key={p.po} onClick={() => setSel(p)} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.canvas : C.card, cursor: "pointer" }}>
                <td className="px-3 py-2.5"><span style={{ fontFamily: MONO, fontWeight: 700, color: C.navy }}>PO {p.po}</span></td>
                <td className="px-3 py-2.5" style={{ color: C.muted }}>{dmy(p.date)}</td>
                <td className="px-3 py-2.5" style={{ textAlign: "right", fontWeight: 700, color: p.pending ? C.amberDark : C.teal }}>{p.pending}</td>
                <td className="px-3 py-2.5" style={{ textAlign: "right", fontWeight: 600, color: C.navy }}>{p.completed} <span style={{ color: C.faint, fontWeight: 400 }}>/ {p.ordered}</span></td>
                <td className="px-3 py-2.5"><span className="inline-flex gap-1 flex-wrap">{p.suppliers.map((s) => <Pill key={s}>{supCode(s)}</Pill>)}</span></td>
                <td className="px-3 py-2.5" style={{ textAlign: "right" }}>{num(p.volume, 3)}</td>
                <td className="px-3 py-2.5" style={{ textAlign: "right" }}><ChevronRight size={15} color={C.faint} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Completed = boxes delivered against that PO (FIFO, oldest first). Pending = boxes still owed.</div>
      </Card>
      {sel && (
        <Modal title={`PO ${sel.po} · ${dmy(sel.date)}`} icon={ClipboardList} onClose={() => setSel(null)} maxWidth={860}
          footer={<>
            <span style={{ fontSize: 11.5, color: C.muted }}>{buyerById(sel.buyerId).name} · {sel.detail.length} item(s) · {sel.completed}/{sel.ordered} boxes received</span>
            <Btn kind="teal" small icon={Download} onClick={() => downloadCSV(`PO_${sel.po}.csv`, BM_HEAD, sel.rows.map((r) => bmRaw(r)))}>Download PO</Btn>
          </>}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.brand, color: "#fff" }}>{[["GD code"], ["Supplier"], ["Total qty", 1], ["Volume m³", 1], ["Boxes", 1], ["Pending", 1], ["Completed", 1], ["Buyer rate ₹", 1]].map(([h, r]) => th(h, r))}</tr></thead>
              <tbody>{sel.detail.map((d, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.canvas : C.card }}>
                  <td className="px-3 py-2"><Code>{d.it.gd}</Code> <span style={{ color: C.navy }}>{d.it.description}</span></td>
                  <td className="px-3 py-2"><Pill>{supCode(d.supplierId)}</Pill></td>
                  <td className="px-3 py-2" style={{ textAlign: "right" }}>{d.qty.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2" style={{ textAlign: "right" }}>{num(d.volume, 3)}</td>
                  <td className="px-3 py-2" style={{ textAlign: "right", fontWeight: 600 }}>{d.ordered}</td>
                  <td className="px-3 py-2" style={{ textAlign: "right", fontWeight: 700, color: d.pending ? C.amberDark : C.teal }}>{d.pending}</td>
                  <td className="px-3 py-2" style={{ textAlign: "right", color: C.navy }}>{d.completed}</td>
                  <td className="px-3 py-2" style={{ textAlign: "right" }}>{num(d.rate)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr style={{ background: C.amberTint, fontWeight: 700, color: C.navy }}>
                <td className="px-3 py-2" colSpan={2}>Total</td>
                <td className="px-3 py-2" style={{ textAlign: "right" }}>{sel.detail.reduce((s, d) => s + d.qty, 0).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2" style={{ textAlign: "right" }}>{num(sel.volume, 3)}</td>
                <td className="px-3 py-2" style={{ textAlign: "right" }}>{sel.ordered}</td>
                <td className="px-3 py-2" style={{ textAlign: "right" }}>{sel.pending}</td>
                <td className="px-3 py-2" style={{ textAlign: "right" }}>{sel.completed}</td><td></td>
              </tr></tfoot>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ===== Orders tab ===== */
function Orders({ buyerMaster, items, receipts }) {
  const [tab, setTab] = useState("buyer");
  const [from, setFrom] = useState("2025-01-01");
  const [to, setTo] = useState(TODAY);
  const [sup, setSup] = useState("s1");
  const [supRbi, setSupRbi] = useState("83.50");
  const inRange = (r) => r.date >= from && r.date <= to;
  const buyerRows = buyerMaster.filter(inRange).sort((a, b) => new Date(b.date) - new Date(a.date));
  const sm = buildSupplierMaster(buyerMaster, sup, from, to, supRbi);
  const dates = [...new Set(buyerRows.map((r) => r.date))];
  return (
    <div className="space-y-5">
      <div><Eyebrow>Orders · by buyer and supplier</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Orders</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Choose a party and a date or range, view the orders, and download the master for that period.</p></div>
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.navyTint, width: "fit-content" }}>
        {[["buyer", "Buyer", Globe], ["supplier", "Supplier (7A)", Truck], ["po", "By PO", ClipboardList]].map(([k, lbl, I]) => <button key={k} onClick={() => setTab(k)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition"
          style={{ fontSize: 13, background: tab === k ? C.card : "transparent", color: tab === k ? C.navy : C.muted, cursor: "pointer" }}><I size={15} /> {lbl}</button>)}
      </div>

      {tab === "buyer" && (
        <>
          <Card>
            <div className="flex items-end gap-4 flex-wrap">
              <Field label="Buyer"><select style={smInput} disabled><option>{BUYER.name} ({BUYER.brand})</option></select></Field>
              <Field label="From"><input style={smInput} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><input style={smInput} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              {dates.length > 0 && <Pill tint={C.tealTint} color={C.tealDark}>{dates.length} order date(s)</Pill>}
              <div style={{ marginLeft: "auto" }}><Btn icon={Download} kind="teal" onClick={() => downloadCSV(`Buyer_Master_${from}_to_${to}.csv`, BM_HEAD, buyerRows.map((r) => bmRaw(r)))} disabled={!buyerRows.length}>Download Buyer master</Btn></div>
            </div>
          </Card>
          <Card pad={false} style={{ overflow: "hidden" }}><BuyerMasterTable rows={buyerRows} /></Card>
        </>
      )}

      {tab === "supplier" && (
        <>
          <Card>
            <div className="flex items-end gap-4 flex-wrap">
              <Field label="Supplier"><select style={smInput} value={sup} onChange={(e) => setSup(e.target.value)}>{SUPPLIERS.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select></Field>
              <Field label="From"><input style={smInput} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><input style={smInput} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              <Field label="Current ₹ per $ (RBI, for 7A)"><input style={{ ...smInput, width: 150, borderColor: C.amber, background: C.amberTint }} type="number" value={supRbi} onChange={(e) => setSupRbi(e.target.value)} /></Field>
              <div style={{ marginLeft: "auto" }}><Btn icon={Download} kind="teal" onClick={() => downloadCSV(`Supplier_Master_7A_${supCode(sup)}_${from}_to_${to}.csv`, SM7_HEAD, sm.map((g) => sm7Raw(g, supRbi)))} disabled={!sm.length}>Download 7A master</Btn></div>
            </div>
            <div className="mt-3 p-2.5 rounded-lg" style={{ background: C.navyTint, fontSize: 11.5, color: C.muted }}>Quantities are summed across every PO for each item (the POs are listed together), and serial numbers are allocated as continuous carton ranges by box count.</div>
          </Card>
          <Card pad={false} style={{ overflow: "hidden" }}><SupplierMaster7A rows={sm} rbi={supRbi} /></Card>
          <SupplierFormulasPanel />
        </>
      )}

      {tab === "po" && <POView buyerMaster={buyerMaster} items={items} receipts={receipts} />}
    </div>
  );
}

/* ===== Packing & FIFO ===== */
function PackingFIFO({ items, buyerMaster, invoices, setInvoices }) {
  const [invoiceNo, setInvoiceNo] = useState("JG/26-27/6003");
  const [date, setDate] = useState(TODAY);
  const [buyerId, setBuyerId] = useState("b1");
  const [boxesBy, setBoxesBy] = useState({}); // key `${itemId}|${supplierId}` -> boxes string
  const [selInv, setSelInv] = useState(null);
  const [editShipId, setEditShipId] = useState(null);
  const ledger = computeLedger(buyerMaster, invReceipts(invoices), items);
  const sorted = [...items].sort((a, b) => a.gd.localeCompare(b.gd));
  const setB = (k, v) => setBoxesBy((p) => ({ ...p, [k]: v }));
  // Pending projected AFTER the boxes typed in this draft — allocate them FIFO across the item's open demands
  const projPending = (it) => {
    const b = ledger[it.id];
    if (!b) return { boxes: 0, pos: [] };
    let avail = suppliersForItem(it).reduce((s, sp) => s + (Number(boxesBy[it.id + "|" + sp.id]) || 0), 0);
    let pending = 0; const pos = [];
    b.demands.forEach((d) => { const take = Math.min(d.remaining, avail); const rem = d.remaining - take; avail -= take; if (rem > 0) { pending += rem; pos.push(d.po); } });
    return { boxes: pending, pos };
  };
  const rows = [];
  sorted.forEach((it) => suppliersForItem(it).forEach((sp) => { const k = it.id + "|" + sp.id, b = Number(boxesBy[k]) || 0; if (b > 0) { const pi = projPending(it); rows.push({ key: k, it, sp, boxes: b, volume: b * it.volume, pending: pi.boxes, pendingPos: pi.pos }); } }));
  const totalBoxes = rows.reduce((s, r) => s + r.boxes, 0), totalVol = rows.reduce((s, r) => s + r.volume, 0);
  const supAgg = {}; rows.forEach((r) => { (supAgg[r.sp.id] = supAgg[r.sp.id] || { code: r.sp.code, boxes: 0, volume: 0 }); supAgg[r.sp.id].boxes += r.boxes; supAgg[r.sp.id].volume += r.volume; });
  const create = () => { if (!rows.length) return; const inv = { id: "inv" + Date.now(), invoiceNo, date, buyerId, lines: rows.map((r) => ({ itemId: r.it.id, supplierId: r.sp.id, boxes: r.boxes })), ship: { ...EMPTY_SHIP } }; setInvoices([inv, ...invoices]); setBoxesBy({}); };
  const invList = invoices.map((inv) => ({ inv, ...invoiceTotals(inv, items), sup: bySupplier(inv, items), buyer: buyerById(inv.buyerId) }));
  const editingInv = invoices.find((i) => i.id === editShipId);
  const th = (h, r) => <th key={h} className="px-3 py-2.5 font-semibold" style={{ textAlign: r ? "right" : "left" }}>{h}</th>;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div><Eyebrow>Stage B · Supplier packing · FIFO</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Pack by invoice — boxes clear the oldest order first</h2>
          <p style={{ fontSize: 13, color: C.muted }}>Enter boxes packed per supplier under one invoice number. FIFO deducts from pending orders oldest-first; the dashboard shows what stays pending and which POs remain.</p></div>
        <button onClick={() => setInvoices(SEED_INVOICES)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.muted, fontSize: 12.5, cursor: "pointer", background: C.card }}><RotateCcw size={13} /> Reset demo</button>
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "440px 1fr" }}>
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="p-4" style={{ borderBottom: `1px solid ${C.border}` }}>
            <Field label="Buyer"><select style={smInput} value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>{BUYERS.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.brand}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Invoice number"><input style={smInput} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
              <Field label="Date"><input style={smInput} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>
          </div>
          <div className="px-4 py-2 flex items-center justify-between" style={{ background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>Item · supplier</span><span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>Boxes packed</span>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {sorted.map((it) => { const pi = projPending(it); return (
              <div key={it.id} className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <Code>{it.gd}</Code><span style={{ fontSize: 12.5, color: C.navy, fontWeight: 600 }}>{it.description}</span>
                  <span style={{ fontSize: 11, marginLeft: "auto", color: pi.boxes ? C.amberDark : C.teal, fontWeight: 600 }}>{pi.boxes ? pi.boxes + " pending" : "clear"}</span>
                </div>
                <div className="space-y-2">
                  {suppliersForItem(it).map((sp, si) => { const k = it.id + "|" + sp.id; return (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2" style={{ minWidth: 0 }}><Pill tint={si ? C.navyTint : C.tealTint} color={si ? C.navy : C.tealDark}>{sp.code}</Pill><span style={{ fontSize: 11.5, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.name}</span></span>
                      <input style={{ ...smInput, width: 110, textAlign: "right", background: boxesBy[k] ? C.amberTint : C.card }} type="number" min="0" placeholder="0" value={boxesBy[k] || ""} onChange={(e) => setB(k, e.target.value)} />
                    </div>
                  ); })}
                </div>
              </div>
            ); })}
          </div>
          <div className="p-4 flex items-center justify-between" style={{ borderTop: `1px solid ${C.border}`, background: C.canvas }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>{rows.length} line(s) · {totalBoxes} boxes</span>
            <Btn icon={PackageCheck} onClick={create} disabled={!rows.length}>Create invoice (apply FIFO)</Btn>
          </div>
        </Card>
        <div className="space-y-4" style={{ minWidth: 0 }}>
          <Card pad={false} style={{ overflow: "hidden" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ background: C.canvas, borderBottom: `1px solid ${C.border}` }}><Eyebrow>Packing dashboard — boxes, volume &amp; pending</Eyebrow><Pill tint={C.amberTint} color={C.amberDark}>live</Pill></div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
                <thead><tr style={{ background: C.brand, color: "#fff" }}>{[["GD code"], ["Supplier"], ["Boxes", 1], ["Volume m³", 1], ["Pending", 1], ["Pending POs (FIFO)"]].map(([h, r]) => th(h, r))}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="px-3 py-2"><Code>{r.it.gd}</Code></td>
                      <td className="px-3 py-2"><Pill>{r.sp.code}</Pill></td>
                      <td className="px-3 py-2" style={{ textAlign: "right", fontWeight: 600, color: C.navy }}>{r.boxes}</td>
                      <td className="px-3 py-2" style={{ textAlign: "right" }}>{num(r.volume, 3)}</td>
                      <td className="px-3 py-2" style={{ textAlign: "right", fontWeight: 700, color: r.pending ? C.amberDark : C.teal }}>{r.pending}</td>
                      <td className="px-3 py-2" style={{ fontFamily: MONO, fontSize: 11.5, color: C.code }}>{r.pendingPos.length ? r.pendingPos.join(", ") : "—"}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: C.faint, fontSize: 13 }}>Enter boxes on the left — packed lines and pending status appear here.</td></tr>}
                </tbody>
                {rows.length > 0 && <tfoot><tr style={{ background: C.amberTint, fontWeight: 700, color: C.navy }}><td className="px-3 py-2" colSpan={2}>Total</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{totalBoxes}</td><td className="px-3 py-2" style={{ textAlign: "right" }}>{num(totalVol, 3)}</td><td colSpan={2}></td></tr></tfoot>}
              </table>
            </div>
          </Card>
          {rows.length > 0 && (
            <Card pad={false} style={{ overflow: "hidden" }}>
              <div className="px-5 py-2.5 font-semibold" style={{ background: C.canvas, color: C.navy, fontSize: 12.5, borderBottom: `1px solid ${C.border}` }}>Supplier-wise totals</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead><tr style={{ color: C.muted, textAlign: "left" }}>{[["Supplier"], ["Total boxes", 1], ["Total volume m³", 1]].map(([h, r]) => <th key={h} className="px-4 py-2 font-medium" style={{ textAlign: r ? "right" : "left" }}>{h}</th>)}</tr></thead>
                <tbody>{Object.values(supAgg).map((s) => (
                  <tr key={s.code} style={{ borderTop: `1px solid ${C.border}` }}><td className="px-4 py-2"><Pill>{s.code}</Pill></td><td className="px-4 py-2" style={{ textAlign: "right", fontWeight: 600 }}>{s.boxes}</td><td className="px-4 py-2" style={{ textAlign: "right" }}>{num(s.volume, 3)}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2"><FileText size={15} color={C.teal} /><span className="font-semibold" style={{ color: C.navy, fontSize: 14 }}>Invoices</span><span style={{ color: C.faint, fontSize: 12 }}>— click an invoice for buyer / supplier detail, edit shipment &amp; download</span></div>
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.brand, color: "#fff" }}>{[["Invoice No"], ["Date"], ["Buyer"], ["Total boxes", 1], ["Total volume m³", 1], ["Received by supplier"], ["Shipment"]].map(([h, r]) => th(h, r))}</tr></thead>
              <tbody>{invList.map(({ inv, boxes, volume, sup, buyer }, i) => (
                <tr key={inv.id} onClick={() => setSelInv(inv)} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.canvas : C.card, cursor: "pointer" }}>
                  <td className="px-3 py-2.5"><Code>{inv.invoiceNo}</Code></td>
                  <td className="px-3 py-2.5" style={{ color: C.muted }}>{dmy(inv.date)}</td>
                  <td className="px-3 py-2.5">{buyer.brand}</td>
                  <td className="px-3 py-2.5" style={{ textAlign: "right", fontWeight: 600 }}>{boxes}</td>
                  <td className="px-3 py-2.5" style={{ textAlign: "right" }}>{num(volume, 3)}</td>
                  <td className="px-3 py-2.5">{sup.map((s) => <span key={s.supplierId} style={{ marginRight: 6 }}><Pill>{supCode(s.supplierId)}</Pill> <span style={{ fontSize: 11, color: C.faint }}>{s.boxes}bx·{num(s.volume, 2)}</span></span>)}</td>
                  <td className="px-3 py-2.5">{shipComplete(inv.ship) ? <Pill tint={C.tealTint} color={C.tealDark}>complete</Pill> : <Pill tint={C.amberTint} color={C.amberDark}>pending</Pill>}</td>
                </tr>
              ))}
              {!invList.length && <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: C.faint }}>No invoices yet — create one above.</td></tr>}</tbody>
            </table>
          </div>
        </Card>
      </div>
      {selInv && <InvoiceModal inv={selInv} items={items} onClose={() => setSelInv(null)} onEditShip={() => { setEditShipId(selInv.id); setSelInv(null); }} />}
      {editingInv && <EditModal title={`Edit shipment · ${editingInv.invoiceNo}`} schema={SHIP_FIELDS} value={editingInv.ship} onClose={() => setEditShipId(null)} onSave={(f) => { setInvoices(invoices.map((x) => (x.id === editShipId ? { ...x, ship: f } : x))); setEditShipId(null); }} />}
    </div>
  );
}

/* ===== Invoice tab — pick an invoice, fill shipment details, download documents ===== */
function InvoiceTab({ invoices, setInvoices, items }) {
  const [openId, setOpenId] = useState(null);   // invoice open in the detail interface
  const [editId, setEditId] = useState(null);   // invoice whose shipment is being edited
  const openInv = invoices.find((i) => i.id === openId);
  const editInv = invoices.find((i) => i.id === editId);
  const saveShip = (f) => { setInvoices(invoices.map((x) => (x.id === editId ? { ...x, ship: f } : x))); setEditId(null); };
  const header = (
    <div><Eyebrow>Stage C · Invoicing</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>All invoices</h2>
      <p style={{ fontSize: 13, color: C.muted }}>Every invoice raised so far. Click any invoice to open it — review its buyer &amp; supplier lines, fill the shipment details once, then download the proforma (17), custom invoice (18) or supplier sheet, all in Excel.</p></div>
  );
  if (!invoices.length) return <div className="space-y-5">{header}<Card><div style={{ color: C.faint, fontSize: 13 }}>No invoices yet — create one in Packing &amp; FIFO.</div></Card></div>;
  const cols = ["Invoice No", "Date", "Buyer", "Boxes", "Volume m³", "FOB Value $", "Shipment", ""];
  return (
    <div className="space-y-5">
      {header}
      <Card pad={false} style={{ overflow: "hidden" }}>
        <div className="px-5 py-3 flex items-center justify-between" style={{ background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
          <span className="font-semibold" style={{ color: C.navy, fontSize: 13 }}>{invoices.length} invoice{invoices.length > 1 ? "s" : ""}</span>
          <span style={{ fontSize: 11.5, color: C.faint }}>Click a row to open the invoice</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: C.brand, color: "#fff", textAlign: "left" }}>{cols.map((h, i) => <th key={h} className="px-4 py-2.5 font-semibold" style={{ textAlign: [3, 4, 5].includes(i) ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>{invoices.map((x, i) => {
              const b = buyerById(x.buyerId), t = invoiceTotals(x, items), done = shipComplete(x.ship);
              return (
                <tr key={x.id} onClick={() => setOpenId(x.id)} className="transition" style={{ background: i % 2 ? C.canvas : C.card, borderTop: `1px solid ${C.border}`, cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.navyTint)} onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 ? C.canvas : C.card)}>
                  <td className="px-4 py-3"><Code>{x.invoiceNo}</Code></td>
                  <td className="px-4 py-3" style={{ color: C.muted }}>{dmy(x.date)}</td>
                  <td className="px-4 py-3" style={{ color: C.navy, fontWeight: 500 }}>{b.name} <span style={{ color: C.faint }}>· {b.brand}</span></td>
                  <td className="px-4 py-3" style={{ textAlign: "right", fontWeight: 600 }}>{t.boxes}</td>
                  <td className="px-4 py-3" style={{ textAlign: "right" }}>{num(t.volume, 3)}</td>
                  <td className="px-4 py-3" style={{ textAlign: "right", fontWeight: 600 }}>{usd(t.buyerAmt)}</td>
                  <td className="px-4 py-3"><Pill tint={done ? C.tealTint : C.amberTint} color={done ? C.tealDark : C.amberDark}>{done ? "complete" : "pending"}</Pill></td>
                  <td className="px-4 py-3" style={{ textAlign: "right" }}><span className="inline-flex items-center gap-1 font-semibold" style={{ color: C.teal, fontSize: 12.5 }}>Open <ChevronRight size={14} /></span></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>
      {openInv && <InvoiceModal inv={openInv} items={items} onEditShip={() => setEditId(openInv.id)} onClose={() => setOpenId(null)} />}
      {editInv && <EditModal title={`Edit shipment · ${editInv.invoiceNo}`} schema={SHIP_FIELDS} value={editInv.ship} onClose={() => setEditId(null)} onSave={saveShip} />}
    </div>
  );
}

/* ===== Balance register trace — allocates each invoice's boxes to POs (FIFO) and records the link ===== */
function balanceData(buyerMaster, invoices, items) {
  const byItem = {};
  items.forEach((it) => (byItem[it.id] = { item: it, demands: [] }));
  buyerMaster.forEach((r) => {
    if (!byItem[r.itemId]) byItem[r.itemId] = { item: r.item, demands: [] };
    const ordered = Math.ceil(r.qty / r.item.packing) || 0;
    byItem[r.itemId].demands.push({ po: r.po, date: r.date, buyerId: r.buyerId, qty: r.qty, rbi: r.rbi, ordered, remaining: ordered, invoices: new Set() });
  });
  Object.values(byItem).forEach((b) => b.demands.sort((a, c) => new Date(a.date) - new Date(c.date)));
  // receipts in chronological order, allocate FIFO, remembering which invoice filled which PO
  const receipts = invoices.slice().sort((a, b) => new Date(a.date) - new Date(b.date))
    .flatMap((inv) => inv.lines.map((l) => ({ invoiceNo: inv.invoiceNo, invId: inv.id, date: inv.date, itemId: l.itemId, supplierId: l.supplierId, boxes: Number(l.boxes) || 0 })));
  receipts.forEach((rc) => {
    const b = byItem[rc.itemId]; if (!b) return;
    let avail = rc.boxes;
    b.demands.forEach((d) => { if (avail <= 0) return; const take = Math.min(d.remaining, avail); if (take > 0) { d.remaining -= take; avail -= take; d.invoices.add(rc.invoiceNo); } });
  });
  return { byItem, receipts };
}
const joinInv = (set) => (set && set.size ? [...set].join(", ") : "—");

/* ===== Reports ===== */
function Reports({ items, buyerMaster, invoices }) {
  const [tab, setTab] = useState("po");
  const [remarks, setRemarks] = useState({});
  const { byItem, receipts } = balanceData(buyerMaster, invoices, items);
  const setRem = (k, v) => setRemarks((p) => ({ ...p, [k]: v }));

  // PO-wise (buyer): one row per PO line, with received / pending + editable remarks
  const poRows = [];
  Object.values(byItem).forEach((b) => b.demands.forEach((d) => {
    const recd = d.ordered - d.remaining;
    poRows.push({ key: d.po + "|" + b.item.id + "|" + d.date, date: d.date, it: b.item, po: d.po, buyerId: d.buyerId, qty: d.qty, ordered: d.ordered, recd, pending: d.remaining, volume: d.ordered * b.item.volume, invoices: d.invoices, value: recd * b.item.packing * (b.item.unitFob100 / 100) });
  }));
  poRows.sort((a, b) => a.po.localeCompare(b.po) || a.it.gd.localeCompare(b.it.gd));

  // Item-wise: one row per item aggregating its POs and invoices
  const itemRows = Object.values(byItem).filter((b) => b.demands.length).map((b) => {
    const ordered = b.demands.reduce((s, d) => s + d.ordered, 0);
    const pending = b.demands.reduce((s, d) => s + d.remaining, 0);
    const invSet = new Set(); b.demands.forEach((d) => d.invoices.forEach((x) => invSet.add(x)));
    const date = b.demands.map((d) => d.date).sort().slice(-1)[0];
    return { it: b.item, date, pos: [...new Set(b.demands.map((d) => d.po))], invoices: invSet, qty: b.demands.reduce((s, d) => s + d.qty, 0), ordered, recd: ordered - pending, pending, volume: ordered * b.item.volume };
  }).sort((a, b) => a.it.gd.localeCompare(b.it.gd));

  // Supplier-wise: received goods grouped by packing supplier + item
  const supMap = {};
  invoices.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((inv) => inv.lines.forEach((l) => {
    const it = items.find((x) => x.id === l.itemId); if (!it) return;
    const k = l.supplierId + "|" + l.itemId;
    if (!supMap[k]) supMap[k] = { supplierId: l.supplierId, it, date: inv.date, recd: 0, invoices: new Set() };
    supMap[k].recd += Number(l.boxes) || 0; supMap[k].invoices.add(inv.invoiceNo); supMap[k].date = inv.date;
  }));
  const supRows = Object.values(supMap).map((s) => ({ ...s, volume: s.recd * s.it.volume, value: s.recd * s.it.packing * s.it.unitValue, pending: (byItem[s.it.id] ? byItem[s.it.id].demands.reduce((t, d) => t + d.remaining, 0) : 0) }))
    .sort((a, b) => supCode(a.supplierId).localeCompare(supCode(b.supplierId)) || a.it.gd.localeCompare(b.it.gd));

  const tabs = [["po", "PO wise (buyer)", ClipboardList], ["item", "Item wise", Layers], ["supplier", "Supplier wise", Truck]];
  const th = (h, r, i) => <th key={h} className="px-3 py-2.5 font-semibold" style={{ textAlign: r ? "right" : "left", ...(freezeStyle(RP_FREEZE, i, C.brand, true) || {}) }}>{h}</th>;
  const td = (i, rowBg, right, node, extra) => <td key={i} className="px-3 py-2.5" style={{ textAlign: right ? "right" : "left", ...(extra || {}), ...(freezeStyle(RP_FREEZE, i, rowBg) || {}) }}>{node}</td>;

  // ---- Excel export (one report per tab; PO-wise carries the editable Remarks column) ----
  const RTABLE = (title, sub, headers, rows) => {
    const head = `<tr>${headers.map(([h]) => `<th>${h}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr>${r.map((c, i) => `<td class="${headers[i][1] ? "r" : ""}">${c == null ? "" : String(c).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("");
    return `<div class="title">${title}</div><div class="sub">${sub}</div><table>${head}${body}</table>`;
  };
  const exportReport = () => {
    const asOn = dmy(TODAY);
    if (tab === "po") {
      const H = [["Date"], ["GD Code"], ["PO"], ["Buyer"], ["Description"], ["Invoice No"], ["Qty", 1], ["Boxes", 1], ["Recd", 1], ["Pending", 1], ["Total Vol m³", 1], ["Invoice Value $", 1], ["Remarks"]];
      const rows = poRows.map((p) => [dmy(p.date), p.it.gd, p.po, buyerById(p.buyerId).brand, p.it.description, joinInv(p.invoices), p.qty, p.ordered, p.recd, p.pending, num(p.volume, 3), usd(p.value), remarks[p.key] || ""]);
      writeXLS(`Report_37_PO_wise_Buyer_${TODAY}.xls`, RTABLE("Report 37 · Balance Order PO wise (Buyer)", "As on " + asOn + " · Recd = boxes delivered against the PO · Remarks included", H, rows));
    } else if (tab === "item") {
      const H = [["Date"], ["GD Code"], ["Description"], ["PO(s)"], ["Invoice No"], ["Qty", 1], ["Vol/Box", 1], ["Total Boxes", 1], ["Recd Boxes", 1], ["Pending Boxes", 1], ["Total Vol m³", 1]];
      const rows = itemRows.map((p) => [p.date ? dmy(p.date) : "—", p.it.gd, p.it.description, p.pos.join(", "), joinInv(p.invoices), p.qty, num(p.it.volume, 3), p.ordered, p.recd, p.pending, num(p.volume, 3)]);
      writeXLS(`Report_37_Item_wise_${TODAY}.xls`, RTABLE("Report 37 · Balance Order Item wise", "As on " + asOn, H, rows));
    } else {
      const H = [["Date"], ["GD Code"], ["Supplier"], ["Description"], ["Invoice No"], ["Recd Boxes", 1], ["Pending Boxes", 1], ["Total Vol m³", 1], ["Invoice Value ₹", 1]];
      const rows = supRows.map((p) => [dmy(p.date), p.it.gd, supCode(p.supplierId), p.it.description, joinInv(p.invoices), p.recd, p.pending, num(p.volume, 3), num(p.value)]);
      writeXLS(`Report_36_Supplier_wise_${TODAY}.xls`, RTABLE("Report 36 · Balance Order Supplier wise", "As on " + asOn, H, rows));
    }
  };

  return (
    <div className="space-y-5">
      <div><Eyebrow>Stage E · Reports 36–39</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Balance register</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Live from the FIFO ledger — PO wise, item wise and supplier wise. Each row carries its invoice number so you can see which invoice cleared which PO. Date &amp; GD code stay frozen.</p></div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.navyTint, width: "fit-content" }}>
          {tabs.map(([k, lbl, I]) => <button key={k} onClick={() => setTab(k)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition" style={{ fontSize: 13, background: tab === k ? C.card : "transparent", color: tab === k ? C.navy : C.muted, cursor: "pointer" }}><I size={15} /> {lbl}</button>)}
        </div>
        <Btn icon={Download} onClick={exportReport}>Download {tab === "po" ? "PO wise (buyer)" : tab === "item" ? "Item wise" : "Supplier wise"} · Excel</Btn>
      </div>

      {tab === "po" && (
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.brand, color: "#fff" }}>{[["Date"], ["GD code"], ["PO"], ["Buyer"], ["Description"], ["Invoice No"], ["Qty", 1], ["Boxes", 1], ["Recd (from supplier)", 1], ["Pending", 1], ["Total vol m³", 1], ["Invoice value $", 1], ["Remarks"]].map(([h, r], i) => th(h, r, i))}</tr></thead>
              <tbody>{poRows.map((p, ri) => { const rowBg = ri % 2 ? C.canvas : C.card; return (
                <tr key={p.key} style={{ background: rowBg, borderTop: `1px solid ${C.border}` }}>
                  {td(0, rowBg, false, dmy(p.date), { color: C.muted })}
                  {td(1, rowBg, false, <Code>{p.it.gd}</Code>)}
                  {td(2, rowBg, false, <span style={{ fontFamily: MONO, fontWeight: 700, color: C.navy }}>{p.po}</span>)}
                  {td(3, rowBg, false, buyerById(p.buyerId).brand)}
                  {td(4, rowBg, false, <span style={{ color: C.navy }}>{p.it.description}</span>)}
                  {td(5, rowBg, false, <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.code }}>{joinInv(p.invoices)}</span>)}
                  {td(6, rowBg, true, p.qty.toLocaleString("en-IN"))}
                  {td(7, rowBg, true, p.ordered, { fontWeight: 600 })}
                  {td(8, rowBg, true, p.recd, { color: C.navy })}
                  {td(9, rowBg, true, p.pending, { fontWeight: 700, color: p.pending ? C.amberDark : C.teal })}
                  {td(10, rowBg, true, num(p.volume, 3))}
                  {td(11, rowBg, true, usd(p.value))}
                  {td(12, rowBg, false, <input style={{ ...smInput, width: 150, padding: "5px 8px" }} value={remarks[p.key] || ""} onChange={(e) => setRem(p.key, e.target.value)} placeholder="add note" />)}
                </tr>
              ); })}</tbody>
            </table>
          </div>
          <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Report 37 · balance order PO wise (buyer). Recd = boxes delivered against the PO; Invoice No = the invoice(s) that cleared it.</div>
        </Card>
      )}

      {tab === "item" && (
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.brand, color: "#fff" }}>{[["Date"], ["GD code"], ["Description"], ["PO(s)"], ["Invoice No"], ["Qty", 1], ["Vol/box", 1], ["Total boxes", 1], ["Recd boxes", 1], ["Pending boxes", 1], ["Total vol m³", 1]].map(([h, r], i) => th(h, r, i))}</tr></thead>
              <tbody>{itemRows.map((p, ri) => { const rowBg = ri % 2 ? C.canvas : C.card; return (
                <tr key={p.it.id} style={{ background: rowBg, borderTop: `1px solid ${C.border}` }}>
                  {td(0, rowBg, false, p.date ? dmy(p.date) : "—", { color: C.muted })}
                  {td(1, rowBg, false, <Code>{p.it.gd}</Code>)}
                  {td(2, rowBg, false, <span style={{ color: C.navy }}>{p.it.description}</span>)}
                  {td(3, rowBg, false, <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.code }}>{p.pos.join(", ")}</span>)}
                  {td(4, rowBg, false, <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.code }}>{joinInv(p.invoices)}</span>)}
                  {td(5, rowBg, true, p.qty.toLocaleString("en-IN"))}
                  {td(6, rowBg, true, num(p.it.volume, 3))}
                  {td(7, rowBg, true, p.ordered, { fontWeight: 600 })}
                  {td(8, rowBg, true, p.recd, { color: C.navy })}
                  {td(9, rowBg, true, p.pending, { fontWeight: 700, color: p.pending ? C.amberDark : C.teal })}
                  {td(10, rowBg, true, num(p.volume, 3))}
                </tr>
              ); })}</tbody>
            </table>
          </div>
          <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Report 37 · balance order item wise — which item sits in which PO and invoice, with pending boxes and total volume.</div>
        </Card>
      )}

      {tab === "supplier" && (
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.brand, color: "#fff" }}>{[["Date"], ["GD code"], ["Supplier"], ["Description"], ["Invoice No"], ["Recd boxes", 1], ["Pending boxes", 1], ["Total vol m³", 1], ["Invoice value ₹", 1]].map(([h, r], i) => th(h, r, i))}</tr></thead>
              <tbody>{supRows.map((p, ri) => { const rowBg = ri % 2 ? C.canvas : C.card; return (
                <tr key={p.supplierId + p.it.id} style={{ background: rowBg, borderTop: `1px solid ${C.border}` }}>
                  {td(0, rowBg, false, dmy(p.date), { color: C.muted })}
                  {td(1, rowBg, false, <Code>{p.it.gd}</Code>)}
                  {td(2, rowBg, false, <Pill>{supCode(p.supplierId)}</Pill>)}
                  {td(3, rowBg, false, <span style={{ color: C.navy }}>{p.it.description}</span>)}
                  {td(4, rowBg, false, <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.code }}>{joinInv(p.invoices)}</span>)}
                  {td(5, rowBg, true, p.recd, { fontWeight: 600, color: C.navy })}
                  {td(6, rowBg, true, p.pending, { fontWeight: 700, color: p.pending ? C.amberDark : C.teal })}
                  {td(7, rowBg, true, num(p.volume, 3))}
                  {td(8, rowBg, true, inr(p.value))}
                </tr>
              ); })}
              {!supRows.length && <tr><td colSpan={9} className="px-4 py-8 text-center" style={{ color: C.faint }}>No supplier receipts yet — create an invoice in Packing &amp; FIFO.</td></tr>}</tbody>
            </table>
          </div>
          <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Report 36 · balance order supplier wise — how many boxes we received from each supplier, per invoice, with pending balance and invoice value.</div>
        </Card>
      )}
    </div>
  );
}

/* ===== History ===== */
function HistoryView({ items, shipments }) {
  const rows = shipments.flatMap((s) => s.lines.map((l) => ({ ...l, ...s }))).sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div className="space-y-5">
      <div><Eyebrow>FIFO history · from stages C · D · E</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Shipped &amp; cleared from FIFO</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Every box that left FIFO and shipped, with the order it cleared and its shipment papers.</p></div>
      <Card pad={false} style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead><tr style={{ background: C.brand, color: "#fff", textAlign: "left" }}>{["Item", "Boxes", "Cleared PO", "Shipped", "Ship ID", "Invoice", "Container", "Vessel", "BL", "Discharge"].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => { const it = items.find((x) => x.id === r.itemId); return (
              <tr key={i} style={{ background: i % 2 ? C.canvas : C.card, borderTop: `1px solid ${C.border}` }}>
                <td className="px-3 py-2.5"><Code>{it.gd}</Code> <span style={{ color: C.navy }}>{it.description}</span></td>
                <td className="px-3 py-2.5" style={{ fontWeight: 600 }}>{r.boxes}</td><td className="px-3 py-2.5"><Pill tint={C.amberTint} color={C.amberDark}>PO {r.po}</Pill></td>
                <td className="px-3 py-2.5" style={{ color: C.muted }}>{dmy(r.date)}</td><td className="px-3 py-2.5"><Code>{r.shipId}</Code></td><td className="px-3 py-2.5"><Code>{r.invoice}</Code></td>
                <td className="px-3 py-2.5"><Code>{r.container}</Code></td><td className="px-3 py-2.5">{r.vessel}</td><td className="px-3 py-2.5"><Code>{r.bl}</Code></td><td className="px-3 py-2.5">{r.pod}</td>
              </tr>); })}</tbody>
          </table>
        </div>
        <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Pulled from the customs invoice (C), commercial invoice &amp; CWD (D), and the balance register (E).</div>
      </Card>
    </div>
  );
}

/* ===== Documents ===== */
const DOC_GROUPS = [
  { k: "A", t: "Buyer order", docs: ["1", "2A", "2", "3", "4", "5", "6"] },
  { k: "B", t: "Supplier packing", docs: ["7A", "7", "8", "9", "10", "11A", "11"] },
  { k: "C", t: "Pre-shipment", docs: ["12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29"] },
  { k: "D", t: "Post-shipment", docs: ["30", "31", "32", "33", "34"] },
  { k: "E", t: "Reports", docs: ["35", "36", "37", "38", "39"] },
  { k: "F", t: "Banking", docs: ["40"] },
];
function Documents({ items, buyerMaster, invoices }) {
  const [invId, setInvId] = useState(invoices[0]?.id);
  const [open, setOpen] = useState("18");
  const [q, setQ] = useState("");
  const inv = invoices.find((i) => i.id === invId) || invoices[0];
  if (!inv) return <div className="space-y-5"><div><Eyebrow>Stage A–F · Document set</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>One dataset, every document</h2></div><Card><div style={{ color: C.faint, fontSize: 13 }}>No invoices yet — create one in Packing &amp; FIFO.</div></Card></div>;
  const buyer = buyerById(inv.buyerId), done = shipComplete(inv.ship);
  const ctx = { inv, buyer, items, buyerMaster, invoices, SUPPLIERS, BUYERS, EXPORTER, supCode };
  const download = (no) => buildDocument(no, ctx);
  const ql = q.trim().toLowerCase();
  const match = (no) => !ql || no.toLowerCase().includes(ql) || (DOC_META[no] || "").toLowerCase().includes(ql);
  const groups = DOC_GROUPS.map((g) => ({ ...g, docs: g.docs.filter(match) })).filter((g) => g.docs.length);
  const previewHtml = renderDocument(open, ctx);
  const downloadStage = (g) => g.docs.forEach((no, i) => setTimeout(() => download(no), i * 250));
  return (
    <div className="space-y-5">
      <div><Eyebrow>Stage A–F · Document set</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>One dataset, every document</h2>
        <p style={{ fontSize: 13, color: C.muted }}>All 40 export documents, generated live from the selected invoice — the same PO, dates, buyer, BL, container and quantities flow into every sheet. Pick a document to preview it, then download in Excel.</p></div>
      <Card>
        <div className="flex items-end gap-4 flex-wrap">
          <Field label="Generate documents for invoice">
            <select style={{ ...smInput, width: 340 }} value={inv.id} onChange={(e) => setInvId(e.target.value)}>{invoices.map((x) => <option key={x.id} value={x.id}>{x.invoiceNo} — {dmy(x.date)} — {buyerById(x.buyerId).brand}</option>)}</select>
          </Field>
          <Pill tint={done ? C.tealTint : C.amberTint} color={done ? C.tealDark : C.amberDark}>{done ? "shipment complete" : "shipment pending"}</Pill>
          <div style={{ marginLeft: "auto", minWidth: 220 }}>
            <Field label="Search documents"><input style={smInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. packing, invoice, VGM, 18" /></Field>
          </div>
        </div>
        {!done && <div className="mt-3 p-2.5 rounded-lg" style={{ background: C.amberTint, fontSize: 12, color: C.amberDark }}>Shipment details are pending — post-shipment fields (BL, vessel, container, S/B) will show as blank on the documents until you fill them via the <b>Invoice</b> tab. Order-stage documents are fully populated now.</div>}
      </Card>
      <div className="grid gap-5" style={{ gridTemplateColumns: "320px 1fr" }}>
        <Card pad={false} style={{ overflow: "hidden", maxHeight: 640, overflowY: "auto" }}>
          {groups.map((g) => (
            <div key={g.k}>
              <div className="px-4 py-2 flex items-center justify-between gap-2" style={{ background: C.brand, color: "#fff", position: "sticky", top: 0, zIndex: 1 }}>
                <span className="flex items-center gap-2"><span style={{ fontFamily: MONO, color: C.amber, fontWeight: 700, fontSize: 12 }}>{g.k}</span><span style={{ fontSize: 12.5, fontWeight: 600 }}>{g.t}</span></span>
                <button onClick={() => downloadStage(g)} title="Download all in this stage" style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", padding: "3px 7px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}><Download size={12} /> all</button>
              </div>
              {g.docs.map((no) => { const active = open === no; return (
                <div key={no} onClick={() => setOpen(no)} className="w-full px-4 py-2 flex items-center justify-between transition" style={{ borderTop: `1px solid ${C.border}`, background: active ? C.amberTint : C.card, cursor: "pointer" }}>
                  <span style={{ fontSize: 12.5, color: C.navy }}><Code>{no}</Code> &nbsp;{DOC_META[no]}</span>
                  <button onClick={(e) => { e.stopPropagation(); download(no); }} title="Download Excel" style={{ background: "none", border: "none", cursor: "pointer", color: active ? C.amberDark : C.teal, padding: 3, display: "inline-flex" }}><Download size={15} /></button>
                </div>
              ); })}
            </div>
          ))}
          {!groups.length && <div className="p-6 text-center" style={{ color: C.faint, fontSize: 13 }}>No documents match “{q}”.</div>}
        </Card>
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: C.canvas, borderBottom: `1px solid ${C.border}` }}>
            <span className="font-semibold flex items-center gap-2" style={{ color: C.navy, fontSize: 13 }}><FileText size={15} color={C.teal} /> Document {open} · {DOC_META[open]}</span>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11.5, color: C.faint }}>{inv.invoiceNo} · {dmy(inv.date)}</span>
              <Btn small icon={Download} onClick={() => download(open)}>Download Excel</Btn>
            </div>
          </div>
          <div style={{ padding: 18, maxHeight: 560, overflow: "auto", background: C.canvas }}>
            <style>{PREVIEW_CSS}</style>
            <div className="docprev" style={{ background: "#ffffff", color: "#243b53", padding: "20px 22px", borderRadius: 8, border: "1px solid #d9e1ea", boxShadow: "0 1px 4px rgba(11,44,77,0.08)" }} dangerouslySetInnerHTML={{ __html: previewHtml || `<div class="sub">No preview for this document.</div>` }} />
            <div className="mt-3 flex items-center gap-2" style={{ fontSize: 11.5, color: C.teal }}><Check size={14} /> Live preview of the Excel output — figures pulled from invoice {inv.invoiceNo}. Highlighted PDF fields (invoice no, dates, BL, container, quantities) are filled from this shipment.</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ===== Shell ===== */
function NavItem({ label, icon: Icon, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="inline-flex items-center gap-2 rounded-lg transition"
      style={{ padding: "8px 13px", background: active ? "rgba(255,255,255,0.12)" : hover ? "rgba(255,255,255,0.06)" : "transparent", cursor: "pointer", whiteSpace: "nowrap" }}>
      <Icon size={16} color={active ? C.amber : "#9DB2C6"} strokeWidth={2.2} />
      <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 500, color: active ? "#fff" : "#B6C6D6" }}>{label}</span>
    </button>
  );
}
export default function App() {
  const [view, setView] = useState("dashboard");
  const [items, setItems] = useState(SEED_ITEMS);
  const [buyerMaster, setBuyerMaster] = useState(SEED_BM);
  const [invoices, setInvoices] = useState(SEED_INVOICES);
  const receipts = invReceipts(invoices);
  const ledger = computeLedger(buyerMaster, receipts, items);
  const nav = [
    { id: "dashboard", label: "Dashboard", sub: "Overview", icon: LayoutDashboard },
    { id: "masters", label: "Masters", sub: "Items · buyer · suppliers", icon: Database },
    { id: "order", label: "Buyer order", sub: "Stage A", icon: ClipboardList },
    { id: "orders", label: "Orders", sub: "Buyer & supplier (7A)", icon: ListOrdered },
    { id: "fifo", label: "Packing & FIFO", sub: "Stage B", icon: PackageCheck },
    { id: "invoice", label: "Invoice", sub: "Proforma · custom", icon: FileText },
    { id: "reports", label: "Reports", sub: "Stage E", icon: BarChart3 },
    { id: "history", label: "History", sub: "Shipped from FIFO", icon: History },
    { id: "docs", label: "Documents", sub: "Stage A–F", icon: FileText },
  ];
  const [theme, setTheme] = useState(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("jg-theme")) || "light"
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("jg-theme", theme); } catch (e) { /* ignore */ }
  }, [theme]);
  return (
    <div style={{ fontFamily: FONT, background: C.canvas, minHeight: "100vh", color: C.ink, display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: C.brand, boxShadow: "0 2px 14px rgba(11,44,77,0.16)" }}>
        <div style={{ maxWidth: 2000, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 18, height: 60 }}>
          <div className="flex items-center gap-2.5" style={{ flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: C.amber, display: "flex", alignItems: "center", justifyContent: "center" }}><Anchor size={18} color={C.brand} strokeWidth={2.6} /></div>
            <div><div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>Jaikvin Global</div><div style={{ color: "#8FA6BC", fontSize: 10, letterSpacing: 0.6 }}>EXPORT SYSTEM</div></div>
          </div>
          <nav className="flex items-center gap-1" style={{ flex: 1, overflowX: "auto" }}>
            {nav.map((n) => <NavItem key={n.id} label={n.label} icon={n.icon} active={view === n.id} onClick={() => setView(n.id)} />)}
          </nav>
          <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle theme"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", cursor: "pointer" }}>
              {theme === "dark" ? <Sun size={16} strokeWidth={2.2} /> : <Moon size={16} strokeWidth={2.2} />}
            </button>
            <Pill tint={C.amberTint} color={C.amberDark}>R1 · working prototype</Pill>
          </div>
        </div>
      </header>
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 2000, margin: "0 auto", padding: "9px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.muted }}><Ship size={15} color={C.teal} /> Shipment in flight: <Code>{SHIPMENT.invoice}</Code><span style={{ color: C.border }}>|</span><Code>{SHIPMENT.container}</Code> · {SHIPMENT.pol} → {SHIPMENT.pod}</div>
          <div style={{ fontSize: 11.5, color: C.faint }}>Sample data · mirrors the Next.js + Python + Neon build</div>
        </div>
      </div>
      <main style={{ flex: 1 }}>
        <div style={{ padding: 28, maxWidth: 2000, margin: "0 auto" }}>
          {view === "dashboard" && <Dashboard ledger={ledger} shipments={SHIPMENTS} items={items} go={setView} />}
          {view === "masters" && <Masters items={items} setItems={setItems} />}
          {view === "order" && <BuyerOrder items={items} buyerMaster={buyerMaster} setBuyerMaster={setBuyerMaster} />}
          {view === "orders" && <Orders buyerMaster={buyerMaster} items={items} receipts={receipts} />}
          {view === "fifo" && <PackingFIFO items={items} buyerMaster={buyerMaster} invoices={invoices} setInvoices={setInvoices} />}
          {view === "invoice" && <InvoiceTab invoices={invoices} setInvoices={setInvoices} items={items} />}
          {view === "reports" && <Reports items={items} buyerMaster={buyerMaster} invoices={invoices} />}
          {view === "history" && <HistoryView items={items} shipments={SHIPMENTS} />}
          {view === "docs" && <Documents items={items} buyerMaster={buyerMaster} invoices={invoices} />}
        </div>
      </main>
      <footer style={{ borderTop: `1px solid ${C.border}`, background: C.card }}>
        <div style={{ maxWidth: 2000, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>Maintained and Developed By <span style={{ fontWeight: 600, color: C.navy }}>Avita Technologies</span></span>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.faint }}>V-1.2</span>
        </div>
      </footer>
    </div>
  );
}
