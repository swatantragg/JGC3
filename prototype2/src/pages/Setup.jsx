import { useState } from "react";
import {
  Layers, Globe, Truck, Plus, Check, SlidersHorizontal, GripVertical, Trash2, Search, Route,
  Users as UsersIcon, ShieldCheck, Clock, UserPlus, KeyRound,
} from "lucide-react";
import { useApp } from "../store.jsx";
import { useAuth, PERM_TREE, ALL_PERMS, ACCESS_PRESETS, accessLabel } from "../auth.jsx";
import {
  Card, CardHead, Btn, Seg, Field, Input, Select, Pill, Mono, DataTable, Drawer, Modal, EditBtn,
  EditModal, Empty, Note, Info, SearchInput, FormulaPanel, Step,
} from "../ui.jsx";
import {
  EMPTY_ITEM, ITEM_NUM, ITEM_GROUPS, itemSchema, BUYER_SCHEMA, SUP_SCHEMA,
  BUYER_FORMULAS, UNIT_MODES, EMPTY_TRANSPORT, transportSchema, num, inr, usd, usdp,
} from "../data.js";

/* ============================================================
   Setup — everything you configure once and never touch again.
   The old build called this "Masters" and split the same items across
   three tabs (Items / Buyers data / Supplier data). Here it is one
   table with four saved views, so nobody has to learn "2A" or "7A".
   ============================================================ */

const COL = (supCode) => ({
  gd: { label: "GD code", w: 92, render: (it) => <Mono>{it.gd}</Mono> },
  code: { label: "Code", w: 76, render: (it) => <Mono>{it.code}</Mono> },
  oswin: { label: "OSWIN", w: 96, render: (it) => <Mono>{it.oswin}</Mono> },
  gl: { label: "GL", w: 84, render: (it) => <Mono>{it.gl}</Mono> },
  description: { label: "Description", w: 200, render: (it) => <span><span style={{ color: "var(--ink)", fontWeight: 600 }}>{it.description}</span><div style={{ color: "var(--faint)", fontSize: 11 }}>{it.group}</div></span> },
  size: { label: "Size mm", w: 72, align: "r", render: (it) => it.size },
  length: { label: "Len mm", w: 74, align: "r", render: (it) => it.length },
  packing: { label: "Packing", w: 92, align: "r", render: (it) => `${it.packing} / box` },
  barcode: { label: "Bar code", w: 126, render: (it) => <Mono>{it.barcode}</Mono> },
  hsn: { label: "HSN", w: 86, render: (it) => <Mono>{it.hsn}</Mono> },
  volume: { label: "Vol/box", w: 76, align: "r", render: (it) => num(it.volume, 3) },
  netPerBox: { label: "Net/box", w: 76, align: "r", render: (it) => it.netPerBox },
  grossPerBox: { label: "Gross/box", w: 84, align: "r", render: (it) => it.grossPerBox },
  bgPerBox: { label: "Bg", w: 52, align: "r", render: (it) => it.bgPerBox },
  pPerBox: { label: "P", w: 48, align: "r", render: (it) => it.pPerBox },
  stk: { label: "Stk/box", w: 78, align: "r", strong: true, render: (it) => num((it.bgPerBox + it.pPerBox) * 1.1) },
  typeUp: { label: "Type UP", w: 80, align: "r", render: (it) => it.typeUp },
  bg: { label: "BG", w: 60, align: "r", render: (it) => it.packing },
  pc: { label: "PC", w: 52, align: "r", render: () => 1 },
  ttl: { label: "TTL", w: 60, align: "r", strong: true, render: (it) => it.packing + 1 },
  unitValue: { label: "Unit ₹", w: 82, align: "r", strong: true, render: (it) => inr(it.unitValue) },
  unitFob100: { label: "FOB/100 $", w: 94, align: "r", strong: true, render: (it) => usd(it.unitFob100) },
  fobpc: { label: "FOB/pc $", w: 90, align: "r", strong: true, render: (it) => usdp(it.unitFob100 / 100) },
  supplier: { label: "Supplier", w: 94, render: (it) => <Pill>{supCode(it.supplierId)}</Pill> },
});

const PRESETS = {
  essentials: { label: "Essentials", hint: "The seven fields you look at day to day.", keys: ["gd", "code", "description", "packing", "unitValue", "unitFob100", "supplier"] },
  buyer: { label: "Buyer sheet", hint: "The constant fields on the 2A buyer master — handy for verifying item pricing.", keys: ["gd", "code", "size", "length", "packing", "description", "barcode", "hsn", "volume", "netPerBox", "grossPerBox", "stk", "unitValue", "unitFob100", "supplier"] },
  supplier: { label: "Supplier sheet", hint: "The constant fields on the 7A supplier master. BG = units/box, PC = 1 carton, TTL = BG + PC.", keys: ["gd", "code", "oswin", "gl", "size", "length", "packing", "description", "barcode", "hsn", "volume", "bg", "pc", "ttl", "unitValue", "fobpc", "supplier"] },
  all: { label: "All fields", hint: "Every column stored on an item.", keys: ["gd", "code", "oswin", "gl", "description", "size", "length", "packing", "barcode", "hsn", "volume", "netPerBox", "grossPerBox", "bgPerBox", "pPerBox", "stk", "typeUp", "unitValue", "unitFob100", "supplier"] },
};

/* ---------- Column manager (drag to reorder, untick to hide, add your own) ---------- */
function ColumnManager({ cols, onSave, onClose }) {
  const [list, setList] = useState(cols.map((c) => ({ ...c })));
  const [dragI, setDragI] = useState(null);
  const [overI, setOverI] = useState(null);
  const [name, setName] = useState("");

  const toggle = (i) => setList((l) => l.map((c, j) => (j === i ? { ...c, visible: !c.visible } : c)));
  const removeCustom = (i) => setList((l) => l.filter((_, j) => j !== i));
  const drop = (i) => {
    if (dragI === null || dragI === i) { setDragI(null); setOverI(null); return; }
    setList((l) => { const a = [...l]; const [m] = a.splice(dragI, 1); a.splice(i, 0, m); return a; });
    setDragI(null); setOverI(null);
  };
  const add = () => { const n = name.trim(); if (!n) return; setList((l) => [...l, { key: "c" + Date.now(), label: n, visible: true, custom: true }]); setName(""); };
  const shown = list.filter((c) => c.visible).length;

  return (
    <Modal title="Customise columns" icon={SlidersHorizontal} onClose={onClose} width={480}
      footer={<>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{shown} column(s) shown</span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} onClick={() => onSave(list)}>Save view</Btn>
        </div>
      </>}>
      <Note tone="teal">Drag to reorder, untick to hide, and add a column of your own. The first three stay frozen while you scroll sideways.</Note>
      <div style={{ maxHeight: 340, overflowY: "auto", margin: "12px 0" }}>
        {list.map((c, i) => (
          <div key={c.key} draggable
            onDragStart={() => setDragI(i)}
            onDragOver={(e) => { e.preventDefault(); setOverI(i); }}
            onDrop={() => drop(i)}
            onDragEnd={() => { setDragI(null); setOverI(null); }}
            className={`colrow${overI === i && dragI !== null ? " over" : ""}${dragI === i ? " drag" : ""}`}>
            <GripVertical size={15} style={{ color: "var(--faint)" }} />
            <input type="checkbox" checked={c.visible} onChange={() => toggle(i)} style={{ width: 15, height: 15, accentColor: "var(--teal)", cursor: "pointer" }} />
            <span style={{ fontSize: 13, color: c.visible ? "var(--ink)" : "var(--faint)", fontWeight: 500, flex: 1 }}>
              {c.label} {c.custom && <Pill tone="teal">custom</Pill>}
            </span>
            {i < 3 && c.visible && <Pill tone="amber">frozen</Pill>}
            {c.custom && <button className="icon-btn bare" onClick={() => removeCustom(i)} title="Delete column"><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New column name" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Btn variant="ghost" icon={Plus} onClick={add}>Add</Btn>
      </div>
    </Modal>
  );
}

/* ---------- Add item, as a guided sheet ---------- */
function AddItemDrawer({ onClose }) {
  const { items, setItems, suppliers, toast } = useApp();
  const [f, setF] = useState(EMPTY_ITEM);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const stick = (Number(f.bgPerBox) + Number(f.pPerBox)) * 1.1;
  const ready = f.code && f.gd && f.packing;

  const save = () => {
    const o = { ...f, id: "i" + Date.now(), oswin: f.oswin || "OSW-" + f.code, gl: f.gl || "GL-" + f.code };
    ITEM_NUM.forEach((k) => (o[k] = Number(o[k])));
    setItems([...items, o]);
    toast(`Item ${o.gd} added to the master`);
    onClose();
  };

  const G = (keys) => (
    <div className="grid-3">
      {keys.map(([k, lbl, type]) => (
        <Field key={k} label={lbl}>
          <Input type={type || "text"} value={f[k]} onChange={(e) => set(k, e.target.value)} />
        </Field>
      ))}
    </div>
  );

  return (
    <Drawer title="Add an item" subtitle="Enter it once — every document downstream reads from here." icon={Layers} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Stickers per box calculates itself: (Bg + P) × 1.1 = <b style={{ color: "var(--ink)" }}>{isNaN(stick) ? "—" : num(stick)}</b></span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!ready} onClick={save}>Save item</Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <Step n="1" title="Identity" hint="OSWIN and GL codes are generated from the item code if you leave them blank." />
          {G([["code", "Code *"], ["gd", "GD code *"], ["oswin", "OSWIN code"], ["gl", "GL code"], ["description", "Description"], ["barcode", "Bar code number"]])}
          <div className="grid-2" style={{ marginTop: 12 }}>
            <Field label="Group"><Select value={f.group} onChange={(e) => set("group", e.target.value)}>{ITEM_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></Field>
            <Field label="Primary supplier"><Select value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</Select></Field>
          </div>
        </section>
        <section>
          <Step n="2" title="Physical" hint="Drives boxes, volume and weight on every packing list." />
          {G([["size", "Size (mm)"], ["length", "Length (mm)"], ["packing", "Packing (units / box) *", "number"], ["volume", "Volume / box (m³)", "number"], ["netPerBox", "Net weight / box (kg)", "number"], ["grossPerBox", "Gross weight / box (kg)", "number"]])}
        </section>
        <section>
          <Step n="3" title="Labels & pricing" hint="HSN drives GST. The basis dropdown (per piece / per 100 / customize) sits before each price and groups the Proforma." />
          {G([["hsn", "HSN code"], ["bgPerBox", "Bg per box", "number"], ["pPerBox", "P per box", "number"], ["typeUp", "Type UP (labels / sheet)", "number"]])}
          <div className="grid-2" style={{ marginTop: 12 }}>
            <Field label="Value basis"><Select value={f.valueMode} onChange={(e) => set("valueMode", e.target.value)}>{UNIT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
            <Field label="Unit value (₹)"><Input type="number" value={f.unitValue} onChange={(e) => set("unitValue", e.target.value)} /></Field>
            <Field label="FOB basis"><Select value={f.fobMode} onChange={(e) => set("fobMode", e.target.value)}>{UNIT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
            <Field label="Unit FOB ($)"><Input type="number" value={f.unitFob100} onChange={(e) => set("unitFob100", e.target.value)} /></Field>
          </div>
        </section>
      </div>
    </Drawer>
  );
}

/* ---------- Party list + add form (shared by buyers and suppliers) ---------- */
function PartyPanel({ title, icon, count, children, form }) {
  return (
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)" }}>
      <Card>
        <CardHead icon={icon} title={`${count} ${title}`} />
        <div>{children}</div>
      </Card>
      <Card pad>{form}</Card>
    </div>
  );
}

/* ============================================================
   Access editor — a preset gets it right in one click; the tree
   below is only for fine-tuning. Ticking a section ticks all of
   its sub-areas; unticking clears them.
   ============================================================ */
function AccessEditor({ access, onChange }) {
  const set = new Set(access);
  const leaves = (n) => (n.children ? n.children.map((c) => c.id) : [n.id]);
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
  const presetMatch = Object.entries(ACCESS_PRESETS).find(([, p]) => p.perms.length === set.size && p.perms.every((x) => set.has(x)))?.[0];

  return (
    <div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {Object.entries(ACCESS_PRESETS).map(([k, p]) => (
          <button key={k} className={`preset-chip${presetMatch === k ? " on" : ""}`} onClick={() => onChange([...p.perms])}>
            {presetMatch === k && <Check size={12} strokeWidth={3} />} {p.label}
            <span className="pc-n">{p.perms.length === ALL_PERMS.length ? "everything" : `${p.perms.length} areas`}</span>
          </button>
        ))}
      </div>
      <div className="perm-tree">
        {PERM_TREE.map((n) => {
          const ls = leaves(n);
          const on = ls.filter((id) => set.has(id)).length;
          return (
            <div key={n.id} className="perm-group">
              <label className="perm-row head">
                <input type="checkbox" checked={on === ls.length} ref={(el) => el && (el.indeterminate = on > 0 && on < ls.length)} onChange={() => toggleNode(n)} />
                <span className="grow">{n.label}</span>
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

/* ---------- Users tab (admin only) ---------- */
function UsersPanel() {
  const { users, user: me, updateUser, removeUser, addUser, resetUsers } = useAuth();
  const { toast } = useApp();
  const [editAccess, setEditAccess] = useState(null); // { email, access }
  const [draft, setDraft] = useState({ name: "", email: "", password: "", preset: "operations" });

  const pending = users.filter((u) => u.status === "pending");
  const active = users.filter((u) => u.status === "active");

  const approve = (u) => { updateUser(u.email, { status: "active" }); toast(`${u.name} approved — they can sign in now`); };
  const decline = (u) => { removeUser(u.email); toast(`Request from ${u.name} declined`); };

  const add = () => {
    if (!draft.name.trim() || !draft.email.trim() || draft.password.length < 8) { toast("Fill name and email — password needs 8+ characters"); return; }
    const r = addUser({ name: draft.name.trim(), email: draft.email.trim(), password: draft.password, status: "active", access: [...ACCESS_PRESETS[draft.preset].perms] });
    if (!r.ok) { toast(r.error); return; }
    toast(`${draft.name} added with ${ACCESS_PRESETS[draft.preset].label.toLowerCase()}`);
    setDraft({ name: "", email: "", password: "", preset: "operations" });
  };

  return (
    <>
      {pending.length > 0 && (
        <Card>
          <CardHead icon={Clock} title={`${pending.length} request${pending.length === 1 ? "" : "s"} waiting for approval`} />
          {pending.map((u, i) => (
            <div key={u.email} className="row" style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "var(--ink)", fontWeight: 650, fontSize: 13.5 }}>{u.name} <Pill tone="amber">pending</Pill></div>
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}><Mono>{u.email}</Mono> · will get: {accessLabel(u)}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Btn size="sm" icon={Check} onClick={() => approve(u)}>Approve</Btn>
                <Btn variant="ghost" size="sm" onClick={() => decline(u)}>Decline</Btn>
              </div>
            </div>
          ))}
          <div className="card-foot"><Note tone="amber">New sign-up requests land here. Approve to let the person in — you can change what they see any time after.</Note></div>
        </Card>
      )}

      <PartyPanel title={`user${active.length === 1 ? "" : "s"} with access`} icon={UsersIcon} count={active.length}
        form={
          <>
            <div style={{ marginBottom: 14 }}><Step n="+" title="Add a user" hint="Pick a bundle — you can fine-tune the areas afterwards with one click." /></div>
            <div className="stack-sm">
              <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Priya Mehta" /></Field>
              <Field label="Email"><Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="priya@jg.com" /></Field>
              <Field label="Password" hint="At least 8 characters. The user can be given a new one later by editing here."><Input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="••••••••" /></Field>
              <Field label="What can they see?">
                <Select value={draft.preset} onChange={(e) => setDraft({ ...draft, preset: e.target.value })}>
                  {Object.entries(ACCESS_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                </Select>
              </Field>
              <div><Btn icon={UserPlus} disabled={!draft.name || !draft.email} onClick={add}>Add user</Btn></div>
            </div>
          </>
        }>
        {active.map((u, i) => (
          <div key={u.email} className="row" style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", justifyContent: "space-between" }}>
            <div>
              <div className="row" style={{ gap: 7 }}>
                <span style={{ color: "var(--ink)", fontWeight: 650, fontSize: 13.5 }}>{u.name}</span>
                {u.role === "admin" ? <Pill tone="teal"><ShieldCheck size={11} /> Admin</Pill> : <Pill>{accessLabel(u)}</Pill>}
                {u.email === me.email && <Pill tone="green">you</Pill>}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}><Mono>{u.email}</Mono></div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {u.role !== "admin" && <Btn variant="ghost" size="sm" icon={KeyRound} onClick={() => setEditAccess({ email: u.email, name: u.name, access: [...u.access] })}>Access</Btn>}
              {u.role !== "admin" && u.email !== me.email && (
                <button className="icon-btn bare" title="Remove user" onClick={() => { removeUser(u.email); toast(`${u.name} removed`); }}><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </PartyPanel>

      <div className="row wrap" style={{ justifyContent: "space-between", gap: 10 }}>
        <div className="grow">
          <Note tone="teal">
            <b>How access works:</b> the Admin sees everything, always. Everyone else sees only the ticked areas — their menu bar, search and shortcuts shrink to match, so nobody ever meets a page they can't use.
          </Note>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => { resetUsers(); toast("Demo users restored: admin, user1, user2 (pending)"); }}>Reset demo users</Btn>
      </div>

      {editAccess && (
        <Modal title={`Access · ${editAccess.name}`} icon={KeyRound} onClose={() => setEditAccess(null)} width={560}
          footer={<>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{editAccess.access.length} of {ALL_PERMS.length} areas ticked — changes apply the moment you save.</span>
            <div className="row" style={{ gap: 8 }}>
              <Btn variant="ghost" size="sm" onClick={() => setEditAccess(null)}>Cancel</Btn>
              <Btn size="sm" icon={Check} onClick={() => { updateUser(editAccess.email, { access: editAccess.access }); toast(`Access updated for ${editAccess.name}`); setEditAccess(null); }}>Save access</Btn>
            </div>
          </>}>
          <AccessEditor access={editAccess.access} onChange={(a) => setEditAccess({ ...editAccess, access: a })} />
        </Modal>
      )}
    </>
  );
}

/* ============================================================ */
export default function Setup() {
  const { items, setItems, buyers, setBuyers, suppliers, setSuppliers, transports, setTransports, supCode, toast } = useApp();
  const { isAdmin, has, users } = useAuth();
  const canItems = has("setup.items");
  const canParties = has("setup.parties");
  const [tab, setTab] = useState(canItems ? "items" : canParties ? "buyers" : "users");
  const [preset, setPreset] = useState("essentials");
  const [colMgr, setColMgr] = useState(false);
  const [customCols, setCustomCols] = useState(null);
  const [addItem, setAddItem] = useState(false);
  const [editing, setEditing] = useState(null);
  const [supFilter, setSupFilter] = useState("all");
  const [q, setQ] = useState("");

  const [sDraft, setSDraft] = useState({ name: "", place: "", gstin: "" });
  const [bDraft, setBDraft] = useState({ name: "", brand: "", country: "", curr: "USD", shipTo: "" });
  const [tDraft, setTDraft] = useState({ ...EMPTY_TRANSPORT });

  const DEF = COL(supCode);

  /* Which columns are on screen right now */
  const activeKeys = preset === "custom" && customCols
    ? customCols.filter((c) => c.visible).map((c) => c.key)
    : PRESETS[preset].keys;

  const columns = activeKeys.map((k) => {
    const c = DEF[k];
    if (c) return { key: k, ...c };
    const cc = (customCols || []).find((x) => x.key === k);
    return { key: k, label: cc?.label || k, w: 120, render: () => <span style={{ color: "var(--faint)" }}>—</span> };
  }).concat([{ key: "_edit", label: "", w: 48, render: (it) => <EditBtn onClick={() => setEditing({ type: "item", value: it })} /> }]);

  const shownItems = items
    .filter((it) => supFilter === "all" || it.supplierId === supFilter)
    .filter((it) => !q.trim() || (it.gd + it.code + it.description + it.barcode).toLowerCase().includes(q.trim().toLowerCase()));

  const openColMgr = () => {
    if (!customCols) setCustomCols(PRESETS.all.keys.map((k) => ({ key: k, label: DEF[k].label, visible: true })));
    setColMgr(true);
  };

  const saveItem = (f) => { const o = { ...f }; ITEM_NUM.forEach((k) => (o[k] = Number(o[k]))); setItems(items.map((it) => (it.id === o.id ? o : it))); setEditing(null); toast(`Item ${o.gd} updated`); };

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Setup</h2>
        <p className="sub">
          Your single source of truth. Set an item, a buyer or a supplier up once and every order, invoice and document downstream reads from it — so placing an order only ever needs a code and a quantity.
          {isAdmin && <> Under <b>Users</b> you decide who sees which part of the system.</>}
        </p>
      </div>

      <Seg options={[
        ...(canItems ? [["items", `Items · ${items.length}`, Layers]] : []),
        ...(canParties ? [["buyers", `Buyers · ${buyers.length}`, Globe], ["suppliers", `Suppliers · ${suppliers.length}`, Truck], ["transports", `Transport · ${transports.length}`, Route]] : []),
        ...(isAdmin ? [["users", `Users · ${users.length}`, UsersIcon]] : []),
      ]} value={tab} onChange={setTab} />

      {/* ---------------- ITEMS ---------------- */}
      {tab === "items" && (
        <>
          <div className="row wrap" style={{ justifyContent: "space-between", gap: 12 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <Btn icon={Plus} onClick={() => setAddItem(true)}>Add item</Btn>
              <Btn variant="ghost" icon={SlidersHorizontal} onClick={openColMgr}>Customise columns</Btn>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <SearchInput value={q} onChange={setQ} placeholder="Search items…" style={{ width: 220 }} />
              <Select style={{ width: 210 }} value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
                <option value="all">All suppliers ({items.length} items)</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </Select>
            </div>
          </div>

          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <Seg
              options={[...Object.entries(PRESETS).map(([k, p]) => [k, p.label]), ...(customCols ? [["custom", "My view"]] : [])]}
              value={preset} onChange={setPreset}
            />
            <span style={{ fontSize: 11.5, color: "var(--muted)" }} className="row">
              {preset === "custom" ? "Your saved column layout." : PRESETS[preset].hint}
              <Info>These are saved views of the same item master — switching a view never changes your data. Downloads always contain every column.</Info>
            </span>
          </div>

          <Card>
            <CardHead icon={Layers} title={`${shownItems.length} item${shownItems.length === 1 ? "" : "s"}`}>
              <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Pencil to edit any value</span>
            </CardHead>
            {shownItems.length
              ? <DataTable columns={columns} rows={shownItems} rowKey={(it) => it.id} freeze={columns.length > 8 ? 3 : 0} maxHeight={520} />
              : <Empty icon={Search} title="No item matches">Clear the search or pick a different supplier.</Empty>}
            <div className="card-foot">
              <Note tone="amber">Constant fields only — these never change with an order. Quantities, totals, labels, sheets and rate are calculated per order.</Note>
            </div>
          </Card>

          <FormulaPanel title="What gets calculated from these fields?" rows={BUYER_FORMULAS}
            intro="An item stores only what is constant. Everything below depends on the order quantity and the day’s RBI rate, so it is derived when the order is placed — never stored, never stale." />
        </>
      )}

      {/* ---------------- BUYERS ---------------- */}
      {tab === "buyers" && (
        <PartyPanel title={`buyer${buyers.length === 1 ? "" : "s"}`} icon={Globe} count={buyers.length}
          form={
            <>
              <div style={{ marginBottom: 14 }}><Step n="+" title="Add a buyer" hint="Nothing technical — it is just a form." /></div>
              <div className="stack-sm">
                <Field label="Buyer name"><Input value={bDraft.name} onChange={(e) => setBDraft({ ...bDraft, name: e.target.value })} placeholder="e.g. Aqua Distributors Ltd" /></Field>
                <Field label="Trading as (brand)"><Input value={bDraft.brand} onChange={(e) => setBDraft({ ...bDraft, brand: e.target.value })} placeholder="e.g. AquaMark" /></Field>
                <div className="grid-2">
                  <Field label="Country"><Input value={bDraft.country} onChange={(e) => setBDraft({ ...bDraft, country: e.target.value })} placeholder="e.g. Australia" /></Field>
                  <Field label="Currency"><Input value={bDraft.curr} onChange={(e) => setBDraft({ ...bDraft, curr: e.target.value })} /></Field>
                </div>
                <Field label="Ship to (port)"><Input value={bDraft.shipTo} onChange={(e) => setBDraft({ ...bDraft, shipTo: e.target.value })} placeholder="e.g. Sydney" /></Field>
                <div>
                  <Btn icon={Plus} disabled={!bDraft.name} onClick={() => {
                    setBuyers([...buyers, { ...bDraft, id: "b" + (buyers.length + 1), addr: "", orderNo: "" }]);
                    toast(`Buyer ${bDraft.name} added`);
                    setBDraft({ name: "", brand: "", country: "", curr: "USD", shipTo: "" });
                  }}>Add buyer</Btn>
                </div>
              </div>
            </>
          }>
          {buyers.map((b, i) => (
            <div key={b.id} style={{ padding: "14px 16px", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "var(--ink)", fontWeight: 650, fontSize: 14 }}>{b.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Trading as {b.brand || "—"}</div>
                </div>
                <div className="row" style={{ gap: 8 }}>{i === 0 && <Pill tone="green">Active</Pill>}<EditBtn onClick={() => setEditing({ type: "buyer", value: b })} /></div>
              </div>
              <div className="grid-3" style={{ marginTop: 12, gap: 12 }}>
                {[["Country", b.country], ["Currency", b.curr], ["Ship to", b.shipTo]].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10.5, color: "var(--faint)" }}>{k}</div><div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>{v || "—"}</div></div>
                ))}
              </div>
            </div>
          ))}
        </PartyPanel>
      )}

      {/* ---------------- SUPPLIERS ---------------- */}
      {tab === "suppliers" && (
        <PartyPanel title="suppliers" icon={Truck} count={suppliers.length}
          form={
            <>
              <div style={{ marginBottom: 14 }}><Step n="+" title="Add a supplier" hint="Their code is derived from the name — edit it after if you like." /></div>
              <div className="stack-sm">
                <Field label="Supplier name"><Input value={sDraft.name} onChange={(e) => setSDraft({ ...sDraft, name: e.target.value })} placeholder="e.g. Anand Polymers" /></Field>
                <Field label="Place"><Input value={sDraft.place} onChange={(e) => setSDraft({ ...sDraft, place: e.target.value })} placeholder="e.g. Daman" /></Field>
                <Field label="GSTIN"><Input value={sDraft.gstin} onChange={(e) => setSDraft({ ...sDraft, gstin: e.target.value })} /></Field>
                <div>
                  <Btn icon={Plus} disabled={!sDraft.name} onClick={() => {
                    setSuppliers([...suppliers, { id: "n" + (suppliers.length + 1), code: sDraft.name.slice(0, 2).toUpperCase(), name: sDraft.name, place: sDraft.place || "—", gstin: sDraft.gstin || "—", weights: "auto" }]);
                    toast(`Supplier ${sDraft.name} added`);
                    setSDraft({ name: "", place: "", gstin: "" });
                  }}>Add supplier</Btn>
                </div>
              </div>
            </>
          }>
          {suppliers.map((s, i) => (
            <div key={s.id} className="row" style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", justifyContent: "space-between" }}>
              <div>
                <div className="row" style={{ gap: 7 }}><span style={{ color: "var(--ink)", fontWeight: 650, fontSize: 13.5 }}>{s.name}</span><Pill>{s.code}</Pill></div>
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{s.place} · <Mono>{s.gstin}</Mono></div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {s.weights === "manual" && <Pill tone="amber">weights manual</Pill>}
                <EditBtn onClick={() => setEditing({ type: "supplier", value: s })} />
              </div>
            </div>
          ))}
        </PartyPanel>
      )}

      {/* ---------------- TRANSPORT ---------------- */}
      {tab === "transports" && (
        <PartyPanel title={`transport${transports.length === 1 ? "" : "s"}`} icon={Route} count={transports.length}
          form={
            <>
              <div style={{ marginBottom: 14 }}><Step n="+" title="Add a transport" hint="You pick this carrier when filling a shipment's vehicle details." /></div>
              <div className="stack-sm">
                <Field label="Transport name"><Input value={tDraft.name} onChange={(e) => setTDraft({ ...tDraft, name: e.target.value })} placeholder="e.g. VRL Logistics" /></Field>
                <Field label="Transport ID"><Input value={tDraft.transportId} onChange={(e) => setTDraft({ ...tDraft, transportId: e.target.value })} placeholder="e.g. MH-TR-8812" /></Field>
                <Field label="Supplier"><Select value={tDraft.supplierId} onChange={(e) => setTDraft({ ...tDraft, supplierId: e.target.value })}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</Select></Field>
                <div>
                  <Btn icon={Plus} disabled={!tDraft.name || !tDraft.transportId} onClick={() => {
                    setTransports([...transports, { ...tDraft, id: "t" + Date.now() }]);
                    toast(`Transport ${tDraft.name} added`);
                    setTDraft({ ...EMPTY_TRANSPORT });
                  }}>Add transport</Btn>
                </div>
              </div>
            </>
          }>
          {transports.map((t, i) => (
            <div key={t.id} className="row" style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", justifyContent: "space-between" }}>
              <div>
                <div className="row" style={{ gap: 7 }}><span style={{ color: "var(--ink)", fontWeight: 650, fontSize: 13.5 }}>{t.name}</span><Pill><Mono>{t.transportId}</Mono></Pill></div>
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>Supplier: {supCode(t.supplierId)}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <EditBtn onClick={() => setEditing({ type: "transport", value: t })} />
                <button className="icon-btn bare" title="Delete transport" onClick={() => { setTransports(transports.filter((x) => x.id !== t.id)); toast(`Transport ${t.name} removed`); }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </PartyPanel>
      )}

      {/* ---------------- USERS (admin only) ---------------- */}
      {tab === "users" && isAdmin && <UsersPanel />}

      {addItem && <AddItemDrawer onClose={() => setAddItem(false)} />}
      {colMgr && <ColumnManager cols={customCols} onClose={() => setColMgr(false)} onSave={(l) => { setCustomCols(l); setPreset("custom"); setColMgr(false); }} />}
      {editing?.type === "item" && <EditModal title={`Edit item · ${editing.value.gd}`} schema={itemSchema(suppliers)} value={editing.value} onClose={() => setEditing(null)} onSave={saveItem} />}
      {editing?.type === "buyer" && <EditModal title={`Edit buyer · ${editing.value.name}`} cols={2} schema={BUYER_SCHEMA} value={editing.value} onClose={() => setEditing(null)} onSave={(f) => { setBuyers(buyers.map((b) => (b.id === f.id ? f : b))); setEditing(null); toast("Buyer updated"); }} />}
      {editing?.type === "supplier" && <EditModal title={`Edit supplier · ${editing.value.name}`} cols={2} schema={SUP_SCHEMA} value={editing.value} onClose={() => setEditing(null)} onSave={(f) => { setSuppliers(suppliers.map((s) => (s.id === f.id ? { ...s, ...f } : s))); setEditing(null); toast("Supplier updated"); }} />}
      {editing?.type === "transport" && <EditModal title={`Edit transport · ${editing.value.name}`} cols={2} schema={transportSchema(suppliers)} value={editing.value} onClose={() => setEditing(null)} onSave={(f) => { setTransports(transports.map((t) => (t.id === f.id ? { ...t, ...f } : t))); setEditing(null); toast("Transport updated"); }} />}
    </div>
  );
}
