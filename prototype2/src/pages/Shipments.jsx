import { useState } from "react";
import { Ship, FileText, History, Pencil, ChevronRight, AlertTriangle, ArrowRight, Anchor } from "lucide-react";
import { useApp } from "../store.jsx";
import Rail from "../Rail.jsx";
import InvoiceModal from "../InvoiceModal.jsx";
import { Card, CardHead, Btn, Seg, Pill, Mono, DataTable, Empty, Note, EditModal, Info, Stat } from "../ui.jsx";
import { SHIPMENTS, SHIP_FIELDS, SHIP_REQUIRED, shipComplete, invoiceTotals, dmy, num, usd } from "../data.js";

/* ============================================================
   Shipments — the single place where an invoice becomes a shipment.
   Fill four fields once (BL, vessel, container, port) and all 40
   documents render fully populated.
   ============================================================ */
export default function Shipments({ go }) {
  const { items, invoices, setInvoices, buyerById, toast } = useApp();
  const [tab, setTab] = useState("invoices");
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);

  const openInv = invoices.find((i) => i.id === openId);
  const editInv = invoices.find((i) => i.id === editId);

  const ready = invoices.filter((i) => shipComplete(i.ship));
  const pending = invoices.filter((i) => !shipComplete(i.ship));
  const totalFob = invoices.reduce((s, i) => s + invoiceTotals(i, items).buyerAmt, 0);

  const missing = (inv) => SHIP_REQUIRED.filter((k) => !inv.ship?.[k]).length;

  const rows = invoices.map((inv) => ({ inv, t: invoiceTotals(inv, items), buyer: buyerById(inv.buyerId), done: shipComplete(inv.ship) }));

  const history = SHIPMENTS.flatMap((s) => s.lines.map((l) => ({ ...l, ...s }))).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="stack">
      <Rail view="shipments" go={go} />

      <div className="page-head">
        <h2 className="h1">Shipments</h2>
        <p className="sub">
          Each packing invoice becomes a shipment once you add four things: <b>BL number, vessel, container and port of discharge</b>.{" "}
          <Info>These four fields are the only ones that gate the customs invoice (18) and the post-shipment set (30–34). Everything else on the shipment form is optional and pre-filled with your usual values.</Info>{" "}
          Fill them once, here — never again.
        </p>
      </div>

      <div className="grid-4">
        <Stat icon={FileText} value={invoices.length} label="Invoices raised" sub="Across all buyers" />
        <Stat icon={Ship} tone="green" value={ready.length} label="Ready to ship" sub="Shipment details complete" />
        <Stat icon={AlertTriangle} tone={pending.length ? "amber" : "green"} value={pending.length} label="Awaiting details" sub={pending.length ? `${missing(pending[0])} field(s) missing on ${pending[0].invoiceNo}` : "Nothing outstanding"} />
        <Stat icon={Anchor} value={usd(totalFob)} label="FOB value" sub="Total invoiced" />
      </div>

      <Seg options={[["invoices", "Invoices", FileText], ["history", "Shipped history", History]]} value={tab} onChange={setTab} />

      {tab === "invoices" && (
        <>
          {pending.length > 0 && (
            <Note tone="amber" icon={AlertTriangle}>
              <b>{pending.length} invoice{pending.length === 1 ? "" : "s"} cannot produce customs paperwork yet.</b>{" "}
              Add the shipment details and the documents fill themselves in.
            </Note>
          )}
          <Card>
            <CardHead icon={FileText} title={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}>
              <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row to open · buyer &amp; supplier views inside</span>
            </CardHead>
            {invoices.length ? (
              <DataTable
                onRowClick={(r) => setOpenId(r.inv.id)}
                columns={[
                  { key: "no", label: "Invoice", render: (r) => <Mono>{r.inv.invoiceNo}</Mono> },
                  { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.inv.date)}</span> },
                  { key: "buyer", label: "Buyer", render: (r) => <span style={{ color: "var(--ink)", fontWeight: 500 }}>{r.buyer.name} <span style={{ color: "var(--faint)" }}>· {r.buyer.brand}</span></span> },
                  { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.t.boxes },
                  { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.t.volume, 3) },
                  { key: "fob", label: "FOB value $", align: "r", strong: true, render: (r) => usd(r.t.buyerAmt) },
                  { key: "container", label: "Container", render: (r) => r.inv.ship?.container ? <Mono>{r.inv.ship.container}</Mono> : <span style={{ color: "var(--faint)" }}>—</span> },
                  { key: "status", label: "Status", render: (r) => r.done ? <Pill tone="green">ready to ship</Pill> : <Pill tone="amber">{missing(r.inv)} field(s) missing</Pill> },
                  {
                    key: "act", label: "", align: "r", render: (r) => (
                      <button className="btn btn-quiet btn-sm" onClick={(e) => { e.stopPropagation(); setEditId(r.inv.id); }}>
                        <Pencil size={13} /> {r.done ? "Edit" : "Add details"}
                      </button>
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
                <Note tone="teal">Once an invoice shows <b>ready to ship</b>, open <b>Documents</b> and every one of the 40 papers is populated from it — same PO, dates, BL, container and quantities on every sheet.</Note>
              </div>
            )}
          </Card>
        </>
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
          <div className="card-foot">
            <Note tone="teal">Pulled from the customs invoice, the commercial invoice &amp; CWD, and the balance register — one source, three documents.</Note>
          </div>
        </Card>
      )}

      {openInv && <InvoiceModal inv={openInv} onClose={() => setOpenId(null)} onEditShip={() => { setEditId(openInv.id); setOpenId(null); }} />}
      {editInv && (
        <EditModal title={`Shipment details · ${editInv.invoiceNo}`} schema={SHIP_FIELDS} value={editInv.ship}
          note="BL number, vessel, container and port of discharge are the four that unlock the customs invoice. The rest are optional."
          onClose={() => setEditId(null)}
          onSave={(f) => { setInvoices(invoices.map((x) => (x.id === editId ? { ...x, ship: f } : x))); setEditId(null); toast(`Shipment details saved for ${editInv.invoiceNo}`); }} />
      )}
    </div>
  );
}
