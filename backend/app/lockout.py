"""Failed sign-ins, and what happens after too many.

A rate limit and a lockout answer different questions. The limit in
app/ratelimit.py caps *how fast* guesses can arrive; the lockout here caps how
many are allowed at all, and it survives the attacker slowing down to stay
under the limit.

Two tiers, because one tier cannot be both safe and usable:

  * **soft** — LOCKOUT_SOFT_THRESHOLD failures in a row locks the account for
    LOCKOUT_SOFT_MINUTES, then it opens by itself. Covers the ordinary case,
    somebody mistyping, and never needs a human.
  * **hard** — LOCKOUT_HARD_THRESHOLD failures inside LOCKOUT_WINDOW_HOURS is
    not a mistyped password, it is an attack. The account stays shut until
    somebody acts.

The important part is the way out. A lockout that only an admin can clear is a
weapon: anybody who knows an address can shut that account by typing five
wrong passwords, and repeat it every time the admin opens it again — the whole
office locked out by a stranger, with no credentials at all. So a locked
account can always clear itself by answering a passcode at its own registered
address, which an attacker cannot read. The admin route stays for the case
where the mailbox itself is the problem.

Nothing here decides *whether* a password was right — auth.py does that, and
calls `record_failure` or `record_success` with the answer.
"""
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .config import settings
from . import models


def _now() -> datetime:
    return datetime.utcnow()


def state(user: models.User) -> tuple[bool, str, int]:
    """(locked, why, seconds_remaining) for this account right now.

    A soft lock whose time has run out reads as unlocked here and is cleared
    on the next write, so no scheduled job is needed to open it.
    """
    if user.hard_locked:
        return True, "hard", 0
    until = user.locked_until
    if until and until > _now():
        return True, "soft", max(1, int((until - _now()).total_seconds()))
    return False, "", 0


def guard(user: models.User) -> None:
    """Raise if this account may not attempt a sign-in at all.

    Checked *before* the password, so a locked account cannot be probed for
    whether a guess was right — otherwise the lock would still leak the answer
    it exists to protect.
    """
    locked, why, remaining = state(user)
    if not locked:
        return
    if why == "hard":
        raise HTTPException(
            423,
            "This account is locked after too many failed sign-ins. Use "
            "\"Unlock my account\" to confirm your email, or ask the admin to reset it.",
        )
    minutes = max(1, (remaining + 59) // 60)
    raise HTTPException(
        423,
        f"Too many failed sign-ins. Try again in {minutes} minute"
        f"{'' if minutes == 1 else 's'}, or use \"Unlock my account\" to confirm your email now.",
        headers={"Retry-After": str(remaining)},
    )


def record_failure(db: Session, user: models.User, ip: str | None = None) -> str:
    """Count one wrong password. Returns "" , "soft" or "hard".

    The run of failures is dated: a count that never expired would eventually
    lock every account that has been mistyped a few times over a year.
    """
    now = _now()
    window = timedelta(hours=settings.lockout_window_hours)

    if not user.failed_window_start or now - user.failed_window_start > window:
        user.failed_window_start = now
        user.failed_attempts = 0

    user.failed_attempts = (user.failed_attempts or 0) + 1
    user.last_failed_at = now
    user.last_failed_ip = (ip or "")[:64] or None

    result = ""
    if user.failed_attempts >= settings.lockout_hard_threshold:
        user.hard_locked = True
        user.locked_until = None
        result = "hard"
    elif user.failed_attempts % settings.lockout_soft_threshold == 0:
        # Every further multiple re-arms the timer, so an attacker who waits
        # out one soft lock is met by the next rather than by a clean slate.
        user.locked_until = now + timedelta(minutes=settings.lockout_soft_minutes)
        result = "soft"

    db.commit()
    return result


def record_success(db: Session, user: models.User) -> None:
    """A correct password wipes the slate — an ordinary bad day never
    accumulates toward a lock."""
    user.failed_attempts = 0
    user.failed_window_start = None
    user.locked_until = None
    user.hard_locked = False
    user.last_failed_at = None
    user.last_failed_ip = None
    db.commit()


def clear(db: Session, user: models.User) -> None:
    """Open an account, whoever asked — the holder having proved their mailbox,
    or an admin acting for them."""
    record_success(db, user)


def attempts_left(user: models.User) -> int:
    """How many tries remain before the next lock. Never told to the caller —
    saying "2 attempts left" tells an attacker exactly how hard to push before
    backing off — but it is what decides when to warn the account's owner."""
    used = (user.failed_attempts or 0) % settings.lockout_soft_threshold
    return max(0, settings.lockout_soft_threshold - used)
