"""Business logic — the authoritative computations for the export system.

Faithful Python port of the derivations proven in prototype-2: box counts,
FIFO allocation of packed boxes against the oldest open order, the dashboard
balance matrix (doc 39), the PO roll-up (with completed suppliers dropped),
item-wise order detail (doc 37), invoice serial ranges and the dispatch → ship
status lifecycle. All functions operate on ORM objects and return plain dicts.
"""
import math


def boxes_for(qty, packing) -> int:
    packing = packing or 1
    return math.ceil((qty or 0) / packing) if packing else 0


# ---------------- Invoice status lifecycle ----------------
def invoice_suppliers(inv) -> list:
    seen, out = set(), []
    for l in inv.lines:
        if l.supplier_id not in seen:
            seen.add(l.supplier_id)
            out.append(l.supplier_id)
    return out


def _vehicle_row_done(v) -> bool:
    return bool(v and v.get("vehicleNo") and v.get("source") and v.get("dest"))


def vehicle_done(inv) -> bool:
    if (inv.step_skip or {}).get("vehicle"):
        return True
    sups = invoice_suppliers(inv)
    v = inv.vehicles or {}
    return len(sups) > 0 and all(_vehicle_row_done(v.get(s)) for s in sups)


def container_done(inv) -> bool:
    if (inv.step_skip or {}).get("container"):
        return True
    s = inv.ship or {}
    return bool(s.get("container") and s.get("seal"))


def ship_step_done(inv) -> bool:
    if (inv.step_skip or {}).get("ship"):
        return True
    s = inv.ship or {}
    return bool(s.get("blNo") and s.get("blDate") and s.get("vessel"))


def invoice_status(inv) -> str:
    v, c, sh = vehicle_done(inv), container_done(inv), ship_step_done(inv)
    if v and c and sh:
        return "Shipped"
    if v and c:
        return "Ready to Ship"
    if v:
        return "Dispatched"
    return "Ready to dispatch"


def invoice_serials(inv, items_by_id) -> list:
    start = int(inv.serial_start or 0)
    out = []
    for l in inv.lines:
        it = items_by_id.get(l.item_id)
        boxes = int(l.boxes or 0)
        frm, to = start, start + boxes - 1
        start += boxes
        out.append({
            "item_id": l.item_id,
            "supplier_id": l.supplier_id,
            "boxes": boxes,
            "from": frm,
            "to": to,
            "range": f"{frm}–{to}" if boxes else "—",
        })
    return out


# ---------------- FIFO ledger ----------------
def compute_ledger(po_lines, invoices, items_by_id) -> dict:
    by_item: dict = {}
    for it_id, it in items_by_id.items():
        by_item[it_id] = {"item": it, "demands": []}
    for r in po_lines:
        it = items_by_id.get(r.item_id)
        if not it:
            continue
        ordered = boxes_for(r.qty, it.packing)
        by_item.setdefault(r.item_id, {"item": it, "demands": []})
        by_item[r.item_id]["demands"].append({
            "po": r.po, "date": r.date, "buyer_id": r.buyer_id, "qty": r.qty,
            "rbi": r.rbi, "ordered": ordered, "remaining": ordered, "allocated": 0,
            "invoices": set(), "supplier_id": it.supplier_id,
        })
    for b in by_item.values():
        b["demands"].sort(key=lambda d: d["date"])

    receipts = []
    for inv in sorted(invoices, key=lambda x: x.date):
        for l in inv.lines:
            receipts.append({"invoice_no": inv.invoice_no, "item_id": l.item_id, "boxes": int(l.boxes or 0)})
    for rc in receipts:
        b = by_item.get(rc["item_id"])
        if not b:
            continue
        avail = rc["boxes"]
        for d in b["demands"]:
            if avail <= 0:
                break
            take = min(d["remaining"], avail)
            if take > 0:
                d["remaining"] -= take
                avail -= take
                d["allocated"] += take
                d["invoices"].add(rc["invoice_no"])
    return by_item


def _po_dates(po_lines) -> dict:
    d = {}
    for r in po_lines:
        if r.po not in d or r.date < d[r.po]:
            d[r.po] = r.date
    return d


# ---------------- Dashboard matrix (doc 39) ----------------
def build_balance_matrix(po_lines, invoices, items_by_id, suppliers) -> dict:
    ledger = compute_ledger(po_lines, invoices, items_by_id)
    po_date = _po_dates(po_lines)
    pos = sorted(po_date, key=lambda p: (po_date[p], p))

    rows = []
    for s in suppliers:
        cells = {po: {"boxes": 0, "vol": 0.0} for po in pos}
        tot_box = tot_vol = 0.0
        for b in ledger.values():
            if b["item"].supplier_id != s.id:
                continue
            for d in b["demands"]:
                if d["remaining"] > 0 and d["po"] in cells:
                    cells[d["po"]]["boxes"] += d["remaining"]
                    cells[d["po"]]["vol"] += d["remaining"] * (b["item"].volume or 0)
        for po in pos:
            tot_box += cells[po]["boxes"]
            tot_vol += cells[po]["vol"]
        if tot_box > 0:
            rows.append({
                "supplier": {"id": s.id, "code": s.code, "name": s.name},
                "cells": cells, "totBox": int(tot_box), "totVol": tot_vol,
            })

    totals = {"cells": {po: {"boxes": 0, "vol": 0.0} for po in pos}, "totBox": 0, "totVol": 0.0}
    for po in pos:
        for r in rows:
            totals["cells"][po]["boxes"] += r["cells"][po]["boxes"]
            totals["cells"][po]["vol"] += r["cells"][po]["vol"]
    for r in rows:
        totals["totBox"] += r["totBox"]
        totals["totVol"] += r["totVol"]

    cntr_vol = 68.0
    containers = math.ceil(totals["totVol"] / cntr_vol) if totals["totVol"] else 0
    return {
        "pos": pos, "po_date": po_date, "rows": rows, "totals": totals,
        "cntr_vol": cntr_vol, "containers": containers,
    }


# ---------------- PO roll-up ----------------
def build_po_list(po_lines, invoices, items_by_id) -> list:
    ledger = compute_ledger(po_lines, invoices, items_by_id)
    po_map: dict = {}
    for r in po_lines:
        po_map.setdefault(r.po, []).append(r)

    out = []
    for po, rows in po_map.items():
        date = min(r.date for r in rows)
        ordered = completed = pending = 0
        volume = 0.0
        sup_set, pend_by_sup, detail = set(), {}, []
        buyer_id = rows[0].buyer_id
        for r in rows:
            it = items_by_id.get(r.item_id)
            if not it:
                continue
            b = ledger.get(r.item_id)
            dem = None
            if b:
                dem = next((d for d in b["demands"] if d["po"] == po and d["date"] == r.date), None)
            ordv = boxes_for(r.qty, it.packing)
            alloc = dem["allocated"] if dem else 0
            rem = dem["remaining"] if dem else ordv
            ordered += ordv
            completed += alloc
            pending += rem
            volume += ordv * (it.volume or 0)
            sup_set.add(it.supplier_id)
            pend_by_sup[it.supplier_id] = pend_by_sup.get(it.supplier_id, 0) + rem
            detail.append({
                "item_id": it.id, "gd": it.gd, "code": it.code, "description": it.description,
                "supplier_id": it.supplier_id, "qty": r.qty, "ordered": ordv,
                "completed": alloc, "pending": rem, "volume": ordv * (it.volume or 0),
            })
        open_suppliers = [s for s in sup_set if pend_by_sup.get(s, 0) > 0]
        out.append({
            "po": po, "date": date, "buyer_id": buyer_id, "ordered": ordered,
            "completed": completed, "pending": pending, "volume": volume,
            "suppliers": list(sup_set), "open_suppliers": open_suppliers, "detail": detail,
        })
    out.sort(key=lambda p: (p["date"], p["po"]), reverse=True)
    return out


# ---------------- Item-wise order detail (doc 37) ----------------
def build_item_order_detail(po_lines, items_by_id) -> dict:
    po_date = _po_dates(po_lines)
    pos = sorted(po_date, key=lambda p: (po_date[p], p))
    by_item: dict = {}
    for r in po_lines:
        it = items_by_id.get(r.item_id)
        if not it:
            continue
        e = by_item.setdefault(it.id, {"it": it, "per_po": {}, "qty": 0})
        e["per_po"][r.po] = e["per_po"].get(r.po, 0) + (r.qty or 0)
        e["qty"] += (r.qty or 0)
    rows = []
    for e in by_item.values():
        it = e["it"]
        boxes = boxes_for(e["qty"], it.packing)
        rows.append({
            "item_id": it.id, "gd": it.gd, "code": it.code, "size": it.size,
            "length": it.length, "packing": it.packing, "per_po": e["per_po"],
            "qty": e["qty"], "boxes": boxes,
            "vol_per_box": it.volume or 0, "total_vol": boxes * (it.volume or 0),
            "net_per_box": it.net_per_box or 0, "net_total": boxes * (it.net_per_box or 0),
        })
    rows.sort(key=lambda x: str(x["gd"]))
    return {"pos": pos, "po_date": po_date, "rows": rows}
