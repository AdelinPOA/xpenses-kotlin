from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends

from ..auth import get_current_user, require_role
from ..config import settings
from ..database import get_db
from ..models import MileageRatesOut, MileageRatesUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])

RATE_KEYS = ("mileage_rate_before_tax", "mileage_rate_after_tax")


async def get_mileage_rates(db: asyncpg.Connection) -> tuple[float, float]:
    rows = await db.fetch(
        "SELECT key, value FROM app_settings WHERE key = ANY($1)",
        list(RATE_KEYS),
    )
    rates = {r["key"]: float(r["value"]) for r in rows}
    return (
        rates.get("mileage_rate_before_tax", settings.mileage_rate_before_tax),
        rates.get("mileage_rate_after_tax", settings.mileage_rate_after_tax),
    )


@router.get("/mileage-rates", response_model=MileageRatesOut)
async def read_mileage_rates(
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    bt, at = await get_mileage_rates(db)
    return MileageRatesOut(mileage_rate_before_tax=bt, mileage_rate_after_tax=at)


@router.patch("/mileage-rates", response_model=MileageRatesOut)
async def update_mileage_rates(
    body: MileageRatesUpdate,
    current_user: dict = require_role("chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    updates = body.model_dump(exclude_unset=True)
    for key, val in updates.items():
        await db.execute(
            "UPDATE app_settings SET value = $1, updated_at = $2 WHERE key = $3",
            str(val), now, key,
        )
    bt, at = await get_mileage_rates(db)
    return MileageRatesOut(mileage_rate_before_tax=bt, mileage_rate_after_tax=at)
