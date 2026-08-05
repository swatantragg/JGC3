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
| `JWT_EXPIRE_MINUTES` | Session lifetime | `1440` (24 h) |
| `API_HOST` / `API_PORT` | Dev bind host/port (for `run.py`) | `0.0.0.0` / `8000` |
| `RELOAD` | Auto-reload in dev | `true` |
| `OTP_ENABLED` | Ask for a mailed passcode at sign-in | `true` |
| `OTP_LENGTH` / `OTP_TTL_MINUTES` | Digits in the code / how long it lives | `6` / `10` |
| `OTP_MAX_ATTEMPTS` / `OTP_RESEND_SECONDS` | Wrong tries allowed / resend cooldown | `5` / `30` |
| `OTP_ADMIN_REVERIFY_HOURS` | How often an admin re-verifies | `24` |
| `OTP_DEV_ECHO` | Return the code in the API response (**dev only**) | `false` |
| `SMTP_HOST` / `SMTP_PORT` | Mail server — Gmail: `smtp.gmail.com` / `587` | empty / `587` |
| `SMTP_USER` / `SMTP_PASSWORD` | Mailbox and a Google **App Password** | empty |
| `SMTP_STARTTLS` / `SMTP_SSL` | `true`/`false` for port 587; swap for 465 | `true` / `false` |
| `SMTP_FROM` / `SMTP_FROM_NAME` | Sender address and display name | `SMTP_USER` / app name |
| `PASSWORD_VAULT_KEY` | Encrypts the readable-back copy of each password | derived from `JWT_SECRET` |
| `STEPUP_TTL_MINUTES` | How long one emailed confirmation covers password work | `10` |

With `SMTP_HOST` (or the sender) left blank nothing is mailed — the passcode is
written to the server log instead, which keeps a fresh clone usable offline.

`docker-compose.yml` mounts this same `.env` into the container at `/app/.env`,
so Docker and a local `python run.py` never drift onto different databases.
The container always listens on 8000 internally.

## Authentication & access

Bearer JWT in the `Authorization` header, valid 24 hours. Everything under
`/api` requires a signed-in, active account except `/api/auth/status`,
`/api/auth/permissions`, `/api/auth/bootstrap`, `/api/auth/register`,
`/api/auth/login`, `/api/auth/verify-otp` and `/api/auth/resend-otp`.

**Email verification.** `POST /login` checks the password and then answers with
one of two shapes:

* a session — `{token, user, otp_required: false}`;
* a challenge — `{otp_required: true, challenge, email, reason, expires_in,
  resend_in}`, having mailed a six-digit code. The caller returns the
  `challenge` ticket plus the code to `POST /verify-otp` (or asks for another
  through `POST /resend-otp`) and gets the session then.

A **user** is challenged on their first sign-in only: passing it sets
`email_verified`, and every later sign-in is email + password alone. An
**admin** is challenged whenever `otp_verified_at` is older than
`OTP_ADMIN_REVERIFY_HOURS` — once per 24-hour session. The challenge ticket is
a JWT carrying `purpose: "otp"`, so it can never be presented as a session
token; the code itself is stored as an HMAC, expires, is single-use and is
burned after `OTP_MAX_ATTEMPTS` wrong tries. Changing an account's email under
Setup → Users clears the tick, so the new address is proved the same way.

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

**Passwords.** Only an admin may read a password back or set one — a user
cannot change their own — and both need a code answered in the last
`STEPUP_TTL_MINUTES`: `POST /api/auth/step-up/start` mails it,
`POST /api/auth/step-up/verify` returns a grant, and the grant travels on the
`X-Step-Up` header of `GET|PUT /api/users/{id}/password`. A grant is a JWT with
`purpose: "stepup"`, bound to the admin who earned it, and is rejected wherever
a session token is expected.

Showing a password at all means keeping a reversible copy beside the bcrypt
hash (`users.password_enc`, encrypted with `PASSWORD_VAULT_KEY`). That is a
deliberate weakening for an office that has to hand a forgotten password back:
anyone holding both the database and the key can read every password in it, so
a dump is now as sensitive as the key. Sign-in never consults that copy —
`password_hash` remains the only thing checked — so clearing it locks nobody
out, it only stops the reveal. Accounts whose password predates the column read
back as *not recoverable*; the cure is to set a new one. See `app/vault.py`.

## Endpoints (overview)

| Resource | Path |
| --- | --- |
| Auth | `/api/auth/status`, `/permissions`, `/bootstrap`, `/register`, `/login`, `/verify-otp`, `/resend-otp`, `/step-up/start`, `/step-up/verify`, `/me`, `/change-password` |
| Users (admin) | `/api/users`, `/api/users/{id}/password` (GET reveal · PUT set — both need `X-Step-Up`) |
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
