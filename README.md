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

The stack is Postgres + FastAPI + nginx-served React. nginx proxies `/api` to
the backend, so the browser makes same-origin calls — the frontend works fully
at :8080 regardless of the backend's published port.

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

The database starts **empty**. Enter real master data through **Setup**
(items, buyers, suppliers, transports), then create purchase orders, record
packing (invoices) and add shipment details — the dashboard, PO roll-up and
balance register update live from that data.

## Data model / flow

Setup masters → Purchase Orders → Packing (invoices, FIFO allocation) →
Shipment details (vehicle → container → BL, status lifecycle) → Reports.
Business logic (box counts, FIFO balance, dashboard matrix, PO roll-up,
serials, status) lives in `backend/app/calc.py` as the single source of truth.
