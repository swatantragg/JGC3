import { useState } from "react";
import { Layers, Globe, Truck, Route, Users as UsersIcon, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Field, Input, Select, Pill, Mono, EditBtn, Empty, Note, Step,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useIsMobile } from "../../lib/useIsMobile.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import {
  useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier,
  useBuyers, useCreateBuyer, useUpdateBuyer, useDeleteBuyer,
  useTransports, useCreateTransport, useUpdateTransport, useDeleteTransport,
  useItemGroups, useUsers,
} from "../../api/hooks.js";
import { EMPTY_SUPPLIER } from "../../lib/constants.js";
import UsersPanel from "./UsersPanel.jsx";
import ItemsPanel from "./ItemsPanel.jsx";
import RecordModal from "./RecordModal.jsx";

/* Setup — everything you configure once and rarely touch again.

   Items get their own panel (a few hundred rows need finding before editing);
   buyers, suppliers and transports are short lists, so each is a list beside
   the form that adds to it. */

/* A list of what is already saved, and the form that adds to it.

   On a desktop the two sit side by side, which is what makes adding five
   suppliers in a row quick. A phone has no room for both, so the form becomes
   an "Add" button at the top of the list and opens as a dialog — the saved
   records stay the first thing on screen either way. */
function PartyPanel({ title, icon, count, children, form, mobile, addLabel, onAdd }) {
  if (mobile) {
    return (
      <Card>
        <CardHead icon={icon} title={`${count} ${title}`}>
          <Btn size="sm" icon={Plus} onClick={onAdd}>{addLabel}</Btn>
        </CardHead>
        <div>{children}</div>
      </Card>
    );
  }
  return (
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)" }}>
      <Card>
        <CardHead icon={icon} title={`${count} ${title}`} />
        <div>{children}</div>
      </Card>
      <Card pad>{form}</Card>
    </div>
  );
}

const SUPPLIER_SCHEMA = [
  { key: "code", label: "Code *" }, { key: "name", label: "Name *", span: 2 },
  { key: "gstin", label: "GSTIN" },
  { key: "addr", label: "Address", type: "textarea", span: 2 },
  { key: "place", label: "Place" }, { key: "pin", label: "PIN code" }, { key: "state", label: "State" },
  {
    key: "your_reference", label: "Your reference", span: 2,
    hint: "The supplier's own reference for our orders — prints under the shipping marks on their purchase order.",
  },
  {
    key: "weights", label: "Weights", type: "select", allowEmpty: false,
    options: [{ value: "auto", label: "Auto" }, { value: "manual", label: "Manual" }],
    hint: "Whether this supplier's box weights are worked out or entered by hand",
  },
];
const BUYER_SCHEMA = [
  { key: "name", label: "Buyer name *", span: 2 }, { key: "brand", label: "Trading as (brand)", span: 2 },
  { key: "addr", label: "Address", type: "textarea", span: 4 },
  { key: "country", label: "Country" }, { key: "ship_to", label: "Ship to (port)" },
  { key: "curr", label: "Currency" }, { key: "order_no", label: "Buyer order no." },
  {
    key: "our_reference", label: "Our reference", span: 2,
    hint: "Our own file reference for this buyer — prints under the shipping marks on the supplier purchase order.",
  },
];

// The add forms start from the same blanks the edit modals save back to, so a
// field can never exist in one and be missing from the other.
const BLANK_SUPPLIER = { code: "", name: "", place: "", gstin: "", addr: "", pin: "", state: "", your_reference: "" };
const BLANK_BUYER = { name: "", brand: "", country: "", curr: "USD", ship_to: "", addr: "", order_no: "", our_reference: "" };
const BLANK_TRANSPORT = { name: "", transport_id: "", supplier_ids: [] };

export default function SetupPage() {
  const { isAdmin, has } = useAuth();
  const toast = useToast();
  const canItems = has("setup.items");
  const canParties = has("setup.parties");
  const [tab, setTab] = useState(canItems ? "items" : canParties ? "buyers" : "users");
  const [editing, setEditing] = useState(null);
  // On a phone the add form is a dialog rather than a column beside the list.
  const [creating, setCreating] = useState(null);
  const [failed, setFailed] = useState("");
  const mobile = useIsMobile();

  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const transports = useTransports().data || [];
  const groups = useItemGroups().data || [];
  const users = useUsers(isAdmin).data || [];
  const itemCount = groups.reduce((s, g) => s + g.count, 0);

  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const supOpts = suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));

  const createSupplier = useCreateSupplier(); const updateSupplier = useUpdateSupplier(); const delSupplier = useDeleteSupplier();
  const createBuyer = useCreateBuyer(); const updateBuyer = useUpdateBuyer(); const delBuyer = useDeleteBuyer();
  const createTransport = useCreateTransport(); const updateTransport = useUpdateTransport(); const delTransport = useDeleteTransport();

  const [sDraft, setSDraft] = useState(BLANK_SUPPLIER);
  const [bDraft, setBDraft] = useState(BLANK_BUYER);
  const [tDraft, setTDraft] = useState(BLANK_TRANSPORT);

  const TRANSPORT_SCHEMA = [
    { key: "name", label: "Transport name *", span: 2 },
    { key: "transport_id", label: "Transport ID (GSTIN)", span: 2 },
    {
      key: "supplier_ids", label: "Suppliers served", type: "multiselect", options: supOpts, span: 4,
      hint: "A carrier may collect from more than one supplier — pick every one it serves.",
    },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Setup</h2>
      </div>

      <Seg options={[
        ...(canItems ? [["items", `Items · ${itemCount}`, Layers]] : []),
        ...(canParties ? [["buyers", `Buyers · ${buyers.length}`, Globe], ["suppliers", `Suppliers · ${suppliers.length}`, Truck], ["transports", `Transport · ${transports.length}`, Route]] : []),
        ...(isAdmin ? [["users", `Users · ${users.length}`, UsersIcon]] : []),
      ]} value={tab} onChange={setTab} />

      {failed && <Note tone="amber" icon={AlertTriangle}>{failed}</Note>}

      {tab === "items" && canItems && <ItemsPanel />}

      {/* ---------------- BUYERS ---------------- */}
      {tab === "buyers" && (
        <PartyPanel title={`buyer${buyers.length === 1 ? "" : "s"}`} icon={Globe} count={buyers.length}
          mobile={mobile} addLabel="Add buyer" onAdd={() => setCreating({ type: "buyer" })}
          form={<>
            <div style={{ marginBottom: 14 }}><Step n="+" title="Add a buyer" hint="Nothing technical — it is just a form." /></div>
            <div className="stack-sm">
              <Field label="Buyer name"><Input value={bDraft.name} onChange={(e) => setBDraft({ ...bDraft, name: e.target.value })} placeholder="e.g. Aqua Distributors Ltd" /></Field>
              <Field label="Trading as (brand)"><Input value={bDraft.brand} onChange={(e) => setBDraft({ ...bDraft, brand: e.target.value })} placeholder="e.g. AquaMark" /></Field>
              <div className="grid-2">
                <Field label="Country"><Input value={bDraft.country} onChange={(e) => setBDraft({ ...bDraft, country: e.target.value })} placeholder="e.g. Australia" /></Field>
                <Field label="Currency"><Input value={bDraft.curr} onChange={(e) => setBDraft({ ...bDraft, curr: e.target.value })} /></Field>
              </div>
              <Field label="Ship to (port)"><Input value={bDraft.ship_to} onChange={(e) => setBDraft({ ...bDraft, ship_to: e.target.value })} placeholder="e.g. Fremantle" /></Field>
              <Field label="Address" hint="Prints as the consignee on the proforma, the customs invoice and the BL annexure.">
                <textarea className="input" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }}
                  value={bDraft.addr} onChange={(e) => setBDraft({ ...bDraft, addr: e.target.value })}
                  placeholder="e.g. 13, Tesla Link, Wangara WA 6065" />
              </Field>
              <Field label="Buyer order no."><Input value={bDraft.order_no} onChange={(e) => setBDraft({ ...bDraft, order_no: e.target.value })} placeholder="e.g. JG/26-P/09" /></Field>
              <Field label="Our reference" hint="Our own file reference for this buyer. It prints under the shipping marks on the supplier purchase order and carries into the Excel exports.">
                <Input value={bDraft.our_reference} onChange={(e) => setBDraft({ ...bDraft, our_reference: e.target.value })} placeholder="e.g. JG/EXP/26-27/AU" />
              </Field>
              <div>
                <Btn icon={Plus} disabled={!bDraft.name || createBuyer.isPending} onClick={() => createBuyer.mutate(
                  bDraft,
                  { onSuccess: () => { toast(`Buyer ${bDraft.name} added`); setBDraft(BLANK_BUYER); } },
                )}>Add buyer</Btn>
              </div>
            </div>
          </>}>
          {buyers.length ? buyers.map((b, i) => (
            <div key={b.id} style={{ padding: "14px 16px", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "var(--ink)", fontWeight: 650, fontSize: 14 }}>{b.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Trading as {b.brand || "—"}</div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <EditBtn onClick={() => setEditing({ type: "buyer", value: b })} />
                  <button className="icon-btn bare" title="Delete buyer"
                    onClick={() => delBuyer.mutate(b.id, { onError: (e) => setFailed(e.message), onSuccess: () => toast(`Buyer ${b.name} removed`) })}><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="grid-3" style={{ marginTop: 12, gap: 12 }}>
                {[["Country", b.country], ["Currency", b.curr], ["Ship to", b.ship_to], ["Address", b.addr], ["Order no.", b.order_no], ["Our reference", b.our_reference]].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10.5, color: "var(--faint)" }}>{k}</div><div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 500 }}>{v || "—"}</div></div>
                ))}
              </div>
            </div>
          )) : <Empty icon={Globe} title="No buyers yet">Add your first buyer with the form beside this list.</Empty>}
        </PartyPanel>
      )}

      {/* ---------------- SUPPLIERS ---------------- */}
      {tab === "suppliers" && (
        <PartyPanel title="suppliers" icon={Truck} count={suppliers.length}
          mobile={mobile} addLabel="Add supplier" onAdd={() => setCreating({ type: "supplier" })}
          form={<>
            <div style={{ marginBottom: 14 }}><Step n="+" title="Add a supplier" hint="Name, GSTIN and address print on the supplier PO and the e-way bill." /></div>
            <div className="stack-sm">
              <Field label="Supplier name"><Input value={sDraft.name} onChange={(e) => setSDraft({ ...sDraft, name: e.target.value })} placeholder="e.g. Anand Polymers" /></Field>
              <div className="grid-2">
                <Field label="Code"><Input value={sDraft.code} onChange={(e) => setSDraft({ ...sDraft, code: e.target.value })} placeholder="e.g. AP" /></Field>
                <Field label="GSTIN"><Input value={sDraft.gstin} onChange={(e) => setSDraft({ ...sDraft, gstin: e.target.value })} placeholder="e.g. 27AAEFK9877D1ZX" /></Field>
              </div>
              <Field label="Address" hint="Prints on the supplier PO, the e-way bill and the supplier-details sheet.">
                <textarea className="input" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }}
                  value={sDraft.addr} onChange={(e) => setSDraft({ ...sDraft, addr: e.target.value })}
                  placeholder="e.g. Gala No 5, 1st Floor, Meenakshi Industrial Estate-2" />
              </Field>
              <div className="grid-3">
                <Field label="Place"><Input value={sDraft.place} onChange={(e) => setSDraft({ ...sDraft, place: e.target.value })} placeholder="e.g. Daman" /></Field>
                <Field label="PIN code"><Input value={sDraft.pin} onChange={(e) => setSDraft({ ...sDraft, pin: e.target.value })} placeholder="e.g. 396210" /></Field>
                <Field label="State"><Input value={sDraft.state} onChange={(e) => setSDraft({ ...sDraft, state: e.target.value })} placeholder="e.g. Maharashtra" /></Field>
              </div>
              <Field label="Your reference" hint="The supplier's own reference for our orders. It prints under the shipping marks on their purchase order and carries into the Excel exports.">
                <Input value={sDraft.your_reference} onChange={(e) => setSDraft({ ...sDraft, your_reference: e.target.value })} placeholder="e.g. KP/JG/2026-27" />
              </Field>
              <div>
                <Btn icon={Plus} disabled={!sDraft.name || createSupplier.isPending} onClick={() => createSupplier.mutate(
                  { ...EMPTY_SUPPLIER, ...sDraft, code: sDraft.code || sDraft.name.slice(0, 2).toUpperCase() },
                  { onSuccess: () => { toast(`Supplier ${sDraft.name} added`); setSDraft(BLANK_SUPPLIER); } },
                )}>Add supplier</Btn>
              </div>
            </div>
          </>}>
          {suppliers.length ? suppliers.map((s, i) => (
            <div key={s.id} className="row" style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 7 }}>
                  <span style={{ color: "var(--ink)", fontWeight: 650, fontSize: 13.5 }}>{s.name}</span>
                  <Pill>{s.code}</Pill>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{s.place || "—"} · <Mono>{s.gstin || "—"}</Mono></div>
                {s.addr && <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{s.addr} {s.pin} {s.state}</div>}
                {s.your_reference && <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>Your reference: <span style={{ color: "var(--ink-2)" }}>{s.your_reference}</span></div>}
              </div>
              <div className="row" style={{ gap: 8 }}>
                {s.weights === "manual" && <Pill tone="amber">weights manual</Pill>}
                <EditBtn onClick={() => setEditing({ type: "supplier", value: s })} />
                <button className="icon-btn bare" title="Delete supplier"
                  onClick={() => delSupplier.mutate(s.id, { onError: (e) => setFailed(e.message), onSuccess: () => toast(`Supplier ${s.name} removed`) })}><Trash2 size={14} /></button>
              </div>
            </div>
          )) : <Empty icon={Truck} title="No suppliers yet">Add one here, or load the master workbook under Items.</Empty>}
        </PartyPanel>
      )}

      {/* ---------------- TRANSPORT ---------------- */}
      {tab === "transports" && (
        <PartyPanel title={`transport${transports.length === 1 ? "" : "s"}`} icon={Route} count={transports.length}
          mobile={mobile} addLabel="Add transport" onAdd={() => setCreating({ type: "transport" })}
          form={<>
            <div style={{ marginBottom: 14 }}><Step n="+" title="Add a transport" hint="You pick this carrier when filling a shipment's vehicle details." /></div>
            <div className="stack-sm">
              <Field label="Transport name"><Input value={tDraft.name} onChange={(e) => setTDraft({ ...tDraft, name: e.target.value })} placeholder="e.g. SUHANI TRANSPORT" /></Field>
              <Field label="Transport ID (GSTIN)"><Input value={tDraft.transport_id} onChange={(e) => setTDraft({ ...tDraft, transport_id: e.target.value })} placeholder="e.g. 27AZUPK5958Q1Z0" /></Field>
              <Field label="Suppliers served" hint="A carrier may collect from more than one supplier.">
                <div className="row wrap" style={{ gap: 6, padding: "4px 0" }}>
                  {supOpts.map((o) => {
                    const on = tDraft.supplier_ids.includes(o.value);
                    return (
                      <button key={o.value} type="button" className={`pill${on ? " pill-teal" : ""}`}
                        style={{ cursor: "pointer", border: "1px solid var(--line)" }}
                        onClick={() => setTDraft((p) => ({
                          ...p,
                          supplier_ids: on ? p.supplier_ids.filter((x) => x !== o.value) : [...p.supplier_ids, o.value],
                        }))}>
                        {on ? "✓ " : ""}{o.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div>
                <Btn icon={Plus} disabled={!tDraft.name || createTransport.isPending} onClick={() => createTransport.mutate(
                  tDraft,
                  { onSuccess: () => { toast(`Transport ${tDraft.name} added`); setTDraft(BLANK_TRANSPORT); } },
                )}>Add transport</Btn>
              </div>
            </div>
          </>}>
          {transports.length ? transports.map((t, i) => {
            const ids = t.supplier_ids?.length ? t.supplier_ids : (t.supplier_id ? [t.supplier_id] : []);
            return (
              <div key={t.id} className="row" style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--border)" : "none", justifyContent: "space-between" }}>
                <div>
                  <div className="row" style={{ gap: 7 }}>
                    <span style={{ color: "var(--ink)", fontWeight: 650, fontSize: 13.5 }}>{t.name}</span>
                    <Pill><Mono>{t.transport_id || "—"}</Mono></Pill>
                  </div>
                  <div className="row wrap" style={{ gap: 4, marginTop: 4, fontSize: 11.5, color: "var(--faint)" }}>
                    Serves: {ids.length ? ids.map((id) => <Pill key={id}>{supCode(id)}</Pill>) : "—"}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <EditBtn onClick={() => setEditing({ type: "transport", value: t })} />
                  <button className="icon-btn bare" title="Delete transport"
                    onClick={() => delTransport.mutate(t.id, { onError: (e) => setFailed(e.message), onSuccess: () => toast(`Transport ${t.name} removed`) })}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          }) : <Empty icon={Route} title="No transports yet">Add carriers and link each to the suppliers it serves.</Empty>}
        </PartyPanel>
      )}

      {tab === "users" && isAdmin && <UsersPanel />}

      {creating?.type === "buyer" && (
        <RecordModal title="Add a buyer" cols={4} schema={BUYER_SCHEMA} value={BLANK_BUYER}
          saving={createBuyer.isPending} onClose={() => setCreating(null)}
          onSave={(body) => createBuyer.mutate(body, {
            onError: (e) => setFailed(e.message),
            onSuccess: () => { toast(`Buyer ${body.name} added`); setCreating(null); },
          })} />
      )}
      {creating?.type === "supplier" && (
        <RecordModal title="Add a supplier" cols={4} schema={SUPPLIER_SCHEMA} value={{ ...EMPTY_SUPPLIER, ...BLANK_SUPPLIER }}
          saving={createSupplier.isPending} onClose={() => setCreating(null)}
          onSave={(body) => createSupplier.mutate(
            { ...body, code: body.code || (body.name || "").slice(0, 2).toUpperCase() },
            {
              onError: (e) => setFailed(e.message),
              onSuccess: () => { toast(`Supplier ${body.name} added`); setCreating(null); },
            },
          )} />
      )}
      {creating?.type === "transport" && (
        <RecordModal title="Add a transport" cols={4} schema={TRANSPORT_SCHEMA} value={BLANK_TRANSPORT}
          saving={createTransport.isPending} onClose={() => setCreating(null)}
          onSave={(body) => createTransport.mutate(body, {
            onError: (e) => setFailed(e.message),
            onSuccess: () => { toast(`Transport ${body.name} added`); setCreating(null); },
          })} />
      )}

      {editing?.type === "buyer" && (
        <RecordModal title={`Edit buyer · ${editing.value.name}`} cols={4} schema={BUYER_SCHEMA} value={editing.value}
          saving={updateBuyer.isPending} onClose={() => setEditing(null)}
          onSave={(body) => updateBuyer.mutate({ id: editing.value.id, body }, { onSuccess: () => { toast("Buyer updated"); setEditing(null); } })} />
      )}
      {editing?.type === "supplier" && (
        <RecordModal title={`Edit supplier · ${editing.value.name}`} cols={4} schema={SUPPLIER_SCHEMA} value={editing.value}
          saving={updateSupplier.isPending} onClose={() => setEditing(null)}
          onSave={(body) => updateSupplier.mutate({ id: editing.value.id, body }, { onSuccess: () => { toast("Supplier updated"); setEditing(null); } })} />
      )}
      {editing?.type === "transport" && (
        <RecordModal title={`Edit transport · ${editing.value.name}`} cols={4} schema={TRANSPORT_SCHEMA} value={editing.value}
          saving={updateTransport.isPending} onClose={() => setEditing(null)}
          onSave={(body) => updateTransport.mutate({ id: editing.value.id, body }, { onSuccess: () => { toast("Transport updated"); setEditing(null); } })} />
      )}
    </div>
  );
}
