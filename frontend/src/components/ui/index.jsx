import { useEffect, useMemo, useState } from "react";
import {
  X, Pencil, Inbox, Loader2, AlertTriangle, Eye, EyeOff,
  HelpCircle, Search, ChevronRight, ChevronDown,
} from "lucide-react";

/* ============================================================
   Shared UI atoms. Styling lives in src/index.css (the design
   system carried over from the prototype). Components stay thin.
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

/* Hover-to-explain "?" — how the jargon (FIFO, 2A, RBI rate…) gets taught
   without a manual. */
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

export const SearchInput = ({ value, onChange, placeholder = "Search…", style }) => (
  <div className="searchwrap" style={style}>
    <Search size={15} />
    <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

export const Input = (props) => <input {...props} className={`input ${props.className || ""}`} />;

/* A password box with an eye to reveal what was typed — the only way to catch
   a typo in a field the browser masks. Reveal is per-field and resets on
   every mount, so nothing stays readable after the form is left. */
export function PasswordInput({ value, onChange, placeholder = "••••••••", onKeyDown, autoComplete }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-in">
      <input
        className="input"
        type={shown ? "text" : "password"}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShown((s) => !s)}
        title={shown ? "Hide password" : "Show password"}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        tabIndex={-1}
      >
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </span>
  );
}
export const Select = ({ children, ...p }) => <select {...p} className={`select ${p.className || ""}`}>{children}</select>;

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

export const Spinner = ({ label = "Loading…" }) => (
  <div className="empty">
    <div className="ei"><Loader2 size={21} className="spin" /></div>
    <p style={{ color: "var(--muted)" }}>{label}</p>
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <Empty icon={AlertTriangle} title="Could not load data" action={onRetry && <Btn size="sm" onClick={onRetry}>Retry</Btn>}>
    {String(error?.message || error || "Request failed")}. Is the API running?
  </Empty>
);

/* Modal — a centred panel at ~75% width with enlarged type (see .modal in CSS). */
export function Modal({ title, icon: Icon, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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

/* Slide-over sheet — used by the guided "new order" / "record packing" flows,
   which are too tall for a centred modal. */
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

/* Numbered step header used inside the guided sheets. */
export const Step = ({ n, title, hint }) => (
  <div className="row" style={{ gap: 10, marginBottom: 10 }}>
    <span className="rail-num" style={{ width: 24, height: 24, fontSize: 11, background: "var(--brand)", color: "#fff" }}>{n}</span>
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--ink)" }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{hint}</div>}
    </div>
  </div>
);

/* DataTable — one table for the whole app.
   columns: { key, label, align:'r', w, render(row,i), strong }
   freeze:  how many leading columns stay pinned while you scroll sideways.
            Frozen columns need a `w`; FREEZE_W is the fallback.
   serial:  prepend a "#" column numbering the rows on screen. It counts what
            is displayed, so it renumbers when a filter narrows the list —
            that is what makes it useful for reading a long table aloud.
            It is part of the frozen block and of any footer span. */
const FREEZE_W = 120;

const SERIAL_COL = {
  key: "_sr", label: "#", w: 52, align: "r",
  render: (_r, i) => <span style={{ color: "var(--faint)" }}>{i + 1}</span>,
};

export function DataTable({ columns, rows, rowKey, freeze = 0, serial = false, onRowClick, footer, maxHeight }) {
  const cols = useMemo(() => (serial ? [SERIAL_COL, ...columns] : columns), [columns, serial]);
  const n = Math.min(serial ? freeze + 1 : freeze, cols.length);

  const offsets = useMemo(() => {
    const o = [];
    let acc = 0;
    for (let i = 0; i < n; i++) { o.push(acc); acc += cols[i]?.w || FREEZE_W; }
    return o;
  }, [cols, n]);

  const frz = (i) => {
    if (i >= n) return undefined;
    const w = cols[i].w || FREEZE_W;
    return { left: offsets[i], minWidth: w, maxWidth: w, width: w };
  };
  const cls = (i) => [
    cols[i].align === "r" ? "r" : "",
    i < n ? "frz" : "",
    i === n - 1 ? "frz-last" : "",
    cols[i].strong ? "strong" : "",
  ].filter(Boolean).join(" ");

  // The serial column shifts every footer cell one to the right; widening the
  // first span keeps a caller's footer aligned without it knowing.
  const foot = useMemo(() => {
    if (!footer || !serial) return footer;
    const [first, ...rest] = footer;
    return [{ ...first, span: (first.span || 1) + 1 }, ...rest];
  }, [footer, serial]);

  return (
    <div className="tbl-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="tbl">
        <thead><tr>{cols.map((c, i) => <th key={c.key} className={cls(i)} style={frz(i)}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey ? rowKey(r, ri) : ri} className={onRowClick ? "click" : ""} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {cols.map((c, i) => <td key={c.key} className={cls(i)} style={frz(i)}>{c.render ? c.render(r, ri) : r[c.key]}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols.length} style={{ textAlign: "center", padding: "34px 12px", color: "var(--faint)" }}>Nothing to show yet.</td></tr>}
        </tbody>
        {foot && rows.length > 0 && <tfoot><tr>{foot.map((f, i) => <td key={i} colSpan={f.span} className={f.align === "r" ? "r" : ""}>{f.v}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

/* Collapsible "how is this calculated?" panel. */
export function FormulaPanel({ title, intro, rows }) {
  const [open, setOpen] = useState(false);
  if (!rows?.length) return null;
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
