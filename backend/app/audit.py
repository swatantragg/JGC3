"""The append-only record of who did what.

Without this, the honest answer after an incident is "we do not know". Nothing
in the application reads a row back for a decision, so the table is pure
evidence: sign-ins and the ones that failed, lockouts, password changes,
permission edits, accounts created and deleted.

Two rules make it worth having:

  * **nothing updates or deletes a row.** An admin who misuses their access
    cannot tidy up after themselves through the application.
  * **nothing sensitive goes in `detail`.** No passwords, no passcodes, no
    tokens. A log that leaks is not an improvement on no log at all — what
    goes in is *which* fields changed, never their values.

`write` never raises. Losing an audit row is bad; failing the operation the
user actually asked for because the audit row could not be written is worse,
and would turn the table into a denial-of-service surface.
"""
import logging

from fastapi import Request
from sqlalchemy.orm import Session

from .ratelimit import client_ip
from . import models

log = logging.getLogger(__name__)

# ---------- Action names ----------
# Grouped by prefix so the viewer can filter: everything under "auth." is a
# sign-in event, everything under "user." is account administration.
LOGIN_OK = "auth.login.ok"
LOGIN_FAIL = "auth.login.fail"
LOGIN_BLOCKED = "auth.login.blocked"        # correct password, but locked out
LOGOUT = "auth.logout"
OTP_SENT = "auth.otp.sent"
OTP_OK = "auth.otp.ok"
OTP_FAIL = "auth.otp.fail"
LOCKED_SOFT = "auth.lock.soft"
LOCKED_HARD = "auth.lock.hard"
UNLOCK_SELF = "auth.unlock.self"
UNLOCK_ADMIN = "auth.unlock.admin"
STEPUP_OK = "auth.stepup.ok"
PASSWORD_CHANGED = "auth.password.changed"  # by the holder
BOOTSTRAP = "auth.bootstrap"

USER_CREATED = "user.created"
USER_UPDATED = "user.updated"
USER_DELETED = "user.deleted"
USER_PASSWORD_SET = "user.password.set"     # by an admin, for someone else

# Fields that must never reach `detail`, whatever a caller passes.
_REDACT = {
    "password", "new_password", "current_password", "confirm_password",
    "password_hash", "code", "otp", "token", "challenge", "grant", "secret",
}


def _clean(detail: dict | None) -> dict | None:
    """Drop anything that looks like a credential, at any depth."""
    if not detail:
        return None
    out: dict = {}
    for key, value in detail.items():
        if key.lower() in _REDACT:
            out[key] = "[redacted]"
        elif isinstance(value, dict):
            out[key] = _clean(value)
        else:
            out[key] = value
    return out


def write(
    db: Session,
    action: str,
    *,
    request: Request | None = None,
    actor: models.User | None = None,
    actor_email: str | None = None,
    target_id: str | None = None,
    target_label: str | None = None,
    outcome: str = "ok",
    detail: dict | None = None,
) -> None:
    """Record one event. Commits on its own so the row survives a later
    rollback of the operation it describes — a *failed* attempt is exactly the
    kind of thing worth keeping."""
    try:
        row = models.AuditLog(
            action=action,
            actor_id=actor.id if actor else None,
            # Kept flat rather than joined: the account may be deleted later,
            # and "who did this" must survive that.
            actor_email=(actor.email if actor else actor_email),
            target_id=target_id,
            target_label=target_label,
            ip=client_ip(request) if request else None,
            user_agent=(request.headers.get("User-Agent") or "")[:300] if request else None,
            outcome=outcome,
            detail=_clean(detail),
        )
        db.add(row)
        db.commit()
    except Exception:  # noqa: BLE001 — an audit failure must never break the request
        log.exception("could not write audit row for %s", action)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
