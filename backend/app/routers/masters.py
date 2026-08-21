"""Loading the client's master workbook, and the derived master rows.

`POST /api/masters/import` is how the 285 products, five suppliers, buyer and
transporters get from Docs/Data/Masters.xlsx into the database. It is an
upsert, so it is safe to call again after the workbook is re-extracted.

`POST /api/masters/derive` returns, for a list of (item, quantity), every
figure the 2A / 7A master sheets show — boxes, volume, weights, barcode
stickers, label sheets, purchase value, FOB and the RBI reference. Screens
call it instead of doing arithmetic locally so no two of them can disagree.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import active_user, require_admin
from .. import models, schemas, calc, masters_import

router = APIRouter(prefix="/api/masters", tags=["masters"])


@router.get("/seed", dependencies=[Depends(active_user)])
def seed_info():
    """What the bundled workbook extract contains, without importing it."""
    seed = masters_import.load_seed()
    by_sheet: dict[str, int] = {}
    for i in seed["items"]:
        by_sheet[i["source_sheet"]] = by_sheet.get(i["source_sheet"], 0) + 1
    return {
        "source": seed.get("source"),
        "suppliers": len(seed["suppliers"]),
        "buyers": len(seed["buyers"]),
        "transports": len(seed["transports"]),
        "items": len(seed["items"]),
        "items_by_sheet": by_sheet,
    }


@router.post("/import", dependencies=[Depends(require_admin)])
def import_masters(overwrite: bool = False, db: Session = Depends(get_db)):
    """Load the workbook extract. `overwrite=true` also refreshes records that
    already exist — which discards edits made in Setup, so it is off by
    default and the UI asks before using it."""
    return masters_import.import_masters(db, overwrite_existing=overwrite)


@router.post("/derive", dependencies=[Depends(active_user)])
def derive(rows: list[schemas.ItemDeriveIn], db: Session = Depends(get_db)):
    """Master figures for each (item, quantity), plus the column totals."""
    if not rows:
        return {"rows": [], "totals": {}}
    items = {i.id: i for i in db.query(models.Item)
             .filter(models.Item.id.in_([r.item_id for r in rows])).all()}
    out = []
    for r in rows:
        it = items.get(r.item_id)
        if not it:
            raise HTTPException(404, f"Item {r.item_id} not found")
        out.append({
            "item_id": it.id, "code": it.code, "gd": it.gd, "description": it.description,
            "supplier_id": it.supplier_id, "packing": it.packing,
            **calc.derive_line(it, r.qty, r.rbi),
        })
    # "qty" leads the list: the summary table's Pieces column totals every
    # line, so 3,000 + 4,000 reads as 7,000 rather than as a blank.
    sums = ("qty", "boxes", "boxes_exact", "vol_total", "net_total", "gross_total",
            "labels", "sheets", "total_value_inr", "total_fob_usd", "rbi_ref_inr")
    return {"rows": out, "totals": {k: sum(x[k] for x in out) for k in sums}}


@router.get("/order/{po}", dependencies=[Depends(active_user)])
def order_master(po: str, db: Session = Depends(get_db)):
    """Master 2A — one buyer purchase order worked out item by item."""
    items = {i.id: i for i in db.query(models.Item).all()}
    lines = db.query(models.PurchaseOrderLine).filter(models.PurchaseOrderLine.po == po).all()
    if not lines:
        raise HTTPException(404, "Purchase order not found")
    return calc.build_order_master(po, lines, items)


@router.get("/supplier/{supplier_id}", dependencies=[Depends(active_user)])
def supplier_master(supplier_id: str, date_from: str | None = None,
                    date_to: str | None = None, db: Session = Depends(get_db)):
    """Master 7A — one supplier's order, every open PO rolled together."""
    items = {i.id: i for i in db.query(models.Item).all()}
    lines = db.query(models.PurchaseOrderLine).all()
    return calc.build_supplier_master(supplier_id, lines, items, date_from, date_to)


@router.get("/order-lines", dependencies=[Depends(active_user)])
def order_lines(date_from: str | None = None, date_to: str | None = None,
                db: Session = Depends(get_db)):
    """Every buyer order line in a date range, with its 2A figures — the
    "Order lines" view of the buyer master, newest first."""
    items = {i.id: i for i in db.query(models.Item).all()}
    rows = db.query(models.PurchaseOrderLine).all()
    out = []
    for r in rows:
        if date_from and r.date < date_from:
            continue
        if date_to and r.date > date_to:
            continue
        it = items.get(r.item_id)
        if not it:
            continue
        out.append({
            "id": r.id, "date": r.date, "po": r.po, "buyer_id": r.buyer_id,
            "item_id": it.id, "code": it.code, "gd": it.gd, "oswin": it.oswin,
            "gl": it.gl, "size": it.size, "length": it.length, "packing": it.packing,
            "description": it.description, "barcode": it.barcode, "hsn": it.hsn,
            "supplier_id": it.supplier_id,
            # Worked out at the price this order was placed at, not today's.
            **calc.derive_line(it, r.qty, r.rbi, snapshot=r),
        })
    out.sort(key=lambda x: (x["date"], x["po"]), reverse=True)
    return {"rows": out, "totals": calc._totals(out)}


@router.get("/formulas", dependencies=[Depends(active_user)])
def formulas():
    return calc.MASTER_FORMULAS
