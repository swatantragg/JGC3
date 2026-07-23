"""Costing sheet — rows plus the shared parameters they are worked against.

Every row is returned with its `computed` block already worked out server-side,
so the sheet, the reports and any future export all quote the same figures.
"""
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
