import { FileText, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHead, Pill, Mono, Empty, Note, Btn, Spinner } from "../../components/ui/index.jsx";
import { useInvoices } from "../../api/hooks.js";
import { dmy } from "../../lib/format.js";

/* Documents are generated per invoice. The generation engine (the 40 export
   papers) is the next phase — this page lists the invoices they build from so
   the wiring is already in place. */
const DOC_CATALOGUE = [
  ["PO Reports", ["Buyers Order", "Master (2A)", "Barcode", "Packing", "Purchase", "Sales", "Suppliers' PO"]],
  ["Suppliers' Reports", ["Master (7A)", "Packing", "Purchase", "Sales", "E-way (inward)", "Delivery order", "Despatch instr."]],
  ["Pre-Shipment", ["Boxes & volume", "Proforma", "Custom invoice", "Packing list", "SCOMET", "SDF", "RoDTEP", "VGM", "E-way (export)"]],
  ["Post-Shipment", ["Letter to buyer", "Commercial invoice", "Packing", "CWD", "Bill regularisation"]],
];

export default function DocumentsPage() {
  const nav = useNavigate();
  const iq = useInvoices();
  if (iq.isLoading) return <Spinner label="Loading invoices…" />;
  const invoices = iq.data || [];

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Documents</h2>
        <p className="sub">Every export paper is generated live from one invoice — same PO, dates, BL, container and quantities on every sheet.</p>
      </div>

      <Note tone="amber">
        The document generation engine (Excel export of all 40 papers) is scheduled for the next phase. The invoice data it reads from is already live below.
      </Note>

      <Card>
        <CardHead icon={FileText} title="Invoices available to build from" />
        {invoices.length ? (
          <div style={{ padding: 8 }}>
            {invoices.map((inv) => (
              <div key={inv.id} className="row" style={{ justifyContent: "space-between", padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
                <span className="row" style={{ gap: 10 }}><Mono>{inv.invoice_no}</Mono><span style={{ color: "var(--muted)" }}>{dmy(inv.date)}</span></span>
                <Pill tone="teal">{inv.status}</Pill>
              </div>
            ))}
          </div>
        ) : <Empty icon={FileText} title="No invoices yet" action={<Btn size="sm" iconRight={ArrowRight} onClick={() => nav("/packing")}>Record packing</Btn>}>Create an invoice and every document will build from it.</Empty>}
      </Card>

      <Card>
        <CardHead icon={FileText} title="Document catalogue (40 papers)" />
        <div style={{ padding: 16, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))" }}>
          {DOC_CATALOGUE.map(([group, docs]) => (
            <div key={group}>
              <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>{group}</div>
              <div className="row wrap" style={{ gap: 6 }}>{docs.map((d) => <Pill key={d}>{d}</Pill>)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
