"""Break glass: let an admin back in when the passcode cannot be delivered.

An admin re-proves their mailbox once a day. That is the
right rule until the day mail stops working — a blocked SMTP port, an expired
API key, a provider outage — and then it is a locked door with the key inside:
no admin can sign in, so no admin can reach the setting that would turn it off.

This is the way in. Run it on any machine that can reach the database:

    python scripts/unlock_admin.py                       # list who is locked out
    python scripts/unlock_admin.py aalok@example.com     # grant them 24 hours
    python scripts/unlock_admin.py --all                 # grant every admin

It grants exactly one re-verification window by writing `otp_verified_at`; the
account still needs its password, and the window still expires. It does not
disable verification, and it changes nothing else. Fix the mail and the next
window is earned the normal way — or set OTP_ENABLED=false if the outage will
be a long one.
"""
import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings          # noqa: E402
from app.database import SessionLocal    # noqa: E402
from app.timeutil import next_local_midnight, same_local_day, to_local  # noqa: E402
from app import models                   # noqa: E402


def _state(u: models.User, now: datetime) -> str:
    """The same rule the API applies, said out loud — see auth._admin_code_still_good."""
    if u.role != "admin":
        return "verified — signs in with a password" if u.email_verified else "NOT VERIFIED — needs a code"
    if not u.otp_verified_at:
        return "never verified — LOCKED OUT"
    if settings.otp_admin_reverify_mode == "hours":
        hours = (timedelta(hours=settings.otp_admin_reverify_hours) - (now - u.otp_verified_at)).total_seconds() / 3600
        return f"ok for {hours:.1f}h more" if hours > 0 else "window expired — LOCKED OUT"
    if not same_local_day(u.otp_verified_at, now):
        return f"verified {to_local(u.otp_verified_at):%d %b}, a day since — LOCKED OUT"
    return f"ok until midnight ({next_local_midnight(now):%d %b %H:%M} UTC)"


def main(argv: list[str]) -> int:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        users = db.query(models.User).order_by(models.User.role, models.User.created_at).all()

        if not argv:
            print(f"Mail provider: {settings.mail_provider}  ·  configured: {settings.mail_configured}")
            window = (f"{settings.otp_admin_reverify_hours}h rolling"
                      if settings.otp_admin_reverify_mode == "hours"
                      else f"until midnight {settings.app_timezone}")
            print(f"Admin re-verify: {window}\n")
            for u in users:
                print(f"  {u.role:5} {u.email:34} {_state(u, now)}")
            print("\nPass an email (or --all) to grant a fresh window.")
            return 0

        wanted = [u for u in users if u.role == "admin"] if argv[0] == "--all" else [
            u for u in users if u.email == argv[0].strip().lower()
        ]
        if not wanted:
            print(f"No such account: {argv[0]}")
            return 1

        for u in wanted:
            u.otp_verified_at = now
            if not u.email_verified:
                u.email_verified = True
                u.email_verified_at = now
            # Any half-finished challenge would only get in the way now.
            u.otp_hash = None
            u.otp_expires_at = None
            u.otp_attempts = 0
            until = (now + timedelta(hours=settings.otp_admin_reverify_hours)
                     if settings.otp_admin_reverify_mode == "hours"
                     else next_local_midnight(now))
            print(f"  {u.email} — signs in with a password only, until "
                  f"{to_local(until):%d %b %Y %H:%M} {settings.app_timezone}")
        db.commit()
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
