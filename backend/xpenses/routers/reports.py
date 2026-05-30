import os
import zipfile
from io import BytesIO
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
import aiosqlite
from ..config import settings
from ..database import get_db
from ..models import ReportOut, ReportCreate, ReportUpdate, ReportSubmit, ExpenseOut
from ..services.pdf_export import generate_report_pdf

router = APIRouter(prefix="/api/reports", tags=["reports"])

EXPENSE_SELECT = """
    SELECT e.*, c.name as category_name
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
"""


async def _enrich_expenses_receipts(db: aiosqlite.Connection, expenses: list[dict]) -> list[dict]:
    if not expenses:
        return expenses
    ids = [e["id"] for e in expenses]
    placeholders = ",".join("?" * len(ids))
    async with db.execute(
        f"SELECT * FROM receipts WHERE expense_id IN ({placeholders}) ORDER BY created_at", ids
    ) as c:
        all_receipts = [dict(r) for r in await c.fetchall()]
    by_expense: dict[int, list] = {}
    for r in all_receipts:
        by_expense.setdefault(r["expense_id"], []).append(r)
    for e in expenses:
        e["receipts"] = by_expense.get(e["id"], [])
        if not e.get("receipt_path") and e["receipts"]:
            e["receipt_path"] = e["receipts"][0]["file_path"]
    return expenses


async def _fetch_report(db: aiosqlite.Connection, report_id: int) -> dict:
    async with db.execute("SELECT * FROM expense_reports WHERE id = ?", (report_id,)) as c:
        row = await c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    report = dict(row)
    async with db.execute(f"{EXPENSE_SELECT} WHERE e.report_id = ?", (report_id,)) as c:
        expenses = await c.fetchall()
    report["expenses"] = await _enrich_expenses_receipts(db, [dict(e) for e in expenses])
    return report


@router.get("", response_model=list[ReportOut])
async def list_reports(status: str | None = None):
    db = await get_db()
    try:
        query = "SELECT * FROM expense_reports"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC"
        async with db.execute(query, params) as c:
            rows = await c.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            async with db.execute(f"{EXPENSE_SELECT} WHERE e.report_id = ?", (r["id"],)) as c:
                expenses = await c.fetchall()
            r["expenses"] = await _enrich_expenses_receipts(db, [dict(e) for e in expenses])
            result.append(r)
        return result
    finally:
        await db.close()


@router.post("", response_model=ReportOut, status_code=201)
async def create_report(body: ReportCreate):
    db = await get_db()
    try:
        now = datetime.utcnow().isoformat()
        cursor = await db.execute(
            "INSERT INTO expense_reports (title, description, date_from, date_to, currency, created_at, updated_at) VALUES (?, ?, ?, ?, 'EUR', ?, ?)",
            (body.title, body.description, body.date_from, body.date_to, now, now),
        )
        await db.commit()
        return await _fetch_report(db, cursor.lastrowid)
    finally:
        await db.close()


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(report_id: int):
    db = await get_db()
    try:
        return await _fetch_report(db, report_id)
    finally:
        await db.close()


@router.patch("/{report_id}", response_model=ReportOut)
async def update_report(report_id: int, body: ReportUpdate):
    db = await get_db()
    try:
        async with db.execute("SELECT status FROM expense_reports WHERE id = ?", (report_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        if row["status"] != "draft":
            raise HTTPException(status_code=400, detail="Only draft reports can be edited")

        fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        if fields:
            fields["updated_at"] = datetime.utcnow().isoformat()
            set_clause = ", ".join(f"{k} = ?" for k in fields)
            await db.execute(
                f"UPDATE expense_reports SET {set_clause} WHERE id = ?",
                list(fields.values()) + [report_id],
            )
            await db.commit()
        return await _fetch_report(db, report_id)
    finally:
        await db.close()


@router.delete("/{report_id}", status_code=204)
async def delete_report(report_id: int):
    db = await get_db()
    try:
        async with db.execute("SELECT status FROM expense_reports WHERE id = ?", (report_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        if row["status"] != "draft":
            raise HTTPException(status_code=400, detail="Only draft reports can be deleted")
        await db.execute("UPDATE expenses SET report_id = NULL, status = 'draft' WHERE report_id = ?", (report_id,))
        await db.execute("DELETE FROM expense_reports WHERE id = ?", (report_id,))
        await db.commit()
    finally:
        await db.close()


@router.post("/{report_id}/attach", response_model=ReportOut)
async def attach_expenses(report_id: int, body: ReportSubmit):
    db = await get_db()
    try:
        async with db.execute("SELECT status FROM expense_reports WHERE id = ?", (report_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        if row["status"] != "draft":
            raise HTTPException(status_code=400, detail="Only draft reports can be modified")
        if not body.expense_ids:
            raise HTTPException(status_code=400, detail="At least one expense is required")

        placeholders = ",".join("?" * len(body.expense_ids))
        async with db.execute(
            f"SELECT id FROM expenses WHERE id IN ({placeholders}) AND status = 'draft'",
            body.expense_ids,
        ) as c:
            valid = {r["id"] for r in await c.fetchall()}

        invalid = set(body.expense_ids) - valid
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid or non-draft expense IDs: {invalid}")

        now = datetime.utcnow().isoformat()
        await db.execute(
            f"UPDATE expenses SET report_id = ?, updated_at = ? WHERE id IN ({placeholders})",
            [report_id, now] + body.expense_ids,
        )
        await db.execute(
            "UPDATE expense_reports SET updated_at = ? WHERE id = ?",
            (now, report_id),
        )
        await db.commit()
        return await _fetch_report(db, report_id)
    finally:
        await db.close()


@router.post("/{report_id}/submit", response_model=ReportOut)
async def submit_report(report_id: int, body: ReportSubmit | None = None):
    db = await get_db()
    try:
        async with db.execute("SELECT status FROM expense_reports WHERE id = ?", (report_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        if row["status"] != "draft":
            raise HTTPException(status_code=400, detail="Report is not in draft status")

        if body and body.expense_ids:
            placeholders = ",".join("?" * len(body.expense_ids))
            now = datetime.utcnow().isoformat()
            await db.execute(
                f"UPDATE expenses SET report_id = ?, updated_at = ? WHERE id IN ({placeholders}) AND status = 'draft'",
                [report_id, now] + body.expense_ids,
            )

        async with db.execute(
            "SELECT id FROM expenses WHERE report_id = ?", (report_id,)
        ) as c:
            attached = [r["id"] for r in await c.fetchall()]

        if not attached:
            raise HTTPException(status_code=400, detail="No expenses attached to this report")

        now = datetime.utcnow().isoformat()
        placeholders = ",".join("?" * len(attached))
        await db.execute(
            f"UPDATE expenses SET status = 'submitted', updated_at = ? WHERE id IN ({placeholders})",
            [now] + attached,
        )

        async with db.execute(
            "SELECT SUM(amount_eur) as total FROM expenses WHERE report_id = ?",
            (report_id,),
        ) as c:
            total = (await c.fetchone())["total"] or 0.0

        await db.execute(
            "UPDATE expense_reports SET status = 'submitted', submitted_at = ?, total_amount = ?, updated_at = ? WHERE id = ?",
            (now, total, now, report_id),
        )
        await db.commit()
        return await _fetch_report(db, report_id)
    finally:
        await db.close()


@router.post("/{report_id}/recall", response_model=ReportOut)
async def recall_report(report_id: int):
    db = await get_db()
    try:
        async with db.execute("SELECT status FROM expense_reports WHERE id = ?", (report_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        if row["status"] != "submitted":
            raise HTTPException(status_code=400, detail="Only submitted reports can be recalled")

        now = datetime.utcnow().isoformat()
        await db.execute(
            "UPDATE expense_reports SET status = 'draft', submitted_at = NULL, total_amount = 0, updated_at = ? WHERE id = ?",
            (now, report_id),
        )
        await db.execute(
            "UPDATE expenses SET status = 'draft', updated_at = ? WHERE report_id = ?",
            (now, report_id),
        )
        await db.commit()
        return await _fetch_report(db, report_id)
    finally:
        await db.close()


@router.post("/{report_id}/pay", response_model=ReportOut)
async def pay_report(report_id: int):
    db = await get_db()
    try:
        async with db.execute("SELECT status FROM expense_reports WHERE id = ?", (report_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        if row["status"] not in ("submitted", "approved"):
            raise HTTPException(status_code=400, detail="Report must be submitted before marking as paid")

        now = datetime.utcnow().isoformat()
        await db.execute(
            "UPDATE expense_reports SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?",
            (now, now, report_id),
        )
        await db.execute(
            "UPDATE expenses SET status = 'paid', updated_at = ? WHERE report_id = ?",
            (now, report_id),
        )
        await db.commit()
        return await _fetch_report(db, report_id)
    finally:
        await db.close()


@router.get("/{report_id}/export")
async def export_report_pdf(report_id: int):
    db = await get_db()
    try:
        async with db.execute("SELECT * FROM expense_reports WHERE id = ?", (report_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")

        report = dict(row)
        async with db.execute(
            """SELECT e.*, c.name as category_name
               FROM expenses e
               LEFT JOIN categories c ON e.category_id = c.id
               WHERE e.report_id = ?
               ORDER BY e.date""",
            (report_id,),
        ) as c:
            expenses = [dict(r) for r in await c.fetchall()]
        expenses = await _enrich_expenses_receipts(db, expenses)
    finally:
        await db.close()

    pdf_bytes = await generate_report_pdf(report, expenses)
    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in report["title"])
    filename = f"report_{report_id}_{safe_title[:40].strip()}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{report_id}/receipts-zip")
async def download_receipts_zip(report_id: int):
    db = await get_db()
    try:
        async with db.execute("SELECT title FROM expense_reports WHERE id = ?", (report_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        report_title = row["title"]

        async with db.execute(
            """SELECT e.id, e.date, e.merchant, e.description, r.file_path, r.original_name
               FROM receipts r
               JOIN expenses e ON r.expense_id = e.id
               WHERE e.report_id = ?
               ORDER BY e.date, r.created_at""",
            (report_id,),
        ) as c:
            receipt_rows = await c.fetchall()
    finally:
        await db.close()

    if not receipt_rows:
        raise HTTPException(status_code=404, detail="No receipts found for this report")

    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        seen: dict[str, int] = {}
        for r in receipt_rows:
            full_path = os.path.join(settings.receipts_dir, r["file_path"])
            if not os.path.exists(full_path):
                continue

            ext = os.path.splitext(r["file_path"])[1]
            name_parts = []
            if r["date"]:
                name_parts.append(r["date"])
            name_parts.append(r["merchant"] or r["description"] or f"expense_{r['id']}")
            base = "_".join(name_parts).replace(" ", "_").replace("/", "-")
            arc_name = f"{base}{ext}"
            if arc_name in seen:
                seen[arc_name] += 1
                arc_name = f"{base}_{seen[arc_name]}{ext}"
            else:
                seen[arc_name] = 1

            zf.write(full_path, arc_name)

    buf.seek(0)
    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in report_title)
    filename = f"receipts_{report_id}_{safe_title[:40].strip()}.zip"

    return Response(
        content=buf.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
