import { useMemo, useState } from "react";
import { Globe, Truck, Download, Pencil, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal, Btn, Seg, Pill, Mono, DataTable, Note } from "../../components/ui/index.jsx";
import { useItems, useBuyers, useSuppliers, usePoLines, useInvoices } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { dmy, num } from "../../lib/format.js";
import { hidePriceCols, PRICE_HIDDEN_NOTE } from "../../lib/priceCols.js";
import { docCtx } from "../../lib/docCtx.js";
import { buildDocument, DOC_META } from "../../lib/docs.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";

const shipComplete = (s) => !!(s && s.blNo && s.vessel && s.container && s.pod);

/* One invoice, two audiences: the buyer sees USD/FOB, the supplier sees
   ₹/cost. Same rows, same source — just a different lens. */
export default function InvoiceModal({ inv, onEditShip, onClose }) {
  const items = useItems().data || [];
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const poLines = usePoLines().data || [];
  const invoices = useInvoices().data || [];
  const toast = useToast();
  const [tab, setTab] = useState("buyer");

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const buyer = buyers.find((b) => b.id === inv.buyer_id);
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const done = shipComplete(inv.ship);

  /* Serial (carton) numbers — the invoice starts at serial_start and each
     line consumes its boxes in order, so ranges never overlap. */
  const lines = useMemo(() => {
    let sr = Number(inv.serial_start) || 0;
    return (inv.lines || []).map((l) => {
      const it = byId[l.item_id] || {};
      const boxes = Number(l.boxes) || 0;
      const pieces = boxes * (it.packing || 0);
      // As invoiced, not as the master reads today — a delivered invoice must
      // always show the figures it was raised at.
      const fob100 = l.unit_fob100 == null ? (it.unit_fob100 || 0) : Number(l.unit_fob100);
      const fobMode = l.fob_mode || it.fob_mode || "100";
      const supRate = l.unit_value == null ? (it.unit_value || 0) : Number(l.unit_value);
      const buyerRate = fobMode === "100" ? fob100 / 100 : fob100;
      const from = sr; const to = sr + boxes - 1; sr += boxes;
      return {
        it, supplierId: l.supplier_id, boxes, pieces,
        volume: boxes * (it.volume || 0), netWt: boxes * (it.net_per_box || 0),
        buyerRate, buyerAmt: pieces * buyerRate,
        supRate, supAmt: pieces * supRate,
        range: boxes ? `${from}–${to}` : "—",
      };
    });
  }, [inv, byId]);

  const t = lines.reduce((a, x) => ({
    boxes: a.boxes + x.boxes, pieces: a.pieces + x.pieces, volume: a.volume + x.volume,
    buyerAmt: a.buyerAmt + x.buyerAmt, supAmt: a.supAmt + x.supAmt,
  }), { boxes: 0, pieces: 0, volume: 0, buyerAmt: 0, supAmt: 0 });

  const ctx = () => docCtx({ invoice: inv, items, buyers, suppliers, poLines, invoices });
  const grab = (no) => { buildDocument(no, ctx()); toast(`Document ${no} · ${DOC_META[no]} downloaded`); };

  /* Rates and amounts are held off screen like everywhere else; the invoice
     documents carry them in full. */
  const buyerCols = hidePriceCols([
    { key: "sr", w: 108, label: "Serial", render: (x) => <Mono>{x.range}</Mono> },
    { key: "gd", w: 96, label: "GD code", render: (x) => <Mono>{x.it.gd}</Mono> },
    { key: "desc", w: 220, label: "Description", render: (x) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{x.it.description}</span> },
    { key: "sp", w: 92, label: "Supplier", render: (x) => <Pill>{supCode(x.supplierId)}</Pill> },
    { key: "boxes", w: 78, label: "Boxes", align: "r", strong: true, render: (x) => x.boxes },
    { key: "pieces", label: "Pieces", align: "r", render: (x) => x.pieces.toLocaleString("en-IN") },
    { key: "vol", label: "Vol m³", align: "r", render: (x) => num(x.volume, 3) },
    { key: "rate", label: "Rate $/pc", align: "r" },
    { key: "amt", label: "Amount $", align: "r", strong: true },
  ]);
  const supCols = hidePriceCols([
    { key: "sr", w: 108, label: "Serial", render: (x) => <Mono>{x.range}</Mono> },
    { key: "sp", w: 92, label: "Supplier", render: (x) => <Pill>{supCode(x.supplierId)}</Pill> },
    { key: "gd", w: 96, label: "GD code", render: (x) => <Mono>{x.it.gd}</Mono> },
    { key: "code", w: 92, label: "Code", render: (x) => <Mono>{x.it.code}</Mono> },
    { key: "boxes", w: 78, label: "Boxes", align: "r", strong: true, render: (x) => x.boxes },
    { key: "pieces", label: "Pieces", align: "r", render: (x) => x.pieces.toLocaleString("en-IN") },
    { key: "vol", label: "Vol m³", align: "r", render: (x) => num(x.volume, 3) },
    { key: "rate", label: "Rate ₹/pc", align: "r" },
    { key: "amt", label: "Amount ₹", align: "r", strong: true },
  ]);
  const supRows = [...lines].sort((a, b) => supCode(a.supplierId).localeCompare(supCode(b.supplierId)));

  return (
    <Modal title={`Invoice ${inv.invoice_no}`} icon={FileText} onClose={onClose}
      footer={<>
        <span className="row" style={{ fontSize: 11.5, color: "var(--muted)", gap: 6, flexWrap: "wrap" }}>
          {dmy(inv.date)} · {buyer?.name || "—"} · {t.boxes} boxes · {num(t.volume, 3)} m³
          {inv.serial_start ? <> · serials from <Mono>{inv.serial_start}</Mono></> : null} ·
          <Pill tone={INV_STATUS_TONE[inv.status] || ""}>{inv.status}</Pill>
        </span>
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" icon={Pencil} onClick={onEditShip}>Edit shipment details</Btn>
          {tab === "buyer" ? (
            <>
              <Btn variant="ghost" size="sm" icon={Download} onClick={() => grab("17")}>Download proforma</Btn>
              <Btn size="sm" icon={Download} disabled={!done} onClick={() => grab("18")}>Download custom invoice</Btn>
            </>
          ) : (
            <Btn size="sm" icon={Download} onClick={() => grab("7")}>Download supplier sheet</Btn>
          )}
        </div>
      </>}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Seg options={[["buyer", `Buyer · ${buyer?.brand || "—"} · ${buyer?.curr || "USD"}`, Globe], ["supplier", "Supplier · INR", Truck]]}
          value={tab} onChange={setTab} />
      </div>

      <div style={{ marginBottom: 12 }}>
        {done
          ? <Note tone="teal" icon={CheckCircle2}>Shipment details are in — every one of the 40 documents will render fully populated for this invoice.</Note>
          : <Note tone="amber" icon={AlertTriangle}>The <b>customs invoice (18)</b> unlocks once you add the BL number, vessel, container and port of discharge. Use <b>Edit shipment details</b> below. The proforma (17) is ready now.</Note>}
      </div>

      <div style={{ marginBottom: 12 }}>
        <Note tone="teal">{PRICE_HIDDEN_NOTE}</Note>
      </div>

      {tab === "buyer" ? (
        <DataTable serial columns={buyerCols} rows={lines} rowKey={(x, i) => i} freeze={5}
          footer={[{ v: "Total", span: 4 }, { v: t.boxes, align: "r" }, { v: t.pieces.toLocaleString("en-IN"), align: "r" }, { v: num(t.volume, 3), align: "r" }]} />
      ) : (
        <DataTable serial columns={supCols} rows={supRows} rowKey={(x, i) => i} freeze={5}
          footer={[{ v: "Total", span: 4 }, { v: t.boxes, align: "r" }, { v: t.pieces.toLocaleString("en-IN"), align: "r" }, { v: num(t.volume, 3), align: "r" }]} />
      )}
    </Modal>
  );
}
