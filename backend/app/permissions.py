"""Permission catalogue — the single source of truth for role-based access.

Access is stored per LEAF permission on the user row (`users.access`, a JSON
list of strings like "orders.entry"). Parents in the tree exist only for
display: a nav section unlocks when ANY of its leaves is granted.

Admins bypass the list entirely — `has()` returns True for every permission.
The frontend fetches this tree from /api/auth/permissions so the ticks in
Setup -> Users never drift from what the API actually enforces.
"""

PERM_TREE = [
    {"id": "home", "label": "Dashboard", "hint": "Overview and next actions"},
    {
        "id": "orders", "label": "Purchase Orders", "children": [
            {"id": "orders.entry", "label": "Order entry & PO list", "hint": "Add buyer orders, 2A / 7A masters"},
            {"id": "orders.reports", "label": "PO Reports", "hint": "Barcode, packing, purchase, sales, suppliers' PO"},
        ],
    },
    {
        "id": "shipment", "label": "Shipment", "children": [
            {"id": "shipment.packing", "label": "Packing — FIFO", "hint": "Record supplier boxes, create invoices"},
            {"id": "shipment.details", "label": "Shipment details", "hint": "BL, vessel, container, seal"},
            {"id": "shipment.reports", "label": "Suppliers' Reports", "hint": "Packing, purchase, sales, DO, e-way"},
        ],
    },
    {"id": "pre-shipment", "label": "Pre-Shipment Reports", "hint": "Customs set before loading"},
    {"id": "post-shipment", "label": "Post Shipment Reports", "hint": "After the container sails"},
    {
        "id": "reports", "label": "Other Reports", "children": [
            {"id": "reports.balance", "label": "Balance registers", "hint": "PO / item / supplier wise"},
            {"id": "reports.costing", "label": "Costing", "hint": "Cost working & profit per item"},
        ],
    },
    {
        "id": "setup", "label": "Setup", "children": [
            {"id": "setup.items", "label": "Items master", "hint": "Codes, packing, prices"},
            {"id": "setup.parties", "label": "Buyers & suppliers", "hint": "Trading partners"},
        ],
    },
]


def _leaves(nodes) -> list[str]:
    out = []
    for n in nodes:
        if n.get("children"):
            out.extend(_leaves(n["children"]))
        else:
            out.append(n["id"])
    return out


ALL_PERMS: list[str] = _leaves(PERM_TREE)

# Ready-made bundles so granting access is one click, not eleven.
ACCESS_PRESETS = {
    "full": {"label": "Full access", "perms": ALL_PERMS},
    "operations": {
        "label": "Operations",
        "perms": ["home", "orders.entry", "shipment.packing", "shipment.details"],
    },
    "reports": {
        "label": "Reports only",
        "perms": ["home", "orders.reports", "shipment.reports", "pre-shipment",
                  "post-shipment", "reports.balance", "reports.costing"],
    },
}


def clean_access(perms) -> list[str]:
    """Drop anything that is not a known leaf, keeping catalogue order."""
    given = set(perms or [])
    return [p for p in ALL_PERMS if p in given]
