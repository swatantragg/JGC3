from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require, active_user
from .. import models, calc

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_read = require("home", "reports.balance", "orders.reports")
# Clearing a filled order off the board is a dashboard preference, not a
# change to the order book — so it asks for no more than reading the board.
_write = _read

# Purchase orders somebody has cleared off the balance board. Kept in the
# settings table so the choice follows the client from machine to machine,
# and holds nothing but PO numbers: no order, line or document is touched.
HIDDEN_KEY = "dashboard_hidden_pos"


def _hidden(db: Session) -> list[str]:
    row = db.get(models.Setting, HIDDEN_KEY)
    value = (row.value or {}) if row else {}
    return [str(p) for p in value.get("pos", [])]


def _save_hidden(db: Session, pos: list[str]) -> list[str]:
    kept = sorted({str(p) for p in pos if str(p).strip()})
    row = db.get(models.Setting, HIDDEN_KEY)
    if row:
        row.value = {"pos": kept}
    else:
        db.add(models.Setting(key=HIDDEN_KEY, value={"pos": kept}))
    db.commit()
    return kept


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
    return calc.build_balance_matrix(po_lines, invoices, items, suppliers, _hidden(db))


@router.get("/hidden-pos", dependencies=[Depends(_read)])
def list_hidden_pos(db: Session = Depends(get_db)):
    """Which purchase orders have been cleared off the balance board."""
    return {"pos": _hidden(db)}


@router.post("/hidden-pos", dependencies=[Depends(_write)])
def hide_pos(pos: list[str] = Body(..., embed=True), db: Session = Depends(get_db)):
    """Clear filled orders off the balance board. Nothing is deleted — the
    orders stay in the PO summary and in every report."""
    return {"pos": _save_hidden(db, _hidden(db) + list(pos))}


@router.delete("/hidden-pos", dependencies=[Depends(_write)])
def restore_pos(pos: list[str] | None = Query(None), db: Session = Depends(get_db)):
    """Put orders back on the board. With no `pos`, every one of them."""
    if pos is None:
        return {"pos": _save_hidden(db, [])}
    drop = {str(p) for p in pos}
    return {"pos": _save_hidden(db, [p for p in _hidden(db) if p not in drop])}
