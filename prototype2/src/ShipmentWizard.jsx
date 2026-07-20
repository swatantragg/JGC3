import { useState } from "react";
import { Truck, Container, Ship, Check, ChevronRight, ChevronLeft, SkipForward, Lock } from "lucide-react";
import { useApp } from "./store.jsx";
import { Modal, Btn, Field, Input, Select, Pill, Note, Step } from "./ui.jsx";
import {
  invoiceSuppliers, transportsForSupplier, invoiceStatus, INV_STATUS_TONE,
  EMPTY_VEHICLE, vehicleDone, vehicleRowDone, containerDone, shipStepDone,
} from "./data.js";

/* ============================================================
   Shipment wizard — three gated steps that move an invoice from
   "Ready to dispatch" → "Dispatched" → "Ready to Ship" → "Shipped".
   Each step unlocks only when the previous one is filled or skipped.
     1  Vehicle details (supplier-wise)
     2  Container details
     3  BL / shipping details
   ============================================================ */
export default function ShipmentWizard({ inv, onClose, onSaved }) {
  const { transports, suppliers, supById, setInvoices, invoices, toast } = useApp();
  const sups = invoiceSuppliers(inv);

  // Pre-fill each supplier's row: transporter carried from the packing pick (or
  // first available), source = supplier place, dest = Nhava Sheva — so the user
  // only needs to type the vehicle number to unlock the next step.
  const [vehicles, setVehicles] = useState(() => {
    const v = { ...(inv.vehicles || {}) };
    sups.forEach((s) => {
      const ex = v[s] || {};
      const opts = transportsForSupplier(transports, s);
      const tid = ex.transportId || (inv.packingTransports || {})[s] || opts[0]?.id || "";
      const t = transports.find((x) => x.id === tid);
      const sp = supById(s);
      v[s] = {
        ...EMPTY_VEHICLE, ...ex,
        transportId: tid,
        transportName: ex.transportName || t?.name || "",
        source: ex.source || sp?.place || "",
        dest: ex.dest || "Nhava Sheva",
      };
    });
    return v;
  });
  const [ship, setShip] = useState({ ...(inv.ship || {}) });
  const [skip, setSkip] = useState({ ...(inv.stepSkip || {}) });
  const [step, setStep] = useState(1);

  const draft = { ...inv, vehicles, ship, stepSkip: skip };
  const done1 = vehicleDone(draft), done2 = containerDone(draft), done3 = shipStepDone(draft);
  const unlocked = { 1: true, 2: done1, 3: done1 && done2 };
  const status = invoiceStatus(draft);

  const setVeh = (sid, k, val) => setVehicles((p) => ({ ...p, [sid]: { ...p[sid], [k]: val } }));
  const setSh = (k, val) => setShip((p) => ({ ...p, [k]: val }));
  const setSkp = (k, val) => setSkip((p) => ({ ...p, [k]: val }));

  const pickTransport = (sid, tid) => {
    const t = transports.find((x) => x.id === tid);
    setVehicles((p) => ({ ...p, [sid]: { ...p[sid], transportId: tid, transportName: t?.name || "" } }));
  };

  const save = () => {
    const patch = { vehicles, ship, stepSkip: skip };
    setInvoices(invoices.map((x) => (x.id === inv.id ? { ...x, ...patch } : x)));
    toast(`Shipment updated · ${inv.invoiceNo} — ${invoiceStatus({ ...inv, ...patch })}`);
    onSaved && onSaved();
    onClose();
  };

  const STEPS = [
    { n: 1, label: "Vehicle details", icon: Truck, done: done1 },
    { n: 2, label: "Container details", icon: Container, done: done2 },
    { n: 3, label: "BL / shipping", icon: Ship, done: done3 },
  ];

  return (
    <Modal title={`Shipment · ${inv.invoiceNo}`} icon={Ship} onClose={onClose}
      footer={<>
        <span className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--muted)" }}>
          Status: <Pill tone={INV_STATUS_TONE[status] || ""}>{status}</Pill>
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          {step > 1 && <Btn variant="ghost" icon={ChevronLeft} onClick={() => setStep(step - 1)}>Back</Btn>}
          {step < 3 && <Btn iconRight={ChevronRight} disabled={!unlocked[step + 1]} onClick={() => setStep(step + 1)}>Next step</Btn>}
          <Btn icon={Check} onClick={save}>Save</Btn>
        </div>
      </>}>
      {/* Stepper */}
      <div className="wiz-steps">
        {STEPS.map((s) => (
          <button key={s.n} className={`wiz-step${step === s.n ? " on" : ""}${unlocked[s.n] ? "" : " locked"}`}
            onClick={() => unlocked[s.n] && setStep(s.n)}>
            <span className="wiz-ic">{unlocked[s.n] ? (s.done ? <Check size={14} /> : <s.icon size={14} />) : <Lock size={13} />}</span>
            <span className="grow" style={{ textAlign: "left" }}>
              <span className="wiz-t">Step {s.n}</span>
              <span className="wiz-s">{s.label}</span>
            </span>
            {s.done && <Pill tone="green">done</Pill>}
            {skip[["", "vehicle", "container", "ship"][s.n]] && !s.done && <Pill tone="amber">skipped</Pill>}
          </button>
        ))}
      </div>

      {/* Step 1 — vehicle details, supplier-wise */}
      {step === 1 && (
        <div className="stack">
          <Step n="1" title="Vehicle details — supplier-wise" hint="One vehicle per supplier on this invoice. Pick the transporter you added under Setup → Transport." />
          {sups.map((sid) => {
            const sp = supById(sid), opts = transportsForSupplier(transports, sid);
            return (
              <div key={sid} className="wiz-card">
                <div className="row" style={{ marginBottom: 10, gap: 8 }}>
                  <Pill tone="teal">{sp.code}</Pill>
                  <span style={{ fontWeight: 650, color: "var(--ink)" }}>{sp.name}</span>
                </div>
                <div className="grid-2">
                  <Field label="Transporter" hint="Selected from the transports added for this supplier.">
                    <Select value={vehicles[sid]?.transportId || ""} onChange={(e) => pickTransport(sid, e.target.value)}>
                      <option value="">— select transport —</option>
                      {opts.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.transportId}</option>)}
                      {!opts.length && <option value="" disabled>No transport added for {sp.code}</option>}
                    </Select>
                  </Field>
                  <Field label="Vehicle number"><Input value={vehicles[sid]?.vehicleNo || ""} onChange={(e) => setVeh(sid, "vehicleNo", e.target.value)} placeholder="e.g. MH-04-KL-2231" /></Field>
                  <Field label="Source"><Input value={vehicles[sid]?.source || ""} onChange={(e) => setVeh(sid, "source", e.target.value)} placeholder={sp.place || "Origin"} /></Field>
                  <Field label="Destination"><Input value={vehicles[sid]?.dest || ""} onChange={(e) => setVeh(sid, "dest", e.target.value)} placeholder="Nhava Sheva" /></Field>
                </div>
              </div>
            );
          })}
          {!done1 && !skip.vehicle && (
            <Note tone="amber">
              Enter a vehicle number for {sups.filter((s) => !vehicleRowDone(vehicles[s])).map((s) => supById(s).code).join(", ")} to unlock Step 2.
            </Note>
          )}
          {done1 && !skip.vehicle && <Note tone="teal">Vehicle details complete — Step 2 (container) is unlocked.</Note>}
          <label className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--muted)" }}>
            <input type="checkbox" checked={!!skip.vehicle} onChange={(e) => setSkp("vehicle", e.target.checked)} />
            <SkipForward size={13} /> Skip this step for now (status stays “Ready to dispatch”)
          </label>
        </div>
      )}

      {/* Step 2 — container details */}
      {step === 2 && (
        <div className="stack">
          <Step n="2" title="Container details" hint="Filling the container & seal moves the invoice to “Ready to Ship”." />
          <div className="grid-2">
            <Field label="Container No."><Input value={ship.container || ""} onChange={(e) => setSh("container", e.target.value)} placeholder="e.g. OOCU0793142" /></Field>
            <Field label="Seal No."><Input value={ship.seal || ""} onChange={(e) => setSh("seal", e.target.value)} placeholder="e.g. IND-0054079" /></Field>
            <Field label="Marks & Nos"><Input value={ship.marks || ""} onChange={(e) => setSh("marks", e.target.value)} placeholder="GDW 2001-2421" /></Field>
            <Field label="No & kinds of pkgs"><Input value={ship.pkgs || ""} onChange={(e) => setSh("pkgs", e.target.value)} placeholder="421 PACKAGES" /></Field>
            <Field label="Nett wt (kg)"><Input type="number" value={ship.netWt || ""} onChange={(e) => setSh("netWt", e.target.value)} /></Field>
            <Field label="Gross wt (kg)"><Input type="number" value={ship.grossWt || ""} onChange={(e) => setSh("grossWt", e.target.value)} /></Field>
          </div>
          <label className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--muted)" }}>
            <input type="checkbox" checked={!!skip.container} onChange={(e) => setSkp("container", e.target.checked)} />
            <SkipForward size={13} /> Skip this step for now
          </label>
        </div>
      )}

      {/* Step 3 — BL / shipping details */}
      {step === 3 && (
        <div className="stack">
          <Step n="3" title="BL & shipping details" hint="BL number, date and vessel mark the invoice “Shipped”." />
          <div className="grid-2">
            <Field label="BL No."><Input value={ship.blNo || ""} onChange={(e) => setSh("blNo", e.target.value)} placeholder="e.g. SFPM2605165498" /></Field>
            <Field label="BL Date"><Input type="date" value={ship.blDate || ""} onChange={(e) => setSh("blDate", e.target.value)} /></Field>
            <Field label="Ship name (vessel / voyage)"><Input value={ship.vessel || ""} onChange={(e) => setSh("vessel", e.target.value)} placeholder="CAPE SYROS 092E" /></Field>
            <Field label="Port of discharge"><Input value={ship.pod || ""} onChange={(e) => setSh("pod", e.target.value)} placeholder="FREMANTLE" /></Field>
            <Field label="Terms (FOB etc.)"><Input value={ship.terms || ""} onChange={(e) => setSh("terms", e.target.value)} placeholder="FOB MUMBAI" /></Field>
            <Field label="Exchange rate ₹/$"><Input type="number" value={ship.exRate || ""} onChange={(e) => setSh("exRate", e.target.value)} /></Field>
          </div>
          <label className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--muted)" }}>
            <input type="checkbox" checked={!!skip.ship} onChange={(e) => setSkp("ship", e.target.checked)} />
            <SkipForward size={13} /> Skip this step for now
          </label>
          <Note tone="teal">Once all three steps are filled or skipped, the invoice status becomes <b>Shipped</b> and every downstream document is populated.</Note>
        </div>
      )}
    </Modal>
  );
}
