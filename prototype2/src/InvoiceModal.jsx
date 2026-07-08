import { useState } from "react";
import { Globe, Truck, Download, Pencil, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useApp } from "./store.jsx";
import { Modal, Btn, Seg, Pill, Mono, DataTable, Note } from "./ui.jsx";
import { invoiceTotals, shipComplete, dmy, num, inr, usd, buildProformaXLS, buildCustomInvoiceXLS, buildSupplierXLS } from "./data.js";

/* One invoice, two audiences: the buyer sees USD/FOB, the supplier sees ₹/cost.
   Same rows, same source — just a different lens. */
export default function InvoiceModal({ inv, onEditShip, onClose }) {
  const { items, buyerById, supCode } = useApp();
  const [tab, setTab] = useState("buyer");
  const buyer = buyerById(inv.buyerId);
  const { lines, boxes, volume, pieces, buyerAmt, supAmt } = invoiceTotals(inv, items);
  const done = shipComplete(inv.ship);

  const buyerCols = [
    { key: "gd", label: "GD code", render: (x) => <Mono>{x.it.gd}</Mono> },
    { key: "desc", label: "Description", render: (x) => <span style={{ color: "var(--ink)" }}>{x.it.description}</span> },
    { key: "sp", label: "Supplier", render: (x) => <Pill>{supCode(x.supplierId)}</Pill> },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (x) => x.boxes },
    { key: "pieces", label: "Pieces", align: "r", render: (x) => x.pieces.toLocaleString("en-IN") },
    { key: "vol", label: "Vol m³", align: "r", render: (x) => num(x.volume, 3) },
    { key: "rate", label: "Rate $/pc", align: "r", render: (x) => usd(x.buyerRate) },
    { key: "amt", label: "Amount $", align: "r", strong: true, render: (x) => usd(x.buyerAmt) },
  ];
  const supCols = [
    { key: "sp", label: "Supplier", render: (x) => <Pill>{supCode(x.supplierId)}</Pill> },
    { key: "gd", label: "GD code", render: (x) => <Mono>{x.it.gd}</Mono> },
    { key: "code", label: "Code", render: (x) => <Mono>{x.it.code}</Mono> },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (x) => x.boxes },
    { key: "pieces", label: "Pieces", align: "r", render: (x) => x.pieces.toLocaleString("en-IN") },
    { key: "vol", label: "Vol m³", align: "r", render: (x) => num(x.volume, 3) },
    { key: "rate", label: "Rate ₹/pc", align: "r", render: (x) => inr(x.supRate) },
    { key: "amt", label: "Amount ₹", align: "r", strong: true, render: (x) => inr(x.supAmt) },
  ];
  const supRows = lines.slice().sort((a, b) => supCode(a.supplierId).localeCompare(supCode(b.supplierId)));

  return (
    <Modal title={`Invoice ${inv.invoiceNo}`} icon={FileText} onClose={onClose} width={960}
      footer={<>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {dmy(inv.date)} · {buyer.name} · {boxes} boxes · {num(volume, 3)} m³ ·{" "}
          {done ? <span style={{ color: "var(--green-ink)", fontWeight: 600 }}>shipment details complete</span> : <span style={{ color: "var(--amber-ink)", fontWeight: 600 }}>shipment details pending</span>}
        </span>
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" icon={Pencil} onClick={onEditShip}>Edit shipment details</Btn>
          {tab === "buyer" ? (
            <>
              <Btn variant="ghost" size="sm" icon={Download} onClick={() => buildProformaXLS(inv, items, buyer)}>Proforma (17)</Btn>
              <Btn size="sm" icon={Download} disabled={!done} onClick={() => buildCustomInvoiceXLS(inv, items, buyer)}>Custom invoice (18)</Btn>
            </>
          ) : (
            <Btn size="sm" icon={Download} onClick={() => buildSupplierXLS(inv, items, supCode)}>Supplier sheet</Btn>
          )}
        </div>
      </>}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Seg options={[["buyer", `Buyer · ${buyer.brand} · USD`, Globe], ["supplier", "Supplier · INR", Truck]]} value={tab} onChange={setTab} />
      </div>

      {!done && (
        <div style={{ marginBottom: 12 }}>
          <Note tone="amber" icon={AlertTriangle}>
            The <b>customs invoice (18)</b> unlocks once you add the BL number, vessel, container and port of discharge. Use <b>Edit shipment details</b> below. The proforma (17) is ready now.
          </Note>
        </div>
      )}
      {done && (
        <div style={{ marginBottom: 12 }}>
          <Note tone="teal" icon={CheckCircle2}>Shipment details are in — every one of the 40 documents will render fully populated for this invoice.</Note>
        </div>
      )}

      {tab === "buyer" ? (
        <DataTable columns={buyerCols} rows={lines} rowKey={(x, i) => i}
          footer={[{ v: "Total", span: 3 }, { v: boxes, align: "r" }, { v: pieces.toLocaleString("en-IN"), align: "r" }, { v: num(volume, 3), align: "r" }, { v: "" }, { v: usd(buyerAmt), align: "r" }]} />
      ) : (
        <DataTable columns={supCols} rows={supRows} rowKey={(x, i) => i}
          footer={[{ v: "Total", span: 3 }, { v: boxes, align: "r" }, { v: pieces.toLocaleString("en-IN"), align: "r" }, { v: num(volume, 3), align: "r" }, { v: "" }, { v: inr(supAmt), align: "r" }]} />
      )}
    </Modal>
  );
}
