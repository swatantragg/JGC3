import { useMemo } from "react";
import { Boxes, Ship, ClipboardList, Container } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHead, Pill, Mono, DataTable, Empty, Spinner, ErrorState } from "../../components/ui/index.jsx";
import { useDashboardMatrix, useInvoices, useItems, useBuyers } from "../../api/hooks.js";
import { dmy, num } from "../../lib/format.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";

/* Dashboard — the client's "Balance Orders, Boxes & Volume" sheet (doc 39),
   live: suppliers down the side, every open PO across the top, pending boxes
   and volume in each cell, a TOTAL row and estimated containers. Below it the
   invoices with their dispatch → ship status. Clicking a PO or an invoice
   jumps straight to it. */
export default function DashboardPage() {
  const nav = useNavigate();
  const mq = useDashboardMatrix();
  const invq = useInvoices();
  const items = useItems().data || [];
  const buyers = useBuyers().data || [];

  const invoices = invq.data || [];
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";

  const invRows = useMemo(() => invoices.map((inv) => {
    let boxes = 0; let volume = 0;
    (inv.lines || []).forEach((l) => {
      const it = byId[l.item_id] || {};
      const b = Number(l.boxes) || 0;
      boxes += b; volume += b * (it.volume || 0);
    });
    return { inv, boxes, volume };
  }), [invoices, byId]);

  if (mq.isLoading) return <Spinner label="Rebuilding the balance register…" />;
  if (mq.error) return <ErrorState error={mq.error} onRetry={mq.refetch} />;

  const M = mq.data;
  const cntr = (vol) => (vol > 0 ? (vol / M.cntr_vol).toFixed(2) : "—");

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
                    <th key={po} colSpan={2} className="mx-po" onClick={() => nav("/orders")} title={`Open PO ${po}`}>
                      <span className="mx-poname">PO {po}</span>
                      <span className="mx-podate">{dmy(M.po_date[po])}</span>
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
        {invoices.length ? (
          <DataTable serial
            freeze={5}
            columns={[
              { key: "no", w: 156, label: "Invoice", render: (r) => <Mono>{r.inv.invoice_no}</Mono> },
              { key: "date", w: 118, label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.inv.date)}</span> },
              { key: "buyer", w: 150, label: "Buyer", render: (r) => brand(r.inv.buyer_id) },
              { key: "boxes", w: 78, label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
              { key: "vol", w: 106, label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
              { key: "container", label: "Container", render: (r) => r.inv.ship?.container ? <Mono>{r.inv.ship.container}</Mono> : <span style={{ color: "var(--faint)" }}>—</span> },
              { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.inv.status] || ""}>{r.inv.status}</Pill> },
            ]}
            rows={invRows} rowKey={(r) => r.inv.id}
            onRowClick={() => nav("/shipments")}
          />
        ) : <Empty icon={Ship} title="No invoices yet">Record packing to create the first invoice.</Empty>}
      </Card>
    </div>
  );
}
