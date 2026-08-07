# Jaikvin Global — Backend (FastAPI)

Production API for the export system: accounts and access rights, masters
(suppliers, buyers, items, transports), the buyer order book (purchase
orders), packing invoices with the dispatch → ship lifecycle, the costing
sheet, and derived reports (dashboard balance matrix, PO roll-up, item-wise
order detail, balance register).

The database starts **empty** — every record, including the first admin, is
created through the API. No seed / dummy data.

## Python version

Pinned to **3.12** by `backend/.python-version`. This is not cosmetic: the
pinned dependencies (`pydantic-core`, `psycopg2-binary`) publish wheels only up
to 3.13, so on a newer interpreter pip falls back to building them from source
and needs a Rust toolchain — which fails on hosts with a read-only cargo cache,
Render among them. If a deploy dies in `Preparing metadata (pyproject.toml)`
with `maturin failed`, the build picked a Python the wheels do not cover: pin
it here, or set `PYTHON_VERSION` in the host's environment.

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
| `OTP_ADMIN_REVERIFY_MODE` | `midnight` (end of the local day) or `hours` | `midnight` |
| `OTP_ADMIN_REVERIFY_HOURS` | The rolling window, used only in `hours` mode | `24` |
| `APP_TIMEZONE` | Where the day boundary falls (IANA name) | `Asia/Kolkata` |
| `MAIL_PROVIDER` | `smtp`, `brevo` or `resend` — how the code is sent | `smtp` |
| `MAIL_API_KEY` | The email API key, for `brevo` / `resend` | empty |
| `SMTP_HOST` / `SMTP_PORT` | Mail server — Gmail: `smtp.gmail.com` / `587` | empty / `587` |
| `SMTP_USER` / `SMTP_PASSWORD` | Mailbox and a Google **App Password** | empty |
| `SMTP_STARTTLS` / `SMTP_SSL` | `true`/`false` for port 587; swap for 465 | `true` / `false` |
| `SMTP_FROM` / `SMTP_FROM_NAME` | Sender address and display name | `SMTP_USER` / app name |
| `STEPUP_TTL_MINUTES` | How long one emailed confirmation covers password work | `10` |
| `ENVIRONMENT` | `production` closes `/docs`, sends HSTS, forces Secure cookies, and refuses a placeholder secret | `development` |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | Session cookie policy — see *Authentication* | `lax` / `true` |
| `LOCKOUT_SOFT_THRESHOLD` / `LOCKOUT_SOFT_MINUTES` | Failures before a timed lock, and how long it holds | `5` / `15` |
| `LOCKOUT_HARD_THRESHOLD` / `LOCKOUT_WINDOW_HOURS` | Failures before a human is needed, and the window counted over | `10` / `24` |
| `RATE_LIMIT_ENABLED`, `RL_*` | Sliding-window limits, `count/window` — see `app/ratelimit.py` | on |
| `PASSWORD_HISTORY_SIZE` | Previous passwords a new one is checked against | `3` |

With nothing configured, no mail is sent — the passcode is written to the
server log instead, which keeps a fresh clone usable offline.

**Hosts that block SMTP.** Render, Vercel and most managed platforms silently
drop outbound packets on ports 25 / 465 / 587 to stop spam abuse. `smtplib`
then hangs until `SMTP_TIMEOUT` and the send fails with credentials that are
perfectly good — the tell is the timing, since a wrong password is refused in
under a second while a blocked port takes the full timeout. Port 443 is never
blocked, so set `MAIL_PROVIDER=brevo` (or `resend`) with a `MAIL_API_KEY`;
`SMTP_FROM` becomes the sender address, which the provider must have verified.

**If nobody can sign in.** An admin re-proves their mailbox every 24 hours, so
a mail outage eventually locks every admin out — including out of the setting
that would turn verification off. `python scripts/unlock_admin.py` lists who is
affected and grants a fresh window; `OTP_ENABLED=false` disables the codes
entirely while the outage lasts.

`docker-compose.yml` mounts this same `.env` into the container at `/app/.env`,
so Docker and a local `python run.py` never drift onto different databases.
The container always listens on 8000 internally.

## Authentication & access

The session is a JWT in an **httpOnly cookie**, valid 24 hours. It is never
returned in a response body and page JavaScript cannot read it — a token the
page can read is a token an injected script can read, and one stolen admin
session is the whole system. An `Authorization: Bearer` header is still
accepted for scripts and non-browser clients.

The cookie is `SameSite=lax`, which is what stops a form on another site making
the browser send it — the mechanism CSRF depends on. That requires the browser
to see the API as same-origin, which is what the `/api` rewrite in
`frontend/vercel.json` arranges. A second check in `app/main.py` refuses any
write whose `Origin` header is not on `CORS_ORIGINS`.

Everything under `/api` requires a signed-in, active account except
`/api/auth/status`, `/api/auth/permissions`, `/api/auth/bootstrap`,
`/api/auth/login`, `/api/auth/verify-otp`, `/api/auth/resend-otp` and
`/api/auth/unlock/*`.

**Revocation.** Each account carries a `token_version`, mirrored in the token's
`tv` claim and compared on every request. Bumping it ends every session that
account has open, instantly — which is what logout, a password change, an
access change and "sign out everywhere" all do. Without it a JWT stays valid
until it expires no matter what happens to the account.

**There is no public sign-up.** Accounts are created by an admin under
Setup → Users. A registration endpoint has to answer "that email is already
registered", and that answer is a free list of who works here. For the same
reason every sign-in failure — wrong password, no such account, pending,
disabled — returns one identical 401, and an unknown address still costs a
bcrypt so response timing cannot separate real addresses from invented ones.

**Email verification.** `POST /login` checks the password and then answers with
one of two shapes:

* a session — `{token, user, otp_required: false}`;
* a challenge — `{otp_required: true, challenge, email, reason, expires_in,
  resend_in}`, having mailed a six-digit code. The caller returns the
  `challenge` ticket plus the code to `POST /verify-otp` (or asks for another
  through `POST /resend-otp`) and gets the session then.

A **user** is challenged on their first sign-in only: passing it sets
`email_verified`, and every later sign-in is email + password alone. An
**admin** is challenged once a day: a passcode lasts until the end of the
calendar day it was given on, so the first sign-in after midnight asks for a
fresh one.

Midnight means the office's midnight. Timestamps are stored naive UTC, but the
day boundary is read in `APP_TIMEZONE` (`Asia/Kolkata`) — comparing UTC dates
would let an admin in until 05:30 IST on a day they had not verified. See
`app/timeutil.py`; it falls back to UTC with a logged warning rather than
raising if the zone cannot be loaded, because a wrong hour beats a lockout.
`OTP_ADMIN_REVERIFY_MODE=hours` restores the older rolling window.

This is separate from the session. `JWT_EXPIRE_MINUTES` still runs 24 hours
from sign-in, and midnight does not cut an open session short — the rule is
consulted at sign-in only. The challenge ticket is
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

**Passwords cannot be read back.** Only a bcrypt hash is stored. There used to
be a reversible encrypted copy beside it so an admin could reveal a password;
it is gone, along with the column and `app/vault.py`. It meant a database dump
was a plaintext credential dump — and since people reuse passwords, it put
their mail and their bank at risk as well as this system.

Restoring access to a forgotten account means **setting** a new password:
`PUT /api/users/{id}/password`, admin only, and only with a code answered in
the last `STEPUP_TTL_MINUTES`. `POST /api/auth/step-up/start` mails it,
`POST /api/auth/step-up/verify` returns a grant, and the grant travels on the
`X-Step-Up` header. A grant is a JWT with `purpose: "stepup"`, bound to the
admin who earned it, and is rejected wherever a session token is expected.

Any password an admin sets is flagged `must_change_password`. It has to be read
out over a phone or typed into a chat window, so it is a delivery mechanism
rather than a secret; the holder is sent straight to a change-password screen
at their next sign-in and every other endpoint answers 403 until it is done.
After that only they know the live password. A new password is also checked
against the last `PASSWORD_HISTORY_SIZE` hashes, which stops the
change-then-change-straight-back move.

**Failed sign-ins.** Two tiers, in `app/lockout.py`. `LOCKOUT_SOFT_THRESHOLD`
failures in a row lock the account for `LOCKOUT_SOFT_MINUTES` and then it opens
by itself; `LOCKOUT_HARD_THRESHOLD` inside `LOCKOUT_WINDOW_HOURS` is an attack
rather than a typo and waits for a human. Either can be cleared by the holder
answering a code at their own address (`POST /api/auth/unlock/start` →
`/unlock/verify`), which grants no session — the password is still needed. That
route matters: a lock only an admin can lift is a weapon anyone who knows an
address can point at an account, repeatedly, with no credentials at all.
Attempts made *while* locked are refused before the password is looked at and
do not count, so nobody can drive an account to a permanent lock from outside.

**Rate limits** (`app/ratelimit.py`) are counted in the database, not in memory:
Render's free tier stops the container when it is quiet, and an in-process
counter would come back empty and hand out a fresh budget. Per-account limits
are the tight ones — they hold however many addresses the traffic arrives from.
Per-IP limits are loose because one office shares one public address.

**Audit** (`app/audit.py`, read at `/api/audit`) records sign-ins and the ones
that failed, lockouts, password changes, permission edits and deletions.
Nothing updates or deletes a row and credential-shaped fields are redacted
before writing, so the log is evidence rather than another place secrets live.

## Endpoints (overview)

| Resource | Path |
| --- | --- |
| Auth | `/api/auth/status`, `/permissions`, `/bootstrap`, `/login`, `/verify-otp`, `/resend-otp`, `/logout`, `/unlock/start`, `/unlock/verify`, `/step-up/start`, `/step-up/verify`, `/me`, `/change-password`, `/change-password/forced` |
| Users (admin) | `/api/users`, `/api/users/{id}/password` (PUT set — needs `X-Step-Up`), `/{id}/unlock`, `/{id}/sign-out` |
| Audit (admin) | `/api/audit`, `/api/audit/summary` — read-only |
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
