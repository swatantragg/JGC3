import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  FileText, Download, Check, AlertTriangle, Search, ArrowRight, Layers, Ship, Truck,
} from "lucide-react";
import {
  Card, CardHead, Btn, Field, Input, Select, Pill, Mono, Empty, Note, SearchInput, Info, Spinner,
} from "../../components/ui/index.jsx";
import {
  useInvoices, useItems, useBuyers, useSuppliers, useTransports, usePoLines, useInvoiceMutations,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { docCtx } from "../../lib/docCtx.js";
import {
  buildDocument, renderDocument, DOC_META, DOC_GROUPS, PREVIEW_CSS,
  ewaySupplierDocs, downloadEwaySupplier,
} from "../../lib/docs.js";
import { dmy } from "../../lib/format.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";
import ShipmentWizard from "../shipments/ShipmentWizard.jsx";

/* Documents — 40 export papers, generated live from one invoice.
   Left: the catalogue, grouped under the client's menu heads.
   Right: a real preview of the Excel that will download.

   `group` (a DOC_GROUPS key) narrows the page to one menu head — that is how
   the PO / Suppliers' / Pre- / Post-Shipment Reports entries reuse this page. */

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
  const items = useItems().data || [];
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const transports = useTransports().data || [];
  const poLines = usePoLines().data || [];
  const invoices = invq.data || [];

  const groupMeta = group ? DOC_GROUPS.find((g) => g.k === group) : null;
  const catalogue = groupMeta ? [groupMeta] : DOC_GROUPS;
  const heading = groupMeta ? groupMeta.t : "Documents";

  const [invId, setInvId] = useState("");
  const [open, setOpen] = useState(groupMeta ? groupMeta.docs[0] : "18");
  const [q, setQ] = useState("");
  const [wizOpen, setWizOpen] = useState(false);

  // ⌘K can deep-link straight to a document.
  useEffect(() => {
    const doc = params.get("doc");
    if (doc) { setOpen(doc); setQ(""); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const inv = invoices.find((i) => i.id === invId) || invoices[0];

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const match = (no) => !ql || no.toLowerCase().includes(ql) || (DOC_META[no] || "").toLowerCase().includes(ql);
    return catalogue.map((g) => ({ ...g, docs: g.docs.filter(match) })).filter((g) => g.docs.length);
  }, [q, catalogue]);

  const ctx = useMemo(
    () => (inv ? docCtx({ invoice: inv, items, buyers, suppliers, poLines, transports, invoices }) : null),
    [inv, items, buyers, suppliers, poLines, transports, invoices],
  );

  if (invq.isLoading) return <Spinner label="Loading invoices…" />;

  if (!inv || !ctx) {
    return (
      <div className="stack">
        <div className="page-head">
          <h2 className="h1">{heading}</h2>
          <p className="sub">Export documents, generated from a single invoice.</p>
        </div>
        <Card>
          <Empty icon={FileText} title="No invoice to build documents from"
            action={<Btn icon={ArrowRight} onClick={() => nav("/packing")}>Record packing first</Btn>}>
            Documents read their figures from an invoice — create one and every paper fills itself in.
          </Empty>
        </Card>
      </div>
    );
  }

  const done = shipComplete(inv.ship);
  const isPre = groupMeta?.k === "PRE";
  const ewaySup = open === "10" ? ewaySupplierDocs(ctx) : [];
  const total = catalogue.reduce((s, g) => s + g.docs.length, 0);
  const previewHtml = renderDocument(open, ctx);

  const grab = (no) => { buildDocument(no, ctx); toast(`Document ${no} · ${DOC_META[no]} downloaded`); };
  const grabStage = (g) => {
    g.docs.forEach((no, i) => setTimeout(() => buildDocument(no, ctx), i * 250));
    toast(`Downloading ${g.docs.length} documents — ${g.t}`);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">{heading}</h2>
        <p className="sub">
          {groupMeta
            ? <>{groupMeta.hint} — {total} document{total === 1 ? "" : "s"}, generated live from the invoice you pick below.</>
            : <>All 40 export documents — {total} sheets once you count the 2A, 7A and 11A masters — generated live from the invoice you pick below.</>}{" "}
          The same PO, dates, buyer, BL, container and quantities flow into every one{" "}
          <Info>Nothing is retyped. Change one figure on the invoice and every document changes with it — that is the whole point of the system.</Info>{" "}
          Preview on the right, then download as Excel.
        </p>
      </div>

      <Card pad>
        <div className="row wrap" style={{ gap: 14, alignItems: "flex-end" }}>
          <Field label="Build documents from invoice" style={{ minWidth: 340 }}>
            <Select value={inv.id} onChange={(e) => setInvId(e.target.value)}>
              {invoices.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.invoice_no} — {dmy(x.date)} — {buyers.find((b) => b.id === x.buyer_id)?.brand || "—"}
                </option>
              ))}
            </Select>
          </Field>
          {done
            ? <Pill tone="green"><Check size={11} /> shipment details complete</Pill>
            : <Pill tone="amber"><AlertTriangle size={11} /> shipment details pending</Pill>}
          <span className="grow" />
          <div style={{ minWidth: 240 }}><SearchInput value={q} onChange={setQ} placeholder="Find a document…" /></div>
        </div>
        {!done && (
          <div style={{ marginTop: 12 }}>
            <Note tone="amber" icon={AlertTriangle}>
              Post-shipment fields (BL, vessel, container, S/B) will print blank until you fill them.{" "}
              <button className="btn btn-quiet btn-sm" style={{ height: 22, padding: "0 6px" }} onClick={() => nav("/shipments")}>
                Add shipment details <ArrowRight size={12} />
              </button>{" "}
              Order-stage documents are fully populated right now.
            </Note>
          </div>
        )}
      </Card>

      {isPre && <PreShipPanel inv={inv} onWizard={() => setWizOpen(true)} />}

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
                  <button className="btn btn-quiet btn-sm" title={g.hint} onClick={() => grabStage(g)} style={{ height: 24 }}>
                    <Download size={12} /> all
                  </button>
                </div>
                {g.docs.map((no) => (
                  <button key={no} className={`doc-item${open === no ? " on" : ""}`} onClick={() => setOpen(no)}>
                    <span className="doc-no">{no}</span>
                    <span className="doc-name">{DOC_META[no]}</span>
                    <span className="icon-btn bare" onClick={(e) => { e.stopPropagation(); grab(no); }} title="Download Excel" style={{ width: 24, height: 24 }}>
                      <Download size={14} />
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
            <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{inv.invoice_no} · {dmy(inv.date)}</span>
            <Btn size="sm" icon={Download} onClick={() => grab(open)}>Download</Btn>
          </CardHead>
          <div className="docprev-shell">
            {ewaySup.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Note tone="teal" icon={Truck}>
                  <b>Download the E-way bill supplier-wise</b> — one file per supplier, not a single combined sheet. The preview below shows all suppliers for reference.
                  <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                    {ewaySup.map((d) => (
                      <Btn key={d.supplierId} variant="ghost" size="sm" icon={Download}
                        onClick={() => { downloadEwaySupplier(ctx, d.supplierId); toast(`E-way bill (10) · ${d.code} downloaded`); }}>
                        {d.code} · {d.name}
                      </Btn>
                    ))}
                  </div>
                </Note>
              </div>
            )}
            <style>{PREVIEW_CSS}</style>
            <div className="docprev docprev-paper" dangerouslySetInnerHTML={{ __html: previewHtml || `<div class="sub">No preview for this document.</div>` }} />
            <div className="row" style={{ marginTop: 12, gap: 7, fontSize: 11.5, color: "var(--teal-ink)" }}>
              <Check size={14} /> Live preview of the Excel output — every figure pulled from invoice {inv.invoice_no}.
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
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Download every {groupMeta ? `${heading} document` : "document"} for {inv.invoice_no} in one go — {total} Excel files.</div>
            </div>
          </div>
          <Btn variant="dark" icon={Download} onClick={() => {
            catalogue.flatMap((g) => g.docs).forEach((no, i) => setTimeout(() => buildDocument(no, ctx), i * 200));
            toast(`Downloading all ${total} sheets for ${inv.invoice_no}`);
          }}>
            Download all
          </Btn>
        </div>
      </Card>

      {wizOpen && <ShipmentWizard inv={inv} onClose={() => setWizOpen(false)} />}
    </div>
  );
}
