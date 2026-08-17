"""Load the client's master workbook into the database.

`app/data/masters_seed.json` is produced by `scripts/extract_masters.py` from
Docs/Data/Masters.xlsx and checked against Excel's own cached results by
`scripts/verify_masters.py`. This module is the only thing that writes it in.

It is an **upsert**, keyed on what identifies a record to the client:

  supplier   code
  buyer      name
  transport  name
  item       (supplier, source sheet, code)   — the same code legitimately
             appears under two suppliers, and VP lists GRN15/20/25 on both of
             its sheets, so the sheet is part of the key

Re-running it therefore refreshes the master from the workbook without
duplicating anything. Prices and packing a user has since corrected in Setup
would be overwritten, so `overwrite_existing=False` (the default) updates only
the rows that are new and leaves edited ones alone.
"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from . import models

SEED_PATH = Path(__file__).resolve().parent / "data" / "masters_seed.json"

ITEM_FIELDS = (
    "code", "gd", "oswin", "gl", "size", "length", "pack_unit", "packing",
    "description", "barcode", "hsn", "volume", "net_per_box", "gross_per_box",
    "bg_per_box", "p_per_box", "type_up", "sticker_mult", "sticker_round",
    "stickers_fixed", "label_spoilage", "sticker_rule", "uom", "value_mode",
    "unit_value", "fob_mode", "unit_fob100", "group", "source_sheet",
)
SUPPLIER_FIELDS = ("code", "name", "place", "gstin", "addr", "pin", "state", "weights")
BUYER_FIELDS = ("name", "brand", "country", "curr", "ship_to", "addr", "order_no")
# The buyer's own letterhead — what their purchase order (document 17) prints
# around the goods. It is theirs, not ours, and nothing but the seed and Setup
# ever writes it, so it is carried separately from the trading fields above:
# see the buyer branch of `import_masters` for why blanks are filled in even
# when the rest of the record is left alone.
BUYER_LETTERHEAD = ("tagline", "ac_code", "abn", "acn", "tel", "fax", "web",
                    "email", "po_box", "logo")


def load_seed(path: Path | None = None) -> dict:
    return json.loads((path or SEED_PATH).read_text())


def _apply(obj, src: dict, fields) -> bool:
    changed = False
    for f in fields:
        if f in src and getattr(obj, f) != src[f]:
            setattr(obj, f, src[f])
            changed = True
    return changed


def import_masters(db: Session, seed: dict | None = None,
                   overwrite_existing: bool = False) -> dict:
    """Upsert suppliers, buyers, transports and items. Returns a per-table
    count of what was created / updated / left alone."""
    seed = seed or load_seed()
    stats = {k: {"created": 0, "updated": 0, "unchanged": 0}
             for k in ("suppliers", "buyers", "transports", "items")}

    # ---- suppliers (first: everything else points at them) ----------------
    by_code: dict[str, models.Supplier] = {
        s.code.strip().lower(): s for s in db.query(models.Supplier).all()
    }
    for row in seed.get("suppliers", []):
        key = row["code"].strip().lower()
        obj = by_code.get(key)
        if obj is None:
            obj = models.Supplier(**{f: row.get(f, "") for f in SUPPLIER_FIELDS})
            db.add(obj)
            by_code[key] = obj
            stats["suppliers"]["created"] += 1
        elif overwrite_existing and _apply(obj, row, SUPPLIER_FIELDS):
            stats["suppliers"]["updated"] += 1
        else:
            stats["suppliers"]["unchanged"] += 1
    db.flush()

    # ---- buyers -----------------------------------------------------------
    buyers = {b.name.strip().lower(): b for b in db.query(models.Buyer).all()}
    for row in seed.get("buyers", []):
        key = row["name"].strip().lower()
        obj = buyers.get(key)
        fields = BUYER_FIELDS + BUYER_LETTERHEAD
        if obj is None:
            db.add(models.Buyer(**{f: row.get(f, "") for f in fields}))
            stats["buyers"]["created"] += 1
            continue
        # A letterhead the buyer has never had is not an edit to preserve — it
        # is a field nothing has written yet — so a blank one is filled from the
        # seed even on a run that leaves the trading fields alone. Anything
        # already typed into Setup stands, and only --overwrite replaces it.
        blank = [f for f in BUYER_LETTERHEAD if not getattr(obj, f, "")]
        changed = _apply(obj, row, blank)
        if overwrite_existing:
            changed = _apply(obj, row, fields) or changed
        stats["buyers"]["updated" if changed else "unchanged"] += 1

    # ---- transports -------------------------------------------------------
    transports = {t.name.strip().lower(): t for t in db.query(models.Transport).all()}
    for row in seed.get("transports", []):
        ids = [by_code[c.strip().lower()].id for c in row.get("supplier_codes", [])
               if c.strip().lower() in by_code]
        key = row["name"].strip().lower()
        obj = transports.get(key)
        payload = {"name": row["name"], "transport_id": row.get("transport_id", ""),
                   "supplier_ids": ids, "supplier_id": ids[0] if ids else None}
        if obj is None:
            db.add(models.Transport(**payload))
            stats["transports"]["created"] += 1
        elif overwrite_existing and _apply(obj, payload, tuple(payload)):
            stats["transports"]["updated"] += 1
        else:
            stats["transports"]["unchanged"] += 1

    # ---- items ------------------------------------------------------------
    existing = {
        (i.supplier_id, (i.source_sheet or "").lower(), (i.code or "").strip().lower()): i
        for i in db.query(models.Item).all()
    }
    for row in seed.get("items", []):
        sup = by_code.get(row["supplier_code"].strip().lower())
        sup_id = sup.id if sup else None
        key = (sup_id, row["source_sheet"].lower(), row["code"].strip().lower())
        obj = existing.get(key)
        if obj is None:
            fields = {f: row.get(f) for f in ITEM_FIELDS if f in row}
            db.add(models.Item(supplier_id=sup_id, **fields))
            stats["items"]["created"] += 1
        elif overwrite_existing and _apply(obj, row, ITEM_FIELDS):
            stats["items"]["updated"] += 1
        else:
            stats["items"]["unchanged"] += 1

    db.commit()
    return stats
