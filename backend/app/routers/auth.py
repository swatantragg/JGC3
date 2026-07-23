"""Sign-in, self sign-up and the first-run admin bootstrap.

There is no seeded admin: a fresh database exposes /api/auth/status with
`needs_bootstrap: true`, and the first POST to /api/auth/bootstrap creates the
owner account with full access. After that the endpoint refuses — new people
register (pending) and an admin approves them under Setup -> Users.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..permissions import PERM_TREE, ALL_PERMS, ACCESS_PRESETS, clean_access
from ..security import hash_password, verify_password, create_token
from .. import models, schemas

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _norm(email: str) -> str:
    return (email or "").strip().lower()


def _find(db: Session, email: str) -> models.User | None:
    return db.query(models.User).filter(models.User.email == _norm(email)).first()


@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    """Open endpoint the login screen calls before showing a form."""
    return {"needs_bootstrap": db.query(models.User).count() == 0}


@router.get("/permissions")
def permission_catalogue():
    """The access tree and presets, so the UI ticks exactly what the API enforces."""
    return {"tree": PERM_TREE, "all": ALL_PERMS, "presets": ACCESS_PRESETS}


@router.post("/bootstrap", response_model=schemas.TokenResponse, status_code=201)
def bootstrap(body: schemas.BootstrapRequest, db: Session = Depends(get_db)):
    if db.query(models.User).count() > 0:
        raise HTTPException(409, "This system already has an admin — please sign in")
    user = models.User(
        email=_norm(body.email), name=body.name.strip(),
        password_hash=hash_password(body.password),
        role="admin", status="active", access=list(ALL_PERMS),
        last_login=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user.id), "user": schemas.UserOut.model_validate(user)}


@router.post("/register", response_model=schemas.UserOut, status_code=201)
def register(body: schemas.RegisterRequest, db: Session = Depends(get_db)):
    if db.query(models.User).count() == 0:
        raise HTTPException(400, "No admin exists yet — create the first account instead")
    if _find(db, body.email):
        raise HTTPException(409, "That email is already registered")
    user = models.User(
        email=_norm(body.email), name=body.name.strip(),
        password_hash=hash_password(body.password),
        role="user", status="pending",
        access=clean_access(ACCESS_PRESETS["operations"]["perms"]),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=schemas.TokenResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = _find(db, body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    if user.status == "pending":
        raise HTTPException(403, "This account is waiting for admin approval")
    if user.status != "active":
        raise HTTPException(403, "This account has been disabled")
    user.last_login = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return {"token": create_token(user.id), "user": schemas.UserOut.model_validate(user)}


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(
    body: schemas.PasswordChange,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is not correct")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return None
