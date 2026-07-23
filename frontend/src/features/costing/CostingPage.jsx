import { useState } from "react";
import { Calculator, Plus, Check, Trash2, Sliders, TrendingUp, TrendingDown, Percent, Boxes, BookOpen } from "lucide-react";
import {
  Card, CardHead, Btn, Field, Input, Pill, Mono, Note, Stat, DataTable, Empty, EditBtn,
  Spinner, ErrorState,
} from "../../components/ui/index.jsx";
import RecordModal from "../setup/RecordModal.jsx";
import { useCosting, useCostParams, useCostFormulas, useCostingMutations, useItems } from "../../api/hooks.js";
import { inr, usdp, num } from "../../lib/format.js";

/* ============================================================
   Costing — the Cost Working sheet, live.

   The five container-wide charges sit at the top (row 3 of the client's
   Excel) and apply to every line. A row stores only what is typed; the
   worked-out figures arrive from the API alongside it, so the sheet and any
   report quoting it can never disagree.
   ============================================================ */

const PARAM_FIELDS = [
  ["barcode_sheet", "Barcodes ₹/sheet"],
  ["transport_fcl", "Transport ₹/FCL"],
  ["other_fcl", "Other ₹/FCL"],
  ["ex_rate", "Exchange ₹/$"],
  ["real_rate", "Realisation ₹/$"],
];

const BLANK = {
  gd: "", code: "", dia: "", length: "", unit: 10, box: 0,
  price_old: 0, price_new: 0, boxes_fcl: 0, fob_now: 0, fob_old: 0, item_id: null,
};

const signed = (v, d = 2) => `${v >= 0 ? "+" : "−"}${num(Math.abs(v), d)}`;
const toneOf = (v) => (v >= 0 ? "green" : "amber");

export default function CostingPage() {
  const lines = useCosting();
  const params = useCostParams();
  const formulas = useCostFormulas();
  const items = useItems().data || [];
  const { create, update, remove, saveParams } = useCostingMutations();

  const [draftParams, setDraftParams] = useState(null); // null = showing saved values
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [showFormulas, setShowFormulas] = useState(false);

  if (lines.isLoading || params.isLoading) return <Spinner label="Loading the cost working…" />;
  if (lines.isError) return <ErrorState error={lines.error} onRetry={lines.refetch} />;
  if (params.isError) return <ErrorState error={params.error} onRetry={params.refetch} />;

  const rows = lines.data || [];
  const saved = params.data;
  const shown = draftParams || saved;
  const dirty = !!draftParams && PARAM_FIELDS.some(([k]) => Number(draftParams[k]) !== Number(saved[k]));

  // Items already costed are excluded so the picker only offers new work.
  const costedItems = new Set(rows.map((r) => r.item_id).filter(Boolean));
  const itemOpts = items
    .filter((it) => !costedItems.has(it.id))
    .map((it) => ({ value: it.id, label: `${it.gd || it.code} — ${it.description || "untitled"}` }));

  const schema = [
    { key: "item_id", label: "Copy from item (optional)", type: "select", options: itemOpts },
    { key: "gd", label: "GD code" }, { key: "code", label: "Item code" },
    { key: "dia", label: "Dia" }, { key: "length", label: "Length (mm)" },
    { key: "unit", label: "Pcs per unit pack", type: "number" },
    { key: "box", label: "Pcs per box *", type: "number" },
    { key: "price_old", label: "Old purchase ₹/pc", type: "number" },
    { key: "price_new", label: "New purchase ₹/pc *", type: "number" },
    { key: "boxes_fcl", label: "Boxes per FCL *", type: "number" },
    { key: "fob_old", label: "Old FOB $/pc", type: "number" },
    { key: "fob_now", label: "FOB now $/pc", type: "number" },
  ];

  /* Picking an item in the modal fills the descriptive columns from the
     master, so only the prices have to be typed. */
  const prefill = (body) => {
    const it = items.find((x) => x.id === body.item_id);
    if (!it) return body;
    return {
      ...body,
      gd: body.gd || it.gd || "",
      code: body.code || it.code || "",
      dia: body.dia || it.size || "",
      length: body.length || it.length || "",
      box: Number(body.box) || it.packing || 0,
      price_new: Number(body.price_new) || it.unit_value || 0,
      fob_now: Number(body.fob_now) || Number(((it.unit_fob100 || 0) / 100).toFixed(4)),
    };
  };

  const avgProfit = rows.length ? rows.reduce((s, r) => s + (r.computed?.profitPct || 0), 0) / rows.length : 0;
  const totalCost = rows.reduce((s, r) => s + (r.computed?.perPc || 0), 0);
  const losing = rows.filter((r) => (r.computed?.profitPc || 0) < 0).length;

  const columns = [
    { key: "gd", label: "GD", render: (r) => <Mono>{r.gd || "—"}</Mono> },
    { key: "code", label: "Code", render: (r) => <Mono>{r.code || "—"}</Mono> },
    { key: "box", label: "Pcs/box", align: "r" },
    { key: "price_old", label: "Old ₹", align: "r", render: (r) => num(r.price_old) },
    { key: "price_new", label: "New ₹", align: "r", strong: true, render: (r) => num(r.price_new) },
    { key: "diff", label: "Diff %", align: "r", render: (r) => <Pill tone={toneOf(-r.computed.diffPct)}>{signed(r.computed.diffPct, 1)}%</Pill> },
    { key: "perBox", label: "Purchase/box ₹", align: "r", render: (r) => inr(r.computed.perBox) },
    { key: "barcodeBox", label: "Barcode ₹", align: "r", render: (r) => inr(r.computed.barcodeBox) },
    { key: "transportBox", label: "Transport ₹", align: "r", render: (r) => inr(r.computed.transportBox) },
    { key: "otherBox", label: "Other ₹", align: "r", render: (r) => inr(r.computed.otherBox) },
    { key: "totalBox", label: "Total/box ₹", align: "r", strong: true, render: (r) => inr(r.computed.totalBox) },
    { key: "perPc", label: "Cost/pc ₹", align: "r", render: (r) => num(r.computed.perPc, 3) },
    { key: "fobCost", label: "Cost FOB $", align: "r", render: (r) => usdp(r.computed.fobCost) },
    { key: "fob_now", label: "Sell FOB $", align: "r", strong: true, render: (r) => usdp(r.fob_now) },
    {
      key: "profit", label: "Profit/pc ₹", align: "r",
      render: (r) => (
        <span style={{ color: r.computed.profitPc >= 0 ? "var(--green-ink)" : "var(--amber-ink)", fontWeight: 650 }}>
          {signed(r.computed.profitPc, 2)}
        </span>
      ),
    },
    {
      key: "profitPct", label: "Profit %", align: "r",
      render: (r) => <Pill tone={toneOf(r.computed.profitPct)}>{signed(r.computed.profitPct, 1)}%</Pill>,
    },
    {
      key: "_act", label: "", align: "r", render: (r) => (
        <span className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <EditBtn onClick={() => setEditing(r)} />
          {confirmId === r.id ? (
            <span className="row" style={{ gap: 6 }}>
              <Btn variant="danger" size="sm" icon={Trash2} onClick={() => remove.mutate(r.id, { onSettled: () => setConfirmId(null) })}>Confirm</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setConfirmId(null)}>No</Btn>
            </span>
          ) : (
            <button className="icon-btn bare" title="Delete" onClick={() => setConfirmId(r.id)}><Trash2 size={14} /></button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Costing</h2>
        <p className="sub">
          What each piece really costs us once barcodes, inland transport and clearing are spread over a
          container — and what we make on it at today's FOB. Type only the prices; every other column is worked out.
        </p>
      </div>

      <Card pad>
        <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div>
            <div className="card-title"><Sliders size={15} style={{ color: "var(--teal)" }} />Container &amp; charges</div>
            <p className="sub" style={{ marginTop: 4 }}>Shared by every line — change one and the whole sheet re-costs.</p>
          </div>
          {dirty && (
            <div className="row" style={{ gap: 8 }}>
              <Btn variant="ghost" size="sm" onClick={() => setDraftParams(null)}>Discard</Btn>
              <Btn size="sm" icon={Check} disabled={saveParams.isPending}
                onClick={() => saveParams.mutate(
                  Object.fromEntries(PARAM_FIELDS.map(([k]) => [k, Number(shown[k]) || 0])),
                  { onSuccess: () => setDraftParams(null) }
                )}>
                {saveParams.isPending ? "Saving…" : "Save charges"}
              </Btn>
            </div>
          )}
        </div>

        <div className="row wrap" style={{ gap: 12, marginTop: 14 }}>
          {PARAM_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <Input className="input-sm" style={{ width: 120 }} type="number" step="any"
                value={shown[k] ?? ""}
                onChange={(e) => setDraftParams({ ...shown, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
      </Card>

      {rows.length > 0 && (
        <div className="grid-4">
          <Stat icon={Boxes} value={rows.length} label="Items costed" />
          <Stat icon={Percent} value={`${num(avgProfit, 1)}%`} label="Average profit" tone={avgProfit >= 0 ? "green" : "amber"} />
          <Stat icon={avgProfit >= 0 ? TrendingUp : TrendingDown} value={inr(totalCost)} label="Cost per piece, all lines" />
          <Stat icon={TrendingDown} value={losing} label="Lines below cost" sub={losing ? "Raise the FOB or renegotiate" : "Every line is in profit"} tone={losing ? "amber" : "green"} />
        </div>
      )}

      <Card>
        <CardHead icon={Calculator} title={`Cost working · ${rows.length} line${rows.length === 1 ? "" : "s"}`}>
          <Btn variant="ghost" size="sm" icon={BookOpen} onClick={() => setShowFormulas((s) => !s)}>
            {showFormulas ? "Hide formulas" : "How it's worked out"}
          </Btn>
          <Btn size="sm" icon={Plus} onClick={() => setAdding(true)}>Cost an item</Btn>
        </CardHead>

        {showFormulas && (
          <div className="card-foot">
            <Note tone="teal">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "6px 18px" }}>
                {(formulas.data || []).map((f) => (
                  <div key={f.label} style={{ fontSize: 12 }}>
                    <b>{f.label}</b> — <span style={{ color: "var(--muted)" }}>{f.rule}</span>
                  </div>
                ))}
              </div>
            </Note>
          </div>
        )}

        {rows.length ? (
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} maxHeight={560} />
        ) : (
          <Empty icon={Calculator} title="Nothing costed yet"
            action={<Btn size="sm" icon={Plus} onClick={() => setAdding(true)}>Cost an item</Btn>}>
            Add a line — pick an item from your master to copy its codes and packing, then type the
            purchase price, boxes per container and the FOB you sell at.
          </Empty>
        )}
      </Card>

      {adding && (
        <RecordModal title="Cost an item" schema={schema} value={BLANK} cols={3} saving={create.isPending}
          onClose={() => setAdding(false)}
          onSave={(body) => create.mutate(prefill(body), { onSuccess: () => setAdding(false) })} />
      )}
      {editing && (
        <RecordModal title={`Edit · ${editing.gd || editing.code || "line"}`} schema={schema} value={editing} cols={3} saving={update.isPending}
          onClose={() => setEditing(null)}
          onSave={(body) => update.mutate({ id: editing.id, body: prefill(body) }, { onSuccess: () => setEditing(null) })} />
      )}
    </div>
  );
}
