import { useMemo, useState } from "react";
import {
  Plus, ClipboardList, Truck, Check, ChevronRight, Boxes,
  Pencil, Trash2, EyeOff,
} from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Field, Input, Select, Pill, Mono, DataTable, Modal,
  Empty, Note, Info, Spinner, ErrorState, FormulaPanel, DownloadPair,
} from "../../components/ui/index.jsx";
import {
  usePoList, usePoMutations, useSuppliers, useBuyers, useItemDetail,
  useMasterFormulas, useOrderMaster,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { dmy, dmyNum, num, boxesExact, todayISO } from "../../lib/format.js";
import { downloadGridExcel, downloadGridPDF } from "../../lib/download.js";
import { hidePriceCols, PRICE_HIDDEN_NOTE } from "../../lib/priceCols.js";
import NewOrderDrawer from "./NewOrderDrawer.jsx";

/* Purchase Orders — everything the buyer has asked for.

   Three views of the same order book:

     PO summary        one row per purchase order — what is still owed on it
     Buyers Summary    one row per item, a column per PO, with the boxes
                       received and the boxes still pending
     Supplier summary  the PO summary again, narrowed to one factory

   Every derived figure comes from the API, so this page and the masters can
   never disagree. Purchase and FOB prices are held off screen throughout;
   they are stored in full and print in full on every download. */

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

/* The purchase order number with the day it was raised beneath it:
     344044
     (13/03/2026)
   Used identically on the PO summary and the supplier summary. */
const PoCell = ({ po, date }) => (
  <span style={{ display: "block", lineHeight: 1.25 }}>
    <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>{po}</span>
    <span style={{ display: "block", fontSize: 11, color: "var(--faint)", fontFamily: "var(--mono)" }}>({dmyNum(date)})</span>
  </span>
);

/* ---------- PO detail ---------- */
/* The 2A order master, as it downloads — prices included. */
const PO_MASTER_COLS = (supCode) => [
  { h: "Carton range", key: "serial", f: (r) => r.serial },
  { h: "PO", key: "po", f: (r) => r.po },
  { h: "Date", key: "date", f: (r) => dmyNum(r.date) },
  { h: "GD code", key: "gd", f: (r) => r.gd },
  { h: "Code", key: "code", f: (r) => r.code },
  { h: "OSWIN", key: "oswin", f: (r) => r.oswin },
  { h: "GL", key: "gl", f: (r) => r.gl },
  { h: "Size", key: "size", f: (r) => r.size },
  { h: "Length", key: "length", f: (r) => r.length },
  { h: "Description", key: "description", f: (r) => r.description, w: 32 },
  { h: "Bar code", key: "barcode", f: (r) => r.barcode },
  { h: "HSN", key: "hsn", f: (r) => r.hsn },
  { h: "Supplier", key: "supplier", f: (r) => supCode(r.supplier_id) },
  { h: "Pcs / box", key: "pack", t: "int", v: (r) => r.packing, sum: false },
  { h: "Pieces", key: "qty", t: "int", v: (r) => r.qty, sum: true },
  { h: "Boxes", key: "box", t: "int", fml: "ROUNDUP({qty}/{pack},0)", sum: true },
  { h: "Vol / box", key: "volbox", t: "num3", v: (r) => r.vol_per_box },
  { h: "Total vol m³", key: "vol", t: "num", fml: "{box}*{volbox}", sum: true },
  { h: "Nett / box", key: "netbox", t: "num", v: (r) => r.net_per_box },
  { h: "Total nett kg", key: "net", t: "num", fml: "{box}*{netbox}", sum: true },
  { h: "Gross / box", key: "grossbox", t: "num", v: (r) => r.gross_per_box },
  { h: "Total gross kg", key: "gross", t: "num", fml: "{box}*{grossbox}", sum: true },
  { h: "Stickers / box", key: "stk", t: "num1", v: (r) => r.stickers_per_box },
  { h: "Labels", key: "labels", t: "int", fml: "ROUNDUP({box}*{stk},0)", sum: true },
  { h: "Sheets", key: "sheets", t: "int", v: (r) => r.sheets, sum: true },
  { h: "Unit ₹", key: "unit", t: "inr", v: (r) => r.unit_value },
  { h: "Total ₹", key: "tinr", t: "inr", fml: "{qty}*{unit}", sum: true },
  { h: "FOB unit $", key: "fobu", t: "usd4", v: (r) => r.unit_fob },
  { h: "Total FOB $", key: "tusd", t: "usd", fml: (r) => (r.fob_mode === "100" ? "{qty}*{fobu}/100" : "{qty}*{fobu}"), sum: true },
  { h: "RBI", key: "rbirate", t: "num", v: (r) => r.rbi },
  { h: "RBI ref ₹", key: "rbiref", t: "inr", fml: "{tusd}*{rbirate}", sum: true },
];

function PoModal({ po, onClose, onEdit }) {
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const master = useOrderMaster(po.po);
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const buyer = buyers.find((b) => b.id === po.buyer_id);
  const rows = master.data?.rows || [];
  const t = master.data?.totals || {};

  const exportCols = PO_MASTER_COLS(supCode);
  const exportOpts = {
    title: `Purchase order ${po.po}`,
    subtitle: `${buyer?.name || "—"} · ordered ${dmyNum(po.date)} · ${po.completed}/${po.ordered} boxes received`,
  };

  return (
    <Modal title={`Purchase order ${po.po} (${dmyNum(po.date)})`} icon={ClipboardList} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {buyer?.name || "—"} · ordered {dmy(po.date)} · {po.completed}/{po.ordered} boxes received
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Edit / delete</Btn>
          <DownloadPair disabled={!rows.length}
            onExcel={() => downloadGridExcel(`PO_${po.po}`, `PO ${po.po}`, exportCols, rows, exportOpts)}
            onPDF={() => downloadGridPDF(`Purchase order ${po.po}`, exportCols, rows, exportOpts)} />
        </div>
      </>}>
      {master.isLoading ? <Spinner label="Working out the order…" /> : (
        <DataTable serial
          freeze={5}
          columns={hidePriceCols([
            { key: "sr", w: 104, label: "Carton range", render: (r) => <Mono>{r.serial}</Mono> },
            { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
            { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code}</Mono> },
            { key: "desc", w: 210, label: "Description", strong: true, render: (r) => <span style={{ whiteSpace: "pre-line" }}>{r.description}</span> },
            { key: "sp", w: 92, label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
            { key: "qty", label: "Pieces", align: "r", render: (r) => num(r.qty, 0) },
            { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => boxesExact(r.boxes_exact) },
            { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.vol_total, 3) },
            { key: "net", label: "Nett kg", align: "r", render: (r) => num(r.net_total, 2) },
            { key: "sheets", label: "Label sheets", align: "r", render: (r) => r.sheets },
            { key: "val", label: "Cost ₹", align: "r" },
            { key: "fob", label: "FOB $", align: "r" },
          ])}
          rows={rows} rowKey={(r) => r.item_id + r.line_id}
          footer={[
            { v: "Total", span: 5 }, { v: num(t.qty || 0, 0), align: "r" }, { v: boxesExact(t.boxes_exact || 0), align: "r" },
            { v: num(t.vol_total, 3), align: "r" }, { v: num(t.net_total, 2), align: "r" },
            { v: Math.round(t.sheets || 0), align: "r" },
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

/* ---------- The PO summary table ----------
   One structure, used by both the PO summary and the supplier summary — the
   client reads the same shape in both places, the second one simply narrowed
   to a single factory. */
function poSummaryColumns(supCode, brand) {
  return [
    { key: "po", w: 108, label: "PO", render: (p) => <PoCell po={p.po} date={p.date} /> },
    { key: "buyer", w: 150, label: "Buyer", render: (p) => brand(p.buyer_id) },
    { key: "prog", w: 168, label: "Delivered", render: (p) => <Progress done={p.completed} total={p.ordered} /> },
    { key: "pen", w: 122, label: "Boxes pending", align: "r", render: (p) => <span style={{ fontWeight: 700, color: p.pending ? "var(--amber-ink)" : "var(--green-ink)" }}>{p.pending || "—"}</span> },
    { key: "done", w: 118, label: "Received", align: "r", render: (p) => <span>{p.completed} <span style={{ color: "var(--faint)" }}>/ {p.ordered}</span></span> },
    { key: "sup", label: "Suppliers (pending)", render: (p) => (p.open_suppliers.length ? <span className="row wrap" style={{ gap: 4 }}>{p.open_suppliers.map((s) => <Pill key={s}>{supCode(s)}</Pill>)}</span> : <Pill tone="green"><Check size={11} /> all delivered</Pill>) },
    { key: "vol", label: "Volume m³", align: "r", render: (p) => num(p.volume, 3) },
    { key: "go", label: "", align: "r", render: () => <ChevronRight size={15} style={{ color: "var(--faint)" }} /> },
  ];
}

const PO_SUMMARY_EXPORT = (supCode, brand) => [
  { h: "PO", key: "po", f: (p) => p.po },
  { h: "Date", key: "date", f: (p) => dmyNum(p.date) },
  { h: "Buyer", key: "buyer", f: (p) => brand(p.buyer_id) },
  { h: "Boxes ordered", key: "ordered", t: "int", v: (p) => p.ordered, sum: true },
  { h: "Boxes received", key: "recd", t: "int", v: (p) => p.completed, sum: true },
  { h: "Boxes pending", key: "pending", t: "int", fml: "{ordered}-{recd}", sum: true },
  { h: "Delivered %", key: "pct", t: "num1", fml: "IF({ordered}=0,0,{recd}*100/{ordered})" },
  { h: "Suppliers (pending)", key: "sups", f: (p) => p.open_suppliers.map(supCode).join(", ") || "all delivered" },
  { h: "Volume m³", key: "vol", t: "num3", v: (p) => p.volume, sum: true },
];


/* ============================================================ */
export default function OrdersPage() {
  const [tab, setTab] = useState("po");
  const [drawer, setDrawer] = useState(false);
  const [selPo, setSelPo] = useState(null);
  const [editPo, setEditPo] = useState(null);
  const [sup, setSup] = useState("");

  const poq = usePoList();
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const detailq = useItemDetail();
  const formulas = useMasterFormulas().data || [];

  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";

  const pos = poq.data || [];
  const detail = detailq.data || { pos: [], po_date: {}, rows: [] };
  const selPoLive = selPo && pos.find((p) => p.po === selPo.po);

  /* Supplier summary is the PO summary narrowed to one factory: the same
     table, the same columns, recounted from just that supplier's lines — so
     "pending" there means pending *from them*, not on the order as a whole. */
  const supPos = useMemo(() => {
    if (!sup) return pos;
    return pos.map((p) => {
      const mine = (p.detail || []).filter((d) => d.supplier_id === sup);
      if (!mine.length) return null;
      return {
        ...p,
        detail: mine,
        ordered: mine.reduce((s, d) => s + d.ordered, 0),
        completed: mine.reduce((s, d) => s + d.completed, 0),
        pending: mine.reduce((s, d) => s + d.pending, 0),
        volume: mine.reduce((s, d) => s + d.volume, 0),
        open_suppliers: mine.some((d) => d.pending > 0) ? [sup] : [],
      };
    }).filter(Boolean);
  }, [pos, sup]);

  const summaryCols = useMemo(() => poSummaryColumns(supCode, brand), [suppliers, buyers]); // eslint-disable-line react-hooks/exhaustive-deps
  const summaryExport = useMemo(() => PO_SUMMARY_EXPORT(supCode, brand), [suppliers, buyers]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Buyers Summary — one row per item, a column per PO, then the boxes
     received and the boxes still pending on it. */
  const buyersCols = [
    { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
    { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code}</Mono> },
    { key: "size", w: 80, label: "Size", render: (r) => r.size },
    { key: "len", w: 80, label: "Length", render: (r) => r.length },
    { key: "pack", w: 88, label: "Packing", align: "r", render: (r) => r.packing },
    ...detail.pos.map((po) => ({
      key: "po_" + po,
      label: <span style={{ display: "block", lineHeight: 1.2 }}>{po}<span style={{ display: "block", fontSize: 10, fontWeight: 400, opacity: 0.75 }}>({dmyNum(detail.po_date?.[po])})</span></span>,
      align: "r",
      render: (r) => (r.per_po[po] ? r.per_po[po].toLocaleString("en-IN") : <span style={{ color: "var(--faint)" }}>—</span>),
    })),
    { key: "qty", label: "Total pcs", align: "r", strong: true, render: (r) => r.qty.toLocaleString("en-IN") },
    { key: "recd", label: "Received boxes", align: "r", strong: true, render: (r) => <span style={{ color: "var(--green-ink)", fontWeight: 700 }}>{r.recd || "—"}</span> },
    { key: "pending", label: "Pending boxes", align: "r", strong: true, render: (r) => <span style={{ color: r.pending ? "var(--amber-ink)" : "var(--green-ink)", fontWeight: 700 }}>{r.pending || "—"}</span> },
    { key: "vb", label: "Vol/box", align: "r", render: (r) => num(r.vol_per_box, 3) },
    { key: "tv", label: "Total vol m³", align: "r", render: (r) => num(r.total_vol, 2) },
    { key: "net", label: "Net wt kg", align: "r", render: (r) => num(r.net_total) },
  ];

  const buyersExport = [
    { h: "GD code", key: "gd", f: (r) => r.gd },
    { h: "Code", key: "code", f: (r) => r.code },
    { h: "Size", key: "size", f: (r) => r.size },
    { h: "Length", key: "length", f: (r) => r.length },
    { h: "Packing", key: "pack", t: "int", v: (r) => r.packing },
    ...detail.pos.map((po, i) => ({
      h: `${po} (${dmyNum(detail.po_date?.[po])})`,
      key: `p${i}`, t: "int", v: (r) => r.per_po[po] || 0, sum: true,
    })),
    // Total pieces = the PO columns added up, so editing one PO's quantity in
    // the download re-totals the row, the boxes and the volume with it.
    { h: "Total pcs", key: "qty", t: "int", sum: true,
      fml: () => (detail.pos.length ? `SUM(${detail.pos.map((_, i) => `{p${i}}`).join(",")})` : "0") },
    { h: "Total boxes", key: "box", t: "int", fml: "ROUNDUP({qty}/{pack},0)", sum: true },
    { h: "Received boxes", key: "recd", t: "int", v: (r) => r.recd, sum: true },
    { h: "Pending boxes", key: "pending", t: "int", fml: "{box}-{recd}", sum: true },
    { h: "Vol / box", key: "volbox", t: "num3", v: (r) => r.vol_per_box },
    { h: "Total vol m³", key: "vol", t: "num", fml: "{box}*{volbox}", sum: true },
    { h: "Net / box kg", key: "netbox", t: "num", v: (r) => r.net_per_box },
    { h: "Net wt kg", key: "net", t: "num", fml: "{box}*{netbox}", sum: true },
  ];

  if (poq.isLoading) return <Spinner label="Loading purchase orders…" />;
  if (poq.error) return <ErrorState error={poq.error} onRetry={poq.refetch} />;

  const summaryTitle = sup ? `Supplier summary · ${supCode(sup)}` : "PO summary";
  const summaryRows = tab === "supplier" ? supPos : pos;

  const SummaryCard = ({ rows, title, subtitle, empty }) => (
    <Card>
      <CardHead icon={ClipboardList} title={`${rows.length} purchase order${rows.length === 1 ? "" : "s"}`}>
        <DownloadPair disabled={!rows.length}
          onExcel={() => downloadGridExcel(`${title.replace(/[^A-Za-z0-9]+/g, "_")}_${todayISO()}`, title, summaryExport, rows, { title, subtitle })}
          onPDF={() => downloadGridPDF(title, summaryExport, rows, { subtitle })} />
        <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row for item-wise detail</span>
      </CardHead>
      {rows.length
        ? <DataTable serial paginate freeze={5} onRowClick={setSelPo} columns={summaryCols} rows={rows} rowKey={(p) => p.po} maxHeight={560} />
        : empty}
      <div className="card-foot stack-sm">
        <Note tone="teal">Deliveries recorded under <b>Shipment → Packing</b> flow straight into this table. Boxes always clear the <b>oldest open order first</b> — you never choose which PO gets filled.</Note>
        <Note tone="teal" icon={EyeOff}>{PRICE_HIDDEN_NOTE}</Note>
      </div>
    </Card>
  );

  return (
    <div className="stack">
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Purchase Orders</h2>
          <p className="sub">Everything the buyer has asked for. Enter an order once — boxes, volume, labels, sheets and value are derived from the item master, so nothing is typed twice.</p>
        </div>
        <Btn size="lg" icon={Plus} onClick={() => setDrawer(true)}>New buyer order</Btn>
      </div>

      <Seg options={[
        ["po", "PO summary", ClipboardList],
        ["itemdetail", "Buyers Summary", Boxes],
        ["supplier", "Supplier summary", Truck],
      ]} value={tab} onChange={setTab} />

      {/* ---------- PO summary ---------- */}
      {tab === "po" && (
        !pos.length ? (
          <Card><Empty icon={ClipboardList} title="No purchase orders yet" action={<Btn icon={Plus} onClick={() => setDrawer(true)}>New buyer order</Btn>}>Add the first buyer order and it will appear here with its live delivery status.</Empty></Card>
        ) : (
          <SummaryCard rows={pos} title="PO summary" subtitle={`As on ${todayISO()} · every purchase order on the book`} />
        )
      )}

      {/* ---------- Buyers Summary (one row per item, a column per PO) ---------- */}
      {tab === "itemdetail" && (
        <>
          <Card pad>
            <div className="row wrap" style={{ gap: 12, justifyContent: "space-between", alignItems: "center" }}>
              <Note tone="teal">One row per item, a column per PO holding that PO's ordered pieces — then total pieces, the boxes <b>received</b> and the boxes still <b>pending</b>. This is the buyers' balance sheet, item wise.</Note>
              <DownloadPair disabled={!detail.rows.length}
                onExcel={() => downloadGridExcel(`Buyers_Summary_${todayISO()}`, "Buyers Summary", buyersExport, detail.rows, { title: "Buyers Summary", subtitle: `Item wise · as on ${todayISO()}` })}
                onPDF={() => downloadGridPDF("Buyers Summary", buyersExport, detail.rows, { subtitle: `Item wise · as on ${todayISO()}` })} />
            </div>
          </Card>
          <Card>
            <CardHead icon={Boxes} title={`${detail.rows.length} item${detail.rows.length === 1 ? "" : "s"} · ${detail.pos.length} PO column(s)`} />
            {detail.rows.length ? (
              <DataTable serial freeze={5} maxHeight={520} columns={buyersCols} rows={detail.rows} rowKey={(r) => r.item_id} />
            ) : <Empty icon={Boxes} title="No orders yet">Add a buyer order to see the item-wise summary.</Empty>}
            <div className="card-foot">
              <Note tone="teal">Received and pending come from the same FIFO ledger the packing screen uses, so this table and the balance register can never disagree.</Note>
            </div>
          </Card>
        </>
      )}

      {/* ---------- Supplier summary — the PO summary, one factory at a time ---------- */}
      {tab === "supplier" && (
        <>
          <Card pad>
            <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
              <Field label="Supplier" style={{ minWidth: 280 }}>
                <Select value={sup} onChange={(e) => setSup(e.target.value)}>
                  <option value="">All suppliers</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </Select>
              </Field>
              <span className="grow" />
              <Pill tone="teal">{summaryRows.length} order(s) involving {sup ? supCode(sup) : "any supplier"}</Pill>
            </div>
            <div style={{ marginTop: 12 }}>
              <Note tone="teal">
                The same table as the PO summary, narrowed by supplier: <b>pending</b> and <b>received</b>
                {" "}here count only that factory's lines, so it answers "what does Kiran still owe me, on which order".
              </Note>
            </div>
          </Card>
          <SummaryCard
            rows={summaryRows}
            title={summaryTitle}
            subtitle={`${sup ? supCode(sup) : "All suppliers"} · as on ${todayISO()}`}
            empty={<Empty icon={Truck} title="Nothing on order for this supplier">Pick another supplier, or enter a buyer order that includes them.</Empty>}
          />
        </>
      )}

      <FormulaPanel title="How are boxes, labels and value calculated?" rows={formulas}
        intro="These depend on the order quantity and the day's RBI rate, so they are computed per order — never stored on the item. Barcode stickers follow each item's own rule out of the master workbook." />

      {drawer && <NewOrderDrawer onClose={() => setDrawer(false)} />}
      {selPo && selPoLive && <PoModal po={selPoLive} onClose={() => setSelPo(null)} onEdit={() => { setEditPo(selPoLive); setSelPo(null); }} />}
      {editPo && <PoEditModal po={editPo} onClose={() => setEditPo(null)} />}
    </div>
  );
}
