import { useMemo, useState } from "react";
import {
  Layers, Plus, Check, SlidersHorizontal, GripVertical, Trash2, Search, AlertTriangle,
  EyeOff, Pencil,
} from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Input, Select, Pill, Mono, DataTable, Modal, EditBtn,
  Empty, Note, Info, SearchInput, FormulaPanel, Spinner, ErrorState, DownloadPair,
} from "../../components/ui/index.jsx";
import {
  useItems, useItemGroups, useCreateItem, useUpdateItem, useDeleteItem,
  useSuppliers, useMasterFormulas,
} from "../../api/hooks.js";
import { num, inr, usd, usdp, todayISO } from "../../lib/format.js";
import { useDebounced } from "../../lib/useDebounced.js";
import { hidePriceCols } from "../../lib/priceCols.js";
import { downloadGridExcel, downloadGridPDF } from "../../lib/download.js";
import AddItemDrawer from "./AddItemDrawer.jsx";
import ItemEditModal from "./ItemEditModal.jsx";

/* The item master — every product of every supplier, out of Masters.xlsx.

   Four saved views of the same table, so nobody has to learn "2A" or "7A":
   the columns each sheet actually carries are a preset, and the first five
   stay frozen while you scroll sideways. */

const COLS = (supCode) => ({
  gd: { label: "GD code", w: 96, render: (it) => <Mono>{it.gd}</Mono> },
  code: { label: "Code", w: 92, render: (it) => <Mono>{it.code}</Mono> },
  oswin: { label: "OSWIN", w: 110, render: (it) => <Mono>{it.oswin || "—"}</Mono> },
  gl: { label: "GL", w: 88, render: (it) => <Mono>{it.gl || "—"}</Mono> },
  description: {
    label: "Description", w: 230,
    render: (it) => (
      <span>
        <span style={{ color: "var(--ink)", fontWeight: 600, whiteSpace: "pre-line" }}>{it.description}</span>
        <div style={{ color: "var(--faint)", fontSize: 11 }}>{it.group}</div>
      </span>
    ),
  },
  size: { label: "Size mm", w: 78, align: "r", render: (it) => it.size || "—" },
  length: { label: "Len mm", w: 78, align: "r", render: (it) => it.length || "—" },
  packUnit: { label: "Unit pack", w: 86, align: "r", render: (it) => it.pack_unit || "—" },
  packing: { label: "Packing", w: 96, align: "r", render: (it) => `${it.packing} / box` },
  barcode: { label: "Bar code", w: 132, render: (it) => <Mono>{it.barcode || "—"}</Mono> },
  hsn: { label: "HSN", w: 96, render: (it) => <Mono>{it.hsn || "—"}</Mono> },
  volume: { label: "Vol/box", w: 82, align: "r", render: (it) => num(it.volume, 3) },
  netPerBox: { label: "Net/box", w: 82, align: "r", render: (it) => num(it.net_per_box, 2) },
  grossPerBox: { label: "Gross/box", w: 90, align: "r", render: (it) => num(it.gross_per_box, 2) },
  bgPerBox: { label: "BG", w: 64, align: "r", render: (it) => num(it.bg_per_box, 0) },
  pPerBox: { label: "PC", w: 64, align: "r", render: (it) => num(it.p_per_box, 0) },
  stk: { label: "Stk/box", w: 84, align: "r", strong: true, render: (it) => num(it.stickers_per_box, 1) },
  typeUp: { label: "Labels/sheet", w: 96, align: "r", render: (it) => it.type_up || <span style={{ color: "var(--amber-ink)" }}>not set</span> },
  range: { label: "Range", w: 84, render: (it) => <Pill>{(it.sticker_rule || "").toUpperCase()}</Pill> },
  unitValue: { label: "Unit ₹", w: 92, align: "r", strong: true, render: (it) => (it.unit_value ? inr(it.unit_value) : <span style={{ color: "var(--amber-ink)" }}>not set</span>) },
  unitFob: { label: "FOB $", w: 110, align: "r", strong: true, render: (it) => (it.unit_fob100 ? <>{usdp(it.unit_fob100)}<span style={{ color: "var(--faint)" }}>{it.fob_mode === "100" ? "/100" : "/pc"}</span></> : <span style={{ color: "var(--amber-ink)" }}>not set</span>) },
  fobpc: { label: "FOB/pc $", w: 96, align: "r", render: (it) => usdp(it.fob_mode === "100" ? it.unit_fob100 / 100 : it.unit_fob100) },
  uom: { label: "Ordered in", w: 92, render: (it) => (it.uom === "MTR" ? "Metres" : "Pieces") },
  sheet: { label: "Source sheet", w: 110, render: (it) => <span style={{ color: "var(--muted)" }}>{it.source_sheet || "—"}</span> },
  supplier: { label: "Supplier", w: 100, render: (it) => <Pill>{supCode(it.supplier_id)}</Pill> },
});

const PRESETS = {
  buyer: { label: "Buyer sheet", hint: "The constant fields on the 2A buyer master — handy for verifying item pricing.", keys: ["gd", "code", "size", "length", "packUnit", "packing", "description", "barcode", "hsn", "volume", "netPerBox", "grossPerBox", "stk", "typeUp", "unitValue", "unitFob", "supplier"] },
  supplier: { label: "Supplier sheet", hint: "The constant fields on the 7A supplier master. BG and PC are the bag and piece stickers a box carries.", keys: ["gd", "code", "oswin", "gl", "size", "length", "packing", "description", "barcode", "hsn", "volume", "bgPerBox", "pPerBox", "stk", "unitValue", "fobpc", "supplier"] },
  all: { label: "All fields", hint: "Every column stored on an item.", keys: ["gd", "code", "oswin", "gl", "description", "size", "length", "packUnit", "packing", "uom", "barcode", "hsn", "volume", "netPerBox", "grossPerBox", "bgPerBox", "pPerBox", "stk", "typeUp", "range", "unitValue", "unitFob", "sheet", "supplier"] },
};

/* Column manager — drag to reorder, tick to show, and add or drop columns.

   "Add" offers any master field not already on the list, plus a free-text name
   for a column of your own. A custom column has nothing behind it yet, so it
   renders empty — it is a placeholder for a figure you keep in your head or in
   another sheet, and it can be removed again with the bin. */
function ColumnManager({ cols, catalogue, onSave, onClose }) {
  const [list, setList] = useState(cols.map((c) => ({ ...c })));
  const [dragI, setDragI] = useState(null);
  const [overI, setOverI] = useState(null);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");

  const toggle = (i) => setList((l) => l.map((c, j) => (j === i ? { ...c, visible: !c.visible } : c)));
  const removeAt = (i) => setList((l) => l.filter((_, j) => j !== i));
  const drop = (i) => {
    if (dragI === null || dragI === i) { setDragI(null); setOverI(null); return; }
    setList((l) => { const a = [...l]; const [m] = a.splice(dragI, 1); a.splice(i, 0, m); return a; });
    setDragI(null); setOverI(null);
  };

  const onList = new Set(list.map((c) => c.key));
  const available = Object.entries(catalogue).filter(([k]) => !onList.has(k));

  const addField = () => {
    if (!pick) return;
    setList((l) => [...l, { key: pick, label: catalogue[pick].label, visible: true }]);
    setPick("");
  };
  const addCustom = () => {
    const n = name.trim();
    if (!n) return;
    setList((l) => [...l, { key: `c${Date.now()}`, label: n, visible: true, custom: true }]);
    setName("");
  };

  const shown = list.filter((c) => c.visible).length;

  return (
    <Modal title="Customise columns" icon={SlidersHorizontal} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{shown} of {list.length} column(s) shown</span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} onClick={() => onSave(list)}>Save view</Btn>
        </div>
      </>}>
      <div style={{ maxHeight: 340, overflowY: "auto", margin: "12px 0" }}>
        {list.map((c, i) => (
          <div key={c.key} draggable
            onDragStart={() => setDragI(i)}
            onDragOver={(e) => { e.preventDefault(); setOverI(i); }}
            onDrop={() => drop(i)}
            onDragEnd={() => { setDragI(null); setOverI(null); }}
            className={`colrow${overI === i && dragI !== null ? " over" : ""}${dragI === i ? " drag" : ""}`}>
            <GripVertical size={15} style={{ color: "var(--faint)" }} />
            <input type="checkbox" checked={c.visible} onChange={() => toggle(i)}
              style={{ width: 15, height: 15, accentColor: "var(--teal)", cursor: "pointer" }} />
            <span style={{ fontSize: 13, color: c.visible ? "var(--ink)" : "var(--faint)", fontWeight: 500, flex: 1 }}>
              {c.label} {c.custom && <Pill tone="teal">custom</Pill>}
            </span>
            {i < 5 && c.visible && <Pill tone="amber">frozen</Pill>}
            <button className="icon-btn bare" title="Remove this column" onClick={() => removeAt(i)}><Trash2 size={14} /></button>
          </div>
        ))}
        {!list.length && <div style={{ padding: 20, textAlign: "center", color: "var(--faint)", fontSize: 12.5 }}>No columns — add one below.</div>}
      </div>

      <div className="stack-sm">
        <div className="row" style={{ gap: 8 }}>
          <Select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}>
            <option value="">Add a master field…</option>
            {available.map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </Select>
          <Btn variant="ghost" icon={Plus} disabled={!pick} onClick={addField}>Add</Btn>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="…or name a column of your own"
            onKeyDown={(e) => e.key === "Enter" && addCustom()} style={{ flex: 1 }} />
          <Btn variant="ghost" icon={Plus} disabled={!name.trim()} onClick={addCustom}>Add</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* The item master as it downloads — every column, prices included. What the
   client keeps off the screen is still theirs on paper and in the workbook. */
const EXPORT_COLS = (supCode) => [
  { h: "GD code", key: "gd", f: (r) => r.gd, w: 12 },
  { h: "Code", key: "code", f: (r) => r.code, w: 12 },
  { h: "OSWIN", key: "oswin", f: (r) => r.oswin },
  { h: "GL", key: "gl", f: (r) => r.gl },
  { h: "Description", key: "description", f: (r) => r.description, w: 34 },
  { h: "Group", key: "group", f: (r) => r.group },
  { h: "Supplier", key: "supplier", f: (r) => supCode(r.supplier_id) },
  { h: "Size mm", key: "size", f: (r) => r.size },
  { h: "Len mm", key: "length", f: (r) => r.length },
  { h: "Ordered in", key: "uom", f: (r) => (r.uom === "MTR" ? "Metres" : "Pieces") },
  { h: "Unit pack", key: "packUnit", t: "int", v: (r) => r.pack_unit },
  { h: "Pcs / box", key: "packing", t: "int", v: (r) => r.packing },
  { h: "Bar code", key: "barcode", f: (r) => r.barcode },
  { h: "HSN", key: "hsn", f: (r) => r.hsn },
  { h: "Vol / box m³", key: "volume", t: "num3", v: (r) => r.volume },
  { h: "Net / box kg", key: "net", t: "num", v: (r) => r.net_per_box },
  { h: "Gross / box kg", key: "gross", t: "num", v: (r) => r.gross_per_box },
  { h: "BG / box", key: "bg", t: "int", v: (r) => r.bg_per_box },
  { h: "PC / box", key: "pc", t: "int", v: (r) => r.p_per_box },
  /* The ranges do not agree on this: a typed-in total always wins, the GRN
     range rounds, the rest do not. The formula follows the row's own rule
     rather than one blanket expression. */
  {
    h: "Stickers / box", key: "stk", t: "num1",
    fml: (r) => (Number(r.stickers_fixed)
      ? String(Number(r.stickers_fixed))
      : (r.sticker_round ? "ROUND(({bg}+{pc})*{mult},0)" : "({bg}+{pc})*{mult}")),
  },
  { h: "Sticker ×", key: "mult", t: "num", v: (r) => r.sticker_mult },
  { h: "Label allowance", key: "spoil", t: "num", v: (r) => r.label_spoilage },
  { h: "Labels / sheet", key: "typeup", t: "int", v: (r) => r.type_up },
  { h: "Range", key: "range", f: (r) => String(r.sticker_rule || "").toUpperCase() },
  { h: "Purchase basis", key: "valmode", f: (r) => (r.value_mode === "100" ? "Per 100" : "Per piece") },
  { h: "Purchase price ₹", key: "unitValue", t: "inr", v: (r) => r.unit_value },
  { h: "FOB basis", key: "fobmode", f: (r) => (r.fob_mode === "100" ? "Per 100" : "Per piece") },
  { h: "FOB price $", key: "unitFob", t: "usd4", v: (r) => r.unit_fob100 },
  { h: "FOB / pc $", key: "fobpc", t: "usd4", fml: (r) => (r.fob_mode === "100" ? "{unitFob}/100" : "{unitFob}") },
  { h: "Source sheet", key: "sheet", f: (r) => r.source_sheet },
];

/* Pick an item to edit.

   The table below is a report — long, and filtered for reading. Editing is a
   different job: you know which product you want, so this is a search box, a
   supplier filter and a list, and picking a row opens the same edit form the
   pencil opens. */
function ItemPicker({ suppliers, onPick, onClose }) {
  const [q, setQ] = useState("");
  const [sup, setSup] = useState("");
  const list = useItems({ supplier_id: sup, q: useDebounced(q) });
  const rows = list.data || [];
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  return (
    <Modal title="Edit an item" icon={Pencil} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {list.isLoading ? "Searching…" : `${rows.length} item${rows.length === 1 ? "" : "s"} match`}
        </span>
        <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
      </>}>
      <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
        <SearchInput value={q} onChange={setQ} placeholder="Code, GD, OSWIN, description…" style={{ flex: 1, minWidth: "min(240px, 100%)" }} />
        <Select style={{ width: 230 }} value={sup} onChange={(e) => setSup(e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </Select>
      </div>

      {list.isLoading ? <Spinner label="Loading items…" />
        : rows.length ? (
          <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
            {rows.map((it, i) => (
              <button key={it.id} className="pick-row" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}
                onClick={() => onPick(it)}>
                <Mono>{it.gd || it.code}</Mono>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--ink)", fontWeight: 600, whiteSpace: "pre-line" }}>{it.description || "untitled"}</span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--faint)" }}>{it.code} · {it.packing} / box{it.group ? ` · ${it.group}` : ""}</span>
                </span>
                <Pill>{supCode(it.supplier_id)}</Pill>
                <Pencil size={14} style={{ color: "var(--faint)" }} />
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={Search} title="No item matches">Try the GD code, the item code, the supplier, or part of the description.</Empty>
        )}
    </Modal>
  );
}

export default function ItemsPanel() {
  const suppliers = useSuppliers().data || [];
  const groups = useItemGroups().data || [];
  const formulas = useMasterFormulas().data || [];

  const [preset, setPreset] = useState("buyer");
  const [customCols, setCustomCols] = useState(null);
  const [colMgr, setColMgr] = useState(false);
  const [addItem, setAddItem] = useState(false);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [failed, setFailed] = useState("");

  const [supFilter, setSupFilter] = useState("");
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);

  const list = useItems({ supplier_id: supFilter, group, q: useDebounced(q) });
  const remove = useDeleteItem();

  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const DEF = useMemo(() => COLS(supCode), [suppliers]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetched = list.data || [];
  /* The workbook leaves a price or a labels-per-sheet blank on some rows —
     Excel shows #DIV/0! for those. They import faithfully; this puts them in
     one place so they get filled in rather than found by accident. */
  const gapsOf = (r) => {
    const g = [];
    if (!r.unit_value) g.push("purchase price");
    if (!r.unit_fob100) g.push("FOB price");
    if (!r.type_up) g.push("labels per sheet");
    return g;
  };
  const withGaps = fetched.filter((r) => gapsOf(r).length);
  const shownItems = onlyGaps ? withGaps : fetched;
  const total = groups.reduce((s, g) => s + g.count, 0);

  const activeKeys = preset === "custom" && customCols
    ? customCols.filter((c) => c.visible).map((c) => c.key)
    : PRESETS[preset].keys;

  /* The purchase and FOB prices come out of every view. They are still in the
     master, still in the edit form, still in every download — just not on a
     screen anyone can read over a shoulder. */
  const columns = hidePriceCols(activeKeys.map((k) => {
    if (DEF[k]) return { key: k, ...DEF[k] };
    const custom = (customCols || []).find((c) => c.key === k);
    return { key: k, label: custom?.label || k, w: 120, render: () => <span style={{ color: "var(--faint)" }}>—</span> };
  })).concat([{
    key: "_edit", label: "", w: 84, align: "r",
    render: (it) => (
      <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
        {gapsOf(it).length ? <span title={`Missing: ${gapsOf(it).join(", ")}`}><AlertTriangle size={13} style={{ color: "var(--amber-ink)" }} /></span> : null}
        <EditBtn onClick={() => setEditing(it)} />
        {confirmId === it.id
          ? <Btn variant="danger" size="sm" icon={Trash2} onClick={() => remove.mutate(it.id, { onError: (e) => setFailed(e.message), onSettled: () => setConfirmId(null) })}>Confirm</Btn>
          : <button className="icon-btn bare" title="Delete" onClick={() => { setFailed(""); setConfirmId(it.id); }}><Trash2 size={14} /></button>}
      </span>
    ),
  }]);

  const clear = () => { setSupFilter(""); setGroup(""); setQ(""); setOnlyGaps(false); };
  const filtering = supFilter || group || q || onlyGaps;

  const openColMgr = () => {
    if (!customCols) setCustomCols(PRESETS.all.keys.map((k) => ({ key: k, label: DEF[k].label, visible: true })));
    setColMgr(true);
  };

  const exportCols = useMemo(() => EXPORT_COLS(supCode), [suppliers]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportOpts = {
    title: "Item master",
    subtitle: `${shownItems.length} item(s)${supFilter ? ` · supplier ${supCode(supFilter)}` : ""}${group ? ` · ${group}` : ""} · as on ${todayISO()}`,
  };

  return (
    <>
      <div className="row wrap" style={{ justifyContent: "space-between", gap: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn icon={Plus} onClick={() => setAddItem(true)}>Add item</Btn>
          <Btn variant="ghost" icon={Pencil} onClick={() => setPicking(true)}>Edit item</Btn>
          <Btn variant="ghost" icon={SlidersHorizontal} onClick={openColMgr}>Customise columns</Btn>
          <DownloadPair
            disabled={!shownItems.length}
            onExcel={() => downloadGridExcel(`Item_master_${todayISO()}`, "Item master", exportCols, shownItems, exportOpts)}
            onPDF={() => downloadGridPDF("Item master", exportCols, shownItems, exportOpts)}
          />
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Code, GD, OSWIN, description, supplier…" style={{ width: 280 }} />
          <Select style={{ width: 210 }} value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
            <option value="">All suppliers ({total} items)</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </Select>
          <Select style={{ width: 190 }} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.group} value={g.group}>{g.group || "—"} ({g.count})</option>)}
          </Select>
        </div>
      </div>

      {failed && <Note tone="amber" icon={AlertTriangle}>{failed}</Note>}

      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <Seg
          options={[...Object.entries(PRESETS).map(([k, p]) => [k, p.label]), ...(customCols ? [["custom", "My view"]] : [])]}
          value={preset} onChange={setPreset}
        />
        <span style={{ fontSize: 11.5, color: "var(--muted)" }} className="row">
          {preset === "custom" ? "Your saved column layout." : PRESETS[preset].hint}
        </span>
      </div>

      <Card>
        <CardHead icon={Layers} title={`${shownItems.length}${filtering && total ? ` of ${total}` : ""} item${shownItems.length === 1 ? "" : "s"}`}>
          {withGaps.length > 0 && (
            <Btn size="sm" variant={onlyGaps ? "primary" : "ghost"} icon={AlertTriangle} onClick={() => setOnlyGaps((v) => !v)}>
              Needs a price ({withGaps.length})
            </Btn>
          )}
          {filtering && <Btn size="sm" variant="ghost" onClick={clear}>Clear</Btn>}
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Pencil to edit any value</span>
        </CardHead>
        {list.isLoading ? <Spinner label="Loading items…" />
          : list.error ? <ErrorState error={list.error} onRetry={list.refetch} />
            : shownItems.length
              ? <DataTable serial columns={columns} rows={shownItems} rowKey={(it) => it.id} freeze={5} maxHeight={560} />
              : filtering
                ? <Empty icon={Search} title="No item matches" action={<Btn size="sm" onClick={clear}>Clear filters</Btn>}>Clear the search or pick a different supplier.</Empty>
                : <Empty icon={Layers} title="No items yet" action={<Btn icon={Plus} onClick={() => setAddItem(true)}>Add the first item</Btn>}>
                  The master is empty. Add items here, or load the client's workbook with
                  {" "}<span className="mono">python backend/scripts/import_masters.py</span>.
                </Empty>}
      </Card>

      <FormulaPanel title="What gets calculated from these fields?" rows={formulas} />

      {addItem && <AddItemDrawer onClose={() => setAddItem(false)} />}
      {picking && (
        <ItemPicker suppliers={suppliers} onClose={() => setPicking(false)}
          onPick={(it) => { setPicking(false); setEditing(it); }} />
      )}
      {colMgr && <ColumnManager cols={customCols} catalogue={DEF} onClose={() => setColMgr(false)}
        onSave={(l) => { setCustomCols(l); setPreset("custom"); setColMgr(false); }} />}
      {editing && <ItemEditModal item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
