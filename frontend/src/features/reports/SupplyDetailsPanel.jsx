import { useMemo, useState } from "react";
import { Layers, ClipboardList, FileText, Boxes, Calendar, X } from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Field, Input, Select, Pill, Mono, DataTable, Empty, Note, Info,
  Spinner, ErrorState, DownloadPair,
} from "../../components/ui/index.jsx";
import { useSupplyDetails, useSuppliers } from "../../api/hooks.js";
import { dmyNum, num, boxesExact, todayISO } from "../../lib/format.js";
import { downloadGridExcel, downloadGridPDF } from "../../lib/download.js";

/* ============================================================================
   38 · Supply details, item wise / supplier wise.

   The client's own sheet (Docs/Jaikvin Process/Numbering/38-…xlsx) reads:

     Sr No | CODE | DESCRIPTION | PACKING (UNIT · BOX) | a column per document
           | TOTAL PIECES | BOXES

   with the document number across the top and its date beneath it, and
   `BOXES = TOTAL ÷ BOX` left as a plain division — so a part carton shows as
   0.71, not rounded away. That is reproduced here column for column, and the
   Excel download carries the same divisions as live formulas.

   Two sub-tabs, because the same shape answers two questions:
     PO       what is still owed, order by order (and, with a date range, the
              orders raised in that window including the cleared ones)
     Invoice  what has actually been delivered, invoice by invoice
   ============================================================================ */

export default function SupplyDetailsPanel() {
  const [mode, setMode] = useState("po");
  const [sup, setSup] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const suppliers = useSuppliers().data || [];
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  const q = useSupplyDetails({ mode, supplier_id: sup, date_from: from, date_to: to });
  const data = q.data || { cols: [], rows: [], totals: { per_col: {} }, ranged: false };
  const cols = data.cols || [];
  const rows = data.rows || [];
  const t = data.totals || { per_col: {} };
  const ranged = !!(from || to);

  const label = mode === "po" ? "PO" : "Invoice";
  const supLabel = sup ? supCode(sup) : "All suppliers";

  /* ---- on screen ---- */
  const columns = useMemo(() => [
    { key: "code", w: 108, label: "Code", render: (r) => <Mono>{r.code || r.gd}</Mono> },
    { key: "desc", w: 250, label: "Description", render: (r) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{r.description}</span> },
    { key: "sup", w: 84, label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
    { key: "unit", w: 76, label: "Unit", align: "r", render: (r) => r.unit || "—" },
    { key: "box", w: 84, label: "Box", align: "r", strong: true, render: (r) => r.box || "—" },
    ...cols.map((c) => ({
      key: `c_${c.key}`,
      label: (
        <span style={{ display: "block", lineHeight: 1.2 }}>
          {c.key}
          <span style={{ display: "block", fontSize: 10, fontWeight: 400, opacity: 0.75 }}>({dmyNum(c.date)})</span>
        </span>
      ),
      align: "r",
      render: (r) => (r.per_col[c.key] ? r.per_col[c.key].toLocaleString("en-IN") : <span style={{ color: "var(--faint)" }}>—</span>),
    })),
    { key: "total", label: "Total pieces", align: "r", strong: true, render: (r) => r.total.toLocaleString("en-IN") },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => <span style={{ color: "var(--teal-ink)" }}>{boxesExact(r.boxes)}</span> },
    { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
  ], [cols, suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  const footer = [
    { v: "Total", span: 5 },
    ...cols.map((c) => ({ v: (t.per_col?.[c.key] || 0).toLocaleString("en-IN"), align: "r" })),
    { v: (t.total || 0).toLocaleString("en-IN"), align: "r" },
    { v: boxesExact(t.boxes || 0), align: "r" },
    { v: num(t.volume || 0, 3), align: "r" },
  ];

  /* ---- as it downloads: the reference sheet's own formulas ---- */
  const exportCols = useMemo(() => [
    { h: "Sr No", key: "sr", f: (_r, i) => i + 1, w: 7 },
    { h: "Code", key: "code", f: (r) => r.code || r.gd, w: 14 },
    { h: "Description", key: "description", f: (r) => r.description, w: 34 },
    { h: "Supplier", key: "supplier", f: (r) => supCode(r.supplier_id), w: 10 },
    { h: "Packing — Unit", key: "unit", t: "int", v: (r) => r.unit },
    { h: "Packing — Box", key: "boxpack", t: "int", v: (r) => r.box },
    ...cols.map((c, i) => ({
      h: `${c.key}\n(${dmyNum(c.date)})`,
      key: `d${i}`, t: "int", v: (r) => r.per_col[c.key] || 0, sum: true,
    })),
    // TOTAL = SUM of the document columns, exactly as =SUM(F6:K6) in the sheet
    {
      h: "Total pieces", key: "total", t: "int", sum: true,
      fml: () => (cols.length ? `SUM(${cols.map((_, i) => `{d${i}}`).join(",")})` : "0"),
    },
    // BOXES = TOTAL / BOX — the sheet's =H6/E6, left undivided on purpose
    { h: "Boxes", key: "boxes", t: "num", sum: true, fml: "IF({boxpack}=0,0,{total}/{boxpack})" },
    { h: "Vol / box m³", key: "volbox", t: "num3", v: (r) => r.vol_per_box },
    { h: "Volume m³", key: "vol", t: "num3", sum: true, fml: "{boxes}*{volbox}" },
  ], [cols, suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = `38 · Supply details — ${label} wise`;
  const subtitle = `${supLabel} · ${ranged ? `${from || "start"} to ${to || todayISO()}` : (mode === "po" ? "currently pending orders" : "all invoices")} · as on ${todayISO()}`;
  const fileStem = `Supply_Details_38_${label}_${(sup ? supCode(sup) : "All").replace(/[^A-Za-z0-9]+/g, "")}_${todayISO()}`;

  return (
    <div className="stack">
      <Card pad>
        <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
          <Seg options={[["po", "PO", ClipboardList], ["invoice", "Invoice", FileText]]} value={mode} onChange={setMode} />
          <Field label="Supplier" style={{ minWidth: 250 }}>
            <Select value={sup} onChange={(e) => setSup(e.target.value)}>
              <option value="">All suppliers</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          {ranged && (
            <Btn variant="ghost" size="sm" icon={X} onClick={() => { setFrom(""); setTo(""); }}>Clear dates</Btn>
          )}
          <span className="grow" />
          <DownloadPair disabled={!rows.length}
            onExcel={() => downloadGridExcel(fileStem, `${label} wise`, exportCols, rows, { title, subtitle })}
            onPDF={() => downloadGridPDF(title, exportCols, rows, { subtitle })} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Note tone="teal">
            {mode === "po" ? (
              ranged
                ? <>Every purchase order raised between these dates — the cleared ones included — at the quantity ordered. Each column is a PO with the day it was raised beneath it.</>
                : <>The orders still short, and the pieces still owed on each. <Info>With no date range this is the live pending book. Set a range to read back the history instead, cleared orders and all.</Info> Each column is a PO with the day it was raised beneath it.</>
            ) : (
              ranged
                ? <>Every packing invoice raised between these dates, and the pieces delivered on each.</>
                : <>Every packing invoice, and the pieces delivered on each. Set a date range to narrow it.</>
            )}{" "}
            <b>Boxes</b> is total pieces ÷ pieces per box, left undivided — 0.71 means the quantity is
            under a full carton. The Excel download keeps that as a live formula.
          </Note>
        </div>
      </Card>

      <Card>
        <CardHead icon={Layers} title={`${rows.length} item${rows.length === 1 ? "" : "s"} · ${cols.length} ${label.toLowerCase()} column(s)`}>
          {ranged && <Pill tone="teal"><Calendar size={11} /> {from || "start"} → {to || todayISO()}</Pill>}
          <Pill>{supLabel}</Pill>
        </CardHead>
        {q.isLoading ? <Spinner label="Working out the supply details…" />
          : q.error ? <ErrorState error={q.error} onRetry={q.refetch} />
            : rows.length
              ? <DataTable serial freeze={5} maxHeight={540} columns={columns} rows={rows} rowKey={(r) => r.item_id} footer={footer} />
              : (
                <Empty icon={Boxes} title={mode === "po" ? "Nothing pending" : "No invoices in this range"}>
                  {mode === "po"
                    ? "Every order for this selection has been delivered. Widen the supplier filter, or set a date range to read back the cleared orders."
                    : "Record a packing invoice, or widen the dates and the supplier filter."}
                </Empty>
              )}
      </Card>
    </div>
  );
}
