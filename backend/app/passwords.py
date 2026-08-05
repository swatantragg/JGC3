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
