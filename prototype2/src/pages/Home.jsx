import {
  ClipboardList, PackageCheck, Ship, FileText, Boxes, Globe, Truck, ArrowRight, Sparkles, Anchor,
} from "lucide-react";
import { useApp } from "../store.jsx";
import Rail from "../Rail.jsx";
import { Card, CardHead, Stat, ActionCard, Pill, Mono, Eyebrow, DataTable, Btn } from "../ui.jsx";
import { SHIPMENT, SHIPMENTS, dmy, shipComplete, invoiceTotals, usd } from "../data.js";

/* ============================================================
   Home = "what should I do right now", not a wall of numbers.
   ============================================================ */
export default function Home({ go }) {
  const { items, buyers, suppliers, invoices, pendingBoxes, openPos, ledger } = useApp();

  const needsShip = invoices.filter((i) => !shipComplete(i.ship));
  const readyDocs = invoices.filter((i) => shipComplete(i.ship)).length;

  /* Next actions, ordered by what actually blocks a shipment */
  const actions = [];
  if (needsShip.length) actions.push({
    icon: Ship, tone: "amber", title: `Add shipment details to ${needsShip[0].invoiceNo}`,
    body: "BL number, vessel, container and port of discharge. Until these are in, the customs invoice and post-shipment papers stay blank.",
    go: "shipments",
  });
  if (pendingBoxes > 0) actions.push({
    icon: PackageCheck, tone: "teal", title: `${pendingBoxes} boxes still to pack`,
    body: `Across ${openPos.size} open purchase order${openPos.size === 1 ? "" : "s"}. Record what each supplier delivers — the oldest order is filled first, automatically.`,
    go: "packing",
  });
  actions.push({
    icon: ClipboardList, tone: "green", title: "Enter a new buyer order",
    body: "Pick the buyer, type quantities against a supplier, and the boxes, volume, labels and value are worked out for you.",
    go: "orders",
  });

  const recent = SHIPMENTS
    .flatMap((s) => s.lines.map((l) => ({ ...l, shipId: s.shipId, date: s.date })))
    .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  const recentCols = [
    { key: "item", label: "Item", render: (r) => { const it = items.find((x) => x.id === r.itemId); return <span><Mono>{it.gd}</Mono> <span style={{ color: "var(--ink)" }}>{it.description}</span></span>; } },
    { key: "boxes", label: "Boxes", align: "r", strong: true },
    { key: "po", label: "Cleared PO", render: (r) => <Pill tone="amber">PO {r.po}</Pill> },
    { key: "shipId", label: "Shipment", render: (r) => <Mono>{r.shipId}</Mono> },
    { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.date)}</span> },
  ];

  const totalFob = invoices.reduce((s, i) => s + invoiceTotals(i, items).buyerAmt, 0);

  return (
    <div className="stack">
      {/* Hero */}
      <div className="hero">
        <div className="hero-ghost">2001–2421</div>
        <div className="row" style={{ gap: 8 }}>
          <Sparkles size={14} style={{ color: "var(--amber)" }} />
          <span className="eyebrow" style={{ color: "#9fc0d8" }}>Jaikvin Global · Export operations</span>
        </div>
        <h2>Enter once. Generate everything.<br />Always balanced.</h2>
        <div className="row wrap" style={{ gap: 8, marginTop: 18 }}>
          {[["Invoice", SHIPMENT.invoice], ["Container", SHIPMENT.container], ["Route", `${SHIPMENT.pol} → ${SHIPMENT.pod}`], ["Marks", SHIPMENT.marks]].map(([k, v]) => (
            <span key={k} className="chip"><span className="ck">{k}</span><span className="cv">{v}</span></span>
          ))}
        </div>
      </div>

      {/* The whole system, in one line */}
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 9 }}>
          <Eyebrow>How the work flows</Eyebrow>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Click any step to jump straight in</span>
        </div>
        <Rail view="home" go={go} />
      </div>

      {/* Next actions */}
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 9 }}>
          <Eyebrow>Do this next</Eyebrow>
        </div>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
          {actions.slice(0, 3).map((a) => (
            <ActionCard key={a.title} icon={a.icon} tone={a.tone} title={a.title} onClick={() => go(a.go)}>{a.body}</ActionCard>
          ))}
        </div>
      </div>

      {/* Numbers */}
      <div className="grid-4">
        <Stat icon={Boxes} tone={pendingBoxes ? "amber" : "green"} value={pendingBoxes} label="Boxes pending" sub="Oldest order filled first" />
        <Stat icon={ClipboardList} value={openPos.size} label="Purchase orders open" sub={`${Object.keys(ledger).length} items tracked`} />
        <Stat icon={FileText} tone="green" value={`${readyDocs}/${invoices.length}`} label="Invoices document-ready" sub="Shipment details complete" />
        <Stat icon={Ship} value={usd(totalFob)} label="FOB value invoiced" sub={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} this season`} />
      </div>

      {/* Recent + who we trade with */}
      <div className="split" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" }}>
        <Card>
          <CardHead icon={PackageCheck} title="Recently shipped">
            <button className="btn btn-quiet btn-sm" onClick={() => go("shipments")}>Full history <ArrowRight size={13} /></button>
          </CardHead>
          <DataTable columns={recentCols} rows={recent} rowKey={(r, i) => i} />
        </Card>

        <Card>
          <CardHead icon={Anchor} title="Who we trade with" />
          <div style={{ padding: 16 }} className="stack-sm">
            {[
              { icon: Globe, label: `${buyers.length} buyer${buyers.length === 1 ? "" : "s"}`, sub: buyers.map((b) => b.brand).join(" · "), to: "setup" },
              { icon: Truck, label: `${suppliers.length} suppliers`, sub: "Daman · Vapi · Silvassa", to: "setup" },
              { icon: Boxes, label: `${items.length} items`, sub: "Codes, packing, prices, barcodes", to: "setup" },
            ].map((r) => (
              <button key={r.label} className="action" style={{ padding: 11 }} onClick={() => go(r.to)}>
                <span className="action-i" style={{ background: "var(--teal-bg)", color: "var(--teal-ink)", width: 30, height: 30 }}><r.icon size={15} /></span>
                <span className="grow"><h5>{r.label}</h5><p>{r.sub}</p></span>
              </button>
            ))}
            <div style={{ marginTop: 4 }}>
              <Btn variant="ghost" size="sm" icon={ArrowRight} onClick={() => go("setup")}>Open Setup</Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
