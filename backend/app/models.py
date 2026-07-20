"""SQLAlchemy ORM models — the production data model for the export system.

Mirrors the domain proven in prototype-2 but with real persistence:
masters (suppliers, buyers, items, transports), the buyer order book
(purchase-order lines) and packing invoices with their shipment lifecycle.
No seed / dummy rows are created — every record is entered through the API.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, ForeignKey, JSON, DateTime
from sqlalchemy.orm import relationship

from .database import Base


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(String, primary_key=True, default=new_id)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    place = Column(String, default="")
    gstin = Column(String, default="")
    weights = Column(String, default="auto")  # "auto" | "manual"


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


class Item(Base):
    __tablename__ = "items"
    id = Column(String, primary_key=True, default=new_id)
    code = Column(String, nullable=False)
    gd = Column(String, default="")
    oswin = Column(String, default="")
    gl = Column(String, default="")
    size = Column(String, default="")
    length = Column(String, default="")
    packing = Column(Integer, default=1)
    description = Column(String, default="")
    barcode = Column(String, default="")
    hsn = Column(String, default="")
    volume = Column(Float, default=0.0)
    net_per_box = Column(Float, default=0.0)
    gross_per_box = Column(Float, default=0.0)
    bg_per_box = Column(Float, default=0.0)
    p_per_box = Column(Float, default=0.0)
    type_up = Column(Integer, default=0)
    value_mode = Column(String, default="piece")   # piece | 100 | custom
    unit_value = Column(Float, default=0.0)
    fob_mode = Column(String, default="100")        # piece | 100 | custom
    unit_fob100 = Column(Float, default=0.0)
    group = Column(String, default="")
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=True)


class Transport(Base):
    __tablename__ = "transports"
    id = Column(String, primary_key=True, default=new_id)
    name = Column(String, nullable=False)
    transport_id = Column(String, default="")
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=True)


class PurchaseOrderLine(Base):
    """One item line of a buyer purchase order. Rows sharing `po` form one PO."""
    __tablename__ = "po_lines"
    id = Column(String, primary_key=True, default=new_id)
    po = Column(String, nullable=False, index=True)
    date = Column(String, nullable=False)  # ISO yyyy-mm-dd
    item_id = Column(String, ForeignKey("items.id"), nullable=False)
    qty = Column(Integer, default=0)
    rbi = Column(Float, default=0.0)
    buyer_id = Column(String, ForeignKey("buyers.id"), nullable=True)


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
    __tablename__ = "invoice_lines"
    id = Column(String, primary_key=True, default=new_id)
    invoice_id = Column(String, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(String, ForeignKey("items.id"), nullable=False)
    supplier_id = Column(String, ForeignKey("suppliers.id"), nullable=True)
    boxes = Column(Integer, default=0)
    invoice = relationship("Invoice", back_populates="lines")
