# Jaikvin Global — Backend (FastAPI)

Production API for the export system: masters (suppliers, buyers, items,
transports), the buyer order book (purchase orders), packing invoices with the
dispatch → ship lifecycle, and derived reports (dashboard balance matrix, PO
roll-up, item-wise order detail, balance register).

The database starts **empty** — every record is created through the API. No
seed / dummy data.

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
| `API_HOST` / `API_PORT` | Dev bind host/port (for `run.py`) | `0.0.0.0` / `8000` |
| `RELOAD` | Auto-reload in dev | `true` |

Inside Docker these come from `docker-compose.yml` (`.env` is not copied into
the image), and the container always listens on 8000.

## Endpoints (overview)

| Resource | Path |
| --- | --- |
| Suppliers | `/api/suppliers` |
| Buyers | `/api/buyers` |
| Items | `/api/items` |
| Transports | `/api/transports` |
| Purchase orders | `/api/purchase-orders` (grouped), `/api/purchase-orders/lines` |
| Invoices | `/api/invoices` (with computed `status`, `/serials`) |
| Dashboard matrix | `/api/dashboard/matrix` |
| Reports | `/api/reports/item-detail`, `/api/reports/balance` |

## Docker

```bash
docker build -t jaikvin-backend .
docker run -p 8000:8000 jaikvin-backend
```

Or use the root `docker-compose.yml` to run the whole stack.
