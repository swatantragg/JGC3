"""FastAPI dependencies for authentication and permission checks.

Usage in a router:

    @router.post("", dependencies=[Depends(require("setup.items"))])

`require(...)` passes when the caller is an admin or holds ANY of the listed
leaf permissions — the same "any of" rule the nav uses, so a page you can see
is a page whose endpoints you can call.
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .security import CHALLENGE_PURPOSE, decode_stepup_token, decode_token
from . import models


def _bearer(request: Request) -> str | None:
    header = request.headers.get("Authorization") or ""
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    token = _bearer(request)
    if not token:
        raise HTTPException(401, "Sign in to continue")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Your session has expired — please sign in again")
    # Only a session token opens the API. A passcode challenge ticket and a
    # step-up grant both decode cleanly here and must not be mistaken for one;
    # tokens minted before the claim existed carry no purpose and stay valid.
    purpose = payload.get("purpose")
    if purpose not in (None, "session"):
        raise HTTPException(
            401,
            "Finish the email verification to sign in" if purpose == CHALLENGE_PURPOSE
            else "That is not a sign-in token",
        )
    user = db.get(models.User, payload.get("sub"))
    if not user:
        raise HTTPException(401, "Account no longer exists")
    if user.status != "active":
        raise HTTPException(403, "This account is not active — ask the admin to approve it")
    return user


def user_has(user: models.User, perms: list[str]) -> bool:
    if user.role == "admin":
        return True
    granted = set(user.access or [])
    return any(p in granted for p in perms)


def require(*perms: str):
    """Dependency factory — allow admins, or holders of any listed permission."""
    wanted = list(perms)

    def _guard(user: models.User = Depends(current_user)) -> models.User:
        if not user_has(user, wanted):
            raise HTTPException(403, "You do not have access to this area")
        return user

    return _guard


def require_admin(user: models.User = Depends(current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(403, "Only an admin can do this")
    return user


def require_stepup(request: Request, admin: models.User = Depends(require_admin)) -> models.User:
    """Admin, *and* a passcode answered in the last few minutes.

    Guards the two things that must never ride on a session someone left open:
    reading a password back, and setting a new one. The proof travels in the
    `X-Step-Up` header and is bound to the admin who earned it.
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
