"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Users & auth ----------
class UserOut(ORMModel):
    id: str
    email: str
    name: str
    role: str
    status: str
    access: list[str] = []
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user: UserOut


class RegisterRequest(BaseModel):
    """Self sign-up. The account is created pending until an admin approves."""
    name: str
    email: str
    password: str = Field(min_length=8)


class BootstrapRequest(RegisterRequest):
    """Creates the very first admin — only works while no users exist."""


class UserCreate(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=8)
    role: str = "user"
    status: str = "active"
    access: list[str] = []


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=8)
    role: Optional[str] = None
    status: Optional[str] = None
    access: Optional[list[str]] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


# ---------- Supplier ----------
class SupplierBase(BaseModel):
    code: str
    name: str
    place: str = ""
    gstin: str = ""
    weights: str = "auto"


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    place: Optional[str] = None
    gstin: Optional[str] = None
    weights: Optional[str] = None


class Supplier(SupplierBase, ORMModel):
    id: str


# ---------- Buyer ----------
class BuyerBase(BaseModel):
    name: str
    brand: str = ""
    country: str = ""
    curr: str = "USD"
    ship_to: str = ""
    addr: str = ""
    order_no: str = ""


class BuyerCreate(BuyerBase):
    pass


class BuyerUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    country: Optional[str] = None
    curr: Optional[str] = None
    ship_to: Optional[str] = None
    addr: Optional[str] = None
    order_no: Optional[str] = None


class Buyer(BuyerBase, ORMModel):
    id: str


# ---------- Item ----------
class ItemBase(BaseModel):
    code: str
    gd: str = ""
    oswin: str = ""
    gl: str = ""
    size: str = ""
    length: str = ""
    packing: int = 1
    description: str = ""
    barcode: str = ""
    hsn: str = ""
    volume: float = 0.0
    net_per_box: float = 0.0
    gross_per_box: float = 0.0
    bg_per_box: float = 0.0
    p_per_box: float = 0.0
    type_up: int = 0
    value_mode: str = "piece"
    unit_value: float = 0.0
    fob_mode: str = "100"
    unit_fob100: float = 0.0
    group: str = ""
    supplier_id: Optional[str] = None


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: Optional[str] = None
    gd: Optional[str] = None
    oswin: Optional[str] = None
    gl: Optional[str] = None
    size: Optional[str] = None
    length: Optional[str] = None
    packing: Optional[int] = None
    description: Optional[str] = None
    barcode: Optional[str] = None
    hsn: Optional[str] = None
    volume: Optional[float] = None
    net_per_box: Optional[float] = None
    gross_per_box: Optional[float] = None
    bg_per_box: Optional[float] = None
    p_per_box: Optional[float] = None
    type_up: Optional[int] = None
    value_mode: Optional[str] = None
    unit_value: Optional[float] = None
    fob_mode: Optional[str] = None
    unit_fob100: Optional[float] = None
    group: Optional[str] = None
    supplier_id: Optional[str] = None


class Item(ItemBase, ORMModel):
    id: str


# ---------- Transport ----------
class TransportBase(BaseModel):
    name: str
    transport_id: str = ""
    supplier_id: Optional[str] = None


class TransportCreate(TransportBase):
    pass


class TransportUpdate(BaseModel):
    name: Optional[str] = None
    transport_id: Optional[str] = None
    supplier_id: Optional[str] = None


class Transport(TransportBase, ORMModel):
    id: str


# ---------- Purchase orders ----------
class POLineIn(BaseModel):
    item_id: str
    qty: int


class PurchaseOrderCreate(BaseModel):
    po: str
    date: str
    buyer_id: Optional[str] = None
    rbi: float = 0.0
    lines: list[POLineIn]


class PurchaseOrderUpdate(BaseModel):
    po: Optional[str] = None
    date: Optional[str] = None
    lines: Optional[list[dict]] = None  # [{id?, item_id, qty}]


# ---------- Invoices ----------
class InvoiceLineIn(BaseModel):
    item_id: str
    supplier_id: Optional[str] = None
    boxes: int = 0


class InvoiceLineOut(ORMModel):
    id: str
    item_id: str
    supplier_id: Optional[str] = None
    boxes: int


class InvoiceCreate(BaseModel):
    invoice_no: str
    date: str
    buyer_id: Optional[str] = None
    rbi: float = 0.0
    serial_start: int = 0
    packing_transports: dict[str, Any] = Field(default_factory=dict)
    lines: list[InvoiceLineIn]


class InvoiceUpdate(BaseModel):
    invoice_no: Optional[str] = None
    date: Optional[str] = None
    buyer_id: Optional[str] = None
    rbi: Optional[float] = None
    serial_start: Optional[int] = None
    vehicles: Optional[dict[str, Any]] = None
    ship: Optional[dict[str, Any]] = None
    step_skip: Optional[dict[str, Any]] = None
    packing_transports: Optional[dict[str, Any]] = None
    lines: Optional[list[InvoiceLineIn]] = None


class InvoiceOut(ORMModel):
    id: str
    invoice_no: str
    date: str
    buyer_id: Optional[str] = None
    rbi: float
    serial_start: int
    vehicles: dict[str, Any] = {}
    ship: dict[str, Any] = {}
    step_skip: dict[str, Any] = {}
    packing_transports: dict[str, Any] = {}
    lines: list[InvoiceLineOut] = []
    # Computed
    status: Optional[str] = None


# ---------- Costing ----------
class CostingLineBase(BaseModel):
    gd: str = ""
    code: str = ""
    dia: str = ""
    length: str = ""
    unit: int = 0
    box: int = 0
    price_old: float = 0.0
    price_new: float = 0.0
    boxes_fcl: int = 0
    fob_now: float = 0.0
    fob_old: float = 0.0
    item_id: Optional[str] = None


class CostingLineCreate(CostingLineBase):
    pass


class CostingLineUpdate(BaseModel):
    gd: Optional[str] = None
    code: Optional[str] = None
    dia: Optional[str] = None
    length: Optional[str] = None
    unit: Optional[int] = None
    box: Optional[int] = None
    price_old: Optional[float] = None
    price_new: Optional[float] = None
    boxes_fcl: Optional[int] = None
    fob_now: Optional[float] = None
    fob_old: Optional[float] = None
    item_id: Optional[str] = None


class CostingLineOut(CostingLineBase, ORMModel):
    id: str
    computed: dict[str, Any] = {}


class CostParams(BaseModel):
    barcode_sheet: float = 20.0    # ₹ per sheet of 125 stickers
    transport_fcl: float = 15000.0  # ₹ inland transport per container
    other_fcl: float = 50000.0      # ₹ clearing & other charges per container
    ex_rate: float = 90.0           # ₹/$ used to express our cost in USD
    real_rate: float = 94.5         # ₹/$ actually realised on the FOB price
