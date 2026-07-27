import { useMemo } from "react";
import { useSuppliers, useUpdateItem } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import RecordModal from "./RecordModal.jsx";
import { itemSchema } from "./itemFields.js";

/* Edit one master item. Every field the workbook carries is editable, grouped
   the way the add drawer groups them. */
export default function ItemEditModal({ item, onClose }) {
  const suppliers = useSuppliers().data || [];
  const update = useUpdateItem();
  const toast = useToast();
  const supOpts = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [suppliers],
  );

  return (
    <RecordModal
      title={`Edit item · ${item.gd || item.code}`}
      schema={itemSchema(supOpts)}
      value={item}
      cols={4}
      saving={update.isPending}
      onClose={onClose}
      onSave={(body) => update.mutate({ id: item.id, body }, {
        onSuccess: () => { toast(`Item ${body.gd || body.code} updated`); onClose(); },
      })}
    />
  );
}
