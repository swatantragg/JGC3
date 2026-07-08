import { useState } from "react";
import {
  PackageCheck, Plus, RotateCcw, Check, Search, Boxes, FileText, AlertTriangle, ArrowRight,
} from "lucide-react";
import { useApp } from "../store.jsx";
import Rail from "../Rail.jsx";
import InvoiceModal from "../InvoiceModal.jsx";
import {
  Card, CardHead, Btn, Field, Input, Select, Pill, Mono, DataTable, Drawer, Step,
  Empty, Note, Info, SearchInput, EditModal, Seg,
} from "../ui.jsx";
import {
  TODAY, dmy, num, shipComplete, invoiceTotals, bySupplier, EMPTY_SHIP, SHIP_FIELDS, SEED_INVOICES,
} from "../data.js";

/* ============================================================
   Packing — "what did the supplier actually deliver?"
   The word FIFO never appears as a demand on the user: boxes simply
   clear the oldest open order first, and we say so in plain English.
   ============================================================ */

function RecordPackingDrawer({ onClose }) {
  const { items, buyers, invoices, setInvoices, suppliersForItem, ledger, toast } = useApp();
  const [invoiceNo, setInvoiceNo] = useState("JG/26-27/6003");
  const [date, setDate] = useState(TODAY);
  const [buyerId, setBuyerId] = useState(buyers[0].id);
  const [boxesBy, setBoxesBy] = useState({});
  const [q, setQ] = useState("");

  const sorted = [...items].sort((a, b) => a.gd.localeCompare(b.gd));
  const shown = sorted.filter((it) => !q.trim() || (it.gd + it.code + it.description).toLowerCase().includes(q.trim().toLowerCase()));
  const setB = (k, v) => setBoxesBy((p) => ({ ...p, [k]: v }));

  /* Pending projected AFTER the boxes typed in this draft — allocated oldest-order-first */
  const projPending = (it) => {
    const b = ledger[it.id];
    if (!b) return { boxes: 0, pos: [] };
    let avail = suppliersForItem(it).reduce((s, sp) => s + (Number(boxesBy[it.id + "|" + sp.id]) || 0), 0);
    let pending = 0; const pos = [];
    b.demands.forEach((d) => { const take = Math.min(d.remaining, avail); const rem = d.remaining - take; avail -= take; if (rem > 0) { pending += rem; pos.push(d.po); } });
    return { boxes: pending, pos };
  };

  const rows = [];
  sorted.forEach((it) => suppliersForItem(it).forEach((sp) => {
    const k = it.id + "|" + sp.id, b = Number(boxesBy[k]) || 0;
    if (b > 0) { const pi = projPending(it); rows.push({ key: k, it, sp, boxes: b, volume: b * it.volume, pending: pi.boxes, pendingPos: pi.pos }); }
  }));
  const totalBoxes = rows.reduce((s, r) => s + r.boxes, 0);
  const totalVol = rows.reduce((s, r) => s + r.volume, 0);
  const supAgg = {};
  rows.forEach((r) => { (supAgg[r.sp.id] = supAgg[r.sp.id] || { code: r.sp.code, boxes: 0, volume: 0 }); supAgg[r.sp.id].boxes += r.boxes; supAgg[r.sp.id].volume += r.volume; });

  const create = () => {
    if (!rows.length) return;
    const inv = { id: "inv" + Date.now(), invoiceNo, date, buyerId, lines: rows.map((r) => ({ itemId: r.it.id, supplierId: r.sp.id, boxes: r.boxes })), ship: { ...EMPTY_SHIP } };
    setInvoices([inv, ...invoices]);
    toast(`Invoice ${invoiceNo} created — ${totalBoxes} boxes cleared against the oldest orders`);
    onClose();
  };

  return (
    <Drawer title="Record packing" subtitle="Boxes you enter here clear the oldest open order first." icon={PackageCheck} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {rows.length ? <>{rows.length} line{rows.length === 1 ? "" : "s"} · <b style={{ color: "var(--ink)" }}>{totalBoxes} boxes</b> · {num(totalVol, 3)} m³</> : "Enter boxes packed to begin"}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!rows.length} onClick={create}>Create invoice</Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <Step n="1" title="Which invoice are these boxes going on?" hint="One invoice can carry boxes from several suppliers." />
          <div className="grid-3">
            <Field label="Buyer"><Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>{buyers.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.brand}</option>)}</Select></Field>
            <Field label="Invoice number"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        </section>

        <section>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <Step n="2" title="How many boxes did each supplier pack?" hint="The pending figure on the right updates live as you type." />
            <div style={{ width: 240, marginBottom: 10 }}><SearchInput value={q} onChange={setQ} placeholder="Find an item…" /></div>
          </div>
          <Card>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {shown.map((it, i) => {
                const pi = projPending(it);
                return (
                  <div key={it.id} style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                    <div className="row" style={{ marginBottom: 8 }}>
                      <Mono>{it.gd}</Mono>
                      <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>{it.description}</span>
                      <span className="grow" />
                      {pi.boxes
                        ? <Pill tone="amber">{pi.boxes} still pending{pi.pos.length ? ` · PO ${pi.pos.join(", ")}` : ""}</Pill>
                        : <Pill tone="green"><Check size={11} /> clear</Pill>}
                    </div>
                    <div className="stack-sm">
                      {suppliersForItem(it).map((sp, si) => {
                        const k = it.id + "|" + sp.id;
                        return (
                          <div key={k} className="row" style={{ justifyContent: "space-between" }}>
                            <span className="row" style={{ minWidth: 0, gap: 8 }}>
                              <Pill tone={si ? "" : "teal"}>{sp.code}</Pill>
                              <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sp.name}</span>
                            </span>
                            <Input className={`input-sm num-in${boxesBy[k] ? " filled" : ""}`} style={{ width: 110 }} type="number" min="0" placeholder="0"
                              value={boxesBy[k] || ""} onChange={(e) => setB(k, e.target.value)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!shown.length && <Empty icon={Search} title="No item matches">Try the GD code, item code or description.</Empty>}
            </div>
          </Card>
        </section>

        <section>
          <Step n="3" title="Check before you create the invoice" />
          {rows.length ? (
            <div className="stack-sm">
              <Card>
                <DataTable
                  columns={[
                    { key: "gd", label: "GD code", render: (r) => <Mono>{r.it.gd}</Mono> },
                    { key: "sp", label: "Supplier", render: (r) => <Pill>{r.sp.code}</Pill> },
                    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
                    { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
                    { key: "pen", label: "Still pending", align: "r", render: (r) => <span style={{ fontWeight: 700, color: r.pending ? "var(--amber-ink)" : "var(--green-ink)" }}>{r.pending || "—"}</span> },
                    { key: "pos", label: "Orders left open", render: (r) => <Mono>{r.pendingPos.length ? "PO " + r.pendingPos.join(", ") : "—"}</Mono> },
                  ]}
                  rows={rows} rowKey={(r) => r.key}
                  footer={[{ v: "Total", span: 2 }, { v: totalBoxes, align: "r" }, { v: num(totalVol, 3), align: "r" }, { v: "", span: 2 }]}
                />
              </Card>
              <Card>
                <CardHead icon={Boxes} title="Supplier-wise totals" />
                <DataTable
                  columns={[
                    { key: "code", label: "Supplier", render: (s) => <Pill>{s.code}</Pill> },
                    { key: "boxes", label: "Total boxes", align: "r", strong: true, render: (s) => s.boxes },
                    { key: "vol", label: "Total volume m³", align: "r", render: (s) => num(s.volume, 3) },
                  ]}
                  rows={Object.values(supAgg)} rowKey={(s) => s.code}
                />
              </Card>
            </div>
          ) : (
            <Card><Empty icon={PackageCheck} title="Nothing packed yet">Type the boxes each supplier delivered and the invoice preview builds itself.</Empty></Card>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/* ============================================================ */
export default function Packing({ go }) {
  const { items, invoices, setInvoices, ledger, pendingBoxes, supCode, buyerById, toast } = useApp();
  const [drawer, setDrawer] = useState(false);
  const [selInv, setSelInv] = useState(null);
  const [editId, setEditId] = useState(null);
  const [tab, setTab] = useState("pending");

  const editInv = invoices.find((i) => i.id === editId);

  /* Everything still owed, item by item */
  const pendingRows = Object.values(ledger)
    .map((b) => ({ it: b.item, pending: b.demands.reduce((s, d) => s + d.remaining, 0), pos: b.demands.filter((d) => d.remaining > 0).map((d) => d.po), oldest: b.demands.find((d) => d.remaining > 0)?.date }))
    .filter((r) => r.pending > 0)
    .sort((a, b) => (a.oldest || "").localeCompare(b.oldest || ""));

  const invList = invoices.map((inv) => ({ inv, ...invoiceTotals(inv, items), sup: bySupplier(inv, items), buyer: buyerById(inv.buyerId) }));

  return (
    <div className="stack">
      <Rail view="packing" go={go} />

      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="page-head" style={{ margin: 0 }}>
          <h2 className="h1">Packing</h2>
          <p className="sub">
            Record the boxes each supplier delivers. They automatically clear the <b>oldest open order first</b>,{" "}
            <Info>Known in the trade as FIFO — first in, first out. You never choose which purchase order a box belongs to; the system always fills the oldest one, so nothing ages silently.</Info>{" "}
            and the balance register updates everywhere at once.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="quiet" size="sm" icon={RotateCcw} onClick={() => { setInvoices(SEED_INVOICES); toast("Demo data reset"); }}>Reset demo</Btn>
          <Btn size="lg" icon={Plus} onClick={() => setDrawer(true)}>Record packing</Btn>
        </div>
      </div>

      <Seg options={[["pending", `Still to pack${pendingBoxes ? ` · ${pendingBoxes}` : ""}`, Boxes], ["invoices", `Packing invoices · ${invoices.length}`, FileText]]} value={tab} onChange={setTab} />

      {tab === "pending" && (
        <Card>
          <CardHead icon={Boxes} title={pendingBoxes ? `${pendingBoxes} boxes owed to the buyer` : "Every order is filled"}>
            {pendingRows.length > 0 && <Btn size="sm" icon={Plus} onClick={() => setDrawer(true)}>Record packing</Btn>}
          </CardHead>
          {pendingRows.length ? (
            <>
              <DataTable
                columns={[
                  { key: "gd", label: "Item", render: (r) => <span><Mono>{r.it.gd}</Mono> <span style={{ color: "var(--ink)" }}>{r.it.description}</span></span> },
                  { key: "sup", label: "Primary supplier", render: (r) => <Pill>{supCode(r.it.supplierId)}</Pill> },
                  { key: "pack", label: "Packing", align: "r", render: (r) => `${r.it.packing} / box` },
                  { key: "pending", label: "Boxes pending", align: "r", strong: true, render: (r) => <span style={{ color: "var(--amber-ink)", fontWeight: 700 }}>{r.pending}</span> },
                  { key: "vol", label: "Volume owed m³", align: "r", render: (r) => num(r.pending * r.it.volume, 3) },
                  { key: "pos", label: "Open orders", render: (r) => <span className="row" style={{ gap: 4 }}>{r.pos.map((p) => <Pill key={p} tone="amber">PO {p}</Pill>)}</span> },
                  { key: "oldest", label: "Oldest order", render: (r) => <span style={{ color: "var(--muted)" }}>{r.oldest ? dmy(r.oldest) : "—"}</span> },
                ]}
                rows={pendingRows} rowKey={(r) => r.it.id}
              />
              <div className="card-foot">
                <Note tone="amber" icon={AlertTriangle}>Rows are sorted oldest order first — that is exactly the order your boxes will be allocated in.</Note>
              </div>
            </>
          ) : (
            <Empty icon={Check} title="Nothing pending" action={<Btn variant="ghost" icon={ArrowRight} onClick={() => go("shipments")}>Go to shipments</Btn>}>
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
            <DataTable
              onRowClick={(r) => setSelInv(r.inv)}
              columns={[
                { key: "no", label: "Invoice", render: (r) => <Mono>{r.inv.invoiceNo}</Mono> },
                { key: "date", label: "Date", render: (r) => <span style={{ color: "var(--muted)" }}>{dmy(r.inv.date)}</span> },
                { key: "buyer", label: "Buyer", render: (r) => r.buyer.brand },
                { key: "boxes", label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
                { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
                { key: "sup", label: "Received from", render: (r) => <span className="row" style={{ gap: 6 }}>{r.sup.map((s) => <span key={s.supplierId} className="row" style={{ gap: 3 }}><Pill>{supCode(s.supplierId)}</Pill><span style={{ fontSize: 11, color: "var(--faint)" }}>{s.boxes}bx</span></span>)}</span> },
                { key: "ship", label: "Shipment details", render: (r) => shipComplete(r.inv.ship) ? <Pill tone="green">complete</Pill> : <Pill tone="amber">pending</Pill> },
              ]}
              rows={invList} rowKey={(r) => r.inv.id}
            />
          ) : (
            <Empty icon={FileText} title="No packing invoices yet" action={<Btn icon={Plus} onClick={() => setDrawer(true)}>Record packing</Btn>}>Record what a supplier delivered and an invoice is created for you.</Empty>
          )}
        </Card>
      )}

      {drawer && <RecordPackingDrawer onClose={() => setDrawer(false)} />}
      {selInv && <InvoiceModal inv={selInv} onClose={() => setSelInv(null)} onEditShip={() => { setEditId(selInv.id); setSelInv(null); }} />}
      {editInv && (
        <EditModal title={`Shipment details · ${editInv.invoiceNo}`} schema={SHIP_FIELDS} value={editInv.ship}
          note="BL number, vessel, container and port of discharge unlock the customs invoice and every post-shipment document."
          onClose={() => setEditId(null)}
          onSave={(f) => { setInvoices(invoices.map((x) => (x.id === editId ? { ...x, ship: f } : x))); setEditId(null); toast(`Shipment details saved for ${editInv.invoiceNo}`); }} />
      )}
    </div>
  );
}
