import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Modal, Btn, Field, Input, Select } from "../../components/ui/index.jsx";

/* Generic create/edit form driven by a field schema:

     { key, label, hint,
       type: "text" | "number" | "select" | "bool" | "multiselect" | "textarea" | "image",
       options: [{ value, label }],   // select / multiselect
       span,                          // columns this field occupies
       allowEmpty: false }            // select must keep a value

   "image" reads the chosen file into a data: URL client-side — there is no
   upload endpoint, and a buyer's letterhead mark is small enough (a few KB)
   that storing the data: URL as the field's value is simplest.

   Sections are supported too — an entry of the shape { section: "Packing" }
   starts a new labelled band, which is what makes a 28-field item editable
   without becoming a wall of boxes. */
/* `beforeSave(draft)` is an optional slot rendered between the fields and the
   Save button. It receives the draft as it stands, so a caller can react to
   what has actually been edited — the item form uses it to ask about pending
   orders only once a price has been touched. */
export default function RecordModal({ title, schema, value, onSave, onClose, saving, cols = 3, beforeSave }) {
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
    if (s.type === "image") {
      const src = f[s.key];
      const pick = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => set(s.key, reader.result);
        reader.readAsDataURL(file);
      };
      return (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {src && <img src={src} alt="" style={{ height: 36, maxWidth: 90, objectFit: "contain" }} />}
          <input type="file" accept="image/*" onChange={pick} style={{ fontSize: 11.5 }} />
          {src && <Btn variant="ghost" size="sm" type="button" onClick={() => set(s.key, "")}>Remove</Btn>}
        </div>
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
      {/* One field per line on a phone: four columns squeezed into 390px turns
          "Buyer order no." into a box three characters wide. The class carries
          the collapse so the inline `span`s below can be ignored with it. */}
      <div className="rec-grid" style={{ "--rec-cols": cols }}>
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
      {beforeSave && <div style={{ marginTop: 14 }}>{beforeSave(f)}</div>}
    </Modal>
  );
}
