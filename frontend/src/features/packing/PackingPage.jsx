import { useState } from "react";
import { Plus, FileText, PackageCheck } from "lucide-react";
import { Card, CardHead, Btn, Pill, Mono, DataTable, Empty, Spinner, ErrorState } from "../../components/ui/index.jsx";
import { useInvoices, useBuyers, useSuppliers } from "../../api/hooks.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";
import { dmy } from "../../lib/format.js";
import NewInvoiceModal from "./NewInvoiceModal.jsx";

/* Packing — record what suppliers delivered as a real invoice. */
export default function PackingPage() {
  const [adding, setAdding] = useState(false);
  const iq = useInvoices();
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  if (iq.isLoading) return <Spinner label="Loading invoices…" />;
  if (iq.error) return <ErrorState error={iq.error} onRetry={iq.refetch} />;
  const invoices = iq.data || [];

  return (
    <div className="stack">
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Packing</h2>
          <p className="sub">Record the boxes each supplier delivers as an invoice, with its serial-carton range and RBI rate. Shipment details are added later on the Shipments page.</p>
        </div>
        <Btn size="lg" icon={Plus} onClick={() => setAdding(true)}>Record packing</Btn>
      </div>

      <Card>
        <CardHead icon={FileText} title={`${invoices.length} packing invoice${invoices.length === 1 ? "" : "s"}`} />
        {invoices.length ? (
          <DataTable
            columns={[
              { key: "no", label: "Invoice", render: (r) => <Mono>{r.invoice_no}</Mono> },
              { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.date)}</span> },
              { key: "buyer", label: "Buyer", render: (r) => brand(r.buyer_id) },
              { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.lines.reduce((s, l) => s + l.boxes, 0) },
              { key: "sup", label: "Received from", render: (r) => <span className="row" style={{ gap: 4 }}>{[...new Set(r.lines.map((l) => l.supplier_id))].map((s) => <Pill key={s}>{supCode(s)}</Pill>)}</span> },
              { key: "serial", label: "Serial start", render: (r) => <Mono>{r.serial_start || "—"}</Mono> },
              { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.status] || ""}>{r.status}</Pill> },
            ]}
            rows={invoices} rowKey={(r) => r.id}
          />
        ) : <Empty icon={PackageCheck} title="No packing invoices yet" action={<Btn icon={Plus} onClick={() => setAdding(true)}>Record packing</Btn>}>Record what a supplier delivered and an invoice is created.</Empty>}
      </Card>

      {adding && <NewInvoiceModal onClose={() => setAdding(false)} />}
    </div>
  );
}
