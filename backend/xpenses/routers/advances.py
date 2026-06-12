from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user, require_role
from ..database import get_db
from ..models import (
    AdvancePayBody,
    AdvancePaymentCreate,
    AdvancePaymentOut,
    AdvancePaymentUpdate,
    AdvanceRejectBody,
    PendingAdvanceOut,
)
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
        "manager",
    ):
        raise HTTPException(status_code=403, detail="Not your report")
    return dict(row)


async def _enrich_advance(db: asyncpg.Connection, row: dict) -> dict:
    adv = dict(row)
    if adv.get("paid_by"):
        u = await db.fetchval("SELECT display_name FROM users WHERE id = $1", adv["paid_by"])
        adv["paid_by_name"] = u
    if adv.get("rejected_by"):
        u = await db.fetchval("SELECT display_name FROM users WHERE id = $1", adv["rejected_by"])
        adv["rejected_by_name"] = u
    return adv


@router.get("", response_model=list[AdvancePaymentOut])
async def list_advances(
    report_id: int,
    status: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    await _verify_report_ownership(db, report_id, current_user)
    if status:
        rows = await db.fetch(
            "SELECT * FROM advance_payments WHERE report_id = $1 AND status = $2 ORDER BY date",
            report_id, status,
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM advance_payments WHERE report_id = $1 ORDER BY date",
            report_id,
        )
    return [await _enrich_advance(db, r) for r in rows]


@router.post("", response_model=AdvancePaymentOut, status_code=201)
async def create_advance(
    report_id: int,
    body: AdvancePaymentCreate,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    is_owner = report["user_id"] == current_user["id"]
    is_privileged = current_user["role"] in ("manager", "chef_finance", "mod")

    if body.type == "request":
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only the report owner can request advances")
        now = datetime.now(timezone.utc)
        row = await db.fetchrow(
            """INSERT INTO advance_payments
               (report_id, user_id, amount_original, currency_original, amount_eur, fx_rate,
                date, description, status, requested_amount, requested_currency, created_at, updated_at)
               VALUES ($1, $2, 0, $3, 0, 0, '', $4, 'requested', $5, $6, $7, $8)
               RETURNING *""",
            report_id, current_user["id"], body.currency.upper(), body.description,
            body.amount, body.currency.upper(), now, now,
        )
        return await _enrich_advance(db, row)

    # type == "paid" (self-paid or manager-paid)
    if is_owner and report["status"] != "draft":
        raise HTTPException(status_code=400, detail="Technicians can only add self-paid advances to draft reports")
    if not is_owner and not is_privileged:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not body.date:
        raise HTTPException(status_code=400, detail="Date is required for paid advances")

    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)
    now = datetime.now(timezone.utc)

    row = await db.fetchrow(
        """INSERT INTO advance_payments
           (report_id, user_id, amount_original, currency_original, amount_eur, fx_rate,
            date, description, status, paid_by, paid_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', $9, $10, $11, $12)
           RETURNING *""",
        report_id, current_user["id"] if is_owner else report["user_id"],
        body.amount, body.currency.upper(), amount_eur, fx_rate,
        body.date, body.description, current_user["id"] if is_privileged else None,
        now if is_privileged else None, now, now,
    )
    return await _enrich_advance(db, row)


@router.patch("/{advance_id}", response_model=AdvancePaymentOut)
async def update_advance(
    report_id: int,
    advance_id: int,
    body: AdvancePaymentUpdate,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    if report["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the report owner can modify advance payments")
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

    fields["updated_at"] = datetime.now(timezone.utc)
    set_parts = [f"{k} = ${i}" for i, k in enumerate(fields, 1)]
    values = list(fields.values()) + [advance_id]
    await db.execute(
        f"UPDATE advance_payments SET {', '.join(set_parts)} WHERE id = ${len(fields) + 1}",
        *values,
    )
    row = await db.fetchrow("SELECT * FROM advance_payments WHERE id = $1", advance_id)
    return await _enrich_advance(db, row)


@router.delete("/{advance_id}", status_code=204)
async def delete_advance(
    report_id: int,
    advance_id: int,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    adv = await db.fetchrow(
        "SELECT * FROM advance_payments WHERE id = $1 AND report_id = $2",
        advance_id, report_id,
    )
    if not adv:
        raise HTTPException(status_code=404, detail="Advance payment not found")

    is_owner = report["user_id"] == current_user["id"]
    is_privileged = current_user["role"] in ("manager", "chef_finance", "mod")

    if adv["status"] == "requested":
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only the request owner can cancel")
    elif adv["status"] == "paid":
        if report["status"] != "draft":
            raise HTTPException(status_code=400, detail="Can only delete paid advances on draft reports")
        if not is_owner and not is_privileged:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif adv["status"] == "rejected":
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only the owner can delete rejected advances")

    await db.execute("DELETE FROM advance_payments WHERE id = $1", advance_id)


@router.post("/{advance_id}/pay", response_model=AdvancePaymentOut)
async def pay_advance(
    report_id: int,
    advance_id: int,
    body: AdvancePayBody,
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    await _verify_report_ownership(db, report_id, current_user)
    adv = await db.fetchrow(
        "SELECT * FROM advance_payments WHERE id = $1 AND report_id = $2",
        advance_id, report_id,
    )
    if not adv:
        raise HTTPException(status_code=404, detail="Advance payment not found")
    if adv["status"] != "requested":
        raise HTTPException(status_code=400, detail="Only requested advances can be paid")

    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)
    now = datetime.now(timezone.utc)

    await db.execute(
        """UPDATE advance_payments
           SET amount_original = $1, currency_original = $2, amount_eur = $3, fx_rate = $4,
               date = $5, status = 'paid', paid_by = $6, paid_at = $7, updated_at = $8
           WHERE id = $9""",
        body.amount, body.currency.upper(), amount_eur, fx_rate,
        body.date, current_user["id"], now, now, advance_id,
    )
    row = await db.fetchrow("SELECT * FROM advance_payments WHERE id = $1", advance_id)
    return await _enrich_advance(db, row)


@router.post("/{advance_id}/reject", response_model=AdvancePaymentOut)
async def reject_advance(
    report_id: int,
    advance_id: int,
    body: AdvanceRejectBody = AdvanceRejectBody(),
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    await _verify_report_ownership(db, report_id, current_user)
    adv = await db.fetchrow(
        "SELECT * FROM advance_payments WHERE id = $1 AND report_id = $2",
        advance_id, report_id,
    )
    if not adv:
        raise HTTPException(status_code=404, detail="Advance payment not found")
    if adv["status"] != "requested":
        raise HTTPException(status_code=400, detail="Only requested advances can be rejected")

    now = datetime.now(timezone.utc)
    await db.execute(
        """UPDATE advance_payments
           SET status = 'rejected', rejected_by = $1, rejected_at = $2, updated_at = $3,
               description = CASE WHEN $4 = '' THEN description ELSE description || ' [Rejected: ' || $4 || ']' END
           WHERE id = $5""",
        current_user["id"], now, now, body.reason, advance_id,
    )
    row = await db.fetchrow("SELECT * FROM advance_payments WHERE id = $1", advance_id)
    return await _enrich_advance(db, row)


global_router = APIRouter(prefix="/api/advances", tags=["advances"])


@global_router.get("/pending", response_model=list[PendingAdvanceOut])
async def list_pending_advances(
    current_user: dict = require_role("manager", "chef_finance", "mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    rows = await db.fetch(
        """SELECT ap.*, u.display_name as user_display_name, er.title as report_title
           FROM advance_payments ap
           JOIN users u ON ap.user_id = u.id
           JOIN expense_reports er ON ap.report_id = er.id
           WHERE ap.status = 'requested'
           ORDER BY ap.created_at ASC""",
    )
    result = []
    for r in rows:
        adv = dict(r)
        adv["paid_by_name"] = None
        adv["rejected_by_name"] = None
        result.append(adv)
    return result
