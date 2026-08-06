"""Sign-in, email verification, self sign-up and the first-run admin bootstrap.

There is no seeded admin: a fresh database exposes /api/auth/status with
`needs_bootstrap: true`, and the first POST to /api/auth/bootstrap creates the
owner account with full access. After that the endpoint refuses — new people
register (pending) and an admin approves them under Setup -> Users.

Email verification sits between the password and the session token:

  * a **user** proves their address once. Their first sign-in mails a passcode;
    from then on `email_verified` is true and every later sign-in is just
    email + password.
  * an **admin** proves it once per session lifetime. `otp_verified_at` records
    the last passcode they passed, and a sign-in more than
    OTP_ADMIN_REVERIFY_HOURS (24) later asks for a fresh one.

POST /login therefore answers with one of two shapes — a TokenResponse, or an
OtpChallenge holding a short-lived ticket the caller returns to /verify-otp.
"""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, require_admin, require_stepup
from ..mailer import MailError, send_otp_email
from ..passwords import MIN_LENGTH, RULES, check_password
from ..permissions import PERM_TREE, ALL_PERMS, ACCESS_PRESETS, clean_access
from ..security import (
    create_challenge_token, create_stepup_token, create_token, decode_challenge_token,
    generate_otp, hash_otp, hash_password, verify_otp, verify_password,
)
from ..vault import seal
from .. import models, schemas

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _norm(email: str) -> str:
    return (email or "").strip().lower()


def _find(db: Session, email: str) -> models.User | None:
    return db.query(models.User).filter(models.User.email == _norm(email)).first()


def _mask(email: str) -> str:
    """pr•••a@jaikvinglobal.com — enough to recognise the inbox, not to learn it."""
    name, _, domain = (email or "").partition("@")
    if not domain:
        return email or ""
    if len(name) <= 2:
        return f"{name[:1]}•••@{domain}"
    return f"{name[:2]}•••{name[-1]}@{domain}"


def _otp_reason(user: models.User) -> str | None:
    """Why this sign-in needs a passcode — None when it does not."""
    if not settings.otp_enabled:
        return None
    if user.role == "admin":
        last = user.otp_verified_at
        if last and datetime.utcnow() - last < timedelta(hours=settings.otp_admin_reverify_hours):
            return None
        return "admin_session_renewal"
    return None if user.email_verified else "user_first_login"


def _issue_session(db: Session, user: models.User) -> dict:
    user.last_login = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return {"token": create_token(user.id), "user": schemas.UserOut.model_validate(user), "otp_required": False}


def _start_challenge(db: Session, user: models.User, reason: str) -> dict:
    """Mail a fresh passcode and hand back the ticket that redeems it."""
    code = generate_otp()
    now = datetime.utcnow()
    user.otp_hash = hash_otp(code)
    user.otp_expires_at = now + timedelta(minutes=settings.otp_ttl_minutes)
    user.otp_sent_at = now
    user.otp_attempts = 0
    db.commit()

    try:
        delivered = send_otp_email(user.email, user.name, code, reason)
    except MailError:
        # The code is already stored; drop it so a later, working send is the
        # only live one, and say plainly that the mail — not the login — failed.
        user.otp_hash = None
        user.otp_expires_at = None
        db.commit()
        raise HTTPException(
            502,
            "Could not send the verification email. Check the mail settings on the "
            + ("server (MAIL_API_KEY / SMTP_FROM) and try again."
               if settings.mail_provider in ("brevo", "resend")
               else "server (SMTP_HOST / SMTP_USER / SMTP_PASSWORD) and try again. "
                    "If the host blocks outbound SMTP, set MAIL_PROVIDER to an email API."),
        )

    return {
        "otp_required": True,
        "challenge": create_challenge_token(user.id),
        "email": _mask(user.email),
        "reason": reason,
        "expires_in": settings.otp_ttl_minutes * 60,
        "resend_in": settings.otp_resend_seconds,
        "delivered": delivered,
        "dev_code": code if settings.otp_dev_echo else None,
    }


def _challenged_user(db: Session, challenge: str) -> models.User:
    uid = decode_challenge_token(challenge)
    if not uid:
        raise HTTPException(401, "This verification has expired — sign in again to get a new code")
    user = db.get(models.User, uid)
    if not user:
        raise HTTPException(401, "Account no longer exists")
    if user.status != "active":
        raise HTTPException(403, "This account is not active — ask the admin to approve it")
    return user


@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    """Open endpoint the login screen calls before showing a form."""
    return {
        "needs_bootstrap": db.query(models.User).count() == 0,
        "otp_enabled": settings.otp_enabled,
        "session_hours": round(settings.jwt_expire_minutes / 60, 2),
        # So the form can list the same rules the API enforces.
        "password_rules": RULES,
        "password_min_length": MIN_LENGTH,
    }


@router.get("/permissions")
def permission_catalogue():
    """The access tree and presets, so the UI ticks exactly what the API enforces."""
    return {"tree": PERM_TREE, "all": ALL_PERMS, "presets": ACCESS_PRESETS}


@router.post("/bootstrap", response_model=schemas.TokenResponse, status_code=201)
def bootstrap(body: schemas.BootstrapRequest, db: Session = Depends(get_db)):
    if db.query(models.User).count() > 0:
        raise HTTPException(409, "This system already has an admin — please sign in")
    check_password(body.password, name=body.name, email=body.email)
    now = datetime.utcnow()
    user = models.User(
        email=_norm(body.email), name=body.name.strip(),
        password_hash=hash_password(body.password),
        password_enc=seal(body.password),
        role="admin", status="active", access=list(ALL_PERMS),
        last_login=now,
        # The person typing this owns the machine and the mailbox both; making
        # them wait for a code before the system exists yet would only be able
        # to lock them out of it.
        email_verified=True, email_verified_at=now, otp_verified_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user.id), "user": schemas.UserOut.model_validate(user), "otp_required": False}


@router.post("/register", response_model=schemas.UserOut, status_code=201)
def register(body: schemas.RegisterRequest, db: Session = Depends(get_db)):
    if db.query(models.User).count() == 0:
        raise HTTPException(400, "No admin exists yet — create the first account instead")
    if _find(db, body.email):
        raise HTTPException(409, "That email is already registered")
    check_password(body.password, name=body.name, email=body.email)
    user = models.User(
        email=_norm(body.email), name=body.name.strip(),
        password_hash=hash_password(body.password),
        password_enc=seal(body.password),
        role="user", status="pending",
        access=clean_access(ACCESS_PRESETS["operations"]["perms"]),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login")
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Password first. Answers with a session token, or with an OtpChallenge
    when this sign-in still owes an email verification."""
    user = _find(db, body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    if user.status == "pending":
        raise HTTPException(403, "This account is waiting for admin approval")
    if user.status != "active":
        raise HTTPException(403, "This account has been disabled")

    reason = _otp_reason(user)
    if reason:
        return _start_challenge(db, user, reason)
    return _issue_session(db, user)


def _consume_otp(db: Session, user: models.User, typed: str) -> None:
    """Check a typed code against the live challenge and spend it.

    Every way of getting it wrong is handled here — no code waiting, expired,
    too many tries, simply wrong — so sign-in and the admin step-up cannot
    drift into enforcing different rules.
    """
    code = (typed or "").strip()

    if not user.otp_hash or not user.otp_expires_at:
        raise HTTPException(400, "No code is waiting — sign in again to get a new one")
    if datetime.utcnow() > user.otp_expires_at:
        user.otp_hash = None
        user.otp_expires_at = None
        db.commit()
        raise HTTPException(400, "That code has expired — ask for a new one")
    if user.otp_attempts >= settings.otp_max_attempts:
        user.otp_hash = None
        user.otp_expires_at = None
        db.commit()
        raise HTTPException(429, "Too many wrong codes — ask for a new one")

    if not verify_otp(code, user.otp_hash):
        user.otp_attempts = (user.otp_attempts or 0) + 1
        left = max(0, settings.otp_max_attempts - user.otp_attempts)
        if left == 0:
            user.otp_hash = None
            user.otp_expires_at = None
        db.commit()
        raise HTTPException(
            400,
            "That code is not right — ask for a new one" if left == 0
            else f"That code is not right — {left} attempt{'' if left == 1 else 's'} left",
        )

    now = datetime.utcnow()
    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = now
    user.otp_verified_at = now
    user.otp_hash = None
    user.otp_expires_at = None
    user.otp_attempts = 0
    db.commit()


@router.post("/verify-otp", response_model=schemas.TokenResponse)
def verify_otp_code(body: schemas.OtpVerifyRequest, db: Session = Depends(get_db)):
    user = _challenged_user(db, body.challenge)
    _consume_otp(db, user, body.code)
    return _issue_session(db, user)


@router.post("/resend-otp", response_model=schemas.OtpChallenge)
def resend_otp(body: schemas.OtpResendRequest, db: Session = Depends(get_db)):
    user = _challenged_user(db, body.challenge)
    reason = _otp_reason(user)
    if not reason and user.role == "admin" and user.otp_hash:
        # An admin confirming a sensitive action has already verified today, so
        # nothing is *owed* — the code outstanding is the step-up one.
        reason = "admin_step_up"
    if not reason:
        raise HTTPException(400, "This account no longer needs a code — sign in normally")

    if user.otp_sent_at:
        waited = (datetime.utcnow() - user.otp_sent_at).total_seconds()
        if waited < settings.otp_resend_seconds:
            raise HTTPException(
                429, f"Please wait {int(settings.otp_resend_seconds - waited) + 1}s before asking again"
            )
    return _start_challenge(db, user, reason)


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(current_user)):
    return user


# ---------- Step-up: prove it is really the admin, right now ----------
#
# Reading a password back or setting a new one is not something a session that
# has been open all day should be able to do on its own, so both ask for a
# fresh code first. The grant that comes back lasts STEPUP_TTL_MINUTES and is
# bound to the admin who earned it.

@router.post("/step-up/start", response_model=schemas.OtpChallenge)
def step_up_start(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    if not settings.otp_enabled:
        raise HTTPException(400, "Email confirmation is switched off on this server")
    return _start_challenge(db, admin, "admin_step_up")


@router.post("/step-up/verify", response_model=schemas.StepUpGrant)
def step_up_verify(
    body: schemas.OtpVerifyRequest,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # The ticket must be the one this very admin was handed.
    if decode_challenge_token(body.challenge) != admin.id:
        raise HTTPException(401, "That confirmation has expired — ask for a new code")
    _consume_otp(db, admin, body.code)
    return {
        "grant": create_stepup_token(admin.id),
        "expires_in": settings.stepup_ttl_minutes * 60,
    }


@router.post("/change-password", status_code=204)
def change_password(
    body: schemas.PasswordChange,
    admin: models.User = Depends(require_stepup),
    db: Session = Depends(get_db),
):
    """An admin changing their own password. Everyone else's goes through
    PUT /api/users/{id}/password — also admin-only, also passcode-confirmed."""
    if not verify_password(body.current_password, admin.password_hash):
        raise HTTPException(400, "Your current password is not correct")
    check_password(body.new_password, name=admin.name, email=admin.email)
    if verify_password(body.new_password, admin.password_hash):
        raise HTTPException(400, "The new password must be different from the current one")
    admin.password_hash = hash_password(body.new_password)
    admin.password_enc = seal(body.new_password)
    db.commit()
    return None
