import { useMemo, useState } from "react";
import { ClipboardList, Check, Search } from "lucide-react";
import {
  Card, Btn, Field, Input, Select, Pill, Mono, DataTable, Drawer, Step, Empty, SearchInput,
} from "../../components/ui/index.jsx";
import { useGroupedItems, useBuyers, useSuppliers, usePoMutations, useDerive } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { todayISO, num, inr, usd } from "../../lib/format.js";
import { useDebounced } from "../../lib/useDebounced.js";

/* New buyer order — three steps.

   The master carries a row per supplier per product, so a GD code that two
   factories make appears once with a box against each of them. That is
   exactly the question being asked: how many pieces, from which supplier.

   There is no RBI rate here. It belongs to the packing date, not the order
   date, so it is captured at Record packing. */
export default function NewOrderDrawer({ onClose }) {
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const { create } = usePoMutations();
  const toast = useToast();

  const [po, setPo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [buyerId, setBuyerId] = useState("");
  const [qtys, setQtys] = useState({});      // item id → typed quantity
  const [q, setQ] = useState("");

  const groups = useGroupedItems({ q: useDebounced(q) }).data || [];
  const supName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  const setQty = (id, v) => setQtys((p) => ({ ...p, [id]: v }));

  const chosen = useMemo(
    () => Object.entries(qtys).map(([id, v]) => ({ item_id: id, qty: Number(v) || 0, rbi: 0 }))
      .filter((r) => r.qty > 0),
    [qtys],
  );
  const derived = useDerive(useDebounced(chosen, 350));
  const rows = derived.data?.rows || [];
  const t = derived.data?.totals || {};

  const save = () => {
    if (!po || !chosen.length) return;
    create.mutate(
      { po, date, buyer_id: buyerId || null, rbi: 0, lines: chosen.map((r) => ({ item_id: r.item_id, qty: r.qty })) },
      {
        onSuccess: () => {
          toast(`Order ${po} added — ${chosen.length} line${chosen.length === 1 ? "" : "s"}, ${t.boxes || 0} boxes`);
          onClose();
        },
      },
    );
  };

  return (
    <Drawer title="New buyer order" subtitle="Three steps. Everything else is worked out for you."
      icon={ClipboardList} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {chosen.length
            ? <>{chosen.length} line{chosen.length === 1 ? "" : "s"} · <b style={{ color: "var(--ink)" }}>{t.boxes || 0} boxes</b> · {num(t.vol_total || 0, 3)} m³ · {usd(t.total_fob_usd || 0)}</>
            : "Type a quantity to begin"}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!po || !chosen.length || create.isPending} onClick={save}>
            {create.isPending ? "Saving…" : `Add ${chosen.length || ""} line${chosen.length === 1 ? "" : "s"} to order`}
          </Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <Step n="1" title="Who is this order for?" hint="Buyer, PO number and order date. The RBI rate is captured later, at Record packing." />
          <div className="grid-3">
            <Field label="Buyer">
              <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                <option value="">—</option>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.brand ? ` — ${b.brand}` : ""}</option>)}
              </Select>
            </Field>
            <Field label="PO number"><Input value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. 03540" /></Field>
            <Field label="Order date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        </section>

        <section>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <Step n="2" title="How many pieces, from which supplier?" hint="Leave a box empty to skip that supplier." />
            <div style={{ width: 240, marginBottom: 10 }}>
              <SearchInput value={q} onChange={setQ} placeholder="Find an item…" />
            </div>
          </div>
          <Card>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {groups.map((g, i) => (
                <div key={g.key} style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <Mono>{g.gd}</Mono>
                    <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", whiteSpace: "pre-line" }}>{g.description}</span>
                    <span className="grow" />
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>
                      {g.mixed_packing ? "packing varies by supplier" : `${g.packing} ${g.uom === "MTR" ? "m" : "pcs"} / box`}
                    </span>
                  </div>
                  <div className="stack-sm">
                    {g.variants.map((v, si) => {
                      const qty = Number(qtys[v.item_id]) || 0;
                      return (
                        <div key={v.item_id} className="row" style={{ justifyContent: "space-between" }}>
                          <span className="row" style={{ minWidth: 0, gap: 8 }}>
                            <Pill tone={si ? "" : "teal"}>{supCode(v.supplier_id)}</Pill>
                            <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {supName(v.supplier_id)}{g.mixed_packing ? ` · ${v.packing}/box` : ""}
                            </span>
                          </span>
                          <span className="row" style={{ gap: 8 }}>
                            {qty > 0 && (
                              <span style={{ fontSize: 11.5, color: "var(--teal-ink)", fontWeight: 600 }}>
                                = {Math.ceil(qty / (v.packing || 1))} boxes
                              </span>
                            )}
                            <Input className={`input-sm num-in${qty ? " filled" : ""}`} style={{ width: 118 }}
                              type="number" min="0" placeholder="0"
                              value={qtys[v.item_id] || ""} onChange={(e) => setQty(v.item_id, e.target.value)} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!groups.length && <Empty icon={Search} title="No item matches">Try the GD code, the item code, the supplier, or part of the description.</Empty>}
            </div>
          </Card>
        </section>

        <section>
          <Step n="3" title="Check the summary" hint="Boxes, volume and value update as you type." />
          {rows.length ? (
            <Card>
              <DataTable serial
                freeze={5}
                columns={[
                  { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                  { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code}</Mono> },
                  { key: "sp", w: 96, label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
                  { key: "qty", w: 96, label: "Pieces", align: "r", render: (r) => num(r.qty, 0) },
                  { key: "boxes", w: 74, label: "Boxes", align: "r", strong: true, render: (r) => r.boxes },
                  { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.vol_total, 3) },
                  { key: "sheets", label: "Label sheets", align: "r", render: (r) => r.sheets },
                  { key: "val", label: "Cost ₹", align: "r", render: (r) => inr(r.total_value_inr) },
                  { key: "fob", label: "FOB $", align: "r", render: (r) => usd(r.total_fob_usd) },
                ]}
                rows={rows} rowKey={(r) => r.item_id}
                footer={[
                  { v: `Total · ${rows.length} line(s)`, span: 3 },
                  { v: num(t.qty || 0, 0), align: "r" }, { v: t.boxes, align: "r" },
                  { v: num(t.vol_total, 3), align: "r" }, { v: Math.round(t.sheets || 0), align: "r" },
                  { v: inr(t.total_value_inr), align: "r" }, { v: usd(t.total_fob_usd), align: "r" },
                ]}
              />
            </Card>
          ) : (
            <Card><Empty icon={ClipboardList} title="Nothing entered yet">Type a quantity above and the line appears here, with boxes and value already calculated.</Empty></Card>
          )}
        </section>
      </div>
    </Drawer>
  );
}
