from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require, current_user
from .. import models, schemas

router = APIRouter(prefix="/api/transports", tags=["transports"])

# Masters are reference data every page reads; only Setup may change them.
_read = current_user
_write = require("setup.parties")


@router.get("", response_model=list[schemas.Transport], dependencies=[Depends(_read)])
def list_transports(db: Session = Depends(get_db)):
    return db.query(models.Transport).order_by(models.Transport.name).all()


def _sync_primary(obj: models.Transport) -> None:
    """`supplier_id` is the single-supplier view of `supplier_ids`, kept in
    step so packing and vehicle screens that read one still see the right
    carrier."""
    ids = obj.supplier_ids or []
    if ids:
        if obj.supplier_id not in ids:
            obj.supplier_id = ids[0]
    elif obj.supplier_id:
        obj.supplier_ids = [obj.supplier_id]


@router.post("", response_model=schemas.Transport, status_code=201, dependencies=[Depends(_write)])
def create_transport(body: schemas.TransportCreate, db: Session = Depends(get_db)):
    obj = models.Transport(**body.model_dump())
    _sync_primary(obj)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{tid}", response_model=schemas.Transport, dependencies=[Depends(_write)])
def update_transport(tid: str, body: schemas.TransportUpdate, db: Session = Depends(get_db)):
    obj = db.get(models.Transport, tid)
    if not obj:
        raise HTTPException(404, "Transport not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    _sync_primary(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{tid}", status_code=204, dependencies=[Depends(_write)])
def delete_transport(tid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Transport, tid)
    if obj:
        db.delete(obj)
        db.commit()
    return None
