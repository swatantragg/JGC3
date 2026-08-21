import { useMemo, useState } from "react";
import {
  Plus, ClipboardList, Truck, Check, ChevronRight, Boxes,
  Pencil, Trash2, Monitor, X,
} from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Field, Input, Select, Pill, Mono, DataTable, Modal,
  Empty, Note, Spinner, ErrorState, FormulaPanel, DownloadPair,
} from "../../components/ui/index.jsx";
import ItemPicker from "../../components/ItemPicker.jsx";
import {
  usePoList, usePoMutations, useSuppliers, useBuyers, useItemDetail,
  useMasterFormulas, useOrderMaster,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { dmy, dmyNum, num, boxesExact, todayISO } from "../../lib/format.js";
import { downloadGridExcel, downloadGridPDF } from "../../lib/download.js";
import { hidePriceCols } from "../../lib/priceCols.js";
import { useIsMobile } from "../../lib/useIsMobile.js";
import NewOrderDrawer from "./NewOrderDrawer.jsx";

/* Purchase Orders — everything the buyer has asked for.

   Two views of the same order book:

     PO summary        one row per purchase order — what is still owed on it,
                       narrowable to a single factory. Picking a supplier (or
                       clicking one of the pills in "Suppliers (pending)")
                       carries that choice into the order itself, so the item
                       list you open is that supplier's lines, not the whole
                       order's.
     Buyers Summary    one row per item, a column per PO, with the boxes
                       received and the boxes still pending

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
   Used identically on the desktop table and the phone cards. */
const PoCell = ({ po, date }) => (
  <span style={{ display: "block", lineHeight: 1.25 }}>
    <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>{po}</span>
    <span style={{ display: "block", fontSize: 11, color: "var(--faint)", fontFamily: "var(--mono)" }}>({dmyNum(date)})</span>
  </span>
);

/* A supplier pill you can click: it opens the order already narrowed to that
   factory's lines. The row click behind it is stopped, or every pill would
   just open the whole order. */
const SupPick = ({ code, on, onPick }) => (
  <button type="button" className={`pill pill-click${on ? " pill-teal" : ""}`}
    title={`Show only ${code}'s items on this order`}
    onClick={(e) => { e.stopPropagation(); onPick(); }}>
    {code}
  </button>
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

const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

function PoModal({ po, supplierId = "", onClose, onEdit }) {
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const master = useOrderMaster(po.po);
  const [sup, setSup] = useState(supplierId);
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const supName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const buyer = buyers.find((b) => b.id === po.buyer_id);

  const all = master.data?.rows || [];
  /* The factories that actually appear on this order, in the order their
     lines do — the only ones worth offering as a filter. */
  const onPo = useMemo(() => {
    const seen = [];
    all.forEach((r) => { if (r.supplier_id && !seen.includes(r.supplier_id)) seen.push(r.supplier_id); });
    return seen;
  }, [all]);
  const countFor = (id) => all.filter((r) => r.supplier_id === id).length;

  // A supplier that has no lines on this order would show an empty table with
  // no way back, so the filter falls away rather than stranding the reader.
  const live = sup && onPo.includes(sup) ? sup : "";
  const rows = live ? all.filter((r) => r.supplier_id === live) : all;

  /* Narrowed to one factory the totals must be that factory's, so they are
     re-added from the rows on screen rather than read off the whole order. */
  const t = live
    ? {
      qty: sum(rows, "qty"), boxes_exact: sum(rows, "boxes_exact"),
      vol_total: sum(rows, "vol_total"), net_total: sum(rows, "net_total"),
      sheets: sum(rows, "sheets"),
    }
    : (master.data?.totals || {});

  const exportCols = PO_MASTER_COLS(supCode);
  const exportOpts = {
    title: `Purchase order ${po.po}${live ? ` · ${supCode(live)}` : ""}`,
    subtitle: `${buyer?.name || "—"} · ordered ${dmyNum(po.date)} · ${po.completed}/${po.ordered} boxes received${live ? ` · ${supName(live)} only` : ""}`,
  };

  return (
    <Modal title={`Purchase order ${po.po} (${dmyNum(po.date)})${live ? ` · ${supCode(live)}` : ""}`}
      icon={ClipboardList} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {buyer?.name || "—"} · ordered {dmy(po.date)} · {po.completed}/{po.ordered} boxes received
        </span>
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" icon={Pencil} onClick={onEdit}>Edit / delete</Btn>
          <DownloadPair disabled={!rows.length}
            onExcel={() => downloadGridExcel(`PO_${po.po}${live ? "_" + supCode(live) : ""}`, `PO ${po.po}`, exportCols, rows, exportOpts)}
            onPDF={() => downloadGridPDF(exportOpts.title, exportCols, rows, exportOpts)} />
        </div>
      </>}>
      {/* The filter that answers "what is Oswin making on this order?" — set
          by the summary's supplier picker or by clicking a supplier pill, and
          changeable here without going back. */}
      {onPo.length > 1 && (
        <div className="row wrap" style={{ gap: 10, alignItems: "center", marginBottom: 14 }}>
          <Select className="input-sm tab-filter" value={live} onChange={(e) => setSup(e.target.value)}
            aria-label="Show only one supplier's items on this order">
            <option value="">All suppliers · {all.length} item(s)</option>
            {onPo.map((id) => (
              <option key={id} value={id}>{supCode(id)} — {supName(id)} · {countFor(id)} item(s)</option>
            ))}
          </Select>
          {live && (
            <Btn size="sm" variant="ghost" icon={X} onClick={() => setSup("")}>Show all {all.length} items</Btn>
          )}
        </div>
      )}
      {master.isLoading ? <Spinner label="Working out the order…" /> : (
        <DataTable serial
          freeze={5}
          columns={hidePriceCols([
            { key: "sr", w: 104, label: "Carton range", render: (r) => <Mono>{r.serial}</Mono> },
            { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
            { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code}</Mono> },
            { key: "desc", w: 210, label: "Description", strong: true, render: (r) => <span style={{ whiteSpace: "pre-line" }}>{r.description}</span> },
            { key: "sp", w: 92, label: "Supplier", render: (r) => <Pill tone={live ? "teal" : ""}>{supCode(r.supplier_id)}</Pill> },
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
            { v: live ? `${supCode(live)} · total` : "Total", span: 5 },
            { v: num(t.qty || 0, 0), align: "r" }, { v: boxesExact(t.boxes_exact || 0), align: "r" },
            { v: num(t.vol_total, 3), align: "r" }, { v: num(t.net_total, 2), align: "r" },
            { v: Math.round(t.sheets || 0), align: "r" },
          ]}
        />
      )}
    </Modal>
  );
}

/* ---------- Edit / delete a purchase order ----------
   The order as it should now read: retype a quantity, drop a line you no
   longer want, or add an item that was left off. Lines already on the order
   keep the price they were agreed at; a line added here is priced at today's
   master, exactly as a fresh order would be. */
function PoEditModal({ po, onClose }) {
  const { update, remove } = usePoMutations();
  const suppliers = useSuppliers().data || [];
  const toast = useToast();
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  const [poNo, setPoNo] = useState(po.po);
  const [lines, setLines] = useState(() => po.detail.map((d) => ({
    key: d.line_id || d.item_id,
    line_id: d.line_id || null,
    item_id: d.item_id,
    gd: d.gd, description: d.description, supplier_id: d.supplier_id,
    qty: String(d.qty ?? ""),
    delivered: d.completed || 0,
  })));
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);

  const setQty = (key, v) => setLines((p) => p.map((l) => (l.key === key ? { ...l, qty: v } : l)));
  const drop = (key) => setLines((p) => p.filter((l) => l.key !== key));
  /* The picker hands back everything that was typed against it at once, so a
     dozen items join the order in one action rather than a dozen. */
  const add = (picked) => {
    setLines((p) => [...p, ...picked.map(({ group, variant, qty }, i) => ({
      key: `new:${variant.item_id}:${Date.now()}:${i}`,
      line_id: null, item_id: variant.item_id, gd: group.gd, description: group.description,
      supplier_id: variant.supplier_id, qty: String(qty), delivered: 0, fresh: true,
    }))]);
    setAdding(false);
  };

  const removedDelivered = po.detail
    .filter((d) => (d.completed || 0) > 0 && !lines.some((l) => l.line_id === (d.line_id || null)))
    .map((d) => d.gd);

  const save = () => {
    if (!lines.length) return;
    update.mutate(
      {
        po: po.po,
        body: {
          po: poNo,
          lines: lines.map((l) => ({ id: l.line_id || undefined, item_id: l.item_id, qty: Number(l.qty) || 0 })),
        },
      },
      { onSuccess: () => { toast(`PO ${poNo} updated — ${lines.length} line${lines.length === 1 ? "" : "s"}`); onClose(); } },
    );
  };
  const del = () => remove.mutate(po.po, { onSuccess: () => { toast(`PO ${po.po} deleted`); onClose(); } });

  return (
    <Modal title={`Edit purchase order ${po.po}`} icon={Pencil} onClose={onClose}
      footer={<>
        {confirm
          ? <span className="row wrap" style={{ gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--amber-ink)" }}>Delete PO {po.po} and all its lines?</span>
            <Btn variant="danger" size="sm" icon={Trash2} onClick={del}>Confirm delete</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep</Btn>
          </span>
          : <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Delete PO</Btn>}
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} disabled={update.isPending || !lines.length} onClick={save}>Save changes</Btn>
        </div>
      </>}>
      {/* The number and the one thing you might add, on the same line. */}
      <div className="row wrap" style={{ gap: 12, alignItems: "flex-end", marginBottom: 14 }}>
        <Field label="PO number" style={{ width: "min(280px, 100%)" }}>
          <Input value={poNo} onChange={(e) => setPoNo(e.target.value)} />
        </Field>
        <span className="grow" />
        <Btn variant={adding ? "ghost" : "teal"} icon={adding ? X : Plus} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add an item"}
        </Btn>
      </div>

      {adding && (
        <ItemPicker unit="pieces" where="on this order"
          chosen={lines.map((l) => l.item_id)} onAdd={add} />
      )}

      {removedDelivered.length > 0 && (
        <Note tone="amber" icon={Trash2}>
          <b>{removedDelivered.join(", ")}</b> {removedDelivered.length === 1 ? "has" : "have"} boxes
          already received against {removedDelivered.length === 1 ? "it" : "them"}. Removing the
          line{removedDelivered.length === 1 ? "" : "s"} takes that demand off the order — the
          invoices themselves are untouched, but the balance register will re-add those boxes to
          whatever is still open.
        </Note>
      )}

      {lines.length ? (
        // The table scrolls sideways on its own, so a narrow screen does not
        // drag the PO number field off with it.
        <div className="tbl-wrap edit-tbl">
        <table className="tbl">
          <thead>
            <tr>
              <th>Item</th>
              <th>Supplier</th>
              <th className="r">Pieces</th>
              <th className="r" style={{ width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td>
                  <Mono>{l.gd}</Mono>{" "}
                  <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{l.description}</span>
                  {l.fresh && <> <Pill tone="teal">new</Pill></>}
                </td>
                <td><Pill>{supCode(l.supplier_id)}</Pill></td>
                <td className="r">
                  <Input className="input-sm num-in" style={{ width: 110 }} type="text" inputMode="numeric"
                    value={l.qty} onChange={(e) => setQty(l.key, e.target.value.replace(/[^\d]/g, ""))} />
                </td>
                <td className="r">
                  <button className="icon-btn bare" title={`Remove ${l.gd} from this order`} onClick={() => drop(l.key)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <Empty icon={ClipboardList} title="Every line has been removed">
          An order needs at least one item. Add one above, or delete the order outright.
        </Empty>
      )}
    </Modal>
  );
}

/* ---------- The PO summary table ---------- */
function poSummaryColumns(supCode, brand, onPickSup, activeSup) {
  return [
    { key: "po", w: 108, label: "PO", render: (p) => <PoCell po={p.po} date={p.date} /> },
    { key: "buyer", w: 150, label: "Buyer", render: (p) => brand(p.buyer_id) },
    { key: "prog", w: 168, label: "Delivered", render: (p) => <Progress done={p.completed} total={p.ordered} /> },
    { key: "pen", w: 122, label: "Boxes pending", align: "r", render: (p) => <span style={{ fontWeight: 700, color: p.pending ? "var(--amber-ink)" : "var(--green-ink)" }}>{p.pending || "—"}</span> },
    { key: "done", w: 118, label: "Received", align: "r", render: (p) => <span>{p.completed} <span style={{ color: "var(--faint)" }}>/ {p.ordered}</span></span> },
    {
      key: "sup", label: "Suppliers (pending)",
      render: (p) => (p.open_suppliers.length
        ? <span className="row wrap" style={{ gap: 4 }}>
          {p.open_suppliers.map((s) => (
            <SupPick key={s} code={supCode(s)} on={s === activeSup} onPick={() => onPickSup(p, s)} />
          ))}
        </span>
        : <Pill tone="green"><Check size={11} /> all delivered</Pill>),
    },
    { key: "vol", label: "Volume m³", align: "r", render: (p) => num(p.volume, 3) },
    { key: "go", label: "", align: "r", render: () => <ChevronRight size={15} style={{ color: "var(--faint)" }} /> },
  ];
}

/* The PO summary on a phone: the number in bold, who it is for, what is still
   owed and which factories owe it. What has already been delivered is left to
   the desktop — on a phone this screen answers "what is outstanding", and the
   received count and the progress bar only crowd that out. */
function PoSummaryCards({ rows, supCode, brand, onOpen, onPickSup, activeSup }) {
  return (
    <div className="dt-cards">
      {rows.map((p) => (
        <div key={p.po} className="dt-card click" onClick={() => onOpen(p)}>
          <div className="dt-card-head">
            <span className="dt-card-title"><span className="mono">{p.po}</span></span>
            <span className="dt-card-n">{dmyNum(p.date)}</span>
          </div>
          <dl className="dt-card-body">
            <div className="dt-pair"><dt>Buyer</dt><dd className="r">{brand(p.buyer_id)}</dd></div>
            <div className="dt-pair">
              <dt>Boxes pending</dt>
              <dd className="r">
                <b style={{ color: p.pending ? "var(--amber-ink)" : "var(--green-ink)" }}>{p.pending || "—"}</b>
              </dd>
            </div>

            <div className="dt-pair">
              <dt>Suppliers</dt>
              <dd className="r">
                {p.open_suppliers.length
                  ? <span className="row wrap" style={{ gap: 4, justifyContent: "flex-end" }}>
                    {p.open_suppliers.map((s) => (
                      <SupPick key={s} code={supCode(s)} on={s === activeSup} onPick={() => onPickSup(p, s)} />
                    ))}
                  </span>
                  : <Pill tone="green"><Check size={11} /> all delivered</Pill>}
              </dd>
            </div>
            <div className="dt-pair"><dt>Volume m³</dt><dd className="r">{num(p.volume, 3)}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
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
  const mobile = useIsMobile();
  const [tab, setTab] = useState("po");
  const [drawer, setDrawer] = useState(false);
  const [sel, setSel] = useState(null);         // { po, sup } — the order to open
  const [editPo, setEditPo] = useState(null);
  const [sup, setSup] = useState("");           // "" = every supplier

  const poq = usePoList();
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const detailq = useItemDetail();
  const formulas = useMasterFormulas().data || [];

  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";

  const pos = poq.data || [];
  const detail = detailq.data || { pos: [], po_date: {}, rows: [] };
  const selLive = sel && pos.find((p) => p.po === sel.po);

  /* The supplier filter is the old supplier summary, folded into this one
     table: the same columns, recounted from just that factory's lines — so
     "pending" means pending *from them*, not on the order as a whole. */
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

  /* Clicking a supplier pill does two things at once: it narrows the whole
     summary to that factory, and it opens the order showing their items. */
  const pickSup = (p, sid) => { setSup(sid); setSel({ po: p.po, sup: sid }); };

  const summaryCols = useMemo(
    () => poSummaryColumns(supCode, brand, pickSup, sup),
    [suppliers, buyers, sup], // eslint-disable-line react-hooks/exhaustive-deps
  );
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

  const rows = sup ? supPos : pos;
  const title = sup ? `PO summary · ${supCode(sup)}` : "PO summary";
  const subtitle = `${sup ? supCode(sup) : "All suppliers"} · as on ${todayISO()} · every purchase order on the book`;

  return (
    <div className="stack">
      {/* Tabs, the supplier filter and the one action this screen has, on a
          single line. The page name is in the bar above and is not repeated. */}
      <div className="tabbar">
        <Seg options={[
          ["po", "PO summary", ClipboardList],
          ["itemdetail", "Buyers Summary", Boxes],
        ]} value={tab} onChange={setTab} />

        {tab === "po" && pos.length > 0 && (
          <Select className="tab-filter" value={sup} onChange={(e) => setSup(e.target.value)}
            aria-label="Narrow the summary to one supplier">
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </Select>
        )}

        <span className="grow" />

        {tab === "itemdetail" && !mobile && (
          <DownloadPair disabled={!detail.rows.length}
            onExcel={() => downloadGridExcel(`Buyers_Summary_${todayISO()}`, "Buyers Summary", buyersExport, detail.rows, { title: "Buyers Summary", subtitle: `Item wise · as on ${todayISO()}` })}
            onPDF={() => downloadGridPDF("Buyers Summary", buyersExport, detail.rows, { subtitle: `Item wise · as on ${todayISO()}` })} />
        )}

        <Btn size="lg" icon={Plus} onClick={() => setDrawer(true)}>New buyer order</Btn>
      </div>

      {/* ---------- PO summary ---------- */}
      {tab === "po" && (
        !pos.length ? (
          <Card><Empty icon={ClipboardList} title="No purchase orders yet" action={<Btn icon={Plus} onClick={() => setDrawer(true)}>New buyer order</Btn>}>Add the first buyer order and it will appear here with its live delivery status.</Empty></Card>
        ) : (
          <>
            <Card>
              <CardHead icon={ClipboardList} title={`${rows.length} purchase order${rows.length === 1 ? "" : "s"}${sup ? ` · ${supCode(sup)}` : ""}`}>
                <DownloadPair disabled={!rows.length}
                  onExcel={() => downloadGridExcel(`${title.replace(/[^A-Za-z0-9]+/g, "_")}_${todayISO()}`, title, summaryExport, rows, { title, subtitle })}
                  onPDF={() => downloadGridPDF(title, summaryExport, rows, { subtitle })} />
                {!mobile && <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row for item-wise detail</span>}
              </CardHead>
              {rows.length
                ? (mobile
                  ? <PoSummaryCards rows={rows} supCode={supCode} brand={brand} activeSup={sup}
                    onOpen={(p) => setSel({ po: p.po, sup })} onPickSup={pickSup} />
                  : <DataTable serial paginate freeze={5} onRowClick={(p) => setSel({ po: p.po, sup })}
                    columns={summaryCols} rows={rows} rowKey={(p) => p.po} maxHeight={560} />)
                : (
                  <Empty icon={Truck} title="Nothing on order for this supplier"
                    action={<Btn size="sm" variant="ghost" onClick={() => setSup("")}>Show all suppliers</Btn>}>
                    Pick another supplier, or enter a buyer order that includes them.
                  </Empty>
                )}
            </Card>
          </>
        )
      )}

      {/* ---------- Buyers Summary (one row per item, a column per PO) ---------- */}
      {tab === "itemdetail" && (mobile ? (
        <Card>
          <Empty icon={Monitor} title="Open this on a desktop">
            Buyers Summary is one row per item with a column for every purchase order — a grid
            that cannot be made to read on a phone. Everything else on this page works here.
          </Empty>
        </Card>
      ) : (
        <Card>
          <CardHead icon={Boxes} title={`${detail.rows.length} item${detail.rows.length === 1 ? "" : "s"} · ${detail.pos.length} PO column(s)`} />
          {detail.rows.length ? (
            <DataTable serial freeze={5} maxHeight={520} columns={buyersCols} rows={detail.rows} rowKey={(r) => r.item_id} />
          ) : <Empty icon={Boxes} title="No orders yet">Add a buyer order to see the item-wise summary.</Empty>}
        </Card>
      ))}

      <FormulaPanel title="How are boxes, labels and value calculated?" rows={formulas} />

      {drawer && <NewOrderDrawer onClose={() => setDrawer(false)} />}
      {sel && selLive && (
        <PoModal key={`${sel.po}:${sel.sup || ""}`} po={selLive} supplierId={sel.sup || ""}
          onClose={() => setSel(null)} onEdit={() => { setEditPo(selLive); setSel(null); }} />
      )}
      {editPo && <PoEditModal po={editPo} onClose={() => setEditPo(null)} />}
    </div>
  );
}
