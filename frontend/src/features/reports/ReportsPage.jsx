import { useState } from "react";
import { BarChart3, ClipboardList, Layers, Boxes, Check } from "lucide-react";
import { Card, CardHead, Seg, Pill, Mono, DataTable, Empty, Spinner, ErrorState, Stat } from "../../components/ui/index.jsx";
import { useBalance, useBuyers } from "../../api/hooks.js";
import { dmy, num } from "../../lib/format.js";

/* Balance register — recomputed on the server from orders + packing invoices. */
export default function ReportsPage() {
  const [tab, setTab] = useState("po");
  const bq = useBalance();
  const buyers = useBuyers().data || [];
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";

  if (bq.isLoading) return <Spinner label="Loading balance register…" />;
  if (bq.error) return <ErrorState error={bq.error} onRetry={bq.refetch} />;
  const data = bq.data || { po: [], item: [] };

  const totOrdered = data.item.reduce((s, r) => s + r.ordered, 0);
  const totRecd = data.item.reduce((s, r) => s + r.recd, 0);
  const totPending = data.item.reduce((s, r) => s + r.pending, 0);
  const pend = (v) => <span style={{ fontWeight: 700, color: v ? "var(--amber-ink)" : "var(--green-ink)" }}>{v || "—"}</span>;

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Reports</h2>
        <p className="sub">The balance register, rebuilt from the orders and packing invoices — which order is short, which item is short.</p>
      </div>

      <div className="grid-4">
        <Stat icon={Boxes} value={totOrdered} label="Boxes ordered" sub="Across every PO" />
        <Stat icon={Check} tone="green" value={totRecd} label="Boxes received" sub={`${totOrdered ? Math.round((totRecd / totOrdered) * 100) : 0}% of the book`} />
        <Stat icon={BarChart3} tone={totPending ? "amber" : "green"} value={totPending} label="Boxes pending" sub="Still owed" />
        <Stat icon={Layers} value={data.item.length} label="Items tracked" sub="With open orders" />
      </div>

      <Seg options={[["po", "By purchase order", ClipboardList], ["item", "By item", Layers]]} value={tab} onChange={setTab} />

      {tab === "po" && (
        <Card>
          <CardHead icon={ClipboardList} title="Balance order · PO wise" />
          {data.po.length ? (
            <DataTable maxHeight={560}
              columns={[
                { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.date)}</span> },
                { key: "gd", label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                { key: "po", label: "PO", render: (r) => <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{r.po}</span> },
                { key: "buyer", label: "Buyer", render: (r) => brand(r.buyer_id) },
                { key: "desc", label: "Description" },
                { key: "inv", label: "Cleared by", render: (r) => <Mono>{r.invoices.join(", ") || "—"}</Mono> },
                { key: "ordered", label: "Boxes", align: "r", strong: true },
                { key: "recd", label: "Received", align: "r" },
                { key: "pending", label: "Pending", align: "r", render: (r) => pend(r.pending) },
                { key: "vol", label: "Vol m³", align: "r", render: (r) => num(r.volume, 3) },
              ]}
              rows={data.po} rowKey={(r, i) => r.po + r.gd + i}
            />
          ) : <Empty icon={BarChart3} title="Nothing to report yet">Record a packing invoice and the register fills in.</Empty>}
        </Card>
      )}

      {tab === "item" && (
        <Card>
          <CardHead icon={Layers} title="Balance order · item wise" />
          {data.item.length ? (
            <DataTable maxHeight={560}
              columns={[
                { key: "gd", label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                { key: "desc", label: "Description", strong: true },
                { key: "pos", label: "PO(s)", render: (r) => <Mono>{r.pos.join(", ")}</Mono> },
                { key: "inv", label: "Invoice(s)", render: (r) => <Mono>{r.invoices.join(", ") || "—"}</Mono> },
                { key: "ordered", label: "Total boxes", align: "r", strong: true },
                { key: "recd", label: "Received", align: "r" },
                { key: "pending", label: "Pending", align: "r", render: (r) => pend(r.pending) },
                { key: "vol", label: "Total vol m³", align: "r", render: (r) => num(r.volume, 3) },
              ]}
              rows={data.item} rowKey={(r) => r.item_id}
            />
          ) : <Empty icon={BarChart3} title="Nothing to report yet">Record a packing invoice and the register fills in.</Empty>}
        </Card>
      )}
    </div>
  );
}
