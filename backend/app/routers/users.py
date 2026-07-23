"""Admin-only user management — approve sign-ups, tick access, remove people.

Two guards protect the system from locking itself out: an admin cannot delete
or disable their own account, and the last remaining admin cannot be demoted.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..permissions import ALL_PERMS, clean_access
from ..security import hash_password
from .. import models, schemas

router = APIRouter(prefix="/api/users", tags=["users"], dependencies=[Depends(require_admin)])


def _norm(email: str) -> str:
    return (email or "").strip().lower()


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
def create_user(body: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == _norm(body.email)).first():
        raise HTTPException(409, "That email is already registered")
    role = "admin" if body.role == "admin" else "user"
    obj = models.User(
        email=_norm(body.email), name=body.name.strip(),
        password_hash=hash_password(body.password), role=role,
        status=body.status if body.status in ("active", "pending", "disabled") else "active",
        access=list(ALL_PERMS) if role == "admin" else clean_access(body.access),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{uid}", response_model=schemas.UserOut)
def update_user(
    uid: str,
    body: schemas.UserUpdate,
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

    if "password" in data and data["password"]:
        obj.password_hash = hash_password(data.pop("password"))
    data.pop("password", None)

    if "email" in data and data["email"]:
        email = _norm(data.pop("email"))
        clash = db.query(models.User).filter(models.User.email == email, models.User.id != uid).first()
        if clash:
            raise HTTPException(409, "That email is already registered")
        obj.email = email

    if "role" in data and data["role"]:
        obj.role = "admin" if data["role"] == "admin" else "user"
    if "status" in data and data["status"]:
        obj.status = data["status"]
    if "name" in data and data["name"]:
        obj.name = data["name"].strip()
    if "access" in data and data["access"] is not None:
        obj.access = clean_access(data["access"])
    # Admins always hold everything, whatever the ticks said.
    if obj.role == "admin":
        obj.access = list(ALL_PERMS)

    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{uid}", status_code=204)
def delete_user(uid: str, db: Session = Depends(get_db), me: models.User = Depends(require_admin)):
    if uid == me.id:
        raise HTTPException(400, "You cannot delete your own account")
    obj = db.get(models.User, uid)
    if not obj:
        return None
    if obj.role == "admin" and not _other_admins(db, uid):
        raise HTTPException(400, "This is the last admin — promote someone else first")
    db.delete(obj)
    db.commit()
    return None
