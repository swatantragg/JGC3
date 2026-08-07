"""Sliding-window rate limits, counted in the database.

Two shapes of limit, doing two different jobs:

  * **per account** — the ones that actually stop an attacker. A limit keyed on
    the email address holds however many IP addresses the traffic arrives from,
    so a botnet buys nothing. These are tight.
  * **per IP** — a coarse backstop only. One office shares one public address
    through NAT, so twenty people signing in look like one very busy client;
    a tight IP limit would lock out the whole office because one person
    fumbled. These are deliberately loose.

Counted in a table rather than in memory because the API runs on Render's free
tier, which stops the container after about fifteen minutes of quiet. An
in-process counter comes back empty on the next request, which would hand an
attacker a fresh budget for the price of a pause. A row per request is cheap
at this traffic, and old rows are swept as we go.

Nothing here is permanent. Every window expires by itself, and the response
carries `Retry-After` so the sign-in screen can show a countdown instead of a
dead end. The one thing that outlives its window is the account lockout in
app/lockout.py, which is a different mechanism with its own way out.
"""
import logging
import random
import re
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import settings
from . import models

log = logging.getLogger(__name__)

_SPEC = re.compile(r"^\s*(\d+)\s*/\s*(\d+)\s*([smh])\s*$", re.I)
_UNIT = {"s": 1, "m": 60, "h": 3600}

# Rows older than the longest window in use are dead weight; a small chance of
# sweeping on any given call keeps the table flat without a scheduler.
_SWEEP_CHANCE = 0.02
_SWEEP_KEEP_HOURS = 25


def parse(spec: str) -> tuple[int, int]:
    """"40/15m" -> (40 requests, 900 seconds). Falls back to a wide-open
    window on a malformed value: a typo in configuration must not lock the
    office out of its own system."""
    m = _SPEC.match(spec or "")
    if not m:
        log.warning("unreadable rate limit %r — treating as unlimited", spec)
        return (10**9, 60)
    count, size, unit = int(m.group(1)), int(m.group(2)), m.group(3).lower()
    return count, size * _UNIT[unit]


def client_ip(request: Request) -> str:
    """The caller's address as seen through the proxies in front of us.

    Vercel rewrites to Render, so `request.client.host` is a Vercel edge node
    and identical for everybody — useless as a key. X-Forwarded-For's first
    entry is the original client. It is spoofable when nothing trustworthy
    sets it, which is exactly why the per-IP limits here are the loose ones
    and the per-account limits carry the weight.
    """
    fwd = request.headers.get("X-Forwarded-For") or ""
    if fwd:
        first = fwd.split(",")[0].strip()
        if first:
            return first[:64]
    real = (request.headers.get("X-Real-IP") or "").strip()
    if real:
        return real[:64]
    return (request.client.host if request.client else "unknown")[:64]


def _sweep(db: Session) -> None:
    cutoff = datetime.utcnow() - timedelta(hours=_SWEEP_KEEP_HOURS)
    db.execute(delete(models.RateLimitHit).where(models.RateLimitHit.at < cutoff))
    db.commit()


def check(db: Session, bucket: str, spec: str, *, record: bool = True) -> None:
    """Raise 429 when `bucket` has already used up `spec`, otherwise count one.

    `record=False` asks the question without spending anything — used on the
    sign-in path, where a *successful* password should not eat into the budget
    the failures are being counted against.
    """
    if not settings.rate_limit_enabled:
        return

    limit, window = parse(spec)
    now = datetime.utcnow()
    since = now - timedelta(seconds=window)

    used = db.execute(
        select(func.count())
        .select_from(models.RateLimitHit)
        .where(models.RateLimitHit.bucket == bucket, models.RateLimitHit.at >= since)
    ).scalar_one()

    if used >= limit:
        oldest = db.execute(
            select(func.min(models.RateLimitHit.at))
            .where(models.RateLimitHit.bucket == bucket, models.RateLimitHit.at >= since)
        ).scalar_one()
        # When the oldest hit in the window falls out, one slot frees up. The
        # window slides rather than resetting all at once, so access comes back
        # gradually instead of everything unblocking on the same tick.
        retry = max(1, int((oldest + timedelta(seconds=window) - now).total_seconds())) if oldest else window
        raise HTTPException(
            429,
            f"Too many attempts. Try again in {_human(retry)}.",
            headers={"Retry-After": str(retry)},
        )

    if record:
        db.add(models.RateLimitHit(bucket=bucket, at=now))
        db.commit()

    if random.random() < _SWEEP_CHANCE:
        _sweep(db)


def spend(db: Session, bucket: str) -> None:
    """Count one against a bucket without testing it — the other half of a
    `check(..., record=False)`, used when a sign-in turns out to have failed."""
    if not settings.rate_limit_enabled:
        return
    db.add(models.RateLimitHit(bucket=bucket, at=datetime.utcnow()))
    db.commit()


def clear(db: Session, bucket: str) -> None:
    """Forget a bucket entirely. A correct password wipes the failure count
    for that account, so an ordinary bad day never accumulates."""
    db.execute(delete(models.RateLimitHit).where(models.RateLimitHit.bucket == bucket))
    db.commit()


def _human(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds} second{'' if seconds == 1 else 's'}"
    minutes = (seconds + 59) // 60
    return f"{minutes} minute{'' if minutes == 1 else 's'}"


# ---------- Bucket names ----------
# Kept in one place so a limit checked in two routers cannot drift onto two
# different keys and silently double.

def ip_bucket(kind: str, request: Request) -> str:
    return f"{kind}:ip:{client_ip(request)}"


def account_bucket(kind: str, identity: str) -> str:
    return f"{kind}:acct:{(identity or '').strip().lower()}"
