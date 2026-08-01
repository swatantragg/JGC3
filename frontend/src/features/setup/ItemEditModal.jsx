import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Note, Pill } from "../../components/ui/index.jsx";
import { useSuppliers, useUpdateItem, usePendingForItem, useApplyPrices } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { inr, usdp, dmyNum } from "../../lib/format.js";
import RecordModal from "./RecordModal.jsx";
import { itemSchema } from "./itemFields.js";

/* Edit one master item. Every field the workbook carries is editable, grouped
   the way the add drawer groups them.

   Changing the purchase price or the FOB price raises the question the client
   asked for: orders already on the book were agreed at the old figure, so do
   they move or not? The tick below the form answers it at the moment of
   saving — leave it and the open orders keep the price they were placed at,
   tick it and they are restated. Either way, delivered lines never move, and
   every new order uses the new price. */

/* Compared numerically, not as text: retyping "2" as "2.00" is not a price
   change and must not raise the question. */
const PRICE_NUM = ["unit_value", "unit_fob100"];
const PRICE_MODE = ["value_mode", "fob_mode"];
const changed = (a, b) =>
  PRICE_NUM.some((k) => Math.abs((Number(a?.[k]) || 0) - (Number(b?.[k]) || 0)) > 1e-9)
  || PRICE_MODE.some((k) => String(a?.[k] ?? "") !== String(b?.[k] ?? ""));

export default function ItemEditModal({ item, onClose }) {
  const suppliers = useSuppliers().data || [];
  const update = useUpdateItem();
  const applyPrices = useApplyPrices();
  const pending = usePendingForItem(item.id);
  const toast = useToast();
  const [applyToPending, setApplyToPending] = useState(false);

  const supOpts = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [suppliers],
  );

  const open = pending.data || { pos: [], boxes: 0, lines: 0 };
  const hasPending = open.pos.length > 0;

  const save = (body) => {
    const priceMoved = changed(item, body);
    update.mutate({ id: item.id, body }, {
      onSuccess: () => {
        // Only ever apply when a price actually moved and the tick is on.
        if (priceMoved && applyToPending && hasPending) {
          applyPrices.mutate({ item_id: item.id }, {
            onSuccess: (res) => toast(
              res.updated
                ? `Item updated — ${res.updated} pending order line${res.updated === 1 ? "" : "s"} repriced (PO ${res.pos.join(", ")})`
                : "Item updated — no pending order needed repricing",
            ),
            onSettled: onClose,
          });
          return;
        }
        toast(priceMoved && hasPending
          ? `Item updated — open orders keep the price they were placed at`
          : `Item ${body.gd || body.code} updated`);
        onClose();
      },
    });
  };

  /* Sits under the form, above Save, and appears the moment a price is
     touched — never silently. When nothing is outstanding it still says so,
     rather than vanishing and leaving you wondering whether the system
     noticed the change at all. */
  const applyBlock = (
    <Note tone={applyToPending ? "amber" : "teal"} icon={RefreshCw}>
      {hasPending ? (
        <label className="row" style={{ gap: 9, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={applyToPending} onChange={(e) => setApplyToPending(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: "var(--teal)", cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
          <span>
            <b>Apply the new price to all the pending orders for this item.</b>
            <div style={{ marginTop: 3 }}>
              {open.boxes} box{open.boxes === 1 ? "" : "es"} still outstanding across{" "}
              <span className="row wrap" style={{ gap: 4, display: "inline-flex", verticalAlign: "middle" }}>
                {open.pos.map((p) => (
                  <Pill key={p.po} tone="amber">{p.po} ({dmyNum(p.date)}) · {p.boxes}</Pill>
                ))}
              </span>
            </div>
            <div style={{ marginTop: 4, color: "var(--muted)" }}>
              Leave this unticked and those orders keep the price
              {item.unit_value ? <> they were placed at ({inr(item.unit_value)}
                {item.unit_fob100 ? <> · {usdp(item.unit_fob100)}{item.fob_mode === "100" ? "/100" : "/pc"}</> : null})</> : null}.
              Anything already delivered never moves either way, and new orders always use the new price.
            </div>
          </span>
        </label>
      ) : (
        <span>
          <b>Price changed.</b>{" "}
          {pending.isLoading ? "Checking which orders are still open…"
            : pending.isError ? "Could not check the open orders — the new price still saves, and every new order will use it."
              : "There is nothing outstanding on this item, so no order is affected. Every new order will use the new price; anything already delivered keeps what it was invoiced at."}
        </span>
      )}
    </Note>
  );

  return (
    <RecordModal
      title={`Edit item · ${item.gd || item.code}`}
      schema={itemSchema(supOpts)}
      value={item}
      cols={4}
      saving={update.isPending || applyPrices.isPending}
      onClose={onClose}
      onSave={save}
      /* Only surfaced once a price field is actually touched — editing a
         barcode should not ask about purchase orders. */
      beforeSave={(draft) => (changed(item, draft) ? applyBlock : null)}
    />
  );
}
