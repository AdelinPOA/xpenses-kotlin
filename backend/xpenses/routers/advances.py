from datetime import datetime

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user
from ..database import get_db
from ..models import AdvancePaymentCreate, AdvancePaymentOut, AdvancePaymentUpdate
from ..services.fx_service import get_rate

router = APIRouter(prefix="/api/reports/{report_id}/advances", tags=["advances"])


async def _verify_report_ownership(
    db: asyncpg.Connection, report_id: int, current_user: dict
) -> dict:
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["user_id"] != current_user["id"] and current_user["role"] not in (
        "chef_finance",
        "mod",
    ):
        raise HTTPException(status_code=403, detail="Not your report")
    return dict(row)


@router.get("", response_model=list[AdvancePaymentOut])
async def list_advances(
    report_id: int,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    await _verify_report_ownership(db, report_id, current_user)
    rows = await db.fetch(
        "SELECT * FROM advance_payments WHERE report_id = $1 ORDER BY date",
        report_id,
    )
    return [dict(r) for r in rows]


@router.post("", response_model=AdvancePaymentOut, status_code=201)
async def create_advance(
    report_id: int,
    body: AdvancePaymentCreate,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    if report["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be modified")

    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)
    now = datetime.utcnow()

    row = await db.fetchrow(
        """INSERT INTO advance_payments
           (report_id, user_id, amount_original, currency_original, amount_eur, fx_rate,
            date, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *""",
        report_id,
        current_user["id"],
        body.amount,
        body.currency.upper(),
        amount_eur,
        fx_rate,
        body.date,
        body.description,
        now,
        now,
    )
    return dict(row)


@router.patch("/{advance_id}", response_model=AdvancePaymentOut)
async def update_advance(
    report_id: int,
    advance_id: int,
    body: AdvancePaymentUpdate,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    if report["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be modified")

    adv = await db.fetchrow(
        "SELECT * FROM advance_payments WHERE id = $1 AND report_id = $2",
        advance_id,
        report_id,
    )
    if not adv:
        raise HTTPException(status_code=404, detail="Advance payment not found")

    raw = body.model_dump(exclude_unset=True)
    if not raw:
        return dict(adv)

    fields = {}
    need_fx_recalc = any(k in raw for k in ("amount", "currency", "date"))
    if need_fx_recalc:
        eff_amount = raw.get("amount", adv["amount_original"])
        eff_currency = raw.get("currency", adv["currency_original"]).upper()
        eff_date = raw.get("date", adv["date"])
        try:
            fx_rate = await get_rate(eff_currency, eff_date)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")
        fields["amount_original"] = eff_amount
        fields["currency_original"] = eff_currency
        fields["amount_eur"] = round(eff_amount * fx_rate, 2)
        fields["fx_rate"] = fx_rate

    for k in ("date", "description"):
        if k in raw:
            fields[k] = raw[k]

    fields["updated_at"] = datetime.utcnow()
    set_parts = [f"{k} = ${i}" for i, k in enumerate(fields, 1)]
    values = list(fields.values()) + [advance_id]
    await db.execute(
        f"UPDATE advance_payments SET {', '.join(set_parts)} WHERE id = ${len(fields) + 1}",
        *values,
    )
    row = await db.fetchrow("SELECT * FROM advance_payments WHERE id = $1", advance_id)
    return dict(row)


@router.delete("/{advance_id}", status_code=204)
async def delete_advance(
    report_id: int,
    advance_id: int,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    if report["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be modified")

    result = await db.execute(
        "DELETE FROM advance_payments WHERE id = $1 AND report_id = $2",
        advance_id,
        report_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Advance payment not found")
