import { useState } from "react";
import { Ship, Truck, Container, Check } from "lucide-react";
import { Modal, Btn, Field, Input, Select, Pill, Note } from "../../components/ui/index.jsx";
import { useSuppliers, useTransports, useInvoiceMutations } from "../../api/hooks.js";
import { INV_STATUS_TONE } from "../../lib/constants.js";

/* Edit a shipment through its three sections. The backend recomputes the
   status (Ready to dispatch → Dispatched → Ready to Ship → Shipped) on save. */
export default function ShipmentEditor({ inv, onClose }) {
  const suppliers = useSuppliers().data || [];
  const transports = useTransports().data || [];
  const { update } = useInvoiceMutations();

  const supIds = [...new Set(inv.lines.map((l) => l.supplier_id).filter(Boolean))];
  const supName = (id) => suppliers.find((s) => s.id === id)?.name || id;
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  const [vehicles, setVehicles] = useState(() => {
    const v = { ...(inv.vehicles || {}) };
    supIds.forEach((s) => {
      const ex = v[s] || {};
      const tid = ex.transportId || (inv.packing_transports || {})[s] || "";
      const t = transports.find((x) => x.id === tid);
      const sp = suppliers.find((x) => x.id === s);
      v[s] = { vehicleNo: ex.vehicleNo || "", transportId: tid, transportName: ex.transportName || t?.name || "", source: ex.source || sp?.place || "", dest: ex.dest || "Nhava Sheva" };
    });
    return v;
  });
  const [ship, setShip] = useState({ ...(inv.ship || {}) });

  const setVeh = (sid, k, val) => setVehicles((p) => ({ ...p, [sid]: { ...p[sid], [k]: val } }));
  const setSh = (k, val) => setShip((p) => ({ ...p, [k]: val }));
  const pickTransport = (sid, tid) => {
    const t = transports.find((x) => x.id === tid);
    setVehicles((p) => ({ ...p, [sid]: { ...p[sid], transportId: tid, transportName: t?.name || "" } }));
  };

  const save = () => update.mutate({ id: inv.id, body: { vehicles, ship } }, { onSuccess: onClose });

  return (
    <Modal title={`Shipment · ${inv.invoice_no}`} icon={Ship} onClose={onClose}
      footer={<>
        <span className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--muted)" }}>Current status: <Pill tone={INV_STATUS_TONE[inv.status] || ""}>{inv.status}</Pill></span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={update.isPending} onClick={save}>{update.isPending ? "Saving…" : "Save"}</Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}><Truck size={16} style={{ color: "var(--teal)" }} /><b>Step 1 · Vehicle details (supplier-wise)</b></div>
          {supIds.map((sid) => {
            const opts = transports.filter((t) => t.supplier_id === sid);
            return (
              <div key={sid} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 10, background: "var(--surface-2)" }}>
                <div className="row" style={{ gap: 8, marginBottom: 10 }}><Pill tone="teal">{supCode(sid)}</Pill><b>{supName(sid)}</b></div>
                <div className="grid-2">
                  <Field label="Transporter"><Select value={vehicles[sid]?.transportId || ""} onChange={(e) => pickTransport(sid, e.target.value)}><option value="">— select —</option>{opts.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.transport_id}</option>)}</Select></Field>
                  <Field label="Vehicle number"><Input value={vehicles[sid]?.vehicleNo || ""} onChange={(e) => setVeh(sid, "vehicleNo", e.target.value)} /></Field>
                  <Field label="Source"><Input value={vehicles[sid]?.source || ""} onChange={(e) => setVeh(sid, "source", e.target.value)} /></Field>
                  <Field label="Destination"><Input value={vehicles[sid]?.dest || ""} onChange={(e) => setVeh(sid, "dest", e.target.value)} /></Field>
                </div>
              </div>
            );
          })}
        </section>

        <section>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}><Container size={16} style={{ color: "var(--teal)" }} /><b>Step 2 · Container details</b></div>
          <div className="grid-2">
            <Field label="Container No."><Input value={ship.container || ""} onChange={(e) => setSh("container", e.target.value)} /></Field>
            <Field label="Seal No."><Input value={ship.seal || ""} onChange={(e) => setSh("seal", e.target.value)} /></Field>
            <Field label="Marks & Nos"><Input value={ship.marks || ""} onChange={(e) => setSh("marks", e.target.value)} /></Field>
            <Field label="No & kinds of pkgs"><Input value={ship.pkgs || ""} onChange={(e) => setSh("pkgs", e.target.value)} /></Field>
            <Field label="Nett wt (kg)"><Input type="number" value={ship.netWt || ""} onChange={(e) => setSh("netWt", e.target.value)} /></Field>
            <Field label="Gross wt (kg)"><Input type="number" value={ship.grossWt || ""} onChange={(e) => setSh("grossWt", e.target.value)} /></Field>
          </div>
        </section>

        <section>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}><Ship size={16} style={{ color: "var(--teal)" }} /><b>Step 3 · BL & shipping</b></div>
          <div className="grid-2">
            <Field label="BL No."><Input value={ship.blNo || ""} onChange={(e) => setSh("blNo", e.target.value)} /></Field>
            <Field label="BL Date"><Input type="date" value={ship.blDate || ""} onChange={(e) => setSh("blDate", e.target.value)} /></Field>
            <Field label="Ship name (vessel)"><Input value={ship.vessel || ""} onChange={(e) => setSh("vessel", e.target.value)} /></Field>
            <Field label="Port of discharge"><Input value={ship.pod || ""} onChange={(e) => setSh("pod", e.target.value)} /></Field>
            <Field label="Terms (FOB etc.)"><Input value={ship.terms || ""} onChange={(e) => setSh("terms", e.target.value)} /></Field>
            <Field label="Exchange rate ₹/$"><Input type="number" value={ship.exRate || ""} onChange={(e) => setSh("exRate", e.target.value)} /></Field>
          </div>
          <div style={{ marginTop: 10 }}><Note tone="teal">Vehicle → Dispatched · Container → Ready to Ship · BL/vessel → Shipped. The status updates when you save.</Note></div>
        </section>
      </div>
    </Modal>
  );
}
