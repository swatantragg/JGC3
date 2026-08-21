import { useMemo, useState } from "react";
import { FileText, Check, Trash2, Hash, Plus, X } from "lucide-react";
import {
  Modal, Btn, Field, Input, NumberInput, Pill, Mono, Note, Empty,
} from "../../components/ui/index.jsx";
import ItemPicker from "../../components/ItemPicker.jsx";
import { useItems, useSuppliers, useInvoiceMutations } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";

/* Edit an invoice — number, date, serial start, and the lines themselves:
   retype the boxes, drop an item that never went on the container, or add one
   that was missed when the packing was recorded. Serial ranges preview live,
   so what each line's cartons will be numbered is visible before saving.

   An item already on the invoice keeps the price it was raised at; a line
   added here is priced from the orders its boxes clear, exactly as recording
   the packing would have priced it. */
export default function InvoiceEditModal({ inv, onClose }) {
  const items = useItems().data || [];
  const suppliers = useSuppliers().data || [];
  const { update, remove } = useInvoiceMutations();
  const toast = useToast();

  const [invoiceNo, setInvoiceNo] = useState(inv.invoice_no);
  const [date, setDate] = useState(inv.date);
  const [serialStart, setSerialStart] = useState(String(inv.serial_start || ""));
  const [lines, setLines] = useState((inv.lines || []).map((l, i) => ({
    key: l.id || `l${i}`, item_id: l.item_id, supplier_id: l.supplier_id,
    boxes: String(l.boxes ?? ""),
  })));
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  const setBoxes = (key, v) => setLines((p) => p.map((l) => (l.key === key ? { ...l, boxes: v } : l)));
  const drop = (key) => setLines((p) => p.filter((l) => l.key !== key));
  /* Everything typed into the picker joins the invoice in one action. */
  const add = (picked) => {
    setLines((p) => [...p, ...picked.map(({ variant, qty }, i) => ({
      key: `new:${variant.item_id}:${Date.now()}:${i}`, item_id: variant.item_id,
      supplier_id: variant.supplier_id, boxes: String(qty), fresh: true,
    }))]);
    setAdding(false);
  };

  const totalBoxes = lines.reduce((s, l) => s + (Number(l.boxes) || 0), 0);

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
    { onSuccess: () => { toast(`Invoice ${invoiceNo} updated — ${lines.length} line${lines.length === 1 ? "" : "s"}, ${totalBoxes} boxes`); onClose(); } },
  );
  const del = () => remove.mutate(inv.id, {
    onSuccess: () => { toast(`Invoice ${inv.invoice_no} deleted`); onClose(); },
  });

  return (
    <Modal title={`Edit invoice · ${inv.invoice_no}`} icon={FileText} onClose={onClose}
      footer={<>
        {confirm
          ? <span className="row wrap" style={{ gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--amber-ink)" }}>Delete this invoice permanently?</span>
            <Btn variant="danger" size="sm" icon={Trash2} onClick={del}>Confirm delete</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep</Btn>
          </span>
          : <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Delete invoice</Btn>}
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} disabled={update.isPending || !lines.length} onClick={save}>Save changes</Btn>
        </div>
      </>}>
      {/* The invoice's own fields, and the one thing you might add, on a line. */}
      <div className="row wrap" style={{ gap: 12, alignItems: "flex-end", marginBottom: 14 }}>
        <div className="grid-3" style={{ flex: "1 1 min(520px, 100%)" }}>
          <Field label="Invoice number"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Serial (carton) start" hint="The first carton number on this invoice — each line takes the next block of numbers.">
            <NumberInput value={serialStart} onChange={setSerialStart} placeholder="e.g. 2001" />
          </Field>
        </div>
        <Btn variant={adding ? "ghost" : "teal"} icon={adding ? X : Plus} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add an item"}
        </Btn>
      </div>

      {adding && (
        <ItemPicker unit="boxes" where="on this invoice"
          chosen={lines.map((l) => l.item_id)} onAdd={add} />
      )}

      <Note tone="teal">
        <Hash size={12} /> Serial ranges recalculate as you change the boxes below ·
        <b style={{ color: "var(--ink)" }}> {totalBoxes} boxes</b> on {lines.length} line{lines.length === 1 ? "" : "s"}.
      </Note>

      {lines.length ? (
        // The table scrolls sideways on its own, so a narrow screen does not
        // drag the invoice fields off with it.
        <div className="tbl-wrap edit-tbl">
        <table className="tbl">
          <thead>
            <tr>
              <th>Item</th><th>Supplier</th><th className="r">Boxes</th><th>Serial range</th>
              <th className="r" style={{ width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const it = byId[l.item_id] || {};
              return (
                <tr key={l.key}>
                  <td>
                    <Mono>{it.gd}</Mono>{" "}
                    <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{it.description}</span>
                    {l.fresh && <> <Pill tone="teal">new</Pill></>}
                  </td>
                  <td><Pill>{supCode(l.supplier_id)}</Pill></td>
                  <td className="r">
                    <NumberInput className="input-sm num-in" style={{ width: 90 }}
                      aria-label={`Boxes for ${it.gd || "this line"}`}
                      value={l.boxes} onChange={(v) => setBoxes(l.key, v)} />
                  </td>
                  <td><Mono>{ranges[i]}</Mono></td>
                  <td className="r">
                    <button className="icon-btn bare" title={`Remove ${it.gd || "this line"} from the invoice`} onClick={() => drop(l.key)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : (
        <Empty icon={FileText} title="Every line has been removed">
          An invoice needs at least one item. Add one above, or delete the invoice outright.
        </Empty>
      )}
    </Modal>
  );
}
