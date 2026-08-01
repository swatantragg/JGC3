"""Costing sheet — rows plus the shared parameters they are worked against.

Every row is returned with its `computed` block already worked out server-side,
so the sheet, the reports and any future export all quote the same figures.
"""
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require
from .. import models, schemas, calc

router = APIRouter(prefix="/api/costing", tags=["costing"])

PARAMS_KEY = "cost_params"
# Reading and editing the sheet are the same right — costing is a single area.
_read = _write = require("reports.costing")


def get_params(db: Session) -> schemas.CostParams:
    row = db.get(models.Setting, PARAMS_KEY)
    return schemas.CostParams(**(row.value or {})) if row else schemas.CostParams()


def _out(line: models.CostingLine, params: schemas.CostParams) -> schemas.CostingLineOut:
    out = schemas.CostingLineOut.model_validate(line)
    out.computed = calc.compute_costing(line, params)
    return out


@router.get("/params", response_model=schemas.CostParams, dependencies=[Depends(_read)])
def read_params(db: Session = Depends(get_db)):
    return get_params(db)


@router.put("/params", response_model=schemas.CostParams, dependencies=[Depends(_write)])
def write_params(body: schemas.CostParams, db: Session = Depends(get_db)):
    row = db.get(models.Setting, PARAMS_KEY)
    if row:
        row.value = body.model_dump()
    else:
        db.add(models.Setting(key=PARAMS_KEY, value=body.model_dump()))
    db.commit()
    return body


@router.get("/formulas", dependencies=[Depends(_read)])
def formulas():
    """How each column is derived — shown beside the sheet."""
    return [{"label": l, "rule": r} for l, r in calc.COSTING_FORMULAS]


@router.post("/preview", dependencies=[Depends(_read)])
def preview(rows: list[schemas.CostingPreviewIn], db: Session = Depends(get_db)):
    """Cost a set of typed prices without saving anything.

    The costing screen asks the API rather than repeating the arithmetic in
    the browser, so the live working, the saved sheet and any export can never
    quote three different numbers. Anything the caller leaves out is taken
    from the item master: boxes per FCL from the item's volume, the old price
    and the old FOB from what the master currently holds.
    """
    if not rows:
        return {"rows": [], "params": get_params(db).model_dump()}
    params = get_params(db)
    ids = [r.item_id for r in rows]
    items = {i.id: i for i in db.query(models.Item).filter(models.Item.id.in_(ids)).all()}
    saved = {
        c.item_id: c for c in
        db.query(models.CostingLine).filter(models.CostingLine.item_id.in_(ids)).all()
        if c.item_id
    }

    out = []
    for r in rows:
        it = items.get(r.item_id)
        if not it:
            raise HTTPException(404, f"Item {r.item_id} not found")
        prev = saved.get(it.id)
        fob_pc = (float(it.unit_fob100 or 0) / 100
                  if (it.fob_mode or "100") == "100" else float(it.unit_fob100 or 0))
        # A throw-away carrier, not an ORM row: nothing here is persisted and
        # a transient CostingLine sharing a saved row's id would confuse the
        # session's identity map.
        line = SimpleNamespace(
            item_id=it.id,
            gd=it.gd or "", code=it.code or "", dia=it.size or "", length=it.length or "",
            unit=int(it.pack_unit or 0), box=int(it.packing or 0),
            price_old=(r.price_old if r.price_old is not None
                       else (prev.price_new if prev else float(it.unit_value or 0))),
            price_new=float(r.price_new or 0),
            boxes_fcl=int(r.boxes_fcl if r.boxes_fcl is not None
                          else (prev.boxes_fcl if prev and prev.boxes_fcl
                                else calc.boxes_per_fcl(it))),
            fob_old=float(r.fob_old if r.fob_old is not None
                          else (prev.fob_old if prev else fob_pc)),
            fob_now=float(r.fob_now if r.fob_now is not None
                          else (prev.fob_now if prev else fob_pc)),
        )
        computed = calc.compute_costing(line, params)
        out.append({
            "item_id": it.id, "line_id": prev.id if prev else None,
            "gd": line.gd, "code": line.code, "dia": line.dia, "length": line.length,
            "description": it.description, "supplier_id": it.supplier_id,
            "unit": line.unit, "box": line.box, "boxes_fcl": line.boxes_fcl,
            "price_old": line.price_old, "price_new": line.price_new,
            "fob_old": line.fob_old, "fob_now": line.fob_now,
            "computed": computed,
        })
    out.sort(key=lambda r: (str(r["gd"] or ""), str(r["code"] or "")))
    return {"rows": out, "params": params.model_dump()}


@router.put("/upsert-by-item", dependencies=[Depends(_write)])
def upsert_by_item(rows: list[schemas.CostingPreviewIn], db: Session = Depends(get_db)):
    """Save the typed prices onto the costing sheet, one row per item.

    An item already on the sheet keeps its identity and rolls its previous new
    price down into the old-price column, which is what makes the "old price"
    shown above each input mean the last price we agreed.
    """
    if not rows:
        return {"saved": 0}
    ids = [r.item_id for r in rows]
    items = {i.id: i for i in db.query(models.Item).filter(models.Item.id.in_(ids)).all()}
    saved = {
        c.item_id: c for c in
        db.query(models.CostingLine).filter(models.CostingLine.item_id.in_(ids)).all()
        if c.item_id
    }

    n = 0
    for r in rows:
        it = items.get(r.item_id)
        if not it:
            continue
        fob_pc = (float(it.unit_fob100 or 0) / 100
                  if (it.fob_mode or "100") == "100" else float(it.unit_fob100 or 0))
        obj = saved.get(it.id)
        if obj is None:
            obj = models.CostingLine(item_id=it.id, fob_old=fob_pc, fob_now=fob_pc)
            db.add(obj)
            obj.price_old = (r.price_old if r.price_old is not None
                             else float(it.unit_value or 0))
        elif r.price_old is not None:
            obj.price_old = float(r.price_old)
        elif abs(float(obj.price_new or 0) - float(r.price_new or 0)) > 1e-9:
            obj.price_old = float(obj.price_new or 0)

        obj.gd = it.gd or ""
        obj.code = it.code or ""
        obj.dia = it.size or ""
        obj.length = it.length or ""
        obj.unit = int(it.pack_unit or 0)
        obj.box = int(it.packing or 0)
        obj.price_new = float(r.price_new or 0)
        if r.boxes_fcl is not None:
            obj.boxes_fcl = int(r.boxes_fcl)
        elif not obj.boxes_fcl:
            obj.boxes_fcl = calc.boxes_per_fcl(it)
        if r.fob_now is not None:
            obj.fob_now = float(r.fob_now)
        if r.fob_old is not None:
            obj.fob_old = float(r.fob_old)
        n += 1
    db.commit()
    return {"saved": n}


@router.get("", response_model=list[schemas.CostingLineOut], dependencies=[Depends(_read)])
def list_lines(db: Session = Depends(get_db)):
    params = get_params(db)
    rows = db.query(models.CostingLine).order_by(models.CostingLine.gd).all()
    return [_out(r, params) for r in rows]


@router.post("", response_model=schemas.CostingLineOut, status_code=201, dependencies=[Depends(_write)])
def create_line(body: schemas.CostingLineCreate, db: Session = Depends(get_db)):
    obj = models.CostingLine(**body.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _out(obj, get_params(db))


@router.put("/{cid}", response_model=schemas.CostingLineOut, dependencies=[Depends(_write)])
def update_line(cid: str, body: schemas.CostingLineUpdate, db: Session = Depends(get_db)):
    obj = db.get(models.CostingLine, cid)
    if not obj:
        raise HTTPException(404, "Costing row not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return _out(obj, get_params(db))


@router.delete("/{cid}", status_code=204, dependencies=[Depends(_write)])
def delete_line(cid: str, db: Session = Depends(get_db)):
    obj = db.get(models.CostingLine, cid)
    if obj:
        db.delete(obj)
        db.commit()
    return None
