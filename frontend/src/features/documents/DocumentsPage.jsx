import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  FileText, Download, Check, AlertTriangle, Search, ArrowRight, Layers, Ship, Truck,
  ClipboardList, FileSpreadsheet, FileDown,
} from "lucide-react";
import {
  Card, CardHead, Btn, Field, Input, Select, Pill, Mono, Empty, Note, SearchInput, Info,
  Spinner, DownloadPair,
} from "../../components/ui/index.jsx";
import {
  useInvoices, useItems, useBuyers, useSuppliers, useTransports, usePoLines,
  useInvoiceMutations, usePoList,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { docCtx, poCtx } from "../../lib/docCtx.js";
import {
  renderDocument, DOC_META, DOC_GROUPS, PREVIEW_CSS, isPoDoc, PO_DOCS,
  supplierSplitDocs, downloadSupplierDoc, downloadDocumentExcel, downloadDocumentPDF,
  downloadStageExcel, downloadStagePDF,
} from "../../lib/docs.js";
import { dmy, dmyNum } from "../../lib/format.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";
import ShipmentWizard from "../shipments/ShipmentWizard.jsx";

/* Documents — the export papers, generated live.

   Two sources, and which one a document reads is not a preference:

     PO Reports (1–6)  are raised off the purchase order. They exist the
                       moment the buyer's order is entered and never wait on
                       a packing invoice.
     everything else   is raised off an invoice — the goods have to have been
                       packed before there is anything to declare.

   `group` (a DOC_GROUPS key) narrows the page to one menu head, which is how
   the PO / Suppliers' / Pre- / Post-Shipment Reports entries reuse it. */

const shipComplete = (s) => !!(s && s.blNo && s.vessel && s.container && s.pod);

/* Editable shipment details above the Pre-Shipment set. Saving writes to the
   invoice, so every document built from it changes with the same click. */
function PreShipPanel({ inv, onWizard }) {
  const { update } = useInvoiceMutations();
  const toast = useToast();
  const [f, setF] = useState({ ...(inv.ship || {}) });
  useEffect(() => { setF({ ...(inv.ship || {}) }); }, [inv.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const F = [
    ["blNo", "BL No.", "text"], ["blDate", "BL Date", "date"], ["vessel", "Vessel / voyage", "text"],
    ["container", "Container No.", "text"], ["seal", "Seal No.", "text"], ["pod", "Port of discharge", "text"],
    ["marks", "Marks & Nos", "text"], ["pkgs", "No & kinds of pkgs", "text"], ["terms", "Terms", "text"],
    ["netWt", "Nett wt (kg)", "number"], ["grossWt", "Gross wt (kg)", "number"], ["exRate", "Exchange rate ₹/$", "number"],
  ];

  return (
    <Card pad>
      <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="stat-i" style={{ width: 30, height: 30 }}><Ship size={15} /></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>Shipment details · {inv.invoice_no}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Editable here — changes reflect in the invoice and every document below.</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Pill tone={INV_STATUS_TONE[inv.status] || ""}>{inv.status}</Pill>
          <Btn variant="ghost" size="sm" icon={Truck} onClick={onWizard}>3-step shipment</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
        {F.map(([k, label, type]) => (
          <Field key={k} label={label}>
            <Input className="input-sm" type={type} value={f[k] ?? ""} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
          </Field>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <Btn size="sm" icon={Check} disabled={update.isPending}
          onClick={() => update.mutate({ id: inv.id, body: { ship: f } }, {
            onSuccess: () => toast(`Shipment details saved for ${inv.invoice_no}`),
          })}>
          Save shipment details
        </Btn>
      </div>
    </Card>
  );
}

export default function DocumentsPage({ group }) {
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const invq = useInvoices();
  const poq = usePoList();
  const items = useItems().data || [];
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const transports = useTransports().data || [];
  const poLines = usePoLines().data || [];
  const invoices = invq.data || [];
  const pos = poq.data || [];

  const groupMeta = group ? DOC_GROUPS.find((g) => g.k === group) : null;
  const catalogue = groupMeta ? [groupMeta] : DOC_GROUPS;
  const heading = groupMeta ? groupMeta.t : "Documents";

  const [invId, setInvId] = useState("");
  const [poNo, setPoNo] = useState("");
  const [open, setOpen] = useState(groupMeta ? groupMeta.docs[0] : "18");
  const [q, setQ] = useState("");
  const [wizOpen, setWizOpen] = useState(false);

  // ⌘K can deep-link straight to a document.
  useEffect(() => {
    const doc = params.get("doc");
    if (doc) { setOpen(doc); setQ(""); setParams({}, { replace: true }); }
  }, [params, setParams]);

  /* The full library opens on an invoice-stage document. If there is no
     invoice yet but orders have been placed, land on the PO papers instead —
     they are ready, and a blank "no invoice" screen would hide that. */
  useEffect(() => {
    if (groupMeta || invq.isLoading || poq.isLoading) return;
    if (!invoices.length && pos.length && !isPoDoc(open)) setOpen(PO_DOCS[0]);
  }, [groupMeta, invq.isLoading, poq.isLoading, invoices.length, pos.length, open]);

  const inv = invoices.find((i) => i.id === invId) || invoices[0];
  const po = pos.find((p) => p.po === poNo) || pos[0];

  /* Which source this screen is reading. A PO-only menu head is always PO;
     the full library follows whichever document is open. */
  const poMode = groupMeta ? groupMeta.source === "po" : isPoDoc(open);

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const match = (no) => !ql || no.toLowerCase().includes(ql) || (DOC_META[no] || "").toLowerCase().includes(ql);
    return catalogue.map((g) => ({ ...g, docs: g.docs.filter(match) })).filter((g) => g.docs.length);
  }, [q, catalogue]);

  const invCtx = useMemo(
    () => (inv ? docCtx({ invoice: inv, items, buyers, suppliers, poLines, transports, invoices }) : null),
    [inv, items, buyers, suppliers, poLines, transports, invoices],
  );
  const orderCtx = useMemo(
    () => (po ? poCtx({ po: po.po, items, buyers, suppliers, poLines, transports }) : null),
    [po, items, buyers, suppliers, poLines, transports],
  );
  const ctx = poMode ? orderCtx : invCtx;

  if (invq.isLoading || poq.isLoading) return <Spinner label="Loading…" />;

  if (!ctx) {
    const needPo = poMode;
    return (
      <div className="stack">
        <div className="page-head">
          <h2 className="h1">{heading}</h2>
          <p className="sub">
            {needPo
              ? "PO documents are raised from a purchase order — no invoice needed."
              : "Export documents, generated from a single invoice."}
          </p>
        </div>
        <Card>
          {needPo ? (
            <Empty icon={ClipboardList} title="No purchase order to build documents from"
              action={<Btn icon={ArrowRight} onClick={() => nav("/orders")}>Enter a buyer order</Btn>}>
              These papers read their figures from the buyer's order. Enter one and every PO document
              fills itself in — nothing here waits on a packing invoice.
            </Empty>
          ) : (
            <Empty icon={FileText} title="No invoice to build documents from"
              action={<Btn icon={ArrowRight} onClick={() => nav("/packing")}>Record packing first</Btn>}>
              Shipment documents read their figures from an invoice — create one and every paper fills itself in.
            </Empty>
          )}
        </Card>
      </div>
    );
  }

  const done = shipComplete(inv?.ship);
  const isPre = groupMeta?.k === "PRE";
  const split = supplierSplitDocs(open, ctx);
  const total = catalogue.reduce((s, g) => s + g.docs.length, 0);
  const previewHtml = renderDocument(open, ctx);
  const stamp = poMode ? `PO_${po.po}` : (inv?.invoice_no || "").replace(/\//g, "-");

  const grabExcel = (no) => {
    if (downloadDocumentExcel(no, isPoDoc(no) ? orderCtx : invCtx)) toast(`Document ${no} · ${DOC_META[no]} — Excel`);
  };
  const grabPDF = (no) => {
    if (downloadDocumentPDF(no, isPoDoc(no) ? orderCtx : invCtx)) toast(`Document ${no} · ${DOC_META[no]} — opening print dialog`);
  };
  /* A stage downloads as one workbook (a sheet per document) or one print
     job, rather than a dozen separate files. Each document is built from its
     own source, so a mixed set still comes out right. */
  const ctxFor = (no) => (isPoDoc(no) ? orderCtx : invCtx);
  const grabStageExcel = (g) => {
    if (downloadStageExcel(`${g.t.replace(/[^A-Za-z0-9]+/g, "_")}_${stamp}`, g.docs, ctxFor)) toast(`${g.t} — Excel`);
    else toast(`Nothing to build for ${g.t} yet`);
  };
  const grabStagePDF = (g) => {
    if (downloadStagePDF(g.t, g.docs, ctxFor)) toast(`${g.t} — opening print dialog`);
    else toast(`Nothing to build for ${g.t} yet`);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">{heading}</h2>
        <p className="sub">
          {groupMeta
            ? <>{groupMeta.hint} — {total} document{total === 1 ? "" : "s"}, generated live from the {poMode ? "purchase order" : "invoice"} you pick below.</>
            : <>Every export document, generated live. The PO papers read the purchase order; the rest read the invoice.</>}{" "}
          The same PO, dates, buyer, BL, container and quantities flow into every one{" "}
          <Info>Nothing is retyped. Change one figure and every document changes with it — that is the whole point of the system.</Info>{" "}
          Preview on the right, then download as Excel (formulas intact) or PDF.
        </p>
      </div>

      <Card pad>
        <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
          {poMode ? (
            <Field label="Build documents from purchase order" style={{ minWidth: 340 }}>
              <Select value={po.po} onChange={(e) => setPoNo(e.target.value)}>
                {pos.map((p) => (
                  <option key={p.po} value={p.po}>
                    {p.po} ({dmyNum(p.date)}) — {buyers.find((b) => b.id === p.buyer_id)?.brand || "—"} — {p.ordered} boxes
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Build documents from invoice" style={{ minWidth: 340 }}>
              <Select value={inv.id} onChange={(e) => setInvId(e.target.value)}>
                {invoices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.invoice_no} — {dmy(x.date)} — {buyers.find((b) => b.id === x.buyer_id)?.brand || "—"}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {poMode
            ? <Pill tone="teal"><ClipboardList size={11} /> raised from the order — no invoice needed</Pill>
            : done
              ? <Pill tone="green"><Check size={11} /> shipment details complete</Pill>
              : <Pill tone="amber"><AlertTriangle size={11} /> shipment details pending</Pill>}
          <span className="grow" />
          <div style={{ minWidth: 240 }}><SearchInput value={q} onChange={setQ} placeholder="Find a document…" /></div>
        </div>
        {!poMode && !done && (
          <div style={{ marginTop: 12 }}>
            <Note tone="amber" icon={AlertTriangle}>
              Post-shipment fields (BL, vessel, container, S/B) will print blank until you fill them.{" "}
              <button className="btn btn-quiet btn-sm" style={{ height: 22, padding: "0 6px" }} onClick={() => nav("/shipments")}>
                Add shipment details <ArrowRight size={12} />
              </button>
            </Note>
          </div>
        )}
      </Card>

      {isPre && inv && <PreShipPanel inv={inv} onWizard={() => setWizOpen(true)} />}

      <div className="split-docs">
        <Card style={{ overflow: "hidden", alignSelf: "start" }}>
          <div style={{ maxHeight: 660, overflowY: "auto" }}>
            {groups.map((g) => (
              <div key={g.k}>
                <div className="doc-group-head">
                  <span className="g">
                    <span style={{ fontFamily: "var(--mono)", color: "var(--amber-2)", fontWeight: 700, fontSize: 11 }}>{g.k}</span>
                    {g.t}
                    <span style={{ fontWeight: 400, color: "var(--faint)", fontSize: 11 }}>· {g.docs.length}</span>
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    <button className="btn btn-quiet btn-sm" title={`${g.hint} — one workbook, a sheet per document`}
                      onClick={() => grabStageExcel(g)} style={{ height: 24 }}>
                      <FileSpreadsheet size={12} /> all
                    </button>
                    <button className="btn btn-quiet btn-sm" title={`${g.hint} — one print job`}
                      onClick={() => grabStagePDF(g)} style={{ height: 24 }}>
                      <FileDown size={12} />
                    </button>
                  </span>
                </div>
                {g.docs.map((no) => (
                  <button key={no} className={`doc-item${open === no ? " on" : ""}`} onClick={() => setOpen(no)}>
                    <span className="doc-no">{no}</span>
                    <span className="doc-name">{DOC_META[no]}</span>
                    <span className="icon-btn bare" onClick={(e) => { e.stopPropagation(); grabExcel(no); }} title="Download Excel" style={{ width: 24, height: 24 }}>
                      <FileSpreadsheet size={14} />
                    </span>
                    <span className="icon-btn bare" onClick={(e) => { e.stopPropagation(); grabPDF(no); }} title="Download PDF" style={{ width: 24, height: 24 }}>
                      <FileDown size={14} />
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && <Empty icon={Search} title={`Nothing matches “${q}”`}>Try a document number, or a word like “packing”, “VGM”, “invoice”.</Empty>}
          </div>
        </Card>

        <Card style={{ overflow: "hidden" }}>
          <CardHead icon={FileText} title={<span>Document <Mono>{open}</Mono> · {DOC_META[open]}</span>}>
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
              {poMode ? <>PO {po.po} · {dmyNum(po.date)}</> : <>{inv.invoice_no} · {dmy(inv.date)}</>}
            </span>
            <DownloadPair onExcel={() => grabExcel(open)} onPDF={() => grabPDF(open)} />
          </CardHead>
          <div className="docprev-shell">
            {split.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Note tone="teal" icon={Truck}>
                  <b>Download this one supplier-wise</b> — a separate file per supplier, not a single
                  combined sheet. The preview below shows every supplier for reference.
                  <div className="stack-sm" style={{ marginTop: 8 }}>
                    {split.map((d) => (
                      <div key={d.supplierId} className="row wrap" style={{ gap: 8, justifyContent: "space-between" }}>
                        <span className="row" style={{ gap: 8 }}>
                          <Pill tone="teal">{d.code}</Pill>
                          <span style={{ fontSize: 12 }}>{d.name}</span>
                        </span>
                        <DownloadPair
                          onExcel={() => { downloadSupplierDoc(open, ctx, d.supplierId, "excel"); toast(`Document ${open} · ${d.code} — Excel`); }}
                          onPDF={() => { downloadSupplierDoc(open, ctx, d.supplierId, "pdf"); toast(`Document ${open} · ${d.code} — opening print dialog`); }}
                        />
                      </div>
                    ))}
                  </div>
                </Note>
              </div>
            )}
            <style>{PREVIEW_CSS}</style>
            <div className="docprev docprev-paper" dangerouslySetInnerHTML={{ __html: previewHtml || `<div class="sub">No preview for this document.</div>` }} />
            <div className="row" style={{ marginTop: 12, gap: 7, fontSize: 11.5, color: "var(--teal-ink)" }}>
              <Check size={14} /> Live preview of the download — every figure pulled from{" "}
              {poMode ? `purchase order ${po.po}` : `invoice ${inv.invoice_no}`}. The Excel keeps its formulas.
            </div>
          </div>
        </Card>
      </div>

      <Card pad>
        <div className="row wrap" style={{ gap: 12, justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="stat-i" style={{ width: 30, height: 30 }}><Layers size={15} /></span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>Need the whole set?</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Every {groupMeta ? `${heading} document` : "document"} in one go — Excel gives you a single
                workbook with a sheet per document.
              </div>
            </div>
          </div>
          <DownloadPair size="md" variant="dark"
            onExcel={() => {
              const nums = catalogue.flatMap((g) => g.docs);
              if (downloadStageExcel(`${heading.replace(/[^A-Za-z0-9]+/g, "_")}_${stamp}`, nums, ctxFor)) toast(`Downloading all ${nums.length} sheets`);
            }}
            onPDF={() => {
              const nums = catalogue.flatMap((g) => g.docs);
              if (downloadStagePDF(heading, nums, ctxFor)) toast(`Opening the print dialog for ${nums.length} documents`);
            }}
          />
        </div>
      </Card>

      {wizOpen && inv && <ShipmentWizard inv={inv} onClose={() => setWizOpen(false)} />}
    </div>
  );
}
