"""The password rule, in one place.

Every route that accepts a password — the first-run bootstrap, a sign-up, an
admin creating or resetting somebody, a person changing their own — runs the
same check here, so a weak password cannot slip in through a side door.

The failures come back as one plain 400 naming everything that is wrong at
once, rather than pydantic's nested 422: the person retyping the box wants the
whole list, not one rule at a time.
"""
from fastapi import HTTPException

MIN_LENGTH = 8
MAX_LENGTH = 128
SPECIALS = "!@#$%^&*()-_=+[]{};:,.<>?/\\|`~'\""

# Passwords so common that length and shape stop meaning anything.
BANNED = {
    "password", "password1", "password@1", "passw0rd", "qwerty123", "admin@123",
    "welcome@1", "abcd@1234", "12345678", "123456789", "letmein1", "iloveyou1",
}

RULES = [
    f"at least {MIN_LENGTH} characters",
    "one capital letter (A–Z)",
    "one small letter (a–z)",
    "one number (0–9)",
    f"one symbol ({SPECIALS[:8]} …)",
]


def password_problems(password: str, *, name: str = "", email: str = "") -> list[str]:
    """Everything wrong with this password — empty list means it passes.

    `name` and `email` are accepted so the caller never has to know whether the
    rule looks at them; today it does not. A "must not contain your own name"
    rule was tried and dropped: it rejects perfectly strong passwords that
    happen to share four letters with the account holder, which teaches people
    to write down whatever finally got accepted.
    """
    pw = password or ""
    bad: list[str] = []

    if len(pw) < MIN_LENGTH:
        bad.append(f"be at least {MIN_LENGTH} characters long")
    if len(pw) > MAX_LENGTH:
        bad.append(f"be no longer than {MAX_LENGTH} characters")
    if not any(c.isupper() for c in pw):
        bad.append("contain a capital letter")
    if not any(c.islower() for c in pw):
        bad.append("contain a small letter")
    if not any(c.isdigit() for c in pw):
        bad.append("contain a number")
    if not any(c in SPECIALS for c in pw):
        bad.append("contain a symbol such as @ # $ !")
    if pw != pw.strip() or " " in pw:
        bad.append("not start, end or be broken up with spaces")
    if pw.lower() in BANNED:
        bad.append("not be a password everybody guesses first")

    return bad


def check_password(password: str, *, name: str = "", email: str = "") -> None:
    """Raise 400 listing every rule this password breaks."""
    bad = password_problems(password, name=name, email=email)
    if not bad:
        return
    raise HTTPException(400, "The password must " + "; ".join(bad) + ".")


def check_match(password: str, confirm: str) -> None:
    """Both boxes must agree.

    Checked on the server, not only in the browser: the confirm box exists so
    a typo cannot lock somebody out of a brand-new account, and a rule that
    lives only in JavaScript is not a rule. Blank is accepted so an API client
    that does not send the field is not broken by it — the browser always does.
    """
    if confirm and password != confirm:
        raise HTTPException(400, "The two passwords do not match.")


# ---------- History ----------
#
# Keeping the last few hashes stops the change-then-change-straight-back move,
# which otherwise defeats every forced reset. Hashes only — nothing stored here
# can be turned back into a password.
#
# Deliberately not paired with an expiry date. Scheduled rotation is what
# produces Summer2025! followed by Summer2026! and a note under the keyboard;
# NIST SP 800-63B advises against it for exactly that reason. Rotation here is
# event-driven instead: on a reset, on a suspected breach, on offboarding.

def check_not_reused(new_password: str, history: list[str] | None, current_hash: str = "") -> None:
    """Raise 400 when this password is one of the recent ones."""
    from .security import verify_password  # local import: security imports config, not this

    candidates = list(history or [])
    if current_hash:
        candidates.insert(0, current_hash)
    for old in candidates:
        if old and verify_password(new_password, old):
            raise HTTPException(
                400, "That password was used recently — please choose a different one."
            )


def push_history(history: list[str] | None, retiring_hash: str, keep: int) -> list[str]:
    """The history list with the password just replaced added, newest first."""
    out = [retiring_hash] + [h for h in (history or []) if h and h != retiring_hash]
    return out[:max(0, keep)]
