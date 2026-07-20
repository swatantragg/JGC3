import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Modal, Btn, Field, Input, Select } from "../../components/ui/index.jsx";

/* Generic create/edit form driven by a field schema:
   [{ key, label, type: "text"|"number"|"select", options:[{value,label}] }]. */
export default function RecordModal({ title, schema, value, onSave, onClose, saving, cols = 3 }) {
  const [f, setF] = useState({ ...value });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    const out = { ...f };
    schema.forEach((s) => {
      if (s.type === "number") out[s.key] = Number(out[s.key]) || 0;
      // An unselected optional select (e.g. supplier) must be null, not "" —
      // otherwise a Postgres foreign key rejects the empty string.
      if (s.type === "select" && s.allowEmpty !== false && (out[s.key] === "" || out[s.key] === undefined)) out[s.key] = null;
    });
    onSave(out);
  };

  return (
    <Modal title={title} icon={Pencil} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Fields marked * are required.</span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} disabled={saving} onClick={submit}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </>}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 12 }}>
        {schema.map((s) => (
          <Field key={s.key} label={s.label}>
            {s.type === "select" ? (
              <Select className="input-sm" value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)}>
                {(s.allowEmpty !== false && !s.options.some((o) => o.value === "")) && <option value="">—</option>}
                {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : (
              <Input className="input-sm" type={s.type === "number" ? "number" : "text"}
                value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)} />
            )}
          </Field>
        ))}
      </div>
    </Modal>
  );
}
