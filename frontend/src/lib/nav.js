/* Every view in the app, flat — drives the menu bar, the subbar title, the
   route table and the command palette.

   `perm` is a leaf permission (or an any-of list); access is granted when the
   user holds ANY of them, the same rule the API enforces, so a page you can
   see is a page whose endpoints you can call. Order matters: the first entry
   a user can reach becomes their landing page.

   The shape follows the client's own menu (Docs/Jaikvin Process/Menu Bar.xlsx):
   PO Reports sits under Purchase Orders; packing, shipment details and the
   suppliers' reports sit under Shipment. */
import {
  Home as HomeIcon, ClipboardList, PackageCheck, Ship, FileText, BarChart3,
  Settings2, FileSpreadsheet, Truck, FileCheck2,
} from "lucide-react";

export const VIEWS = [
  { id: "home", to: "/", label: "Dashboard", icon: HomeIcon, title: "Dashboard", crumb: "Overview", desc: "What needs doing today", perm: "home" },
  { id: "orders", to: "/orders", label: "Purchase Orders", icon: ClipboardList, title: "Purchase Orders", crumb: "Step 1", desc: "What the buyer asked for", perm: "orders.entry" },
  { id: "po-reports", to: "/po-reports", label: "PO Reports", icon: FileSpreadsheet, title: "PO Reports", crumb: "Purchase Orders", desc: "Barcode · packing · purchase · sales · suppliers' PO", group: "PO", perm: "orders.reports" },
  { id: "packing", to: "/packing", label: "Packing — FIFO", icon: PackageCheck, title: "Shipment", crumb: "Step 2", desc: "Pack supplier boxes onto an invoice — FIFO", perm: "shipment.packing" },
  { id: "shipments", to: "/shipments", label: "Shipment details", icon: Ship, title: "Shipment details", crumb: "Shipment", desc: "Invoices, containers, BL", perm: "shipment.details" },
  { id: "supplier-reports", to: "/supplier-reports", label: "Suppliers' Reports", icon: Truck, title: "Suppliers' Reports", crumb: "Shipment", desc: "Packing · purchase · sales · delivery instructions · e-way", group: "SUP", perm: "shipment.reports" },
  { id: "pre-shipment", to: "/pre-shipment", label: "Pre-Shipment Reports", icon: FileText, title: "Pre-Shipment Reports", crumb: "Reports", desc: "Everything customs needs before loading", group: "PRE", perm: "pre-shipment" },
  { id: "post-shipment", to: "/post-shipment", label: "Post Shipment Reports", icon: FileCheck2, title: "Post Shipment Reports", crumb: "Reports", desc: "Sent after the container sails", group: "POST", perm: "post-shipment" },
  { id: "reports", to: "/reports", label: "Other Reports", icon: BarChart3, title: "Other Reports", crumb: "Anytime", desc: "Balance registers & costing", perm: ["reports.balance", "reports.costing"] },
  { id: "documents", to: "/documents", label: "All Documents", icon: FileText, title: "Documents", crumb: "Library", desc: "All 40 export papers", perm: ["orders.reports", "shipment.reports", "pre-shipment", "post-shipment", "reports.balance"] },
  { id: "setup", to: "/setup", label: "Setup", icon: Settings2, title: "Setup", crumb: "Configure", desc: "Items, buyers, suppliers, users", perm: ["setup.items", "setup.parties"] },
];

export const V = Object.fromEntries(VIEWS.map((n) => [n.id, n]));

/* The menu bar. A `children` entry becomes a dropdown. */
export const MENU = [
  V["home"],
  { ...V["orders"], label: "Purchase Orders", children: [V["orders"], V["po-reports"]] },
  { ...V["packing"], id: "shipment-menu", to: V["packing"].to, label: "Shipment", icon: Ship, children: [V["packing"], V["shipments"], V["supplier-reports"]] },
  V["pre-shipment"],
  V["post-shipment"],
  V["reports"],
];

// Setup sits apart in the bar, after the separator.
export const SETUP = V["setup"];

export const ROUTE_PERMS = Object.fromEntries(VIEWS.map((n) => [n.to, n.perm]));
export const ROUTE_TITLES = Object.fromEntries(VIEWS.map((n) => [n.to, [n.crumb, n.title]]));

/* Where to send someone who lands on a page they cannot open. */
export function firstAllowedRoute(has) {
  return VIEWS.find((n) => has(n.perm))?.to || "/";
}
