import mimetypes
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
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
    placeholders = ",".join("?" * len(ids))
    async with db.execute(
        f"SELECT * FROM receipts WHERE expense_id IN ({placeholders}) ORDER BY created_at",
        ids,
    ) as c:
        all_receipts = [dict(r) for r in await c.fetchall()]
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
):
    db = await get_db()
    try:
        conditions, params = [], []
        if report_id is not None:
            conditions.append("e.report_id = ?")
            params.append(report_id)
        if category_id is not None:
            conditions.append("e.category_id = ?")
            params.append(category_id)
        if status:
            conditions.append("e.status = ?")
            params.append(status)
        if from_date:
            conditions.append("e.date >= ?")
            params.append(from_date)
        if to_date:
            conditions.append("e.date <= ?")
            params.append(to_date)

        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        async with db.execute(f"{EXPENSE_SELECT} {where} ORDER BY e.date DESC", params) as c:
            rows = await c.fetchall()
        expenses = [dict(r) for r in rows]
        return await _enrich_with_receipts(db, expenses)
    finally:
        await db.close()


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(body: ExpenseCreate):
    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)

    db = await get_db()
    try:
        now = datetime.utcnow().isoformat()
        cursor = await db.execute(
            """INSERT INTO expenses
               (category_id, amount_original, currency_original, amount_eur, fx_rate,
                date, description, merchant, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (body.category_id, body.amount, body.currency.upper(), amount_eur, fx_rate,
             body.date, body.description, body.merchant, now, now),
        )
        await db.commit()
        async with db.execute(f"{EXPENSE_SELECT} WHERE e.id = ?", (cursor.lastrowid,)) as c:
            row = await c.fetchone()
        expenses = await _enrich_with_receipts(db, [dict(row)])
        return expenses[0]
    finally:
        await db.close()


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense(expense_id: int):
    db = await get_db()
    try:
        async with db.execute(f"{EXPENSE_SELECT} WHERE e.id = ?", (expense_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")
        expenses = await _enrich_with_receipts(db, [dict(row)])
        return expenses[0]
    finally:
        await db.close()


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense(expense_id: int, body: ExpenseUpdate):
    db = await get_db()
    try:
        async with db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)) as c:
            row = await c.fetchone()
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
            fields["updated_at"] = datetime.utcnow().isoformat()
            set_clause = ", ".join(f"{k} = ?" for k in fields)
            await db.execute(
                f"UPDATE expenses SET {set_clause} WHERE id = ?",
                list(fields.values()) + [expense_id],
            )
            await db.commit()

        async with db.execute(f"{EXPENSE_SELECT} WHERE e.id = ?", (expense_id,)) as c:
            updated = await c.fetchone()
        expenses = await _enrich_with_receipts(db, [dict(updated)])
        return expenses[0]
    finally:
        await db.close()


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(expense_id: int):
    db = await get_db()
    try:
        async with db.execute("SELECT status FROM expenses WHERE id = ?", (expense_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")
        if row["status"] != "draft":
            raise HTTPException(status_code=400, detail="Only draft expenses can be deleted")
        async with db.execute("SELECT file_path FROM receipts WHERE expense_id = ?", (expense_id,)) as c:
            receipt_rows = await c.fetchall()
        for r in receipt_rows:
            delete_receipt(r["file_path"])
        await db.execute("DELETE FROM receipts WHERE expense_id = ?", (expense_id,))
        await db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        await db.commit()
    finally:
        await db.close()


@router.post("/{expense_id}/receipts")
async def upload_receipts(expense_id: int, files: list[UploadFile] = File(...)):
    db = await get_db()
    try:
        async with db.execute("SELECT id FROM expenses WHERE id = ?", (expense_id,)) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")

        saved = []
        now = datetime.utcnow().isoformat()
        for file in files:
            try:
                relative_path = await save_receipt(expense_id, file)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

            cursor = await db.execute(
                "INSERT INTO receipts (expense_id, file_path, original_name, created_at) VALUES (?, ?, ?, ?)",
                (expense_id, relative_path, file.filename, now),
            )
            saved.append({"id": cursor.lastrowid, "file_path": relative_path, "original_name": file.filename})

        await db.execute(
            "UPDATE expenses SET updated_at = ? WHERE id = ?",
            (now, expense_id),
        )
        await db.commit()
        return saved
    finally:
        await db.close()


@router.post("/{expense_id}/receipt")
async def upload_receipt_compat(expense_id: int, file: UploadFile = File(...)):
    return await upload_receipts(expense_id, [file])


@router.delete("/{expense_id}/receipts/{receipt_id}", status_code=204)
async def delete_single_receipt(expense_id: int, receipt_id: int):
    db = await get_db()
    try:
        async with db.execute(
            "SELECT file_path FROM receipts WHERE id = ? AND expense_id = ?",
            (receipt_id, expense_id),
        ) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Receipt not found")
        delete_receipt(row["file_path"])
        await db.execute("DELETE FROM receipts WHERE id = ?", (receipt_id,))
        await db.execute(
            "UPDATE expenses SET updated_at = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), expense_id),
        )
        await db.commit()
    finally:
        await db.close()


@router.get("/{expense_id}/receipts/{receipt_id}")
async def get_single_receipt(expense_id: int, receipt_id: int):
    db = await get_db()
    try:
        async with db.execute(
            "SELECT file_path FROM receipts WHERE id = ? AND expense_id = ?",
            (receipt_id, expense_id),
        ) as c:
            row = await c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Receipt not found")
        full_path = get_full_path(row["file_path"])
        mime, _ = mimetypes.guess_type(full_path)
        return FileResponse(full_path, media_type=mime or "application/octet-stream")
    finally:
        await db.close()


@router.get("/{expense_id}/receipt")
async def get_receipt_compat(expense_id: int):
    db = await get_db()
    try:
        async with db.execute(
            "SELECT id FROM receipts WHERE expense_id = ? ORDER BY created_at LIMIT 1",
            (expense_id,),
        ) as c:
            row = await c.fetchone()
        if not row:
            async with db.execute("SELECT receipt_path FROM expenses WHERE id = ?", (expense_id,)) as c:
                exp = await c.fetchone()
            if not exp or not exp["receipt_path"]:
                raise HTTPException(status_code=404, detail="No receipt found")
            full_path = get_full_path(exp["receipt_path"])
            mime, _ = mimetypes.guess_type(full_path)
            return FileResponse(full_path, media_type=mime or "application/octet-stream")
        return await get_single_receipt(expense_id, row["id"])
    finally:
        await db.close()
