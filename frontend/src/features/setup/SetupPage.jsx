import { useState } from "react";
import { Layers, Globe, Truck, Route, Users as UsersIcon } from "lucide-react";
import { Seg, Pill, Mono } from "../../components/ui/index.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import UsersPanel from "./UsersPanel.jsx";
import {
  useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier,
  useBuyers, useCreateBuyer, useUpdateBuyer, useDeleteBuyer,
  useItems, useCreateItem, useUpdateItem, useDeleteItem,
  useTransports, useCreateTransport, useUpdateTransport, useDeleteTransport,
} from "../../api/hooks.js";
import { UNIT_MODES, ITEM_GROUPS, EMPTY_ITEM } from "../../lib/constants.js";
import { inr, usd, num } from "../../lib/format.js";
import MasterPanel from "./MasterPanel.jsx";

const modeOpts = UNIT_MODES.map((m) => ({ value: m.value, label: m.label }));
const groupOpts = ITEM_GROUPS.map((g) => ({ value: g, label: g }));

export default function SetupPage() {
  const { isAdmin, has } = useAuth();
  const canItems = has("setup.items");
  const canParties = has("setup.parties");
  const [tab, setTab] = useState(canItems ? "items" : canParties ? "buyers" : "users");
  const suppliers = useSuppliers().data || [];
  const supOpts = suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  // ---- Schemas (field forms) ----
  const supplierSchema = [
    { key: "code", label: "Code *" }, { key: "name", label: "Name *" },
    { key: "place", label: "Place" }, { key: "gstin", label: "GSTIN" },
    { key: "weights", label: "Weights", type: "select", options: [{ value: "auto", label: "Auto" }, { value: "manual", label: "Manual" }] },
  ];
  const buyerSchema = [
    { key: "name", label: "Buyer name *" }, { key: "brand", label: "Trading as (brand)" },
    { key: "country", label: "Country" }, { key: "curr", label: "Currency" },
    { key: "ship_to", label: "Ship to (port)" }, { key: "order_no", label: "Buyer order no." },
    { key: "addr", label: "Address" },
  ];
  const itemSchema = [
    { key: "code", label: "Code *" }, { key: "gd", label: "GD code" }, { key: "oswin", label: "OSWIN code" }, { key: "gl", label: "GL code" },
    { key: "size", label: "Size (mm)" }, { key: "length", label: "Length (mm)" }, { key: "packing", label: "Packing (units/box) *", type: "number" },
    { key: "description", label: "Description" }, { key: "barcode", label: "Bar code" }, { key: "hsn", label: "HSN code" },
    { key: "volume", label: "Volume/box (m³)", type: "number" }, { key: "net_per_box", label: "Net/box (kg)", type: "number" }, { key: "gross_per_box", label: "Gross/box (kg)", type: "number" },
    { key: "bg_per_box", label: "Bg per box", type: "number" }, { key: "p_per_box", label: "P per box", type: "number" }, { key: "type_up", label: "Type UP", type: "number" },
    { key: "value_mode", label: "Value basis", type: "select", options: modeOpts, allowEmpty: false }, { key: "unit_value", label: "Unit value (₹)", type: "number" },
    { key: "fob_mode", label: "FOB basis", type: "select", options: modeOpts, allowEmpty: false }, { key: "unit_fob100", label: "Unit FOB ($)", type: "number" },
    { key: "group", label: "Group", type: "select", options: groupOpts, allowEmpty: false },
    { key: "supplier_id", label: "Supplier", type: "select", options: supOpts },
  ];
  const transportSchema = [
    { key: "name", label: "Transport name *" }, { key: "transport_id", label: "Transport ID" },
    { key: "supplier_id", label: "Supplier", type: "select", options: supOpts },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <h2 className="h1">Setup</h2>
        <p className="sub">
          Your single source of truth. Every item, buyer, supplier and transport is entered here — orders and documents downstream read from it.
          {isAdmin && <> Under <b>Users</b> you decide who sees which part of the system.</>}
        </p>
      </div>

      <Seg options={[
        ...(canItems ? [["items", "Items", Layers]] : []),
        ...(canParties ? [["buyers", "Buyers", Globe], ["suppliers", "Suppliers", Truck], ["transports", "Transport", Route]] : []),
        ...(isAdmin ? [["users", "Users", UsersIcon]] : []),
      ]} value={tab} onChange={setTab} />

      {tab === "users" && isAdmin && <UsersPanel />}

      {tab === "suppliers" && (
        <MasterPanel title="Suppliers" icon={Truck} schema={supplierSchema} blank={{ code: "", name: "", place: "", gstin: "", weights: "auto" }} cols={2}
          hooks={{ useList: useSuppliers, useCreate: useCreateSupplier, useUpdate: useUpdateSupplier, useRemove: useDeleteSupplier }}
          columns={[
            { key: "code", label: "Code", render: (r) => <Pill>{r.code}</Pill> },
            { key: "name", label: "Name", strong: true },
            { key: "place", label: "Place" },
            { key: "gstin", label: "GSTIN", render: (r) => <Mono>{r.gstin || "—"}</Mono> },
          ]}
          empty={{ title: "No suppliers yet", body: "Add your first supplier to begin." }} />
      )}

      {tab === "buyers" && (
        <MasterPanel title="Buyers" icon={Globe} schema={buyerSchema} blank={{ name: "", brand: "", country: "", curr: "USD", ship_to: "", addr: "", order_no: "" }} cols={2}
          hooks={{ useList: useBuyers, useCreate: useCreateBuyer, useUpdate: useUpdateBuyer, useRemove: useDeleteBuyer }}
          columns={[
            { key: "name", label: "Name", strong: true },
            { key: "brand", label: "Trading as" },
            { key: "country", label: "Country" },
            { key: "order_no", label: "Order no.", render: (r) => <Mono>{r.order_no || "—"}</Mono> },
          ]}
          empty={{ title: "No buyers yet", body: "Add your first buyer to begin." }} />
      )}

      {tab === "items" && (
        <MasterPanel title="Items" icon={Layers} schema={itemSchema} blank={EMPTY_ITEM} cols={4}
          hooks={{ useList: useItems, useCreate: useCreateItem, useUpdate: useUpdateItem, useRemove: useDeleteItem }}
          note="The value / FOB basis (per piece · per 100 · customize) sits before each price and groups the Proforma."
          columns={[
            { key: "gd", label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
            { key: "code", label: "Code", render: (r) => <Mono>{r.code}</Mono> },
            { key: "description", label: "Description", strong: true },
            { key: "packing", label: "Packing", align: "r", render: (r) => `${r.packing}/box` },
            { key: "unit_value", label: "Unit ₹", align: "r", render: (r) => inr(r.unit_value) },
            { key: "unit_fob100", label: "FOB $", align: "r", render: (r) => usd(r.unit_fob100) },
            { key: "supplier", label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
          ]}
          empty={{ title: "No items yet", body: "Add items — codes, packing, prices, barcodes." }} />
      )}

      {tab === "transports" && (
        <MasterPanel title="Transports" icon={Route} schema={transportSchema} blank={{ name: "", transport_id: "", supplier_id: "" }} cols={2}
          hooks={{ useList: useTransports, useCreate: useCreateTransport, useUpdate: useUpdateTransport, useRemove: useDeleteTransport }}
          note="Selected when filling a shipment's vehicle details, supplier-wise."
          columns={[
            { key: "name", label: "Transport", strong: true },
            { key: "transport_id", label: "Transport ID", render: (r) => <Mono>{r.transport_id || "—"}</Mono> },
            { key: "supplier", label: "Supplier", render: (r) => <Pill>{supCode(r.supplier_id)}</Pill> },
          ]}
          empty={{ title: "No transports yet", body: "Add carriers and link each to a supplier." }} />
      )}
    </div>
  );
}
