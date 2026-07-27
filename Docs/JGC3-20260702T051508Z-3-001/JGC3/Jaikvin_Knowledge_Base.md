# Jaikvin Global — Export Management System
## Complete Project Knowledge Base (AI Handoff Document)

> **How to use this file.** This is a self-contained brief for an AI (or a new developer) that
> has never seen the project. Read it top to bottom once. After that you should understand
> *what* the system does, *why* each piece exists, *how* the data flows, and *where* to make a
> change. Section 18 ("Implementing changes") tells you which part to touch for common requests.
> Plain English is used deliberately — the client and the project owner both work in plain
> English with concrete business examples, so this document does too.

**Document status:** Reflects the project as of late June 2026 (R1 prototype stage).
**Owner:** Swatantra (freelance developer, 4th project).
**This is reconstructed from project history.** Where a precise value lives in the prototype
source rather than here, it is called out explicitly (search for "lives in the prototype").

---

## Table of contents

1. Project at a glance
2. Who the parties are (business context)
3. The problem being solved
4. Core design principles
5. Domain glossary (read this — the whole project speaks in these terms)
6. The code-linking system (the single most important data concept)
7. Data model — masters
8. Data model — transactions
9. The two master files: 2A (buyer side) and 7A (supplier side)
10. The full document set — Stages A to F (40 documents)
11. The FIFO balance engine (the heart of the system)
12. Derivation formulas (exact maths the system runs)
13. What stays manual (by design)
14. The prototype — architecture and component map
15. Production architecture (the real build)
16. Brand / design system
17. Open assumptions awaiting client sign-off + known data inconsistencies
18. Implementing changes (where to touch what)
19. Project plan, revisions, payments
20. Conventions, gotchas and lessons learned

---

## 1. Project at a glance

A centralised, web-based **export management system** for **Jaikvin Global**, a merchant
exporter in Mumbai. It replaces a workflow of roughly **40 linked Excel/PDF files** per
shipment with one system where data is **entered once and every document, register and report
is generated automatically and stays consistent**.

- **One buyer:** Corecomp Pty Ltd, trading as **GD Watermark** (Australia).
- **Six suppliers:** Oswin, VP, HP/Hansa, KP/Kiran, Pushpam, Shree Poly — across Daman, Vapi,
  Silvassa.
- **Products:** plastic plumbing and irrigation goods.
- **The trade lane:** FOB Mumbai → Australia (Nhava Sheva → Fremantle on the studied shipment).

**Tech stack (settled):**
- Frontend: **Next.js** (React). The R1 prototype is a **single-file React JSX artifact** with
  in-memory state and realistic seed data.
- Backend: **Python**.
- Database: **Neon** (managed Postgres).
- Document generation: **openpyxl** (Excel) and **WeasyPrint** (PDF).
- Build/validation tooling used during prototype work: **esbuild** (JSX syntax check).

**Current stage:** R1 working prototype. The prototype is clickable and demo-ready; the full
product is built after prototype sign-off.

---

## 2. Who the parties are (business context)

**Jaikvin Global** is a *merchant exporter* — it does not manufacture. It buys finished goods
from Indian suppliers and exports them to one overseas buyer. So the system has a clean shape:
**buyer on one side, suppliers on the other, Jaikvin in the middle**, and the central job is
matching what the buyer ordered against what the suppliers actually packed and shipped.

**The buyer — GD Watermark (Corecomp Pty Ltd), Australia.** Sends purchase orders (e.g.
PO-03455). Each PO line is an item code + quantity + sale rate (USD). The buyer order is the
**trigger for everything downstream**.

**The six suppliers.** Each supplies certain items. Key supplier-specific facts:
- **Oswin** has its own item code column ("OSWIN CODE") that the supplier-side documents key on,
  and **Oswin's net & gross weights are entered manually** (the only supplier whose weights are
  not computed from the item master).
- Some items are **shared across two suppliers**, which needs special handling in allocation.

**Product groups (five):** PP Extruded, PP Moulded, PA/Nylon Moulded, Corrugated Boxes,
Adhesive Tapes. Sold under three GST rate buckets: **18%**, **9%+9%**, and **5%**.

**A real shipment used as the reference example throughout the work:**
- Invoice **JG/26-27/6002**
- Container **OOCU0793142**, vessel **CAPE SYROS 092E**
- Route **Nhava Sheva → Fremantle**
- **421 packages**, sale value **USD 20,421.90**
- Shipping marks **GDW 2001–2421**

---

## 3. The problem being solved

Today the same numbers are re-typed across ~40 linked files for every shipment. Consequences:
- **Figures drift apart** between documents (this is real — see §17 for actual examples found in
  the legacy files).
- **No single source of truth** — answering "how much of order 03455 is still pending?" means
  opening and cross-reading many workbooks.
- **The FIFO balance is maintained by hand**, which is the most error-prone task of all.

The pitch in one line:

> **Enter the buyer's order once. Record supplier packing once. The system produces every other
> document, keeps a running FIFO balance, and gives reports in Excel and PDF on demand.**

Roughly **80–90% of the data in the downstream document set is derivable** from the buyer order
plus the masters. For a normal item line the operator types only a **code and a quantity**; the
system derives boxes, weights, volume, barcode, HSN, both currency values, GST and packing.

---

## 4. Core design principles

1. **Enter once → derive everything → FIFO balance.** The guiding principle. Every downstream
   document is a *re-presentation* of a small amount of input combined with master records.
2. **Two masters drive everything: 2A (buyer side) and 7A (supplier side).** The balance
   registers (documents 36–39) are *derived* from these two.
3. **Historical immutability / snapshot pricing.** When a price (or any item field) is edited,
   the change applies to **future transactions only**. Past transactions keep their original
   values. This is implemented by having **each order carry a frozen snapshot of the item at the
   moment it is placed**. This is both correct accounting and a genuine selling point (price
   history never silently rewrites).
4. **Two document variants from one dataset.** Every shipment yields a **customs / INR variant**
   (e.g. Custom Invoice #18 uses HSN and INR) and a **buyer / USD variant** (e.g. Commercial
   Invoice #31 uses GDW codes and USD only). Both come from the same input, so they never drift.
5. **The client can add and modify masters.** Buyers, suppliers, items and rates are all
   editable in-app — this was an explicit client requirement.
6. **Plain-English, demo-ready, brand-styled output.** Client-facing screens and documents are
   polished and use the "Global Trade" identity (§16).

---

## 5. Domain glossary (read this)

The whole project speaks in these terms. An AI that doesn't know them will get lost.

**Codes that identify an item (all map to one physical product):**
- **GD code** — Jaikvin's primary internal item code (from "GD Watermark"). The buyer orders by
  this.
- **GL code** — a parallel item code.
- **OSWIN code** — supplier (Oswin) item code; the supplier-side docs key on this.
- **PH code / 90-series code** — the customs-friendly *numeric* codes used on customs documents.
- **HSN** — Harmonized System of Nomenclature code (tax/customs classification).
- **Bar code** — the printed barcode for the item.

**Master / file shorthand:**
- **2A** — the buyer-side master file (item rows + flags telling which downstream docs each item
  feeds). The "buyer-side brain."
- **7A** — the supplier-side master file; mirror of 2A with the OSWIN CODE column. The
  "supplier-side brain." (The client said 7A is ~90% of the data.)
- **Documents 1–40** — the numbered document set (see §10).
- **36 / 37 / 38 / 39** — the FIFO balance registers (supplier-wise, item-wise, supply details,
  boxes & volume).

**Export / trade terms:**
- **FIFO** — First In, First Out. Oldest buyer order is fulfilled first (§11).
- **IEC** — Import Export Code. **GSTIN** — GST identification number. **ABN** — Australian
  Business Number (the buyer's).
- **GSP** — Generalised System of Preferences (origin/tariff preference).
- **IRP / e-invoice** — Invoice Registration Portal; the GST e-invoice.
- **e-way bill** — GST goods-movement document (an **inward/purchase** leg and an
  **outward/export** leg).
- **VGM** — Verified Gross Mass (container weight declaration for shipping).
- **BL** — Bill of Lading. **CHA** — Customs House Agent.
- **RoDTEP** — Remission of Duties and Taxes on Exported Products (export incentive).
- **SCOMET** — Special Chemicals, Organisms, Materials, Equipment and Technologies (export
  control declaration).
- **SDF** — Statutory Declaration Form. **CWD** — Container Weight Declaration.
- **DO** — Delivery Order. **POL/POD** — Port of Loading / Port of Discharge.
- **FOB Mumbai** — Free On Board pricing term; sale value is FOB.
- **AMC** — Annual Maintenance Contract (post-deployment support).

**Packing / barcode terms (used in 7A maths):**
- **PACKING** — units per box.
- **BG / PC / TTL** — barcode-sticker counts. Current interpretation: **BG = units per box**,
  **PC = 1 (the carton itself)**, **TTL = BG + PC**. (Flagged as an assumption — see §17.)
- **Boxes** — quantity ÷ packing.
- **NT / TARE / VGM** — net weight / empty-container weight / verified gross mass.

---

## 6. The code-linking system (the single most important data concept)

Almost every document repeats the same identity columns for each item line. The system stores
them once per item and links them:

```
GD CODE  ↔  GL CODE  ↔  OSWIN CODE  ↔  PH / 90-series (customs)  ↔  Bar Code  ↔  HSN
```

- The **buyer** orders by **GD code**.
- The **supplier** documents key on **OSWIN code** (and GL).
- The **customs** documents use the **PH / 90-series numeric** codes and **HSN**.
- The **barcode** prints from the stored bar code value.

The system must **map one item across all these codes automatically**. Get this right and the
two document variants (customs vs buyer) fall out naturally: the customs variant shows HSN +
numeric codes + INR; the buyer variant shows GDW codes + USD.

**The shared "key" columns repeated on most document lines:**

> CODE · GD CODE · GL CODE · OSWIN CODE · Bar Codes · HSN · SIZE / Description ·
> PACKING (units per box) · QTY (pieces & boxes)

When §10 describes each document, it only notes what that document **adds** on top of these
shared key columns.

---

## 7. Data model — masters (set up once, edited rarely)

| Master | Holds |
|---|---|
| **Buyers** | name, address, ABN, currency, ship-to, contacts |
| **Suppliers** | name, address, GSTIN, district; the 6 suppliers (Oswin, VP, HP/Hansa, KP/Kiran, Pushpam, Shree Poly) |
| **Items** | all code mappings (GD ↔ GL ↔ OSWIN ↔ PH/90-series), group, size, length, packing, barcode, HSN, net & gross weight per box, volume per box, mould details |
| **Item groups** | PP Extruded, PP Moulded, PA/Nylon Moulded, Corrugated Boxes, Adhesive Tapes |
| **Rate cards** | purchase rate (INR) per supplier per item; sale rate (USD) per buyer per item |
| **Settings** | GST rates, FX rate (RBI ₹/$), CHA, shipping line, bank, weighbridge, declaration templates |

**Item master — full field list (what the system knows once an item is set up):**
- Description, size, length
- **Packing (units per box)** → boxes are *calculated*, not typed
- Barcode + labels-per-sheet logic
- HSN code
- GL code, OSWIN/supplier code, customs PH/90-series numeric code
- Net & gross weight per box, volume per box
- Purchase rate (INR) per supplier
- GST rate (one of: 18%, 9%+9%, 5%)
- Mould details (cavities, supplier, mfg date)
- Stickers/labels per box

The item master is what makes "type a code + quantity" enough.

---

## 8. Data model — transactions

Three layers sit on top of the masters:

**Layer 1 — Masters** (§7): set up once, edited rarely.

**Layer 2 — Transactions:**
- **Sales Orders (buyer POs)** — item + qty, dated as per the buyer's order.
- **Supplier POs** — allocation of a sales order across suppliers (splits one buyer order across
  the six suppliers).
- **Supplier Packing Receipts** — what each supplier actually packed and delivered (the GRN
  step), with supplier-wise box numbering. For Oswin, also the manual net/gross weights.
- **Shipments** — group receipts into a container/BL, attach invoice, vessel, VGM, BL.

**Layer 3 — Engine + Outputs:**
- **Allocation** — split a buyer order across suppliers.
- **FIFO balance engine** — the running pending-order register (§11).
- **Document generator** — produces all 40 documents in Excel and PDF, in both variants.

---

## 9. The two master files: 2A and 7A

These are the engine of the whole thing. Everything else is derived.

**2A — buyer-side master.**
- Sheets split by product family (e.g. PP, GRN).
- Holds item rows **plus master flags per column** — **PKG / PUR / SALE / BARCODE** — that say
  **which downstream documents each item feeds**. (i.e. a flag turns on whether an item appears
  in the Packing doc, Purchase doc, Sales doc, Barcode doc.)
- This is the **buyer-side brain**: ordered quantities and what each item should produce.

**7A — supplier-side master.**
- The supplier-side mirror of 2A, with the **OSWIN CODE** column and its own flags.
- Built on the **actually-received** quantity (after supplier packing), not the ordered quantity.
- The client said **7A is ~90% of the data**, so it is the most important screen to get right.
- 7A has **28 columns**. The exact column list and order **lives in the prototype** as the
  `SM7_HEAD` constant, with each row computed by `sm7Raw(group, rbi)`. By category, the 28
  columns cover: the shared key columns (CODE, GD, GL, OSWIN, barcode, HSN, size/description,
  packing), quantity in pieces and boxes, **continuous carton serial-number ranges** (§12),
  **BG / PC / TTL barcode-sticker counts** (§12), net & gross weight, volume, cost per piece
  (INR), the listed PO numbers (aggregated — see below), and the USD values derived from the
  day's RBI rate.

**7A behaviours that matter:**
- **PO aggregation.** Orders for the **same item** across multiple POs are collapsed into **one
  row**; every PO is listed together (e.g. "03320, 03455"); quantity is the **sum**. (Seed
  example: Oswin's elbow shows 3000 pcs across both POs.)
- **Multi-price aggregation caveat.** If one item spans POs placed at *different* prices, the 7A
  row currently uses the **most recent order's price** for cost. With consistent pricing this
  never shows; flag it if multi-price handling must differ.
- **Its own RBI rate input.** The 7A screen asks for the day's **₹ per $** right there (an amber
  highlighted input), used to derive the USD columns.

---

## 10. The full document set — Stages A to F (40 documents)

The system mirrors the client's own A–F process. For each document, only what it **adds** over
the shared key columns (§6) is noted. **Bold** = a primary output people care about most.

### Stage A — Buyer order in (the ordered quantity)
Trigger: the buyer sends a PO. The system validates codes against masters, lets the operator
allocate quantities to suppliers, and auto-generates this set:
- **1 — Buyers Order** (the PDF the buyer sends, e.g. PO-03455): one line per item, qty + sale
  rate. *The trigger for everything.*
- **2A — Master**: item rows + flags (PKG/PUR/SALE/BARCODE) per item. *Buyer-side brain.*
- **2 — Barcode**: barcode + labels-per-sheet calculation. *So labels print correctly.*
- **3 — Packing**: adds volume and net + gross weight (KGS) per box. *Pieces → boxes →
  weight/volume.*
- **4 — Purchase**: adds unit rate + total value in **INR**. *What Jaikvin pays suppliers.*
- **5 — Sales**: adds FOB per 100 pcs in **US$** + the RBI rate. *What the buyer pays.*
- **6 — Suppliers' PO**: export PO header + PP/GRN allocation. *Splits one buyer order across
  the six suppliers.*

### Stage B — Supplier packing received (FIFO deduction)
When suppliers actually pack and deliver, the system deducts from the pending order
first-in-first-out and assigns supplier-wise box numbers:
- **7A — Master**: supplier-side mirror of 2A with OSWIN CODE + flags. *Supplier-side brain.*
- **7 Packing · 8 Purchase · 9 Sales**: same as 3/4/5 but on the **actually-received** quantity.
- **10 — E-way (inward/purchase leg)**: the purchase-side e-way bill.
- **11A — DO** (Delivery Order) and **11 — Delivery Instructions**.

> Manual notes here: Oswin's net/gross weights are entered by hand; others compute. Some items
> are shared across two suppliers (special handling).

### Stage C — Pre-shipment documents (the big set)
Generated once the shipment header is confirmed (container, vessel, BL, VGM, CHA):
- **12 Boxes & Volume** · **13 Export Value Declaration** · **14 SCOMET** · **15 SDF** ·
  **16 RoDTEP** · **17 Proforma** · **18 Custom Invoice** (HSN/INR variant) · **19 Packing
  List** · **20 Packing List itemwise** (multi-PO, e.g. 03320, 03455, 03539…) · **21 Packaging
  Declaration** (AQIS timber-style) · **22 Letter to CHA** · **23 Supplier Details** (per-item
  supplier tax invoice + package count) · **24 BL Annexure** · **25 E-invoice** (GST
  e-invoice/IRP) · **26 Shipping Instructions** (POL Nhava Sheva → POD Fremantle, marks GDW
  2001–2421) · **27 VGM** (booking, container, NT + TARE = VGM) · **28 Cost Sheets** (per-supplier
  tabs: VP/HP/KP/Oswin/Pushpam) · **29 E-way (outward/export leg)**.

### Stage D — Post-shipment documents
Confirm final BL number and dispatch, then:
- **30 — Letter to Buyer**
- **31 — Commercial Invoice** — **USD only**, GDW codes — *the buyer variant.*
- **32 Packing · 33 Packaging Declaration · 34 CWD** (Container Weight Declaration).

### Stage E — Reports (on demand, any time) — where the FIFO engine pays off
- **35 — Costing**
- **36 — Balance, supplier-wise**
- **37 — Balance, item-wise**
- **38 — Supply Details** (item → supplier)
- **39 — Balance Boxes & Volume**
All exportable to Excel and PDF. The legacy versions of 36/37 held dozens of dated tabs going
back to **2021**; these collapse into a single live register the client can view at any date.

### Stage F — Banking
- **40 — Export Bill Regularisation** submission to the bank, pre-filled from the shipment.

---

## 11. The FIFO balance engine (the heart of the system)

The balance files (36, 37, 38, 39) are derived from 2A and 7A. They list every product and run
first-in-first-out.

**Worked example (the client's own scenario):**
- 11 March — buyer orders **10 boxes** of Product A
- 15 March — buyer orders another **20 boxes** of Product A
- A shipment goes out with **21 boxes** of Product A

The engine consumes the **oldest order first**:
1. Clears all **10** from the 11 March order, then
2. Takes **11** from the 15 March order,
3. Leaving **9 boxes** still pending against the 15 March order.

**Implementation shape — a ledger per item:**
- Every **buyer order** is a **"+" entry** with its date.
- Every **shipment** is a **"−" entry**.
- The **balance report walks the entries oldest-first** and shows what remains against each
  order.

This removes the most error-prone manual task entirely: the operator never recalculates a
balance by hand, and the historical dated snapshots become a **single live register** queryable
at any date.

> In the prototype, this is the `computeLedger(buyerMaster, receipts, items)` function, consumed
> by the Packing & FIFO screen. To change FIFO behaviour, change this function.

---

## 12. Derivation formulas (exact maths the system runs)

These are the calculations that turn "code + quantity" into a full document. The prototype
documents them in on-screen "formulas panels" so the logic is changeable in one place.

**Boxes**
```
boxes = quantity (pieces) ÷ packing (units per box)
```

**Weights (non-Oswin items, computed)**
```
net weight   = boxes × net weight per box   (from item master)
gross weight = boxes × gross weight per box  (from item master)
```
Oswin's net/gross weights are entered manually instead.

**Total volume** *(IMPLEMENTED — but flagged, see §17)*
```
total volume = boxes × volume per box
```
> The original spec wrote "Box Quantity ÷ volume per box", but division gives the wrong unit, so
> the implementation uses multiplication. **Confirm with client.**

**Barcode stickers (BG / PC / TTL)** *(IMPLEMENTED — but flagged, see §17)*
```
BG  = units per box           (a barcode on every piece)
PC  = 1                        (one barcode on the carton)
TTL = BG + PC
stickers = boxes × TTL × 1.05  (the ×1.05 is a 5% spare allowance)
sheets   = RoundUp(stickers ÷ 125)   (125 labels per sheet)
```
> Alternative reading: BG/PC are the small per-box label numbers (1 and 2). **Confirm with
> client** which interpretation is correct.

**Serial numbers (carton ranges in 7A)** *(IMPLEMENTED — but flagged, see §17)*
- Continuous carton ranges sized **exactly to the box count**, cumulative across the date:
```
item 1: 001–015   (15 boxes)
item 2: 016–…     (continues from where item 1 ended)
…
```
> The spec's own example (10 boxes → 01–15; next 10 → 16–26) doesn't add up evenly. The
> implementation sizes each range exactly to box count (10 boxes → 001–010, next → 011–020). If
> a fixed buffer per carton is intended (e.g. +5), the client must state the rule.

**Currency**
```
Purchase value (INR) = boxes/qty × purchase rate (INR)        → documents 4, 8
Sale value (USD)     = FOB per 100 pcs × (qty ÷ 100)          → documents 5, 9, 31
USD columns in 7A are derived using the day's RBI ₹/$ rate (entered on the 7A screen).
```

**PO aggregation (7A)**
```
For each item: sum quantities across all its POs; list the PO numbers together;
collapse to a single row.
```

**Labels per sheet** — used by document 2 (Barcode): see the stickers/sheets formula above
(125 per sheet).

---

## 13. What stays manual (by design)

These are **not** automated, deliberately, because they need a human or external input:
- **Oswin's net & gross weights** — entered manually (other suppliers' weights compute from the
  item master).
- **Supplier packing-receipt quantities** — what was actually packed must be recorded as it
  arrives.
- **Signatures / signed-vs-unsigned document handling** — the system tracks document status and
  stores both versions.
- **External reference numbers from third parties** — BL number, e-way bill number, weighbridge
  slip number.

Everything else is generated.

**Before vs after (the value story):**

| Task | Today | With the system |
|---|---|---|
| Re-typing item data across documents | Repeated in 10+ files per shipment | Entered once in item master |
| Calculating boxes, weights, volume | Manual per document | Auto-calculated |
| Currency / GST values | Manual, per document | Auto (FX + GST rate from master) |
| Order balance (FIFO) | Manual, error-prone | Live register |
| Producing 40 documents | Manual copy-build each | One click, Excel + PDF |
| Two document variants (customs vs buyer) | Two separate manual builds | Both from one dataset |
| "What's pending / what shipped?" | Open many workbooks | One screen / one report |
| Consistency between documents | Frequent drift | Guaranteed — one source of truth |

---

## 14. The prototype — architecture and component map

**What it is:** a **single-file React JSX artifact** (`Jaikvin_Prototype.jsx`) with **in-memory
state** (`useState`) and **realistic seed data**. No backend, no persistence — it is a clickable
demo to validate the workflow and screens with the client before the real build. (Note: artifact
storage APIs / localStorage are *not* used; state is in-memory for the session.)

**Top-level shape:**
- **Navigation:** a **horizontal top bar** (solid Harbor Navy, subtle shadow, **pill-style
  active indicators**). It started as a vertical sidebar and was changed to top nav.
  > Gotcha already hit: a `backdrop-filter: blur` on the sticky nav **swallowed click events**
  > (the compositing layer ate the clicks) and was removed. **Do not reintroduce backdrop-filter
  > on the sticky nav.**
- **Icons:** `lucide-react` (LayoutDashboard, Database, ClipboardList, PackageCheck, BarChart3,
  FileText, Ship, Plus, Boxes, Building2, Anchor, Package, Layers, Truck, Globe, ListOrdered,
  History, Download, Pencil, X, etc.).
- **Styling:** Tailwind utility classes inline **plus** inline `style={{}}` objects driven by a
  central color object `C` (see §16). Fonts: `FONT` = Inter stack, `MONO` = monospace stack for
  codes.
- **Formatting helpers:** `inr(n)` → "₹…", `usd(n)` / `usdp(n)` → "$…", a date helper
  (`dmy`/`dmy()`), all near the top of the file.
- **Shared UI components:** `Card`, `Btn` (with `kind` like "teal"/"amber" and an `icon` prop),
  `Field` (label + input), `Code` (mono code chip), `Pill`, `Eyebrow` (small caps section
  label).

**Screens / sections (the building blocks an AI will edit):**

1. **Items master** — the full item table showing every constant field (GD code, OSWIN code, GL
   code, size, length, packing, barcode, HSN, net/gross weight, stickers/box, pricing, supplier),
   a **supplier filter dropdown**, and a **formulas panel** documenting all post-order
   calculations. Has a **pencil-edit modal**.

2. **Buyer master** — includes an **Add Buyer form** (the client can add buyers). Pencil-edit
   modal.

3. **Buyer Order screen** — entry for new buyer orders; filtered to show **only today's
   additions** (past orders live in the Orders tab).

4. **Orders** — three tabs:
   - **Supplier (7A)** — the full **7A supplier master**: pick a supplier, a date range, and the
     day's **₹/$ RBI rate** (asked right there), and it builds the whole sheet with **all 28
     columns** and a **CSV download**. Implements PO aggregation, continuous carton serial
     ranges, and BG/PC/TTL sticker maths. Backed by `SupplierMaster7A` (rows component),
     `SM7_HEAD` (column headers), `sm7Raw(group, rbi)` (row builder), and a
     `SupplierFormulasPanel`.
   - **By PO** — master-detail layout showing **all POs** with full buyer-master line detail and
     **summary tiles per PO**.
   - (Orders history / today split as above.)

5. **Packing & FIFO** — records what each supplier packed (codes + quantities; Oswin also manual
   weights), deducts from the pending order FIFO, assigns supplier-wise box numbers. Backed by
   `computeLedger(buyerMaster, receipts, items)`; component `PackingFIFO({ items, buyerMaster,
   receipts, setReceipts })`.

6. **Documents** — the full A–F document set (`Documents()` component). The document list is a
   `groups` array keyed A–F, each with `[number, label]` pairs (e.g. `["18","Custom invoice"]`).
   A few documents (18 Custom Invoice, 19 Packing List, 31 Commercial Invoice) are rendered as
   worked samples; the rest are catalogued. Each document set is shown in both variants (customs/
   INR and buyer/USD).

7. **Masters — verification tabs** — two read-only tabs showing only the **constant, no-input
   fields** so the client can verify pricing at a glance:
   - **Buyers data** — the 2A constants.
   - **Supplier data** — the 7A constants, including OSWIN/GL codes and BG/PC/TTL and cost/pc.

**The snapshot-pricing pattern (important):** every order row **snapshots its item at the moment
the order is placed** (a frozen copy of the item's fields/prices). When the user edits an item or
buyer or supplier via the pencil modal, only **future** orders use the new values — past orders
keep their snapshot. This is the mechanism behind principle §4.3. **When adding any editable
field, preserve this pattern: write the new value to the master, but never reach back into
existing order snapshots.**

**Validation workflow used while building the prototype:** run **esbuild** as a JSX **syntax
check**, then **Node.js server-side render tests across all views**, *before* presenting each
build. File update pattern: **`rm` the file, then `create_file`** (overwrite), then validate,
then present.

---

## 15. Production architecture (the real build)

The prototype proves the screens; the production system implements them for real on three
layers.

**Frontend — Next.js (React).** The prototype's single file becomes a proper Next.js app
(routed screens, real forms, API calls). Keep the same screen structure and the snapshot-pricing
rule.

**Backend — Python.** Hosts the three logical layers:
- **Layer 1 — Masters** (CRUD for Buyers, Suppliers, Items, Item groups, Rate cards, Settings).
- **Layer 2 — Transactions** (Sales Orders, Supplier POs, Packing Receipts, Shipments).
- **Layer 3 — Engine + Outputs** (Allocation, FIFO balance engine, Document generator).

**Database — Neon (managed Postgres).** Stores masters, transactions, and the immutable order
snapshots. The FIFO ledger is computed from order ("+") and shipment ("−") rows.

**Document generation:**
- **openpyxl** for the Excel variants of all 40 documents.
- **WeasyPrint** for the PDF variants.
- Each document is produced in **two variants** (customs/INR and buyer/USD) from one dataset.
- The system also tracks **signed vs unsigned** document status and stores both.

**Suggested build order (matches the phased plan, §19):**
- **Phase 1 — Core system:** masters + transactions + allocation + the FIFO engine + the order
  screens (Stages A–B).
- **Phase 2 — Documentation:** the document generator and the full A–D document set in both
  variants.
- **Phase 3 — Reports & banking:** Stage E reports (35–39, the live balance registers) and Stage
  F banking (40).

---

## 16. Brand / design system — "Global Trade" identity

**Core palette:**
- **Harbor Navy `#0B2C4D`** — primary ink / nav bar / headings.
- **Cargo Amber `#E8A33D`** — accent / highlighted inputs (e.g. the RBI rate field).
- **Container Teal `#1C7C8C`** — secondary accent / info panels.
- **Off-white canvas `#FBFAF7`** — page background.

**Extended tokens used in the prototype's `C` object** (approximate, from the prototype):
```
navy #0B2C4D · navy2 #143b61 · amber #E8A33D · amberDark #9A6A1A · amberTint #FBEBD0 ·
teal #1C7C8C · tealTint #E1F0F2 · tealDark #0F5260 · canvas #FBFAF7 · card #FFFFFF ·
border #E7E3DA · ink #0B2C4D · muted #5A6B7A · faint #94A0AC · navyTint #EAEFF3
```

**Typography:** `Inter` (system-ui fallback stack) for UI; a monospace stack for codes/IDs.

**Conventions:** cards on white over the off-white canvas; subtle borders (`#E7E3DA`); pill
active states on nav; amber for "the one input that matters on this screen"; teal tint panels for
explanatory/derived-from notes; mono chips for codes (GD/OSWIN/HSN/container/BL).

---

## 17. Open assumptions awaiting client sign-off + known data inconsistencies

**Three interpretations the client must confirm before sign-off** (all currently implemented as
the "best guess" below):

1. **Serial number range sizing.** Implemented as **exactly box-count-wide, cumulative** (10
   boxes → 001–010, next → 011–020). The spec's example arithmetic was inconsistent (10 → 01–15,
   next 10 → 16–26). If a fixed buffer per carton is meant, the client must state the rule.

2. **BG / PC / TTL barcode interpretation.** Implemented as **BG = units per box, PC = 1
   (carton), TTL = BG + PC**, with stickers = boxes × TTL × 1.05. The alternative is BG/PC being
   the small per-box label numbers (1 and 2). Which is right?

3. **Total volume formula.** Implemented as **boxes × volume per box**. The spec wrote
   "÷ volume per box", which gives the wrong unit. Confirm multiplication is intended.

> Also flagged: when one item spans POs at **different prices**, the 7A row uses the **most recent
> order's price**. Confirm if multi-price aggregation needs different handling.

**Known real data inconsistencies in the legacy files** (found during file ingestion — these are
both the problem being solved *and* a selling point for the new single-source system):
- **Package counts disagree across documents:** e.g. **308 vs 421** packages for the same
  shipment.
- **Net weight figures disagree:** e.g. **6400 vs 6050.9** kg across documents.

The new system prevents this class of drift because every document derives from one dataset.

---

## 18. Implementing changes (where to touch what)

A quick map from "the client wants X" to "change this":

- **Change how boxes/weights/volume/stickers/serials are computed** → the **derivation formulas**
  (§12). In the prototype these are centralised and mirrored in the on-screen **formulas panels**;
  in production they live in the Python engine (Layer 3). Change in one place.
- **Change FIFO behaviour** → the **ledger walk** (§11). Prototype: `computeLedger(...)`.
  Production: the FIFO balance engine in Layer 3.
- **Add/modify a master field (item, buyer, supplier, rate)** → the relevant **master** (§7) and
  its **pencil-edit modal**. **Preserve snapshot pricing** (§4.3, §14): write to the master,
  never rewrite existing order snapshots.
- **Add or change a document** → the **`groups` array** in the `Documents()` component (prototype)
  and the **document generator** templates (production, openpyxl + WeasyPrint). Remember **both
  variants** (customs/INR and buyer/USD).
- **Change the 7A columns or maths** → `SM7_HEAD` (headers) and `sm7Raw(group, rbi)` (row
  builder) in the prototype; the 7A builder in production. 28 columns total.
- **Change PO aggregation** → the aggregation step that sums quantities across POs and lists PO
  numbers (§9, §12).
- **Change branding/colours** → the central `C` color object (§16); change once, it cascades.
- **Change navigation** → the top nav bar component. **Never** add `backdrop-filter` to the
  sticky nav (it kills clicks — §14, §20).
- **Add a new supplier/buyer** → the masters support add/modify in-app by design (§4.5).

**Golden rules when changing anything:**
1. Keep "enter once → derive everything." If a value can be derived, derive it; don't ask the
   operator to type it.
2. Never retroactively change historical transactions. Snapshot on write.
3. Anything customs-facing uses HSN + PH/90-series + INR; anything buyer-facing uses GDW codes +
   USD. Keep both variants in sync from one dataset.
4. Validate before presenting (esbuild syntax check + render test in the prototype).

---

## 19. Project plan, revisions, payments

**Timeline:** ~**50 working days** (Mon–Fri), from late June 2026 to **go-live Thursday 3
September 2026** — within the promised 45–60 working-day window.

**Revision cycle:**

| Rev | Date | Deliverable |
|---|---|---|
| **R1** | **2 Jul 2026** | Working prototype |
| **R2** | **9 Jul 2026** | Finalized prototype (a feedback week sits between R1 and R2) |
| **R3** | **30 Jul 2026** | Phase 1 — Core System |
| **R4** | **13 Aug 2026** | Phase 2 — Documentation |
| **R5** | **27 Aug 2026** | Phase 3 — Reports & Banking → go-live after sign-off |

Feedback from each build revision is **folded into the next phase**, not treated as a separate
correction sprint.

**Payment structure (4 installments):**
- **30%** advance — before R1
- **20%** — after R2
- **20%** — after R3
- **30%** — after R5, before deployment

(Plus an **AMC** — annual maintenance contract — available post-deployment.)

---

## 20. Conventions, gotchas and lessons learned

- **Prototype-first, then full product** (not a separately sold MVP). The plan is prototype →
  full build in one go.
- **Snapshot pricing is non-negotiable.** Editing prices must never rewrite history; each order
  freezes its item snapshot. This is a selling point — say so.
- **`backdrop-filter` on the sticky nav breaks clicks.** The compositing layer swallows click
  events. Removed; do not reintroduce.
- **Validate before presenting.** esbuild JSX syntax check + Node.js server-side render across
  all views, every build.
- **File overwrite pattern:** `rm` then `create_file` (the create tool fails if the path exists).
- **The Visualizer tool has been unreliable** for this project; when diagrams are needed, **SVG
  files delivered via `present_files`** are the dependable fallback.
- **Oswin is the exception supplier** — its weights are manual, and it has its own code column.
  Watch for it in any weight or code logic.
- **Some items are shared across two suppliers** — allocation must handle this.
- **Two variants, always.** Every shipment document exists in a customs/INR form and a buyer/USD
  form; they must come from one dataset so they can't drift.
- **The client works in plain English with concrete examples** and wants demo-ready, brand-styled,
  client-facing output. Match that in any deliverable.

---

*End of knowledge base. An AI fed this document should understand the business, the data model,
the document workflow, the FIFO engine, the exact formulas, the prototype's component structure,
the production architecture, the brand system, and the open questions — enough to implement
changes correctly while preserving the project's core rules.*
