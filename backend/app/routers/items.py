from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require, current_user
from .. import models, schemas

router = APIRouter(prefix="/api/items", tags=["items"])

# Masters are reference data every page reads; only Setup may change them.
_read = current_user
_write = require("setup.items")


@router.get("", response_model=list[schemas.Item], dependencies=[Depends(_read)])
def list_items(db: Session = Depends(get_db)):
    return db.query(models.Item).order_by(models.Item.gd).all()


@router.post("", response_model=schemas.Item, status_code=201, dependencies=[Depends(_write)])
def create_item(body: schemas.ItemCreate, db: Session = Depends(get_db)):
    obj = models.Item(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{iid}", response_model=schemas.Item, dependencies=[Depends(_write)])
def update_item(iid: str, body: schemas.ItemUpdate, db: Session = Depends(get_db)):
    obj = db.get(models.Item, iid)
    if not obj:
        raise HTTPException(404, "Item not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{iid}", status_code=204, dependencies=[Depends(_write)])
def delete_item(iid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Item, iid)
    if obj:
        db.delete(obj)
        db.commit()
    return None
