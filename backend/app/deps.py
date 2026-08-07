"""FastAPI dependencies for authentication and permission checks.

Usage in a router:

    @router.post("", dependencies=[Depends(require("setup.items"))])

`require(...)` passes when the caller is an admin or holds ANY of the listed
leaf permissions — the same "any of" rule the nav uses, so a page you can see
is a page whose endpoints you can call.

Where the session token comes from
----------------------------------
The cookie first, the Authorization header second.

The cookie is httpOnly, so a script injected into the page cannot read it —
which is the whole point, because a token in localStorage is one XSS away from
being someone else's admin session. The header is still accepted for scripts
and for anything that is not a browser; nothing in the frontend sends one.

Revocation
----------
A JWT is valid until it expires, whatever happens to the account meanwhile.
Comparing the token's `tv` claim against the row's `token_version` is what
makes a logout, a password change or an admin disabling somebody take effect
now rather than in a day. Tokens minted before the claim existed carry no `tv`
and are rejected — an upgrade signs everybody out once, on purpose.
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .security import CHALLENGE_PURPOSE, decode_stepup_token, decode_token
from . import models


def _bearer(request: Request) -> str | None:
    header = request.headers.get("Authorization") or ""
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def session_token(request: Request) -> str | None:
    """The session token, cookie first."""
    cookie = request.cookies.get(settings.cookie_name)
    if cookie and cookie.strip():
        return cookie.strip()
    return _bearer(request)


def current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    token = session_token(request)
    if not token:
        raise HTTPException(401, "Sign in to continue")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Your session has expired — please sign in again")

    # Only a session token opens the API. A passcode challenge ticket, a
    # step-up grant and an unlock ticket all decode cleanly here and must not
    # be mistaken for one.
    purpose = payload.get("purpose")
    if purpose != "session":
        raise HTTPException(
            401,
            "Finish the email verification to sign in" if purpose == CHALLENGE_PURPOSE
            else "That is not a sign-in token",
        )

    user = db.get(models.User, payload.get("sub"))
    if not user:
        raise HTTPException(401, "Account no longer exists")

    if payload.get("tv") != (user.token_version or 1):
        raise HTTPException(401, "This session has been signed out — please sign in again")

    if user.status != "active":
        raise HTTPException(403, "This account is not active — ask the admin to approve it")
    if user.hard_locked:
        raise HTTPException(423, "This account is locked — ask the admin to unlock it")
    return user


def active_user(user: models.User = Depends(current_user)) -> models.User:
    """A signed-in account that is not mid-way through a forced password change.

    An admin-set password is a delivery mechanism — it gets spoken aloud or
    typed into a chat window — so it opens exactly one door: the screen that
    replaces it. Every other endpoint is closed until that is done, otherwise
    the "temporary" password would quietly become permanent for anyone who
    ignores the prompt.
    """
    if user.must_change_password:
        raise HTTPException(
            403,
            "Set a new password before continuing",
            headers={"X-Password-Change-Required": "1"},
        )
    return user


def user_has(user: models.User, perms: list[str]) -> bool:
    if user.role == "admin":
        return True
    granted = set(user.access or [])
    return any(p in granted for p in perms)


def require(*perms: str):
    """Dependency factory — allow admins, or holders of any listed permission."""
    wanted = list(perms)

    def _guard(user: models.User = Depends(active_user)) -> models.User:
        if not user_has(user, wanted):
            raise HTTPException(403, "You do not have access to this area")
        return user

    return _guard


def require_admin(user: models.User = Depends(active_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(403, "Only an admin can do this")
    return user


def require_stepup(request: Request, admin: models.User = Depends(require_admin)) -> models.User:
    """Admin, *and* a passcode answered in the last few minutes.

    Guards setting somebody else's password — the one action that must never
    ride on a session left open on an unattended screen. The proof travels in
    the `X-Step-Up` header and is bound to the admin who earned it.
    """
    token = (request.headers.get("X-Step-Up") or "").strip()
    if not token:
        raise HTTPException(401, "Confirm the emailed code before doing this")
    uid = decode_stepup_token(token)
    if not uid:
        raise HTTPException(401, "That confirmation has expired — ask for a new code")
    if uid != admin.id:
        raise HTTPException(403, "That confirmation belongs to a different account")
    return admin
