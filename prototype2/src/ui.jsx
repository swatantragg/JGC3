import { useEffect, useState, useMemo } from "react";
import { X, Check, HelpCircle, Search, ChevronRight, Pencil, Inbox, ChevronDown } from "lucide-react";

/* ============================================================
   UI atoms. Styling lives in index.css — components stay thin.
   ============================================================ */

export function Btn({ children, onClick, variant = "primary", icon: Icon, iconRight: IconR, disabled, size, title, type = "button" }) {
  const cls = ["btn", `btn-${variant}`, size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : ""].filter(Boolean).join(" ");
  const s = size === "sm" ? 14 : size === "lg" ? 17 : 15;
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {Icon && <Icon size={s} strokeWidth={2.3} />}
      {children}
      {IconR && <IconR size={s} strokeWidth={2.3} />}
    </button>
  );
}

export const IconBtn = ({ icon: Icon, onClick, title, bare, size = 16 }) => (
  <button className={`icon-btn${bare ? " bare" : ""}`} onClick={onClick} title={title} aria-label={title}>
    <Icon size={size} strokeWidth={2.2} />
  </button>
);

export const EditBtn = ({ onClick }) => <IconBtn bare icon={Pencil} size={14} onClick={onClick} title="Edit" />;

export const Card = ({ children, pad, className = "", style }) => (
  <div className={`card${pad ? " card-pad" : ""} ${className}`} style={style}>{children}</div>
);
export const CardHead = ({ icon: Icon, title, children }) => (
  <div className="card-head">
    <div className="card-title">{Icon && <Icon size={15} style={{ color: "var(--teal)" }} />}{title}</div>
    {children && <div className="row wrap" style={{ gap: 8 }}>{children}</div>}
  </div>
);

export const Eyebrow = ({ children }) => <div className="eyebrow">{children}</div>;
export const Mono = ({ children }) => <span className="mono">{children}</span>;
export const Pill = ({ children, tone = "" }) => <span className={`pill${tone ? " pill-" + tone : ""}`}>{children}</span>;

export const Note = ({ tone = "teal", icon: Icon, children }) => (
  <div className={`note note-${tone}`}>{Icon && <Icon size={15} style={{ flexShrink: 0, marginTop: 1 }} />}<div>{children}</div></div>
);

/* Hover-to-explain "?" — how we teach the jargon (FIFO, 2A, RBI rate…) without a manual */
export const Info = ({ children }) => (
  <span className="tip">
    <span className="tip-trigger"><HelpCircle size={13} /></span>
    <span className="tip-body">{children}</span>
  </span>
);

export const Field = ({ label, hint, children, style }) => (
  <label className="field" style={style}>
    {label && <div className="label">{label}{hint && <Info>{hint}</Info>}</div>}
    {children}
  </label>
);

export const Input = (props) => <input {...props} className={`input ${props.className || ""}`} />;
export const Select = ({ children, ...p }) => <select {...p} className={`select ${p.className || ""}`}>{children}</select>;

export const SearchInput = ({ value, onChange, placeholder = "Search…", style }) => (
  <div className="searchwrap" style={style}>
    <Search size={15} />
    <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

export const Seg = ({ options, value, onChange }) => (
  <div className="seg">
    {options.map((o) => {
      const [k, label, Icon] = Array.isArray(o) ? o : [o.k, o.label, o.icon];
      return (
        <button key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {Icon && <Icon size={14} />} {label}
        </button>
      );
    })}
  </div>
);

export const Empty = ({ icon: Icon = Inbox, title, children, action }) => (
  <div className="empty">
    <div className="ei"><Icon size={21} /></div>
    <h4>{title}</h4>
    {children && <p>{children}</p>}
    {action}
  </div>
);

export const Stat = ({ icon: Icon, value, label, sub, tone }) => (
  <div className="stat">
    <div className="stat-i" style={tone === "amber" ? { background: "var(--amber-bg)", color: "var(--amber-ink)" } : tone === "green" ? { background: "var(--green-bg)", color: "var(--green-ink)" } : undefined}>
      <Icon size={17} strokeWidth={2.2} />
    </div>
    <div className="stat-v">{value}</div>
    <div className="stat-l">{label}</div>
    {sub && <div className="stat-s">{sub}</div>}
  </div>
);

export const ActionCard = ({ icon: Icon, tone = "teal", title, children, onClick }) => (
  <button className="action" onClick={onClick}>
    <span className="action-i" style={{ background: `var(--${tone}-bg)`, color: `var(--${tone}-ink)` }}><Icon size={17} strokeWidth={2.2} /></span>
    <span className="grow">
      <h5>{title}</h5>
      <p>{children}</p>
    </span>
    <ChevronRight size={16} style={{ color: "var(--faint)", marginTop: 8 }} />
  </button>
);

/* ============================================================
   Modal / Drawer
   ============================================================ */
export function Modal({ title, icon: Icon, onClose, children, footer, width = 900 }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{Icon && <Icon size={17} style={{ color: "var(--teal)" }} />}{title}</h3>
          <IconBtn bare icon={X} size={18} onClick={onClose} title="Close" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, subtitle, icon: Icon, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{Icon && <Icon size={17} style={{ color: "var(--teal)" }} />}{title}</h3>
            {subtitle && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <IconBtn bare icon={X} size={18} onClick={onClose} title="Close" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* Numbered step header used inside guided sheets */
export const Step = ({ n, title, hint }) => (
  <div className="row" style={{ gap: 10, marginBottom: 10 }}>
    <span className="rail-num" style={{ width: 24, height: 24, fontSize: 11, background: "var(--brand)", color: "#fff" }}>{n}</span>
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--ink)" }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{hint}</div>}
    </div>
  </div>
);

/* ============================================================
   Generic edit modal — drives every "edit a record" flow
   ============================================================ */
export function EditModal({ title, schema, value, onSave, onClose, note, cols = 3 }) {
  const [f, setF] = useState({ ...value });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Fields flagged `req` are the ones that unlock downstream documents — show what is still missing.
  const required = schema.filter((s) => s.req);
  const missing = required.filter((s) => !f[s.key]);

  return (
    <Modal title={title} icon={Pencil} onClose={onClose} width={780}
      footer={<>
        <span style={{ fontSize: 11.5, color: "var(--muted)", maxWidth: 430 }}>{note || "Changes apply to future transactions only — orders already placed keep their original values."}</span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} onClick={() => onSave(f)}>Save changes</Btn>
        </div>
      </>}>
      {required.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {missing.length
            ? <Note tone="amber"><b>{missing.length} of {required.length} unlocking fields still empty:</b> {missing.map((s) => s.label).join(", ")}.</Note>
            : <Note tone="teal">All {required.length} unlocking fields are filled — every downstream document will render complete.</Note>}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 12 }}>
        {schema.map((s) => {
          const empty = s.req && !f[s.key];
          return (
            <Field key={s.key} label={<>{s.label}{s.req && <span style={{ color: "var(--amber-2)", fontWeight: 700 }} title="Required to unlock the customs invoice"> ●</span>}</>}>
              {s.type === "select"
                ? <Select className="input-sm" value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)}>{s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                : <Input className="input-sm" style={empty ? { borderColor: "var(--amber)" } : undefined} type={s.type === "number" ? "number" : s.type === "date" ? "date" : "text"} value={f[s.key] ?? ""} onChange={(e) => set(s.key, e.target.value)} />}
            </Field>
          );
        })}
      </div>
    </Modal>
  );
}

/* ============================================================
   DataTable — one table component for the whole app.
   columns: { key, label, align:'r', w, render(row,i), strong, className }
   freeze:  number of leading columns pinned while scrolling sideways
   ============================================================ */
export function DataTable({ columns, rows, rowKey, freeze = 0, maxHeight, onRowClick, footer, empty }) {
  const offsets = useMemo(() => {
    const o = [];
    let acc = 0;
    for (let i = 0; i < freeze; i++) { o.push(acc); acc += columns[i]?.w || 100; }
    return o;
  }, [columns, freeze]);

  if (!rows.length && empty) return <div>{empty}</div>;

  const frz = (i) => {
    if (i >= freeze) return {};
    const c = columns[i];
    return { left: offsets[i], minWidth: c.w, maxWidth: c.w, width: c.w };
  };
  const cls = (i, base = "") => [base, columns[i].align === "r" ? "r" : "", i < freeze ? "frz" : "", i === freeze - 1 ? "frz-last" : "", columns[i].strong ? "strong" : ""].filter(Boolean).join(" ");

  return (
    <div className="tbl-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="tbl">
        <thead>
          <tr>{columns.map((c, i) => <th key={c.key} className={cls(i)} style={frz(i)}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey ? rowKey(r, ri) : ri} className={onRowClick ? "click" : ""} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c, i) => <td key={c.key} className={cls(i)} style={frz(i)}>{c.render ? c.render(r, ri) : r[c.key]}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} style={{ textAlign: "center", padding: "34px 12px", color: "var(--faint)" }}>Nothing to show yet.</td></tr>}
        </tbody>
        {footer && rows.length > 0 && <tfoot><tr>{footer.map((f, i) => <td key={i} colSpan={f.span} className={f.align === "r" ? "r" : ""}>{f.v}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

/* Frozen-column table heads need an opaque background — sticky cells scroll under them.
   Achieved in CSS via .tbl .frz inheriting the row background. */

/* ============================================================
   Collapsible "how is this calculated" panel
   ============================================================ */
export function FormulaPanel({ title, intro, rows }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", width: "100%", alignItems: "center", gap: 9, padding: "13px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <HelpCircle size={15} style={{ color: "var(--teal)" }} />
        <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>{title}</span>
        <ChevronDown size={16} style={{ marginLeft: "auto", color: "var(--faint)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px" }}>
          {intro && <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.55 }}>{intro}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", columnGap: 28 }}>
            {rows.map(([f, formula]) => (
              <div key={f} className="row" style={{ justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)", alignItems: "baseline" }}>
                <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap" }}>{f}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--teal-ink)", textAlign: "right" }}>{formula}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
