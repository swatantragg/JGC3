from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/transports", tags=["transports"])


@router.get("", response_model=list[schemas.Transport])
def list_transports(db: Session = Depends(get_db)):
    return db.query(models.Transport).order_by(models.Transport.name).all()


@router.post("", response_model=schemas.Transport, status_code=201)
def create_transport(body: schemas.TransportCreate, db: Session = Depends(get_db)):
    obj = models.Transport(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{tid}", response_model=schemas.Transport)
def update_transport(tid: str, body: schemas.TransportUpdate, db: Session = Depends(get_db)):
    obj = db.get(models.Transport, tid)
    if not obj:
        raise HTTPException(404, "Transport not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{tid}", status_code=204)
def delete_transport(tid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Transport, tid)
    if obj:
        db.delete(obj)
        db.commit()
    return None
