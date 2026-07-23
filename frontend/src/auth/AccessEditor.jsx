import { Check } from "lucide-react";
import { useAuth } from "./AuthProvider.jsx";

/* Ticking access. Presets across the top cover almost every real user; the
   tree below is for fine-tuning. Parent rows toggle their whole branch and
   show an indeterminate box when only part of it is granted. */

const leaves = (n) => (n.children ? n.children.map((c) => c.id) : [n.id]);

export default function AccessEditor({ access, onChange }) {
  const { permTree, allPerms, presets } = useAuth();
  const set = new Set(access);

  const toggleLeaf = (id) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next]);
  };
  const toggleNode = (n) => {
    const ls = leaves(n);
    const all = ls.every((id) => set.has(id));
    const next = new Set(set);
    ls.forEach((id) => (all ? next.delete(id) : next.add(id)));
    onChange([...next]);
  };

  const presetMatch = Object.entries(presets).find(
    ([, p]) => p.perms.length === set.size && p.perms.every((x) => set.has(x))
  )?.[0];

  return (
    <div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {Object.entries(presets).map(([k, p]) => (
          <button key={k} className={`preset-chip${presetMatch === k ? " on" : ""}`} onClick={() => onChange([...p.perms])}>
            {presetMatch === k && <Check size={12} strokeWidth={3} />} {p.label}
            <span className="pc-n">{p.perms.length === allPerms.length ? "everything" : `${p.perms.length} areas`}</span>
          </button>
        ))}
      </div>

      <div className="perm-tree">
        {permTree.map((n) => {
          const ls = leaves(n);
          const on = ls.filter((id) => set.has(id)).length;
          return (
            <div key={n.id} className="perm-group">
              <label className="perm-row head">
                <input
                  type="checkbox"
                  checked={on === ls.length}
                  ref={(el) => el && (el.indeterminate = on > 0 && on < ls.length)}
                  onChange={() => toggleNode(n)}
                />
                <span className="grow">
                  {n.label}
                  {!n.children && n.hint && <span className="perm-hint">{n.hint}</span>}
                </span>
                {n.children && <span className="perm-count">{on}/{ls.length}</span>}
              </label>
              {n.children?.map((c) => (
                <label key={c.id} className="perm-row sub">
                  <input type="checkbox" checked={set.has(c.id)} onChange={() => toggleLeaf(c.id)} />
                  <span className="grow">{c.label}<span className="perm-hint">{c.hint}</span></span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
