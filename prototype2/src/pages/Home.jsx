import { Boxes, Ship, ClipboardList, Container } from "lucide-react";
import { useApp } from "../store.jsx";
import { Card, CardHead, Pill, Mono, DataTable, Empty } from "../ui.jsx";
import {
  buildBalanceMatrix, invoiceTotals, invoiceStatus, INV_STATUS_TONE,
  dmy, num,
} from "../data.js";

/* ============================================================
   Dashboard — a live rebuild of the client's "Balance Orders,
   Boxes & Volume" sheet (doc 39): suppliers down the side, every
   open PO across the top, pending boxes & volume in each cell, a
   TOTAL row (sheet line 17) and estimated containers. Below it, a
   live invoice table with the dispatch → ship status. Clicking a
   PO or an invoice jumps straight to it.
   ============================================================ */
export default function Home({ go }) {
  const { items, suppliers, buyerMaster, invoices, buyerById, supCode } = useApp();

  const M = buildBalanceMatrix(buyerMaster, invoices, items, suppliers);
  const cntr = (vol) => (vol > 0 ? (vol / M.cntrVol).toFixed(2) : "—");

  /* ---- Invoice table (dispatch → ship status) ---- */
  const invRows = invoices.map((inv) => ({ inv, t: invoiceTotals(inv, items), buyer: buyerById(inv.buyerId), status: invoiceStatus(inv) }));
  const invCols = [
    { key: "no", label: "Invoice", render: (r) => <Mono>{r.inv.invoiceNo}</Mono> },
    { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.inv.date)}</span> },
    { key: "buyer", label: "Buyer", render: (r) => r.buyer.brand },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.t.boxes },
    { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.t.volume, 3) },
    { key: "container", label: "Container", render: (r) => r.inv.ship?.container ? <Mono>{r.inv.ship.container}</Mono> : <span style={{ color: "var(--faint)" }}>—</span> },
    { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.status] || ""}>{r.status}</Pill> },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Dashboard</h2>
        <p className="sub">Balance orders — boxes &amp; volume still owed, supplier by supplier, across every open purchase order. Click a PO to open it, or an invoice below to open the shipment.</p>
      </div>

      <Card>
        <CardHead icon={Boxes} title="Balance orders · boxes & volume">
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Pending only · click a PO header to open it</span>
        </CardHead>
        {M.rows.length ? (
          <div className="tbl-wrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th rowSpan={2} className="mx-sup">Supplier</th>
                  {M.pos.map((po) => (
                    <th key={po} colSpan={2} className="mx-po" onClick={() => go("orders", { po })} title={`Open PO ${po}`}>
                      <span className="mx-poname">PO {po}</span>
                      <span className="mx-podate">{dmy(M.poDate[po])}</span>
                    </th>
                  ))}
                  <th colSpan={2} className="mx-tot">TOTAL</th>
                  <th rowSpan={2} className="mx-tot">CNTRS</th>
                </tr>
                <tr>
                  {M.pos.map((po) => [
                    <th key={po + "b"} className="mx-sub">BOX</th>,
                    <th key={po + "v"} className="mx-sub">VOL</th>,
                  ])}
                  <th className="mx-sub mx-tot">BOX</th>
                  <th className="mx-sub mx-tot">VOL</th>
                </tr>
              </thead>
              <tbody>
                {M.rows.map((r) => (
                  <tr key={r.supplier.id}>
                    <td className="mx-sup"><Pill>{r.supplier.code}</Pill> <span style={{ color: "var(--ink)" }}>{r.supplier.name}</span></td>
                    {M.pos.map((po) => [
                      <td key={po + "b"} className="r">{r.cells[po].boxes || "—"}</td>,
                      <td key={po + "v"} className="r mx-vol">{r.cells[po].vol ? num(r.cells[po].vol, 2) : "—"}</td>,
                    ])}
                    <td className="r strong">{r.totBox}</td>
                    <td className="r strong">{num(r.totVol, 2)}</td>
                    <td className="r">{cntr(r.totVol)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="mx-sup">TOTAL</td>
                  {M.pos.map((po) => [
                    <td key={po + "b"} className="r">{M.totals.cells[po].boxes || "—"}</td>,
                    <td key={po + "v"} className="r mx-vol">{M.totals.cells[po].vol ? num(M.totals.cells[po].vol, 2) : "—"}</td>,
                  ])}
                  <td className="r">{M.totals.totBox}</td>
                  <td className="r">{num(M.totals.totVol, 2)}</td>
                  <td className="r">{cntr(M.totals.totVol)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <Empty icon={Boxes} title="Every order is filled">No boxes are pending across any purchase order.</Empty>
        )}
        <div className="card-foot">
          <div className="row wrap" style={{ gap: 18, fontSize: 12, color: "var(--muted)" }}>
            <span className="row" style={{ gap: 6 }}><Boxes size={13} /> {M.totals.totBox} boxes pending</span>
            <span className="row" style={{ gap: 6 }}><ClipboardList size={13} /> {M.pos.length} open PO(s)</span>
            <span className="row" style={{ gap: 6 }}><Container size={13} /> ≈ {M.containers} container(s) · {num(M.totals.totVol, 2)} m³</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead icon={Ship} title={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} · dispatch status`}>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row to open the shipment</span>
        </CardHead>
        {invoices.length
          ? <DataTable columns={invCols} rows={invRows} rowKey={(r) => r.inv.id} onRowClick={(r) => go("shipments", { invId: r.inv.id })} />
          : <Empty icon={Ship} title="No invoices yet">Record packing to create the first invoice.</Empty>}
      </Card>
    </div>
  );
}
