from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from .. import models, schemas, calc

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

_read = require("shipment.packing", "shipment.details", "shipment.reports", "pre-shipment", "post-shipment", "home")
_write = require("shipment.packing", "shipment.details")


def _out(inv: models.Invoice) -> schemas.InvoiceOut:
    out = schemas.InvoiceOut.model_validate(inv)
    out.status = calc.invoice_status(inv)
    return out


@router.get("", response_model=list[schemas.InvoiceOut], dependencies=[Depends(_read)])
def list_invoices(db: Session = Depends(get_db)):
    rows = db.query(models.Invoice).order_by(models.Invoice.date.desc()).all()
    return [_out(i) for i in rows]


@router.get("/{iid}", response_model=schemas.InvoiceOut, dependencies=[Depends(_read)])
def get_invoice(iid: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return _out(inv)


@router.get("/{iid}/serials", dependencies=[Depends(_read)])
def get_serials(iid: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    items = {i.id: i for i in db.query(models.Item).all()}
    return calc.invoice_serials(inv, items)


@router.post("", response_model=schemas.InvoiceOut, status_code=201, dependencies=[Depends(_write)])
def create_invoice(body: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    inv = models.Invoice(
        invoice_no=body.invoice_no, date=body.date, buyer_id=body.buyer_id,
        rbi=body.rbi, serial_start=body.serial_start,
        packing_transports=body.packing_transports or {},
        vehicles={}, ship={}, step_skip={},
    )
    inv.lines = [
        models.InvoiceLine(item_id=l.item_id, supplier_id=l.supplier_id, boxes=l.boxes)
        for l in body.lines
    ]
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _out(inv)


@router.put("/{iid}", response_model=schemas.InvoiceOut, dependencies=[Depends(_write)])
def update_invoice(iid: str, body: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    data = body.model_dump(exclude_unset=True)
    lines = data.pop("lines", None)
    for k, v in data.items():
        setattr(inv, k, v)
    if lines is not None:
        inv.lines = [
            models.InvoiceLine(item_id=l["item_id"], supplier_id=l.get("supplier_id"), boxes=l.get("boxes", 0))
            for l in lines
        ]
    db.commit()
    db.refresh(inv)
    return _out(inv)


@router.delete("/{iid}", status_code=204, dependencies=[Depends(_write)])
def delete_invoice(iid: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, iid)
    if inv:
        db.delete(inv)
        db.commit()
    return None
