from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, calc

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _ctx(db: Session):
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    return items, po_lines, invoices


@router.get("/item-detail")
def item_order_detail(db: Session = Depends(get_db)):
    """Item-wise order detail with a column per PO (doc 37)."""
    items, po_lines, _ = _ctx(db)
    return calc.build_item_order_detail(po_lines, items)


@router.get("/balance")
def balance_register(db: Session = Depends(get_db)):
    """PO / item / supplier balance register, recomputed from the ledger."""
    items, po_lines, invoices = _ctx(db)
    ledger = calc.compute_ledger(po_lines, invoices, items)

    po_rows, item_rows = [], []
    for b in ledger.values():
        it = b["item"]
        if not b["demands"]:
            continue
        ordered = sum(d["ordered"] for d in b["demands"])
        pending = sum(d["remaining"] for d in b["demands"])
        inv_set = set()
        for d in b["demands"]:
            inv_set |= d["invoices"]
            recd = d["ordered"] - d["remaining"]
            po_rows.append({
                "date": d["date"], "item_id": it.id, "gd": it.gd, "description": it.description,
                "po": d["po"], "buyer_id": d["buyer_id"], "qty": d["qty"], "ordered": d["ordered"],
                "recd": recd, "pending": d["remaining"], "volume": d["ordered"] * (it.volume or 0),
                "invoices": sorted(d["invoices"]),
            })
        item_rows.append({
            "item_id": it.id, "gd": it.gd, "description": it.description,
            "pos": sorted({d["po"] for d in b["demands"]}), "invoices": sorted(inv_set),
            "qty": sum(d["qty"] for d in b["demands"]), "ordered": ordered,
            "recd": ordered - pending, "pending": pending, "volume": ordered * (it.volume or 0),
        })
    po_rows.sort(key=lambda r: (r["po"], r["gd"]))
    item_rows.sort(key=lambda r: r["gd"])
    return {"po": po_rows, "item": item_rows}
