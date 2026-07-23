from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from .. import models, schemas, calc

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])

_read = require("orders.entry", "orders.reports", "home")
_write = require("orders.entry")


def _ctx(db: Session):
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    return items, po_lines, invoices


@router.get("", dependencies=[Depends(_read)])
def list_purchase_orders(db: Session = Depends(get_db)):
    """Grouped PO roll-up with delivery status and completed suppliers dropped."""
    items, po_lines, invoices = _ctx(db)
    return calc.build_po_list(po_lines, invoices, items)


@router.get("/lines", dependencies=[Depends(_read)])
def list_po_lines(db: Session = Depends(get_db)):
    """Raw buyer-order lines (the 2A order book), newest first."""
    rows = db.query(models.PurchaseOrderLine).all()
    rows.sort(key=lambda r: r.date, reverse=True)
    return [
        {"id": r.id, "po": r.po, "date": r.date, "item_id": r.item_id,
         "qty": r.qty, "rbi": r.rbi, "buyer_id": r.buyer_id}
        for r in rows
    ]


@router.get("/{po}", dependencies=[Depends(_read)])
def get_purchase_order(po: str, db: Session = Depends(get_db)):
    items, po_lines, invoices = _ctx(db)
    match = next((p for p in calc.build_po_list(po_lines, invoices, items) if p["po"] == po), None)
    if not match:
        raise HTTPException(404, "Purchase order not found")
    return match


@router.post("", status_code=201, dependencies=[Depends(_write)])
def create_purchase_order(body: schemas.PurchaseOrderCreate, db: Session = Depends(get_db)):
    if not body.lines:
        raise HTTPException(400, "A purchase order needs at least one line")
    created = []
    for l in body.lines:
        row = models.PurchaseOrderLine(
            po=body.po, date=body.date, item_id=l.item_id, qty=l.qty,
            rbi=body.rbi, buyer_id=body.buyer_id,
        )
        db.add(row)
        created.append(row)
    db.commit()
    return {"po": body.po, "lines": len(created)}


@router.put("/{po}", dependencies=[Depends(_write)])
def update_purchase_order(po: str, body: schemas.PurchaseOrderUpdate, db: Session = Depends(get_db)):
    rows = db.query(models.PurchaseOrderLine).filter(models.PurchaseOrderLine.po == po).all()
    if not rows:
        raise HTTPException(404, "Purchase order not found")
    new_po = body.po or po
    qty_by_id = {}
    if body.lines:
        for l in body.lines:
            if l.get("id"):
                qty_by_id[l["id"]] = l.get("qty")
    for r in rows:
        r.po = new_po
        if r.id in qty_by_id and qty_by_id[r.id] is not None:
            r.qty = int(qty_by_id[r.id])
        if body.date:
            r.date = body.date
    db.commit()
    return {"po": new_po, "lines": len(rows)}


@router.delete("/{po}", status_code=204, dependencies=[Depends(_write)])
def delete_purchase_order(po: str, db: Session = Depends(get_db)):
    db.query(models.PurchaseOrderLine).filter(models.PurchaseOrderLine.po == po).delete()
    db.commit()
    return None
