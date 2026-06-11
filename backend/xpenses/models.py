from datetime import datetime

from pydantic import BaseModel, ConfigDict, computed_field, field_validator

# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    email: str | None
    auth_source: str
    role: str
    is_active: bool
    signature_path: str | None = None
    notifications_enabled: bool = True
    created_at: datetime
    updated_at: datetime


class RoleUpdate(BaseModel):
    role: str


class ActiveUpdate(BaseModel):
    is_active: bool


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    limit_amount: float | None
    is_active: bool
    created_at: datetime


class CategoryCreate(BaseModel):
    name: str
    limit_amount: float | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    limit_amount: float | None = None
    is_active: bool | None = None


# ── Receipts ──────────────────────────────────────────────────────────────────

class ReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    expense_id: int
    file_path: str
    original_name: str | None
    created_at: datetime


# ── Expenses ───────────────────────────────────────────────────────────────────

class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int | None = None
    user_display_name: str | None = None
    category_id: int | None
    category_name: str | None = None
    report_id: int | None
    amount_original: float
    currency_original: str
    amount_eur: float
    fx_rate: float
    tax_amount: float = 0.0
    tax_rate: float | None = None
    tax_amount_eur: float = 0.0
    date: str
    description: str | None
    merchant: str | None
    receipt_path: str | None
    receipts: list[ReceiptOut] = []
    status: str
    created_at: datetime
    updated_at: datetime


class ExpenseCreate(BaseModel):
    category_id: int | None = None
    report_id: int | None = None
    amount: float
    currency: str = "EUR"
    tax_amount: float = 0.0
    tax_rate: float | None = None
    date: str
    description: str | None = None
    merchant: str | None = None


class ExpenseUpdate(BaseModel):
    category_id: int | None = None
    report_id: int | None = None
    amount: float | None = None
    currency: str | None = None
    tax_amount: float | None = None
    tax_rate: float | None = None
    date: str | None = None
    description: str | None = None
    merchant: str | None = None


# ── Expense Reports ────────────────────────────────────────────────────────────

class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int | None = None
    user_display_name: str | None = None
    title: str
    description: str | None
    date_from: str | None
    date_to: str | None
    status: str
    submitted_at: datetime | None
    paid_at: datetime | None
    approved_by: int | None = None
    approved_at: datetime | None = None
    rejected_reason: str | None = None
    signer_id: int | None = None
    signed_at: datetime | None = None
    total_amount: float
    currency: str
    created_at: datetime
    updated_at: datetime
    expenses: list[ExpenseOut] = []
    advances: list["AdvancePaymentOut"] = []
    total_advances: float = 0.0
    mileage_records: list["MileageRecordOut"] = []
    total_mileage_eur: float = 0.0
    daily_allowance: float = 0.0
    total_reimbursable: float = 0.0


class ReportCreate(BaseModel):
    title: str
    description: str | None = None
    date_from: str | None = None
    date_to: str | None = None
    currency: str = "EUR"


class ReportUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    date_from: str | None = None
    date_to: str | None = None
    currency: str | None = None


class ReportSubmit(BaseModel):
    expense_ids: list[int]


# ── Advance Payments ─────────────────────────────────────────────────────────

class AdvancePaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    user_id: int
    status: str
    amount_original: float
    currency_original: str
    amount_eur: float
    fx_rate: float
    date: str
    description: str | None
    requested_amount: float | None = None
    requested_currency: str | None = None
    paid_by: int | None = None
    paid_by_name: str | None = None
    paid_at: datetime | None = None
    rejected_by: int | None = None
    rejected_by_name: str | None = None
    rejected_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdvancePaymentCreate(BaseModel):
    type: str = "paid"
    amount: float
    currency: str = "EUR"
    date: str | None = None
    description: str | None = None


class AdvancePaymentUpdate(BaseModel):
    amount: float | None = None
    currency: str | None = None
    date: str | None = None
    description: str | None = None


class AdvancePayBody(BaseModel):
    amount: float
    currency: str = "EUR"
    date: str


class AdvanceRejectBody(BaseModel):
    reason: str = ""


class PendingAdvanceOut(AdvancePaymentOut):
    user_display_name: str = ""
    report_title: str = ""


# ── Mileage Records ─────────────────────────────────────────────────────────

class MileageRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    user_id: int
    origin: str
    destination: str
    distance_km: float
    rate_before_tax: float
    rate_after_tax: float
    amount_before_tax: float
    amount_eur: float
    start_time: datetime
    end_time: datetime
    description: str | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def duration_minutes(self) -> float:
        return (self.end_time - self.start_time).total_seconds() / 60


class MileageRecordCreate(BaseModel):
    origin: str
    destination: str
    distance_km: float
    start_time: datetime
    end_time: datetime
    description: str | None = None

    @field_validator("end_time")
    @classmethod
    def end_after_start(cls, v, info):
        if info.data.get("start_time") and v <= info.data["start_time"]:
            raise ValueError("end_time must be after start_time")
        return v


class MileageRecordUpdate(BaseModel):
    origin: str | None = None
    destination: str | None = None
    distance_km: float | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None


# ── Settings ────────────────────────────────────────────────────────────────

class MileageRatesOut(BaseModel):
    mileage_rate_before_tax: float
    mileage_rate_after_tax: float


class MileageRatesUpdate(BaseModel):
    mileage_rate_before_tax: float | None = None
    mileage_rate_after_tax: float | None = None

    @field_validator("mileage_rate_before_tax", "mileage_rate_after_tax", mode="before")
    @classmethod
    def must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Rate must be positive")
        return v


# ── OCR ──────────────────────────────────────────────────────────────────────

class OCRScanResponse(BaseModel):
    amount: float | None = None
    currency: str | None = None
    tax_amount: float | None = None
    tax_rate: float | None = None
    date: str | None = None
    merchant: str | None = None
    raw_text: str = ""
    confidence: float = 0.0
    warnings: list[str] = []


class OCRConfigOut(BaseModel):
    provider: str
    ocr_enabled: bool
    gemini_api_key: str | None = None


class OCRConfigUpdate(BaseModel):
    provider: str | None = None
    ocr_enabled: bool | None = None
    gemini_api_key: str | None = None


class OCRTestRequest(BaseModel):
    gemini_api_key: str | None = None



# ── Dashboard ─────────────────────────────────────────────────────────────────

class CategorySpend(BaseModel):
    category_id: int | None
    category_name: str
    total: float
    count: int


class DashboardStats(BaseModel):
    expense_count_total: int
    expense_count_month: int
    total_month_eur: float
    draft_count: int
    submitted_count: int
    paid_count: int
    pending_approval_count: int = 0
    pending_payment_count: int = 0
    spend_by_category: list[CategorySpend]
    recent_expenses: list[ExpenseOut]
