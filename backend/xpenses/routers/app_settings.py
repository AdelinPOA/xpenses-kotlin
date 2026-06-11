from datetime import datetime, timezone
import json

import asyncpg
from fastapi import APIRouter, Depends

from ..auth import get_current_user, require_role
from ..config import settings
from ..database import get_db
from ..models import (
    MileageRatesOut,
    MileageRatesUpdate,
    OCRConfigOut,
    OCRConfigUpdate,
    OCRTestRequest,
)
from ..services.ocr_service import (
    OCRConfig,
    get_ocr_config,
    save_ocr_config,
    test_gemini_connection,
)

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


@router.post("/receipts/scan")
async def scan_orphans(
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    from ..services.storage import scan_orphan_receipts
    orphans = await scan_orphan_receipts(db)
    return {"orphans": orphans}


@router.post("/receipts/clean")
async def clean_orphans(
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    from ..services.storage import delete_receipt, scan_orphan_receipts
    orphans = await scan_orphan_receipts(db)
    cleaned_count = 0
    for file_path in orphans:
        delete_receipt(file_path)
        cleaned_count += 1
    return {"cleaned_count": cleaned_count}


@router.get("/ocr", response_model=OCRConfigOut)
async def read_ocr_settings(
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    config = await get_ocr_config(db)
    return OCRConfigOut(
        provider=config.provider,
        ocr_enabled=config.ocr_enabled,
        gemini_api_key="••••••••" if config.password_set else None,
    )


@router.patch("/ocr", response_model=OCRConfigOut)
async def update_ocr_settings(
    body: OCRConfigUpdate,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    existing = await get_ocr_config(db)
    
    provider = body.provider if body.provider is not None else existing.provider
    ocr_enabled = body.ocr_enabled if body.ocr_enabled is not None else existing.ocr_enabled
    
    if body.gemini_api_key == "••••••••" or body.gemini_api_key is None:
        key = existing.gemini_api_key
    else:
        key = body.gemini_api_key

    config = OCRConfig(
        provider=provider,
        ocr_enabled=ocr_enabled,
        gemini_api_key=key,
    )
    await save_ocr_config(config, db)
    
    updated = await get_ocr_config(db)
    return OCRConfigOut(
        provider=updated.provider,
        ocr_enabled=updated.ocr_enabled,
        gemini_api_key="••••••••" if updated.password_set else None,
    )


@router.post("/ocr/test")
async def test_ocr_settings(
    body: OCRTestRequest,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    if body.gemini_api_key == "••••••••" or body.gemini_api_key is None or body.gemini_api_key == "":
        existing = await get_ocr_config(db)
        key = existing.gemini_api_key
    else:
        key = body.gemini_api_key

    if not key:
        return {"success": False, "message": "No API key provided or configured."}

    result = await test_gemini_connection(key)
    return result

