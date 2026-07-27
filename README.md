# Jaikvin Global — Export System (production)

Full-stack rebuild of the export operations tool, ported from `prototype2`.

- **backend/** — Python FastAPI + SQLAlchemy REST API (empty DB, no dummy data)
- **frontend/** — React + Vite SPA, React Query, talks to the API over `/api`
- **prototype2/** — the reference prototype (design + logic source)

## Run everything with Docker

```bash
cd JGC3
docker compose up --build
```

- Frontend: http://localhost:8090
- Backend API + docs: http://localhost:8001/docs

The stack is FastAPI + nginx-served React. nginx proxies `/api` to the
backend, so the browser makes same-origin calls — the frontend works fully at
:8090 regardless of the backend's published port.

**Database.** `backend/.env` is mounted into the backend container, so Docker
and a local `python run.py` always hit the same database (currently Neon
Postgres). To use the bundled Postgres container instead, point `DATABASE_URL`
at `postgresql+psycopg2://jaikvin:jaikvin@db:5432/jaikvin` and start the
optional profile:

```bash
docker compose --profile local-db up --build
```

**Ports.** Defaults are host **8090** (frontend) and **8001** (backend) —
8000 and 8080 were already taken in this environment ("port already allocated").
Override with env vars if you like:

```bash
BACKEND_PORT=8000 FRONTEND_PORT=8080 docker compose up --build
```

(The container always listens on 8000 internally; only the host mapping moves.)

## Run locally (without Docker)

**Backend**
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, proxies /api → localhost:8000
```

## First run

The database starts **empty** — there are no seeded users and no dummy
records. Open the frontend and the login screen offers to **create the admin
account**; that first account gets full access and is the only one that can
approve anybody else. The offer disappears once an admin exists.

After that, load the client's master workbook — **Setup → Items → Load from
workbook**. That brings in the 285 products, five suppliers, the buyer and
the two transporters from `Docs/Data/Masters.xlsx`. It is an upsert keyed on
supplier + sheet + code, so it can be run again after the workbook changes
without duplicating anything, and it never overwrites a record you have since
corrected in Setup.

Then create purchase orders, record packing (invoices) and add shipment
details — the dashboard, PO roll-up, balance register and costing sheet
update live from that data.

## The master workbook

`Docs/Data/Masters.xlsx` is the source of truth for parties and products.
Sheet1 holds the buyer, the suppliers and the transporters; the six sheets
after it (Kiran, Hansa-PP, Hansa-GRN, Oswin, VP-PP, VP-GRN) are the client's
2A and 7A masters, one per supplier range.

```bash
python backend/scripts/extract_masters.py   # xlsx  → app/data/masters_seed.json
python backend/scripts/verify_masters.py    # check that extract against Excel
python backend/scripts/import_masters.py    # seed  → the database
```

`verify_masters.py` is the guard rail. Excel stores the value it last
calculated for every formula cell, so those cached results are ground truth:
the script checks each row's barcode-sticker total against Excel's own cell,
re-implements the whole formula chain independently of `calc.py` and compares
the two at three different quantities, and asserts that every sheet's
formulas still reference the columns the extractor reads. Run it after any
change to the workbook or to `calc.derive_line`.

The ranges do not share one formula. What differs is carried per item —
`sticker_mult`, `sticker_round`, `stickers_fixed`, `label_spoilage` and
`type_up` — because the workbook has per-row exceptions inside a range too
(VP-PP rows 9-11 round like the GRN sheets, two rows multiply by 1 rather
than 1.1, one Oswin row has its total typed in). `calc.derive_line` is the
only implementation of the arithmetic; every screen asks the API for it.

## Navigation

The menu follows the client's own (Docs/Jaikvin Process/Menu Bar.xlsx), with
two dropdowns:

```
Dashboard | Purchase Orders ▾ | Shipment ▾ | Pre-Shipment Reports | Post Shipment Reports | Other Reports | Setup
             Purchase Orders     Packing — FIFO
             PO Reports          Shipment details
                                 Suppliers' Reports
```

Badges on **Purchase Orders** and **Shipment** count open POs and boxes still
to pack; `⌘K` opens a palette that jumps to any page or any of the 40
documents. Routing is hash-based (`#/orders`), so a deep link resolves without
a server rewrite.

**Where the RBI rate lives.** Not on the purchase order — on the packing. It
is the Reserve Bank reference rate for the day the goods were packed, which is
what the customs invoice and the bank need, so it is entered at
**Shipment → Record packing** along with the carton serial start. The
shipment's own exchange rate (₹/$) is step 3 of the shipment wizard.

## Documents

`frontend/src/lib/docs.js` generates all 40 export papers as Excel workbooks
from one invoice, previewed on screen before download. The four report pages
(PO / Suppliers' / Pre-Shipment / Post Shipment) are the same page narrowed to
one menu head.

The layouts are the reference build's, unchanged. The figures are not: barcode
stickers, label sheets and FOB follow each item's own rule out of Masters.xlsx
rather than one blanket formula. `frontend/src/lib/docCtx.js` adapts the API's
records into the shape the engine reads.

## Accounts and access

Two roles, and a tick-list of areas per account.

- **Admin** — sees everything, always; manages users under **Setup → Users**.
- **User** — sees only the areas ticked for them. The nav bar shrinks to
  match, forbidden deep links redirect, and the API refuses the calls too, so
  access can't be bypassed from the browser.

People can request access from the login screen; they land as *pending* and
appear under **Setup → Users** for the admin to approve, pause or remove.
Three presets (Full access · Operations · Reports only) cover most cases, and
the tree below them is for fine-tuning.

Permissions are leaf strings (`orders.entry`, `shipment.packing`,
`reports.costing`, …) defined once in `backend/app/permissions.py` and served
to the UI from `/api/auth/permissions`, so the ticks always describe what the
API actually enforces.

**Set `JWT_SECRET` in `backend/.env` before any real deployment** — anyone
holding it can mint a valid login for any account.

## Data model / flow

Setup masters → Purchase Orders → Packing (invoices, FIFO allocation) →
Shipment details (vehicle → container → BL, status lifecycle) → Reports and
Costing. Business logic (box counts, FIFO balance, dashboard matrix, PO
roll-up, serials, status, cost working) lives in `backend/app/calc.py` as the
single source of truth — the costing sheet returns every row with its figures
already worked out, so no two screens can disagree.

Tables: `users`, `suppliers`, `buyers`, `items`, `transports`, `po_lines`,
`invoices`, `invoice_lines`, `costing_lines`, `settings`.

**Schema changes.** `Base.metadata.create_all` makes missing tables but never
missing columns, so `app/migrate.py` runs at startup and adds any column the
models have gained. It is additive only — nothing is dropped, renamed or
retyped — so it is safe on every boot. Anything beyond adding a column
belongs in Alembic.
