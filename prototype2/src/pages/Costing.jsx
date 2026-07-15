import { useState } from "react";
import {
  Calculator, Plus, Download, Search, Check, Trash2, TrendingUp, TrendingDown, Boxes, Percent, Layers, Copy,
} from "lucide-react";
import { useApp } from "../store.jsx";
import {
  Card, CardHead, Btn, Field, Input, Pill, Mono, DataTable, Drawer, Step,
  Empty, Note, Info, FormulaPanel, SearchInput, Stat, EditBtn,
} from "../ui.jsx";
import { computeCosting, COSTING_FORMULAS, num, inr, usd, TODAY, dmy } from "../data.js";
import { writeXLS } from "../docs.js";

/* ============================================================
   Costing — the Cost Working sheet, live.
   Global charges sit at the top (one place, like row 3 of the
   Excel); each line stores only what is typed, everything else
   is recomputed on the spot, so the sheet can never go stale.
   ============================================================ */

const EMPTY_LINE = { gd: "", code: "", dia: "", len: "", unit: "", box: "", priceOld: "", priceNew: "", boxesFcl: "", fobNow: "", fobOld: "" };

/* ============================================================
   Bulk costing sheet — the same pattern as "New buyer order":
   every master item in one scrollable list with inline inputs,
   so costing 150+ items is typing, not clicking. A row joins the
   sheet the moment its new price and boxes/FCL are both filled.
   ============================================================ */
function BulkCostingDrawer({ onClose }) {
  const { items, costing, setCosting, costParams, setCostParams, toast } = useApp();
  const [q, setQ] = useState("");
  // Items already on the sheet come back prefilled, so this drawer edits as well as adds.
  const [vals, setVals] = useState(() => {
    const m = {};
    items.forEach((it) => {
      const ex = costing.find((l) => l.itemId === it.id || l.gd === it.gd);
      if (ex) m[it.id] = { priceOld: ex.priceOld, priceNew: ex.priceNew, boxesFcl: ex.boxesFcl, fobNow: ex.fobNow, fobOld: ex.fobOld };
    });
    return m;
  });
  const set = (id, k, v) => setVals((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));
  const useMaster = (it) => setVals((p) => ({ ...p, [it.id]: { ...p[it.id], priceNew: it.unitValue, fobNow: +(it.unitFob100 / 100).toFixed(4) } }));

  const sorted = [...items].sort((a, b) => a.gd.localeCompare(b.gd));
  const shown = sorted.filter((it) => !q.trim() || (it.gd + it.code + it.description).toLowerCase().includes(q.trim().toLowerCase()));

  const entered = sorted.map((it) => {
    const v = vals[it.id];
    if (!v || !(Number(v.priceNew) > 0) || !(Number(v.boxesFcl) > 0)) return null;
    return { it, v, d: computeCosting({ box: it.packing, ...v }, costParams) };
  }).filter(Boolean);
  const avgProfit = entered.length ? entered.reduce((s, e) => s + e.d.profitPct, 0) / entered.length : 0;

  const save = () => {
    if (!entered.length) return;
    const keep = costing.filter((l) => !entered.some((e) => l.itemId === e.it.id || l.gd === e.it.gd));
    const lines = entered.map((e, n) => {
      const ex = costing.find((l) => l.itemId === e.it.id || l.gd === e.it.gd);
      return {
        id: ex?.id || "c" + Date.now() + "_" + n, itemId: e.it.id,
        gd: e.it.gd, code: e.it.code, dia: e.it.size, len: e.it.length, unit: 10, box: e.it.packing,
        priceOld: e.v.priceOld || "", priceNew: e.v.priceNew, boxesFcl: e.v.boxesFcl, fobNow: e.v.fobNow || "", fobOld: e.v.fobOld || "",
      };
    });
    setCosting([...keep, ...lines]);
    toast(`${lines.length} item${lines.length === 1 ? "" : "s"} saved to the cost working`);
    onClose();
  };

  const IN = (it, k, ph, label) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 600, letterSpacing: 0.2, whiteSpace: "nowrap" }}>{label}</span>
      <Input className={`input-sm num-in${vals[it.id]?.[k] !== undefined && vals[it.id]?.[k] !== "" ? " filled" : ""}`} style={{ width: 96 }}
        type="number" min="0" step="any" placeholder={ph} value={vals[it.id]?.[k] ?? ""} onChange={(e) => set(it.id, k, e.target.value)} />
    </label>
  );

  const PARAMS = [
    ["barcodeSheet", "Barcodes ₹/sheet"], ["transportFcl", "Transport ₹/FCL"], ["otherFcl", "Other ₹/FCL"],
    ["exRate", "Exchange ₹/$"], ["realRate", "Realisation ₹/$"],
  ];

  return (
    <Drawer title="Cost items" subtitle="Three steps. Type prices against any number of items — everything else is worked out for you." icon={Calculator} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {entered.length
            ? <>{entered.length} item{entered.length === 1 ? "" : "s"} ready · avg profit <b style={{ color: avgProfit >= 0 ? "var(--green-ink)" : "var(--amber-ink)" }}>{num(avgProfit, 1)}%</b></>
            : "Fill new price + boxes/FCL on any item to begin"}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!entered.length} onClick={save}>Save {entered.length || ""} item{entered.length === 1 ? "" : "s"} to cost working</Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <Step n="1" title="Container & charges" hint="Same for every line — the five figures from row 3 of the Cost Working sheet." />
          <div className="row wrap" style={{ gap: 12 }}>
            {PARAMS.map(([k, label]) => (
              <Field key={k} label={label}>
                <Input className="input-sm rate" style={{ width: 110 }} type="number" step="any" value={costParams[k]} onChange={(e) => setCostParams({ ...costParams, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </section>

        <section>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <Step n="2" title="Type the prices, item by item" hint="Leave an item untouched to skip it. “Master” copies today's price and FOB from Setup." />
            <div style={{ width: 240, marginBottom: 10 }}><SearchInput value={q} onChange={setQ} placeholder="Find an item…" /></div>
          </div>
          <Card>
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {shown.map((it, i) => {
                const v = vals[it.id];
                const on = v && Number(v.priceNew) > 0 && Number(v.boxesFcl) > 0;
                const d = on ? computeCosting({ box: it.packing, ...v }, costParams) : null;
                const wasCosted = costing.some((l) => l.itemId === it.id || l.gd === it.gd);
                return (
                  <div key={it.id} style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                    <div className="row" style={{ marginBottom: 8 }}>
                      <Mono>{it.gd}</Mono>
                      <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}>{it.description}</span>
                      {wasCosted && <Pill tone="teal">on the sheet</Pill>}
                      <span className="grow" />
                      <span style={{ fontSize: 11, color: "var(--faint)" }}>{it.packing} pcs / box</span>
                      <button className="btn btn-ghost btn-sm" style={{ height: 26 }} title={`Copy today's master price (₹${it.unitValue}/pc, $${(it.unitFob100 / 100).toFixed(4)} FOB)`} onClick={() => useMaster(it)}>
                        <Copy size={12} strokeWidth={2.4} /> Use master
                      </button>
                    </div>
                    <div className="row wrap" style={{ gap: 10, alignItems: "flex-end" }}>
                      {IN(it, "priceOld", "0.00", "Old ₹/pc")}
                      {IN(it, "priceNew", "0.00", "New ₹/pc *")}
                      {IN(it, "boxesFcl", "0", "Boxes/FCL *")}
                      {IN(it, "fobNow", "0.0000", "FOB $ now")}
                      {IN(it, "fobOld", "0.0000", "FOB $ old")}
                      <span className="grow" />
                      {on && (
                        <span style={{ fontSize: 11.5, fontWeight: 650, color: d.profitPc >= 0 ? "var(--green-ink)" : "var(--amber-ink)", whiteSpace: "nowrap", paddingBottom: 7 }}>
                          = ₹{num(d.perPc)}/pc · {Number(v.fobNow) > 0 ? `${num(d.profitPct, 1)}% ${d.profitPc >= 0 ? "profit" : "LOSS"}` : "add FOB for profit"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {!shown.length && <Empty icon={Search} title="No item matches">Try the GD code, the item code, or part of the description.</Empty>}
            </div>
          </Card>
        </section>

        <section>
          <Step n="3" title="Check the sheet" hint="Cost, FOB and profit update as you type." />
          {entered.length ? (
            <Card>
              <DataTable
                columns={[
                  { key: "gd", label: "GD code", render: (e) => <Mono>{e.it.gd}</Mono> },
                  { key: "box", label: "Box", align: "r", render: (e) => e.it.packing },
                  { key: "new", label: "New ₹/pc", align: "r", render: (e) => num(e.v.priceNew) },
                  { key: "tbox", label: "Total/box", align: "r", strong: true, render: (e) => inr(e.d.totalBox) },
                  { key: "ppc", label: "Cost ₹/pc", align: "r", strong: true, render: (e) => num(e.d.perPc) },
                  { key: "fob", label: "Cost $", align: "r", render: (e) => "$" + e.d.fobCost.toFixed(4) },
                  { key: "pr", label: "Profit ₹/pc", align: "r", render: (e) => <span style={{ fontWeight: 700, color: e.d.profitPc >= 0 ? "var(--green-ink)" : "var(--amber-ink)" }}>{num(e.d.profitPc)}</span> },
                  { key: "prp", label: "Profit %", align: "r", render: (e) => <span style={{ fontWeight: 650, color: e.d.profitPct >= 0 ? "var(--green-ink)" : "var(--amber-ink)" }}>{num(e.d.profitPct, 1)}%</span> },
                ]}
                rows={entered} rowKey={(e) => e.it.id}
                footer={[{ v: `${entered.length} item(s)`, span: 6 }, { v: num(entered.reduce((s, e) => s + e.d.profitPc, 0) / entered.length), align: "r" }, { v: num(avgProfit, 1) + "%", align: "r" }]}
              />
            </Card>
          ) : (
            <Card><Empty icon={Calculator} title="Nothing entered yet">Type a new price and boxes/FCL above and the line appears here, costed in full.</Empty></Card>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/* ---------- Single-line sheet — editing one row, or an item not in the master ---------- */
function CostingDrawer({ line, onClose }) {
  const { items, costing, setCosting, costParams, toast } = useApp();
  const editing = !!line;
  const [f, setF] = useState(line ? { ...line } : EMPTY_LINE);
  const [q, setQ] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Picking a master item prefills identity, packing and today's prices —
  // the sheet's manual columns stay editable after.
  const pick = (it) => setF((p) => ({
    ...p,
    itemId: it.id, gd: it.gd, code: it.code, dia: it.size, len: it.length,
    unit: p.unit || 10, box: it.packing,
    priceNew: p.priceNew || it.unitValue, fobNow: p.fobNow || +(it.unitFob100 / 100).toFixed(4),
  }));

  const shown = items.filter((it) => !q.trim() || (it.gd + it.code + it.description).toLowerCase().includes(q.trim().toLowerCase()));
  const d = computeCosting(f, costParams);
  const ready = f.gd && Number(f.box) > 0 && Number(f.priceNew) > 0 && Number(f.boxesFcl) > 0;

  const save = () => {
    if (!ready) return;
    if (editing) {
      setCosting(costing.map((l) => (l.id === f.id ? f : l)));
      toast(`Costing for ${f.gd} updated`);
    } else {
      setCosting([...costing, { ...f, id: "c" + Date.now() }]);
      toast(`${f.gd} added to the cost working`);
    }
    onClose();
  };

  const numIn = (k, ph) => (
    <Input className={`input-sm num-in${f[k] !== "" && f[k] != null ? " filled" : ""}`} type="number" min="0" step="any"
      placeholder={ph || "0"} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
  );

  return (
    <Drawer title={editing ? `Edit costing · ${line.gd}` : "Cost an item"} icon={Calculator} onClose={onClose}
      subtitle="Type the prices you know — every cost, FOB and profit figure works itself out below."
      footer={<>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {ready
            ? <>Cost <b style={{ color: "var(--ink)" }}>{inr(d.totalBox)}</b>/box · <b style={{ color: "var(--ink)" }}>₹{num(d.perPc)}</b>/pc · profit <b style={{ color: d.profitPc >= 0 ? "var(--green-ink)" : "var(--amber-ink)" }}>₹{num(d.profitPc)}/pc ({num(d.profitPct, 1)}%)</b></>
            : "Fill the starred fields to unlock the save button"}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!ready} onClick={save}>{editing ? "Save changes" : "Add to cost working"}</Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <Step n="1" title="Which item are we costing?" hint="Pick from the master to prefill codes, packing and today's prices — or type a new code by hand." />
            <div style={{ width: 220, marginBottom: 10 }}><SearchInput value={q} onChange={setQ} placeholder="Find an item…" /></div>
          </div>
          <Card>
            <div style={{ maxHeight: 180, overflowY: "auto" }}>
              {shown.map((it, i) => (
                <button key={it.id} className={`pick-row${f.itemId === it.id ? " on" : ""}`} style={{ borderTop: i ? "1px solid var(--border)" : "none" }} onClick={() => pick(it)}>
                  <Mono>{it.gd}</Mono>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{it.description}</span>
                  <span className="grow" />
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>{it.packing} pcs/box · ₹{it.unitValue}/pc</span>
                  {f.itemId === it.id && <Check size={14} style={{ color: "var(--teal)" }} />}
                </button>
              ))}
              {!shown.length && <Empty icon={Search} title="No item matches">You can still type the codes by hand below.</Empty>}
            </div>
          </Card>
          <div className="grid-3" style={{ marginTop: 12, gridTemplateColumns: "repeat(6, minmax(0,1fr))" }}>
            <Field label="GD code *"><Input className="input-sm" value={f.gd} onChange={(e) => set("gd", e.target.value)} /></Field>
            <Field label="Code"><Input className="input-sm" value={f.code} onChange={(e) => set("code", e.target.value)} /></Field>
            <Field label="Dia mm/in"><Input className="input-sm" value={f.dia} onChange={(e) => set("dia", e.target.value)} /></Field>
            <Field label="Len mm"><Input className="input-sm" value={f.len} onChange={(e) => set("len", e.target.value)} /></Field>
            <Field label="Pcs / unit">{numIn("unit")}</Field>
            <Field label="Pcs / box *">{numIn("box")}</Field>
          </div>
        </section>

        <section>
          <Step n="2" title="Purchase price & logistics" hint="Old price is only for the increase column — the costing itself runs on the new price." />
          <div className="grid-3">
            <Field label="Old price ₹/pc">{numIn("priceOld")}</Field>
            <Field label="New price ₹/pc *">{numIn("priceNew")}</Field>
            <Field label="Boxes per FCL *" hint="How many boxes of this item fill one container. Transport and clearing charges are spread across them.">{numIn("boxesFcl")}</Field>
          </div>
        </section>

        <section>
          <Step n="3" title="Selling price (FOB)" hint="What the buyer pays per piece, in US$ — today and on the last price list." />
          <div className="grid-3">
            <Field label="FOB now $/pc">{numIn("fobNow", "0.0000")}</Field>
            <Field label="FOB old $/pc">{numIn("fobOld", "0.0000")}</Field>
          </div>
          {ready && (
            <div style={{ marginTop: 12 }}>
              <Note tone={d.profitPc >= 0 ? "teal" : "amber"}>
                Cost lands at <b>₹{num(d.perPc)}/pc</b> ({usd(d.fobCost)} FOB at ₹{costParams.exRate}/$). Selling at {usd(Number(f.fobNow) || 0)} realises{" "}
                <b>₹{num(d.profitPc)}/pc — {num(d.profitPct, 1)}% {d.profitPc >= 0 ? "profit" : "LOSS"}</b> at ₹{costParams.realRate}/$.
              </Note>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/* ---------- Excel export: the Cost Working workbook, regenerated live ---------- */
function downloadCostingXLS(costing, p) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const r2 = (n, d = 2) => Number(n || 0).toFixed(d);
  const params = `<table>
    <tr><td class="h">Barcodes ₹ / sheet</td><td class="r">${p.barcodeSheet}</td>
        <td class="h">Transport ₹ / FCL</td><td class="r">${p.transportFcl}</td>
        <td class="h">Other charges ₹ / FCL</td><td class="r">${p.otherFcl}</td>
        <td class="h">Exchange ₹/$</td><td class="r">${p.exRate}</td>
        <td class="h">Realisation ₹/$</td><td class="r">${p.realRate}</td></tr></table>`;
  const head = `
    <tr>
      <th colspan="4">ITEM</th><th colspan="2">PACKING</th><th colspan="5">PURCHASE PRICE</th>
      <th colspan="2">BARCODES</th><th colspan="3">TRANSPORT &amp; FCL</th><th colspan="2">TOTAL COST</th>
      <th colspan="5">FOB MUMBAI</th><th colspan="2">PROFIT</th>
    </tr>
    <tr>
      <th>GD CODE</th><th>CODE</th><th>DIA</th><th>LEN MM</th><th>UNIT</th><th>BOX</th>
      <th>OLD ₹/PC</th><th>NEW ₹/PC</th><th>DIFF ₹</th><th>%</th><th>PER BOX ₹</th>
      <th>SHEETS/BOX</th><th>COST/BOX ₹</th>
      <th>PER BOX ₹</th><th>BOXES/FCL</th><th>OTHER/BOX ₹</th>
      <th>PER BOX ₹</th><th>PER PC ₹</th>
      <th>COST US$</th><th>US$ NOW</th><th>US$ OLD</th><th>DIFFCE</th><th>%</th>
      <th>₹ / PC</th><th>%</th>
    </tr>`;
  const body = costing.map((l) => {
    const d = computeCosting(l, p);
    return `<tr>
      <td>${esc(l.gd)}</td><td>${esc(l.code)}</td><td>${esc(l.dia)}</td><td>${esc(l.len)}</td>
      <td class="r">${esc(l.unit)}</td><td class="r">${esc(l.box)}</td>
      <td class="r">${r2(l.priceOld)}</td><td class="r">${r2(l.priceNew)}</td><td class="r">${r2(d.diff)}</td><td class="r">${r2(d.diffPct, 1)}%</td><td class="r">${r2(d.perBox)}</td>
      <td class="r">${d.sheets}</td><td class="r">${r2(d.barcodeBox)}</td>
      <td class="r">${d.transportBox}</td><td class="r">${esc(l.boxesFcl)}</td><td class="r">${d.otherBox}</td>
      <td class="r">${r2(d.totalBox)}</td><td class="r">${r2(d.perPc)}</td>
      <td class="r">${r2(d.fobCost, 4)}</td><td class="r">${r2(l.fobNow, 4)}</td><td class="r">${r2(l.fobOld, 4)}</td><td class="r">${r2(d.fobDiff, 4)}</td><td class="r">${r2(d.fobPct, 1)}%</td>
      <td class="r">${r2(d.profitPc)}</td><td class="r">${r2(d.profitPct, 1)}%</td>
    </tr>`;
  }).join("");
  const list = costing.map((l) => computeCosting(l, p));
  const avg = (k) => (list.length ? list.reduce((s, x) => s + x[k], 0) / list.length : 0);
  const foot = `<tr class="sec"><td colspan="9">AVERAGE · ${costing.length} item(s)</td><td class="r">${r2(avg("diffPct"), 1)}%</td>
    <td colspan="13"></td><td class="r">${r2(avg("profitPc"))}</td><td class="r">${r2(avg("profitPct"), 1)}%</td></tr>`;
  writeXLS(`Cost_Working_${TODAY}.xls`,
    `<div class="title">COST WORKING</div><div class="sub">As on ${dmy(TODAY)} · generated by the export system</div>${params}<br><table>${head}${body}${foot}</table>`);
}

/* ============================================================ */
export default function Costing() {
  const { costing, setCosting, costParams, setCostParams, toast } = useApp();
  const [drawer, setDrawer] = useState(false);
  const [custom, setCustom] = useState(false);
  const [editLine, setEditLine] = useState(null);

  const rows = costing.map((l) => ({ l, d: computeCosting(l, costParams) }));
  const avgProfit = rows.length ? rows.reduce((s, r) => s + r.d.profitPct, 0) / rows.length : 0;
  const avgRise = rows.length ? rows.reduce((s, r) => s + r.d.diffPct, 0) / rows.length : 0;
  const losing = rows.filter((r) => r.d.profitPc < 0).length;

  const setP = (k, v) => setCostParams({ ...costParams, [k]: v });
  const pct = (v) => <span style={{ fontWeight: 650, color: v >= 0 ? "var(--green-ink)" : "var(--amber-ink)" }}>{num(v, 1)}%</span>;

  const cols = [
    { key: "gd", label: "GD code", w: 104, render: (r) => <Mono>{r.l.gd}</Mono> },
    { key: "code", label: "Code", w: 92, render: (r) => <Mono>{r.l.code}</Mono> },
    { key: "dia", label: "Dia", align: "r", render: (r) => r.l.dia },
    { key: "len", label: "Len mm", align: "r", render: (r) => r.l.len },
    { key: "unit", label: "Unit", align: "r", render: (r) => r.l.unit },
    { key: "box", label: "Box", align: "r", render: (r) => r.l.box },
    { key: "old", label: "Old ₹/pc", align: "r", render: (r) => num(r.l.priceOld) },
    { key: "new", label: "New ₹/pc", align: "r", strong: true, render: (r) => num(r.l.priceNew) },
    { key: "diff", label: "Diff ₹", align: "r", render: (r) => num(r.d.diff) },
    { key: "diffp", label: "Rise %", align: "r", render: (r) => num(r.d.diffPct, 1) + "%" },
    { key: "pbox", label: "Purchase/box", align: "r", render: (r) => inr(r.d.perBox) },
    { key: "sheets", label: "Sheets", align: "r", render: (r) => r.d.sheets },
    { key: "bc", label: "Barcodes/box", align: "r", render: (r) => inr(r.d.barcodeBox) },
    { key: "tr", label: "Transport/box", align: "r", render: (r) => inr(r.d.transportBox) },
    { key: "bfcl", label: "Boxes/FCL", align: "r", render: (r) => r.l.boxesFcl },
    { key: "oth", label: "Other/box", align: "r", render: (r) => inr(r.d.otherBox) },
    { key: "tbox", label: "Total/box", align: "r", strong: true, render: (r) => inr(r.d.totalBox) },
    { key: "ppc", label: "Cost ₹/pc", align: "r", strong: true, render: (r) => num(r.d.perPc) },
    { key: "fcost", label: "Cost $", align: "r", render: (r) => "$" + r.d.fobCost.toFixed(4) },
    { key: "fnow", label: "Sell $ now", align: "r", strong: true, render: (r) => "$" + Number(r.l.fobNow || 0).toFixed(4) },
    { key: "fold", label: "Sell $ old", align: "r", render: (r) => "$" + Number(r.l.fobOld || 0).toFixed(4) },
    { key: "fdiff", label: "FOB rise", align: "r", render: (r) => pct(r.d.fobPct) },
    { key: "profit", label: "Profit ₹/pc", align: "r", render: (r) => <span style={{ fontWeight: 700, color: r.d.profitPc >= 0 ? "var(--green-ink)" : "var(--amber-ink)" }}>{num(r.d.profitPc)}</span> },
    { key: "profitp", label: "Profit %", align: "r", render: (r) => pct(r.d.profitPct) },
    {
      key: "_act", label: "", w: 66, render: (r) => (
        <span className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
          <EditBtn onClick={() => setEditLine(r.l)} />
          <button className="icon-btn bare" title="Remove line" onClick={(e) => { e.stopPropagation(); setCosting(costing.filter((x) => x.id !== r.l.id)); toast(`${r.l.gd} removed from cost working`); }}><Trash2 size={14} /></button>
        </span>
      ),
    },
  ];

  const PARAMS = [
    ["barcodeSheet", "Barcodes ₹/sheet", "One sheet prints 125 stickers — cost per sheet."],
    ["transportFcl", "Transport ₹/FCL", "Inland transport for one container, spread across its boxes."],
    ["otherFcl", "Other charges ₹/FCL", "Clearing, handling and sundry charges per container."],
    ["exRate", "Exchange ₹/$", "Converts our per-piece cost into a US$ FOB cost."],
    ["realRate", "Realisation ₹/$", "The rate we actually realise on the FOB selling price — drives the profit column."],
  ];

  return (
    <div className="stack">
      <div className="grid-4">
        <Stat icon={Layers} value={rows.length} label="Items costed" sub="Every figure recomputed live" />
        <Stat icon={TrendingUp} tone="amber" value={num(avgRise, 1) + "%"} label="Avg purchase rise" sub="New price vs old" />
        <Stat icon={Percent} tone={avgProfit >= 0 ? "green" : "amber"} value={num(avgProfit, 1) + "%"} label="Avg profit" sub={`At ₹${costParams.realRate}/$ realisation`} />
        <Stat icon={TrendingDown} tone={losing ? "amber" : "green"} value={losing} label="Items losing money" sub={losing ? "Review price or costs" : "All items in profit"} />
      </div>

      <Card pad>
        <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
          {PARAMS.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              <Input className="input-sm rate" style={{ width: 118 }} type="number" step="any" value={costParams[k]} onChange={(e) => setP(k, e.target.value)} />
            </Field>
          ))}
          <span className="grow" />
          <div className="row" style={{ gap: 8 }}>
            <Btn variant="teal" icon={Download} disabled={!rows.length} onClick={() => { downloadCostingXLS(costing, costParams); toast("Cost working downloaded as Excel"); }}>Download Excel</Btn>
            <Btn variant="ghost" icon={Plus} onClick={() => setCustom(true)}>Custom item</Btn>
            <Btn icon={Plus} onClick={() => setDrawer(true)}>Cost items</Btn>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Note tone="teal">These five charges are set <b>once</b> — the same as row 3 of the Cost Working sheet. Change any of them and every line below recalculates instantly.</Note>
        </div>
      </Card>

      <Card>
        <CardHead icon={Calculator} title={`Cost working · ${rows.length} item${rows.length === 1 ? "" : "s"}`}>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>GD &amp; code stay frozen while you scroll</span>
        </CardHead>
        {rows.length ? (
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.l.id} freeze={2} maxHeight={480}
            footer={[
              { v: `Average · ${rows.length} item(s)`, span: 9 },
              { v: num(avgRise, 1) + "%", align: "r" }, { v: "", span: 12 },
              { v: num(rows.length ? rows.reduce((s, r) => s + r.d.profitPc, 0) / rows.length : 0), align: "r" },
              { v: num(avgProfit, 1) + "%", align: "r" }, { v: "" },
            ]} />
        ) : (
          <Empty icon={Calculator} title="No items costed yet" action={<Btn icon={Plus} onClick={() => setDrawer(true)}>Cost items</Btn>}>
            Open the sheet, type prices against any number of items, and the full landed cost and profit appear instantly.
          </Empty>
        )}
        <div className="card-foot">
          <Note tone="amber">A red profit figure means the item <b>loses money</b> at the current FOB price — exactly what this sheet exists to catch before production starts.</Note>
        </div>
      </Card>

      <FormulaPanel title="How is every column calculated?" rows={COSTING_FORMULAS}
        intro="A faithful port of the Cost Working sheet — same formulas, same rounding (barcode sheets and transport round up, other charges round to the nearest rupee)." />

      {drawer && <BulkCostingDrawer onClose={() => setDrawer(false)} />}
      {custom && <CostingDrawer onClose={() => setCustom(false)} />}
      {editLine && <CostingDrawer line={editLine} onClose={() => setEditLine(null)} />}
    </div>
  );
}
