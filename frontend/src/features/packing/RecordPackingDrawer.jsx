import { useMemo, useState } from "react";
import { PackageCheck, Check, Search, Boxes } from "lucide-react";
import {
  Card, CardHead, Btn, Field, Input, Select, Pill, Mono, DataTable, Drawer, Step,
  Empty, SearchInput,
} from "../../components/ui/index.jsx";
import {
  useGroupedItems, useBuyers, useSuppliers, useTransports, useInvoiceMutations, useBalance,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { todayISO, num } from "../../lib/format.js";
import { useDebounced } from "../../lib/useDebounced.js";
import { transportsFor } from "../../lib/transports.js";

/* Record packing — boxes clear the oldest open order first.

   The RBI reference rate lives here, not at order entry: it is the rate on
   the day the goods were packed, which is what the customs invoice and the
   bank need. Serial (carton) numbers start here too. */
export default function RecordPackingDrawer({ onClose }) {
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const transports = useTransports().data || [];
  const balance = useBalance().data;
  const { create } = useInvoiceMutations();
  const toast = useToast();

  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [buyerId, setBuyerId] = useState("");
  const [rbi, setRbi] = useState("");
  const [serialStart, setSerialStart] = useState("2001");
  const [packingTransports, setPackingTransports] = useState({});
  const [boxesBy, setBoxesBy] = useState({});
  const [q, setQ] = useState("");
  const [supFilter, setSupFilter] = useState("");

  const fetched = useGroupedItems({ q: useDebounced(q), supplier_id: supFilter }).data || [];
  const supById = (id) => suppliers.find((s) => s.id === id) || {};
  const supCode = (id) => supById(id).code || "—";

  /* What each item still owes, before this draft. The balance register is the
     same ledger the packing allocation uses, so the projection below matches
     what the save will actually do. */
  const owed = useMemo(() => {
    const m = {};
    (balance?.item || []).forEach((r) => {
      m[r.item_id] = { boxes: r.pending, pos: r.pending_pos || [] };
    });
    return m;
  }, [balance]);

  /* Pending projected AFTER the boxes typed in this draft. Each supplier's
     row is its own master item, so the group's outstanding balance is the sum
     across its variants, less whatever has been typed against them. */
  const projPending = (variants) => {
    let boxes = 0;
    const pos = new Set();
    variants.forEach((v) => {
      const base = owed[v.item_id] || { boxes: 0, pos: [] };
      const left = Math.max(0, base.boxes - (Number(boxesBy[v.item_id]) || 0));
      boxes += left;
      if (left) base.pos.forEach((p) => pos.add(p));
    });
    return { boxes, pos: [...pos] };
  };

  const setB = (id, v) => setBoxesBy((p) => ({ ...p, [id]: v }));

  /* What is still owed goes to the top — that is the work. Items with nothing
     pending sink below, most-owed first within each block, so the list reads
     in the order the boxes actually need entering. */
  const groups = useMemo(() => {
    const owe = (g) => g.variants.reduce((s, v) => s + (owed[v.item_id]?.boxes || 0), 0);
    return [...fetched]
      .map((g) => ({ ...g, _owed: owe(g) }))
      .sort((a, b) => (b._owed - a._owed) || String(a.gd).localeCompare(String(b.gd)));
  }, [fetched, owed]);
  const pendingCount = groups.filter((g) => g._owed > 0).length;

  const rows = useMemo(() => {
    const out = [];
    groups.forEach((g) => g.variants.forEach((v) => {
      const b = Number(boxesBy[v.item_id]) || 0;
      if (b > 0) {
        out.push({
          key: v.item_id, gd: g.gd, description: g.description,
          item_id: v.item_id, supplier_id: v.supplier_id, boxes: b,
          volume: b * (v.volume || 0),
        });
      }
    }));
    return out;
  }, [groups, boxesBy]);

  const totalBoxes = rows.reduce((s, r) => s + r.boxes, 0);
  const totalVol = rows.reduce((s, r) => s + r.volume, 0);
  const supAgg = useMemo(() => {
    const g = {};
    rows.forEach((r) => {
      g[r.supplier_id] = g[r.supplier_id] || { supplierId: r.supplier_id, boxes: 0, volume: 0 };
      g[r.supplier_id].boxes += r.boxes;
      g[r.supplier_id].volume += r.volume;
    });
    return Object.values(g);
  }, [rows]);
  const supIds = supAgg.map((s) => s.supplierId);

  const save = () => {
    if (!invoiceNo || !rows.length) return;
    create.mutate(
      {
        invoice_no: invoiceNo, date, buyer_id: buyerId || null,
        rbi: Number(rbi) || 0, serial_start: Number(serialStart) || 0,
        packing_transports: packingTransports,
        lines: rows.map((r) => ({ item_id: r.item_id, supplier_id: r.supplier_id, boxes: r.boxes })),
      },
      {
        onSuccess: () => {
          toast(`Invoice ${invoiceNo} created — ${totalBoxes} boxes · serials ${serialStart}–${(Number(serialStart) || 0) + totalBoxes - 1}`);
          onClose();
        },
      },
    );
  };

  return (
    <Drawer title="Record packing" subtitle="Boxes you enter here clear the oldest open order first."
      icon={PackageCheck} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {rows.length
            ? <>{rows.length} line{rows.length === 1 ? "" : "s"} · <b style={{ color: "var(--ink)" }}>{totalBoxes} boxes</b> · {num(totalVol, 3)} m³</>
            : "Enter boxes packed to begin"}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!invoiceNo || !rows.length || create.isPending} onClick={save}>
            {create.isPending ? "Saving…" : "Create invoice"}
          </Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <Step n="1" title="Which invoice are these boxes going on?" hint="One invoice can carry boxes from several suppliers. Set the RBI rate and the carton serial start here." />
          <div className="grid-3">
            <Field label="Buyer">
              <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                <option value="">—</option>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.brand ? ` — ${b.brand}` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Invoice number"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="JG/26-27/6003" /></Field>
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="RBI rate ₹/$" hint="The Reserve Bank reference rate on the packing date — captured here, not at order entry.">
              <Input className="rate" type="number" step="0.01" value={rbi} onChange={(e) => setRbi(e.target.value)} placeholder="e.g. 87.25" />
            </Field>
            <Field label="Serial (carton) start" hint="The first carton number. Each line takes the next block of numbers, so ranges never overlap.">
              <Input type="number" value={serialStart} onChange={(e) => setSerialStart(e.target.value)} placeholder="e.g. 2001" />
            </Field>
          </div>
        </section>

        <section>
          <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
            <Step n="2" title="How many boxes did each supplier pack?" hint="Everything still pending is listed first. The figure on the right updates live as you type." />
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <Select className="input-sm" style={{ width: 210 }} value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
                <option value="">All suppliers</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </Select>
              <div style={{ width: 220 }}><SearchInput value={q} onChange={setQ} placeholder="Find an item…" /></div>
            </div>
          </div>
          <Card>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {groups.map((g, i) => {
                const pi = projPending(g.variants);
                // One divider between what is still owed and what is clear.
                const firstClear = g._owed === 0 && i > 0 && groups[i - 1]._owed > 0;
                return (
                  <div key={g.key}>
                    {firstClear && (
                      <div style={{ padding: "7px 14px", background: "var(--surface-2)", borderTop: "1px solid var(--border)", fontSize: 11, letterSpacing: 0.6, color: "var(--faint)", textTransform: "uppercase" }}>
                        Nothing pending · {groups.length - pendingCount} item(s)
                      </div>
                    )}
                    <div style={{ padding: "11px 14px", borderTop: i && !firstClear ? "1px solid var(--border)" : "none" }}>
                    <div className="row" style={{ marginBottom: 8 }}>
                      <Mono>{g.gd}</Mono>
                      <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", whiteSpace: "pre-line" }}>{g.description}</span>
                      <span className="grow" />
                      {pi.boxes
                        ? <Pill tone="amber">{pi.boxes} still pending{pi.pos.length ? ` · PO ${pi.pos.join(", ")}` : ""}</Pill>
                        : <Pill tone="green"><Check size={11} /> clear</Pill>}
                    </div>
                    <div className="stack-sm">
                      {g.variants.map((v, si) => (
                        <div key={v.item_id} className="row" style={{ justifyContent: "space-between" }}>
                          <span className="row" style={{ minWidth: 0, gap: 8 }}>
                            <Pill tone={si ? "" : "teal"}>{supCode(v.supplier_id)}</Pill>
                            <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {supById(v.supplier_id).name}
                            </span>
                          </span>
                          <Input className={`input-sm num-in${boxesBy[v.item_id] ? " filled" : ""}`} style={{ width: 110 }}
                            type="number" min="0" placeholder="0"
                            value={boxesBy[v.item_id] || ""} onChange={(e) => setB(v.item_id, e.target.value)} />
                        </div>
                      ))}
                    </div>
                    </div>
                  </div>
                );
              })}
              {!groups.length && <Empty icon={Search} title="No item matches">Try the GD code, item code, supplier or description.</Empty>}
            </div>
          </Card>
        </section>

        <section>
          <Step n="3" title="Check before you create the invoice" />
          {rows.length ? (
            <div className="stack-sm">
              <Card>
                <DataTable serial
                  freeze={5}
                  columns={[
                    { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                    { key: "desc", w: 220, label: "Description", render: (r) => <span style={{ whiteSpace: "pre-line" }}>{r.description}</span> },
                    { key: "sp", w: 92, label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
                    { key: "boxes", w: 78, label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
                    { key: "vol", w: 104, label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
                  ]}
                  rows={rows} rowKey={(r) => r.key}
                  footer={[{ v: "Total", span: 3 }, { v: totalBoxes, align: "r" }, { v: num(totalVol, 3), align: "r" }]}
                />
              </Card>
              <Card>
                <CardHead icon={Boxes} title="Supplier-wise totals" />
                <DataTable serial
                  columns={[
                    { key: "code", label: "Supplier", render: (s) => <Pill>{supCode(s.supplierId)}</Pill> },
                    { key: "boxes", label: "Total boxes", align: "r", strong: true, render: (s) => s.boxes },
                    { key: "vol", label: "Total volume m³", align: "r", render: (s) => num(s.volume, 3) },
                  ]}
                  rows={supAgg} rowKey={(s) => s.supplierId}
                />
              </Card>
            </div>
          ) : (
            <Card><Empty icon={PackageCheck} title="Nothing packed yet">Type the boxes each supplier delivered and the invoice preview builds itself.</Empty></Card>
          )}
        </section>

        {supIds.length > 0 && (
          <section>
            <Step n="4" title="Who is the transporter for each supplier?" hint="Pick the carrier that will move each supplier's boxes. Added under Setup → Transport." />
            <Card>
              <div className="stack-sm" style={{ padding: 14 }}>
                {supIds.map((sid) => {
                  const sp = supById(sid);
                  const opts = transportsFor(transports, sid);
                  return (
                    <div key={sid} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                      <span className="row" style={{ gap: 8 }}>
                        <Pill tone="teal">{sp.code}</Pill>
                        <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{sp.name}</span>
                      </span>
                      <Select style={{ width: 300 }} value={packingTransports[sid] || ""}
                        onChange={(e) => setPackingTransports((p) => ({ ...p, [sid]: e.target.value }))}>
                        <option value="">— select transporter —</option>
                        {opts.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.transport_id}</option>)}
                        {!opts.length && <option value="" disabled>No transport added for {sp.code}</option>}
                      </Select>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>
        )}
      </div>
    </Drawer>
  );
}
