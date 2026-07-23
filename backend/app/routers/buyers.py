from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require, current_user
from .. import models, schemas

router = APIRouter(prefix="/api/buyers", tags=["buyers"])

# Masters are reference data every page reads; only Setup may change them.
_read = current_user
_write = require("setup.parties")


@router.get("", response_model=list[schemas.Buyer], dependencies=[Depends(_read)])
def list_buyers(db: Session = Depends(get_db)):
    return db.query(models.Buyer).order_by(models.Buyer.name).all()


@router.post("", response_model=schemas.Buyer, status_code=201, dependencies=[Depends(_write)])
def create_buyer(body: schemas.BuyerCreate, db: Session = Depends(get_db)):
    obj = models.Buyer(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{bid}", response_model=schemas.Buyer, dependencies=[Depends(_write)])
def update_buyer(bid: str, body: schemas.BuyerUpdate, db: Session = Depends(get_db)):
    obj = db.get(models.Buyer, bid)
    if not obj:
        raise HTTPException(404, "Buyer not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{bid}", status_code=204, dependencies=[Depends(_write)])
def delete_buyer(bid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Buyer, bid)
    if obj:
        db.delete(obj)
        db.commit()
    return None
