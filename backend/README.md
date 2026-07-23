# Jaikvin Global — Backend (FastAPI)

Production API for the export system: accounts and access rights, masters
(suppliers, buyers, items, transports), the buyer order book (purchase
orders), packing invoices with the dispatch → ship lifecycle, the costing
sheet, and derived reports (dashboard balance matrix, PO roll-up, item-wise
order detail, balance register).

The database starts **empty** — every record, including the first admin, is
created through the API. No seed / dummy data.

## Run locally

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py            # reads API_HOST / API_PORT from .env
```

`python run.py` runs on the host/port from `.env` (default `API_PORT=8000`) —
change `API_PORT` to switch ports without editing any command. You can still
use uvicorn directly: `uvicorn app.main:app --reload --port 8000`.

- API root / docs / health: `http://localhost:<API_PORT>/` · `/docs` · `/health`

## Configuration

Copy `.env.example` to `.env`. Settings (`.env` is resolved absolutely, so it
loads from any working directory):

| Key | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLite (default) or Postgres | `sqlite:///./jaikvin.db` |
| `CORS_ORIGINS` | Allowed browser origins | localhost:5173/4173/8090 |
| `JWT_SECRET` | Signs session tokens — **change in production** | dev placeholder |
| `JWT_EXPIRE_MINUTES` | Session lifetime | `720` (12 h) |
| `API_HOST` / `API_PORT` | Dev bind host/port (for `run.py`) | `0.0.0.0` / `8000` |
| `RELOAD` | Auto-reload in dev | `true` |

`docker-compose.yml` mounts this same `.env` into the container at `/app/.env`,
so Docker and a local `python run.py` never drift onto different databases.
The container always listens on 8000 internally.

## Authentication & access

Bearer JWT in the `Authorization` header. Everything under `/api` requires a
signed-in, active account except `/api/auth/status`, `/api/auth/permissions`,
`/api/auth/bootstrap`, `/api/auth/register` and `/api/auth/login`.

A user holds a list of leaf permissions (`orders.entry`, `shipment.packing`,
`reports.costing`, …). Routes are guarded with `Depends(require("..."))`,
which passes for admins or for anyone holding **any** of the listed
permissions — the same "any of" rule the nav uses, so a page you can see is a
page whose endpoints you can call. The catalogue lives in
`app/permissions.py` and is served to the UI, so ticks and enforcement cannot
drift apart.

First run: `GET /api/auth/status` reports `needs_bootstrap: true` while the
`users` table is empty, and `POST /api/auth/bootstrap` creates the owner
admin. It refuses once any user exists.

## Endpoints (overview)

| Resource | Path |
| --- | --- |
| Auth | `/api/auth/status`, `/permissions`, `/bootstrap`, `/register`, `/login`, `/me`, `/change-password` |
| Users (admin) | `/api/users` |
| Suppliers | `/api/suppliers` |
| Buyers | `/api/buyers` |
| Items | `/api/items` |
| Transports | `/api/transports` |
| Purchase orders | `/api/purchase-orders` (grouped), `/api/purchase-orders/lines` |
| Invoices | `/api/invoices` (with computed `status`, `/serials`) |
| Dashboard matrix | `/api/dashboard/matrix` |
| Reports | `/api/reports/item-detail`, `/api/reports/balance` |
| Costing | `/api/costing` (rows carry a computed block), `/params`, `/formulas` |

## Docker

```bash
docker build -t jaikvin-backend .
docker run -p 8000:8000 jaikvin-backend
```

Or use the root `docker-compose.yml` to run the whole stack.
