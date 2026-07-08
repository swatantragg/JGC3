# Jaikvin Global · Export System — v2 prototype

UI/UX rebuild of `../prototype` (v1.2). **Same engine, same numbers, same 40 documents** — only the interface changed.

```bash
npm install
npm run dev
```

## What changed, and why

| v1.2 | v2 | Reason |
|---|---|---|
| 9 top-nav items | 6 horizontal nav tabs + Setup | Fewer doors to choose between |
| "Masters", "Stage A–F", "FIFO", "2A / 7A" | "Setup", numbered steps, "oldest order first", saved views | Nothing to look up before you can work |
| Buyer order + Orders (2 pages) | **Orders** (one page, guided sheet to add) | One place per question |
| Packing & FIFO + Invoice (duplicate invoice lists) | **Packing** → **Shipments** | Each invoice has one home |
| History (own page) | Shipments → *Shipped history* | Same data, fewer pages |
| Masters → Items / Buyers data / Supplier data | Setup → Items, with **Essentials / Buyer sheet / Supplier sheet / All fields** views | The 2A and 7A sheets are views of one table, not separate tabs |
| 25-column table by default | **Simple** by default, **Full sheet** one click away | Exports always contain every column |
| No guidance | Workflow rail, "Do this next", `?` tooltips, toasts, empty states | Learning curve, not a manual |
| — | ⌘K palette, hash routing, required-field flags | Speed for the second week onwards |

## Structure

```
src/
  App.jsx           shell · horizontal nav · subbar · ⌘K palette · toasts · #/routing
  Rail.jsx          the 4-step workflow rail (Order → Pack → Ship → Documents)
  store.jsx         one React context: items, buyers, suppliers, orders, invoices
  data.js           seed data + all business logic (copied 1:1 from v1.2)
  docs.js           the 40-document engine (untouched)
  ui.jsx            design-system atoms: Btn, Card, DataTable, Modal, Drawer, …
  index.css         design tokens; light + dark
  InvoiceModal.jsx  one invoice, buyer (USD) and supplier (INR) views
  pages/            Home, Orders, Packing, Shipments, Documents, Reports, Setup
```

## Behaviour preserved

Every v1.2 capability still works: item/buyer/supplier masters with inline edit, the draggable column manager
and custom columns, buyer-order entry by supplier, the 2A buyer master and 7A supplier master with CSV export,
FIFO allocation and its live projection while typing, packing invoices, shipment details, proforma (17) /
custom invoice (18) / supplier-sheet exports, balance reports 36–39 with editable remarks and Excel export,
all 40 documents with live preview, per-stage and whole-set download, and the light/dark theme toggle.

## Verified

Built and driven headlessly end to end — record packing (FIFO projected `6 still pending · PO 03455` correctly),
invoice created, shipment modal flagged exactly the 4 unlocking fields, saving flipped the invoice to
*ready to ship*, and Documents picked up the new invoice and rendered doc 18. No console errors on any page,
in either theme.
