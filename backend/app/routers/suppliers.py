from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("", response_model=list[schemas.Supplier])
def list_suppliers(db: Session = Depends(get_db)):
    return db.query(models.Supplier).order_by(models.Supplier.code).all()


@router.post("", response_model=schemas.Supplier, status_code=201)
def create_supplier(body: schemas.SupplierCreate, db: Session = Depends(get_db)):
    obj = models.Supplier(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{sid}", response_model=schemas.Supplier)
def update_supplier(sid: str, body: schemas.SupplierUpdate, db: Session = Depends(get_db)):
    obj = db.get(models.Supplier, sid)
    if not obj:
        raise HTTPException(404, "Supplier not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{sid}", status_code=204)
def delete_supplier(sid: str, db: Session = Depends(get_db)):
    obj = db.get(models.Supplier, sid)
    if obj:
        db.delete(obj)
        db.commit()
    return None
