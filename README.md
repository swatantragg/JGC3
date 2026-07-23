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

After that: enter real master data through **Setup** (items, buyers,
suppliers, transports), then create purchase orders, record packing
(invoices) and add shipment details — the dashboard, PO roll-up, balance
register and costing sheet update live from that data.

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
