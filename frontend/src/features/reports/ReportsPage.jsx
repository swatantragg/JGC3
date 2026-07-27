import { useMemo, useState } from "react";
import { BarChart3, ClipboardList, Layers, Truck, Download, Boxes, Check, Calculator } from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Pill, Mono, DataTable, Input, Note, Info, Empty, Stat,
  Spinner, ErrorState,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useBalance, useSuppliers, useBuyers } from "../../api/hooks.js";
import { dmy, num, inr, usd, todayISO } from "../../lib/format.js";
import { downloadCSV } from "../../lib/download.js";
import CostingPanel from "../costing/CostingPanel.jsx";

/* Other Reports — the balance register, rebuilt from the packing ledger every
   time it is opened, plus the Costing sheet. Nothing here is stored, so it
   can never drift out of sync with the orders and invoices it reads. */
export default function ReportsPage() {
  const { has } = useAuth();
  const canBalance = has("reports.balance");
  const canCosting = has("reports.costing");
  const [tab, setTab] = useState(canBalance ? "po" : "costing");
  const [remarks, setRemarks] = useState({});

  const balq = useBalance();
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";
  const joinInv = (l) => (l?.length ? l.join(", ") : "—");

  const data = balq.data || { po: [], item: [], supplier: [] };
  const poRows = data.po.map((r) => ({ ...r, key: `${r.po}|${r.item_id}|${r.date}` }));
  const itemRows = data.item;
  const supRows = data.supplier;

  const totals = useMemo(() => ({
    ordered: itemRows.reduce((s, r) => s + r.ordered, 0),
    recd: itemRows.reduce((s, r) => s + r.recd, 0),
    pending: itemRows.reduce((s, r) => s + r.pending, 0),
  }), [itemRows]);

  const pendingCell = (v) => <span style={{ fontWeight: 700, color: v ? "var(--amber-ink)" : "var(--green-ink)" }}>{v || "—"}</span>;
  const dateCell = (d) => <span style={{ color: "var(--muted)" }}>{d ? dmy(d) : "—"}</span>;

  const poCols = [
    { key: "date", w: 112, label: "Date", render: (p) => dateCell(p.date) },
    { key: "gd", w: 96, label: "GD code", render: (p) => <Mono>{p.gd}</Mono> },
    { key: "po", w: 92, label: "PO", render: (p) => <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>{p.po}</span> },
    { key: "buyer", w: 140, label: "Buyer", render: (p) => brand(p.buyer_id) },
    { key: "desc", w: 220, label: "Description", render: (p) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{p.description}</span> },
    { key: "inv", label: "Cleared by invoice", render: (p) => <Mono>{joinInv(p.invoices)}</Mono> },
    { key: "qty", label: "Qty", align: "r", render: (p) => p.qty.toLocaleString("en-IN") },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (p) => p.ordered },
    { key: "recd", label: "Received", align: "r", render: (p) => p.recd },
    { key: "pending", label: "Pending", align: "r", render: (p) => pendingCell(p.pending) },
    { key: "vol", label: "Total vol m³", align: "r", render: (p) => num(p.volume, 3) },
    { key: "rem", label: "Remarks", render: (p) => <Input className="input-sm" style={{ width: 150 }} value={remarks[p.key] || ""} onChange={(e) => setRemarks((x) => ({ ...x, [p.key]: e.target.value }))} placeholder="add note" /> },
  ];
  const itemCols = [
    { key: "date", w: 112, label: "Date", render: (p) => dateCell(p.date) },
    { key: "gd", w: 96, label: "GD code", render: (p) => <Mono>{p.gd}</Mono> },
    { key: "code", w: 92, label: "Code", render: (p) => <Mono>{p.code}</Mono> },
    { key: "desc", w: 220, label: "Description", render: (p) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{p.description}</span> },
    { key: "pos", w: 130, label: "PO(s)", render: (p) => <Mono>{p.pos.join(", ")}</Mono> },
    { key: "inv", label: "Cleared by invoice", render: (p) => <Mono>{joinInv(p.invoices)}</Mono> },
    { key: "qty", label: "Qty", align: "r", render: (p) => p.qty.toLocaleString("en-IN") },
    { key: "vb", label: "Vol/box", align: "r", render: (p) => num(p.vol_per_box, 3) },
    { key: "ordered", label: "Total boxes", align: "r", strong: true, render: (p) => p.ordered },
    { key: "recd", label: "Received", align: "r", render: (p) => p.recd },
    { key: "pending", label: "Pending", align: "r", render: (p) => pendingCell(p.pending) },
    { key: "vol", label: "Total vol m³", align: "r", render: (p) => num(p.volume, 3) },
  ];
  const supCols = [
    { key: "date", w: 112, label: "Date", render: (p) => dateCell(p.date) },
    { key: "gd", w: 96, label: "GD code", render: (p) => <Mono>{p.gd}</Mono> },
    { key: "sup", w: 104, label: "Supplier", render: (p) => <Pill>{supCode(p.supplier_id)}</Pill> },
    { key: "desc", w: 220, label: "Description", render: (p) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{p.description}</span> },
    { key: "inv", w: 160, label: "Invoice", render: (p) => <Mono>{joinInv(p.invoices)}</Mono> },
    { key: "recd", label: "Received boxes", align: "r", strong: true, render: (p) => p.recd },
    { key: "pending", label: "Pending boxes", align: "r", render: (p) => pendingCell(p.pending) },
    { key: "vol", label: "Total vol m³", align: "r", render: (p) => num(p.volume, 3) },
    { key: "val", label: "Invoice value ₹", align: "r", render: (p) => inr(p.value) },
  ];

  const cfg = {
    po: { cols: poCols, rows: poRows, key: (p) => p.key, doc: "37", title: "Balance order · PO wise (buyer)", foot: "Received = boxes delivered against that PO. The invoice column shows which invoice cleared it — remarks are typed here and travel into the download." },
    item: { cols: itemCols, rows: itemRows, key: (p) => p.item_id, doc: "37", title: "Balance order · item wise", foot: "Which item sits in which PO and invoice, with pending boxes and total volume." },
    supplier: { cols: supCols, rows: supRows, key: (p) => `${p.supplier_id}|${p.item_id}`, doc: "36", title: "Balance order · supplier wise", foot: "How many boxes we received from each supplier, per invoice, with pending balance and invoice value." },
  }[tab];

  const exportReport = () => {
    const stamp = todayISO();
    if (tab === "po") {
      downloadCSV(`Report_37_PO_wise_Buyer_${stamp}.csv`,
        ["Date", "GD Code", "PO", "Buyer", "Description", "Invoice No", "Qty", "Boxes", "Recd", "Pending", "Total Vol m³", "Remarks"],
        poRows.map((p) => [p.date, p.gd, p.po, brand(p.buyer_id), p.description, joinInv(p.invoices), p.qty, p.ordered, p.recd, p.pending, p.volume.toFixed(3), remarks[p.key] || ""]));
    } else if (tab === "item") {
      downloadCSV(`Report_37_Item_wise_${stamp}.csv`,
        ["Date", "GD Code", "Code", "Description", "PO(s)", "Invoice No", "Qty", "Vol/Box", "Total Boxes", "Recd Boxes", "Pending Boxes", "Total Vol m³"],
        itemRows.map((p) => [p.date || "", p.gd, p.code, p.description, p.pos.join(", "), joinInv(p.invoices), p.qty, p.vol_per_box, p.ordered, p.recd, p.pending, p.volume.toFixed(3)]));
    } else {
      downloadCSV(`Report_36_Supplier_wise_${stamp}.csv`,
        ["Date", "GD Code", "Supplier", "Description", "Invoice No", "Recd Boxes", "Pending Boxes", "Total Vol m³", "Invoice Value ₹"],
        supRows.map((p) => [p.date, p.gd, supCode(p.supplier_id), p.description, joinInv(p.invoices), p.recd, p.pending, p.volume.toFixed(3), p.value.toFixed(2)]));
    }
  };

  const segOptions = [
    ...(canBalance ? [["po", "By purchase order", ClipboardList], ["item", "By item", Layers], ["supplier", "By supplier", Truck]] : []),
    ...(canCosting ? [["costing", "Costing", Calculator]] : []),
  ];

  return (
    <div className="stack">
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Other Reports</h2>
          <p className="sub">
            {tab === "costing" ? (
              <>The Cost Working sheet, live. Type an item's prices once and the landed cost, FOB and profit are worked out with the exact formulas from the Excel — this is the go / no-go sheet before production.</>
            ) : (
              <>
                The balance register, rebuilt from scratch every time you open it.{" "}
                <Info>Nothing is stored. Reports 36–39 are recomputed from the orders and the packing invoices, so they can never drift out of sync with reality.</Info>{" "}
                Ask it three questions: which order is short, which item is short, which supplier still owes us.
              </>
            )}
          </p>
        </div>
        {tab !== "costing" && <Btn size="lg" icon={Download} disabled={!cfg.rows.length} onClick={exportReport}>Download</Btn>}
      </div>

      {segOptions.length > 1 && (
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <Seg options={segOptions} value={tab} onChange={setTab} />
          {tab !== "costing" && <Pill tone="teal">Report {cfg.doc}</Pill>}
        </div>
      )}

      {tab === "costing" ? <CostingPanel /> : (
        balq.isLoading ? <Spinner label="Rebuilding the balance register…" />
          : balq.error ? <ErrorState error={balq.error} onRetry={balq.refetch} />
            : (
              <>
                <div className="grid-4">
                  <Stat icon={Boxes} value={totals.ordered} label="Boxes ordered" sub="Across every open PO" />
                  <Stat icon={Check} tone="green" value={totals.recd} label="Boxes received" sub={`${totals.ordered ? Math.round((totals.recd / totals.ordered) * 100) : 0}% of the book`} />
                  <Stat icon={BarChart3} tone={totals.pending ? "amber" : "green"} value={totals.pending} label="Boxes pending" sub="Still owed by suppliers" />
                  <Stat icon={Truck} value={supRows.length} label="Supplier · item lines" sub="Delivered so far" />
                </div>

                <Card>
                  <CardHead icon={BarChart3} title={cfg.title}>
                    <span style={{ fontSize: 11.5, color: "var(--faint)" }}>The first five columns stay frozen while you scroll</span>
                  </CardHead>
                  {cfg.rows.length
                    ? <DataTable serial columns={cfg.cols} rows={cfg.rows} rowKey={cfg.key} freeze={5} maxHeight={520} />
                    : <Empty icon={BarChart3} title="Nothing to report yet">Record a packing invoice and the balance register fills in.</Empty>}
                  <div className="card-foot"><Note tone="teal">{cfg.foot}</Note></div>
                </Card>
              </>
            )
      )}
    </div>
  );
}
