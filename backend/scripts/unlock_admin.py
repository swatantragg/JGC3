"""Break glass: let an admin back in when the passcode cannot be delivered.

An admin re-proves their mailbox every OTP_ADMIN_REVERIFY_HOURS. That is the
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
from app import models                   # noqa: E402


def _state(u: models.User, now: datetime) -> str:
    if u.role != "admin":
        return "verified — signs in with a password" if u.email_verified else "NOT VERIFIED — needs a code"
    if not u.otp_verified_at:
        return "never verified — LOCKED OUT"
    left = timedelta(hours=settings.otp_admin_reverify_hours) - (now - u.otp_verified_at)
    hours = left.total_seconds() / 3600
    return f"ok for {hours:.1f}h more" if hours > 0 else "window expired — LOCKED OUT"


def main(argv: list[str]) -> int:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        users = db.query(models.User).order_by(models.User.role, models.User.created_at).all()

        if not argv:
            print(f"Mail provider: {settings.mail_provider}  ·  configured: {settings.mail_configured}")
            print(f"Admin re-verify window: {settings.otp_admin_reverify_hours}h\n")
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
            until = now + timedelta(hours=settings.otp_admin_reverify_hours)
            print(f"  {u.email} — signed in with a password only, until {until:%d %b %Y %H:%M} UTC")
        db.commit()
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
