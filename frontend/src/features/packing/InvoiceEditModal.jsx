import { useMemo, useState } from "react";
import { FileText, Check, Trash2, Hash } from "lucide-react";
import { Modal, Btn, Field, Input, Pill, Mono, Note } from "../../components/ui/index.jsx";
import { useItems, useSuppliers, useInvoiceMutations } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";

/* Edit an invoice — number, date, serial start and the boxes on each line —
   or delete it outright. Serial ranges preview live as the boxes change. */
export default function InvoiceEditModal({ inv, onClose }) {
  const items = useItems().data || [];
  const suppliers = useSuppliers().data || [];
  const { update, remove } = useInvoiceMutations();
  const toast = useToast();

  const [invoiceNo, setInvoiceNo] = useState(inv.invoice_no);
  const [date, setDate] = useState(inv.date);
  const [serialStart, setSerialStart] = useState(inv.serial_start || "");
  const [lines, setLines] = useState((inv.lines || []).map((l) => ({ ...l })));
  const [confirm, setConfirm] = useState(false);

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const setBoxes = (i, v) => setLines((p) => p.map((l, j) => (j === i ? { ...l, boxes: Number(v) || 0 } : l)));

  const ranges = useMemo(() => {
    let sr = Number(serialStart) || 0;
    return lines.map((l) => {
      const b = Number(l.boxes) || 0;
      const from = sr; const to = sr + b - 1; sr += b;
      return b ? `${from}–${to}` : "—";
    });
  }, [lines, serialStart]);

  const save = () => update.mutate(
    {
      id: inv.id,
      body: {
        invoice_no: invoiceNo, date, serial_start: Number(serialStart) || 0,
        lines: lines.map((l) => ({ item_id: l.item_id, supplier_id: l.supplier_id, boxes: Number(l.boxes) || 0 })),
      },
    },
    { onSuccess: () => { toast(`Invoice ${invoiceNo} updated`); onClose(); } },
  );
  const del = () => remove.mutate(inv.id, {
    onSuccess: () => { toast(`Invoice ${inv.invoice_no} deleted`); onClose(); },
  });

  return (
    <Modal title={`Edit invoice · ${inv.invoice_no}`} icon={FileText} onClose={onClose}
      footer={<>
        {confirm
          ? <span className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--amber-ink)" }}>Delete this invoice permanently?</span>
            <Btn variant="danger" size="sm" icon={Trash2} onClick={del}>Confirm delete</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep</Btn>
          </span>
          : <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Delete invoice</Btn>}
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} disabled={update.isPending} onClick={save}>Save changes</Btn>
        </div>
      </>}>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <Field label="Invoice number"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Serial (carton) start" hint="The first carton number on this invoice — each line takes the next block of numbers.">
          <Input type="number" value={serialStart} onChange={(e) => setSerialStart(e.target.value)} placeholder="e.g. 2001" />
        </Field>
      </div>
      <Note tone="teal"><Hash size={12} /> Serial ranges recalculate as you change the boxes below.</Note>
      <table className="tbl" style={{ marginTop: 12 }}>
        <thead><tr><th>Item</th><th>Supplier</th><th className="r">Boxes</th><th>Serial range</th></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const it = byId[l.item_id] || {};
            return (
              <tr key={l.id || i}>
                <td><Mono>{it.gd}</Mono> <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{it.description}</span></td>
                <td><Pill>{supCode(l.supplier_id)}</Pill></td>
                <td className="r"><Input className="input-sm num-in" style={{ width: 90 }} type="number" min="0" value={l.boxes} onChange={(e) => setBoxes(i, e.target.value)} /></td>
                <td><Mono>{ranges[i]}</Mono></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
