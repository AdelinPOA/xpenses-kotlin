import mimetypes
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from ..auth import get_current_user
from ..database import get_db
from ..models import ExpenseCreate, ExpenseOut, ExpenseUpdate
from ..services.fx_service import get_rate
from ..services.storage import delete_receipt, get_full_path, save_receipt

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

EXPENSE_SELECT = """
    SELECT e.*, c.name as category_name, u.display_name as user_display_name
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    LEFT JOIN users u ON e.user_id = u.id
"""


async def _enrich_with_receipts(db, expenses: list[dict]) -> list[dict]:
    if not expenses:
        return expenses
    ids = [e["id"] for e in expenses]
    rows = await db.fetch(
        "SELECT * FROM receipts WHERE expense_id = ANY($1::int[]) ORDER BY created_at",
        ids,
    )
    all_receipts = [dict(r) for r in rows]
    by_expense: dict[int, list] = {}
    for r in all_receipts:
        by_expense.setdefault(r["expense_id"], []).append(r)
    for e in expenses:
        e["receipts"] = by_expense.get(e["id"], [])
        e["receipt_path"] = e["receipts"][0]["file_path"] if e["receipts"] else e.get("receipt_path")
    return expenses


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    report_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    all: bool = Query(default=False),
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db)):
    conditions, params = [], []
    param_idx = 1

    if all and current_user["role"] in ("chef_finance", "mod", "manager"):
        # No user_id filter
        pass
    else:
        conditions.append(f"e.user_id = ${param_idx}")
        params.append(current_user["id"])
        param_idx += 1

    if report_id is not None:
        conditions.append(f"e.report_id = ${param_idx}")
        params.append(report_id)
        param_idx += 1
    if category_id is not None:
        conditions.append(f"e.category_id = ${param_idx}")
        params.append(category_id)
        param_idx += 1
    if status:
        conditions.append(f"e.status = ${param_idx}")
        params.append(status)
        param_idx += 1
    if from_date:
        conditions.append(f"e.date >= ${param_idx}")
        params.append(from_date)
        param_idx += 1
    if to_date:
        conditions.append(f"e.date <= ${param_idx}")
        params.append(to_date)
        param_idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await db.fetch(f"{EXPENSE_SELECT} {where} ORDER BY e.date DESC", *params)
    expenses = [dict(r) for r in rows]
    return await _enrich_with_receipts(db, expenses)


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(body: ExpenseCreate, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)
    tax_amount_eur = round(body.tax_amount * fx_rate, 2) if fx_rate else 0.0

    now = datetime.now(timezone.utc)
    row = await db.fetchrow(
        """INSERT INTO expenses
           (category_id, report_id, amount_original, currency_original, amount_eur, fx_rate,
            tax_amount, tax_rate, tax_amount_eur,
            date, description, merchant, raw_ocr_text, user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           RETURNING id""",
        body.category_id, body.report_id, body.amount, body.currency.upper(), amount_eur, fx_rate,
        body.tax_amount, body.tax_rate, tax_amount_eur,
        body.date, body.description, body.merchant, body.raw_ocr_text, current_user["id"], now, now,
    )
    new_id = row["id"]
    if body.comparison_id:
        await db.execute(
            "UPDATE ocr_comparisons SET expense_id = $1 WHERE id = $2",
            new_id, body.comparison_id
        )
    expense_row = await db.fetchrow(f"{EXPENSE_SELECT} WHERE e.id = $1", new_id)
    expenses = await _enrich_with_receipts(db, [dict(expense_row)])
    return expenses[0]


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense(expense_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow(f"{EXPENSE_SELECT} WHERE e.id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    row_dict = dict(row)
    if current_user["role"] not in ("chef_finance", "mod", "manager") and row_dict.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your expense")
    expenses = await _enrich_with_receipts(db, [row_dict])
    return expenses[0]


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(expense_id: int, body: ExpenseUpdate, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM expenses WHERE id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can perform this action")
    if row["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft expenses can be edited")

    raw = body.model_dump(exclude_unset=True)
    fields = {}

    need_fx_recalc = any(k in raw for k in ("amount", "currency", "date", "tax_amount", "tax_rate"))
    if need_fx_recalc:
        eff_amount = raw.get("amount", row["amount_original"])
        eff_currency = raw.get("currency", row["currency_original"]).upper()
        eff_date = raw.get("date", row["date"])

        # Use existing values if not provided; handle potential None
        row_tax_amount = row.get("tax_amount")
        if row_tax_amount is None: row_tax_amount = 0.0
        eff_tax_amount = raw.get("tax_amount", row_tax_amount)
        if eff_tax_amount is None: eff_tax_amount = 0.0

        eff_tax_rate = raw.get("tax_rate", row.get("tax_rate"))

        try:
            fx_rate = await get_rate(eff_currency, eff_date)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

        fields["amount_original"] = eff_amount
        fields["currency_original"] = eff_currency
        fields["amount_eur"] = round(eff_amount * fx_rate, 2)
        fields["fx_rate"] = fx_rate
        fields["tax_amount"] = eff_tax_amount
        fields["tax_rate"] = eff_tax_rate
        fields["tax_amount_eur"] = round(float(eff_tax_amount) * fx_rate, 2) if fx_rate else 0.0

    for k in ("date", "description", "merchant", "category_id", "raw_ocr_text"):
        if k in raw:
            fields[k] = raw[k]

    if "report_id" in raw:
        new_report_id = raw["report_id"]
        if new_report_id is not None:
            report_row = await db.fetchrow(
                "SELECT id, user_id, status FROM expense_reports WHERE id = $1", new_report_id
            )
            if not report_row:
                raise HTTPException(status_code=404, detail="Report not found")
            if report_row["user_id"] != current_user["id"]:
                raise HTTPException(status_code=403, detail="Cannot attach to another user's report")
            if report_row["status"] != "draft":
                raise HTTPException(status_code=400, detail="Can only attach expenses to draft reports")
        fields["report_id"] = new_report_id

    if fields:
        fields["updated_at"] = datetime.now(timezone.utc)
        set_parts = []
        values = []
        for idx, (k, v) in enumerate(fields.items(), start=1):
            set_parts.append(f"{k} = ${idx}")
            values.append(v)
        where_idx = len(fields) + 1
        await db.execute(
            f"UPDATE expenses SET {', '.join(set_parts)} WHERE id = ${where_idx}",
            *values, expense_id,
        )

    if body.comparison_id:
        await db.execute(
            "UPDATE ocr_comparisons SET expense_id = $1 WHERE id = $2",
            expense_id, body.comparison_id
        )

    updated = await db.fetchrow(f"{EXPENSE_SELECT} WHERE e.id = $1", expense_id)
    expenses = await _enrich_with_receipts(db, [dict(updated)])
    return expenses[0]

@router.post("/{expense_id}/duplicate", response_model=ExpenseOut, status_code=201)
async def duplicate_expense(expense_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM expenses WHERE id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can perform this action")

    try:
        fx_rate = await get_rate(row["currency_original"], row["date"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(row["amount_original"] * fx_rate, 2)
    tax_amount = float(row["tax_amount"]) if row["tax_amount"] is not None else 0.0
    tax_amount_eur = round(tax_amount * fx_rate, 2) if fx_rate else 0.0

    now = datetime.now(timezone.utc)
    new_row = await db.fetchrow(
        """INSERT INTO expenses
           (category_id, report_id, amount_original, currency_original, amount_eur, fx_rate,
            tax_amount, tax_rate, tax_amount_eur,
            date, description, merchant, user_id, status, created_at, updated_at)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', $13, $14)
           RETURNING id""",
        row["category_id"], row["amount_original"], row["currency_original"].upper(), amount_eur, fx_rate,
        tax_amount, row["tax_rate"], tax_amount_eur,
        row["date"], row["description"], row["merchant"], current_user["id"], now, now,
    )
    new_id = new_row["id"]
    expense_row = await db.fetchrow(f"{EXPENSE_SELECT} WHERE e.id = $1", new_id)
    expenses = await _enrich_with_receipts(db, [dict(expense_row)])
    return expenses[0]


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(expense_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT status, user_id FROM expenses WHERE id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can perform this action")
    if row["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft expenses can be deleted")
    receipt_rows = await db.fetch("SELECT file_path FROM receipts WHERE expense_id = $1", expense_id)
    for r in receipt_rows:
        await delete_receipt(r["file_path"], db)
    await db.execute("DELETE FROM receipts WHERE expense_id = $1", expense_id)
    await db.execute("DELETE FROM expenses WHERE id = $1", expense_id)


@router.post("/{expense_id}/receipts")
async def upload_receipts(expense_id: int, files: list[UploadFile] = File(...), current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT id, user_id FROM expenses WHERE id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can perform this action")

    saved = []
    now = datetime.now(timezone.utc)
    for file in files:
        try:
            relative_path = await save_receipt(expense_id, file, db)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        receipt_row = await db.fetchrow(
            "INSERT INTO receipts (expense_id, file_path, original_name, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
            expense_id, relative_path, file.filename, now,
        )
        saved.append({"id": receipt_row["id"], "file_path": relative_path, "original_name": file.filename})

    await db.execute(
        "UPDATE expenses SET updated_at = $1 WHERE id = $2",
        now, expense_id,
    )
    return saved


@router.post("/{expense_id}/receipt")
async def upload_receipt_compat(expense_id: int, file: UploadFile = File(...), current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    return await upload_receipts(expense_id, [file], current_user=current_user, db=db)


@router.delete("/{expense_id}/receipts/{receipt_id}", status_code=204)
async def delete_single_receipt(expense_id: int, receipt_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    exp_row = await db.fetchrow("SELECT user_id FROM expenses WHERE id = $1", expense_id)
    if not exp_row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp_row["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete receipts")

    row = await db.fetchrow(
        "SELECT file_path FROM receipts WHERE id = $1 AND expense_id = $2",
        receipt_id, expense_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")
    await delete_receipt(row["file_path"], db)
    await db.execute("DELETE FROM receipts WHERE id = $1", receipt_id)
    await db.execute(
        "UPDATE expenses SET updated_at = $1 WHERE id = $2",
        datetime.now(timezone.utc), expense_id,
    )


@router.get("/{expense_id}/receipts/{receipt_id}")
async def get_single_receipt(expense_id: int, receipt_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    exp_row = await db.fetchrow("SELECT user_id FROM expenses WHERE id = $1", expense_id)
    if not exp_row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if exp_row["user_id"] != current_user["id"] and current_user["role"] not in ("chef_finance", "mod"):
        raise HTTPException(status_code=403, detail="Not your expense")

    row = await db.fetchrow(
        "SELECT file_path FROM receipts WHERE id = $1 AND expense_id = $2",
        receipt_id, expense_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")
    full_path = await get_full_path(row["file_path"], db)
    mime, _ = mimetypes.guess_type(full_path)
    return FileResponse(full_path, media_type=mime or "application/octet-stream")


@router.get("/{expense_id}/receipt")
async def get_receipt_compat(expense_id: int, current_user: dict = Depends(get_current_user), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow(
        "SELECT id FROM receipts WHERE expense_id = $1 ORDER BY created_at LIMIT 1",
        expense_id,
    )
    if not row:
        exp = await db.fetchrow("SELECT receipt_path, user_id FROM expenses WHERE id = $1", expense_id)
        if not exp:
            raise HTTPException(status_code=404, detail="Expense not found")
        if exp["user_id"] != current_user["id"] and current_user["role"] not in ("chef_finance", "mod"):
            raise HTTPException(status_code=403, detail="Not your expense")
        if not exp["receipt_path"]:
            raise HTTPException(status_code=404, detail="No receipt found")
        full_path = await get_full_path(exp["receipt_path"], db)
        mime, _ = mimetypes.guess_type(full_path)
        return FileResponse(full_path, media_type=mime or "application/octet-stream")
    return await get_single_receipt(expense_id, row["id"], current_user=current_user, db=db)
