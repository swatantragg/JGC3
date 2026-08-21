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


# ============================================================================
# Master 2A / 7A — one ordered item line, worked out exactly as Masters.xlsx
# ============================================================================
# The workbook keeps one sheet per supplier range and the ranges agree on
# everything except the barcode sticker total. Kiran / Hansa-PP / VP-PP:
#
#   L  boxes        = K / G                        pieces ÷ pieces-per-box
#   M  volume       = L * 0.06                     (0.06 m³/box is in the sheet)
#   Q  nett kgs     = O * L                        R  gross kgs = P * L
#   T  bg/box       = G / F      U  p/box = G      V  stickers  = (U + T) * 1.1
#   W  labels       = L * V                        Y  sheets = ROUNDUP(W / X)
#   AB purchase ₹   = K * AA                       AE FOB $  = K * AD / 100
#   AG RBI ref ₹    = AE * rate                    AF rate ₹ = AG / K
#
# Hansa-GRN / VP-GRN are the same with the sticker total rounded:
#   T  stickers     = ROUND(SUM(R:S) * 1.1, 0)
#
# Oswin (7A) counts stickers per piece rather than per bag, adds 5 % spoilage
# and prices FOB per piece, not per hundred:
#   M  boxes        = L / H        P volume = M * O   (per-item m³/box)
#   T  stickers     = S + R        U labels = M * T * 1.05
#   V  sheets       = ROUNDUP(U / 125)   (110 for the hydro-tube block)
#   Y  purchase ₹   = X * L        AB FOB $ = L * AA
#
# The workbook also has per-row exceptions inside a range — VP-PP rows 9-11
# round like the GRN sheets, two rows multiply by 1 instead of 1.1, one Oswin
# row types its total in by hand. So the three knobs that actually vary are
# stored per item (`sticker_mult`, `sticker_round`, `stickers_fixed`) and
# `sticker_rule` is kept only to say which range a row came from.
# ============================================================================

STICKER_RULES = ("pp", "grn", "oswin")


def _round_half_up(x: float) -> float:
    """Excel ROUND(): halves go away from zero. Python's round() is banker's
    rounding and would disagree on exact halves — 3025 vs 3024 on GRC15."""
    return math.floor(x + 0.5) if x >= 0 else -math.floor(-x + 0.5)


def stickers_per_box(item) -> float:
    """Barcode stickers consumed by one box.

    A typed-in total (`stickers_fixed`) always wins — that is how the sheet
    overrides a row. Otherwise bag + piece stickers are scaled and, on the
    ranges that do so, rounded.
    """
    fixed = float(getattr(item, "stickers_fixed", 0) or 0)
    if fixed:
        return fixed
    base = float(item.bg_per_box or 0) + float(item.p_per_box or 0)
    mult = getattr(item, "sticker_mult", None)
    mult = 1.1 if mult is None else float(mult)
    total = base * mult
    return _round_half_up(total) if getattr(item, "sticker_round", False) else total


def prices_of(item, snapshot=None) -> dict:
    """The four price fields to work a line out with.

    A purchase-order line carries a snapshot of the prices the order was
    agreed at, so correcting an item in Setup does not silently restate an
    order already placed. A line written before snapshots existed — or one
    never given a price — has NULL there and falls back to the item master,
    which is exactly how the system behaved before.
    """
    def pick(field):
        if snapshot is None:
            return None
        return getattr(snapshot, field, None) if not isinstance(snapshot, dict) else snapshot.get(field)

    uv, vm = pick("unit_value"), pick("value_mode")
    uf, fm = pick("unit_fob100"), pick("fob_mode")
    return {
        "unit_value": float(item.unit_value or 0) if uv is None else float(uv or 0),
        "value_mode": (item.value_mode or "piece") if not vm else vm,
        "unit_fob100": float(item.unit_fob100 or 0) if uf is None else float(uf or 0),
        "fob_mode": (item.fob_mode or "100") if not fm else fm,
    }


def prices_differ(item, snapshot) -> bool:
    """True when a line's agreed prices no longer match the item master —
    i.e. the price was edited in Setup after the order was placed."""
    p = prices_of(item, snapshot)
    return (
        abs(p["unit_value"] - float(item.unit_value or 0)) > 1e-9
        or abs(p["unit_fob100"] - float(item.unit_fob100 or 0)) > 1e-9
        or p["value_mode"] != (item.value_mode or "piece")
        or p["fob_mode"] != (item.fob_mode or "100")
    )


def fob_usd(item, qty, prices=None) -> float:
    """FOB value of `qty`. `fob_mode` says what unit_fob100 is quoted in —
    per 100 pieces on the PP/GRN sheets, per piece (or metre) on Oswin."""
    p = prices or prices_of(item)
    unit = float(p["unit_fob100"] or 0)
    per_100 = (p["fob_mode"] or "100") == "100"
    return (qty or 0) * unit / 100 if per_100 else (qty or 0) * unit


def purchase_inr(item, qty, prices=None) -> float:
    """Purchase value of `qty`. `value_mode` mirrors `fob_mode`; every sheet
    in the current workbook quotes ₹ per piece (Oswin tubes: ₹ per metre)."""
    p = prices or prices_of(item)
    unit = float(p["unit_value"] or 0)
    return (qty or 0) * unit / 100 if (p["value_mode"] or "piece") == "100" else (qty or 0) * unit


def derive_line(item, qty, rbi=0.0, snapshot=None) -> dict:
    """Every derived figure of one master row, for `qty` pieces (or metres).

    `boxes_exact` is the workbook's own division and drives volume, weights
    and labels so the figures tally with Excel to the last decimal.
    `boxes` is that rounded up — you cannot ship 2.86 cartons — and is what
    packing, allocation and the balance register count in. `partial_box`
    flags the rows where the two differ so a short-filled carton is visible
    rather than silent.
    """
    qty = float(qty or 0)
    rbi = float(rbi or 0)
    packing = int(item.packing or 0)
    prices = prices_of(item, snapshot)

    boxes_exact = qty / packing if packing else 0.0
    boxes = math.ceil(boxes_exact) if boxes_exact else 0

    ttl = stickers_per_box(item)
    spoilage = float(getattr(item, "label_spoilage", 1.0) or 1.0)
    labels = boxes_exact * ttl * spoilage
    type_up = int(item.type_up or 0)
    sheets = math.ceil(labels / type_up) if type_up and labels else 0

    total_value_inr = purchase_inr(item, qty, prices)
    total_fob_usd = fob_usd(item, qty, prices)
    rbi_ref_inr = rbi * total_fob_usd

    return {
        "qty": qty,
        "uom": item.uom or "PCS",
        "rbi": rbi,
        "boxes_exact": boxes_exact,
        "boxes": boxes,
        "partial_box": abs(boxes - boxes_exact) > 1e-9,
        "vol_per_box": float(item.volume or 0),
        "vol_total": boxes_exact * float(item.volume or 0),
        "net_per_box": float(item.net_per_box or 0),
        "gross_per_box": float(item.gross_per_box or 0),
        "net_total": boxes_exact * float(item.net_per_box or 0),
        "gross_total": boxes_exact * float(item.gross_per_box or 0),
        "bg_per_box": float(item.bg_per_box or 0),
        "p_per_box": float(item.p_per_box or 0),
        "stickers_per_box": ttl,
        "label_spoilage": spoilage,
        "labels": labels,
        "type_up": type_up,
        "sheets": sheets,
        "unit_value": prices["unit_value"],
        "value_mode": prices["value_mode"],
        "total_value_inr": total_value_inr,
        "unit_fob": prices["unit_fob100"],
        "fob_mode": prices["fob_mode"],
        "total_fob_usd": total_fob_usd,
        # True when this line was agreed at a price the item no longer carries.
        "price_pinned": snapshot is not None and prices_differ(item, snapshot),
        "rbi_ref_inr": rbi_ref_inr,
        "rate": (rbi_ref_inr / qty) if qty else 0.0,
    }


def _serial(n: int) -> str:
    return str(max(0, int(n))).zfill(3)


def build_order_master(po, po_lines, items_by_id) -> dict:
    """Master 2A — one buyer purchase order, item by item.

    The columns are the workbook's own: quantity, boxes, volume, nett and
    gross weight, barcode stickers and label sheets, purchase value, FOB and
    the RBI reference. Cartons are numbered straight through the order, so a
    line's serial range never overlaps the one before it.
    """
    rows_in = [r for r in po_lines if r.po == po]
    rows_in.sort(key=lambda r: str(items_by_id.get(r.item_id).gd if items_by_id.get(r.item_id) else ""))

    out, serial = [], 1
    for r in rows_in:
        it = items_by_id.get(r.item_id)
        if not it:
            continue
        d = derive_line(it, r.qty, r.rbi, snapshot=r)
        frm, to = serial, serial + d["boxes"] - 1
        serial += d["boxes"]
        out.append({
            "line_id": r.id, "item_id": it.id, "code": it.code, "gd": it.gd,
            "oswin": it.oswin, "gl": it.gl, "size": it.size, "length": it.length,
            "description": it.description, "barcode": it.barcode, "hsn": it.hsn,
            "packing": it.packing, "pack_unit": it.pack_unit,
            "supplier_id": it.supplier_id, "date": r.date, "buyer_id": r.buyer_id,
            "serial": f"{_serial(frm)}–{_serial(to)}" if d["boxes"] else "—",
            **d,
        })
    return {"po": po, "rows": out, "totals": _totals(out),
            "date": min((r.date for r in rows_in), default=None)}


def build_supplier_master(supplier_id, po_lines, items_by_id,
                          date_from=None, date_to=None) -> dict:
    """Master 7A — what one supplier has to make, across every open order.

    Quantities for the same item on different purchase orders are added up
    and the orders listed together, because the supplier makes them in one
    run. Carton numbers are then allotted down the whole sheet.

    Two orders for the same item can have been agreed at different prices, so
    the money columns are summed line by line rather than re-derived from one
    unit price; the unit price shown is the latest order's.
    """
    groups: dict = {}
    for r in po_lines:
        it = items_by_id.get(r.item_id)
        if not it or it.supplier_id != supplier_id:
            continue
        if date_from and r.date < date_from:
            continue
        if date_to and r.date > date_to:
            continue
        g = groups.setdefault(it.id, {
            "it": it, "pos": [], "qty": 0, "rbi": r.rbi, "last": r,
            "value_inr": 0.0, "fob_usd": 0.0, "lines": 0,
        })
        if r.po not in g["pos"]:
            g["pos"].append(r.po)
        g["qty"] += (r.qty or 0)
        g["rbi"] = r.rbi          # the most recently seen rate for that item
        g["last"] = r
        g["lines"] += 1
        p = prices_of(it, r)
        g["value_inr"] += purchase_inr(it, r.qty, p)
        g["fob_usd"] += fob_usd(it, r.qty, p)

    out, serial = [], 1
    for g in sorted(groups.values(), key=lambda x: str(x["it"].gd or x["it"].code)):
        it = g["it"]
        d = derive_line(it, g["qty"], g["rbi"], snapshot=g["last"])
        # Line-by-line money wins over the single-price derivation above.
        d["total_value_inr"] = g["value_inr"]
        d["total_fob_usd"] = g["fob_usd"]
        d["rbi_ref_inr"] = float(g["rbi"] or 0) * g["fob_usd"]
        d["rate"] = (d["rbi_ref_inr"] / d["qty"]) if d["qty"] else 0.0
        frm, to = serial, serial + d["boxes"] - 1
        serial += d["boxes"]
        out.append({
            "item_id": it.id, "code": it.code, "gd": it.gd, "oswin": it.oswin,
            "gl": it.gl, "size": it.size, "length": it.length,
            "description": it.description, "barcode": it.barcode, "hsn": it.hsn,
            "packing": it.packing, "pack_unit": it.pack_unit,
            "po": ", ".join(sorted(g["pos"])),
            "serial": f"{_serial(frm)}–{_serial(to)}" if d["boxes"] else "—",
            **d,
        })
    return {"supplier_id": supplier_id, "rows": out, "totals": _totals(out)}


_TOTAL_KEYS = ("qty", "boxes", "boxes_exact", "vol_total", "net_total", "gross_total",
               "labels", "sheets", "total_value_inr", "total_fob_usd", "rbi_ref_inr")


def _totals(rows: list) -> dict:
    return {k: sum(r.get(k) or 0 for r in rows) for k in _TOTAL_KEYS}


MASTER_FORMULAS = [
    ["Boxes", "Quantity ÷ pieces per box (rounded up for packing)"],
    ["Volume (m³)", "Boxes × volume per box"],
    ["Nett / Gross weight", "Boxes × nett (gross) kg per box"],
    ["Stickers per box", "( Bg per box + P per box ) × sticker multiplier"],
    ["Stickers per box · GRN range", "…rounded to a whole sticker"],
    ["Labels", "Boxes × stickers per box × label allowance (1.05 on Oswin)"],
    ["Sheets required", "RoundUp ( Labels ÷ labels per sheet )"],
    ["Purchase value (₹)", "Quantity × unit purchase price"],
    ["FOB value ($) · per 100 basis", "Quantity × unit FOB ÷ 100"],
    ["FOB value ($) · per piece basis", "Quantity × unit FOB"],
    ["RBI reference value (₹)", "RBI day rate × FOB value"],
    ["Rate (₹)", "RBI reference value ÷ Quantity"],
]


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
            "line_id": r.id, "line": r,
            "po": r.po, "date": r.date, "buyer_id": r.buyer_id, "qty": r.qty,
            "rbi": r.rbi, "ordered": ordered, "remaining": ordered, "allocated": 0,
            "invoices": set(), "supplier_id": it.supplier_id,
        })
    for b in by_item.values():
        # Oldest order first — and a stable tie-break, so two lines dated the
        # same day always allocate in the same sequence run after run.
        b["demands"].sort(key=lambda d: (d["date"], d["po"], d["line_id"]))

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


def invoiced_prices(item, boxes, demands) -> dict:
    """The prices to invoice `boxes` of `item` at.

    Boxes clear the oldest open order first, so the price they are invoiced at
    is the price those orders were agreed at — not whatever the item master
    says on the day the invoice is raised. Where a delivery spans two orders
    agreed at different prices, the unit price is the average weighted by the
    boxes each order takes, which makes the line total exactly the sum of the
    two parts. Boxes beyond anything on order fall back to the item master.

    `demands` is the item's open demands, oldest first, each carrying the
    purchase-order line it came from — i.e. `compute_ledger(...)["demands"]`
    filtered to those still owing.
    """
    boxes = int(boxes or 0)
    if boxes <= 0:
        return prices_of(item)

    left = boxes
    val_sum = fob_sum = taken = 0.0
    modes = None
    for d in demands:
        if left <= 0:
            break
        take = min(int(d.get("remaining") or 0), left)
        if take <= 0:
            continue
        p = prices_of(item, d.get("line"))
        val_sum += take * p["unit_value"]
        fob_sum += take * p["unit_fob100"]
        taken += take
        left -= take
        if modes is None:                      # the oldest order sets the basis
            modes = (p["value_mode"], p["fob_mode"])

    if not taken:
        return prices_of(item)

    base = prices_of(item)
    # Anything over-packed beyond the order book is valued at today's price.
    if left > 0:
        val_sum += left * base["unit_value"]
        fob_sum += left * base["unit_fob100"]
        taken += left

    vm, fm = modes or (base["value_mode"], base["fob_mode"])
    return {
        "unit_value": val_sum / taken,
        "value_mode": vm,
        "unit_fob100": fob_sum / taken,
        "fob_mode": fm,
    }


def open_demands_by_item(po_lines, invoices, items_by_id) -> dict:
    """Item id → its still-open demands, oldest first. What the next packing
    will be allocated against."""
    ledger = compute_ledger(po_lines, invoices, items_by_id)
    return {
        iid: [d for d in b["demands"] if d["remaining"] > 0]
        for iid, b in ledger.items()
    }


def _po_dates(po_lines) -> dict:
    d = {}
    for r in po_lines:
        if r.po not in d or r.date < d[r.po]:
            d[r.po] = r.date
    return d


# ---------------- Dashboard matrix (doc 39) ----------------
def build_balance_matrix(po_lines, invoices, items_by_id, suppliers, hidden_pos=None) -> dict:
    """Balance orders, boxes and volume — suppliers down, purchase orders across.

    `hidden_pos` are orders somebody has cleared off the dashboard once they
    were fully delivered. They are hidden from this view only: the order, its
    lines and every report are untouched. The hiding also lasts only while the
    order stays empty — should boxes fall due on it again it comes straight
    back onto the board, rather than owing quietly off-screen.
    """
    ledger = compute_ledger(po_lines, invoices, items_by_id)
    po_date = _po_dates(po_lines)
    all_pos = sorted(po_date, key=lambda p: (po_date[p], p))

    # What each order still owes, so "nothing pending" is decided here rather
    # than by the browser reading a row of dashes.
    owed = {po: 0 for po in all_pos}
    for b in ledger.values():
        for d in b["demands"]:
            if d["remaining"] > 0 and d["po"] in owed:
                owed[d["po"]] += d["remaining"]

    asked = {str(x) for x in (hidden_pos or [])}
    hidden = [po for po in all_pos if po in asked and owed[po] <= 0]
    hidden_set = set(hidden)
    pos = [po for po in all_pos if po not in hidden_set]

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
        # The orders with nothing left pending — the only ones that may be
        # cleared off the board — and those already cleared, so they can be
        # put back.
        "empty_pos": [po for po in pos if owed[po] <= 0],
        "hidden_pos": hidden,
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
                # Matched on the line itself: one PO can carry the same item
                # twice on the same day, and (po, date) would conflate them.
                dem = next((d for d in b["demands"] if d["line_id"] == r.id), None)
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
                "line_id": r.id, "item_id": it.id, "gd": it.gd, "code": it.code,
                "description": it.description, "supplier_id": it.supplier_id,
                "qty": r.qty, "ordered": ordv, "completed": alloc, "pending": rem,
                "volume": ordv * (it.volume or 0),
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
def build_item_order_detail(po_lines, items_by_id, invoices=None) -> dict:
    """The buyers' summary — one row per item, a column per purchase order.

    `recd` / `pending` come from the same FIFO ledger the packing screen and
    the balance register read, so the three can never disagree about how many
    boxes an item still owes.
    """
    po_date = _po_dates(po_lines)
    pos = sorted(po_date, key=lambda p: (po_date[p], p))
    ledger = compute_ledger(po_lines, invoices or [], items_by_id)
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
        dem = ledger.get(it.id, {}).get("demands", [])
        pending = sum(d["remaining"] for d in dem)
        recd = sum(d["allocated"] for d in dem)
        rows.append({
            "item_id": it.id, "gd": it.gd, "code": it.code, "size": it.size,
            "length": it.length, "packing": it.packing, "per_po": e["per_po"],
            "qty": e["qty"], "boxes": boxes, "recd": recd, "pending": pending,
            "supplier_id": it.supplier_id,
            "vol_per_box": it.volume or 0, "total_vol": boxes * (it.volume or 0),
            "net_per_box": it.net_per_box or 0, "net_total": boxes * (it.net_per_box or 0),
        })
    rows.sort(key=lambda x: str(x["gd"]))
    return {"pos": pos, "po_date": po_date, "rows": rows}


# ---------------- Supply details, item wise / supplier wise (doc 38) --------
def build_supply_details(po_lines, invoices, items_by_id, mode="po",
                         supplier_id=None, date_from=None, date_to=None) -> dict:
    """Doc 38 — one row per item, one column per purchase order or invoice.

    The workbook's own shape: code, description, packing (unit / box), a
    pieces column per document, then total pieces and boxes = total ÷ box.
    Boxes stay fractional exactly as the sheet's `=H6/E6` does, so a part-full
    carton reads as 0.71 rather than being rounded away.

    `mode="po"` with no date range lists only the orders still short and the
    pieces still owed on them — the live pending book. Give it a date range
    and it lists every order raised in that window at its ordered quantity,
    which is how the cleared history is read back. `mode="invoice"` lists the
    packing invoices and the pieces actually delivered on each.
    """
    ledger = compute_ledger(po_lines, invoices, items_by_id)

    def keep(it) -> bool:
        return not supplier_id or it.supplier_id == supplier_id

    def in_range(d) -> bool:
        if date_from and d < date_from:
            return False
        if date_to and d > date_to:
            return False
        return True

    ranged = bool(date_from or date_to)
    cols: dict = {}          # key -> date
    cells: dict = {}         # item_id -> {col key: pieces}
    seen: dict = {}          # item_id -> item

    if mode == "invoice":
        for inv in invoices:
            if not in_range(inv.date):
                continue
            for l in inv.lines:
                it = items_by_id.get(l.item_id)
                if not it or not keep(it):
                    continue
                pieces = int(l.boxes or 0) * int(it.packing or 0)
                if not pieces:
                    continue
                cols.setdefault(inv.invoice_no, inv.date)
                seen[it.id] = it
                row = cells.setdefault(it.id, {})
                row[inv.invoice_no] = row.get(inv.invoice_no, 0) + pieces
    else:
        for b in ledger.values():
            it = b["item"]
            if not keep(it):
                continue
            for d in b["demands"]:
                if ranged:
                    if not in_range(d["date"]):
                        continue
                    pieces = int(d["qty"] or 0)
                elif d["remaining"] > 0:
                    # Still owed: the boxes outstanding, back in pieces.
                    pieces = int(d["remaining"]) * int(it.packing or 0)
                else:
                    continue
                if not pieces:
                    continue
                cols.setdefault(d["po"], d["date"])
                seen[it.id] = it
                row = cells.setdefault(it.id, {})
                row[d["po"]] = row.get(d["po"], 0) + pieces

    col_list = [{"key": k, "date": v} for k, v in
                sorted(cols.items(), key=lambda kv: (kv[1], kv[0]))]

    rows = []
    for iid, it in seen.items():
        per = cells.get(iid, {})
        total = sum(per.values())
        box = int(it.packing or 0)
        rows.append({
            "item_id": iid, "code": it.code, "gd": it.gd,
            "description": it.description, "supplier_id": it.supplier_id,
            "unit": int(it.pack_unit or 0), "box": box,
            "per_col": per, "total": total,
            # The sheet's own division — deliberately not rounded up.
            "boxes": (total / box) if box else 0.0,
            "vol_per_box": float(it.volume or 0),
            "volume": ((total / box) if box else 0.0) * float(it.volume or 0),
        })
    rows.sort(key=lambda r: (str(r["gd"] or ""), str(r["code"] or "")))

    return {
        "mode": mode, "ranged": ranged, "cols": col_list, "rows": rows,
        "totals": {
            "total": sum(r["total"] for r in rows),
            "boxes": sum(r["boxes"] for r in rows),
            "volume": sum(r["volume"] for r in rows),
            "per_col": {c["key"]: sum(r["per_col"].get(c["key"], 0) for r in rows)
                        for c in col_list},
        },
    }


# ---------------- Costing sheet ----------------
def compute_costing(line, p) -> dict:
    """Cost working for one costing row against the shared parameters.

    Mirrors the client's Excel column for column: purchase per box, barcode,
    inland transport and clearing spread over a container, then cost per piece
    against the FOB we sell at.
    """
    old = float(line.price_old or 0)
    cur = float(line.price_new or 0)
    box = int(line.box or 0)
    bf = int(line.boxes_fcl or 0)

    diff = cur - old
    diff_pct = (diff * 100 / old) if old else 0.0
    per_box = cur * box
    sheets = math.ceil(box / 125) if box else 0
    barcode_box = sheets * float(p.barcode_sheet or 0)
    # The carton itself — one per box, at the price set with the other
    # container-wide charges.
    carton_box = float(getattr(p, "carton_price", 0) or 0)
    transport_box = math.ceil(float(p.transport_fcl or 0) / bf) if bf else 0
    # floor(x + .5), not round(): Python's round() is banker's rounding and
    # would disagree with the client's sheet on exact halves.
    other_box = math.floor(float(p.other_fcl or 0) / bf + 0.5) if bf else 0
    total_box = per_box + barcode_box + carton_box + transport_box + other_box
    per_pc = (total_box / box) if box else 0.0
    fob_cost = (per_pc / float(p.ex_rate)) if p.ex_rate else 0.0

    fob_now = float(line.fob_now or 0)
    fob_old = float(line.fob_old or 0)
    fob_diff = fob_now - fob_old
    fob_pct = (fob_diff * 100 / fob_old) if fob_old else 0.0
    profit_pc = fob_now * float(p.real_rate or 0) - per_pc
    profit_pct = (profit_pc * 100 / per_pc) if per_pc else 0.0

    return {
        "diff": diff, "diffPct": diff_pct, "perBox": per_box, "sheets": sheets,
        "barcodeBox": barcode_box, "cartonBox": carton_box,
        "transportBox": transport_box, "otherBox": other_box,
        "totalBox": total_box, "perPc": per_pc, "fobCost": fob_cost,
        "fobDiff": fob_diff, "fobPct": fob_pct, "profitPc": profit_pc, "profitPct": profit_pct,
    }


# One 20' container's usable volume — also what "boxes per FCL" defaults to
# when a costing line has not been given one.
CONTAINER_M3 = 68.0


def boxes_per_fcl(item) -> int:
    vol = float(getattr(item, "volume", 0) or 0)
    return int(CONTAINER_M3 // vol) if vol > 0 else 0


COSTING_FORMULAS = [
    ["Price difference (₹)", "New price − old price"],
    ["Difference %", "Difference × 100 ÷ old price"],
    ["Purchase / box (₹)", "New price × pcs per box"],
    ["Barcode sheets / box", "RoundUp ( pcs per box ÷ 125 )"],
    ["Barcode cost / box (₹)", "Sheets × ₹ per sheet"],
    ["Carton / box (₹)", "The carton price set with the container charges"],
    ["Transport / box (₹)", "RoundUp ( transport ₹/FCL ÷ boxes per FCL )"],
    ["Other charges / box (₹)", "Round ( other ₹/FCL ÷ boxes per FCL )"],
    ["Total cost / box (₹)", "Purchase + barcodes + carton + transport + other"],
    ["Cost / pc (₹)", "Total cost per box ÷ pcs per box"],
    ["Final sell price, FOB ($)", "Cost per pc ÷ exchange rate ₹/$"],
    ["FOB rise ($ · %)", "Sell now − sell old · ×100 ÷ old"],
    ["Profit / pc (₹)", "Sell now × realisation ₹/$ − cost per pc"],
    ["Profit %", "Profit per pc × 100 ÷ cost per pc"],
]
