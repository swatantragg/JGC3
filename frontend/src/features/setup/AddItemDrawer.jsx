import { useMemo, useState } from "react";
import { Layers, Check } from "lucide-react";
import { Btn, Field, Input, Select, Drawer, Step } from "../../components/ui/index.jsx";
import { useSuppliers, useCreateItem } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { EMPTY_ITEM } from "../../lib/constants.js";
import { itemSections, ITEM_NUM } from "./itemFields.js";
import { num } from "../../lib/format.js";

/* Add an item, as a guided sheet — enter it once and every document
   downstream reads from here. */
export default function AddItemDrawer({ onClose }) {
  const suppliers = useSuppliers().data || [];
  const create = useCreateItem();
  const toast = useToast();
  const [f, setF] = useState({ ...EMPTY_ITEM });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const supOpts = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [suppliers],
  );
  const sections = itemSections(supOpts);

  /* The same rule calc.stickers_per_box applies, previewed live. */
  const stickers = useMemo(() => {
    if (Number(f.stickers_fixed)) return Number(f.stickers_fixed);
    const base = (Number(f.bg_per_box) || 0) + (Number(f.p_per_box) || 0);
    const total = base * (Number(f.sticker_mult) || 0);
    return f.sticker_round === true || f.sticker_round === "yes" ? Math.floor(total + 0.5) : total;
  }, [f]);

  const ready = f.code && f.gd && Number(f.packing) > 0;

  const save = () => {
    const body = { ...f };
    ITEM_NUM.forEach((k) => { body[k] = Number(body[k]) || 0; });
    body.sticker_round = body.sticker_round === true || body.sticker_round === "yes";
    if (!body.supplier_id) body.supplier_id = null;
    create.mutate(body, {
      onSuccess: () => { toast(`Item ${body.gd} added to the master`); onClose(); },
    });
  };

  const control = (s) => {
    if (s.type === "select") {
      return (
        <Select value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)}>
          {s.allowEmpty !== false && <option value="">—</option>}
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    }
    if (s.type === "bool") {
      const on = f[s.key] === true || f[s.key] === "yes";
      return (
        <Select value={on ? "yes" : "no"} onChange={(e) => set(s.key, e.target.value === "yes")}>
          <option value="no">No</option><option value="yes">Yes</option>
        </Select>
      );
    }
    if (s.type === "textarea") {
      return <textarea className="input" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }}
        value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)} />;
    }
    return <Input type={s.type === "number" ? "number" : "text"} step={s.step}
      value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)} />;
  };

  return (
    <Drawer title="Add an item" subtitle="Enter it once — every document downstream reads from here."
      icon={Layers} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Stickers per box calculates itself: <b style={{ color: "var(--ink)" }}>{num(stickers, 1)}</b>
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!ready || create.isPending} onClick={save}>
            {create.isPending ? "Saving…" : "Save item"}
          </Btn>
        </div>
      </>}>
      <div className="stack">
        {sections.map((sec) => (
          <section key={sec.n}>
            <Step n={sec.n} title={sec.title} hint={sec.hint} />
            <div className="grid-3">
              {sec.fields.map((s) => (
                <Field key={s.key} label={s.label} hint={s.hint} style={s.span ? { gridColumn: `span ${s.span}` } : undefined}>
                  {control(s)}
                </Field>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
