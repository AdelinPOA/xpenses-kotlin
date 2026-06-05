from datetime import datetime

from pydantic import BaseModel, ConfigDict

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
    category_id: int | None
    category_name: str | None = None
    report_id: int | None
    amount_original: float
    currency_original: str
    amount_eur: float
    fx_rate: float
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
    date: str
    description: str | None = None
    merchant: str | None = None


class ExpenseUpdate(BaseModel):
    category_id: int | None = None
    amount: float | None = None
    currency: str | None = None
    date: str | None = None
    description: str | None = None
    merchant: str | None = None


# ── Expense Reports ────────────────────────────────────────────────────────────

class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
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
    total_amount: float
    currency: str
    created_at: datetime
    updated_at: datetime
    expenses: list[ExpenseOut] = []
    advances: list["AdvancePaymentOut"] = []
    total_advances: float = 0.0
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
    spend_by_category: list[CategorySpend]
    recent_expenses: list[ExpenseOut]
