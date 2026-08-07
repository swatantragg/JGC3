"""Admin-only user management — create people, tick access, remove them,
unlock an account and set a new password.

Two guards protect the system from locking itself out: an admin cannot delete
or disable their own account, and the last remaining admin cannot be demoted.

Passwords are the sharp end, and there are two rules about them:

  * **nobody can read one back.** There used to be a "reveal password" screen,
    backed by a reversible encrypted copy of every password in the database.
    It is gone. A bcrypt hash is one-way, which means a database dump is no
    longer a plaintext credential dump — and since people reuse passwords, it
    was never only this system that copy put at risk.
  * **an admin-set password is temporary by construction.** It gets read out
    over a phone or typed into a chat window, so it is not a secret; the
    account is flagged `must_change_password` and the holder replaces it
    before any other screen opens. After that only they know the live one.

Setting a password still sits behind `require_stepup`, so a passcode answered
minutes ago is needed on top of the session.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_admin, require_stepup
from ..passwords import check_match, check_not_reused, check_password, push_history
from ..permissions import ALL_PERMS, clean_access
from ..security import hash_password
from .. import audit, lockout, models, ratelimit, schemas

router = APIRouter(prefix="/api/users", tags=["users"], dependencies=[Depends(require_admin)])


def _norm(email: str) -> str:
    return (email or "").strip().lower()


def _reset_verification(obj: models.User) -> None:
    """Forget that this address was ever proved, and burn any live passcode."""
    obj.email_verified = False
    obj.email_verified_at = None
    obj.otp_verified_at = None
    obj.otp_hash = None
    obj.otp_expires_at = None
    obj.otp_attempts = 0


def _other_admins(db: Session, uid: str) -> int:
    return (
        db.query(models.User)
        .filter(models.User.role == "admin", models.User.status == "active", models.User.id != uid)
        .count()
    )


@router.get("", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.created_at).all()


@router.post("", response_model=schemas.UserOut, status_code=201)
def create_user(
    body: schemas.UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    me: models.User = Depends(require_admin),
):
    if db.query(models.User).filter(models.User.email == _norm(body.email)).first():
        raise HTTPException(409, "That email is already registered")
    check_match(body.password, body.confirm_password)
    check_password(body.password, name=body.name, email=body.email)
    role = "admin" if body.role == "admin" else "user"
    obj = models.User(
        email=_norm(body.email), name=body.name.strip(),
        password_hash=hash_password(body.password), role=role,
        status=body.status if body.status in ("active", "pending", "disabled") else "active",
        access=list(ALL_PERMS) if role == "admin" else clean_access(body.access),
        token_version=1,
        password_changed_at=datetime.utcnow(),
        password_history=[],
        # On unless the admin deliberately turns it off. The password they just
        # typed has to be told to somebody, over a channel nobody controls.
        must_change_password=bool(body.must_change_password),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    audit.write(db, audit.USER_CREATED, request=request, actor=me, target_id=obj.id,
                target_label=obj.email,
                detail={"role": obj.role, "status": obj.status,
                        "must_change_password": obj.must_change_password})
    return obj


@router.put("/{uid}", response_model=schemas.UserOut)
def update_user(
    uid: str,
    body: schemas.UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    me: models.User = Depends(require_admin),
):
    obj = db.get(models.User, uid)
    if not obj:
        raise HTTPException(404, "User not found")
    data = body.model_dump(exclude_unset=True)

    if obj.role == "admin" and not _other_admins(db, uid):
        if data.get("role") not in (None, "admin") or data.get("status") not in (None, "active"):
            raise HTTPException(400, "This is the last admin — promote someone else first")

    # A password may not ride along with a rename or an access change: setting
    # one needs a passcode answered minutes ago, which this route does not ask
    # for. PUT /api/users/{id}/password is the only way in.
    if data.pop("password", None):
        raise HTTPException(400, "Use the password screen — a password change needs an emailed code")

    changed: list[str] = []

    if "email" in data and data["email"]:
        email = _norm(data.pop("email"))
        clash = db.query(models.User).filter(models.User.email == email, models.User.id != uid).first()
        if clash:
            raise HTTPException(409, "That email is already registered")
        if email != obj.email:
            # A different mailbox has proved nothing — the new one is verified
            # by a passcode on the next sign-in, exactly like a new account.
            _reset_verification(obj)
            changed.append("email")
        obj.email = email

    if "role" in data and data["role"]:
        if obj.role != data["role"]:
            changed.append("role")
        obj.role = "admin" if data["role"] == "admin" else "user"
    if "status" in data and data["status"]:
        if obj.status != data["status"]:
            changed.append("status")
        obj.status = data["status"]
    if "name" in data and data["name"]:
        obj.name = data["name"].strip()
    if "access" in data and data["access"] is not None:
        obj.access = clean_access(data["access"])
        changed.append("access")
    # Admins always hold everything, whatever the ticks said.
    if obj.role == "admin":
        obj.access = list(ALL_PERMS)

    # Anything that changes what this account may do ends its open sessions.
    # Otherwise a person whose rights were just cut — or who was just disabled
    # — keeps the access they had for the rest of the day, which is precisely
    # the window an offboarding is meant to close.
    if {"role", "status", "access", "email"} & set(changed):
        obj.token_version = (obj.token_version or 1) + 1

    db.commit()
    db.refresh(obj)
    audit.write(db, audit.USER_UPDATED, request=request, actor=me, target_id=obj.id,
                target_label=obj.email, detail={"changed": changed})
    return obj


# ---------- Passwords: admin only, and only just after a passcode ----------

@router.put("/{uid}/password", response_model=schemas.UserOut)
def set_password(
    uid: str,
    body: schemas.PasswordSet,
    request: Request,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_stepup),
):
    """Set an account's password.

    The way back in for somebody who has forgotten theirs — the reveal screen
    that used to serve that purpose is gone, and this replaces it. The new
    password is temporary by construction: the holder must change it at their
    next sign-in, so the one the admin typed stops working the moment it has
    done its job.
    """
    ratelimit.check(db, ratelimit.account_bucket("pwadmin", admin.email),
                    settings.rl_password_admin)
    obj = db.get(models.User, uid)
    if not obj:
        raise HTTPException(404, "User not found")

    check_match(body.new_password, body.confirm_password)
    check_password(body.new_password, name=obj.name, email=obj.email)
    check_not_reused(body.new_password, obj.password_history, obj.password_hash)

    if obj.password_hash:
        obj.password_history = push_history(
            obj.password_history, obj.password_hash, settings.password_history_size
        )
    obj.password_hash = hash_password(body.new_password)
    obj.password_changed_at = datetime.utcnow()
    # An admin-set password opens exactly one screen: the one that replaces it.
    obj.must_change_password = True
    # Every session this account had open dies here. A password reset is
    # usually a response to something going wrong; leaving the old sessions
    # running would make it decorative.
    obj.token_version = (obj.token_version or 1) + 1
    # A forgotten password and a locked account are the same call for help.
    lockout.clear(db, obj)   # commits

    db.refresh(obj)
    audit.write(db, audit.USER_PASSWORD_SET, request=request, actor=admin, target_id=obj.id,
                target_label=obj.email)
    return obj


@router.post("/{uid}/unlock", response_model=schemas.UserOut)
def unlock_user(
    uid: str,
    request: Request,
    db: Session = Depends(get_db),
    me: models.User = Depends(require_admin),
):
    """Open an account that locked itself after too many failed sign-ins.

    The holder can normally do this themselves by answering a code at their
    own address; this is for when the mailbox is the problem. No step-up: it
    grants no access on its own — the password is still needed.
    """
    obj = db.get(models.User, uid)
    if not obj:
        raise HTTPException(404, "User not found")
    lockout.clear(db, obj)
    db.refresh(obj)
    audit.write(db, audit.UNLOCK_ADMIN, request=request, actor=me, target_id=obj.id,
                target_label=obj.email)
    return obj


@router.post("/{uid}/sign-out", response_model=schemas.UserOut)
def sign_out_user(
    uid: str,
    request: Request,
    db: Session = Depends(get_db),
    me: models.User = Depends(require_admin),
):
    """End every session this account has open, everywhere.

    For the lost laptop and the phone left in a taxi. Bumping the version is
    what makes it real — a token already issued is otherwise good until it
    expires, whatever is done to the account.
    """
    obj = db.get(models.User, uid)
    if not obj:
        raise HTTPException(404, "User not found")
    obj.token_version = (obj.token_version or 1) + 1
    db.commit()
    db.refresh(obj)
    audit.write(db, audit.LOGOUT, request=request, actor=me, target_id=obj.id,
                target_label=obj.email, detail={"forced": True})
    return obj


@router.delete("/{uid}", status_code=204)
def delete_user(
    uid: str,
    request: Request,
    db: Session = Depends(get_db),
    me: models.User = Depends(require_admin),
):
    if uid == me.id:
        raise HTTPException(400, "You cannot delete your own account")
    obj = db.get(models.User, uid)
    if not obj:
        return None
    if obj.role == "admin" and not _other_admins(db, uid):
        raise HTTPException(400, "This is the last admin — promote someone else first")
    label = obj.email
    db.delete(obj)
    db.commit()
    audit.write(db, audit.USER_DELETED, request=request, actor=me, target_id=uid,
                target_label=label)
    return None
