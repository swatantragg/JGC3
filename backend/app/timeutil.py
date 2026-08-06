"""The office's calendar day.

Every timestamp in this database is naive UTC — `datetime.utcnow()` all the way
down — which is the right way to store them and the wrong way to answer "is it
still today?". The office is in India, so "today" ends at midnight IST, not at
midnight UTC five and a half hours later. An admin signing in at 01:00 IST must
be asked for a fresh code; comparing UTC dates would let them through until
05:30.

So: store UTC, decide in APP_TIMEZONE. Nothing here changes what is written to
the database.

If the zone is unknown — a slim container without the IANA database, a typo in
the setting — this falls back to UTC and says so in the log, once. A wrong
timezone asks an admin for a code at the wrong hour; a crash locks them out
entirely, and the second is much worse than the first.
"""
import logging
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache

from .config import settings

log = logging.getLogger(__name__)

UTC = timezone.utc


@lru_cache(maxsize=8)
def _zone(name: str):
    """The configured zone, or UTC if it cannot be loaded. Cached, so the
    warning is logged once rather than on every sign-in."""
    try:
        from zoneinfo import ZoneInfo  # noqa: PLC0415 — optional at import time
        return ZoneInfo(name)
    except Exception:  # noqa: BLE001 — unknown zone, missing tzdata, anything
        log.warning(
            "timezone %r could not be loaded — falling back to UTC. Install the "
            "`tzdata` package or set APP_TIMEZONE to a valid IANA name.", name,
        )
        return UTC


def business_tz():
    return _zone(settings.app_timezone or "UTC")


def as_utc(dt: datetime) -> datetime:
    """A stored timestamp as an aware UTC one. Naive values are assumed UTC,
    which is what every writer in this codebase produces."""
    return dt.replace(tzinfo=UTC) if dt.tzinfo is None else dt.astimezone(UTC)


def to_local(dt: datetime) -> datetime:
    """A stored timestamp, read in the office's zone."""
    return as_utc(dt).astimezone(business_tz())


def local_date(dt: datetime) -> date:
    """Which calendar day a stored timestamp falls on, locally."""
    return to_local(dt).date()


def same_local_day(a: datetime, b: datetime) -> bool:
    return local_date(a) == local_date(b)


def next_local_midnight(after: datetime) -> datetime:
    """The next local midnight strictly after `after`, as aware UTC — what a
    "valid until" line should say."""
    tz = business_tz()
    local = as_utc(after).astimezone(tz)
    midnight = datetime.combine(local.date() + timedelta(days=1), time.min, tzinfo=tz)
    return midnight.astimezone(UTC)
