import { useState, useMemo } from "react";
import {
  Plus, Download, ClipboardList, Layers, Truck, Search, Check, ChevronRight, Calendar,
} from "lucide-react";
import { useApp } from "../store.jsx";
import Rail from "../Rail.jsx";
import {
  Card, CardHead, Btn, Seg, Field, Input, Select, Pill, Mono, DataTable, Modal, Drawer, Step,
  Empty, Note, Info, FormulaPanel, SearchInput,
} from "../ui.jsx";
import {
  TODAY, dmy, num, inr, usd, usdp, deriveBuyer, buildSupplierMaster, buildPoList,
  downloadCSV, BM_HEAD, bmRaw, SM7_HEAD, sm7Raw, BUYER_FORMULAS, SUPPLIER_FORMULAS,
} from "../data.js";

/* ============================================================
   Orders — one page for "what the buyer asked for".
   Default tab is By PO because that is the question people actually ask:
   "what's still owed on order 03455?"
   ============================================================ */

/* --- Progress bar used in the PO list --- */
const Progress = ({ done, total }) => {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="row" style={{ gap: 8, minWidth: 150 }}>
      <span style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: pct + "%", borderRadius: 99, background: pct === 100 ? "var(--green)" : "var(--amber)" }} />
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 650, color: pct === 100 ? "var(--green-ink)" : "var(--muted)", minWidth: 34, textAlign: "right" }}>{pct}%</span>
    </span>
  );
};

/* ============================================================
   Guided "New buyer order" sheet
   ============================================================ */
function NewOrderDrawer({ onClose }) {
  const { items, buyers, buyerMaster, setBuyerMaster, suppliersForItem, toast } = useApp();
  const [rbi, setRbi] = useState("83.50");
  const [po, setPo] = useState("03540");
  const [date, setDate] = useState(TODAY);
  const [buyerId, setBuyerId] = useState(buyers[0].id);
  const [qtys, setQtys] = useState({});
  const [q, setQ] = useState("");

  const sorted = [...items].sort((a, b) => a.gd.localeCompare(b.gd));
  const shown = sorted.filter((it) => !q.trim() || (it.gd + it.code + it.description).toLowerCase().includes(q.trim().toLowerCase()));
  const setQty = (k, v) => setQtys((p) => ({ ...p, [k]: v }));

  const rows = [];
  sorted.forEach((it) => suppliersForItem(it).forEach((sp) => {
    const k = it.id + "|" + sp.id, qty = Number(qtys[k]) || 0;
    if (qty > 0) { const boxes = Math.ceil(qty / it.packing) || 0; rows.push({ key: k, it, sp, qty, boxes, volume: boxes * it.volume, value: it.unitValue * qty, fob: (qty * it.unitFob100) / 100 }); }
  }));
  const t = rows.reduce((a, r) => ({ boxes: a.boxes + r.boxes, volume: a.volume + r.volume, value: a.value + r.value, fob: a.fob + r.fob }), { boxes: 0, volume: 0, value: 0, fob: 0 });

  const save = () => {
    if (!rows.length) return;
    const added = rows.map((r, n) => ({ id: "r" + Date.now() + "_" + n, date, po, buyerId, itemId: r.it.id, qty: r.qty, rbi: Number(rbi), item: { ...r.it, supplierId: r.sp.id } }));
    setBuyerMaster([...added, ...buyerMaster]);
    toast(`Order ${po} added — ${rows.length} line${rows.length === 1 ? "" : "s"}, ${t.boxes} boxes`);
    onClose();
  };

  return (
    <Drawer title="New buyer order" subtitle="Three steps. Everything else is worked out for you." icon={ClipboardList} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {rows.length ? <>{rows.length} line{rows.length === 1 ? "" : "s"} · <b style={{ color: "var(--ink)" }}>{t.boxes} boxes</b> · {num(t.volume, 3)} m³ · {usd(t.fob)}</> : "Type a quantity to begin"}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!rows.length} onClick={save}>Add {rows.length || ""} line{rows.length === 1 ? "" : "s"} to order</Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <Step n="1" title="Who is this order for?" hint="Buyer, PO number, order date and the day’s RBI rate." />
          <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1.4fr) repeat(3, minmax(0,1fr))" }}>
            <Field label="Buyer"><Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>{buyers.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.brand}</option>)}</Select></Field>
            <Field label="PO number"><Input value={po} onChange={(e) => setPo(e.target.value)} /></Field>
            <Field label="Order date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="RBI rate ₹/$" hint="The Reserve Bank reference rate on the order date. Used to convert the FOB value into rupees for the customs paperwork.">
              <Input className="rate" type="number" value={rbi} onChange={(e) => setRbi(e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <Step n="2" title="How many pieces, from which supplier?" hint="Leave a box empty to skip that supplier." />
            <div style={{ width: 240, marginBottom: 10 }}><SearchInput value={q} onChange={setQ} placeholder="Find an item…" /></div>
          </div>
          <Card>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {shown.map((it, i) => (
                <div key={it.id} style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <Mono>{it.gd}</Mono>
                    <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>{it.description}</span>
                    <span className="grow" />
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>{it.packing} pcs / box</span>
                  </div>
                  <div className="stack-sm">
                    {suppliersForItem(it).map((sp, si) => {
                      const k = it.id + "|" + sp.id;
                      const qty = Number(qtys[k]) || 0;
                      return (
                        <div key={k} className="row" style={{ justifyContent: "space-between" }}>
                          <span className="row" style={{ minWidth: 0, gap: 8 }}>
                            <Pill tone={si ? "" : "teal"}>{sp.code}</Pill>
                            <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.name}</span>
                          </span>
                          <span className="row" style={{ gap: 8 }}>
                            {qty > 0 && <span style={{ fontSize: 11.5, color: "var(--teal-ink)", fontWeight: 600 }}>= {Math.ceil(qty / it.packing)} boxes</span>}
                            <Input className={`input-sm num-in${qty ? " filled" : ""}`} style={{ width: 118 }} type="number" min="0" placeholder="0"
                              value={qtys[k] || ""} onChange={(e) => setQty(k, e.target.value)} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!shown.length && <Empty icon={Search} title="No item matches">Try the GD code, the item code, or part of the description.</Empty>}
            </div>
          </Card>
        </section>

        <section>
          <Step n="3" title="Check the summary" hint="Boxes, volume and value update as you type." />
          {rows.length ? (
            <Card>
              <DataTable
                columns={[
                  { key: "gd", label: "GD code", render: (r) => <Mono>{r.it.gd}</Mono> },
                  { key: "sp", label: "Supplier", render: (r) => <Pill>{r.sp.code}</Pill> },
                  { key: "qty", label: "Pieces", align: "r", render: (r) => r.qty.toLocaleString("en-IN") },
                  { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
                  { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
                  { key: "val", label: "Cost ₹", align: "r", render: (r) => inr(r.value) },
                  { key: "fob", label: "FOB $", align: "r", render: (r) => usd(r.fob) },
                ]}
                rows={rows} rowKey={(r) => r.key}
                footer={[{ v: `Total · ${rows.length} line(s)`, span: 2 }, { v: rows.reduce((s, r) => s + r.qty, 0).toLocaleString("en-IN"), align: "r" }, { v: t.boxes, align: "r" }, { v: num(t.volume, 3), align: "r" }, { v: inr(t.value), align: "r" }, { v: usd(t.fob), align: "r" }]}
              />
            </Card>
          ) : (
            <Card><Empty icon={ClipboardList} title="Nothing entered yet">Type a quantity above and the line appears here, with boxes and value already calculated.</Empty></Card>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/* ============================================================
   PO detail modal
   ============================================================ */
function PoModal({ po, onClose }) {
  const { supCode, buyerById } = useApp();
  return (
    <Modal title={`Purchase order ${po.po}`} icon={ClipboardList} onClose={onClose} width={880}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{buyerById(po.buyerId).name} · ordered {dmy(po.date)} · {po.completed}/{po.ordered} boxes received</span>
        <Btn variant="teal" size="sm" icon={Download} onClick={() => downloadCSV(`PO_${po.po}.csv`, BM_HEAD, po.rows.map(bmRaw))}>Download this PO</Btn>
      </>}>
      <DataTable
        columns={[
          { key: "gd", label: "Item", render: (d) => <span><Mono>{d.it.gd}</Mono> <span style={{ color: "var(--ink)" }}>{d.it.description}</span></span> },
          { key: "sp", label: "Supplier", render: (d) => <Pill>{supCode(d.supplierId)}</Pill> },
          { key: "qty", label: "Pieces", align: "r", render: (d) => d.qty.toLocaleString("en-IN") },
          { key: "vol", label: "Volume m³", align: "r", render: (d) => num(d.volume, 3) },
          { key: "ord", label: "Boxes", align: "r", strong: true, render: (d) => d.ordered },
          { key: "rec", label: "Received", align: "r", render: (d) => <span style={{ color: "var(--ink)" }}>{d.completed}</span> },
          { key: "pen", label: "Pending", align: "r", render: (d) => <span style={{ fontWeight: 700, color: d.pending ? "var(--amber-ink)" : "var(--green-ink)" }}>{d.pending}</span> },
          { key: "rate", label: "Buyer rate ₹", align: "r", render: (d) => num(d.rate) },
        ]}
        rows={po.detail} rowKey={(d, i) => i}
        footer={[{ v: "Total", span: 2 }, { v: po.detail.reduce((s, d) => s + d.qty, 0).toLocaleString("en-IN"), align: "r" }, { v: num(po.volume, 3), align: "r" }, { v: po.ordered, align: "r" }, { v: po.completed, align: "r" }, { v: po.pending, align: "r" }, { v: "" }]}
      />
    </Modal>
  );
}

/* ============================================================
   Buyer order lines — Simple (9 cols) vs Full sheet (25 cols)
   ============================================================ */
function orderLineColumns(full) {
  if (!full) return [
    { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.date)}</span> },
    { key: "po", label: "PO", render: (r) => <Mono>{r.po}</Mono> },
    { key: "gd", label: "GD code", render: (r) => <Mono>{r.item.gd}</Mono> },
    { key: "desc", label: "Description", render: (r) => <span style={{ color: "var(--ink)" }}>{r.item.description}</span> },
    { key: "qty", label: "Pieces", align: "r", render: (r) => r.qty.toLocaleString("en-IN") },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => deriveBuyer(r.item, r.qty, r.rbi).boxes },
    { key: "vol", label: "Volume m³", align: "r", render: (r) => num(deriveBuyer(r.item, r.qty, r.rbi).volTotal, 3) },
    { key: "inr", label: "Total ₹", align: "r", render: (r) => inr(deriveBuyer(r.item, r.qty, r.rbi).totalValueINR) },
    { key: "usd", label: "Total $", align: "r", render: (r) => usd(deriveBuyer(r.item, r.qty, r.rbi).totalFobUSD) },
  ];
  const F = (r) => deriveBuyer(r.item, r.qty, r.rbi);
  return [
    { key: "date", w: 104, render: (r) => dmy(r.date), label: "Date" },
    { key: "po", w: 64, label: "PO", render: (r) => <Mono>{r.po}</Mono> },
    { key: "code", w: 74, label: "Code", render: (r) => <Mono>{r.item.code}</Mono> },
    { key: "gd", w: 88, label: "GD", render: (r) => <Mono>{r.item.gd}</Mono> },
    { key: "size", label: "Size", render: (r) => r.item.size },
    { key: "len", label: "Len", render: (r) => r.item.length },
    { key: "pack", label: "Pack", align: "r", render: (r) => r.item.packing },
    { key: "desc", label: "Description", render: (r) => r.item.description },
    { key: "bar", label: "Barcode", render: (r) => <Mono>{r.item.barcode}</Mono> },
    { key: "hsn", label: "HSN", render: (r) => <Mono>{r.item.hsn}</Mono> },
    { key: "qty", label: "Qty", align: "r", render: (r) => r.qty.toLocaleString("en-IN") },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => F(r).boxes },
    { key: "vol", label: "Vol m³", align: "r", render: (r) => num(F(r).volTotal, 3) },
    { key: "net", label: "Net kg", align: "r", render: (r) => num(F(r).netTotal) },
    { key: "gross", label: "Gross kg", align: "r", render: (r) => num(F(r).grossTotal) },
    { key: "stk", label: "Stk/box", align: "r", render: (r) => num(F(r).stickersPerBox) },
    { key: "lab", label: "Labels", align: "r", render: (r) => Math.round(F(r).labels) },
    { key: "sheets", label: "Sheets", align: "r", render: (r) => F(r).sheets },
    { key: "unit", label: "Unit ₹", align: "r", render: (r) => inr(r.item.unitValue) },
    { key: "tinr", label: "Total ₹", align: "r", render: (r) => inr(F(r).totalValueINR) },
    { key: "fob100", label: "FOB/100 $", align: "r", render: (r) => usd(r.item.unitFob100) },
    { key: "tusd", label: "Total $", align: "r", render: (r) => usd(F(r).totalFobUSD) },
    { key: "rbi", label: "RBI", align: "r", render: (r) => num(r.rbi) },
    { key: "rbiref", label: "RBI ref ₹", align: "r", render: (r) => inr(F(r).rbiRefINR) },
    { key: "rate", label: "Rate ₹", align: "r", render: (r) => num(F(r).rate) },
  ];
}

function supplierColumns(full, rbi) {
  if (!full) return [
    { key: "sr", label: "Carton range", render: (g) => <Mono>{g.sr}</Mono> },
    { key: "po", label: "PO(s)", render: (g) => <Mono>{g.po}</Mono> },
    { key: "gd", label: "GD code", render: (g) => <Mono>{g.it.gd}</Mono> },
    { key: "desc", label: "Description", render: (g) => <span style={{ color: "var(--ink)" }}>{g.it.description}</span> },
    { key: "qty", label: "Pieces", align: "r", render: (g) => g.qty.toLocaleString("en-IN") },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (g) => g.boxes },
    { key: "stk", label: "Barcode stickers", align: "r", render: (g) => g.barcodeStickers.toLocaleString("en-IN") },
    { key: "cost", label: "Total cost ₹", align: "r", render: (g) => inr(g.totalCost) },
    { key: "fob", label: "Total FOB $", align: "r", render: (g) => usd(g.totalFobPc) },
  ];
  return [
    { key: "sr", w: 96, label: "Sr no", render: (g) => <Mono>{g.sr}</Mono> },
    { key: "po", w: 72, label: "PO", render: (g) => <Mono>{g.po}</Mono> },
    { key: "code", w: 74, label: "Code", render: (g) => <Mono>{g.it.code}</Mono> },
    { key: "gd", w: 88, label: "GD", render: (g) => <Mono>{g.it.gd}</Mono> },
    { key: "oswin", label: "OSWIN", render: (g) => <Mono>{g.it.oswin}</Mono> },
    { key: "gl", label: "GL", render: (g) => <Mono>{g.it.gl}</Mono> },
    { key: "size", label: "Size", render: (g) => g.it.size },
    { key: "len", label: "Len", render: (g) => g.it.length },
    { key: "pack", label: "Packing", align: "r", render: (g) => g.it.packing + " / box" },
    { key: "desc", label: "Description", render: (g) => g.it.description },
    { key: "bar", label: "Bar code", render: (g) => <Mono>{g.it.barcode}</Mono> },
    { key: "hsn", label: "HSN", render: (g) => <Mono>{g.it.hsn}</Mono> },
    { key: "qty", label: "Qty", align: "r", strong: true, render: (g) => g.qty.toLocaleString("en-IN") },
    { key: "box", label: "Box", align: "r", strong: true, render: (g) => g.boxes },
    { key: "vb", label: "Vol/box", align: "r", render: (g) => num(g.it.volume, 3) },
    { key: "tv", label: "Total vol", align: "r", render: (g) => num(g.totalVol, 3) },
    { key: "bg", label: "BG", align: "r", render: (g) => g.bg },
    { key: "pc", label: "PC", align: "r", render: (g) => g.pc },
    { key: "ttl", label: "TTL", align: "r", render: (g) => g.ttl },
    { key: "stk", label: "Barcode stk", align: "r", render: (g) => g.barcodeStickers },
    { key: "sheets", label: "Sheets", align: "r", render: (g) => g.sheets },
    { key: "cpu", label: "Cost/unit ₹", align: "r", render: (g) => inr(g.costPerUnit) },
    { key: "tc", label: "Total cost ₹", align: "r", render: (g) => inr(g.totalCost) },
    { key: "fpc", label: "FOB/pc $", align: "r", render: (g) => usdp(g.unitFobPc) },
    { key: "tfob", label: "Total FOB $", align: "r", render: (g) => usd(g.totalFobPc) },
    { key: "rbi", label: "RBI", align: "r", render: () => num(rbi) },
    { key: "rref", label: "RBI ref ₹", align: "r", render: (g) => inr(g.rbiRefCost) },
    { key: "rate", label: "Rate ₹", align: "r", render: (g) => num(g.rate) },
  ];
}

/* ============================================================ */
export default function Orders({ go }) {
  const { items, buyers, suppliers, buyerMaster, receipts, supCode, buyerById } = useApp();
  const [tab, setTab] = useState("po");
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [selPo, setSelPo] = useState(null);

  const [from, setFrom] = useState("2025-01-01");
  const [to, setTo] = useState(TODAY);
  const [sup, setSup] = useState(suppliers[0].id);
  const [supRbi, setSupRbi] = useState("83.50");

  const poList = useMemo(() => buildPoList(buyerMaster, items, receipts), [buyerMaster, items, receipts]);
  const lines = useMemo(() => buyerMaster.filter((r) => r.date >= from && r.date <= to).sort((a, b) => new Date(b.date) - new Date(a.date)), [buyerMaster, from, to]);
  const sm = useMemo(() => buildSupplierMaster(buyerMaster, sup, from, to, supRbi), [buyerMaster, sup, from, to, supRbi]);

  const viewToggle = <Seg options={[["simple", "Simple"], ["full", "Full sheet"]]} value={full ? "full" : "simple"} onChange={(v) => setFull(v === "full")} />;

  return (
    <div className="stack">
      <Rail view="orders" go={go} />

      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Purchase Orders</h2>
          <p className="sub">Everything the buyer has asked for. Enter an order once — boxes, volume, labels, sheets and value are derived from the item master, so nothing is typed twice.</p>
        </div>
        <Btn size="lg" icon={Plus} onClick={() => setDrawer(true)}>New buyer order</Btn>
      </div>

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <Seg
          options={[["po", "By purchase order", ClipboardList], ["lines", "Order lines", Layers], ["supplier", "Supplier summary", Truck]]}
          value={tab} onChange={setTab}
        />
        {tab !== "po" && viewToggle}
      </div>

      {/* ---------- By PO ---------- */}
      {tab === "po" && (
        <>
          {!poList.length ? (
            <Card><Empty icon={ClipboardList} title="No purchase orders yet" action={<Btn icon={Plus} onClick={() => setDrawer(true)}>New buyer order</Btn>}>Add the first buyer order and it will appear here with its live delivery status.</Empty></Card>
          ) : (
            <Card>
              <CardHead icon={ClipboardList} title={`${poList.length} purchase order${poList.length === 1 ? "" : "s"}`}>
                <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row for item-wise detail</span>
              </CardHead>
              <DataTable
                onRowClick={setSelPo}
                columns={[
                  { key: "po", label: "PO", render: (p) => <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>{p.po}</span> },
                  { key: "date", label: "Ordered", render: (p) => <span style={{ color: "var(--muted)" }}>{dmy(p.date)}</span> },
                  { key: "buyer", label: "Buyer", render: (p) => buyerById(p.buyerId).brand },
                  { key: "prog", label: "Delivered", render: (p) => <Progress done={p.completed} total={p.ordered} /> },
                  { key: "pen", label: "Boxes pending", align: "r", render: (p) => <span style={{ fontWeight: 700, color: p.pending ? "var(--amber-ink)" : "var(--green-ink)" }}>{p.pending || "—"}</span> },
                  { key: "done", label: "Received", align: "r", render: (p) => <span>{p.completed} <span style={{ color: "var(--faint)" }}>/ {p.ordered}</span></span> },
                  { key: "sup", label: "Suppliers", render: (p) => <span className="row" style={{ gap: 4 }}>{p.suppliers.map((s) => <Pill key={s}>{supCode(s)}</Pill>)}</span> },
                  { key: "vol", label: "Volume m³", align: "r", render: (p) => num(p.volume, 3) },
                  { key: "go", label: "", align: "r", render: () => <ChevronRight size={15} style={{ color: "var(--faint)" }} /> },
                ]}
                rows={poList} rowKey={(p) => p.po}
              />
              <div className="card-foot">
                <Note tone="teal">Deliveries recorded in <b>Packing</b> flow straight into this table. Boxes always clear the <b>oldest open order first</b> — you never choose which PO gets filled.</Note>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ---------- Order lines (2A buyer master) ---------- */}
      {tab === "lines" && (
        <>
          <Card pad>
            <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
              <Field label="Buyer" style={{ minWidth: 220 }}><Select disabled><option>{buyers[0].name} ({buyers[0].brand})</option></Select></Field>
              <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              <Pill tone="teal"><Calendar size={12} /> {new Set(lines.map((r) => r.date)).size} order date(s)</Pill>
              <span className="grow" />
              <Btn variant="teal" icon={Download} disabled={!lines.length} onClick={() => downloadCSV(`Buyer_Master_${from}_to_${to}.csv`, BM_HEAD, lines.map(bmRaw))}>Download buyer master</Btn>
            </div>
          </Card>
          <Card>
            <CardHead icon={Layers} title={full ? "Buyer master · full sheet (2A)" : "Buyer master · the columns you actually read"}>
              <Info>The full sheet is the 25-column 2A master your team already uses. The simple view hides the derived columns — they are all still exported in the download.</Info>
            </CardHead>
            {lines.length
              ? <DataTable columns={orderLineColumns(full)} rows={lines} rowKey={(r) => r.id} freeze={full ? 4 : 0} maxHeight={480} />
              : <Empty icon={Layers} title="No order lines in this date range">Widen the dates, or add a new buyer order.</Empty>}
          </Card>
          <FormulaPanel title="How are boxes, labels and value calculated?" rows={BUYER_FORMULAS}
            intro="These depend on the order quantity and the day’s RBI rate, so they are computed per order — never stored on the item. Change a formula here if the logic ever changes." />
        </>
      )}

      {/* ---------- Supplier summary (7A) ---------- */}
      {tab === "supplier" && (
        <>
          <Card pad>
            <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
              <Field label="Supplier" style={{ minWidth: 240 }}><Select value={sup} onChange={(e) => setSup(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</Select></Field>
              <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              <Field label="Today’s ₹ per $" hint="Used to price this supplier summary in rupees. Independent of the rate stored on each order."><Input className="rate" style={{ width: 130 }} type="number" value={supRbi} onChange={(e) => setSupRbi(e.target.value)} /></Field>
              <span className="grow" />
              <Btn variant="teal" icon={Download} disabled={!sm.length} onClick={() => downloadCSV(`Supplier_Master_7A_${supCode(sup)}_${from}_to_${to}.csv`, SM7_HEAD, sm.map((g) => sm7Raw(g, supRbi)))}>Download 7A master</Btn>
            </div>
            <div style={{ marginTop: 12 }}>
              <Note tone="teal">Every PO for the same item is added together, and carton serial numbers are allocated as one continuous range — so the supplier gets a single, unambiguous sheet.</Note>
            </div>
          </Card>
          <Card>
            <CardHead icon={Truck} title={`${sm.length} item${sm.length === 1 ? "" : "s"} for ${supCode(sup)}`} />
            {sm.length
              ? <DataTable columns={supplierColumns(full, supRbi)} rows={sm} rowKey={(g, i) => i} freeze={full ? 4 : 0} maxHeight={480} />
              : <Empty icon={Truck} title="No orders for this supplier in the range">Pick another supplier or widen the dates.</Empty>}
          </Card>
          <FormulaPanel title="How is the 7A supplier sheet built?" rows={SUPPLIER_FORMULAS}
            intro="The PO comes from the buyer order; the day’s ₹/$ rate is set above. Everything else derives from the item master." />
        </>
      )}

      {drawer && <NewOrderDrawer onClose={() => setDrawer(false)} />}
      {selPo && <PoModal po={selPo} onClose={() => setSelPo(null)} />}
    </div>
  );
}
