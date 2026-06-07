from datetime import datetime

import asyncpg
from fastapi import APIRouter, Depends

from ..auth import get_current_user
from ..database import get_db
from ..models import CategorySpend, DashboardStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

EXPENSE_SELECT = """
    SELECT e.*, c.name as category_name
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
"""


@router.get("", response_model=DashboardStats)
async def get_dashboard(
    all: bool = False,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db)
):
    now = datetime.utcnow()
    month_start = f"{now.year}-{now.month:02d}-01"

    is_org_wide = current_user["role"] in ("chef_finance", "mod") or (all and current_user["role"] == "manager")

    if is_org_wide:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses")
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses WHERE user_id = $1", current_user["id"])
    expense_count_total = row["cnt"]

    if is_org_wide:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses WHERE date >= $1", month_start)
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses WHERE date >= $1 AND user_id = $2", month_start, current_user["id"])
    expense_count_month = row["cnt"]

    if is_org_wide:
        row = await db.fetchrow("SELECT COALESCE(SUM(amount_eur), 0) as total FROM expenses WHERE date >= $1", month_start)
    else:
        row = await db.fetchrow("SELECT COALESCE(SUM(amount_eur), 0) as total FROM expenses WHERE date >= $1 AND user_id = $2", month_start, current_user["id"])
    total_month_eur = row["total"]

    if is_org_wide:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'draft'")
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'draft' AND user_id = $1", current_user["id"])
    draft_count = row["cnt"]

    if is_org_wide:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'submitted'")
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'submitted' AND user_id = $1", current_user["id"])
    submitted_count = row["cnt"]

    if is_org_wide:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'paid'")
    else:
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'paid' AND user_id = $1", current_user["id"])
    paid_count = row["cnt"]

    # Pending counts for action cards
    pending_approval_count = 0
    if current_user["role"] in ("manager", "chef_finance", "mod"):
        row = await db.fetchrow(
            "SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'submitted' AND user_id != $1",
            current_user["id"]
        )
        pending_approval_count = row["cnt"]

    pending_payment_count = 0
    if current_user["role"] in ("chef_finance", "mod"):
        row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'approved'")
        pending_payment_count = row["cnt"]

    if is_org_wide:
        rows = await db.fetch(
            """SELECT e.category_id, COALESCE(c.name, 'Uncategorized') as category_name,
                      SUM(e.amount_eur) as total, COUNT(*) as count
               FROM expenses e
               LEFT JOIN categories c ON e.category_id = c.id
               WHERE e.date >= $1
               GROUP BY e.category_id, c.name
               ORDER BY total DESC LIMIT 10""",
            month_start,
        )
    else:
        rows = await db.fetch(
            """SELECT e.category_id, COALESCE(c.name, 'Uncategorized') as category_name,
                      SUM(e.amount_eur) as total, COUNT(*) as count
               FROM expenses e
               LEFT JOIN categories c ON e.category_id = c.id
               WHERE e.date >= $1 AND e.user_id = $2
               GROUP BY e.category_id, c.name
               ORDER BY total DESC LIMIT 10""",
            month_start, current_user["id"],
        )
    spend_by_category = [
        CategorySpend(category_id=r["category_id"], category_name=r["category_name"], total=r["total"], count=r["count"])
        for r in rows
    ]

    EXPENSE_SELECT_WITH_USER = """
        SELECT e.*, c.name as category_name, u.display_name as user_display_name
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        LEFT JOIN users u ON e.user_id = u.id
    """

    if is_org_wide:
        rows = await db.fetch(f"{EXPENSE_SELECT_WITH_USER} ORDER BY e.created_at DESC LIMIT 10")
    else:
        rows = await db.fetch(f"{EXPENSE_SELECT_WITH_USER} WHERE e.user_id = $1 ORDER BY e.created_at DESC LIMIT 10", current_user["id"])
    recent = [dict(r) for r in rows]

    if recent:
        ids = [e["id"] for e in recent]
        rcpt_rows = await db.fetch(
            "SELECT * FROM receipts WHERE expense_id = ANY($1::int[]) ORDER BY created_at", ids
        )
        all_rcpts = [dict(r) for r in rcpt_rows]
        by_exp: dict[int, list] = {}
        for r in all_rcpts:
            by_exp.setdefault(r["expense_id"], []).append(r)
        for e in recent:
            e["receipts"] = by_exp.get(e["id"], [])

    return DashboardStats(
        expense_count_total=expense_count_total,
        expense_count_month=expense_count_month,
        total_month_eur=total_month_eur,
        draft_count=draft_count,
        submitted_count=submitted_count,
        paid_count=paid_count,
        pending_approval_count=pending_approval_count,
        pending_payment_count=pending_payment_count,
        spend_by_category=spend_by_category,
        recent_expenses=recent,
    )
