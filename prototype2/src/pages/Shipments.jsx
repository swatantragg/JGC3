import { useState, useEffect } from "react";
import { Ship, FileText, History, Pencil, ChevronRight, AlertTriangle, ArrowRight, Anchor, Truck, Container } from "lucide-react";
import { useApp } from "../store.jsx";
import InvoiceModal from "../InvoiceModal.jsx";
import ShipmentWizard from "../ShipmentWizard.jsx";
import InvoiceEditModal from "../InvoiceEditModal.jsx";
import { Card, CardHead, Btn, Seg, Pill, Mono, DataTable, Empty, Note, Stat } from "../ui.jsx";
import { SHIPMENTS, invoiceTotals, invoiceStatus, INV_STATUS_TONE, dmy, num, usd } from "../data.js";

/* ============================================================
   Shipments — an invoice moves through three gated steps
   (vehicle → container → BL). The status column tracks it:
   Ready to dispatch → Dispatched → Ready to Ship → Shipped.
   ============================================================ */
export default function Shipments({ go, focus, clearFocus }) {
  const { items, invoices, buyerById } = useApp();
  const [tab, setTab] = useState("invoices");
  const [openId, setOpenId] = useState(null);   // invoice modal
  const [wizId, setWizId] = useState(null);      // shipment wizard
  const [editId, setEditId] = useState(null);    // edit/delete invoice

  // Deep-link from the dashboard: open the invoice that was clicked
  useEffect(() => {
    if (focus?.invId) { setOpenId(focus.invId); clearFocus && clearFocus(); }
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const openInv = invoices.find((i) => i.id === openId);
  const wizInv = invoices.find((i) => i.id === wizId);
  const editInv = invoices.find((i) => i.id === editId);

  const totalFob = invoices.reduce((s, i) => s + invoiceTotals(i, items).buyerAmt, 0);
  const byStatus = (st) => invoices.filter((i) => invoiceStatus(i) === st).length;

  const rows = invoices.map((inv) => ({ inv, t: invoiceTotals(inv, items), buyer: buyerById(inv.buyerId), status: invoiceStatus(inv) }));
  const history = SHIPMENTS.flatMap((s) => s.lines.map((l) => ({ ...l, ...s }))).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="stack">

      <div className="page-head">
        <h2 className="h1">Shipment details</h2>
        <p className="sub">
          Open an invoice and fill three gated steps — <b>vehicle details</b> (supplier-wise), <b>container details</b>, then <b>BL &amp; shipping</b>.
          Each unlocks the next, and the status moves from <b>Ready to dispatch</b> → <b>Dispatched</b> → <b>Ready to Ship</b> → <b>Shipped</b>.
        </p>
      </div>

      <div className="grid-4">
        <Stat icon={FileText} value={invoices.length} label="Invoices" sub="Across all buyers" />
        <Stat icon={Truck} tone={byStatus("Dispatched") ? "amber" : undefined} value={byStatus("Dispatched")} label="Dispatched" sub="Vehicle details in" />
        <Stat icon={Container} value={byStatus("Ready to Ship")} label="Ready to Ship" sub="Container details in" />
        <Stat icon={Ship} tone="green" value={byStatus("Shipped")} label="Shipped" sub={usd(totalFob) + " FOB total"} />
      </div>

      <Seg options={[["invoices", "Invoices", FileText], ["history", "Shipped history", History]]} value={tab} onChange={setTab} />

      {tab === "invoices" && (
        <Card>
          <CardHead icon={FileText} title={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}>
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row to open · edit shipment to advance the status</span>
          </CardHead>
          {invoices.length ? (
            <DataTable
              onRowClick={(r) => setOpenId(r.inv.id)}
              columns={[
                { key: "no", label: "Invoice", render: (r) => <Mono>{r.inv.invoiceNo}</Mono> },
                { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.inv.date)}</span> },
                { key: "buyer", label: "Buyer", render: (r) => <span style={{ color: "var(--ink)", fontWeight: 500 }}>{r.buyer.brand}</span> },
                { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.t.boxes },
                { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.t.volume, 3) },
                { key: "fob", label: "FOB $", align: "r", strong: true, render: (r) => usd(r.t.buyerAmt) },
                { key: "container", label: "Container", render: (r) => r.inv.ship?.container ? <Mono>{r.inv.ship.container}</Mono> : <span style={{ color: "var(--faint)" }}>—</span> },
                { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.status] || ""}>{r.status}</Pill> },
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
            <Empty icon={FileText} title="No invoices yet" action={<Btn icon={ArrowRight} onClick={() => go("packing")}>Go to packing</Btn>}>
              Invoices are created when you record what a supplier packed.
            </Empty>
          )}
          {invoices.length > 0 && (
            <div className="card-foot">
              <Note tone="teal">Fill the three shipment steps and every one of the 40 papers is populated from this invoice — same PO, dates, BL, container and quantities on every sheet.</Note>
            </div>
          )}
        </Card>
      )}

      {tab === "history" && (
        <Card>
          <CardHead icon={History} title="Boxes that have shipped" />
          <DataTable
            columns={[
              { key: "item", label: "Item", render: (r) => { const it = items.find((x) => x.id === r.itemId); return <span><Mono>{it?.gd}</Mono> <span style={{ color: "var(--ink)" }}>{it?.description}</span></span>; } },
              { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
              { key: "po", label: "Cleared PO", render: (r) => <Pill tone="amber">PO {r.po}</Pill> },
              { key: "date", label: "Shipped", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.date)}</span> },
              { key: "inv", label: "Invoice", render: (r) => <Mono>{r.invoice}</Mono> },
              { key: "container", label: "Container", render: (r) => <Mono>{r.container}</Mono> },
              { key: "vessel", label: "Vessel", render: (r) => r.vessel },
              { key: "bl", label: "BL", render: (r) => <Mono>{r.bl}</Mono> },
              { key: "pod", label: "Discharge", render: (r) => r.pod },
            ]}
            rows={history} rowKey={(r, i) => i}
          />
        </Card>
      )}

      {openInv && <InvoiceModal inv={openInv} onClose={() => setOpenId(null)} onEditShip={() => { setWizId(openInv.id); setOpenId(null); }} />}
      {wizInv && <ShipmentWizard inv={wizInv} onClose={() => setWizId(null)} />}
      {editInv && <InvoiceEditModal inv={editInv} onClose={() => setEditId(null)} />}
    </div>
  );
}
