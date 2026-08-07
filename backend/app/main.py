"""FastAPI application entrypoint for the Jaikvin Global Export System.

Three things happen here that are not routing:

  * **the secrets are checked before anything else.** A production process
    still carrying the placeholder JWT secret does not start — that secret is
    printed in the repository, and a deployment using it can have an admin
    session forged offline in seconds. In development it warns and continues,
    because a fresh clone has to be able to boot.
  * **the interactive docs are closed in production.** /docs is a complete map
    of the API with a button to fire each endpoint; useful on a laptop, an
    invitation on the internet.
  * **every response carries the security headers.** They are the second wall:
    the escaping in the frontend is what should stop an injected script, and
    the CSP is what stops it doing anything useful if it ever gets through.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import guard_secrets, settings
from .database import Base, engine
from . import models  # noqa: F401  (ensure models are registered before create_all)
from .migrate import run_migrations
from .routers import (
    auth, users, suppliers, buyers, items, transports, purchase_orders, invoices,
    dashboard, reports, costing, masters, audit_log,
)

log = logging.getLogger(__name__)

# Before the database, before the routes: a misconfigured secret is not
# something to discover later.
guard_secrets()

# Create tables on startup, then add any column the models have gained since
# the database was last touched — create_all makes tables, never columns.
Base.metadata.create_all(bind=engine)
run_migrations()

_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if settings.is_production else {}

app = FastAPI(title=settings.app_name, version="2.0.0", **_docs)


# ---------- Security headers ----------
#
# CSP is the important one. `default-src 'self'` means an injected <script
# src="https://attacker/..."> cannot load and a fetch() to anywhere else
# cannot leave — so even a successful injection has nowhere to send what it
# steals. These are API responses, which need no scripts or styles of their
# own; the frontend's own headers are set at the edge in frontend/vercel.json.
CSP = (
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)
# The interactive docs are a real HTML page and need enough to draw themselves.
CSP_DOCS = (
    "default-src 'self'; img-src 'self' data: https://fastapi.tiangolo.com; "
    "script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' "
    "https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'none'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    response.headers["Content-Security-Policy"] = (
        CSP_DOCS if path in ("/docs", "/redoc") else CSP
    )
    # Never render inside somebody else's frame: an invisible iframe over a
    # page the user trusts is how a click lands on "delete user".
    response.headers["X-Frame-Options"] = "DENY"
    # Take the declared Content-Type literally rather than sniffing it —
    # sniffing is how a stored file gets executed as script.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    # An answer about an account is not something to keep in a shared cache.
    response.headers.setdefault("Cache-Control", "no-store")
    if settings.is_production:
        # "Never speak HTTP to this host again" — the browser rewrites the
        # request before it leaves, which is what closes the gap the
        # HTTP→HTTPS redirect cannot: the very first request.
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


# ---------- Where a request is allowed to come from ----------
#
# The session lives in a SameSite cookie, so a form on another site cannot make
# the browser send it — that is what stops CSRF. This is the belt to that
# braces: a state-changing request whose Origin is not one we know is refused
# outright, which also covers the case where SameSite is loosened to "none"
# because the browser is calling Render directly.
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def origin_guard(request: Request, call_next):
    if request.method not in _SAFE_METHODS:
        origin = request.headers.get("Origin")
        # No Origin at all means it is not a browser — curl, a script, a
        # server. Those carry no ambient cookie to abuse, so CSRF does not
        # apply to them.
        if origin and origin not in settings.cors_origin_list:
            log.warning("refused %s %s from origin %s", request.method, request.url.path, origin)
            return JSONResponse(
                {"detail": "This request did not come from a known origin"}, status_code=403
            )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,        # the session cookie has to be allowed to travel
    # Named rather than "*": with credentials allowed, the origin list is the
    # only thing standing between a hostile page and this API, and a wildcard
    # anywhere in that policy is worth removing.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Step-Up", "X-Requested-With"],
    expose_headers=["Retry-After", "X-Password-Change-Required"],
    max_age=600,
)

for r in (auth, users, suppliers, buyers, items, transports, purchase_orders, invoices,
          dashboard, reports, costing, masters, audit_log):
    app.include_router(r.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/", tags=["health"])
def root():
    return {"service": settings.app_name, "health": "/health"}
