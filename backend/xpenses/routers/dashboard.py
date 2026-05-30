from datetime import datetime
from fastapi import APIRouter
from ..database import get_db
from ..models import DashboardStats, CategorySpend, ExpenseOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

EXPENSE_SELECT = """
    SELECT e.*, c.name as category_name
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
"""


@router.get("", response_model=DashboardStats)
async def get_dashboard():
    db = await get_db()
    try:
        now = datetime.utcnow()
        month_start = f"{now.year}-{now.month:02d}-01"

        async with db.execute("SELECT COUNT(*) as cnt FROM expenses") as c:
            expense_count_total = (await c.fetchone())["cnt"]

        async with db.execute(
            "SELECT COUNT(*) as cnt FROM expenses WHERE date >= ?", (month_start,)
        ) as c:
            expense_count_month = (await c.fetchone())["cnt"]

        async with db.execute(
            "SELECT COALESCE(SUM(amount_eur), 0) as total FROM expenses WHERE date >= ?",
            (month_start,),
        ) as c:
            total_month_eur = (await c.fetchone())["total"]

        async with db.execute("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'draft'") as c:
            draft_count = (await c.fetchone())["cnt"]

        async with db.execute("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'submitted'") as c:
            submitted_count = (await c.fetchone())["cnt"]

        async with db.execute("SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'paid'") as c:
            paid_count = (await c.fetchone())["cnt"]

        async with db.execute(
            """SELECT e.category_id, COALESCE(c.name, 'Uncategorized') as category_name,
                      SUM(e.amount_eur) as total, COUNT(*) as count
               FROM expenses e
               LEFT JOIN categories c ON e.category_id = c.id
               WHERE e.date >= ?
               GROUP BY e.category_id
               ORDER BY total DESC
               LIMIT 10""",
            (month_start,),
        ) as c:
            spend_by_category = [
                CategorySpend(
                    category_id=r["category_id"],
                    category_name=r["category_name"],
                    total=r["total"],
                    count=r["count"],
                )
                for r in await c.fetchall()
            ]

        async with db.execute(
            f"{EXPENSE_SELECT} ORDER BY e.created_at DESC LIMIT 10"
        ) as c:
            recent = [dict(r) for r in await c.fetchall()]

        if recent:
            ids = [e["id"] for e in recent]
            ph = ",".join("?" * len(ids))
            async with db.execute(
                f"SELECT * FROM receipts WHERE expense_id IN ({ph}) ORDER BY created_at", ids
            ) as c:
                all_rcpts = [dict(r) for r in await c.fetchall()]
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
    finally:
        await db.close()
