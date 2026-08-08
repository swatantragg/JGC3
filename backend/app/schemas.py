"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# Every address that enters the system is validated and lower-cased here, at
# the edge, rather than by each route in turn. A malformed address is not a
# cosmetic problem: it reaches the mailer, where it is a header-injection
# surface and a way to have a passcode delivered somewhere unintended.
class _Email(BaseModel):
    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _normalise(cls, v):
        return str(v or "").strip().lower()


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
    # True once the person has typed a mailed passcode at least once.
    email_verified: bool = False
    email_verified_at: Optional[datetime] = None
    # True while an admin-set password is still standing: the holder must
    # replace it before any other screen opens.
    must_change_password: bool = False
    # Shown in Setup -> Users so an admin can see an account under attack.
    hard_locked: bool = False
    locked_until: Optional[datetime] = None
    last_failed_at: Optional[datetime] = None

    @field_validator("email_verified", "must_change_password", "hard_locked", mode="before")
    @classmethod
    def _none_is_false(cls, v):
        return bool(v)


class LoginRequest(_Email):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """The session itself travels in an httpOnly cookie, which is why there is
    no token field here — a value the page can read is a value an injected
    script can steal."""
    user: UserOut
    # Present so one response shape covers both halves of the sign-in.
    otp_required: bool = False
    # True when this sign-in used a password an admin set: the app must send
    # the person straight to the change-password screen.
    must_change_password: bool = False


class OtpChallenge(BaseModel):
    """Returned instead of a session when a passcode must be typed first."""
    otp_required: bool = True
    challenge: str            # short-lived ticket naming the waiting account
    email: str                # masked, e.g. pr•••a@jaikvinglobal.com
    reason: str               # user_first_login | admin_session_renewal
    expires_in: int           # seconds the code stays valid
    resend_in: int            # seconds before "send it again" is allowed
    delivered: bool = True    # False when no mail transport is set up


class OtpVerifyRequest(BaseModel):
    challenge: str
    code: str


class OtpResendRequest(BaseModel):
    challenge: str


class StepUpGrant(BaseModel):
    """Proof an admin just answered a code — sent back on `X-Step-Up`."""
    grant: str
    expires_in: int


# ---------- Unlocking an account that locked itself ----------

class UnlockStartRequest(_Email):
    """"Unlock my account" — mails a code to the address on file.

    Answers the same way whether or not the account exists or is locked:
    telling a caller "no such account" here would hand back the enumeration
    the sign-in path was just closed against.
    """
    email: EmailStr


class UnlockVerifyRequest(BaseModel):
    challenge: str
    code: str


# ---------- Passwords ----------
#
# Passwords are not length-checked here: `app.passwords.check_password` runs in
# every route that takes one and answers with a single readable 400 listing all
# the broken rules, which a pydantic `min_length` would pre-empt with a 422.
# The `confirm_password` fields are checked in `app.passwords.check_match`.

class PasswordSet(BaseModel):
    """An admin setting somebody else's password."""
    new_password: str
    confirm_password: str = ""


class PasswordChange(BaseModel):
    """Somebody replacing their own password."""
    current_password: str
    new_password: str
    confirm_password: str = ""


class ForcedPasswordChange(BaseModel):
    """The same, on the one screen an account with `must_change_password` can
    reach. Separate because it is the only password route that does not ask
    for a step-up code — the person is holding a password an admin just gave
    them, and demanding a mailed code as well would strand anyone whose
    mailbox is the thing being set up."""
    current_password: str
    new_password: str
    confirm_password: str = ""


class BootstrapRequest(_Email):
    """Creates the very first admin — only works while no users exist."""
    name: str
    email: EmailStr
    password: str
    confirm_password: str = ""


class UserCreate(_Email):
    name: str
    email: EmailStr
    password: str
    confirm_password: str = ""
    role: str = "user"
    status: str = "active"
    access: list[str] = []
    # An admin-set password is a delivery mechanism, not a secret. Left on, the
    # holder replaces it at first sign-in and only they know the live one.
    must_change_password: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    access: Optional[list[str]] = None

    @field_validator("email", mode="before")
    @classmethod
    def _normalise(cls, v):
        return str(v).strip().lower() if v else v


# ---------- Audit ----------
class AuditRow(ORMModel):
    id: str
    at: datetime
    action: str
    actor_email: Optional[str] = None
    target_label: Optional[str] = None
    ip: Optional[str] = None
    outcome: str = "ok"
    detail: Optional[dict] = None


# ---------- Supplier ----------
class SupplierBase(BaseModel):
    code: str
    name: str
    place: str = ""
    gstin: str = ""
    addr: str = ""
    pin: str = ""
    state: str = ""
    weights: str = "auto"
    your_reference: str = ""

    @field_validator("your_reference", mode="before")
    @classmethod
    def _ref_none_is_blank(cls, v):
        return v or ""


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: Optional[str] = None
    name: Optional[str] = None
    place: Optional[str] = None
    gstin: Optional[str] = None
    addr: Optional[str] = None
    pin: Optional[str] = None
    state: Optional[str] = None
    weights: Optional[str] = None
    your_reference: Optional[str] = None


class Supplier(SupplierBase, ORMModel):
    id: str


# ---------- Buyer ----------
# The buyer's own letterhead — what their purchase order (document 17) prints
# around the goods. Blank is normal: only a buyer whose form we reproduce needs
# to have them filled in.
BUYER_LETTERHEAD = ("tagline", "ac_code", "abn", "acn", "tel", "fax", "web", "email", "po_box")


class BuyerBase(BaseModel):
    name: str
    brand: str = ""
    country: str = ""
    curr: str = "USD"
    ship_to: str = ""
    addr: str = ""
    order_no: str = ""
    our_reference: str = ""
    tagline: str = ""
    ac_code: str = ""
    abn: str = ""
    acn: str = ""
    tel: str = ""
    fax: str = ""
    web: str = ""
    email: str = ""
    po_box: str = ""

    @field_validator("our_reference", *BUYER_LETTERHEAD, mode="before")
    @classmethod
    def _ref_none_is_blank(cls, v):
        return v or ""


class BuyerCreate(BuyerBase):
    pass


class BuyerUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    brand: Optional[str] = None
    country: Optional[str] = None
    curr: Optional[str] = None
    ship_to: Optional[str] = None
    addr: Optional[str] = None
    order_no: Optional[str] = None
    our_reference: Optional[str] = None
    tagline: Optional[str] = None
    ac_code: Optional[str] = None
    abn: Optional[str] = None
    acn: Optional[str] = None
    tel: Optional[str] = None
    fax: Optional[str] = None
    web: Optional[str] = None
    email: Optional[str] = None
    po_box: Optional[str] = None


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
    pack_unit: int = 0
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
    sticker_mult: float = 1.1
    sticker_round: bool = False
    stickers_fixed: float = 0.0
    label_spoilage: float = 1.0
    sticker_rule: str = "pp"
    uom: str = "PCS"
    value_mode: str = "piece"
    unit_value: float = 0.0
    fob_mode: str = "100"
    unit_fob100: float = 0.0
    group: str = ""
    source_sheet: str = ""
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
    pack_unit: Optional[int] = None
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
    sticker_mult: Optional[float] = None
    sticker_round: Optional[bool] = None
    stickers_fixed: Optional[float] = None
    label_spoilage: Optional[float] = None
    sticker_rule: Optional[str] = None
    uom: Optional[str] = None
    value_mode: Optional[str] = None
    unit_value: Optional[float] = None
    fob_mode: Optional[str] = None
    unit_fob100: Optional[float] = None
    group: Optional[str] = None
    source_sheet: Optional[str] = None
    supplier_id: Optional[str] = None


class Item(ItemBase, ORMModel):
    id: str
    # Figures that do not depend on an order quantity, so every screen shows
    # the same stickers-per-box without recomputing it locally.
    stickers_per_box: float = 0.0


class ItemDeriveIn(BaseModel):
    """Ask the API what one ordered quantity works out to."""
    item_id: str
    qty: float = 0
    rbi: float = 0.0


# ---------- Transport ----------
class TransportBase(BaseModel):
    name: str
    transport_id: str = ""
    supplier_id: Optional[str] = None
    supplier_ids: list[str] = Field(default_factory=list)

    # Rows written before the column existed read back as NULL.
    @field_validator("supplier_ids", mode="before")
    @classmethod
    def _none_is_empty(cls, v):
        return v or []


class TransportCreate(TransportBase):
    pass


class TransportUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    transport_id: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_ids: Optional[list[str]] = None


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
    # The prices this line was invoiced at. NULL on invoices raised before the
    # columns existed — the reader falls back to the item master.
    unit_value: Optional[float] = None
    value_mode: Optional[str] = None
    unit_fob100: Optional[float] = None
    fob_mode: Optional[str] = None


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
    model_config = ConfigDict(extra="ignore")
    barcode_sheet: float = 20.0    # ₹ per sheet of 125 stickers
    carton_price: float = 0.0      # ₹ for the carton one box is packed in
    transport_fcl: float = 15000.0  # ₹ inland transport per container
    other_fcl: float = 50000.0      # ₹ clearing & other charges per container
    ex_rate: float = 90.0           # ₹/$ used to express our cost in USD
    real_rate: float = 94.5         # ₹/$ actually realised on the FOB price


class CostingPreviewIn(BaseModel):
    """Cost one item at a typed price without saving anything — the live
    working behind the costing screen's summary."""
    item_id: str
    price_new: float = 0.0
    price_old: Optional[float] = None
    boxes_fcl: Optional[int] = None
    fob_now: Optional[float] = None
    fob_old: Optional[float] = None
