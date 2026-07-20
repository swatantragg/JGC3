import { useState } from "react";
import { Plus, ClipboardList, Boxes, Check, Trash2 } from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Pill, Mono, DataTable, Empty, Spinner, ErrorState,
} from "../../components/ui/index.jsx";
import { usePoList, usePoMutations, useSuppliers, useBuyers, useItemDetail } from "../../api/hooks.js";
import { dmy, num } from "../../lib/format.js";
import NewOrderModal from "./NewOrderModal.jsx";

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="row" style={{ gap: 8, minWidth: 150 }}>
      <span style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: pct + "%", borderRadius: 99, background: pct === 100 ? "var(--green)" : "var(--amber)" }} />
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 650, minWidth: 34, textAlign: "right", color: pct === 100 ? "var(--green-ink)" : "var(--muted)" }}>{pct}%</span>
    </span>
  );
}

export default function OrdersPage() {
  const [tab, setTab] = useState("po");
  const [adding, setAdding] = useState(false);
  const [confirmPo, setConfirmPo] = useState(null);

  const poq = usePoList();
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const { remove } = usePoMutations();
  const detailq = useItemDetail();

  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";

  if (poq.isLoading) return <Spinner label="Loading purchase orders…" />;
  if (poq.error) return <ErrorState error={poq.error} onRetry={poq.refetch} />;
  const pos = poq.data || [];

  const detail = detailq.data || { pos: [], rows: [] };

  return (
    <div className="stack">
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Purchase Orders</h2>
          <p className="sub">Everything the buyer has asked for. Boxes, volume and delivery status are derived from the item master and packing invoices.</p>
        </div>
        <Btn size="lg" icon={Plus} onClick={() => setAdding(true)}>New purchase order</Btn>
      </div>

      <Seg options={[["po", "By purchase order", ClipboardList], ["itemdetail", "By item (order detail)", Boxes]]} value={tab} onChange={setTab} />

      {tab === "po" && (
        <Card>
          <CardHead icon={ClipboardList} title={`${pos.length} purchase order${pos.length === 1 ? "" : "s"}`} />
          {pos.length ? (
            <DataTable
              columns={[
                { key: "po", label: "PO", render: (p) => <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>{p.po}</span> },
                { key: "date", label: "Ordered", render: (p) => <span style={{ color: "var(--muted)" }}>{dmy(p.date)}</span> },
                { key: "buyer", label: "Buyer", render: (p) => brand(p.buyer_id) },
                { key: "prog", label: "Delivered", render: (p) => <Progress done={p.completed} total={p.ordered} /> },
                { key: "pen", label: "Pending", align: "r", render: (p) => <span style={{ fontWeight: 700, color: p.pending ? "var(--amber-ink)" : "var(--green-ink)" }}>{p.pending || "—"}</span> },
                { key: "sup", label: "Suppliers (pending)", render: (p) => p.open_suppliers.length ? <span className="row" style={{ gap: 4 }}>{p.open_suppliers.map((s) => <Pill key={s}>{supCode(s)}</Pill>)}</span> : <Pill tone="green"><Check size={11} /> all delivered</Pill> },
                { key: "vol", label: "Volume m³", align: "r", render: (p) => num(p.volume, 3) },
                {
                  key: "_act", label: "", align: "r", render: (p) => confirmPo === p.po
                    ? <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}><Btn variant="danger" size="sm" icon={Trash2} onClick={() => remove.mutate(p.po, { onSettled: () => setConfirmPo(null) })}>Confirm</Btn><Btn variant="ghost" size="sm" onClick={() => setConfirmPo(null)}>No</Btn></span>
                    : <button className="icon-btn bare" title="Delete PO" onClick={() => setConfirmPo(p.po)}><Trash2 size={14} /></button>,
                },
              ]}
              rows={pos} rowKey={(p) => p.po}
            />
          ) : <Empty icon={ClipboardList} title="No purchase orders yet" action={<Btn icon={Plus} onClick={() => setAdding(true)}>New purchase order</Btn>}>Create the first buyer order and it appears here with live delivery status.</Empty>}
        </Card>
      )}

      {tab === "itemdetail" && (
        <Card>
          <CardHead icon={Boxes} title={`${detail.rows.length} item(s) · ${detail.pos.length} PO column(s)`} />
          {detail.rows.length ? (
            <DataTable
              maxHeight={560}
              columns={[
                { key: "gd", label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                { key: "code", label: "Code", render: (r) => <Mono>{r.code}</Mono> },
                { key: "size", label: "Size" },
                { key: "packing", label: "Packing", align: "r" },
                ...detail.pos.map((po) => ({ key: "po_" + po, label: po, align: "r", render: (r) => r.per_po[po] ? r.per_po[po].toLocaleString("en-IN") : <span style={{ color: "var(--faint)" }}>—</span> })),
                { key: "qty", label: "Total pcs", align: "r", strong: true, render: (r) => r.qty.toLocaleString("en-IN") },
                { key: "boxes", label: "Boxes", align: "r", strong: true },
                { key: "tv", label: "Total vol m³", align: "r", render: (r) => num(r.total_vol, 2) },
                { key: "net", label: "Net wt kg", align: "r", render: (r) => num(r.net_total) },
              ]}
              rows={detail.rows} rowKey={(r) => r.item_id}
            />
          ) : <Empty icon={Boxes} title="No orders yet">Add a purchase order to see the item-wise detail.</Empty>}
        </Card>
      )}

      {adding && <NewOrderModal onClose={() => setAdding(false)} />}
    </div>
  );
}
