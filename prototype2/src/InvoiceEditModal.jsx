import { useState } from "react";
import { FileText, Check, Trash2, Hash } from "lucide-react";
import { useApp } from "./store.jsx";
import { Modal, Btn, Field, Input, Pill, Mono, Note } from "./ui.jsx";
import { invoiceSerials } from "./data.js";

/* Edit an invoice — number, date, serial start and the boxes on each
   line — or delete it outright. Serial ranges preview live. */
export default function InvoiceEditModal({ inv, onClose }) {
  const { items, supCode, updateInvoice, deleteInvoice, toast } = useApp();
  const [invoiceNo, setInvoiceNo] = useState(inv.invoiceNo);
  const [date, setDate] = useState(inv.date);
  const [serialStart, setSerialStart] = useState(inv.serialStart || "");
  const [lines, setLines] = useState(inv.lines.map((l) => ({ ...l })));
  const [confirm, setConfirm] = useState(false);

  const setBoxes = (i, v) => setLines((p) => p.map((l, j) => (j === i ? { ...l, boxes: Number(v) || 0 } : l)));
  const preview = invoiceSerials({ ...inv, serialStart, lines }, items);

  const save = () => {
    updateInvoice(inv.id, { invoiceNo, date, serialStart: Number(serialStart) || 0, lines });
    toast(`Invoice ${invoiceNo} updated`);
    onClose();
  };
  const remove = () => { deleteInvoice(inv.id); toast(`Invoice ${inv.invoiceNo} deleted`); onClose(); };

  return (
    <Modal title={`Edit invoice · ${inv.invoiceNo}`} icon={FileText} onClose={onClose}
      footer={<>
        {confirm
          ? <span className="row" style={{ gap: 8 }}><span style={{ fontSize: 12.5, color: "var(--amber-ink)" }}>Delete this invoice permanently?</span><Btn variant="danger" size="sm" icon={Trash2} onClick={remove}>Confirm delete</Btn><Btn variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep</Btn></span>
          : <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Delete invoice</Btn>}
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} onClick={save}>Save changes</Btn>
        </div>
      </>}>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <Field label="Invoice number"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Serial (carton) start" hint="The first carton number on this invoice — each line takes the next block of numbers."><Input type="number" value={serialStart} onChange={(e) => setSerialStart(e.target.value)} placeholder="e.g. 2001" /></Field>
      </div>
      <Note tone="teal"><Hash size={12} /> Serial ranges recalculate as you change the boxes below.</Note>
      <table className="tbl" style={{ marginTop: 12 }}>
        <thead><tr><th>Item</th><th>Supplier</th><th className="r">Boxes</th><th>Serial range</th></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const it = items.find((x) => x.id === l.itemId) || l.item || {};
            return (
              <tr key={i}>
                <td><Mono>{it.gd}</Mono> <span style={{ color: "var(--ink)" }}>{it.description}</span></td>
                <td><Pill>{supCode(l.supplierId)}</Pill></td>
                <td className="r"><Input className="input-sm num-in" style={{ width: 90 }} type="number" min="0" value={l.boxes} onChange={(e) => setBoxes(i, e.target.value)} /></td>
                <td><Mono>{preview[i]?.range}</Mono></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
