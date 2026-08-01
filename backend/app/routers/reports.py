from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from .. import models, calc

router = APIRouter(prefix="/api/reports", tags=["reports"])

_read = require("reports.balance", "orders.reports", "shipment.reports")


def _ctx(db: Session):
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    return items, po_lines, invoices


@router.get("/item-detail", dependencies=[Depends(_read)])
def item_order_detail(db: Session = Depends(get_db)):
    """Item-wise order detail with a column per PO, plus the boxes received
    and still pending against each item (doc 37)."""
    items, po_lines, invoices = _ctx(db)
    return calc.build_item_order_detail(po_lines, items, invoices)


@router.get("/supply-details", dependencies=[Depends(_read)])
def supply_details(
    mode: str = "po",
    supplier_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
):
    """Doc 38 — supply details, item wise / supplier wise.

    `mode=po` (default) is the live pending book: the orders still short, and
    the pieces still owed on each. With a date range it becomes the history —
    every order raised in the window at its ordered quantity. `mode=invoice`
    does the same over the packing invoices and the pieces delivered.
    """
    items, po_lines, invoices = _ctx(db)
    if mode not in ("po", "invoice"):
        mode = "po"
    return calc.build_supply_details(
        po_lines, invoices, items, mode=mode, supplier_id=supplier_id or None,
        date_from=date_from or None, date_to=date_to or None,
    )


@router.get("/balance", dependencies=[Depends(_read)])
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
        open_demands = [d for d in b["demands"] if d["remaining"] > 0]
        item_rows.append({
            "item_id": it.id, "gd": it.gd, "code": it.code, "description": it.description,
            "supplier_id": it.supplier_id, "packing": it.packing,
            "pos": sorted({d["po"] for d in b["demands"]}),
            # Only the orders still short — that is what packing is filling.
            "pending_pos": sorted({d["po"] for d in open_demands}),
            # The same orders in the sequence boxes will actually clear them:
            # oldest first. Record packing shows which PO each box goes to.
            "pending_detail": [
                {"po": d["po"], "date": d["date"], "remaining": d["remaining"]}
                for d in open_demands
            ],
            "oldest": min((d["date"] for d in open_demands), default=None),
            "date": max((d["date"] for d in b["demands"]), default=None),
            "invoices": sorted(inv_set),
            "qty": sum(d["qty"] for d in b["demands"]), "ordered": ordered,
            "recd": ordered - pending, "pending": pending,
            "vol_per_box": it.volume or 0, "volume": ordered * (it.volume or 0),
        })

    # Supplier-wise: what each supplier has actually delivered, per item.
    sup_map: dict = {}
    for inv in sorted(invoices, key=lambda x: x.date):
        for l in inv.lines:
            it = items.get(l.item_id)
            if not it:
                continue
            k = (l.supplier_id, l.item_id)
            e = sup_map.setdefault(k, {
                "supplier_id": l.supplier_id, "item_id": it.id, "gd": it.gd,
                "code": it.code, "description": it.description, "date": inv.date,
                "recd": 0, "invoices": set(), "_value": 0.0,
            })
            boxes = int(l.boxes or 0)
            e["recd"] += boxes
            e["_value"] += calc.purchase_inr(it, boxes * (it.packing or 0), calc.prices_of(it, l))
            e["invoices"].add(inv.invoice_no)
            e["date"] = inv.date
    sup_rows = []
    pending_by_item = {r["item_id"]: r["pending"] for r in item_rows}
    for e in sup_map.values():
        it = items[e["item_id"]]
        sup_rows.append({
            **e, "invoices": sorted(e["invoices"]),
            "volume": e["recd"] * (it.volume or 0),
            # Valued at what each invoice was actually raised at, not at
            # today's price — see models.InvoiceLine.
            "value": e.pop("_value", 0.0),
            "pending": pending_by_item.get(e["item_id"], 0),
        })

    po_rows.sort(key=lambda r: (r["po"], r["gd"]))
    item_rows.sort(key=lambda r: r["gd"])
    sup_rows.sort(key=lambda r: (r["supplier_id"] or "", r["gd"]))
    return {"po": po_rows, "item": item_rows, "supplier": sup_rows}
