import os
import zipfile
from datetime import datetime
from io import BytesIO

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import get_current_user, require_role
from ..config import settings
from ..database import get_db
from ..models import ReportCreate, ReportOut, ReportSubmit, ReportUpdate
from ..services.pdf_export import generate_report_pdf

router = APIRouter(prefix="/api/reports", tags=["reports"])

EXPENSE_SELECT = """
    SELECT e.*, c.name as category_name, u.display_name as user_display_name
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    LEFT JOIN users u ON e.user_id = u.id
"""


class RejectBody(BaseModel):
    reason: str = ""


async def _enrich_expenses_receipts(db: asyncpg.Connection, expenses: list[dict]) -> list[dict]:
    if not expenses:
        return expenses
    ids = [e["id"] for e in expenses]
    rows = await db.fetch(
        "SELECT * FROM receipts WHERE expense_id = ANY($1::int[]) ORDER BY created_at", ids
    )
    all_receipts = [dict(r) for r in rows]
    by_expense: dict[int, list] = {}
    for r in all_receipts:
        by_expense.setdefault(r["expense_id"], []).append(r)
    for e in expenses:
        e["receipts"] = by_expense.get(e["id"], [])
        if not e.get("receipt_path") and e["receipts"]:
            e["receipt_path"] = e["receipts"][0]["file_path"]
    return expenses


async def _fetch_report(db: asyncpg.Connection, report_id: int) -> dict:
    row = await db.fetchrow(
        "SELECT r.*, u.display_name as user_display_name FROM expense_reports r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = $1",
        report_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    report = dict(row)
    expenses = await db.fetch(f"{EXPENSE_SELECT} WHERE e.report_id = $1", report_id)
    report["expenses"] = await _enrich_expenses_receipts(db, [dict(e) for e in expenses])

    advances = await db.fetch(
        "SELECT * FROM advance_payments WHERE report_id = $1 ORDER BY date",
        report_id,
    )
    report["advances"] = [dict(a) for a in advances]
    report["total_advances"] = sum(a["amount_eur"] for a in report["advances"] if a.get("status", "paid") == "paid")

    mileage_rows = await db.fetch(
        "SELECT * FROM mileage_records WHERE report_id = $1 ORDER BY start_time",
        report_id,
    )
    report["mileage_records"] = [dict(m) for m in mileage_rows]
    report["total_mileage_eur"] = sum(m["amount_eur"] for m in report["mileage_records"])

    total_expenses = sum(e["amount_eur"] for e in report["expenses"])

    allowance = 0.0
    if report.get("date_from") and report.get("date_to"):
        try:
            d_from = datetime.strptime(report["date_from"][:10], "%Y-%m-%d")
            d_to = datetime.strptime(report["date_to"][:10], "%Y-%m-%d")
            days = (d_to - d_from).days + 1
            if days > 0:
                allowance = days * 50.0
        except ValueError:
            pass
    report["daily_allowance"] = allowance

    report["total_reimbursable"] = total_expenses + allowance + report["total_mileage_eur"] - report["total_advances"]

    return report


@router.get("", response_model=list[ReportOut])
async def list_reports(
    status: str | None = None,
    all: bool = False,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db)
):
    params: list = []
    
    if all and current_user["role"] in ("chef_finance", "mod", "manager"):
        query = "SELECT r.*, u.display_name as user_display_name FROM expense_reports r LEFT JOIN users u ON r.user_id = u.id"
        if status:
            query += " WHERE r.status = $1"
            params.append(status)
    else:
        query = "SELECT r.*, u.display_name as user_display_name FROM expense_reports r LEFT JOIN users u ON r.user_id = u.id WHERE r.user_id = $1"
        params = [current_user["id"]]
        if status:
            query += " AND r.status = $2"
            params.append(status)
            
    query += " ORDER BY r.created_at DESC"
    rows = await db.fetch(query, *params)
    result = []
    for row in rows:
        r = dict(row)
        expenses = await db.fetch(f"{EXPENSE_SELECT} WHERE e.report_id = $1", r["id"])
        r["expenses"] = await _enrich_expenses_receipts(db, [dict(e) for e in expenses])
        result.append(r)
    return result


@router.post("", response_model=ReportOut, status_code=201)
async def create_report(body: ReportCreate, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    now = datetime.utcnow()
    row = await db.fetchrow(
        "INSERT INTO expense_reports (title, description, date_from, date_to, currency, user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        body.title, body.description, body.date_from, body.date_to, body.currency.upper(), current_user["id"], now, now,
    )
    return await _fetch_report(db, row["id"])


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(report_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    report = await _fetch_report(db, report_id)
    # Managers, chef_finance and mod can view any report
    if current_user["role"] not in ("chef_finance", "mod", "manager") and report.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your report")
    return report


@router.patch("/{report_id}", response_model=ReportOut)
async def update_report(report_id: int, body: ReportUpdate, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    # ONLY the owner can update a report
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can update a report")
    if row["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be edited")

    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not fields:
        return await _fetch_report(db, report_id)

    if "currency" in fields and fields["currency"] is not None:
        fields["currency"] = fields["currency"].upper()

    fields["updated_at"] = datetime.utcnow()
    set_clause = ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, 1))
    params = list(fields.values()) + [report_id]
    await db.execute(
        f"UPDATE expense_reports SET {set_clause} WHERE id = ${len(fields) + 1}",
        *params,
    )
    return await _fetch_report(db, report_id)


@router.delete("/{report_id}", status_code=204)
async def delete_report(report_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT status, user_id FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    # ONLY the owner can delete a report
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete a report")
    if row["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be deleted")
    await db.execute("UPDATE expenses SET report_id = NULL, status = 'draft' WHERE report_id = $1", report_id)
    await db.execute("DELETE FROM expense_reports WHERE id = $1", report_id)


@router.post("/{report_id}/attach", response_model=ReportOut)
async def attach_expenses(report_id: int, body: ReportSubmit, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT status, user_id FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    # ONLY the owner can attach expenses
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can modify report expenses")
    if row["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be modified")
    if not body.expense_ids:
        raise HTTPException(status_code=400, detail="At least one expense is required")

    rows = await db.fetch(
        "SELECT id FROM expenses WHERE id = ANY($1::int[]) AND status = 'draft' AND user_id = $2",
        body.expense_ids, current_user["id"]
    )
    valid = {r["id"] for r in rows}

    invalid = set(body.expense_ids) - valid
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid, non-draft, or not-owned expense IDs: {invalid}")

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expenses SET report_id = $1, updated_at = $2 WHERE id = ANY($3::int[])",
        report_id, now, body.expense_ids,
    )
    await db.execute(
        "UPDATE expense_reports SET updated_at = $1 WHERE id = $2",
        now, report_id,
    )
    return await _fetch_report(db, report_id)


@router.post("/{report_id}/submit", response_model=ReportOut)
async def submit_report(report_id: int, body: ReportSubmit | None = None, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT status, user_id FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    # ONLY the owner can submit
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can submit a report")
    if row["status"] != "draft":
        raise HTTPException(status_code=400, detail="Report is not in draft status")

    if body and body.expense_ids:
        now = datetime.utcnow()
        await db.execute(
            "UPDATE expenses SET report_id = $1, updated_at = $2 WHERE id = ANY($3::int[]) AND status = 'draft' AND user_id = $4",
            report_id, now, body.expense_ids, current_user["id"]
        )

    rows = await db.fetch(
        "SELECT id FROM expenses WHERE report_id = $1", report_id
    )
    attached = [r["id"] for r in rows]

    if not attached:
        raise HTTPException(status_code=400, detail="No expenses attached to this report")

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expenses SET status = 'submitted', updated_at = $1 WHERE id = ANY($2::int[])",
        now, attached,
    )

    total_row = await db.fetchrow(
        "SELECT SUM(amount_eur) as total FROM expenses WHERE report_id = $1",
        report_id,
    )
    total = total_row["total"] or 0.0

    await db.execute(
        "UPDATE expense_reports SET status = 'submitted', submitted_at = $1, total_amount = $2, updated_at = $3 WHERE id = $4",
        now, total, now, report_id,
    )
    return await _fetch_report(db, report_id)


@router.post("/{report_id}/recall", response_model=ReportOut)
async def recall_report(report_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT status, user_id FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    # ONLY the owner can recall
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can recall a report")
    if row["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted reports can be recalled")

    now = datetime.utcnow()
    total_row = await db.fetchrow(
        "SELECT COALESCE(SUM(amount_eur), 0.0) as total FROM expenses WHERE report_id = $1", report_id
    )
    total = total_row["total"]

    await db.execute(
        "UPDATE expense_reports SET status = 'draft', submitted_at = NULL, total_amount = $1, updated_at = $2 WHERE id = $3",
        total, now, report_id,
    )
    await db.execute(
        "UPDATE expenses SET status = 'draft', updated_at = $1 WHERE report_id = $2",
        now, report_id,
    )
    return await _fetch_report(db, report_id)


@router.post("/{report_id}/pay", response_model=ReportOut)
async def pay_report(report_id: int, current_user: dict = require_role("chef_finance"), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT status FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "approved":
        raise HTTPException(status_code=400, detail="Only approved reports can be marked as paid")

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expense_reports SET status = 'paid', paid_at = $1, updated_at = $2 WHERE id = $3",
        now, now, report_id,
    )
    await db.execute(
        "UPDATE expenses SET status = 'paid', updated_at = $1 WHERE report_id = $2",
        now, report_id,
    )
    return await _fetch_report(db, report_id)


@router.get("/{report_id}/export")
async def export_report_pdf(report_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    # Viewers can export
    if current_user["role"] not in ("chef_finance", "mod", "manager") and row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your report")

    report = dict(row)
    expenses_rows = await db.fetch(
        """SELECT e.*, c.name as category_name
           FROM expenses e
           LEFT JOIN categories c ON e.category_id = c.id
           WHERE e.report_id = $1
           ORDER BY e.date""",
        report_id,
    )
    expenses = [dict(r) for r in expenses_rows]
    expenses = await _enrich_expenses_receipts(db, expenses)

    advance_rows = await db.fetch(
        "SELECT * FROM advance_payments WHERE report_id = $1 ORDER BY date",
        report_id,
    )
    advances = [dict(r) for r in advance_rows]

    mileage_rows = await db.fetch(
        "SELECT * FROM mileage_records WHERE report_id = $1 ORDER BY start_time",
        report_id,
    )
    mileage = [dict(m) for m in mileage_rows]

    signer = None
    if report.get("signer_id"):
        signer_row = await db.fetchrow(
            "SELECT id, display_name, signature_path FROM users WHERE id = $1",
            report["signer_id"],
        )
        if signer_row:
            signer = dict(signer_row)

    pdf_bytes = await generate_report_pdf(report, expenses, advances, mileage, signer)
    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in report["title"])
    filename = f"report_{report_id}_{safe_title[:40].strip()}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{report_id}/receipts-zip")
async def download_receipts_zip(report_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT title, user_id FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    # Viewers can download
    if current_user["role"] not in ("chef_finance", "mod", "manager") and row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your report")
    report_title = row["title"]

    receipt_rows = await db.fetch(
        """SELECT e.id, e.date, e.merchant, e.description, r.file_path, r.original_name
           FROM receipts r
           JOIN expenses e ON r.expense_id = e.id
           WHERE e.report_id = $1
           ORDER BY e.date, r.created_at""",
        report_id,
    )

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


@router.post("/{report_id}/approve", response_model=ReportOut)
async def approve_report(
    report_id: int,
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted reports can be approved")
    if row["user_id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot approve your own report")

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expense_reports SET status = 'approved', approved_by = $1, approved_at = $2, updated_at = $3 WHERE id = $4",
        current_user["id"], now, now, report_id,
    )
    await db.execute(
        "UPDATE expenses SET status = 'approved', updated_at = $1 WHERE report_id = $2",
        now, report_id,
    )
    return await _fetch_report(db, report_id)


@router.post("/{report_id}/reject", response_model=ReportOut)
async def reject_report(
    report_id: int,
    body: RejectBody = RejectBody(),
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "submitted":
        raise HTTPException(status_code=400, detail="Only submitted reports can be rejected")
    if row["user_id"] == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot reject your own report")

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expense_reports SET status = 'rejected', approved_by = $1, approved_at = $2, rejected_reason = $3, updated_at = $4 WHERE id = $5",
        current_user["id"], now, body.reason, now, report_id,
    )
    await db.execute(
        "UPDATE expenses SET status = 'draft', report_id = NULL, updated_at = $1 WHERE report_id = $2",
        now, report_id,
    )
    return await _fetch_report(db, report_id)


@router.post("/{report_id}/sign")
async def sign_report(
    report_id: int,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the report owner can sign")

    sig_path = await db.fetchval(
        "SELECT signature_path FROM users WHERE id = $1",
        current_user["id"],
    )
    if not sig_path:
        raise HTTPException(
            status_code=400,
            detail="No signature saved. Record your signature first.",
        )

    now = datetime.utcnow()
    await db.execute(
        "UPDATE expense_reports SET signer_id = $1, signed_at = $2, updated_at = $3 WHERE id = $4",
        current_user["id"], now, now, report_id,
    )
    return await _fetch_report(db, report_id)
