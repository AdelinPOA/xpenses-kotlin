from datetime import datetime

import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..models import MileageRecordCreate, MileageRecordOut, MileageRecordUpdate

router = APIRouter(prefix="/api/reports/{report_id}/mileage", tags=["mileage"])


async def _verify_report_ownership(
    db: asyncpg.Connection, report_id: int, current_user: dict
) -> dict:
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["user_id"] != current_user["id"] and current_user["role"] not in (
        "chef_finance", "mod", "manager",
    ):
        raise HTTPException(status_code=403, detail="Not your report")
    return dict(row)


@router.get("", response_model=list[MileageRecordOut])
async def list_mileage(
    report_id: int,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    await _verify_report_ownership(db, report_id, current_user)
    rows = await db.fetch(
        "SELECT * FROM mileage_records WHERE report_id = $1 ORDER BY date",
        report_id,
    )
    return [dict(r) for r in rows]


@router.post("", response_model=MileageRecordOut, status_code=201)
async def create_mileage(
    report_id: int,
    body: MileageRecordCreate,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    if report["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be modified")

    rate_bt = settings.mileage_rate_before_tax
    rate_at = settings.mileage_rate_after_tax
    amount_before_tax = round(body.distance_km * rate_bt, 2)
    amount_eur = round(body.distance_km * rate_at, 2)

    now = datetime.utcnow()
    row = await db.fetchrow(
        """INSERT INTO mileage_records
           (report_id, user_id, origin, destination, distance_km,
            rate_before_tax, rate_after_tax, amount_before_tax, amount_eur,
            date, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING *""",
        report_id, current_user["id"], body.origin, body.destination, body.distance_km,
        rate_bt, rate_at, amount_before_tax, amount_eur,
        body.date, body.description, now, now,
    )
    return dict(row)


@router.patch("/{mileage_id}", response_model=MileageRecordOut)
async def update_mileage(
    report_id: int,
    mileage_id: int,
    body: MileageRecordUpdate,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    if report["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be modified")

    rec = await db.fetchrow(
        "SELECT * FROM mileage_records WHERE id = $1 AND report_id = $2",
        mileage_id, report_id,
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Mileage record not found")

    raw = body.model_dump(exclude_unset=True)
    if not raw:
        return dict(rec)

    fields = {}
    for k in ("origin", "destination", "date", "description"):
        if k in raw:
            fields[k] = raw[k]

    if "distance_km" in raw:
        fields["distance_km"] = raw["distance_km"]
        fields["amount_before_tax"] = round(raw["distance_km"] * rec["rate_before_tax"], 2)
        fields["amount_eur"] = round(raw["distance_km"] * rec["rate_after_tax"], 2)

    fields["updated_at"] = datetime.utcnow()
    set_parts = [f"{k} = ${i}" for i, k in enumerate(fields, 1)]
    values = list(fields.values()) + [mileage_id]
    await db.execute(
        f"UPDATE mileage_records SET {', '.join(set_parts)} WHERE id = ${len(fields) + 1}",
        *values,
    )
    row = await db.fetchrow("SELECT * FROM mileage_records WHERE id = $1", mileage_id)
    return dict(row)


@router.delete("/{mileage_id}", status_code=204)
async def delete_mileage(
    report_id: int,
    mileage_id: int,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    if report["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only draft reports can be modified")

    rec = await db.fetchrow(
        "SELECT * FROM mileage_records WHERE id = $1 AND report_id = $2",
        mileage_id, report_id,
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Mileage record not found")

    await db.execute("DELETE FROM mileage_records WHERE id = $1", mileage_id)
