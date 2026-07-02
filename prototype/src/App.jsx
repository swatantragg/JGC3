import { useState } from "react";
import {
  LayoutDashboard, Database, ClipboardList, PackageCheck, BarChart3, FileText,
  Ship, Plus, ArrowRight, Check, Boxes, Building2, ChevronRight, Anchor,
  Package, Layers, Truck, RotateCcw, Globe, ListOrdered, History, Download, Pencil, X
} from "lucide-react";

/* ===== Global Trade identity ===== */
const C = {
  navy: "#0B2C4D", navy2: "#143b61", amber: "#E8A33D", amberDark: "#9A6A1A", amberTint: "#FBEBD0",
  teal: "#1C7C8C", tealTint: "#E1F0F2", tealDark: "#0F5260", canvas: "#FBFAF7", card: "#FFFFFF",
  border: "#E7E3DA", ink: "#0B2C4D", muted: "#5A6B7A", faint: "#94A0AC", navyTint: "#EAEFF3",
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
const BUYER = { id: "b1", name: "Corecomp Pty Ltd", brand: "GD Watermark", country: "Australia", curr: "USD", shipTo: "Fremantle" };

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

/* ===== UI atoms ===== */
function Btn({ children, onClick, kind = "amber", icon: Icon, disabled, small }) {
  const styles = { amber: { background: disabled ? "#E8C893" : C.amber, color: C.navy }, teal: { background: C.teal, color: "#fff" }, ghost: { background: "#fff", color: C.navy, border: `1px solid ${C.border}` } };
  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-lg font-semibold transition ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      style={{ ...styles[kind], opacity: disabled ? 0.7 : 1, cursor: disabled ? "default" : "pointer" }}>
      {Icon && <Icon size={small ? 14 : 16} strokeWidth={2.4} />} {children}
    </button>
  );
}
const Card = ({ children, pad = true, style }) => <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, ...style }} className={pad ? "p-5" : ""}>{children}</div>;
const Code = ({ children }) => <span style={{ fontFamily: MONO, fontSize: 12.5, color: "#1d4f7c" }}>{children}</span>;
const Eyebrow = ({ children }) => <div className="uppercase font-semibold" style={{ fontSize: 11, letterSpacing: 1.4, color: C.teal }}>{children}</div>;
const Pill = ({ children, tint = C.navyTint, color = C.navy }) => <span className="px-2 py-0.5 rounded-md font-medium" style={{ background: tint, color, fontSize: 11.5 }}>{children}</span>;
const Field = ({ label, children }) => <label className="block"><div className="mb-1 font-medium" style={{ fontSize: 12, color: C.muted }}>{label}</div>{children}</label>;
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 15, color: C.ink, background: "#fff", outline: "none", fontFamily: FONT };
const smInput = { ...inputStyle, padding: "8px 10px", fontSize: 14 };
const EditBtn = ({ onClick }) => <button onClick={onClick} title="Edit" style={{ background: "none", border: "none", cursor: "pointer", color: C.teal, padding: 4, display: "inline-flex" }}><Pencil size={14} /></button>;

/* ===== Edit modal ===== */
function EditModal({ title, schema, value, onSave, onClose }) {
  const [f, setF] = useState({ ...value });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,44,77,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 760, maxHeight: "86vh", overflowY: "auto", boxShadow: "0 24px 70px rgba(0,0,0,0.35)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: "#fff" }}>
          <div className="flex items-center gap-2"><Pencil size={16} color={C.teal} /><span className="font-bold" style={{ color: C.navy, fontSize: 16 }}>{title}</span></div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint }}><X size={18} /></button>
        </div>
        <div className="px-6 py-5">
          <div className="grid grid-cols-3 gap-3">
            {schema.map((s) => (
              <Field key={s.key} label={s.label}>
                {s.type === "select"
                  ? <select style={smInput} value={f[s.key]} onChange={(e) => set(s.key, e.target.value)}>{s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  : <input style={smInput} type={s.type === "number" ? "number" : "text"} value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)} />}
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
const BUYER_SCHEMA = [{ key: "name", label: "Buyer name" }, { key: "brand", label: "Trading as" }, { key: "country", label: "Country" }, { key: "curr", label: "Currency" }, { key: "shipTo", label: "Ship to (port)" }];
const SUP_SCHEMA = [{ key: "name", label: "Name" }, { key: "code", label: "Code" }, { key: "place", label: "Place" }, { key: "gstin", label: "GSTIN" }];

/* ===== Buyer master table (2A, one row per order line) ===== */
const BM_HEAD = ["Date", "PO", "Code", "GD", "Size", "Len", "Pack", "Description", "Barcode", "HSN", "Qty", "Boxes", "Vol m³", "Net kg", "Gross kg", "Stk/box", "Labels", "Sheets", "Unit ₹", "Total ₹", "FOB/100 $", "Total $", "RBI", "RBI ref ₹", "Rate ₹"];
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
        <thead><tr style={{ background: C.navy, color: "#fff", textAlign: "left", position: "sticky", top: 0 }}>{BM_HEAD.map((h) => <th key={h} className="px-2.5 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.id} style={{ background: i % 2 ? C.canvas : "#fff", borderTop: `1px solid ${C.border}` }}>
            {bmRow(r).map((c, j) => <td key={j} className="px-2.5 py-1.5" style={{ color: j < 2 || j === 3 ? "#1d4f7c" : C.ink, fontFamily: [3, 8, 9].includes(j) ? MONO : FONT, fontWeight: j === 11 ? 600 : 400 }}>{c}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ===== 7A supplier master ===== */
const SM7_HEAD = ["Sr no", "PO", "Code", "GD", "OSWIN", "GL", "Size", "Len", "Packing", "Description", "Bar code", "HSN", "Qty", "Box", "Vol/box", "Total vol", "BG", "PC", "TTL", "Barcode stk", "Sheets", "Cost/unit ₹", "Total cost ₹", "FOB/pc $", "Total FOB $", "RBI", "RBI ref ₹", "Rate ₹"];
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
        <thead><tr style={{ background: C.navy, color: "#fff", textAlign: "left", position: "sticky", top: 0 }}>{SM7_HEAD.map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((g, i) => (
          <tr key={i} style={{ background: i % 2 ? C.canvas : "#fff", borderTop: `1px solid ${C.border}` }}>
            {sm7Cells(g, rbi).map((c, j) => <td key={j} className="px-2 py-1.5" style={{ color: C.ink, fontFamily: [0, 2, 3, 4, 5, 10, 11].includes(j) ? MONO : FONT, fontWeight: [0, 12, 13].includes(j) ? 600 : 400 }}>{c}</td>)}
          </tr>
        ))}</tbody>
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

/* ===== Dashboard ===== */
function Dashboard({ ledger, shipments, items, go }) {
  const pendingBoxes = Object.values(ledger).reduce((s, b) => s + b.demands.reduce((t, d) => t + d.remaining, 0), 0);
  const recent = shipments.flatMap((s) => s.lines.map((l) => ({ ...l, shipId: s.shipId, date: s.date }))).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  return (
    <div className="space-y-6">
      <div style={{ background: C.navy, borderRadius: 16, color: "#fff", overflow: "hidden", position: "relative" }} className="p-7">
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
function Masters({ items, setItems }) {
  const [tab, setTab] = useState("items");
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
          style={{ fontSize: 13, background: tab === k ? "#fff" : "transparent", color: tab === k ? C.navy : C.muted, cursor: "pointer" }}><I size={15} /> {lbl}</button>)}
      </div>

      {tab === "items" && (
        <div className="space-y-4">
          <AddItemForm onAdd={(it) => setItems([...items, it])} />
          <div className="flex items-center justify-end gap-2">
            <span style={{ fontSize: 12, color: C.muted }}>Filter by supplier</span>
            <select style={{ ...smInput, width: 220 }} value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
              <option value="all">All suppliers ({items.length} items)</option>{SUPPLIERS.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </div>
          <Card pad={false} style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
                <thead><tr style={{ background: C.navy, color: "#fff", textAlign: "left" }}>
                  {["GD code", "Code", "OSWIN", "GL", "Description", "Size mm", "Len mm", "Packing", "Bar code", "HSN", "Vol/box", "Net/box", "Gross/box", "Bg", "P", "Stk/box", "Type UP", "Unit ₹", "FOB/100 $", "Supplier", ""].map((h, i) => <th key={i} className="px-2.5 py-2.5 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {shownItems.map((it, i) => (
                    <tr key={it.id} style={{ background: i % 2 ? C.canvas : "#fff", borderTop: `1px solid ${C.border}` }}>
                      <td className="px-2.5 py-2.5"><Code>{it.gd}</Code></td><td className="px-2.5 py-2.5"><Code>{it.code}</Code></td>
                      <td className="px-2.5 py-2.5"><Code>{it.oswin}</Code></td><td className="px-2.5 py-2.5"><Code>{it.gl}</Code></td>
                      <td className="px-2.5 py-2.5" style={{ color: C.navy, fontWeight: 600 }}>{it.description}<div style={{ color: C.faint, fontWeight: 400, fontSize: 11 }}>{it.group}</div></td>
                      <td className="px-2.5 py-2.5">{it.size}</td><td className="px-2.5 py-2.5">{it.length}</td><td className="px-2.5 py-2.5">{it.packing} / box</td>
                      <td className="px-2.5 py-2.5"><Code>{it.barcode}</Code></td><td className="px-2.5 py-2.5"><Code>{it.hsn}</Code></td>
                      <td className="px-2.5 py-2.5">{num(it.volume, 3)}</td><td className="px-2.5 py-2.5">{it.netPerBox}</td><td className="px-2.5 py-2.5">{it.grossPerBox}</td>
                      <td className="px-2.5 py-2.5">{it.bgPerBox}</td><td className="px-2.5 py-2.5">{it.pPerBox}</td>
                      <td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{num((it.bgPerBox + it.pPerBox) * 1.1)}</td><td className="px-2.5 py-2.5">{it.typeUp}</td>
                      <td className="px-2.5 py-2.5">{inr(it.unitValue)}</td><td className="px-2.5 py-2.5">{usd(it.unitFob100)}</td>
                      <td className="px-2.5 py-2.5"><Pill>{supCode(it.supplierId)}</Pill></td>
                      <td className="px-2.5 py-2.5"><EditBtn onClick={() => setEditing({ type: "item", value: it })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2.5" style={{ background: C.amberTint, fontSize: 12, color: C.amberDark }}>Constant master fields only — these never change with an order. Quantities, totals, labels, sheets and rate are calculated per buyer order (see formulas below).</div>
          </Card>
          <FormulasPanel />
        </div>
      )}

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
          <div className="px-5 py-3 font-semibold" style={{ background: C.navy, color: "#fff", fontSize: 13 }}>Buyer master (2A) — constant fields for verification</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.canvas, color: C.navy, textAlign: "left" }}>{["GD", "Code", "Size", "Len", "Packing", "Description", "Bar code", "HSN", "Vol/box", "Net/box", "Gross/box", "Stk/box", "Unit ₹", "FOB/100 $", "Supplier", ""].map((h, i) => <th key={i} className="px-2.5 py-2.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{items.map((it, i) => (
                <tr key={it.id} style={{ background: i % 2 ? C.canvas : "#fff", borderTop: `1px solid ${C.border}` }}>
                  <td className="px-2.5 py-2.5"><Code>{it.gd}</Code></td><td className="px-2.5 py-2.5"><Code>{it.code}</Code></td><td className="px-2.5 py-2.5">{it.size}</td><td className="px-2.5 py-2.5">{it.length}</td>
                  <td className="px-2.5 py-2.5">{it.packing} / box</td><td className="px-2.5 py-2.5" style={{ color: C.navy }}>{it.description}</td><td className="px-2.5 py-2.5"><Code>{it.barcode}</Code></td><td className="px-2.5 py-2.5"><Code>{it.hsn}</Code></td>
                  <td className="px-2.5 py-2.5">{num(it.volume, 3)}</td><td className="px-2.5 py-2.5">{it.netPerBox}</td><td className="px-2.5 py-2.5">{it.grossPerBox}</td><td className="px-2.5 py-2.5">{num((it.bgPerBox + it.pPerBox) * 1.1)}</td>
                  <td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{inr(it.unitValue)}</td><td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{usd(it.unitFob100)}</td><td className="px-2.5 py-2.5"><Pill>{supCode(it.supplierId)}</Pill></td>
                  <td className="px-2.5 py-2.5"><EditBtn onClick={() => setEditing({ type: "item", value: it })} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Constant values only — easy for the client to verify item pricing. Quantities and totals are added per order.</div>
        </Card>
      )}

      {tab === "supplierData" && (
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="px-5 py-3 font-semibold" style={{ background: C.navy, color: "#fff", fontSize: 13 }}>Supplier master (7A) — constant fields for verification</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: C.canvas, color: C.navy, textAlign: "left" }}>{["GD", "Code", "OSWIN", "GL", "Size", "Len", "Packing", "Description", "Bar code", "HSN", "Vol/box", "BG", "PC", "TTL", "Cost/unit ₹", "FOB/pc $", "Supplier", ""].map((h, i) => <th key={i} className="px-2.5 py-2.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{items.map((it, i) => (
                <tr key={it.id} style={{ background: i % 2 ? C.canvas : "#fff", borderTop: `1px solid ${C.border}` }}>
                  <td className="px-2.5 py-2.5"><Code>{it.gd}</Code></td><td className="px-2.5 py-2.5"><Code>{it.code}</Code></td><td className="px-2.5 py-2.5"><Code>{it.oswin}</Code></td><td className="px-2.5 py-2.5"><Code>{it.gl}</Code></td>
                  <td className="px-2.5 py-2.5">{it.size}</td><td className="px-2.5 py-2.5">{it.length}</td><td className="px-2.5 py-2.5">{it.packing} / box</td><td className="px-2.5 py-2.5" style={{ color: C.navy }}>{it.description}</td>
                  <td className="px-2.5 py-2.5"><Code>{it.barcode}</Code></td><td className="px-2.5 py-2.5"><Code>{it.hsn}</Code></td><td className="px-2.5 py-2.5">{num(it.volume, 3)}</td>
                  <td className="px-2.5 py-2.5">{it.packing}</td><td className="px-2.5 py-2.5">1</td><td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{it.packing + 1}</td>
                  <td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{inr(it.unitValue)}</td><td className="px-2.5 py-2.5" style={{ fontWeight: 600 }}>{usdp(it.unitFob100 / 100)}</td><td className="px-2.5 py-2.5"><Pill>{supCode(it.supplierId)}</Pill></td>
                  <td className="px-2.5 py-2.5"><EditBtn onClick={() => setEditing({ type: "item", value: it })} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="px-3 py-2.5" style={{ background: C.tealTint, fontSize: 12, color: C.tealDark }}>Constant values only. BG = units/box, PC = 1 carton, TTL = BG + PC. Quantities, barcode stickers, totals and rate are built per order in the Orders → Supplier tab.</div>
        </Card>
      )}

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
  const [pick, setPick] = useState(items[0]?.id);
  const [qty, setQty] = useState("");
  const [rbi, setRbi] = useState("83.50");
  const [po, setPo] = useState("03540");
  const item = items.find((x) => x.id === pick) || items[0];
  const d = deriveBuyer(item, qty, rbi);
  const add = () => { if (!qty || Number(qty) <= 0) return; setBuyerMaster([{ id: "r" + Date.now(), date: TODAY, po, itemId: pick, qty: Number(qty), rbi: Number(rbi), item: { ...item } }, ...buyerMaster]); setQty(""); };
  const tiles = d ? [
    ["Code", item.code], ["Size mm", item.size], ["Length mm", item.length], ["Packing", item.packing + " / box"],
    ["Description", item.description], ["Bar code", item.barcode], ["HSN", item.hsn], ["Volume m³", num(d.volTotal, 3)],
    [`Net weight (box ${item.netPerBox} kg)`, num(d.netTotal) + " kg"], [`Gross weight (box ${item.grossPerBox} kg)`, num(d.grossTotal) + " kg"],
    ["Stickers / box", num(d.stickersPerBox)], ["Labels", Math.round(d.labels).toLocaleString("en-IN")], ["Sheets required", d.sheets],
    ["Boxes", d.boxes], ["Total value ₹", inr(d.totalValueINR)], ["Total FOB/100 $", usd(d.totalFobUSD)], ["RBI ref value ₹", inr(d.rbiRefINR)], ["Rate ₹", num(d.rate)],
  ] : [];
  return (
    <div className="space-y-5">
      <div><Eyebrow>Stage A · Buyer order</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Enter one line, derive the whole sheet</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Pick an item, a quantity, and today’s RBI dollar rate — every other field is calculated and written into the Buyer master.</p></div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "340px 1fr" }}>
        <Card>
          <div className="grid grid-cols-2 gap-3 mb-3"><Field label="PO number"><input style={smInput} value={po} onChange={(e) => setPo(e.target.value)} /></Field><Field label="Date"><input style={smInput} value={dmy(TODAY)} disabled /></Field></div>
          <div className="space-y-3">
            <Field label="Item (GD code)"><select style={inputStyle} value={pick} onChange={(e) => setPick(e.target.value)}>{items.map((it) => <option key={it.id} value={it.id}>{it.gd} — {it.description}</option>)}</select></Field>
            <Field label="Quantity (pieces)"><input style={inputStyle} type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 2000" /></Field>
            <Field label="Today’s rupee value per RBI ($→₹)"><input style={{ ...inputStyle, borderColor: C.amber, background: C.amberTint }} type="number" value={rbi} onChange={(e) => setRbi(e.target.value)} placeholder="e.g. 83.50" /></Field>
            <div style={{ fontSize: 11.5, color: C.faint }}>Packing: {item.packing} pcs / box · stickers/box (Bg {item.bgPerBox} + P {item.pPerBox})×1.1</div>
            <Btn icon={Plus} onClick={add} disabled={!qty || Number(qty) <= 0}>Add to Buyer master</Btn>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-3"><Eyebrow>Derived for this line — all fields</Eyebrow><Pill tint={C.amberTint} color={C.amberDark}>live</Pill></div>
          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map(([k, v]) => (
              <div key={k} className="p-2.5 rounded-xl" style={{ background: C.tealTint, border: "1px solid #CFE6EA" }}>
                <div style={{ fontSize: 10, color: C.tealDark, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1.3 }}>{k}</div>
                <div className="font-bold mt-0.5" style={{ fontSize: 14.5, color: C.navy, fontFamily: ["Bar code", "HSN", "Code"].includes(k) ? MONO : FONT }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2"><ClipboardList size={15} color={C.teal} /><span className="font-semibold" style={{ color: C.navy, fontSize: 14 }}>Buyer master sheet</span><span style={{ color: C.faint, fontSize: 12 }}>— added on {dmy(TODAY)} (past orders live in the Orders tab)</span></div>
        <Card pad={false} style={{ overflow: "hidden" }}><BuyerMasterTable rows={buyerMaster.filter((r) => r.date === TODAY)} emptyMsg="Nothing added today yet — add a line above to see it here." /></Card>
      </div>
    </div>
  );
}

/* ===== By PO view ===== */
function POView({ buyerMaster, selPo, setSelPo }) {
  const poMap = {};
  buyerMaster.forEach((r) => { (poMap[r.po] = poMap[r.po] || []).push(r); });
  const poList = Object.entries(poMap).map(([po, rows]) => {
    const date = rows.map((r) => r.date).sort()[0];
    const d = rows.map((r) => deriveBuyer(r.item, r.qty, r.rbi));
    return { po, rows, date, items: rows.length, qty: rows.reduce((s, r) => s + r.qty, 0), boxes: d.reduce((s, x) => s + x.boxes, 0), val: d.reduce((s, x) => s + x.totalValueINR, 0), fob: d.reduce((s, x) => s + x.totalFobUSD, 0) };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.po.localeCompare(a.po));
  if (!poList.length) return <Card><div style={{ color: C.faint, fontSize: 13 }}>No purchase orders yet.</div></Card>;
  const sel = poList.find((p) => p.po === selPo) || poList[0];
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "260px minmax(0, 1fr)" }}>
      <Card pad={false} style={{ overflow: "hidden", alignSelf: "start" }}>
        <div className="px-4 py-3 font-semibold" style={{ background: C.navy, color: "#fff", fontSize: 13 }}>{poList.length} purchase order(s)</div>
        <div style={{ maxHeight: 520, overflowY: "auto" }}>
          {poList.map((p) => {
            const active = p.po === sel.po;
            return (
              <button key={p.po} onClick={() => setSelPo(p.po)} className="w-full text-left px-4 py-3 transition" style={{ borderTop: `1px solid ${C.border}`, background: active ? C.amberTint : "#fff", borderLeft: `3px solid ${active ? C.amber : "transparent"}`, cursor: "pointer" }}>
                <div className="flex items-center justify-between"><span style={{ fontFamily: MONO, fontWeight: 700, color: C.navy, fontSize: 13.5 }}>PO {p.po}</span><span style={{ fontSize: 11, color: C.faint }}>{dmy(p.date)}</span></div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{p.items} item(s) · {p.qty.toLocaleString("en-IN")} pcs · {inr(p.val)}</div>
              </button>
            );
          })}
        </div>
      </Card>
      <div className="space-y-4" style={{ minWidth: 0 }}>
        <Card>
          <div className="flex items-start justify-between">
            <div><Eyebrow>Purchase order</Eyebrow><div className="font-bold mt-1" style={{ fontFamily: MONO, fontSize: 22, color: C.navy }}>PO {sel.po}</div><div style={{ fontSize: 12.5, color: C.muted }}>{BUYER.name} ({BUYER.brand}) · {dmy(sel.date)}</div></div>
            <Btn icon={Download} kind="teal" onClick={() => downloadCSV(`PO_${sel.po}.csv`, BM_HEAD, sel.rows.map((r) => bmRaw(r)))}>Download this PO</Btn>
          </div>
          <div className="grid grid-cols-5 gap-3 mt-4">
            {[["Items", sel.items], ["Total quantity", sel.qty.toLocaleString("en-IN") + " pcs"], ["Total boxes", sel.boxes], ["Total value", inr(sel.val)], ["Total FOB", usd(sel.fob)]].map(([k, v]) => (
              <div key={k} className="p-3 rounded-xl" style={{ background: C.tealTint, border: "1px solid #CFE6EA" }}><div style={{ fontSize: 10.5, color: C.tealDark, textTransform: "uppercase", letterSpacing: 0.4 }}>{k}</div><div className="font-bold mt-0.5" style={{ fontSize: 16, color: C.navy }}>{v}</div></div>
            ))}
          </div>
        </Card>
        <div>
          <div className="flex items-center gap-2 mb-2"><ClipboardList size={15} color={C.teal} /><span className="font-semibold" style={{ color: C.navy, fontSize: 14 }}>All lines in PO {sel.po}</span><span style={{ color: C.faint, fontSize: 12 }}>— full buyer-master detail, every field</span></div>
          <Card pad={false} style={{ overflow: "hidden" }}><BuyerMasterTable rows={sel.rows} /></Card>
        </div>
      </div>
    </div>
  );
}

/* ===== Orders tab ===== */
function Orders({ buyerMaster }) {
  const [tab, setTab] = useState("buyer");
  const [from, setFrom] = useState("2025-01-01");
  const [to, setTo] = useState(TODAY);
  const [sup, setSup] = useState("s1");
  const [supRbi, setSupRbi] = useState("83.50");
  const [selPo, setSelPo] = useState(null);
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
          style={{ fontSize: 13, background: tab === k ? "#fff" : "transparent", color: tab === k ? C.navy : C.muted, cursor: "pointer" }}><I size={15} /> {lbl}</button>)}
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

      {tab === "po" && <POView buyerMaster={buyerMaster} selPo={selPo} setSelPo={setSelPo} />}
    </div>
  );
}

/* ===== Packing & FIFO ===== */
function PackingFIFO({ items, buyerMaster, receipts, setReceipts }) {
  const [supplier, setSupplier] = useState("s1");
  const [pick, setPick] = useState(items[0]?.id);
  const [boxes, setBoxes] = useState("");
  const [flash, setFlash] = useState(null);
  const ledger = computeLedger(buyerMaster, receipts, items);
  const focus = ledger[pick] || Object.values(ledger)[0];
  const apply = () => { const b = Number(boxes); if (!b || b <= 0) return; setReceipts([...receipts, { itemId: pick, supplierId: supplier, boxes: b }]); setFlash(pick); setBoxes(""); };
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div><Eyebrow>Stage B · Supplier packing · FIFO</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Deliveries clear the oldest order first</h2>
          <p style={{ fontSize: 13, color: C.muted }}>Record what a supplier packed; it deducts from pending orders oldest-first and stores which order each box cleared.</p></div>
        <button onClick={() => { setReceipts([]); setFlash(null); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.muted, fontSize: 12.5, cursor: "pointer", background: "#fff" }}><RotateCcw size={13} /> Reset demo</button>
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "340px 1fr" }}>
        <Card>
          <Eyebrow>Record a packing receipt</Eyebrow>
          <div className="space-y-3 mt-3">
            <Field label="Supplier"><select style={inputStyle} value={supplier} onChange={(e) => setSupplier(e.target.value)}>{SUPPLIERS.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select></Field>
            <Field label="Item"><select style={inputStyle} value={pick} onChange={(e) => { setPick(e.target.value); setFlash(null); }}>{items.map((it) => <option key={it.id} value={it.id}>{it.gd} — {it.description}</option>)}</select></Field>
            <Field label="Boxes delivered"><input style={inputStyle} type="number" value={boxes} onChange={(e) => setBoxes(e.target.value)} placeholder="e.g. 7" /></Field>
            <Btn icon={PackageCheck} onClick={apply} disabled={!boxes || Number(boxes) <= 0}>Apply delivery (FIFO)</Btn>
          </div>
          <div className="mt-4 p-3 rounded-xl" style={{ background: C.navyTint, fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}><b style={{ color: C.navy }}>Try it:</b> {focus.item.gd} has {focus.demands.length} pending order(s). Deliver 7 boxes and watch the oldest PO close first.</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-3"><div className="font-semibold" style={{ color: C.navy, fontSize: 14 }}>{focus.item.gd} · {focus.item.description} <span style={{ color: C.faint, fontWeight: 400 }}>— pending balance</span></div><Pill tint={C.tealTint} color={C.tealDark}>{focus.supplied} boxes received</Pill></div>
          <div className="space-y-3">
            {focus.demands.map((dm, i) => { const pct = Math.round((dm.allocated / dm.ordered) * 100); const done = dm.remaining === 0; return (
              <div key={i} className="p-3 rounded-xl" style={{ border: `1px solid ${flash === pick ? C.amber : C.border}`, background: done ? C.tealTint : "#fff", transition: "all .3s" }}>
                <div className="flex items-center justify-between" style={{ fontSize: 12.5 }}>
                  <div className="flex items-center gap-2"><Code>PO {dm.po}</Code><span style={{ color: C.faint }}>{dmy(dm.date)}</span>{i === 0 && <Pill tint={C.amberTint} color={C.amberDark}>oldest</Pill>}</div>
                  <div style={{ color: C.navy, fontWeight: 600 }}>{done ? <span style={{ color: C.teal }}><Check size={13} className="inline" /> cleared</span> : `${dm.remaining} of ${dm.ordered} boxes left`}</div>
                </div>
                <div className="mt-2 rounded-full" style={{ height: 8, background: C.navyTint, overflow: "hidden" }}><div style={{ width: pct + "%", height: "100%", background: done ? C.teal : C.amber, transition: "width .5s" }} /></div>
              </div>
            ); })}
            {focus.leftover > 0 && <div className="p-3 rounded-xl" style={{ background: C.amberTint, fontSize: 12.5, color: C.amberDark }}>{focus.leftover} extra box(es) beyond all pending orders — flagged for review.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ===== Reports ===== */
function Reports({ items, buyerMaster, receipts }) {
  const ledger = computeLedger(buyerMaster, receipts, items);
  const rows = items.map((it) => { const b = ledger[it.id]; const ordered = b.demands.reduce((s, d) => s + d.ordered, 0); const pending = b.demands.reduce((s, d) => s + d.remaining, 0); return { it, ordered, supplied: b.supplied, pending }; });
  const maxPending = Math.max(1, ...rows.map((r) => r.pending));
  return (
    <div className="space-y-5">
      <div><Eyebrow>Stage E · Reports</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>Balance register</h2>
        <p style={{ fontSize: 13, color: C.muted }}>Reports 36–39 are live views of the FIFO ledger — pending quantity, item-wise and supplier-wise.</p></div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Card pad={false} style={{ overflow: "hidden" }}>
          <div className="px-5 py-3 font-semibold" style={{ background: C.navy, color: "#fff", fontSize: 13 }}>Item-wise balance</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ textAlign: "left", color: C.muted }}>{["Item", "Ordered", "Received", "Pending", "Supplier"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={r.it.id} style={{ borderTop: `1px solid ${C.border}`, background: i % 2 ? C.canvas : "#fff" }}>
              <td className="px-3 py-2.5"><Code>{r.it.gd}</Code></td><td className="px-3 py-2.5">{r.ordered}</td><td className="px-3 py-2.5">{r.supplied}</td>
              <td className="px-3 py-2.5"><span style={{ fontWeight: 700, color: r.pending ? C.amberDark : C.teal }}>{r.pending}</span></td><td className="px-3 py-2.5"><Pill>{supCode(r.it.supplierId)}</Pill></td>
            </tr>)}</tbody>
          </table>
        </Card>
        <Card>
          <div className="font-semibold mb-4" style={{ color: C.navy, fontSize: 13 }}>Pending boxes by item</div>
          <div className="space-y-3">{rows.map((r) => <div key={r.it.id}>
            <div className="flex justify-between mb-1" style={{ fontSize: 12 }}><Code>{r.it.gd}</Code><span style={{ color: C.muted }}>{r.pending} boxes</span></div>
            <div className="rounded-full" style={{ height: 14, background: C.navyTint, overflow: "hidden" }}><div style={{ width: (r.pending / maxPending) * 100 + "%", height: "100%", background: r.pending ? C.teal : C.border, transition: "width .5s", borderRadius: 99 }} /></div>
          </div>)}</div>
        </Card>
      </div>
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
            <thead><tr style={{ background: C.navy, color: "#fff", textAlign: "left" }}>{["Item", "Boxes", "Cleared PO", "Shipped", "Ship ID", "Invoice", "Container", "Vessel", "BL", "Discharge"].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => { const it = items.find((x) => x.id === r.itemId); return (
              <tr key={i} style={{ background: i % 2 ? C.canvas : "#fff", borderTop: `1px solid ${C.border}` }}>
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
function Documents() {
  const [open, setOpen] = useState("18");
  const groups = [
    { k: "A", t: "Buyer order", docs: [["2A", "Master"], ["2", "Barcode"], ["3", "Packing"], ["4", "Purchase"], ["5", "Sales"], ["6", "Suppliers’ PO"]] },
    { k: "B", t: "Supplier packing", docs: [["7A", "Master"], ["7", "Packing"], ["8", "Purchase"], ["9", "Sales"], ["10", "E-way (inward)"], ["11A", "Delivery order"], ["11", "Delivery instr."]] },
    { k: "C", t: "Pre-shipment", docs: [["12", "Boxes & volume"], ["13", "Export value decl."], ["14", "SCOMET"], ["15", "SDF"], ["16", "RoDTEP"], ["17", "Proforma"], ["18", "Custom invoice"], ["19", "Packing list"], ["20", "Packing itemwise"], ["21", "Packaging decl."], ["22", "Letter to CHA"], ["23", "Supplier details"], ["24", "BL annexure"], ["25", "E-invoice"], ["26", "Shipping instr."], ["27", "VGM"], ["28", "Cost sheets"], ["29", "E-way (export)"]] },
    { k: "D", t: "Post-shipment", docs: [["30", "Letter to buyer"], ["31", "Commercial invoice"], ["32", "Packing"], ["33", "Packaging decl."], ["34", "CWD"]] },
    { k: "E", t: "Reports", docs: [["35", "Costing"], ["36", "Balance, supplier"], ["37", "Balance, item"], ["38", "Supply details"], ["39", "Balance boxes/vol"]] },
    { k: "F", t: "Banking", docs: [["40", "Bill regularisation"]] },
  ];
  const rendered = { "18": 1, "19": 1, "31": 1 };
  return (
    <div className="space-y-5">
      <div><Eyebrow>Stage A–F · Document set</Eyebrow><h2 className="font-bold mt-1" style={{ fontSize: 22, color: C.navy }}>One dataset, every document</h2>
        <p style={{ fontSize: 13, color: C.muted }}>The full export document set, in both variants (customs / INR and buyer / USD). Click one to preview it filled from the shipment.</p></div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "300px 1fr" }}>
        <Card pad={false} style={{ overflow: "hidden", maxHeight: 560, overflowY: "auto" }}>
          {groups.map((g) => (
            <div key={g.k}>
              <div className="px-4 py-2 flex items-center gap-2" style={{ background: C.navy, color: "#fff", position: "sticky", top: 0 }}><span style={{ fontFamily: MONO, color: C.amber, fontWeight: 700, fontSize: 12 }}>{g.k}</span><span style={{ fontSize: 12.5, fontWeight: 600 }}>{g.t}</span></div>
              {g.docs.map(([no, nm]) => { const active = open === no; return <button key={no} onClick={() => setOpen(no)} className="w-full text-left px-4 py-2 flex items-center justify-between transition" style={{ borderTop: `1px solid ${C.border}`, background: active ? C.amberTint : "#fff", cursor: "pointer" }}>
                <span style={{ fontSize: 12.5, color: C.navy }}><Code>{no}</Code> &nbsp;{nm}</span>{rendered[no] ? <Pill tint={active ? "#fff" : C.tealTint} color={C.tealDark}>preview</Pill> : <ChevronRight size={13} color={C.faint} />}</button>; })}
            </div>
          ))}
        </Card>
        <Card>{rendered[open] ? <DocPreview which={open} /> :
          <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: 420, color: C.muted }}><FileText size={34} color={C.faint} /><div className="font-semibold mt-3" style={{ color: C.navy }}>Document {open}</div><div style={{ fontSize: 13, maxWidth: 360 }} className="mt-1">In the full build this is auto-generated from the order and masters, in Excel and PDF. Documents 18, 19 and 31 preview live.</div></div>}</Card>
      </div>
    </div>
  );
}
function DocPreview({ which }) {
  const title = which === "19" ? "Packing list" : which === "31" ? "Commercial invoice (USD)" : "Custom invoice (INR)";
  const usdMode = which === "31";
  const lines = SEED_ITEMS.slice(0, 4).map((it, i) => ({ ...it, qty: [2000, 900, 300, 600][i] }));
  const totBoxes = lines.reduce((s, l) => s + Math.ceil(l.qty / l.packing), 0);
  const totVal = lines.reduce((s, l) => s + l.qty * (usdMode ? l.unitFob100 / 100 : l.unitValue), 0);
  const totNet = lines.reduce((s, l) => s + Math.ceil(l.qty / l.packing) * l.netPerBox, 0);
  return (
    <div style={{ fontSize: 12.5 }}>
      <div className="flex items-start justify-between pb-3" style={{ borderBottom: `2px solid ${C.navy}` }}>
        <div><div className="font-bold" style={{ color: C.navy, fontSize: 16 }}>{SHIPMENT.exporter}</div><div style={{ color: C.muted, fontSize: 11.5 }}>IEC <Code>{SHIPMENT.iec}</Code> · GSTIN <Code>{SHIPMENT.gstin}</Code></div></div>
        <div className="text-right"><div className="font-semibold uppercase" style={{ color: C.amber, fontSize: 11, letterSpacing: 1 }}>{title}</div><div style={{ fontFamily: MONO, color: C.navy, fontSize: 13 }}>{SHIPMENT.invoice}</div><div style={{ color: C.faint, fontSize: 11 }}>{SHIPMENT.date}</div></div>
      </div>
      <div className="grid grid-cols-3 gap-3 py-3" style={{ fontSize: 11.5 }}>
        {[["Buyer", BUYER.name + " (" + BUYER.brand + ")"], ["Container", SHIPMENT.container], ["Vessel", SHIPMENT.vessel], ["Route", SHIPMENT.pol + " → " + SHIPMENT.pod], ["BL", SHIPMENT.bl], ["Marks", SHIPMENT.marks]].map(([k, v]) => <div key={k}><div style={{ color: C.faint }}>{k}</div><div style={{ color: C.ink, fontFamily: /[0-9]/.test(v) && k !== "Buyer" ? MONO : FONT }}>{v}</div></div>)}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: C.navyTint, color: C.navy, textAlign: "left" }}>{["HSN", "Description", "Qty", "Boxes", "Net kg", usdMode ? "Rate $" : "Rate ₹", "Amount"].map((h) => <th key={h} className="px-2 py-1.5 font-semibold" style={{ fontSize: 11 }}>{h}</th>)}</tr></thead>
        <tbody>
          {lines.map((l, i) => { const bx = Math.ceil(l.qty / l.packing); const rate = usdMode ? l.unitFob100 / 100 : l.unitValue; return <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td className="px-2 py-1.5"><Code>{l.hsn}</Code></td><td className="px-2 py-1.5" style={{ color: C.navy }}>{l.description} {l.size}</td><td className="px-2 py-1.5">{l.qty}</td><td className="px-2 py-1.5">{bx}</td><td className="px-2 py-1.5">{num(bx * l.netPerBox)}</td><td className="px-2 py-1.5">{usdMode ? usd(rate) : inr(rate)}</td><td className="px-2 py-1.5" style={{ fontWeight: 600 }}>{usdMode ? usd(l.qty * rate) : inr(l.qty * rate)}</td>
          </tr>; })}
          <tr style={{ background: C.amberTint, fontWeight: 700, color: C.navy }}><td className="px-2 py-2" colSpan={3}>Total · {SHIPMENT.terms}</td><td className="px-2 py-2">{totBoxes}</td><td className="px-2 py-2">{num(totNet)}</td><td className="px-2 py-2"></td><td className="px-2 py-2">{usdMode ? usd(totVal) : inr(totVal)}</td></tr>
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2" style={{ fontSize: 11.5, color: C.teal }}><Check size={14} /> Generated from the order + masters. {usdMode ? "Buyer variant — USD, GD Watermark codes." : "Customs variant — HSN codes, INR values."}</div>
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
  const [receipts, setReceipts] = useState([]);
  const ledger = computeLedger(buyerMaster, receipts, items);
  const nav = [
    { id: "dashboard", label: "Dashboard", sub: "Overview", icon: LayoutDashboard },
    { id: "masters", label: "Masters", sub: "Items · buyer · suppliers", icon: Database },
    { id: "order", label: "Buyer order", sub: "Stage A", icon: ClipboardList },
    { id: "orders", label: "Orders", sub: "Buyer & supplier (7A)", icon: ListOrdered },
    { id: "fifo", label: "Packing & FIFO", sub: "Stage B", icon: PackageCheck },
    { id: "reports", label: "Reports", sub: "Stage E", icon: BarChart3 },
    { id: "history", label: "History", sub: "Shipped from FIFO", icon: History },
    { id: "docs", label: "Documents", sub: "Stage A–F", icon: FileText },
  ];
  return (
    <div style={{ fontFamily: FONT, background: C.canvas, minHeight: "100vh", color: C.ink }}>
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: C.navy, boxShadow: "0 2px 14px rgba(11,44,77,0.16)" }}>
        <div style={{ maxWidth: 2000, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", gap: 18, height: 60 }}>
          <div className="flex items-center gap-2.5" style={{ flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: C.amber, display: "flex", alignItems: "center", justifyContent: "center" }}><Anchor size={18} color={C.navy} strokeWidth={2.6} /></div>
            <div><div style={{ color: "#fff", fontWeight: 700, fontSize: 14, lineHeight: 1 }}>Jaikvin Global</div><div style={{ color: "#8FA6BC", fontSize: 10, letterSpacing: 0.6 }}>EXPORT SYSTEM</div></div>
          </div>
          <nav className="flex items-center gap-1" style={{ flex: 1, overflowX: "auto" }}>
            {nav.map((n) => <NavItem key={n.id} label={n.label} icon={n.icon} active={view === n.id} onClick={() => setView(n.id)} />)}
          </nav>
          <div style={{ flexShrink: 0 }}><Pill tint={C.amberTint} color={C.amberDark}>R1 · working prototype</Pill></div>
        </div>
      </header>
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 2000, margin: "0 auto", padding: "9px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: C.muted }}><Ship size={15} color={C.teal} /> Shipment in flight: <Code>{SHIPMENT.invoice}</Code><span style={{ color: C.border }}>|</span><Code>{SHIPMENT.container}</Code> · {SHIPMENT.pol} → {SHIPMENT.pod}</div>
          <div style={{ fontSize: 11.5, color: C.faint }}>Sample data · mirrors the Next.js + Python + Neon build</div>
        </div>
      </div>
      <main>
        <div style={{ padding: 28, maxWidth: 2000, margin: "0 auto" }}>
          {view === "dashboard" && <Dashboard ledger={ledger} shipments={SHIPMENTS} items={items} go={setView} />}
          {view === "masters" && <Masters items={items} setItems={setItems} />}
          {view === "order" && <BuyerOrder items={items} buyerMaster={buyerMaster} setBuyerMaster={setBuyerMaster} />}
          {view === "orders" && <Orders buyerMaster={buyerMaster} />}
          {view === "fifo" && <PackingFIFO items={items} buyerMaster={buyerMaster} receipts={receipts} setReceipts={setReceipts} />}
          {view === "reports" && <Reports items={items} buyerMaster={buyerMaster} receipts={receipts} />}
          {view === "history" && <HistoryView items={items} shipments={SHIPMENTS} />}
          {view === "docs" && <Documents />}
        </div>
      </main>
    </div>
  );
}
