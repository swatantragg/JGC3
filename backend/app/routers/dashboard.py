from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require, active_user
from .. import models, calc

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_read = require("home", "reports.balance", "orders.reports")


@router.get("/badges", dependencies=[Depends(active_user)])
def badges(db: Session = Depends(get_db)):
    """The three counters the menu bar carries: purchase orders still open,
    boxes still to pack, and invoices whose shipment details are unfinished."""
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    ledger = calc.compute_ledger(po_lines, invoices, items)

    open_pos, pending = set(), 0
    for b in ledger.values():
        for d in b["demands"]:
            if d["remaining"] > 0:
                open_pos.add(d["po"])
                pending += d["remaining"]
    unfinished = sum(1 for inv in invoices if calc.invoice_status(inv) != "Shipped")
    return {"orders": len(open_pos), "packing": int(pending), "shipments": unfinished}


@router.get("/matrix", dependencies=[Depends(_read)])
def balance_matrix(db: Session = Depends(get_db)):
    """Balance orders — boxes & volume, suppliers × POs (doc 39)."""
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    suppliers = db.query(models.Supplier).order_by(models.Supplier.code).all()
    return calc.build_balance_matrix(po_lines, invoices, items, suppliers)
