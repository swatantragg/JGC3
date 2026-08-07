"""Password hashing, JSON Web Tokens and sign-in passcodes.

bcrypt for storage, a signed HS256 token for the session. The secret comes
from JWT_SECRET in the environment — set a real one in production, the
default only exists so a fresh clone boots.

Four kinds of token are minted here and they must never be confused. `purpose`
in the payload keeps them apart, and every reader checks it:

  session    opens the API (`create_token`)
  otp        names the half-signed-in account waiting to type a mailed code
  stepup     proof an admin answered a passcode within the last few minutes
  unlock     lets a locked-out account clear its own lock

A challenge token presented to `current_user` decodes cleanly and is rejected
on purpose — that check is the only thing standing between "typed the right
password" and "signed in" while a passcode is outstanding.

Session tokens also carry `tv`, the account's `token_version`. A JWT is
otherwise valid until it expires, whatever happens to the account meanwhile;
comparing `tv` against the live row is what lets a password change, a logout
or an admin disabling somebody take effect immediately rather than in a day.
"""
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from hashlib import sha256

import bcrypt
import jwt

from .config import settings

ALGORITHM = "HS256"
CHALLENGE_PURPOSE = "otp"
STEPUP_PURPOSE = "stepup"
UNLOCK_PURPOSE = "unlock"

# Verified against when the email is unknown, so a miss costs the same time as
# a hit. Without it, "no such account" returns in microseconds while a real
# account spends ~100ms in bcrypt — a difference a script can measure, and a
# free list of who works here. The value is the bcrypt hash of a random string
# nobody holds.
_DUMMY_HASH = bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt()).decode("utf-8")


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def burn_time() -> None:
    """Spend what a real password check would have spent, and learn nothing.

    Called on the "no such account" path so response timing cannot be used to
    tell an address that exists from one that does not.
    """
    bcrypt.checkpw(b"no-such-account", _DUMMY_HASH.encode("utf-8"))


def create_token(user_id: str, token_version: int = 1) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        "purpose": "session",
        "tv": token_version,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


# ---------- Sign-in passcodes ----------

def create_challenge_token(user_id: str) -> str:
    """A short-lived ticket that says "this account passed its password and is
    now owed a code" — it grants nothing else, and dies with the code."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.otp_ttl_minutes + 5),
        "purpose": CHALLENGE_PURPOSE,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_challenge_token(token: str) -> str | None:
    """The user id inside a challenge token, or None if it is not one."""
    payload = decode_token(token or "")
    if not payload or payload.get("purpose") != CHALLENGE_PURPOSE:
        return None
    return payload.get("sub")


def create_stepup_token(user_id: str) -> str:
    """Proof that this admin just answered a passcode. Reading a password back
    or setting a new one asks for it; it dies after STEPUP_TTL_MINUTES so a
    forgotten open tab cannot be used to read the office's passwords."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.stepup_ttl_minutes),
        "purpose": STEPUP_PURPOSE,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_stepup_token(token: str) -> str | None:
    payload = decode_token(token or "")
    if not payload or payload.get("purpose") != STEPUP_PURPOSE:
        return None
    return payload.get("sub")


def create_unlock_token(user_id: str) -> str:
    """Handed to an account that has just proved its mailbox after being
    locked out. Clears the lock and nothing else — it cannot open the API."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.otp_ttl_minutes + 5),
        "purpose": UNLOCK_PURPOSE,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_unlock_token(token: str) -> str | None:
    payload = decode_token(token or "")
    if not payload or payload.get("purpose") != UNLOCK_PURPOSE:
        return None
    return payload.get("sub")


def generate_otp() -> str:
    """A numeric code of OTP_LENGTH digits, leading zeros kept."""
    n = max(4, min(10, settings.otp_length))
    return "".join(secrets.choice("0123456789") for _ in range(n))


def hash_otp(code: str) -> str:
    """Codes are stored as an HMAC under the app secret, never in the clear —
    a database copy then reveals no live passcode. Fast on purpose: the code
    is six digits with a minutes-long life and a hard attempt cap, so the
    slowness bcrypt buys a password is not what protects it here."""
    return hmac.new(settings.jwt_secret.encode("utf-8"), (code or "").encode("utf-8"), sha256).hexdigest()


def verify_otp(code: str, hashed: str) -> bool:
    if not hashed or not code:
        return False
    return hmac.compare_digest(hash_otp(code), hashed)
