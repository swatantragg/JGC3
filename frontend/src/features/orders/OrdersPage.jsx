import { useMemo, useState } from "react";
import {
  Plus, ClipboardList, Layers, Truck, Check, ChevronRight, Calendar, Boxes,
  Pencil, Trash2, Download,
} from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Field, Input, Select, Pill, Mono, DataTable, Modal,
  Empty, Note, Info, Spinner, ErrorState, FormulaPanel,
} from "../../components/ui/index.jsx";
import {
  usePoList, usePoMutations, useSuppliers, useBuyers, useItemDetail,
  useOrderLines, useSupplierMaster, useMasterFormulas, useOrderMaster,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { dmy, num, inr, usd, usdp, todayISO } from "../../lib/format.js";
import { downloadCSV } from "../../lib/download.js";
import NewOrderDrawer from "./NewOrderDrawer.jsx";

/* Purchase Orders — everything the buyer has asked for.

   Four views of the same order book: by PO (what is still owed on 03455?),
   by item (the 37 order-detail sheet), the 2A order lines, and the 7A
   supplier summary. Every derived figure comes from /api/masters, so this
   page and the masters can never disagree. */

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

/* ---------- PO detail ---------- */
function PoModal({ po, onClose, onEdit }) {
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const master = useOrderMaster(po.po);
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const buyer = buyers.find((b) => b.id === po.buyer_id);
  const rows = master.data?.rows || [];
  const t = master.data?.totals || {};

  return (
    <Modal title={`Purchase order ${po.po}`} icon={ClipboardList} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {buyer?.name || "—"} · ordered {dmy(po.date)} · {po.completed}/{po.ordered} boxes received
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Edit / delete</Btn>
          <Btn variant="teal" size="sm" icon={Download} disabled={!rows.length}
            onClick={() => downloadCSV(`PO_${po.po}.csv`, MASTER_HEAD, rows.map((r) => masterRow(r, supCode)))}>
            Download
          </Btn>
        </div>
      </>}>
      {master.isLoading ? <Spinner label="Working out the order…" /> : (
        <DataTable serial
          freeze={5}
          columns={[
            { key: "sr", w: 104, label: "Carton range", render: (r) => <Mono>{r.serial}</Mono> },
            { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
            { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code}</Mono> },
            { key: "desc", w: 210, label: "Description", strong: true, render: (r) => <span style={{ whiteSpace: "pre-line" }}>{r.description}</span> },
            { key: "sp", w: 92, label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
            { key: "qty", label: "Pieces", align: "r", render: (r) => num(r.qty, 0) },
            { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
            { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.vol_total, 3) },
            { key: "net", label: "Nett kg", align: "r", render: (r) => num(r.net_total, 2) },
            { key: "sheets", label: "Label sheets", align: "r", render: (r) => r.sheets },
            { key: "val", label: "Cost ₹", align: "r", render: (r) => inr(r.total_value_inr) },
            { key: "fob", label: "FOB $", align: "r", render: (r) => usd(r.total_fob_usd) },
          ]}
          rows={rows} rowKey={(r) => r.item_id + r.line_id}
          footer={[
            { v: "Total", span: 5 }, { v: num(t.qty || 0, 0), align: "r" }, { v: t.boxes, align: "r" },
            { v: num(t.vol_total, 3), align: "r" }, { v: num(t.net_total, 2), align: "r" },
            { v: Math.round(t.sheets || 0), align: "r" }, { v: inr(t.total_value_inr), align: "r" },
            { v: usd(t.total_fob_usd), align: "r" },
          ]}
        />
      )}
    </Modal>
  );
}

/* ---------- Edit / delete a purchase order ---------- */
function PoEditModal({ po, onClose }) {
  const { update, remove } = usePoMutations();
  const toast = useToast();
  const [poNo, setPoNo] = useState(po.po);
  const [qty, setQty] = useState(() => Object.fromEntries(po.detail.map((d) => [d.line_id || d.item_id, d.qty])));
  const [confirm, setConfirm] = useState(false);

  const save = () => update.mutate(
    { po: po.po, body: { po: poNo, lines: po.detail.map((d) => ({ id: d.line_id, qty: Number(qty[d.line_id || d.item_id]) || 0 })) } },
    { onSuccess: () => { toast(`PO ${poNo} updated`); onClose(); } },
  );
  const del = () => remove.mutate(po.po, { onSuccess: () => { toast(`PO ${po.po} deleted`); onClose(); } });

  return (
    <Modal title={`Edit purchase order ${po.po}`} icon={Pencil} onClose={onClose}
      footer={<>
        {confirm
          ? <span className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--amber-ink)" }}>Delete PO {po.po} and all its lines?</span>
            <Btn variant="danger" size="sm" icon={Trash2} onClick={del}>Confirm delete</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep</Btn>
          </span>
          : <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Delete PO</Btn>}
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} disabled={update.isPending} onClick={save}>Save changes</Btn>
        </div>
      </>}>
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="PO number"><Input value={poNo} onChange={(e) => setPoNo(e.target.value)} /></Field>
      </div>
      <table className="tbl">
        <thead><tr><th>Item</th><th className="r">Pieces</th></tr></thead>
        <tbody>
          {po.detail.map((d) => {
            const k = d.line_id || d.item_id;
            return (
              <tr key={k}>
                <td><Mono>{d.gd}</Mono> <span style={{ color: "var(--ink)" }}>{d.description}</span></td>
                <td className="r">
                  <Input className="input-sm num-in" style={{ width: 110 }} type="number" min="0"
                    value={qty[k] ?? ""} onChange={(e) => setQty((p) => ({ ...p, [k]: e.target.value }))} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}

/* ---------- CSV shape shared by the PO / order-line downloads ---------- */
const MASTER_HEAD = ["Carton range", "PO", "Date", "Code", "GD", "OSWIN", "GL", "Size", "Length", "Packing",
  "Description", "Bar code", "HSN", "Supplier", "Qty", "Boxes", "Vol/box", "Total vol m³", "Nett/box",
  "Gross/box", "Total nett kg", "Total gross kg", "Stk/box", "Labels", "Sheets", "Unit ₹", "Total ₹",
  "FOB unit $", "Total FOB $", "RBI", "RBI ref ₹", "Rate ₹"];
const masterRow = (r, supCode) => [r.serial || "", r.po || "", r.date || "", r.code, r.gd, r.oswin, r.gl,
  r.size, r.length, r.packing, r.description, r.barcode, r.hsn, supCode(r.supplier_id), r.qty, r.boxes,
  r.vol_per_box, r.vol_total.toFixed(3), r.net_per_box, r.gross_per_box, r.net_total.toFixed(2),
  r.gross_total.toFixed(2), r.stickers_per_box, Math.round(r.labels), r.sheets, r.unit_value,
  r.total_value_inr.toFixed(2), r.unit_fob, r.total_fob_usd.toFixed(2), r.rbi, r.rbi_ref_inr.toFixed(2),
  r.rate.toFixed(3)];

/* ---------- Order lines · Simple vs Full sheet ---------- */
function orderLineColumns(full, supCode) {
  if (!full) {
    return [
      { key: "date", w: 106, label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.date)}</span> },
      { key: "po", w: 84, label: "PO", render: (r) => <Mono>{r.po}</Mono> },
      { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
      { key: "desc", w: 220, label: "Description", render: (r) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{r.description}</span> },
      { key: "sp", w: 90, label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
      { key: "qty", label: "Pieces", align: "r", render: (r) => num(r.qty, 0) },
      { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
      { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.vol_total, 3) },
      { key: "inr", label: "Total ₹", align: "r", render: (r) => inr(r.total_value_inr) },
      { key: "usd", label: "Total $", align: "r", render: (r) => usd(r.total_fob_usd) },
    ];
  }
  return [
    { key: "date", w: 106, label: "Date", render: (r) => dmy(r.date) },
    { key: "po", w: 78, label: "PO", render: (r) => <Mono>{r.po}</Mono> },
    { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code}</Mono> },
    { key: "gd", w: 96, label: "GD", render: (r) => <Mono>{r.gd}</Mono> },
    { key: "sp", w: 88, label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
    { key: "size", label: "Size", render: (r) => r.size },
    { key: "len", label: "Len", render: (r) => r.length },
    { key: "pack", label: "Pack", align: "r", render: (r) => r.packing },
    { key: "desc", label: "Description", render: (r) => <span style={{ whiteSpace: "pre-line" }}>{r.description}</span> },
    { key: "bar", label: "Barcode", render: (r) => <Mono>{r.barcode}</Mono> },
    { key: "hsn", label: "HSN", render: (r) => <Mono>{r.hsn}</Mono> },
    { key: "qty", label: "Qty", align: "r", render: (r) => num(r.qty, 0) },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
    { key: "vol", label: "Vol m³", align: "r", render: (r) => num(r.vol_total, 3) },
    { key: "net", label: "Net kg", align: "r", render: (r) => num(r.net_total) },
    { key: "gross", label: "Gross kg", align: "r", render: (r) => num(r.gross_total) },
    { key: "stk", label: "Stk/box", align: "r", render: (r) => num(r.stickers_per_box, 1) },
    { key: "lab", label: "Labels", align: "r", render: (r) => Math.round(r.labels) },
    { key: "sheets", label: "Sheets", align: "r", render: (r) => r.sheets },
    { key: "unit", label: "Unit ₹", align: "r", render: (r) => inr(r.unit_value) },
    { key: "tinr", label: "Total ₹", align: "r", render: (r) => inr(r.total_value_inr) },
    { key: "fobu", label: "FOB unit $", align: "r", render: (r) => `${usdp(r.unit_fob)}${r.fob_mode === "100" ? "/100" : "/pc"}` },
    { key: "tusd", label: "Total $", align: "r", render: (r) => usd(r.total_fob_usd) },
    { key: "rbi", label: "RBI", align: "r", render: (r) => num(r.rbi) },
    { key: "rbiref", label: "RBI ref ₹", align: "r", render: (r) => inr(r.rbi_ref_inr) },
    { key: "rate", label: "Rate ₹", align: "r", render: (r) => num(r.rate, 3) },
  ];
}

function supplierColumns(full, supCode, showSupplier) {
  const supCol = showSupplier
    ? [{ key: "sp", w: 92, label: "Supplier", render: (g) => <Pill>{supCode(g.supplier_id)}</Pill> }]
    : [];
  if (!full) {
    return [
      { key: "sr", w: 104, label: "Carton range", render: (g) => <Mono>{g.serial}</Mono> },
      ...supCol,
      { key: "po", w: 96, label: "PO(s)", render: (g) => <Mono>{g.po}</Mono> },
      { key: "gd", w: 96, label: "GD code", render: (g) => <Mono>{g.gd}</Mono> },
      { key: "desc", w: 220, label: "Description", render: (g) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{g.description}</span> },
      { key: "qty", w: 96, label: "Pieces", align: "r", render: (g) => num(g.qty, 0) },
      { key: "boxes", label: "Boxes", align: "r", strong: true, render: (g) => g.boxes },
      { key: "stk", label: "Barcode stickers", align: "r", render: (g) => Math.round(g.labels).toLocaleString("en-IN") },
      { key: "cost", label: "Total cost ₹", align: "r", render: (g) => inr(g.total_value_inr) },
      { key: "fob", label: "Total FOB $", align: "r", render: (g) => usd(g.total_fob_usd) },
    ];
  }
  return [
    { key: "sr", w: 104, label: "Carton range", render: (g) => <Mono>{g.serial}</Mono> },
    ...supCol,
    { key: "po", w: 92, label: "PO", render: (g) => <Mono>{g.po}</Mono> },
    { key: "code", w: 92, label: "Code", render: (g) => <Mono>{g.code}</Mono> },
    { key: "gd", w: 96, label: "GD", render: (g) => <Mono>{g.gd}</Mono> },
    { key: "oswin", w: 108, label: "OSWIN", render: (g) => <Mono>{g.oswin}</Mono> },
    { key: "gl", label: "GL", render: (g) => <Mono>{g.gl}</Mono> },
    { key: "size", label: "Size", render: (g) => g.size },
    { key: "len", label: "Len", render: (g) => g.length },
    { key: "pack", label: "Packing", align: "r", render: (g) => `${g.packing} / box` },
    { key: "desc", label: "Description", render: (g) => <span style={{ whiteSpace: "pre-line" }}>{g.description}</span> },
    { key: "bar", label: "Bar code", render: (g) => <Mono>{g.barcode}</Mono> },
    { key: "hsn", label: "HSN", render: (g) => <Mono>{g.hsn}</Mono> },
    { key: "qty", label: "Qty", align: "r", strong: true, render: (g) => num(g.qty, 0) },
    { key: "box", label: "Box", align: "r", strong: true, render: (g) => g.boxes },
    { key: "vb", label: "Vol/box", align: "r", render: (g) => num(g.vol_per_box, 3) },
    { key: "tv", label: "Total vol", align: "r", render: (g) => num(g.vol_total, 3) },
    { key: "bg", label: "BG", align: "r", render: (g) => num(g.bg_per_box, 0) },
    { key: "pc", label: "PC", align: "r", render: (g) => num(g.p_per_box, 0) },
    { key: "ttl", label: "TTL", align: "r", render: (g) => num(g.stickers_per_box, 1) },
    { key: "stk", label: "Barcode stk", align: "r", render: (g) => Math.round(g.labels) },
    { key: "sheets", label: "Sheets", align: "r", render: (g) => g.sheets },
    { key: "cpu", label: "Cost/unit ₹", align: "r", render: (g) => inr(g.unit_value) },
    { key: "tc", label: "Total cost ₹", align: "r", render: (g) => inr(g.total_value_inr) },
    { key: "fpc", label: "FOB unit $", align: "r", render: (g) => usdp(g.unit_fob) },
    { key: "tfob", label: "Total FOB $", align: "r", render: (g) => usd(g.total_fob_usd) },
    { key: "rbi", label: "RBI", align: "r", render: (g) => num(g.rbi) },
    { key: "rref", label: "RBI ref ₹", align: "r", render: (g) => inr(g.rbi_ref_inr) },
    { key: "rate", label: "Rate ₹", align: "r", render: (g) => num(g.rate, 3) },
  ];
}

/* ============================================================ */
export default function OrdersPage() {
  const [tab, setTab] = useState("po");
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [selPo, setSelPo] = useState(null);
  const [editPo, setEditPo] = useState(null);

  const [from, setFrom] = useState("2025-01-01");
  const [to, setTo] = useState(todayISO());
  const [sup, setSup] = useState("");

  const poq = usePoList();
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const detailq = useItemDetail();
  const linesq = useOrderLines({ date_from: from, date_to: to });
  // "" means every supplier; useSupplierMaster is disabled while it is unset,
  // so the all-suppliers view is assembled from the order lines instead.
  const smq = useSupplierMaster(tab === "supplier" && sup ? sup : "", { date_from: from, date_to: to });
  const formulas = useMasterFormulas().data || [];

  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";

  const pos = poq.data || [];
  const detail = detailq.data || { pos: [], rows: [] };
  const lines = linesq.data?.rows || [];
  /* One supplier → the 7A the API builds. All suppliers → the same order
     lines rolled up by item, so the totals still tally with each 7A. */
  const sm = useMemo(() => {
    if (sup) return smq.data?.rows || [];
    const SUMS = ["qty", "boxes", "vol_total", "net_total", "gross_total", "labels",
      "sheets", "total_value_inr", "total_fob_usd", "rbi_ref_inr"];
    const byItem = {};
    lines.forEach((r) => {
      const e = byItem[r.item_id] || (byItem[r.item_id] = {
        ...r, pos: new Set(), ...Object.fromEntries(SUMS.map((k) => [k, 0])),
      });
      SUMS.forEach((k) => { e[k] += r[k] || 0; });
      e.pos.add(r.po);
    });
    const pad = (n) => String(Math.max(0, n)).padStart(3, "0");
    let serial = 1;
    return Object.values(byItem)
      .sort((a, b) => String(a.gd || a.code).localeCompare(String(b.gd || b.code)))
      .map((e) => {
        const first = serial; const last = serial + e.boxes - 1; serial += e.boxes;
        return {
          ...e, po: [...e.pos].sort().join(", "),
          serial: e.boxes ? `${pad(first)}–${pad(last)}` : "—",
          rate: e.qty ? e.rbi_ref_inr / e.qty : 0,
        };
      });
  }, [sup, smq.data, lines]);
  const selPoLive = selPo && pos.find((p) => p.po === selPo.po);

  const dateCount = useMemo(() => new Set(lines.map((r) => r.date)).size, [lines]);

  const viewToggle = (
    <Seg options={[["simple", "Simple"], ["full", "Full sheet"]]} value={full ? "full" : "simple"}
      onChange={(v) => setFull(v === "full")} />
  );

  if (poq.isLoading) return <Spinner label="Loading purchase orders…" />;
  if (poq.error) return <ErrorState error={poq.error} onRetry={poq.refetch} />;

  return (
    <div className="stack">
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Purchase Orders</h2>
          <p className="sub">Everything the buyer has asked for. Enter an order once — boxes, volume, labels, sheets and value are derived from the item master, so nothing is typed twice.</p>
        </div>
        <Btn size="lg" icon={Plus} onClick={() => setDrawer(true)}>New buyer order</Btn>
      </div>

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <Seg options={[
          ["po", "By purchase order", ClipboardList],
          ["itemdetail", "By item (order detail)", Boxes],
          ["lines", "Order lines", Layers],
          ["supplier", "Supplier summary", Truck],
        ]} value={tab} onChange={setTab} />
        {tab !== "po" && tab !== "itemdetail" && viewToggle}
      </div>

      {/* ---------- By PO ---------- */}
      {tab === "po" && (
        !pos.length ? (
          <Card><Empty icon={ClipboardList} title="No purchase orders yet" action={<Btn icon={Plus} onClick={() => setDrawer(true)}>New buyer order</Btn>}>Add the first buyer order and it will appear here with its live delivery status.</Empty></Card>
        ) : (
          <Card>
            <CardHead icon={ClipboardList} title={`${pos.length} purchase order${pos.length === 1 ? "" : "s"}`}>
              <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row for item-wise detail</span>
            </CardHead>
            <DataTable serial
              freeze={5}
              onRowClick={setSelPo}
              columns={[
                { key: "po", w: 92, label: "PO", render: (p) => <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>{p.po}</span> },
                { key: "date", w: 118, label: "Ordered", render: (p) => <span style={{ color: "var(--muted)" }}>{dmy(p.date)}</span> },
                { key: "buyer", w: 150, label: "Buyer", render: (p) => brand(p.buyer_id) },
                { key: "prog", w: 168, label: "Delivered", render: (p) => <Progress done={p.completed} total={p.ordered} /> },
                { key: "pen", w: 118, label: "Boxes pending", align: "r", render: (p) => <span style={{ fontWeight: 700, color: p.pending ? "var(--amber-ink)" : "var(--green-ink)" }}>{p.pending || "—"}</span> },
                { key: "done", label: "Received", align: "r", render: (p) => <span>{p.completed} <span style={{ color: "var(--faint)" }}>/ {p.ordered}</span></span> },
                { key: "sup", label: "Suppliers (pending)", render: (p) => p.open_suppliers.length ? <span className="row wrap" style={{ gap: 4 }}>{p.open_suppliers.map((s) => <Pill key={s}>{supCode(s)}</Pill>)}</span> : <Pill tone="green"><Check size={11} /> all delivered</Pill> },
                { key: "vol", label: "Volume m³", align: "r", render: (p) => num(p.volume, 3) },
                { key: "go", label: "", align: "r", render: () => <ChevronRight size={15} style={{ color: "var(--faint)" }} /> },
              ]}
              rows={pos} rowKey={(p) => p.po}
            />
            <div className="card-foot">
              <Note tone="teal">Deliveries recorded under <b>Shipment → Packing</b> flow straight into this table. Boxes always clear the <b>oldest open order first</b> — you never choose which PO gets filled.</Note>
            </div>
          </Card>
        )
      )}

      {/* ---------- By item · order detail (doc 37) ---------- */}
      {tab === "itemdetail" && (
        <>
          <Card pad>
            <div className="row wrap" style={{ gap: 12, justifyContent: "space-between", alignItems: "center" }}>
              <Note tone="teal">One row per item, a column per PO holding that PO's ordered pieces — then total pieces, boxes, volume and net weight. This is the balance-order item-wise sheet (37).</Note>
              <Btn variant="teal" icon={Download} disabled={!detail.rows.length}
                onClick={() => downloadCSV(`Balance_Order_Item_wise_${todayISO()}.csv`,
                  ["GD Code", "Code", "Size", "Length", "Packing", ...detail.pos, "Total Pcs", "Boxes", "Vol/Box", "Total Vol m³", "Net Wt kg"],
                  detail.rows.map((r) => [r.gd, r.code, r.size, r.length, r.packing, ...detail.pos.map((po) => r.per_po[po] || 0), r.qty, r.boxes, r.vol_per_box, r.total_vol, r.net_total]))}>
                Download
              </Btn>
            </div>
          </Card>
          <Card>
            <CardHead icon={Boxes} title={`${detail.rows.length} item${detail.rows.length === 1 ? "" : "s"} · ${detail.pos.length} PO column(s)`} />
            {detail.rows.length ? (
              <DataTable serial
                freeze={5} maxHeight={520}
                columns={[
                  { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                  { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code}</Mono> },
                  { key: "size", w: 80, label: "Size", render: (r) => r.size },
                  { key: "len", w: 80, label: "Length", render: (r) => r.length },
                  { key: "pack", w: 88, label: "Packing", align: "r", render: (r) => r.packing },
                  ...detail.pos.map((po) => ({ key: "po_" + po, label: po, align: "r", render: (r) => r.per_po[po] ? r.per_po[po].toLocaleString("en-IN") : <span style={{ color: "var(--faint)" }}>—</span> })),
                  { key: "qty", label: "Total pcs", align: "r", strong: true, render: (r) => r.qty.toLocaleString("en-IN") },
                  { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
                  { key: "vb", label: "Vol/box", align: "r", render: (r) => num(r.vol_per_box, 3) },
                  { key: "tv", label: "Total vol m³", align: "r", render: (r) => num(r.total_vol, 2) },
                  { key: "net", label: "Net wt kg", align: "r", render: (r) => num(r.net_total) },
                ]}
                rows={detail.rows} rowKey={(r) => r.item_id}
              />
            ) : <Empty icon={Boxes} title="No orders yet">Add a buyer order to see the item-wise order detail.</Empty>}
          </Card>
        </>
      )}

      {/* ---------- Order lines (2A buyer master) ---------- */}
      {tab === "lines" && (
        <>
          <Card pad>
            <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
              <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              <Pill tone="teal"><Calendar size={12} /> {dateCount} order date(s)</Pill>
              <span className="grow" />
              <Btn variant="teal" icon={Download} disabled={!lines.length}
                onClick={() => downloadCSV(`Buyer_Master_${from}_to_${to}.csv`, MASTER_HEAD, lines.map((r) => masterRow(r, supCode)))}>
                Download
              </Btn>
            </div>
          </Card>
          <Card>
            <CardHead icon={Layers} title={full ? "Buyer master · full sheet (2A)" : "Buyer master · the columns you actually read"}>
              <Info>The full sheet is the 2A master your team already uses. The simple view hides the derived columns — they are all still in the download.</Info>
            </CardHead>
            {linesq.isLoading ? <Spinner label="Working out the order lines…" />
              : lines.length
                ? <DataTable serial columns={orderLineColumns(full, supCode)} rows={lines} rowKey={(r) => r.id} freeze={5} maxHeight={480} />
                : <Empty icon={Layers} title="No order lines in this date range">Widen the dates, or add a new buyer order.</Empty>}
          </Card>
          <FormulaPanel title="How are boxes, labels and value calculated?" rows={formulas}
            intro="These depend on the order quantity and the day's RBI rate, so they are computed per order — never stored on the item. Barcode stickers follow each item's own rule out of the master workbook." />
        </>
      )}

      {/* ---------- Supplier summary (7A) ---------- */}
      {tab === "supplier" && (
        <>
          <Card pad>
            <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
              <Field label="Supplier" style={{ minWidth: 240 }}>
                <Select value={sup} onChange={(e) => setSup(e.target.value)}>
                  <option value="">All suppliers</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </Select>
              </Field>
              <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
              <span className="grow" />
              <Btn variant="teal" icon={Download} disabled={!sm.length}
                onClick={() => downloadCSV(`Supplier_Master_7A_${sup ? supCode(sup) : "All"}_${from}_to_${to}.csv`, MASTER_HEAD, sm.map((r) => masterRow(r, supCode)))}>
                Download
              </Btn>
            </div>
            <div style={{ marginTop: 12 }}>
              <Note tone="teal">Every PO for the same item is added together, and carton serial numbers are allocated as one continuous range — so the supplier gets a single, unambiguous sheet.</Note>
            </div>
          </Card>
          <Card>
            <CardHead icon={Truck} title={`${sm.length} item${sm.length === 1 ? "" : "s"} for ${sup ? supCode(sup) : "all suppliers"}`} />
            {(sup ? smq.isLoading : linesq.isLoading) ? <Spinner label="Working out the supplier master…" />
              : sm.length
                ? <DataTable serial columns={supplierColumns(full, supCode, !sup)} rows={sm} rowKey={(g) => g.item_id} freeze={5} maxHeight={480} />
                : <Empty icon={Truck} title="No orders for this supplier in the range">Pick another supplier or widen the dates.</Empty>}
          </Card>
          <FormulaPanel title="How is the 7A supplier sheet built?" rows={formulas}
            intro="The PO comes from the buyer order and the RBI rate from the packing date. Everything else derives from the item master." />
        </>
      )}

      {drawer && <NewOrderDrawer onClose={() => setDrawer(false)} />}
      {selPo && selPoLive && <PoModal po={selPoLive} onClose={() => setSelPo(null)} onEdit={() => { setEditPo(selPoLive); setSelPo(null); }} />}
      {editPo && <PoEditModal po={editPo} onClose={() => setEditPo(null)} />}
    </div>
  );
}
