import { useState, useEffect, useMemo } from "react";
import { FileText, Download, Check, AlertTriangle, Search, ArrowRight, Layers } from "lucide-react";
import { useApp } from "../store.jsx";
import Rail from "../Rail.jsx";
import { Card, CardHead, Btn, Field, Select, Pill, Mono, Empty, Note, SearchInput, Info } from "../ui.jsx";
import { buildDocument, DOC_META, renderDocument, PREVIEW_CSS } from "../docs.js";
import { DOC_GROUPS, EXPORTER, shipComplete, dmy } from "../data.js";

/* ============================================================
   Documents — 40 export papers, generated live from one invoice.
   Left: the catalogue, grouped by when in the shipment it is needed.
   Right: a real preview of the Excel that will download.
   ============================================================ */
export default function Documents({ go, jump, clearJump }) {
  const { items, buyers, suppliers, buyerMaster, invoices, buyerById, supCode, toast } = useApp();
  const [invId, setInvId] = useState(invoices[0]?.id);
  const [open, setOpen] = useState("18");
  const [q, setQ] = useState("");

  useEffect(() => { if (jump) { setOpen(jump); setQ(""); clearJump(); } }, [jump, clearJump]);

  const inv = invoices.find((i) => i.id === invId) || invoices[0];

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const match = (no) => !ql || no.toLowerCase().includes(ql) || (DOC_META[no] || "").toLowerCase().includes(ql);
    return DOC_GROUPS.map((g) => ({ ...g, docs: g.docs.filter(match) })).filter((g) => g.docs.length);
  }, [q]);

  if (!inv) {
    return (
      <div className="stack">
        <Rail view="documents" go={go} />
        <div className="page-head"><h2 className="h1">Documents</h2><p className="sub">All 40 export documents, generated from a single invoice.</p></div>
        <Card><Empty icon={FileText} title="No invoice to build documents from" action={<Btn icon={ArrowRight} onClick={() => go("packing")}>Record packing first</Btn>}>Documents read their figures from an invoice — create one and every paper fills itself in.</Empty></Card>
      </div>
    );
  }

  const buyer = buyerById(inv.buyerId);
  const done = shipComplete(inv.ship);
  const ctx = { inv, buyer, items, buyerMaster, invoices, SUPPLIERS: suppliers, BUYERS: buyers, EXPORTER, supCode };

  const download = (no) => { buildDocument(no, ctx); toast(`Document ${no} · ${DOC_META[no]} downloaded`); };
  const downloadStage = (g) => { g.docs.forEach((no, i) => setTimeout(() => buildDocument(no, ctx), i * 250)); toast(`Downloading ${g.docs.length} documents from stage ${g.k}`); };
  const previewHtml = renderDocument(open, ctx);
  const total = DOC_GROUPS.reduce((s, g) => s + g.docs.length, 0);

  return (
    <div className="stack">
      <Rail view="documents" go={go} />

      <div className="page-head">
        <h2 className="h1">Documents</h2>
        <p className="sub">
          All 40 export documents — {total} sheets once you count the 2A, 7A and 11A masters — generated live from the invoice you pick below. The same PO, dates, buyer, BL, container and quantities flow into every one{" "}
          <Info>Nothing is retyped. Change one figure on the invoice and every document changes with it — that is the whole point of the system.</Info>{" "}
          Preview on the right, then download as Excel.
        </p>
      </div>

      <Card pad>
        <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
          <Field label="Build documents from invoice" style={{ minWidth: 340 }}>
            <Select value={inv.id} onChange={(e) => setInvId(e.target.value)}>
              {invoices.map((x) => <option key={x.id} value={x.id}>{x.invoiceNo} — {dmy(x.date)} — {buyerById(x.buyerId).brand}</option>)}
            </Select>
          </Field>
          {done ? <Pill tone="green"><Check size={11} /> shipment details complete</Pill> : <Pill tone="amber"><AlertTriangle size={11} /> shipment details pending</Pill>}
          <span className="grow" />
          <div style={{ minWidth: 240 }}><SearchInput value={q} onChange={setQ} placeholder="Find a document…" /></div>
        </div>
        {!done && (
          <div style={{ marginTop: 12 }}>
            <Note tone="amber" icon={AlertTriangle}>
              Post-shipment fields (BL, vessel, container, S/B) will print blank until you fill them.{" "}
              <button className="btn btn-quiet btn-sm" style={{ height: 22, padding: "0 6px" }} onClick={() => go("shipments")}>Add shipment details <ArrowRight size={12} /></button>
              Order-stage documents are fully populated right now.
            </Note>
          </div>
        )}
      </Card>

      <div className="split-docs">
        {/* Catalogue */}
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
                  <button className="btn btn-quiet btn-sm" title={g.hint} onClick={() => downloadStage(g)} style={{ height: 24 }}>
                    <Download size={12} /> all
                  </button>
                </div>
                {g.docs.map((no) => (
                  <button key={no} className={`doc-item${open === no ? " on" : ""}`} onClick={() => setOpen(no)}>
                    <span className="doc-no">{no}</span>
                    <span className="doc-name">{DOC_META[no]}</span>
                    <span className="icon-btn bare" onClick={(e) => { e.stopPropagation(); download(no); }} title="Download Excel" style={{ width: 24, height: 24 }}>
                      <Download size={14} />
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && <Empty icon={Search} title={`Nothing matches “${q}”`}>Try a document number, or a word like “packing”, “VGM”, “invoice”.</Empty>}
          </div>
        </Card>

        {/* Preview */}
        <Card style={{ overflow: "hidden" }}>
          <CardHead icon={FileText} title={<span>Document <Mono>{open}</Mono> · {DOC_META[open]}</span>}>
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{inv.invoiceNo} · {dmy(inv.date)}</span>
            <Btn size="sm" icon={Download} onClick={() => download(open)}>Download Excel</Btn>
          </CardHead>
          <div className="docprev-shell">
            <style>{PREVIEW_CSS}</style>
            <div className="docprev docprev-paper" dangerouslySetInnerHTML={{ __html: previewHtml || `<div class="sub">No preview for this document.</div>` }} />
            <div className="row" style={{ marginTop: 12, gap: 7, fontSize: 11.5, color: "var(--teal-ink)" }}>
              <Check size={14} /> Live preview of the Excel output — every figure pulled from invoice {inv.invoiceNo}.
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
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Download every document for {inv.invoiceNo} in one go — {total} Excel files.</div>
            </div>
          </div>
          <Btn variant="dark" icon={Download} onClick={() => {
            DOC_GROUPS.flatMap((g) => g.docs).forEach((no, i) => setTimeout(() => buildDocument(no, ctx), i * 200));
            toast(`Downloading all ${total} sheets for ${inv.invoiceNo}`);
          }}>
            Download all {total} sheets
          </Btn>
        </div>
      </Card>
    </div>
  );
}
