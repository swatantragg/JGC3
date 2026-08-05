import { useMemo, useState } from "react";
import { Ship, FileText, Pencil, ChevronRight, ArrowRight, Truck, Container } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardHead, Btn, Pill, Mono, DataTable, Empty, Note, Stat, Spinner, ErrorState,
} from "../../components/ui/index.jsx";
import { useInvoices, useItems, useBuyers } from "../../api/hooks.js";
import { dmy, num } from "../../lib/format.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";
import InvoiceModal from "../packing/InvoiceModal.jsx";
import InvoiceEditModal from "../packing/InvoiceEditModal.jsx";
import ShipmentWizard from "./ShipmentWizard.jsx";

/* Shipment details — an invoice moves through three gated steps
   (vehicle → container → BL). The status column tracks it:
   Ready to dispatch → Dispatched → Ready to Ship → Shipped. */
export default function ShipmentsPage() {
  const nav = useNavigate();
  const [openId, setOpenId] = useState(null);
  const [wizId, setWizId] = useState(null);
  const [editId, setEditId] = useState(null);

  const invq = useInvoices();
  const items = useItems().data || [];
  const buyers = useBuyers().data || [];
  const invoices = invq.data || [];

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";

  const rows = useMemo(() => invoices.map((inv) => {
    let boxes = 0; let volume = 0; let fob = 0;
    (inv.lines || []).forEach((l) => {
      const it = byId[l.item_id] || {};
      const b = Number(l.boxes) || 0;
      const pieces = b * (it.packing || 0);
      const rate = (it.fob_mode || "100") === "100" ? (it.unit_fob100 || 0) / 100 : (it.unit_fob100 || 0);
      boxes += b; volume += b * (it.volume || 0); fob += pieces * rate;
    });
    return { inv, boxes, volume, fob };
  }), [invoices, byId]);

  const totalBoxes = rows.reduce((s, r) => s + r.boxes, 0);
  const byStatus = (st) => invoices.filter((i) => i.status === st).length;

  const openInv = invoices.find((i) => i.id === openId);
  const wizInv = invoices.find((i) => i.id === wizId);
  const editInv = invoices.find((i) => i.id === editId);

  if (invq.isLoading) return <Spinner label="Loading invoices…" />;
  if (invq.error) return <ErrorState error={invq.error} onRetry={invq.refetch} />;

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Shipment details</h2>
      </div>

      <div className="grid-4">
        <Stat icon={FileText} value={invoices.length} label="Invoices" sub="Across all buyers" />
        <Stat icon={Truck} tone={byStatus("Dispatched") ? "amber" : undefined} value={byStatus("Dispatched")} label="Dispatched" sub="Vehicle details in" />
        <Stat icon={Container} value={byStatus("Ready to Ship")} label="Ready to Ship" sub="Container details in" />
        <Stat icon={Ship} tone="green" value={byStatus("Shipped")} label="Shipped" sub={`${totalBoxes} boxes in total`} />
      </div>

      <Card>
        <CardHead icon={FileText} title={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row to open · edit shipment to advance the status</span>
        </CardHead>
        {invoices.length ? (
          <DataTable serial
            freeze={5}
            onRowClick={(r) => setOpenId(r.inv.id)}
            columns={[
              { key: "no", w: 156, label: "Invoice", render: (r) => <Mono>{r.inv.invoice_no}</Mono> },
              { key: "date", w: 118, label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.inv.date)}</span> },
              { key: "buyer", w: 150, label: "Buyer", render: (r) => <span style={{ color: "var(--ink)", fontWeight: 500 }}>{brand(r.inv.buyer_id)}</span> },
              { key: "boxes", w: 78, label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
              { key: "vol", w: 106, label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
              { key: "container", label: "Container", render: (r) => r.inv.ship?.container ? <Mono>{r.inv.ship.container}</Mono> : <span style={{ color: "var(--faint)" }}>—</span> },
              { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.inv.status] || ""}>{r.inv.status}</Pill> },
              {
                key: "act", label: "", align: "r", render: (r) => (
                  <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn btn-quiet btn-sm" onClick={(e) => { e.stopPropagation(); setWizId(r.inv.id); }}><Ship size={13} /> Shipment</button>
                    <button className="btn btn-quiet btn-sm" onClick={(e) => { e.stopPropagation(); setEditId(r.inv.id); }}><Pencil size={13} /> Edit</button>
                  </span>
                ),
              },
              { key: "go", label: "", align: "r", render: () => <ChevronRight size={15} style={{ color: "var(--faint)" }} /> },
            ]}
            rows={rows} rowKey={(r) => r.inv.id}
          />
        ) : (
          <Empty icon={FileText} title="No invoices yet" action={<Btn icon={ArrowRight} onClick={() => nav("/packing")}>Go to packing</Btn>}>
            Invoices are created when you record what a supplier packed.
          </Empty>
        )}
        {invoices.length > 0 && (
          <div className="card-foot">
          </div>
        )}
      </Card>

      {openInv && <InvoiceModal inv={openInv} onClose={() => setOpenId(null)} onEditShip={() => { setWizId(openInv.id); setOpenId(null); }} />}
      {wizInv && <ShipmentWizard inv={wizInv} onClose={() => setWizId(null)} />}
      {editInv && <InvoiceEditModal inv={editInv} onClose={() => setEditId(null)} />}
    </div>
  );
}
