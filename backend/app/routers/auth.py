"""Sign-in, email verification, account unlocking and the first-run bootstrap.

There is no seeded admin and no public sign-up. A fresh database exposes
/api/auth/status with `needs_bootstrap: true`, and the first POST to
/api/auth/bootstrap creates the owner account with full access. After that the
endpoint refuses, and every further account is made by an admin under
Setup -> Users. Self-registration used to live here; it was removed because a
public endpoint that answers "that email is already registered" is a free list
of who works here, which is the first step of a targeted phishing run.

Email verification sits between the password and the session token:

  * a **user** proves their address once. Their first sign-in mails a passcode;
    from then on `email_verified` is true and every later sign-in is just
    email + password.
  * an **admin** proves it once a day. `otp_verified_at` records the last
    passcode they passed, and the first sign-in of a new calendar day — read in
    APP_TIMEZONE, so midnight means the office's midnight — asks for a fresh
    one. A session already open is not cut short by midnight; the *next
    sign-in* is what asks.

Three rules hold across everything below:

  * **the session leaves in an httpOnly cookie**, never in the response body.
    A token the page can read is a token an injected script can read.
  * **every failure looks the same.** Wrong password, no such account, waiting
    for approval, disabled — one 401, one wording. The only exception is a
    locked account, which has to say so because there is something the holder
    must do about it.
  * **an unknown address still costs a bcrypt.** Otherwise the reply comes
    back in microseconds for addresses that do not exist and ~100ms for ones
    that do, and the difference is a login-free way to enumerate staff.
"""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import current_user, require_admin, require_stepup, session_token
from ..mailer import MailError, send_lockout_warning, send_otp_email
from ..passwords import (
    MIN_LENGTH, RULES, check_match, check_not_reused, check_password, push_history,
)
from ..permissions import PERM_TREE, ALL_PERMS, ACCESS_PRESETS
from ..security import (
    burn_time, create_challenge_token, create_stepup_token, create_token,
    create_unlock_token, decode_challenge_token, decode_token, decode_unlock_token,
    generate_otp, hash_otp, hash_password, verify_otp, verify_password,
)
from ..timeutil import next_local_midnight, same_local_day
from .. import audit, lockout, models, ratelimit, schemas

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# One wording for every way a sign-in can fail that is not a lockout. Saying
# "no such account" or "waiting for approval" tells a stranger which addresses
# are real; the person who actually owns the account learns the difference
# from the email they were sent, where only they can read it.
SIGNIN_FAILED = "Email or password is incorrect"


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


# ---------- The session cookie ----------

def _set_session_cookie(response: Response, token: str) -> None:
    """httpOnly so no script can read it; Secure so it never crosses plain
    HTTP; SameSite so a form on another site cannot make the browser send it,
    which is what CSRF needs to work."""
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure or settings.is_production,
        samesite=settings.cookie_samesite,
        path="/",
        domain=settings.cookie_domain or None,
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.cookie_name,
        path="/",
        domain=settings.cookie_domain or None,
        httponly=True,
        secure=settings.cookie_secure or settings.is_production,
        samesite=settings.cookie_samesite,
    )


def _admin_code_still_good(last: datetime | None) -> bool:
    """Is an admin's last passcode still standing?

    In "midnight" mode it stands until the end of the calendar day it was given
    on, read in the office's timezone — so the first sign-in of a new day asks
    for a fresh one, whatever the hour. In "hours" mode it is the older rolling
    window instead. Consulted at *sign-in* only: an admin already working when
    midnight passes is not thrown out, their session runs its own course.
    """
    if not last:
        return False
    if settings.otp_admin_reverify_mode == "hours":
        return datetime.utcnow() - last < timedelta(hours=settings.otp_admin_reverify_hours)
    return same_local_day(last, datetime.utcnow())


def _otp_reason(user: models.User) -> str | None:
    """Why this sign-in needs a passcode — None when it does not."""
    if not settings.otp_enabled:
        return None
    if user.role == "admin":
        return None if _admin_code_still_good(user.otp_verified_at) else "admin_session_renewal"
    return None if user.email_verified else "user_first_login"


def _issue_session(db: Session, user: models.User, response: Response) -> dict:
    user.last_login = datetime.utcnow()
    lockout.record_success(db, user)   # commits
    db.refresh(user)
    _set_session_cookie(response, create_token(user.id, user.token_version or 1))
    return {
        "user": schemas.UserOut.model_validate(user),
        "otp_required": False,
        "must_change_password": bool(user.must_change_password),
    }


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
    }


def _challenged_user(db: Session, challenge: str) -> models.User:
    uid = decode_challenge_token(challenge)
    if not uid:
        raise HTTPException(401, "This verification has expired — sign in again to get a new code")
    user = db.get(models.User, uid)
    if not user:
        raise HTTPException(401, SIGNIN_FAILED)
    if user.status != "active":
        raise HTTPException(401, SIGNIN_FAILED)
    return user


@router.get("/status")
def auth_status(request: Request, db: Session = Depends(get_db)):
    """Open endpoint the login screen calls before showing a form."""
    ratelimit.check(db, ratelimit.ip_bucket("public", request), settings.rl_public_ip)
    return {
        "needs_bootstrap": db.query(models.User).count() == 0,
        "otp_enabled": settings.otp_enabled,
        "session_hours": round(settings.jwt_expire_minutes / 60, 2),
        "admin_reverify": settings.otp_admin_reverify_mode,
        "timezone": settings.app_timezone,
        # So the form can list the same rules the API enforces.
        "password_rules": RULES,
        "password_min_length": MIN_LENGTH,
        # Accounts are created by an admin; the login screen hides its
        # "create an account" link accordingly.
        "self_registration": False,
    }


@router.get("/permissions")
def permission_catalogue(request: Request, db: Session = Depends(get_db)):
    """The access tree and presets, so the UI ticks exactly what the API enforces."""
    ratelimit.check(db, ratelimit.ip_bucket("public", request), settings.rl_public_ip)
    return {"tree": PERM_TREE, "all": ALL_PERMS, "presets": ACCESS_PRESETS}


@router.post("/bootstrap", response_model=schemas.TokenResponse, status_code=201)
def bootstrap(
    body: schemas.BootstrapRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    ratelimit.check(db, ratelimit.ip_bucket("bootstrap", request), settings.rl_login_ip)
    if db.query(models.User).count() > 0:
        raise HTTPException(409, "This system already has an admin — please sign in")
    check_match(body.password, body.confirm_password)
    check_password(body.password, name=body.name, email=body.email)
    now = datetime.utcnow()
    user = models.User(
        email=_norm(body.email), name=body.name.strip(),
        password_hash=hash_password(body.password),
        role="admin", status="active", access=list(ALL_PERMS),
        last_login=now,
        # The person typing this owns the machine and the mailbox both; making
        # them wait for a code before the system exists yet would only be able
        # to lock them out of it.
        email_verified=True, email_verified_at=now, otp_verified_at=now,
        token_version=1, password_changed_at=now, password_history=[],
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit.write(db, audit.BOOTSTRAP, request=request, actor=user, target_id=user.id,
                target_label=user.email)
    _set_session_cookie(response, create_token(user.id, user.token_version))
    return {"user": schemas.UserOut.model_validate(user), "otp_required": False,
            "must_change_password": False}


@router.post("/login")
def login(
    body: schemas.LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Password first. Answers with a session cookie, or with an OtpChallenge
    when this sign-in still owes an email verification."""
    email = _norm(body.email)
    ip_bucket = ratelimit.ip_bucket("login", request)
    acct_bucket = ratelimit.account_bucket("login", email)

    # Tested but not spent: a correct password must not eat into the budget
    # the wrong ones are counted against, or a busy honest morning would look
    # exactly like an attack.
    ratelimit.check(db, ip_bucket, settings.rl_login_ip, record=False)

    user = _find(db, email)

    if not user:
        burn_time()                       # an unknown address costs what a real one costs
        ratelimit.spend(db, ip_bucket)
        ratelimit.spend(db, acct_bucket)
        audit.write(db, audit.LOGIN_FAIL, request=request, actor_email=email,
                    outcome="denied", detail={"reason": "no_such_account"})
        raise HTTPException(401, SIGNIN_FAILED)

    # Before the password, so a locked account cannot be probed for whether a
    # guess was right — the lock would otherwise still leak the answer.
    try:
        lockout.guard(user)
    except HTTPException:
        audit.write(db, audit.LOGIN_BLOCKED, request=request, actor=user,
                    target_id=user.id, outcome="denied",
                    detail={"reason": "locked", "hard": bool(user.hard_locked)})
        raise

    if not verify_password(body.password, user.password_hash):
        ratelimit.spend(db, ip_bucket)
        ratelimit.spend(db, acct_bucket)
        locked = lockout.record_failure(db, user, ratelimit.client_ip(request))
        audit.write(db, audit.LOGIN_FAIL, request=request, actor=user, target_id=user.id,
                    outcome="denied",
                    detail={"reason": "bad_password", "failures": user.failed_attempts})
        if locked:
            audit.write(db, audit.LOCKED_HARD if locked == "hard" else audit.LOCKED_SOFT,
                        request=request, actor=user, target_id=user.id, outcome="denied",
                        detail={"failures": user.failed_attempts})
            _warn_owner(user, locked)
            lockout.guard(user)           # raises with the right 423
        raise HTTPException(401, SIGNIN_FAILED)

    # Right password. Everything that is still wrong with this account reads
    # the same as a wrong password, so the reply cannot be used to sort real
    # addresses from invented ones.
    if user.status != "active":
        ratelimit.spend(db, ip_bucket)
        audit.write(db, audit.LOGIN_FAIL, request=request, actor=user, target_id=user.id,
                    outcome="denied", detail={"reason": f"status_{user.status}"})
        raise HTTPException(401, SIGNIN_FAILED)

    ratelimit.clear(db, acct_bucket)      # a good password wipes the account's run

    reason = _otp_reason(user)
    if reason:
        out = _start_challenge(db, user, reason)
        audit.write(db, audit.OTP_SENT, request=request, actor=user, target_id=user.id,
                    detail={"reason": reason})
        return out

    audit.write(db, audit.LOGIN_OK, request=request, actor=user, target_id=user.id)
    return _issue_session(db, user, response)


def _warn_owner(user: models.User, tier: str) -> None:
    """Tell the account holder their account was just locked.

    The one person who benefits from knowing is the one being attacked, and
    the message goes to the address on file — so it reaches them and not
    whoever was doing the guessing. Never raises: the lock is already applied,
    which was the security-relevant part.
    """
    send_lockout_warning(
        user.email, user.name, tier, settings.lockout_soft_minutes,
        (user.last_failed_at or datetime.utcnow()).strftime("%d %b %Y, %H:%M UTC"),
        user.last_failed_ip or "",
    )


def _consume_otp(db: Session, user: models.User, typed: str) -> None:
    """Check a typed code against the live challenge and spend it.

    Every way of getting it wrong is handled here — no code waiting, expired,
    too many tries, simply wrong — so sign-in, the admin step-up and the
    unlock path cannot drift into enforcing different rules.
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
def verify_otp_code(
    body: schemas.OtpVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    user = _challenged_user(db, body.challenge)
    ratelimit.check(db, ratelimit.account_bucket("otpverify", user.email),
                    settings.rl_otp_verify_account)
    try:
        _consume_otp(db, user, body.code)
    except HTTPException:
        audit.write(db, audit.OTP_FAIL, request=request, actor=user, target_id=user.id,
                    outcome="denied")
        raise
    audit.write(db, audit.OTP_OK, request=request, actor=user, target_id=user.id)
    audit.write(db, audit.LOGIN_OK, request=request, actor=user, target_id=user.id)
    return _issue_session(db, user, response)


@router.post("/resend-otp", response_model=schemas.OtpChallenge)
def resend_otp(body: schemas.OtpResendRequest, request: Request, db: Session = Depends(get_db)):
    user = _challenged_user(db, body.challenge)
    ratelimit.check(db, ratelimit.account_bucket("otpsend", user.email),
                    settings.rl_otp_send_account)
    ratelimit.check(db, ratelimit.ip_bucket("otpsend", request), settings.rl_otp_send_ip)

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
            wait = int(settings.otp_resend_seconds - waited) + 1
            raise HTTPException(
                429, f"Please wait {wait}s before asking again",
                headers={"Retry-After": str(wait)},
            )
    return _start_challenge(db, user, reason)


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(current_user)):
    """Deliberately on `current_user` and not `active_user`: an account that
    still owes a password change has to be able to load itself, or the screen
    that fixes it could never be drawn."""
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Sign out here and everywhere.

    Bumping `token_version` is what makes this real — dropping the cookie only
    tidies this browser, while a token already copied out of it would stay
    good for the rest of its 24 hours. Answers 204 either way: a caller with a
    dead token is trying to sign out, and has succeeded.
    """
    token = session_token(request)
    payload = decode_token(token or "") if token else None
    if payload and payload.get("purpose") == "session":
        user = db.get(models.User, payload.get("sub"))
        if user:
            user.token_version = (user.token_version or 1) + 1
            db.commit()
            audit.write(db, audit.LOGOUT, request=request, actor=user, target_id=user.id)
    _clear_session_cookie(response)
    return None


# ---------- Unlocking an account that locked itself ----------
#
# A lock only an admin can clear is a weapon: anyone who knows an address can
# shut that account with five wrong guesses, and do it again every time the
# admin opens it. So the holder can always clear it by answering a code at
# their own registered address — which an attacker cannot read.

@router.post("/unlock/start", response_model=schemas.OtpChallenge)
def unlock_start(
    body: schemas.UnlockStartRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    email = _norm(body.email)
    ratelimit.check(db, ratelimit.account_bucket("unlock", email), settings.rl_unlock_account)
    ratelimit.check(db, ratelimit.ip_bucket("otpsend", request), settings.rl_otp_send_ip)

    user = _find(db, email)
    locked = bool(user) and lockout.state(user)[0]

    if not user or not locked or user.status != "active":
        # Same shape, same timing, whatever is true — otherwise this endpoint
        # becomes the enumeration oracle that /login was just closed against.
        burn_time()
        return {
            "otp_required": True,
            "challenge": create_unlock_token("none"),
            "email": _mask(email),
            "reason": "account_unlock",
            "expires_in": settings.otp_ttl_minutes * 60,
            "resend_in": settings.otp_resend_seconds,
            "delivered": True,
        }

    out = _start_challenge(db, user, "account_unlock")
    out["challenge"] = create_unlock_token(user.id)
    audit.write(db, audit.OTP_SENT, request=request, actor=user, target_id=user.id,
                detail={"reason": "account_unlock"})
    return out


@router.post("/unlock/verify", status_code=204)
def unlock_verify(
    body: schemas.UnlockVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Clears the lock. Grants no session — the person still has to sign in,
    with a password they must therefore still know."""
    uid = decode_unlock_token(body.challenge)
    if not uid or uid == "none":
        raise HTTPException(400, "That code has expired — ask for a new one")
    user = db.get(models.User, uid)
    if not user:
        raise HTTPException(400, "That code has expired — ask for a new one")

    ratelimit.check(db, ratelimit.account_bucket("otpverify", user.email),
                    settings.rl_otp_verify_account)
    _consume_otp(db, user, body.code)
    lockout.clear(db, user)
    audit.write(db, audit.UNLOCK_SELF, request=request, actor=user, target_id=user.id)
    return None


# ---------- Step-up: prove it is really the admin, right now ----------
#
# Setting somebody else's password is not something a session that has been
# open all day should be able to do on its own, so it asks for a fresh code
# first. The grant that comes back lasts STEPUP_TTL_MINUTES and is bound to
# the admin who earned it.

@router.post("/step-up/start", response_model=schemas.OtpChallenge)
def step_up_start(
    request: Request,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not settings.otp_enabled:
        raise HTTPException(400, "Email confirmation is switched off on this server")
    ratelimit.check(db, ratelimit.account_bucket("otpsend", admin.email),
                    settings.rl_otp_send_account)
    if admin.otp_sent_at:
        waited = (datetime.utcnow() - admin.otp_sent_at).total_seconds()
        if waited < settings.otp_resend_seconds:
            wait = int(settings.otp_resend_seconds - waited) + 1
            raise HTTPException(
                429, f"Please wait {wait}s before asking again",
                headers={"Retry-After": str(wait)},
            )
    return _start_challenge(db, admin, "admin_step_up")


@router.post("/step-up/verify", response_model=schemas.StepUpGrant)
def step_up_verify(
    body: schemas.OtpVerifyRequest,
    request: Request,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # The ticket must be the one this very admin was handed.
    if decode_challenge_token(body.challenge) != admin.id:
        raise HTTPException(401, "That confirmation has expired — ask for a new code")
    ratelimit.check(db, ratelimit.account_bucket("otpverify", admin.email),
                    settings.rl_otp_verify_account)
    _consume_otp(db, admin, body.code)
    audit.write(db, audit.STEPUP_OK, request=request, actor=admin, target_id=admin.id)
    return {
        "grant": create_stepup_token(admin.id),
        "expires_in": settings.stepup_ttl_minutes * 60,
    }


# ---------- Changing your own password ----------

def _apply_new_password(db: Session, user: models.User, new_password: str) -> None:
    """Shared tail of every self-service password change: history, the hash,
    and the version bump that ends every other session this account has open.
    Somebody changing their password after a scare expects exactly that."""
    if user.password_hash:
        user.password_history = push_history(
            user.password_history, user.password_hash, settings.password_history_size
        )
    user.password_hash = hash_password(new_password)
    user.password_changed_at = datetime.utcnow()
    user.must_change_password = False
    user.token_version = (user.token_version or 1) + 1
    db.commit()


@router.post("/change-password", status_code=204)
def change_password(
    body: schemas.PasswordChange,
    request: Request,
    response: Response,
    admin: models.User = Depends(require_stepup),
    db: Session = Depends(get_db),
):
    """An admin changing their own password, confirmed by a fresh passcode."""
    if not verify_password(body.current_password, admin.password_hash):
        raise HTTPException(400, "Your current password is not correct")
    check_match(body.new_password, body.confirm_password)
    check_password(body.new_password, name=admin.name, email=admin.email)
    check_not_reused(body.new_password, admin.password_history, admin.password_hash)

    _apply_new_password(db, admin, body.new_password)
    audit.write(db, audit.PASSWORD_CHANGED, request=request, actor=admin, target_id=admin.id)
    # The bump above invalidated the cookie this very request arrived with, so
    # a fresh one is issued rather than leaving the person staring at a 401.
    db.refresh(admin)
    _set_session_cookie(response, create_token(admin.id, admin.token_version))
    return None


@router.post("/change-password/forced", status_code=204)
def change_password_forced(
    body: schemas.ForcedPasswordChange,
    request: Request,
    response: Response,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Replacing a password an admin set, at first sign-in.

    The only password route that asks for no passcode. The person is holding a
    password somebody read out to them, and the point is to retire it within
    seconds — requiring a mailed code as well would strand anyone whose
    mailbox is the very thing being set up. The current password still has to
    be typed, so possession of the open tab alone is not enough.
    """
    if not user.must_change_password:
        raise HTTPException(400, "This account does not have a password change outstanding")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is not correct")
    check_match(body.new_password, body.confirm_password)
    check_password(body.new_password, name=user.name, email=user.email)
    check_not_reused(body.new_password, user.password_history, user.password_hash)

    _apply_new_password(db, user, body.new_password)
    audit.write(db, audit.PASSWORD_CHANGED, request=request, actor=user, target_id=user.id,
                detail={"forced": True})
    db.refresh(user)
    _set_session_cookie(response, create_token(user.id, user.token_version))
    return None
