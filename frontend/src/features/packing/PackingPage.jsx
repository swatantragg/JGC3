import { useMemo, useState } from "react";
import { Plus, Check, Boxes, FileText, AlertTriangle, ArrowRight, Truck, Hash } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardHead, Btn, Seg, Select, Pill, Mono, DataTable, Empty, Note, Info, Spinner, ErrorState,
} from "../../components/ui/index.jsx";
import { useInvoices, useBalance, useItems, useSuppliers, useBuyers } from "../../api/hooks.js";
import { dmy, num } from "../../lib/format.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";
import RecordPackingDrawer from "./RecordPackingDrawer.jsx";
import InvoiceModal from "./InvoiceModal.jsx";
import InvoiceEditModal from "./InvoiceEditModal.jsx";
import ShipmentWizard from "../shipments/ShipmentWizard.jsx";

/* Shipment — "what did the supplier actually deliver?"

   FIFO is never asked of the user: boxes simply clear the oldest open order
   first, and the page says so in plain English. */
export default function PackingPage() {
  const nav = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [selId, setSelId] = useState(null);
  const [wizId, setWizId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [tab, setTab] = useState("pending");
  const [supFilter, setSupFilter] = useState("");

  const invq = useInvoices();
  const balq = useBalance();
  const items = useItems().data || [];
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];

  const invoices = invq.data || [];
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  const selInv = invoices.find((i) => i.id === selId);
  const wizInv = invoices.find((i) => i.id === wizId);
  const editInv = invoices.find((i) => i.id === editId);

  /* Everything still owed, item by item, oldest order first — that is exactly
     the order the boxes will be allocated in. */
  const allPending = useMemo(
    () => (balq.data?.item || []).filter((r) => r.pending > 0)
      .sort((a, b) => String(a.oldest || "").localeCompare(String(b.oldest || ""))),
    [balq.data],
  );
  /* Narrowed to one factory — "what am I still waiting on from Kiran" is the
     question this page gets asked before every collection. */
  const pendingRows = useMemo(
    () => (supFilter ? allPending.filter((r) => r.supplier_id === supFilter) : allPending),
    [allPending, supFilter],
  );
  const pendingBoxes = pendingRows.reduce((s, r) => s + r.pending, 0);
  const allPendingBoxes = allPending.reduce((s, r) => s + r.pending, 0);
  // Only offer suppliers that actually owe something.
  const owingSuppliers = useMemo(() => {
    const ids = new Set(allPending.map((r) => r.supplier_id).filter(Boolean));
    return suppliers.filter((s) => ids.has(s.id));
  }, [allPending, suppliers]);

  const invList = useMemo(() => invoices.map((inv) => {
    const lines = (inv.lines || []).map((l) => {
      const it = byId[l.item_id] || {};
      const boxes = Number(l.boxes) || 0;
      return { ...l, boxes, volume: boxes * (it.volume || 0) };
    });
    const sup = {};
    lines.forEach((l) => {
      sup[l.supplier_id] = sup[l.supplier_id] || { supplierId: l.supplier_id, boxes: 0 };
      sup[l.supplier_id].boxes += l.boxes;
    });
    return {
      inv,
      boxes: lines.reduce((s, l) => s + l.boxes, 0),
      volume: lines.reduce((s, l) => s + l.volume, 0),
      sup: Object.values(sup),
    };
  }), [invoices, byId]);

  if (invq.isLoading || balq.isLoading) return <Spinner label="Loading the packing register…" />;
  if (invq.error) return <ErrorState error={invq.error} onRetry={invq.refetch} />;

  return (
    <div className="stack">
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Shipment</h2>
        </div>
        <Btn size="lg" icon={Plus} onClick={() => setDrawer(true)}>Record packing</Btn>
      </div>

      <Seg options={[
        ["pending", `Still to pack${allPendingBoxes ? ` · ${allPendingBoxes}` : ""}`, Boxes],
        ["invoices", `Packing invoices · ${invoices.length}`, FileText],
      ]} value={tab} onChange={setTab} />

      {tab === "pending" && (
        <Card>
          <CardHead icon={Boxes} title={pendingBoxes
            ? `${pendingBoxes} boxes owed${supFilter ? ` by ${supCode(supFilter)}` : " to the buyer"}`
            : supFilter ? `${supCode(supFilter)} owes nothing` : "Every order is filled"}>
            <Select className="input-sm" style={{ width: 220 }} value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
              <option value="">All suppliers{allPendingBoxes ? ` · ${allPendingBoxes} boxes` : ""}</option>
              {owingSuppliers.map((s) => {
                const owed = allPending.filter((r) => r.supplier_id === s.id).reduce((n, r) => n + r.pending, 0);
                return <option key={s.id} value={s.id}>{s.code} — {s.name} · {owed} boxes</option>;
              })}
            </Select>
            {supFilter && <Btn size="sm" variant="ghost" onClick={() => setSupFilter("")}>Clear</Btn>}
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Oldest order first — the order your boxes will be allocated in</span>
          </CardHead>
          {pendingRows.length ? (
            <>
              <DataTable serial paginate
                freeze={5}
                columns={[
                  { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                  { key: "item", w: 220, label: "Item", render: (r) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{r.description}</span> },
                  { key: "sup", w: 118, label: "Primary supplier", render: (r) => <Pill tone={supFilter ? "teal" : ""}>{supCode(r.supplier_id)}</Pill> },
                  { key: "pack", w: 96, label: "Packing", align: "r", render: (r) => `${r.packing} / box` },
                  { key: "pending", w: 116, label: "Boxes pending", align: "r", strong: true, render: (r) => <span style={{ color: "var(--amber-ink)", fontWeight: 700 }}>{r.pending}</span> },
                  { key: "vol", label: "Volume owed m³", align: "r", render: (r) => num(r.pending * r.vol_per_box, 3) },
                  { key: "pos", label: "Open orders", render: (r) => <span className="row wrap" style={{ gap: 4 }}>{r.pending_pos.map((p) => <Pill key={p} tone="amber">PO {p}</Pill>)}</span> },
                  { key: "oldest", label: "Oldest order", render: (r) => <span style={{ color: "var(--muted)" }}>{r.oldest ? dmy(r.oldest) : "—"}</span> },
                ]}
                rows={pendingRows} rowKey={(r) => r.item_id}
              />
              <div className="card-foot">
                <Note tone="amber" icon={AlertTriangle}>
                  Rows are sorted oldest order first — that is exactly the order your boxes will be allocated in.
                  {supFilter && <> Showing <b>{supCode(supFilter)}</b> only; the whole book still owes <b>{allPendingBoxes}</b> boxes.</>}
                </Note>
              </div>
            </>
          ) : supFilter ? (
            /* Filtered to a supplier who owes nothing — say so, rather than
               claiming the whole order book is clear. */
            <Empty icon={Check} title={`${supCode(supFilter)} has delivered everything`}
              action={<Btn size="sm" variant="ghost" onClick={() => setSupFilter("")}>Show all suppliers</Btn>}>
              Nothing is outstanding with this supplier.
              {allPendingBoxes > 0 && <> Other suppliers still owe <b>{allPendingBoxes}</b> boxes.</>}
            </Empty>
          ) : (
            <Empty icon={Check} title="Nothing pending" action={<Btn variant="ghost" icon={ArrowRight} onClick={() => nav("/shipments")}>Go to shipment details</Btn>}>
              Every box ordered has been delivered and invoiced. Add shipment details next.
            </Empty>
          )}
        </Card>
      )}

      {tab === "invoices" && (
        <Card>
          <CardHead icon={FileText} title={`${invoices.length} packing invoice${invoices.length === 1 ? "" : "s"}`}>
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click a row to open the invoice</span>
          </CardHead>
          {invoices.length ? (
            <DataTable serial paginate
              freeze={5}
              onRowClick={(r) => setSelId(r.inv.id)}
              columns={[
                { key: "no", w: 156, label: "Invoice", render: (r) => <Mono>{r.inv.invoice_no}</Mono> },
                { key: "date", w: 118, label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.inv.date)}</span> },
                { key: "buyer", w: 150, label: "Buyer", render: (r) => brand(r.inv.buyer_id) },
                { key: "boxes", w: 78, label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
                { key: "vol", w: 106, label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
                { key: "sup", label: "Received from", render: (r) => <span className="row wrap" style={{ gap: 6 }}>{r.sup.map((s) => <span key={s.supplierId} className="row" style={{ gap: 3 }}><Pill>{supCode(s.supplierId)}</Pill><span style={{ fontSize: 11, color: "var(--faint)" }}>{s.boxes}bx</span></span>)}</span> },
                { key: "status", label: "Status", render: (r) => <Pill tone={INV_STATUS_TONE[r.inv.status] || ""}>{r.inv.status}</Pill> },
                {
                  key: "act", label: "", align: "r", render: (r) => (
                    <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn btn-quiet btn-sm" onClick={(e) => { e.stopPropagation(); setWizId(r.inv.id); }}><Truck size={13} /> Shipment</button>
                      <button className="btn btn-quiet btn-sm" onClick={(e) => { e.stopPropagation(); setEditId(r.inv.id); }}><Hash size={13} /> Edit</button>
                    </span>
                  ),
                },
              ]}
              rows={invList} rowKey={(r) => r.inv.id}
            />
          ) : (
            <Empty icon={FileText} title="No packing invoices yet">
              Record what a supplier delivered with the button above and an invoice is created for you.
            </Empty>
          )}
        </Card>
      )}

      {drawer && <RecordPackingDrawer onClose={() => setDrawer(false)} />}
      {selInv && <InvoiceModal inv={selInv} onClose={() => setSelId(null)}
        onEditShip={() => { setWizId(selInv.id); setSelId(null); }} />}
      {wizInv && <ShipmentWizard inv={wizInv} onClose={() => setWizId(null)} />}
      {editInv && <InvoiceEditModal inv={editInv} onClose={() => setEditId(null)} />}
    </div>
  );
}
