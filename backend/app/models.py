"""SQLAlchemy ORM models — the production data model for the export system.

Mirrors the domain proven in prototype-2 but with real persistence:
accounts and their access rights, masters (suppliers, buyers, items,
transports), the buyer order book (purchase-order lines), packing invoices
with their shipment lifecycle, and the costing sheet.
No seed / dummy rows are created — every record is entered through the API.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, String, Integer, Float, ForeignKey, JSON, DateTime
from sqlalchemy.orm import relationship

from .database import Base


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class User(Base):
    """An account. `role` is "admin" (everything, plus user management) or
    "user" (only the leaf permissions ticked in `access`). New sign-ups land
    as status="pending" until an admin approves them.

    Email verification: a user proves the address once — a one-time passcode
    on their very first sign-in — and `email_verified` stays true from then on,
    so every later sign-in is just email + password. An admin re-proves it once
    per session lifetime: `otp_verified_at` records the last passcode they
    passed, and a sign-in more than OTP_ADMIN_REVERIFY_HOURS later asks again.
    The pending challenge itself lives in `otp_*` and is cleared once used.
    """
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=new_id)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    # A second, reversible copy of the same password, so an admin can read one
    # back after confirming a passcode. Sign-in never looks at it — see
    # app/vault.py for what this costs and why it is here.
    password_enc = Column(String, nullable=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")     # admin | user
    status = Column(String, nullable=False, default="pending")  # pending | active | disabled
    access = Column(JSON, nullable=False, default=list)        # ["orders.entry", ...]
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    # Email verification / one-time passcode state
    email_verified = Column(Boolean, nullable=False, default=False)
    email_verified_at = Column(DateTime, nullable=True)
    otp_verified_at = Column(DateTime, nullable=True)   # last passcode passed
    otp_hash = Column(String, nullable=True)            # HMAC of the live code
    otp_expires_at = Column(DateTime, nullable=True)
    otp_sent_at = Column(DateTime, nullable=True)       # for the resend cooldown
    otp_attempts = Column(Integer, nullable=False, default=0)


class Supplier(Base):
    """A manufacturer we buy from. Address / PIN / state come from the client's
    master workbook (Sheet1) and print on the supplier PO and e-way bill."""
    __tablename__ = "suppliers"
    id = Column(String, primary_key=True, default=new_id)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    place = Column(String, default="")
    gstin = Column(String, default="")
    addr = Column(String, default="")
    pin = Column(String, default="")
    state = Column(String, default="")
    weights = Column(String, default="auto")  # "auto" | "manual"
    # The supplier's own reference for our orders — prints under the shipping
    # marks on their purchase order, beside our own reference.
    your_reference = Column(String, default="")


class Buyer(Base):
    __tablename__ = "buyers"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False)
    brand = Column(String, default="")
    country = Column(String, default="")
    curr = Column(String, default="USD")
    ship_to = Column(String, default="")
    addr = Column(String, default="")
    order_no = Column(String, default="")
    # Our own file reference for this buyer — prints under the shipping marks
    # on the supplier purchase order and carries into the Excel exports.
    our_reference = Column(String, default="")


class Item(Base):
    """One product of one supplier — a row of the client's master workbook.

    The workbook keeps a sheet per supplier range (Kiran, Hansa-PP, Hansa-GRN,
    Oswin, VP-PP, VP-GRN) and the ranges do not share every formula, so each
    row carries the `sticker_rule` its numbers were produced with. See
    `calc.derive_line` for the three variants — everything else (boxes,
    volume, weights, value, FOB, RBI reference) is common.
    """
    __tablename__ = "items"
    id = Column(String, primary_key=True, default=new_id)
    code = Column(String, nullable=False)
    gd = Column(String, default="")
    oswin = Column(String, default="")
    gl = Column(String, default="")
    size = Column(String, default="")
    length = Column(String, default="")
    pack_unit = Column(Integer, default=0)   # pieces per inner bag / unit pack
    packing = Column(Integer, default=1)     # pieces (or metres) per box
    description = Column(String, default="")
    barcode = Column(String, default="")
    hsn = Column(String, default="")
    volume = Column(Float, default=0.0)      # m³ per box
    net_per_box = Column(Float, default=0.0)
    gross_per_box = Column(Float, default=0.0)
    bg_per_box = Column(Float, default=0.0)  # bag stickers per box
    p_per_box = Column(Float, default=0.0)   # piece stickers per box
    type_up = Column(Integer, default=0)     # labels printed per sheet
    sticker_mult = Column(Float, default=1.1)      # (bg + p) × this
    sticker_round = Column(Boolean, default=False)  # …then rounded (GRN range)
    stickers_fixed = Column(Float, default=0.0)     # typed-in override, 0 = derive
    label_spoilage = Column(Float, default=1.0)     # 1.05 on the Oswin range
    sticker_rule = Column(String, default="pp")    # provenance: pp | grn | oswin
    uom = Column(String, default="PCS")            # PCS | MTR
    value_mode = Column(String, default="piece")   # piece | 100 | custom
    unit_value = Column(Float, default=0.0)
    fob_mode = Column(String, default="100")        # piece | 100 | custom
    unit_fob100 = Column(Float, default=0.0)
    group = Column(String, default="")
    source_sheet = Column(String, default="")     # provenance in Masters.xlsx
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=True)


class Transport(Base):
    """A carrier. One transporter may serve several suppliers (the workbook
    lists "Oswin Plastic Pvt Ltd, VP Plastic" against one carrier), so the
    full set lives in `supplier_ids`; `supplier_id` keeps the first of them
    for the older single-supplier reads."""
    __tablename__ = "transports"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False)
    transport_id = Column(String, default="")
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=True)
    supplier_ids = Column(JSON, nullable=False, default=list)


class PurchaseOrderLine(Base):
    """One item line of a buyer purchase order. Rows sharing `po` form one PO.

    The four price columns are a *snapshot* taken when the order was placed, so
    correcting an item's price in Setup never silently rewrites an order that
    was already agreed. NULL means "no snapshot" (rows written before the
    columns existed) and falls back to the item master's current price.
    Setup → Items → "Apply to all pending orders" refreshes the snapshot on
    every line that still has boxes outstanding; delivered lines keep theirs.
    """
    __tablename__ = "po_lines"
    id = Column(String, primary_key=True, default=new_id)
    po = Column(String, nullable=False, index=True)
    date = Column(String, nullable=False)  # ISO yyyy-mm-dd
    item_id = Column(String, ForeignKey("items.id"), nullable=False)
    qty = Column(Integer, default=0)
    rbi = Column(Float, default=0.0)
    buyer_id = Column(String, ForeignKey("buyers.id"), nullable=True)
    unit_value = Column(Float, nullable=True)     # ₹, as agreed on this order
    value_mode = Column(String, nullable=True)    # piece | 100 | custom
    unit_fob100 = Column(Float, nullable=True)    # $, as agreed on this order
    fob_mode = Column(String, nullable=True)      # piece | 100 | custom


class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(String, primary_key=True, default=new_id)
    invoice_no = Column(String, nullable=False)
    date = Column(String, nullable=False)
    buyer_id = Column(String, ForeignKey("buyers.id"), nullable=True)
    rbi = Column(Float, default=0.0)
    serial_start = Column(Integer, default=0)
    vehicles = Column(JSON, default=dict)            # { supplierId: {vehicleNo,transportId,transportName,source,dest} }
    ship = Column(JSON, default=dict)                # BL / container / shipping fields
    step_skip = Column(JSON, default=dict)           # { vehicle, container, ship }
    packing_transports = Column(JSON, default=dict)  # { supplierId: transportId }
    created_at = Column(DateTime, default=datetime.utcnow)
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceLine(Base):
    """One item's boxes on a packing invoice.

    The prices are frozen the moment the invoice is created, taken from the
    purchase orders these boxes actually clear. Once goods are delivered and
    invoiced, that paperwork is history: the customs invoice, the supplier's
    bill and the bank documents were all raised at those figures, so
    re-downloading them a year later must reproduce them exactly — never
    today's price. NULL means an invoice written before this column existed
    and falls back to the item master, as it always did.
    """
    __tablename__ = "invoice_lines"
    id = Column(String, primary_key=True, default=new_id)
    invoice_id = Column(String, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(String, ForeignKey("items.id"), nullable=False)
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=True)
    boxes = Column(Integer, default=0)
    unit_value = Column(Float, nullable=True)     # ₹ per piece, as invoiced
    value_mode = Column(String, nullable=True)    # piece | 100 | custom
    unit_fob100 = Column(Float, nullable=True)    # $ per piece / per 100, as invoiced
    fob_mode = Column(String, nullable=True)      # piece | 100 | custom
    invoice = relationship("Invoice", back_populates="lines")


class CostingLine(Base):
    """One row of the costing sheet — purchase price vs FOB, per item."""
    __tablename__ = "costing_lines"
    id = Column(String, primary_key=True, default=new_id)
    gd = Column(String, default="")
    code = Column(String, default="")
    dia = Column(String, default="")
    length = Column(String, default="")
    unit = Column(Integer, default=0)        # pcs per unit pack
    box = Column(Integer, default=0)         # pcs per box
    price_old = Column(Float, default=0.0)   # ₹ per pc, previous
    price_new = Column(Float, default=0.0)   # ₹ per pc, current
    boxes_fcl = Column(Integer, default=0)   # boxes that fit one container
    fob_now = Column(Float, default=0.0)     # $ we sell at today
    fob_old = Column(Float, default=0.0)     # $ we sold at before
    item_id = Column(String, ForeignKey("items.id"), nullable=True)


class Setting(Base):
    """Key/value application settings — currently the costing parameters
    (barcode ₹/sheet, transport & other ₹/FCL, exchange and realisation rates).
    A table rather than a config file because the client edits them in the UI."""
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=False, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
