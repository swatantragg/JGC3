import { useMemo, useState } from "react";
import {
  Calculator, Check, Sliders, TrendingUp, TrendingDown, Percent, Boxes, BookOpen, Search,
} from "lucide-react";
import {
  Card, CardHead, Btn, Field, Input, Select, Pill, Mono, Note, Stat, DataTable, Empty,
  Spinner, ErrorState, SearchInput, Step, Info, DownloadPair,
} from "../../components/ui/index.jsx";
import {
  useCosting, useCostParams, useCostFormulas, useCostingMutations, useGroupedItems,
  useSuppliers, useCostPreview, useSaveCosting,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { inr, usdp, num, todayISO } from "../../lib/format.js";
import { useDebounced } from "../../lib/useDebounced.js";
import { downloadGridExcel, downloadGridPDF } from "../../lib/download.js";

/* ============================================================
   Costing — the Cost Working sheet, laid out like a new buyer order.

     1  Container & charges     shared by every line
     2  What is the new price?  an item list with the price you last agreed
                                printed above each input
     3  Check the working       landed cost per piece and the final sell
                                price that comes out of it

   The arithmetic is never done in the browser. Every keystroke is costed by
   the API with the same `calc.compute_costing` the saved sheet uses, so the
   live working, the stored row and the download cannot quote three different
   numbers.
   ============================================================ */

const PARAM_FIELDS = [
  ["barcode_sheet", "Barcodes ₹/sheet"],
  ["carton_price", "Carton price ₹/box"],
  ["transport_fcl", "Transport ₹/FCL"],
  ["other_fcl", "Other ₹/FCL"],
  ["ex_rate", "Exchange ₹/$"],
  ["real_rate", "Realisation ₹/$"],
];

const signed = (v, d = 2) => `${v >= 0 ? "+" : "−"}${num(Math.abs(v), d)}`;
const toneOf = (v) => (v >= 0 ? "green" : "amber");

export default function CostingPanel() {
  const saved = useCosting();
  const params = useCostParams();
  const formulas = useCostFormulas();
  const suppliers = useSuppliers().data || [];
  const { saveParams } = useCostingMutations();
  const savePrices = useSaveCosting();
  const toast = useToast();

  const [draftParams, setDraftParams] = useState(null); // null = showing saved values
  const [prices, setPrices] = useState({});             // item id → typed ₹/pc
  const [sup, setSup] = useState("");
  const [q, setQ] = useState("");
  const [showFormulas, setShowFormulas] = useState(false);

  const groups = useGroupedItems({ q: useDebounced(q), supplier_id: sup }).data || [];
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const supName = (id) => suppliers.find((s) => s.id === id)?.name || "—";

  /* What each item was last costed at — printed above its input, so the new
     price is always typed against the old one rather than into a vacuum. */
  const lastPrice = useMemo(() => {
    const m = {};
    (saved.data || []).forEach((r) => { if (r.item_id) m[r.item_id] = r; });
    return m;
  }, [saved.data]);

  const typed = useMemo(
    () => Object.entries(prices)
      .map(([item_id, v]) => ({ item_id, price_new: Number(v) || 0 }))
      .filter((r) => r.price_new > 0),
    [prices],
  );
  const preview = useCostPreview(useDebounced(typed, 350));
  const rows = preview.data?.rows || [];

  if (params.isLoading || saved.isLoading) return <Spinner label="Loading the cost working…" />;
  if (params.isError) return <ErrorState error={params.error} onRetry={params.refetch} />;
  if (saved.isError) return <ErrorState error={saved.error} onRetry={saved.refetch} />;

  const shown = draftParams || params.data;
  const dirty = !!draftParams && PARAM_FIELDS.some(([k]) => Number(draftParams[k]) !== Number(params.data[k]));

  const avgProfit = rows.length ? rows.reduce((s, r) => s + (r.computed?.profitPct || 0), 0) / rows.length : 0;
  const losing = rows.filter((r) => (r.computed?.profitPc || 0) < 0).length;
  const sellTotal = rows.reduce((s, r) => s + (r.computed?.fobCost || 0), 0);

  const columns = [
    { key: "gd", w: 96, label: "GD", render: (r) => <Mono>{r.gd || "—"}</Mono> },
    { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code || "—"}</Mono> },
    { key: "sup", w: 84, label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
    { key: "box", w: 82, label: "Pcs/box", align: "r", render: (r) => r.box },
    { key: "old", w: 90, label: "Old ₹", align: "r", render: (r) => num(r.price_old) },
    { key: "new", w: 92, label: "New ₹", align: "r", strong: true, render: (r) => num(r.price_new) },
    { key: "diff", w: 90, label: "Diff %", align: "r", render: (r) => <Pill tone={toneOf(-r.computed.diffPct)}>{signed(r.computed.diffPct, 1)}%</Pill> },
    { key: "perBox", label: "Purchase/box ₹", align: "r", render: (r) => inr(r.computed.perBox) },
    { key: "barcodeBox", label: "Barcode ₹", align: "r", render: (r) => inr(r.computed.barcodeBox) },
    { key: "cartonBox", label: "Carton ₹", align: "r", render: (r) => inr(r.computed.cartonBox) },
    { key: "transportBox", label: "Transport ₹", align: "r", render: (r) => inr(r.computed.transportBox) },
    { key: "otherBox", label: "Other ₹", align: "r", render: (r) => inr(r.computed.otherBox) },
    { key: "totalBox", label: "Total/box ₹", align: "r", strong: true, render: (r) => inr(r.computed.totalBox) },
    { key: "perPc", label: "Cost/pc ₹", align: "r", render: (r) => num(r.computed.perPc, 3) },
    {
      key: "sell", label: "Final sell price $", align: "r", strong: true,
      render: (r) => <span style={{ color: "var(--teal-ink)", fontWeight: 700 }}>{usdp(r.computed.fobCost)}</span>,
    },
    {
      key: "profit", label: "Profit/pc ₹", align: "r",
      render: (r) => (
        <span style={{ color: r.computed.profitPc >= 0 ? "var(--green-ink)" : "var(--amber-ink)", fontWeight: 650 }}>
          {signed(r.computed.profitPc, 2)}
        </span>
      ),
    },
    { key: "profitPct", label: "Profit %", align: "r", render: (r) => <Pill tone={toneOf(r.computed.profitPct)}>{signed(r.computed.profitPct, 1)}%</Pill> },
  ];

  /* The download, with the whole chain live: change the new price in the
     sheet and the landed cost and the sell price follow it down the row. */
  const ex = Number(shown.ex_rate) || 0;
  const real = Number(shown.real_rate) || 0;
  const barcode = Number(shown.barcode_sheet) || 0;
  const carton = Number(shown.carton_price) || 0;
  const exportCols = [
    { h: "GD", key: "gd", f: (r) => r.gd },
    { h: "Code", key: "code", f: (r) => r.code },
    { h: "Description", key: "description", f: (r) => r.description, w: 32 },
    { h: "Supplier", key: "supplier", f: (r) => supCode(r.supplier_id) },
    { h: "Dia", key: "dia", f: (r) => r.dia },
    { h: "Length", key: "length", f: (r) => r.length },
    { h: "Pcs / box", key: "box", t: "int", v: (r) => r.box },
    { h: "Boxes / FCL", key: "bfcl", t: "int", v: (r) => r.boxes_fcl },
    { h: "Old price ₹/pc", key: "old", t: "inr", v: (r) => r.price_old },
    { h: "New price ₹/pc", key: "new", t: "inr", v: (r) => r.price_new },
    { h: "Difference ₹", key: "diff", t: "inr", fml: "{new}-{old}" },
    { h: "Difference %", key: "diffpct", t: "num1", fml: "IF({old}=0,0,{diff}*100/{old})" },
    { h: "Purchase / box ₹", key: "perbox", t: "inr", fml: "{new}*{box}", sum: true },
    { h: "Barcode sheets", key: "sheets", t: "int", fml: "ROUNDUP({box}/125,0)" },
    { h: "Barcode / box ₹", key: "barcode", t: "inr", fml: `{sheets}*${barcode}`, sum: true },
    { h: "Carton / box ₹", key: "carton", t: "inr", fml: `${carton}`, sum: true },
    { h: "Transport / box ₹", key: "transport", t: "inr", fml: `IF({bfcl}=0,0,ROUNDUP(${Number(shown.transport_fcl) || 0}/{bfcl},0))`, sum: true },
    { h: "Other / box ₹", key: "other", t: "inr", fml: `IF({bfcl}=0,0,ROUND(${Number(shown.other_fcl) || 0}/{bfcl},0))`, sum: true },
    { h: "Total cost / box ₹", key: "totalbox", t: "inr", fml: "{perbox}+{barcode}+{carton}+{transport}+{other}", sum: true },
    { h: "Cost / pc ₹", key: "perpc", t: "num3", fml: "IF({box}=0,0,{totalbox}/{box})" },
    { h: "Final sell price $", key: "sell", t: "usd4", fml: ex ? `{perpc}/${ex}` : "0" },
    { h: "Sell now $/pc", key: "fobnow", t: "usd4", v: (r) => r.fob_now },
    { h: "Profit / pc ₹", key: "profit", t: "inr", fml: `{fobnow}*${real}-{perpc}` },
    { h: "Profit %", key: "profitpct", t: "num1", fml: "IF({perpc}=0,0,{profit}*100/{perpc})" },
  ];
  const exportOpts = {
    title: "Cost working",
    subtitle: `${sup ? supCode(sup) : "All suppliers"} · exchange ₹${ex}/$ · realisation ₹${real}/$ · as on ${todayISO()}`,
  };

  const persist = () => savePrices.mutate(typed, {
    onSuccess: (res) => toast(`${res.saved} item${res.saved === 1 ? "" : "s"} saved to the cost sheet`),
  });

  return (
    <div className="stack">
      {/* ---------- 1 · Container & charges ---------- */}
      <section>
        <Step n="1" title="Container &amp; charges" hint="Shared by every line — change one and the whole sheet re-costs." />
        <Card pad>
          <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
            <div className="card-title"><Sliders size={15} style={{ color: "var(--teal)" }} />Per container, per box</div>
            {dirty && (
              <div className="row" style={{ gap: 8 }}>
                <Btn variant="ghost" size="sm" onClick={() => setDraftParams(null)}>Discard</Btn>
                <Btn size="sm" icon={Check} disabled={saveParams.isPending}
                  onClick={() => saveParams.mutate(
                    Object.fromEntries(PARAM_FIELDS.map(([k]) => [k, Number(shown[k]) || 0])),
                    { onSuccess: () => { setDraftParams(null); toast("Charges saved"); } },
                  )}>
                  {saveParams.isPending ? "Saving…" : "Save charges"}
                </Btn>
              </div>
            )}
          </div>
          <div className="row wrap" style={{ gap: 12, marginTop: 14 }}>
            {PARAM_FIELDS.map(([k, label]) => (
              <Field key={k} label={label}>
                <Input className="input-sm" style={{ width: 130 }} type="number" step="any"
                  value={shown[k] ?? ""} onChange={(e) => setDraftParams({ ...shown, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
          </div>
        </Card>
      </section>

      {/* ---------- 2 · The new price ---------- */}
      <section>
        <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
          <Step n="2" title="What is the new price?" hint="Type the new purchase price per piece. The price you last agreed is printed above the box." />
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <Select className="input-sm" style={{ width: 220 }} value={sup} onChange={(e) => setSup(e.target.value)}>
              <option value="">All suppliers</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </Select>
            <div style={{ width: 230 }}><SearchInput value={q} onChange={setQ} placeholder="Find an item…" /></div>
          </div>
        </div>
        <Card>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {groups.map((g, i) => (
              <div key={g.key} style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <Mono>{g.gd}</Mono>
                  <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", whiteSpace: "pre-line" }}>{g.description}</span>
                  <span className="grow" />
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>
                    {g.mixed_packing ? "packing varies by supplier" : `${g.packing} / box`}
                  </span>
                </div>
                <div className="stack-sm">
                  {g.variants.map((v, si) => {
                    const prev = lastPrice[v.item_id];
                    const old = prev ? Number(prev.price_new) || 0 : Number(v.unit_value) || 0;
                    return (
                      <div key={v.item_id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                        <span className="row" style={{ minWidth: 0, gap: 8 }}>
                          <Pill tone={si ? "" : "teal"}>{supCode(v.supplier_id)}</Pill>
                          <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {supName(v.supplier_id)}{g.mixed_packing ? ` · ${v.packing}/box` : ""}
                          </span>
                        </span>
                        <span style={{ textAlign: "right" }}>
                          {/* The old price sits directly above the box it is
                              being replaced in — that is the comparison the
                              client makes on every line. */}
                          <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 2 }}>
                            old <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>{old ? inr(old) : "—"}</span>
                            {prev ? "" : " (master)"}
                          </div>
                          <Input className={`input-sm num-in${prices[v.item_id] ? " filled" : ""}`} style={{ width: 128 }}
                            type="number" min="0" step="0.01" placeholder="new ₹/pc"
                            value={prices[v.item_id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [v.item_id]: e.target.value }))} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!groups.length && <Empty icon={Search} title="No item matches">Try the GD code, the item code, the supplier, or part of the description.</Empty>}
          </div>
        </Card>
      </section>

      {/* ---------- 3 · The working ---------- */}
      <section>
        <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
          <Step n="3" title="Check the working"
            hint="Landed cost per box, per piece, and the sell price that comes out of the exchange rate above." />
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <Btn variant="ghost" size="sm" icon={BookOpen} onClick={() => setShowFormulas((s) => !s)}>
              {showFormulas ? "Hide formulas" : "How it's worked out"}
            </Btn>
            <DownloadPair disabled={!rows.length}
              onExcel={() => downloadGridExcel(`Cost_working_${todayISO()}`, "Cost working", exportCols, rows, exportOpts)}
              onPDF={() => downloadGridPDF("Cost working", exportCols, rows, exportOpts)} />
            <Btn size="sm" icon={Check} disabled={!typed.length || savePrices.isPending} onClick={persist}>
              {savePrices.isPending ? "Saving…" : `Save ${typed.length || ""} price${typed.length === 1 ? "" : "s"}`}
            </Btn>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <Stat icon={Boxes} value={rows.length} label="Items costed" />
            <Stat icon={Percent} value={`${num(avgProfit, 1)}%`} label="Average profit" tone={avgProfit >= 0 ? "green" : "amber"} />
            <Stat icon={avgProfit >= 0 ? TrendingUp : TrendingDown} value={usdp(sellTotal)} label="Sell price, all lines" sub={`at ₹${ex}/$`} />
            <Stat icon={TrendingDown} value={losing} label="Lines below cost" sub={losing ? "Raise the FOB or renegotiate" : "Every line is in profit"} tone={losing ? "amber" : "green"} />
          </div>
        )}

        <Card>
          <CardHead icon={Calculator} title={`Cost working · ${rows.length} line${rows.length === 1 ? "" : "s"}`}>
            {preview.isFetching && <span style={{ fontSize: 11.5, color: "var(--faint)" }}>working…</span>}
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
            <DataTable serial columns={columns} rows={rows} rowKey={(r) => r.item_id} freeze={3} maxHeight={520} />
          ) : (
            <Empty icon={Calculator} title="Nothing costed yet">
              Type a new price against an item above and the whole working appears here — landed cost
              per box, cost per piece, and the final sell price at the exchange rate in step 1.
            </Empty>
          )}
        </Card>
      </section>
    </div>
  );
}
