"""Create (or reset) an admin account straight in the database.

The intended way to seed a real owner: there is no public sign-up, and
/api/auth/bootstrap refuses once anybody exists, so an admin for a live
database is made here.

    python scripts/create_admin.py "name@example.com" "TheirPassword@1" "Their Name"

Re-running it against an address that already exists promotes that account to
admin and resets its password rather than failing — which is also how a locked
out owner gets back in. The password is bcrypt-hashed exactly as the API does
it, and is checked against the same rule the API enforces.

Two things the reset does besides the password: it clears any lockout, and it
bumps `token_version`, which ends every session that account had open. If this
is being run because something went wrong, leaving the old sessions alive
would defeat the point.

The account is left **unverified** on purpose: an admin proves their mailbox
with an emailed passcode on the next sign-in, and again once every 24 hours.
"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, SessionLocal, engine   # noqa: E402
from app.migrate import run_migrations                # noqa: E402
from app.passwords import password_problems           # noqa: E402
from app.permissions import ALL_PERMS                 # noqa: E402
from app.security import hash_password                # noqa: E402
from app import models                                # noqa: E402


def main(email: str, password: str, name: str) -> int:
    email = email.strip().lower()
    problems = password_problems(password, name=name, email=email)
    if problems:
        print("Refused — the password must " + "; ".join(problems) + ".")
        return 1

    Base.metadata.create_all(bind=engine)
    run_migrations()

    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        existed = user is not None
        if not user:
            user = models.User(email=email, created_at=datetime.utcnow())
            db.add(user)

        user.name = name.strip()
        user.password_hash = hash_password(password)
        user.role = "admin"
        user.status = "active"
        user.access = list(ALL_PERMS)
        user.password_changed_at = datetime.utcnow()
        # Unverified: the first sign-in mails a passcode, as it should for an
        # admin, and any half-finished challenge on the old row is dropped.
        user.email_verified = False
        user.email_verified_at = None
        user.otp_verified_at = None
        user.otp_hash = None
        user.otp_expires_at = None
        user.otp_sent_at = None
        user.otp_attempts = 0
        # Whatever was locking this account out, it is not locking it now.
        user.failed_attempts = 0
        user.failed_window_start = None
        user.locked_until = None
        user.hard_locked = False
        # Every session this account had open stops here.
        user.token_version = (user.token_version or 1) + 1
        # This password was typed on a command line and will be read out to
        # somebody. It opens one screen: the one that replaces it.
        user.must_change_password = True

        db.commit()
        db.refresh(user)
        print(f"{'Updated' if existed else 'Created'} admin {user.email}  (id {user.id})")
        print(f"  role={user.role}  status={user.status}  areas={len(user.access)}")
        print("  email_verified=False — a passcode is emailed on the next sign-in")
        print("  must_change_password=True — this password must be replaced at first sign-in")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "Administrator"))
