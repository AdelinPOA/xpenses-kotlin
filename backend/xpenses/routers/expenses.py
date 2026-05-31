import mimetypes
from datetime import datetime
from fastapi import Depends, APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
import asyncpg
from ..database import get_db
from ..models import ExpenseOut, ExpenseCreate, ExpenseUpdate
from ..services.storage import save_receipt, delete_receipt, get_full_path
from ..services.fx_service import get_rate

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

EXPENSE_SELECT = """
    SELECT e.*, c.name as category_name
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
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
    db: asyncpg.Connection = Depends(get_db)):
    conditions, params = [], []
    param_idx = 1
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
async def create_expense(body: ExpenseCreate, db: asyncpg.Connection = Depends(get_db)):
    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)

    now = datetime.utcnow()
    row = await db.fetchrow(
        """INSERT INTO expenses
           (category_id, report_id, amount_original, currency_original, amount_eur, fx_rate,
            date, description, merchant, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id""",
        body.category_id, body.report_id, body.amount, body.currency.upper(), amount_eur, fx_rate,
        body.date, body.description, body.merchant, now, now,
    )
    new_id = row["id"]
    expense_row = await db.fetchrow(f"{EXPENSE_SELECT} WHERE e.id = $1", new_id)
    expenses = await _enrich_with_receipts(db, [dict(expense_row)])
    return expenses[0]


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense(expense_id: int, db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow(f"{EXPENSE_SELECT} WHERE e.id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    expenses = await _enrich_with_receipts(db, [dict(row)])
    return expenses[0]


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(expense_id: int, body: ExpenseUpdate, db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT * FROM expenses WHERE id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if row["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft expenses can be edited")

    raw = body.model_dump(exclude_unset=True)
    fields = {}

    need_fx_recalc = any(k in raw for k in ("amount", "currency", "date"))
    if need_fx_recalc:
        eff_amount = raw.get("amount", row["amount_original"])
        eff_currency = raw.get("currency", row["currency_original"]).upper()
        eff_date = raw.get("date", row["date"])

        try:
            fx_rate = await get_rate(eff_currency, eff_date)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

        fields["amount_original"] = eff_amount
        fields["currency_original"] = eff_currency
        fields["amount_eur"] = round(eff_amount * fx_rate, 2)
        fields["fx_rate"] = fx_rate

    for k in ("date", "description", "merchant", "category_id"):
        if k in raw:
            fields[k] = raw[k]

    if fields:
        fields["updated_at"] = datetime.utcnow()
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

    updated = await db.fetchrow(f"{EXPENSE_SELECT} WHERE e.id = $1", expense_id)
    expenses = await _enrich_with_receipts(db, [dict(updated)])
    return expenses[0]


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(expense_id: int, db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT status FROM expenses WHERE id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if row["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft expenses can be deleted")
    receipt_rows = await db.fetch("SELECT file_path FROM receipts WHERE expense_id = $1", expense_id)
    for r in receipt_rows:
        delete_receipt(r["file_path"])
    await db.execute("DELETE FROM receipts WHERE expense_id = $1", expense_id)
    await db.execute("DELETE FROM expenses WHERE id = $1", expense_id)


@router.post("/{expense_id}/receipts")
async def upload_receipts(expense_id: int, files: list[UploadFile] = File(...), db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow("SELECT id FROM expenses WHERE id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")

    saved = []
    now = datetime.utcnow()
    for file in files:
        try:
            relative_path = await save_receipt(expense_id, file)
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
async def upload_receipt_compat(expense_id: int, file: UploadFile = File(...), db: asyncpg.Connection = Depends(get_db)):
    return await upload_receipts(expense_id, [file], db=db)


@router.delete("/{expense_id}/receipts/{receipt_id}", status_code=204)
async def delete_single_receipt(expense_id: int, receipt_id: int, db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow(
        "SELECT file_path FROM receipts WHERE id = $1 AND expense_id = $2",
        receipt_id, expense_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")
    delete_receipt(row["file_path"])
    await db.execute("DELETE FROM receipts WHERE id = $1", receipt_id)
    await db.execute(
        "UPDATE expenses SET updated_at = $1 WHERE id = $2",
        datetime.utcnow(), expense_id,
    )


@router.get("/{expense_id}/receipts/{receipt_id}")
async def get_single_receipt(expense_id: int, receipt_id: int, db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow(
        "SELECT file_path FROM receipts WHERE id = $1 AND expense_id = $2",
        receipt_id, expense_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")
    full_path = get_full_path(row["file_path"])
    mime, _ = mimetypes.guess_type(full_path)
    return FileResponse(full_path, media_type=mime or "application/octet-stream")


@router.get("/{expense_id}/receipt")
async def get_receipt_compat(expense_id: int, db: asyncpg.Connection = Depends(get_db)):
    row = await db.fetchrow(
        "SELECT id FROM receipts WHERE expense_id = $1 ORDER BY created_at LIMIT 1",
        expense_id,
    )
    if not row:
        exp = await db.fetchrow("SELECT receipt_path FROM expenses WHERE id = $1", expense_id)
        if not exp or not exp["receipt_path"]:
            raise HTTPException(status_code=404, detail="No receipt found")
        full_path = get_full_path(exp["receipt_path"])
        mime, _ = mimetypes.guess_type(full_path)
        return FileResponse(full_path, media_type=mime or "application/octet-stream")
    return await get_single_receipt(expense_id, row["id"], db=db)
