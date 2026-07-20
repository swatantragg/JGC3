import { useState } from "react";
import { Ship, FileText, Truck, Container, Pencil, Trash2 } from "lucide-react";
import { Card, CardHead, Btn, Pill, Mono, DataTable, Empty, Spinner, ErrorState, Stat } from "../../components/ui/index.jsx";
import { useInvoices, useBuyers, useInvoiceMutations } from "../../api/hooks.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";
import { dmy } from "../../lib/format.js";
import ShipmentEditor from "./ShipmentEditor.jsx";

export default function ShipmentsPage() {
  const iq = useInvoices();
  const buyers = useBuyers().data || [];
  const { remove } = useInvoiceMutations();
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  if (iq.isLoading) return <Spinner label="Loading shipments…" />;
  if (iq.error) return <ErrorState error={iq.error} onRetry={iq.refetch} />;
  const invoices = iq.data || [];
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";
  const count = (st) => invoices.filter((i) => i.status === st).length;

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Shipment details</h2>
        <p className="sub">Advance each invoice through three gated steps — vehicle details (supplier-wise), container details, then BL &amp; shipping. The status moves Ready to dispatch → Dispatched → Ready to Ship → Shipped.</p>
      </div>

      <div className="grid-4">
        <Stat icon={FileText} value={invoices.length} label="Invoices" sub="All buyers" />
        <Stat icon={Truck} tone={count("Dispatched") ? "amber" : undefined} value={count("Dispatched")} label="Dispatched" sub="Vehicle details in" />
        <Stat icon={Container} value={count("Ready to Ship")} label="Ready to Ship" sub="Container details in" />
        <Stat icon={Ship} tone="green" value={count("Shipped")} label="Shipped" sub="BL & vessel in" />
      </div>

      <Card>
        <CardHead icon={FileText} title={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`} />
        {invoices.length ? (
          <DataTable
            columns={[
              { key: "no", label: "Invoice", render: (r) => <Mono>{r.invoice_no}</Mono> },
              { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.date)}</span> },
              { key: "buyer", label: "Buyer", render: (r) => brand(r.buyer_id) },
              { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.lines.reduce((s, l) => s + l.boxes, 0) },
              { key: "container", label: "Container", render: (r) => r.ship?.container ? <Mono>{r.ship.container}</Mono> : <span style={{ color: "var(--faint)" }}>—</span> },
              { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.status] || ""}>{r.status}</Pill> },
              {
                key: "_act", label: "", align: "r", render: (r) => (
                  <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn btn-quiet btn-sm" onClick={() => setEditing(r)}><Pencil size={13} /> Shipment</button>
                    {confirmId === r.id
                      ? <><Btn variant="danger" size="sm" icon={Trash2} onClick={() => remove.mutate(r.id, { onSettled: () => setConfirmId(null) })}>Confirm</Btn><Btn variant="ghost" size="sm" onClick={() => setConfirmId(null)}>No</Btn></>
                      : <button className="icon-btn bare" title="Delete invoice" onClick={() => setConfirmId(r.id)}><Trash2 size={14} /></button>}
                  </span>
                ),
              },
            ]}
            rows={invoices} rowKey={(r) => r.id}
          />
        ) : <Empty icon={FileText} title="No invoices yet">Record packing to create an invoice, then add its shipment details here.</Empty>}
      </Card>

      {editing && <ShipmentEditor inv={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
