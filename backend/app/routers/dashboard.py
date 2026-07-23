from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from .. import models, calc

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_read = require("home", "reports.balance", "orders.reports")


@router.get("/matrix", dependencies=[Depends(_read)])
def balance_matrix(db: Session = Depends(get_db)):
    """Balance orders — boxes & volume, suppliers × POs (doc 39)."""
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    suppliers = db.query(models.Supplier).order_by(models.Supplier.code).all()
    return calc.build_balance_matrix(po_lines, invoices, items, suppliers)
