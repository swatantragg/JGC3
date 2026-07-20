import { useState } from "react";
import { PackageCheck, Check } from "lucide-react";
import { Modal, Btn, Field, Input, Select, Pill, Mono, Empty, Note } from "../../components/ui/index.jsx";
import { useItems, useBuyers, useSuppliers, useTransports, useInvoiceMutations } from "../../api/hooks.js";
import { todayISO } from "../../lib/format.js";

/* Record packing → creates a real invoice with serial start, RBI and the
   supplier / transporter captured per line. */
export default function NewInvoiceModal({ onClose }) {
  const items = useItems().data || [];
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const transports = useTransports().data || [];
  const { create } = useInvoiceMutations();

  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [buyerId, setBuyerId] = useState("");
  const [rbi, setRbi] = useState("83.50");
  const [serialStart, setSerialStart] = useState("2001");
  const [rows, setRows] = useState({});          // itemId -> { supplier_id, boxes }
  const [pt, setPt] = useState({});               // supplierId -> transportId

  const setRow = (id, patch) => setRows((p) => ({ ...p, [id]: { ...(p[id] || {}), ...patch } }));

  const lines = items
    .map((it) => ({ it, ...(rows[it.id] || {}) }))
    .filter((r) => Number(r.boxes) > 0)
    .map((r) => ({ item_id: r.it.id, supplier_id: r.supplier_id || r.it.supplier_id || null, boxes: Number(r.boxes) }));
  const totalBoxes = lines.reduce((s, l) => s + l.boxes, 0);
  const supIds = [...new Set(lines.map((l) => l.supplier_id).filter(Boolean))];

  const save = () => {
    if (!invoiceNo || !lines.length) return;
    create.mutate(
      { invoice_no: invoiceNo, date, buyer_id: buyerId || null, rbi: Number(rbi) || 0, serial_start: Number(serialStart) || 0, packing_transports: pt, lines },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal title="Record packing" icon={PackageCheck} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{lines.length} line(s) · {totalBoxes} boxes · serials {serialStart}–{(Number(serialStart) || 0) + totalBoxes - 1}</span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!invoiceNo || !lines.length || create.isPending} onClick={save}>{create.isPending ? "Saving…" : "Create invoice"}</Btn>
        </div>
      </>}>
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="Invoice number *"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="JG/26-27/6003" /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Buyer"><Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}><option value="">—</option>{buyers.map((b) => <option key={b.id} value={b.id}>{b.name} — {b.brand}</option>)}</Select></Field>
        <Field label="RBI rate ₹/$"><Input type="number" value={rbi} onChange={(e) => setRbi(e.target.value)} /></Field>
        <Field label="Serial (carton) start"><Input type="number" value={serialStart} onChange={(e) => setSerialStart(e.target.value)} /></Field>
      </div>

      {items.length ? (
        <div className="tbl-wrap" style={{ maxHeight: 300 }}>
          <table className="tbl">
            <thead><tr><th>GD code</th><th>Description</th><th>Supplier</th><th className="r">Boxes</th></tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td><Mono>{it.gd}</Mono></td>
                  <td>{it.description}</td>
                  <td><Select className="input-sm" value={(rows[it.id]?.supplier_id) || it.supplier_id || ""} onChange={(e) => setRow(it.id, { supplier_id: e.target.value })}>
                    <option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                  </Select></td>
                  <td className="r"><Input className="input-sm num-in" style={{ width: 100 }} type="number" min="0" value={rows[it.id]?.boxes || ""} onChange={(e) => setRow(it.id, { boxes: e.target.value })} placeholder="0" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty icon={PackageCheck} title="No items">Add items in Setup first.</Empty>}

      {supIds.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Note tone="teal">Transporter per supplier (optional) — used when filling shipment vehicle details.</Note>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            {supIds.map((sid) => {
              const opts = transports.filter((t) => t.supplier_id === sid);
              const sp = suppliers.find((s) => s.id === sid);
              return (
                <div key={sid} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                  <Pill tone="teal">{sp?.code}</Pill>
                  <Select style={{ width: 300 }} value={pt[sid] || ""} onChange={(e) => setPt((p) => ({ ...p, [sid]: e.target.value }))}>
                    <option value="">— select transporter —</option>
                    {opts.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.transport_id}</option>)}
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
