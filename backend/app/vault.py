"""Reversible storage for account passwords, so an admin can read one back.

A bcrypt hash is one-way by design — that is the whole point of it — so a
system that can *show* an admin somebody's password has to keep a second,
reversible copy. That is a real weakening, and it is done deliberately here
because the office needs to hand a forgotten password back to a colleague. The
consequences are worth stating plainly:

  * anyone who obtains both the database and PASSWORD_VAULT_KEY can read every
    password in it, so the key belongs in the environment, never in the repo,
    and a database dump is now as sensitive as the key;
  * `password_hash` remains the only thing sign-in checks. The vault copy is
    never trusted for authentication, so corrupting or clearing it locks
    nobody out — it only stops the reveal.

Fernet (AES-128-CBC + HMAC-SHA256, authenticated) does the work. The key is
PASSWORD_VAULT_KEY when set, otherwise derived from JWT_SECRET so an existing
deployment keeps working without a second secret to rotate; changing either
one makes previously stored copies unreadable, which reads as "not recoverable"
in the UI rather than as an error.
"""
import base64
import logging
from hashlib import pbkdf2_hmac

from cryptography.fernet import Fernet, InvalidToken

from .config import settings

log = logging.getLogger(__name__)

# Fixed salt: the secret is the secret. A per-row salt would mean storing it
# alongside, and PBKDF2 here is stretching a configured key, not a password.
_SALT = b"jaikvin-password-vault-v1"


def _fernet() -> Fernet:
    raw = (settings.password_vault_key or settings.jwt_secret or "").encode("utf-8")
    key = base64.urlsafe_b64encode(pbkdf2_hmac("sha256", raw, _SALT, 200_000, dklen=32))
    return Fernet(key)


def seal(password: str) -> str | None:
    """The stored, readable-back copy of a password. None when there is none."""
    if not password:
        return None
    try:
        return _fernet().encrypt(password.encode("utf-8")).decode("ascii")
    except Exception:  # noqa: BLE001 — a vault fault must never block a password change
        log.exception("could not seal a password for the vault")
        return None


def unseal(sealed: str | None) -> str | None:
    """The password back, or None if it was never stored or the key changed."""
    if not sealed:
        return None
    try:
        return _fernet().decrypt(sealed.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        return None
