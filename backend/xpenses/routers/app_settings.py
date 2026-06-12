import json
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends

from ..auth import get_current_user, require_role
from ..config import settings
from ..database import get_db, get_pool
from ..models import (
    MileageRatesOut,
    MileageRatesUpdate,
    OCRConfigOut,
    OCRConfigUpdate,
    OCRTestRequest,
    StorageConfigSchema,
)
from ..services.ocr_service import (
    OCRConfig,
    get_ocr_config,
    save_ocr_config,
    test_gemini_connection,
)
from ..services.storage.manager import (
    get_migration_status,
    get_storage_config,
    instantiate_provider,
    run_migration_task,
    save_storage_config,
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
        await delete_receipt(file_path, db)
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
        mineru_url=config.mineru_url or None,
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
    mineru_url = body.mineru_url if body.mineru_url is not None else existing.mineru_url

    if body.gemini_api_key == "••••••••" or body.gemini_api_key is None:
        key = existing.gemini_api_key
    else:
        key = body.gemini_api_key

    config = OCRConfig(
        provider=provider,
        ocr_enabled=ocr_enabled,
        gemini_api_key=key,
        mineru_url=mineru_url,
    )
    await save_ocr_config(config, db)

    updated = await get_ocr_config(db)
    return OCRConfigOut(
        provider=updated.provider,
        ocr_enabled=updated.ocr_enabled,
        gemini_api_key="••••••••" if updated.password_set else None,
        mineru_url=updated.mineru_url or None,
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


@router.get("/storage")
async def read_storage_settings(
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    cfg = await get_storage_config(db)
    # Mask credentials
    masked = json.loads(json.dumps(cfg))
    for ptype in ["smb", "webdav", "sftp"]:
        if ptype in masked and "password" in masked[ptype] and masked[ptype]["password"]:
            masked[ptype]["password"] = "••••••••"
    if "s3" in masked and "secret_key" in masked["s3"] and masked["s3"]["secret_key"]:
        masked["s3"]["secret_key"] = "••••••••"
    return masked


@router.patch("/storage")
async def update_storage_settings(
    body: StorageConfigSchema,
    background_tasks: BackgroundTasks,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
    migrate_existing: bool = False,
):
    old_config = await get_storage_config(db)
    new_config = body.model_dump(exclude_unset=True)
    
    # Save the new config
    await save_storage_config(new_config, db)
    
    if migrate_existing:
        # Resolve any masked passwords/keys to the actual decrypted values
        # so that migration has full credentials
        full_new_config = await get_storage_config(db)
        pool = get_pool()
        background_tasks.add_task(run_migration_task, old_config, full_new_config, pool)
        
    updated = await get_storage_config(db)
    # Mask passwords
    masked = json.loads(json.dumps(updated))
    for ptype in ["smb", "webdav", "sftp"]:
        if ptype in masked and "password" in masked[ptype] and masked[ptype]["password"]:
            masked[ptype]["password"] = "••••••••"
    if "s3" in masked and "secret_key" in masked["s3"] and masked["s3"]["secret_key"]:
        masked["s3"]["secret_key"] = "••••••••"
    return masked


@router.post("/storage/test")
async def test_storage_settings(
    body: StorageConfigSchema,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    config = body.model_dump(exclude_unset=True)
    
    # If password is masked, load the existing decrypted password
    existing = await get_storage_config(db)
    ptype = config.get("provider_type")
    
    if ptype in ["smb", "webdav", "sftp"] and ptype in config:
        if config[ptype].get("password") == "••••••••" or not config[ptype].get("password"):
            config[ptype]["password"] = existing.get(ptype, {}).get("password", "")
    elif ptype == "s3" and "s3" in config:
        if config["s3"].get("secret_key") == "••••••••" or not config["s3"].get("secret_key"):
            config["s3"]["secret_key"] = existing.get("s3", {}).get("secret_key", "")
            
    provider = instantiate_provider(config)
    success, msg = await provider.test_connection()
    return {"success": success, "message": msg}


@router.get("/storage/migration-status")
async def get_storage_migration_status(
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    status = await get_migration_status(db)
    return status

