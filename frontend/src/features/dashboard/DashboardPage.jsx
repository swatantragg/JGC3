import { useNavigate } from "react-router-dom";
import { Boxes, Ship, ClipboardList, Container } from "lucide-react";
import { useDashboardMatrix, useInvoices, useBuyers } from "../../api/hooks.js";
import { Card, CardHead, Pill, Mono, DataTable, Empty, Spinner, ErrorState } from "../../components/ui/index.jsx";
import { INV_STATUS_TONE } from "../../lib/constants.js";
import { dmy, num } from "../../lib/format.js";

/* Dashboard — live "Balance Orders, Boxes & Volume" matrix (doc 39) plus the
   invoice dispatch-status table. All figures come from the API; nothing seeded. */
export default function DashboardPage() {
  const nav = useNavigate();
  const mq = useDashboardMatrix();
  const iq = useInvoices();
  const bq = useBuyers();

  if (mq.isLoading || iq.isLoading) return <Spinner label="Loading dashboard…" />;
  if (mq.error) return <ErrorState error={mq.error} onRetry={mq.refetch} />;

  const M = mq.data;
  const buyers = bq.data || [];
  const invoices = iq.data || [];
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";
  const cntr = (vol) => (vol > 0 ? (vol / M.cntr_vol).toFixed(2) : "—");

  const invCols = [
    { key: "no", label: "Invoice", render: (r) => <Mono>{r.invoice_no}</Mono> },
    { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.date)}</span> },
    { key: "buyer", label: "Buyer", render: (r) => brand(r.buyer_id) },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.lines.reduce((s, l) => s + l.boxes, 0) },
    { key: "container", label: "Container", render: (r) => r.ship?.container ? <Mono>{r.ship.container}</Mono> : <span style={{ color: "var(--faint)" }}>—</span> },
    { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.status] || ""}>{r.status}</Pill> },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Dashboard</h2>
        <p className="sub">Balance orders — boxes &amp; volume still owed, supplier by supplier, across every open purchase order. Click a PO to open it, or an invoice to open the shipment.</p>
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
                  {M.pos.map((po) => [<th key={po + "b"} className="mx-sub">BOX</th>, <th key={po + "v"} className="mx-sub">VOL</th>])}
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
          <Empty icon={Boxes} title="No pending balance">Add masters and a purchase order in Setup / Purchase Orders — the matrix fills in from real data.</Empty>
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
          ? <DataTable columns={invCols} rows={invoices} rowKey={(r) => r.id} onRowClick={() => nav("/shipments")} />
          : <Empty icon={Ship} title="No invoices yet">Record packing to create the first invoice.</Empty>}
      </Card>
    </div>
  );
}
