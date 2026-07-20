import { useEffect, useMemo } from "react";
import { X, Pencil, Inbox, Loader2, AlertTriangle } from "lucide-react";

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

export const Field = ({ label, children, style }) => (
  <label className="field" style={style}>
    {label && <div className="label">{label}</div>}
    {children}
  </label>
);

export const Input = (props) => <input {...props} className={`input ${props.className || ""}`} />;
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

/* DataTable — one table for the whole app. columns: {key,label,align:'r',render,strong} */
export function DataTable({ columns, rows, rowKey, onRowClick, footer, maxHeight }) {
  const cls = useMemo(() => (i) => [columns[i].align === "r" ? "r" : "", columns[i].strong ? "strong" : ""].filter(Boolean).join(" "), [columns]);
  return (
    <div className="tbl-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="tbl">
        <thead><tr>{columns.map((c, i) => <th key={c.key} className={cls(i)}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey ? rowKey(r, ri) : ri} className={onRowClick ? "click" : ""} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c, i) => <td key={c.key} className={cls(i)}>{c.render ? c.render(r, ri) : r[c.key]}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} style={{ textAlign: "center", padding: "34px 12px", color: "var(--faint)" }}>Nothing to show yet.</td></tr>}
        </tbody>
        {footer && rows.length > 0 && <tfoot><tr>{footer.map((f, i) => <td key={i} colSpan={f.span} className={f.align === "r" ? "r" : ""}>{f.v}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

/* Confirm-in-place delete button: click → asks → confirm. */
export function ConfirmDelete({ onConfirm, label = "Delete", confirmLabel = "Confirm delete" }) {
  return null; // placeholder export kept for API symmetry; inline confirm used in forms
}
