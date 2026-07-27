import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Modal, Btn, Field, Input, Select } from "../../components/ui/index.jsx";

/* Generic create/edit form driven by a field schema:

     { key, label, hint,
       type: "text" | "number" | "select" | "bool" | "multiselect" | "textarea",
       options: [{ value, label }],   // select / multiselect
       span,                          // columns this field occupies
       allowEmpty: false }            // select must keep a value

   Sections are supported too — an entry of the shape { section: "Packing" }
   starts a new labelled band, which is what makes a 28-field item editable
   without becoming a wall of boxes. */
export default function RecordModal({ title, schema, value, onSave, onClose, saving, cols = 3 }) {
  const [f, setF] = useState({ ...value });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const fields = schema.filter((s) => !s.section);

  const submit = () => {
    const out = { ...f };
    fields.forEach((s) => {
      if (s.type === "number") out[s.key] = Number(out[s.key]) || 0;
      if (s.type === "bool") out[s.key] = out[s.key] === true || out[s.key] === "yes";
      if (s.type === "multiselect") out[s.key] = Array.isArray(out[s.key]) ? out[s.key] : [];
      // An unselected optional select (e.g. supplier) must be null, not "" —
      // otherwise a Postgres foreign key rejects the empty string.
      if (s.type === "select" && s.allowEmpty !== false && (out[s.key] === "" || out[s.key] === undefined)) out[s.key] = null;
    });
    onSave(out);
  };

  const toggle = (key, v) => {
    const cur = Array.isArray(f[key]) ? f[key] : [];
    set(key, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };

  const control = (s) => {
    if (s.type === "select") {
      return (
        <Select className="input-sm" value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)}>
          {(s.allowEmpty !== false && !s.options.some((o) => o.value === "")) && <option value="">—</option>}
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    }
    if (s.type === "bool") {
      const on = f[s.key] === true || f[s.key] === "yes";
      return (
        <Select className="input-sm" value={on ? "yes" : "no"} onChange={(e) => set(s.key, e.target.value === "yes")}>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </Select>
      );
    }
    if (s.type === "multiselect") {
      const cur = Array.isArray(f[s.key]) ? f[s.key] : [];
      return (
        <div className="row wrap" style={{ gap: 6, padding: "4px 0" }}>
          {s.options.map((o) => (
            <button key={o.value} type="button" onClick={() => toggle(s.key, o.value)}
              className={`pill${cur.includes(o.value) ? " pill-teal" : ""}`}
              style={{ cursor: "pointer", border: "1px solid var(--line)" }}>
              {cur.includes(o.value) ? "✓ " : ""}{o.label}
            </button>
          ))}
        </div>
      );
    }
    if (s.type === "textarea") {
      return (
        <textarea className="input input-sm" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }}
          value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)} />
      );
    }
    return (
      <Input className="input-sm" type={s.type === "number" ? "number" : "text"} step={s.step}
        value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)} />
    );
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
        {schema.map((s, i) => s.section ? (
          <div key={`sec-${i}`} style={{ gridColumn: "1 / -1", marginTop: i ? 8 : 0 }}>
            <div className="eyebrow">{s.section}</div>
            {s.hint && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{s.hint}</div>}
          </div>
        ) : (
          <Field key={s.key} label={s.label} style={s.span ? { gridColumn: `span ${s.span}` } : undefined}>
            {control(s)}
            {s.hint && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{s.hint}</div>}
          </Field>
        ))}
      </div>
    </Modal>
  );
}
