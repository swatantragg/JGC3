from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from .. import models, schemas, calc

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])

_read = require("orders.entry", "orders.reports", "home")
_write = require("orders.entry")
# Repricing open orders is decided where the price is edited — Setup → Items —
# so whoever may change the master may also carry that change onto the orders
# still outstanding. Delivered lines are never touched by it.
_price_read = require("orders.entry", "orders.reports", "home", "setup.items")
_price_write = require("orders.entry", "setup.items")


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
         "qty": r.qty, "rbi": r.rbi, "buyer_id": r.buyer_id,
         # The prices this order was agreed at — NULL means "read the item".
         "unit_value": r.unit_value, "value_mode": r.value_mode,
         "unit_fob100": r.unit_fob100, "fob_mode": r.fob_mode}
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Price sync — an order keeps the prices it was placed at (see models.py), so
# editing an item in Setup only moves the orders you say it should.
# ---------------------------------------------------------------------------
def _pending_line_ids(db: Session) -> set[str]:
    """Every order line that still has boxes outstanding, by the same FIFO
    ledger the packing screen allocates against."""
    items, po_lines, invoices = _ctx(db)
    ledger = calc.compute_ledger(po_lines, invoices, items)
    return {
        d["line_id"]
        for b in ledger.values() for d in b["demands"] if d["remaining"] > 0
    }


@router.get("/price-drift", dependencies=[Depends(_price_read)])
def price_drift(item_id: str | None = None, db: Session = Depends(get_db)):
    """How many still-open order lines were agreed at a price the item master
    no longer carries. Give it an `item_id` to ask about one product — which
    is what the item edit form does before offering to apply a new price.
    """
    items = {i.id: i for i in db.query(models.Item).all()}
    pending = _pending_line_ids(db)
    lines = db.query(models.PurchaseOrderLine).all()

    drifted, pos, item_ids, boxes = 0, set(), set(), 0
    for r in lines:
        it = items.get(r.item_id)
        if not it or r.id not in pending:
            continue
        if item_id and r.item_id != item_id:
            continue
        if calc.prices_differ(it, r):
            drifted += 1
            pos.add(r.po)
            item_ids.add(it.id)
    return {
        "lines": drifted,
        "pos": sorted(pos),
        "items": len(item_ids),
        "pending_lines": len(pending),
    }


@router.get("/pending-for-item/{iid}", dependencies=[Depends(_price_read)])
def pending_for_item(iid: str, db: Session = Depends(get_db)):
    """Which orders still have this item outstanding, and how many boxes —
    what the edit form shows beside the "apply to pending orders" tick, so the
    consequence of ticking it is visible before saving."""
    items = {i.id: i for i in db.query(models.Item).all()}
    po_lines = db.query(models.PurchaseOrderLine).all()
    invoices = db.query(models.Invoice).all()
    ledger = calc.compute_ledger(po_lines, invoices, items)

    open_demands = [d for d in ledger.get(iid, {}).get("demands", []) if d["remaining"] > 0]
    by_po: dict = {}
    for d in open_demands:
        e = by_po.setdefault(d["po"], {"po": d["po"], "date": d["date"], "boxes": 0})
        e["boxes"] += d["remaining"]
        e["date"] = min(e["date"], d["date"])
    rows = sorted(by_po.values(), key=lambda r: (r["date"], r["po"]))
    return {
        "item_id": iid,
        "pos": rows,
        "lines": len(open_demands),
        "boxes": sum(r["boxes"] for r in rows),
    }


@router.post("/apply-prices", dependencies=[Depends(_price_write)])
def apply_prices(item_id: str | None = None, db: Session = Depends(get_db)):
    """Restate still-open order lines at the item master's current price.

    Scoped to one product with `item_id`, which is how the item edit form
    applies a price change it has just saved. Lines already delivered are left
    exactly as they were — the invoice, the customs papers and the bank
    documents raised against them must not move.
    """
    items = {i.id: i for i in db.query(models.Item).all()}
    pending = _pending_line_ids(db)
    lines = db.query(models.PurchaseOrderLine).all()

    updated, pos = 0, set()
    for r in lines:
        it = items.get(r.item_id)
        if not it or r.id not in pending or not calc.prices_differ(it, r):
            continue
        if item_id and r.item_id != item_id:
            continue
        r.unit_value = float(it.unit_value or 0)
        r.value_mode = it.value_mode or "piece"
        r.unit_fob100 = float(it.unit_fob100 or 0)
        r.fob_mode = it.fob_mode or "100"
        updated += 1
        pos.add(r.po)
    db.commit()
    return {"updated": updated, "pos": sorted(pos)}


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
    ids = [l.item_id for l in body.lines]
    items = {i.id: i for i in db.query(models.Item).filter(models.Item.id.in_(ids)).all()}
    missing = [i for i in ids if i not in items]
    if missing:
        raise HTTPException(404, f"Item {missing[0]} not found")

    created = []
    for l in body.lines:
        it = items[l.item_id]
        row = models.PurchaseOrderLine(
            po=body.po, date=body.date, item_id=l.item_id, qty=l.qty,
            rbi=body.rbi, buyer_id=body.buyer_id,
            # Freeze the price the order is being placed at.
            unit_value=float(it.unit_value or 0), value_mode=it.value_mode or "piece",
            unit_fob100=float(it.unit_fob100 or 0), fob_mode=it.fob_mode or "100",
        )
        db.add(row)
        created.append(row)
    db.commit()
    return {"po": body.po, "lines": len(created)}


@router.put("/{po}", dependencies=[Depends(_write)])
def update_purchase_order(po: str, body: schemas.PurchaseOrderUpdate, db: Session = Depends(get_db)):
    """Restate a purchase order: its number, its date, and the lines on it.

    `lines` is the order as it should now read, in full. A line that arrives
    with its `id` keeps that row (and the price it was agreed at); a line with
    no `id` is added and priced at the item master's figures, exactly as a new
    order would be; a row whose id does not come back is dropped. Sending no
    `lines` at all leaves the lines alone, which is what renaming a PO does.
    """
    rows = db.query(models.PurchaseOrderLine).filter(models.PurchaseOrderLine.po == po).all()
    if not rows:
        raise HTTPException(404, "Purchase order not found")
    new_po = body.po or po
    by_id = {r.id: r for r in rows}
    date = body.date or min(r.date for r in rows)
    buyer_id = rows[0].buyer_id
    rbi = rows[0].rbi

    if body.lines is None:
        kept = rows
    else:
        if not body.lines:
            raise HTTPException(400, "A purchase order needs at least one line")
        # A line is "new" when it names no row of this order — either it
        # carries no id at all, or one that is no longer on the order because
        # somebody else edited it in between.
        new_ids = [l.get("item_id") for l in body.lines
                   if l.get("id") not in by_id and l.get("item_id")]
        items = {i.id: i for i in db.query(models.Item).filter(models.Item.id.in_(new_ids)).all()} if new_ids else {}
        missing = [i for i in new_ids if i not in items]
        if missing:
            raise HTTPException(404, f"Item {missing[0]} not found")

        kept, seen = [], set()
        for l in body.lines:
            qty = int(l.get("qty") or 0)
            lid = l.get("id")
            if lid and lid in by_id:
                row = by_id[lid]
                row.qty = qty
                seen.add(lid)
            else:
                it = items.get(l.get("item_id"))
                if not it:
                    raise HTTPException(404, f"Item {l.get('item_id')} not found")
                row = models.PurchaseOrderLine(
                    po=new_po, date=date, item_id=it.id, qty=qty,
                    rbi=rbi, buyer_id=buyer_id,
                    # A line added now is agreed at today's master price.
                    unit_value=float(it.unit_value or 0), value_mode=it.value_mode or "piece",
                    unit_fob100=float(it.unit_fob100 or 0), fob_mode=it.fob_mode or "100",
                )
                db.add(row)
            kept.append(row)

        for r in rows:
            if r.id not in seen:
                db.delete(r)

    for r in kept:
        r.po = new_po
        if body.date:
            r.date = body.date
    db.commit()
    return {"po": new_po, "lines": len(kept)}


@router.delete("/{po}", status_code=204, dependencies=[Depends(_write)])
def delete_purchase_order(po: str, db: Session = Depends(get_db)):
    db.query(models.PurchaseOrderLine).filter(models.PurchaseOrderLine.po == po).delete()
    db.commit()
    return None
