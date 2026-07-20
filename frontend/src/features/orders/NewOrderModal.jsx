import { useState } from "react";
import { ClipboardList, Check } from "lucide-react";
import { Modal, Btn, Field, Input, Select, Pill, Mono, Empty } from "../../components/ui/index.jsx";
import { useItems, useBuyers, usePoMutations } from "../../api/hooks.js";
import { todayISO, num } from "../../lib/format.js";

/* Create a real purchase order: header + a quantity against any item. */
export default function NewOrderModal({ onClose }) {
  const items = useItems().data || [];
  const buyers = useBuyers().data || [];
  const { create } = usePoMutations();

  const [po, setPo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [buyerId, setBuyerId] = useState("");
  const [qtys, setQtys] = useState({});

  const setQty = (id, v) => setQtys((p) => ({ ...p, [id]: v }));
  const lines = items
    .map((it) => ({ it, qty: Number(qtys[it.id]) || 0 }))
    .filter((r) => r.qty > 0)
    .map((r) => ({ ...r, boxes: Math.ceil(r.qty / (r.it.packing || 1)) }));
  const totalBoxes = lines.reduce((s, r) => s + r.boxes, 0);

  const save = () => {
    if (!po || !lines.length) return;
    create.mutate(
      { po, date, buyer_id: buyerId || null, rbi: 0, lines: lines.map((r) => ({ item_id: r.it.id, qty: r.qty })) },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal title="New purchase order" icon={ClipboardList} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{lines.length} line(s) · {totalBoxes} boxes</span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!po || !lines.length || create.isPending} onClick={save}>{create.isPending ? "Saving…" : "Create PO"}</Btn>
        </div>
      </>}>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <Field label="PO number *"><Input value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. 03540" /></Field>
        <Field label="Order date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Buyer"><Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}><option value="">—</option>{buyers.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.brand}</option>)}</Select></Field>
      </div>

      {items.length ? (
        <div className="tbl-wrap" style={{ maxHeight: 360 }}>
          <table className="tbl">
            <thead><tr><th>GD code</th><th>Description</th><th className="r">Packing</th><th className="r">Pieces</th><th className="r">Boxes</th></tr></thead>
            <tbody>
              {items.map((it) => {
                const qty = Number(qtys[it.id]) || 0;
                return (
                  <tr key={it.id}>
                    <td><Mono>{it.gd}</Mono></td>
                    <td>{it.description}</td>
                    <td className="r">{it.packing}/box</td>
                    <td className="r"><Input className="input-sm num-in" style={{ width: 110 }} type="number" min="0" value={qtys[it.id] || ""} onChange={(e) => setQty(it.id, e.target.value)} placeholder="0" /></td>
                    <td className="r strong">{qty ? Math.ceil(qty / (it.packing || 1)) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={ClipboardList} title="No items in the master">Add items in Setup first.</Empty>}
    </Modal>
  );
}
