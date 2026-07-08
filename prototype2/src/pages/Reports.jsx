import { useState, useMemo } from "react";
import { BarChart3, ClipboardList, Layers, Truck, Download, Boxes, Check } from "lucide-react";
import { useApp } from "../store.jsx";
import Rail from "../Rail.jsx";
import { Card, CardHead, Btn, Seg, Pill, Mono, DataTable, Input, Note, Info, Empty, Stat } from "../ui.jsx";
import { writeXLS } from "../docs.js";
import { balanceData, joinInv, dmy, num, inr, usd, TODAY } from "../data.js";

/* ============================================================
   Reports — the balance register, live from the packing ledger.
   Three questions, three tabs: which PO is short, which item is short,
   which supplier still owes us.
   ============================================================ */
export default function Reports({ go }) {
  const { items, buyerMaster, invoices, supCode, buyerById } = useApp();
  const [tab, setTab] = useState("po");
  const [remarks, setRemarks] = useState({});
  const setRem = (k, v) => setRemarks((p) => ({ ...p, [k]: v }));

  const { byItem } = useMemo(() => balanceData(buyerMaster, invoices, items), [buyerMaster, invoices, items]);

  /* PO-wise (buyer) */
  const poRows = [];
  Object.values(byItem).forEach((b) => b.demands.forEach((d) => {
    const recd = d.ordered - d.remaining;
    poRows.push({ key: d.po + "|" + b.item.id + "|" + d.date, date: d.date, it: b.item, po: d.po, buyerId: d.buyerId, qty: d.qty, ordered: d.ordered, recd, pending: d.remaining, volume: d.ordered * b.item.volume, invoices: d.invoices, value: recd * b.item.packing * (b.item.unitFob100 / 100) });
  }));
  poRows.sort((a, b) => a.po.localeCompare(b.po) || a.it.gd.localeCompare(b.it.gd));

  /* Item-wise */
  const itemRows = Object.values(byItem).filter((b) => b.demands.length).map((b) => {
    const ordered = b.demands.reduce((s, d) => s + d.ordered, 0);
    const pending = b.demands.reduce((s, d) => s + d.remaining, 0);
    const invSet = new Set(); b.demands.forEach((d) => d.invoices.forEach((x) => invSet.add(x)));
    const date = b.demands.map((d) => d.date).sort().slice(-1)[0];
    return { it: b.item, date, pos: [...new Set(b.demands.map((d) => d.po))], invoices: invSet, qty: b.demands.reduce((s, d) => s + d.qty, 0), ordered, recd: ordered - pending, pending, volume: ordered * b.item.volume };
  }).sort((a, b) => a.it.gd.localeCompare(b.it.gd));

  /* Supplier-wise */
  const supMap = {};
  invoices.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((inv) => inv.lines.forEach((l) => {
    const it = items.find((x) => x.id === l.itemId); if (!it) return;
    const k = l.supplierId + "|" + l.itemId;
    if (!supMap[k]) supMap[k] = { supplierId: l.supplierId, it, date: inv.date, recd: 0, invoices: new Set() };
    supMap[k].recd += Number(l.boxes) || 0; supMap[k].invoices.add(inv.invoiceNo); supMap[k].date = inv.date;
  }));
  const supRows = Object.values(supMap)
    .map((s) => ({ ...s, volume: s.recd * s.it.volume, value: s.recd * s.it.packing * s.it.unitValue, pending: byItem[s.it.id] ? byItem[s.it.id].demands.reduce((t, d) => t + d.remaining, 0) : 0 }))
    .sort((a, b) => supCode(a.supplierId).localeCompare(supCode(b.supplierId)) || a.it.gd.localeCompare(b.it.gd));

  /* ---- Excel export (one per tab; PO-wise carries the editable Remarks) ---- */
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

  const pendingCell = (v) => <span style={{ fontWeight: 700, color: v ? "var(--amber-ink)" : "var(--green-ink)" }}>{v || "—"}</span>;
  const dateCell = (d) => <span style={{ color: "var(--muted)" }}>{d ? dmy(d) : "—"}</span>;

  const poCols = [
    { key: "date", w: 106, label: "Date", render: (p) => dateCell(p.date) },
    { key: "gd", w: 92, label: "GD code", render: (p) => <Mono>{p.it.gd}</Mono> },
    { key: "po", label: "PO", render: (p) => <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>{p.po}</span> },
    { key: "buyer", label: "Buyer", render: (p) => buyerById(p.buyerId).brand },
    { key: "desc", label: "Description", render: (p) => <span style={{ color: "var(--ink)" }}>{p.it.description}</span> },
    { key: "inv", label: "Cleared by invoice", render: (p) => <Mono>{joinInv(p.invoices)}</Mono> },
    { key: "qty", label: "Qty", align: "r", render: (p) => p.qty.toLocaleString("en-IN") },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (p) => p.ordered },
    { key: "recd", label: "Received", align: "r", render: (p) => p.recd },
    { key: "pending", label: "Pending", align: "r", render: (p) => pendingCell(p.pending) },
    { key: "vol", label: "Total vol m³", align: "r", render: (p) => num(p.volume, 3) },
    { key: "val", label: "Invoice value $", align: "r", render: (p) => usd(p.value) },
    { key: "rem", label: "Remarks", render: (p) => <Input className="input-sm" style={{ width: 150 }} value={remarks[p.key] || ""} onChange={(e) => setRem(p.key, e.target.value)} placeholder="add note" /> },
  ];
  const itemCols = [
    { key: "date", w: 106, label: "Date", render: (p) => dateCell(p.date) },
    { key: "gd", w: 92, label: "GD code", render: (p) => <Mono>{p.it.gd}</Mono> },
    { key: "desc", label: "Description", render: (p) => <span style={{ color: "var(--ink)" }}>{p.it.description}</span> },
    { key: "pos", label: "PO(s)", render: (p) => <Mono>{p.pos.join(", ")}</Mono> },
    { key: "inv", label: "Cleared by invoice", render: (p) => <Mono>{joinInv(p.invoices)}</Mono> },
    { key: "qty", label: "Qty", align: "r", render: (p) => p.qty.toLocaleString("en-IN") },
    { key: "vb", label: "Vol/box", align: "r", render: (p) => num(p.it.volume, 3) },
    { key: "ordered", label: "Total boxes", align: "r", strong: true, render: (p) => p.ordered },
    { key: "recd", label: "Received", align: "r", render: (p) => p.recd },
    { key: "pending", label: "Pending", align: "r", render: (p) => pendingCell(p.pending) },
    { key: "vol", label: "Total vol m³", align: "r", render: (p) => num(p.volume, 3) },
  ];
  const supCols = [
    { key: "date", w: 106, label: "Date", render: (p) => dateCell(p.date) },
    { key: "gd", w: 92, label: "GD code", render: (p) => <Mono>{p.it.gd}</Mono> },
    { key: "sup", label: "Supplier", render: (p) => <Pill>{supCode(p.supplierId)}</Pill> },
    { key: "desc", label: "Description", render: (p) => <span style={{ color: "var(--ink)" }}>{p.it.description}</span> },
    { key: "inv", label: "Invoice", render: (p) => <Mono>{joinInv(p.invoices)}</Mono> },
    { key: "recd", label: "Received boxes", align: "r", strong: true, render: (p) => p.recd },
    { key: "pending", label: "Pending boxes", align: "r", render: (p) => pendingCell(p.pending) },
    { key: "vol", label: "Total vol m³", align: "r", render: (p) => num(p.volume, 3) },
    { key: "val", label: "Invoice value ₹", align: "r", render: (p) => inr(p.value) },
  ];

  const cfg = {
    po: { cols: poCols, rows: poRows, key: (p) => p.key, doc: "37", title: "Balance order · PO wise (buyer)", foot: "Received = boxes delivered against that PO. The invoice column shows which invoice cleared it — remarks are typed here and travel into the Excel." },
    item: { cols: itemCols, rows: itemRows, key: (p) => p.it.id, doc: "37", title: "Balance order · item wise", foot: "Which item sits in which PO and invoice, with pending boxes and total volume." },
    supplier: { cols: supCols, rows: supRows, key: (p) => p.supplierId + p.it.id, doc: "36", title: "Balance order · supplier wise", foot: "How many boxes we received from each supplier, per invoice, with pending balance and invoice value." },
  }[tab];

  const totalPending = itemRows.reduce((s, r) => s + r.pending, 0);
  const totalRecd = itemRows.reduce((s, r) => s + r.recd, 0);
  const totalOrdered = itemRows.reduce((s, r) => s + r.ordered, 0);

  return (
    <div className="stack">
      <Rail view="reports" go={go} />

      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Reports</h2>
          <p className="sub">
            The balance register, rebuilt from scratch every time you open it.{" "}
            <Info>Nothing is stored. Reports 36–39 are recomputed from the orders and the packing invoices, so they can never drift out of sync with reality.</Info>{" "}
            Ask it three questions: which order is short, which item is short, which supplier still owes us.
          </p>
        </div>
        <Btn size="lg" icon={Download} onClick={exportReport}>Download this report</Btn>
      </div>

      <div className="grid-4">
        <Stat icon={Boxes} value={totalOrdered} label="Boxes ordered" sub="Across every open PO" />
        <Stat icon={Check} tone="green" value={totalRecd} label="Boxes received" sub={`${totalOrdered ? Math.round((totalRecd / totalOrdered) * 100) : 0}% of the book`} />
        <Stat icon={BarChart3} tone={totalPending ? "amber" : "green"} value={totalPending} label="Boxes pending" sub="Still owed by suppliers" />
        <Stat icon={Truck} value={supRows.length} label="Supplier · item lines" sub="Delivered so far" />
      </div>

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <Seg options={[["po", "By purchase order", ClipboardList], ["item", "By item", Layers], ["supplier", "By supplier", Truck]]} value={tab} onChange={setTab} />
        <Pill tone="teal">Report {cfg.doc}</Pill>
      </div>

      <Card>
        <CardHead icon={BarChart3} title={cfg.title}>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Date &amp; GD code stay frozen while you scroll</span>
        </CardHead>
        {cfg.rows.length
          ? <DataTable columns={cfg.cols} rows={cfg.rows} rowKey={cfg.key} freeze={2} maxHeight={520} />
          : <Empty icon={BarChart3} title="Nothing to report yet">Record a packing invoice and the balance register fills in.</Empty>}
        <div className="card-foot"><Note tone="teal">{cfg.foot}</Note></div>
      </Card>
    </div>
  );
}
