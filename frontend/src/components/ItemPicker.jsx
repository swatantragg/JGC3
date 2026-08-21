import { useMemo, useState } from "react";
import { Plus, Search, Check } from "lucide-react";
import { Card, Btn, Select, Pill, Mono, Empty, SearchInput, NumberInput } from "./ui/index.jsx";
import { useGroupedItems, useSuppliers } from "../api/hooks.js";
import { useDebounced } from "../lib/useDebounced.js";
import { boxesExact } from "../lib/format.js";

/* Picking items off the master, in the one shape the app uses for it.

   New buyer order and Record packing both ask "which product, from which
   factory, how many?" and answer it the same way: the product once, a row per
   supplier who makes it, and a quantity box against each. The edit forms ask
   exactly the same question, so they get exactly the same list — and the same
   working method: type against everything you want, then add the lot in one
   go, rather than clicking Add a dozen times.

   Search and the supplier filter narrow the list; what has already been typed
   is held against the whole master, so narrowing the list never loses a
   quantity you entered before you changed the filter. */
export default function ItemPicker({
  onAdd, chosen = [], unit = "pieces", where = "on this order", maxHeight = 320,
}) {
  const [q, setQ] = useState("");
  const [sup, setSup] = useState("");
  const [qtys, setQtys] = useState({});          // item id → typed quantity

  const suppliers = useSuppliers().data || [];
  const groups = useGroupedItems({ q: useDebounced(q), supplier_id: sup }).data || [];
  /* The list above is filtered; what has been typed is resolved against the
     unfiltered master, so a quantity entered under one supplier survives
     switching to another. React Query caches both. */
  const allGroups = useGroupedItems({}).data || [];
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const supName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const pieces = unit === "pieces";

  const setQty = (id, v) => setQtys((p) => ({ ...p, [id]: v }));

  const picked = useMemo(() => {
    const out = [];
    allGroups.forEach((g) => g.variants.forEach((v) => {
      const n = Number(qtys[v.item_id]) || 0;
      if (n > 0 && !chosen.includes(v.item_id)) out.push({ group: g, variant: v, qty: n });
    }));
    return out;
  }, [allGroups, qtys, chosen]);
  const totalQty = picked.reduce((s, r) => s + r.qty, 0);

  const commit = () => {
    if (!picked.length) return;
    onAdd(picked);
    setQtys({});
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <div className="picker-head">
        <SearchInput value={q} onChange={setQ} style={{ flex: "1 1 220px" }}
          placeholder="Find an item by GD code, code or description…" />
        <Select className="input-sm picker-sup" value={sup} onChange={(e) => setSup(e.target.value)}
          aria-label="Show one supplier's items only">
          <option value="">All suppliers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </Select>
      </div>

      <div style={{ maxHeight, overflowY: "auto", borderTop: "1px solid var(--border)" }}>
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
                const already = chosen.includes(v.item_id);
                const n = Number(qtys[v.item_id]) || 0;
                return (
                  <div key={v.item_id} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                    <span className="row" style={{ minWidth: 0, gap: 8 }}>
                      <Pill tone={si ? "" : "teal"}>{supCode(v.supplier_id)}</Pill>
                      <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {supName(v.supplier_id)}{g.mixed_packing ? ` · ${v.packing}/box` : ""}
                      </span>
                    </span>
                    {already ? (
                      <Pill tone="green"><Check size={11} /> {where}</Pill>
                    ) : (
                      <span className="row" style={{ gap: 8 }}>
                        {/* Pieces to boxes, undivided, exactly as the order
                            form shows it: 2000 at 2800 to a box is 0.71 of
                            one, not "1 box". */}
                        {pieces && n > 0 && (
                          <span style={{ fontSize: 11.5, color: "var(--teal-ink)", fontWeight: 600 }}>
                            = {boxesExact(n / (v.packing || 1))} boxes
                          </span>
                        )}
                        <NumberInput className={`input-sm num-in${n ? " filled" : ""}`} style={{ width: 112 }}
                          placeholder="0" aria-label={`${pieces ? "Pieces" : "Boxes"} from ${supCode(v.supplier_id)}`}
                          value={qtys[v.item_id] || ""} onChange={(val) => setQty(v.item_id, val)} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!groups.length && (
          <Empty icon={Search} title="No item matches">
            {sup
              ? <>Nothing from {supCode(sup)} matches. Try another supplier, or clear the search.</>
              : <>Try the GD code, the item code, the supplier, or part of the description.</>}
          </Empty>
        )}
      </div>

      <div className="picker-foot">
        <span className="picker-txt">
          {picked.length
            ? <><b>{picked.length}</b> item{picked.length === 1 ? "" : "s"} · {totalQty.toLocaleString("en-IN")} {unit}</>
            : <>Type the {unit} against each supplier, then add them together</>}
        </span>
        <span className="grow" />
        {picked.length > 0 && <Btn size="sm" variant="ghost" onClick={() => setQtys({})}>Clear</Btn>}
        <Btn size="sm" icon={Plus} disabled={!picked.length} onClick={commit}>
          Add {picked.length || ""} item{picked.length === 1 ? "" : "s"}
        </Btn>
      </div>
    </Card>
  );
}
