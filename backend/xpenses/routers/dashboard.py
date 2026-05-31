from datetime import datetime
from fastapi import Depends, APIRouter
import asyncpg
from ..database import get_db
from ..models import DashboardStats, CategorySpend, ExpenseOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

EXPENSE_SELECT = """
    SELECT e.*, c.name as category_name
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
"""


@router.get("", response_model=DashboardStats)
async def get_dashboard(db: asyncpg.Connection = Depends(get_db)):
    now = datetime.utcnow()
    month_start = f"{now.year}-{now.month:02d}-01"

    row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expenses")
    expense_count_total = row["cnt"]

    row = await db.fetchrow(
        "SELECT COUNT(*) as cnt FROM expenses WHERE date >= $1", month_start
    )
    expense_count_month = row["cnt"]

    row = await db.fetchrow(
        "SELECT COALESCE(SUM(amount_eur), 0) as total FROM expenses WHERE date >= $1",
        month_start,
    )
    total_month_eur = row["total"]

    row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'draft'")
    draft_count = row["cnt"]

    row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'submitted'")
    submitted_count = row["cnt"]

    row = await db.fetchrow("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'paid'")
    paid_count = row["cnt"]

    rows = await db.fetch(
        """SELECT e.category_id, COALESCE(c.name, 'Uncategorized') as category_name,
                  SUM(e.amount_eur) as total, COUNT(*) as count
           FROM expenses e
           LEFT JOIN categories c ON e.category_id = c.id
           WHERE e.date >= $1
           GROUP BY e.category_id, c.name
           ORDER BY total DESC
           LIMIT 10""",
        month_start,
    )
    spend_by_category = [
        CategorySpend(
            category_id=r["category_id"],
            category_name=r["category_name"],
            total=r["total"],
            count=r["count"],
        )
        for r in rows
    ]

    rows = await db.fetch(
        f"{EXPENSE_SELECT} ORDER BY e.created_at DESC LIMIT 10"
    )
    recent = [dict(r) for r in rows]

    if recent:
        ids = [e["id"] for e in recent]
        rcpt_rows = await db.fetch(
            "SELECT * FROM receipts WHERE expense_id = ANY($1::int[]) ORDER BY created_at",
            ids,
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
        spend_by_category=spend_by_category,
        recent_expenses=recent,
    )
