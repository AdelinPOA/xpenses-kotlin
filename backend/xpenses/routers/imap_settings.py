import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_role
from ..database import get_db
from ..services.imap_settings_service import (
    ImapConfig,
    get_imap_config,
    save_imap_config,
    test_imap_connection,
)

router = APIRouter(prefix="/api/settings/imap", tags=["imap_settings"])


class ImapConfigIn(BaseModel):
    enabled: bool = False
    imap_host: str = ""
    imap_port: int = Field(993, ge=1, le=65535)
    imap_user: str = ""
    imap_pass: str = ""
    imap_folder: str = "INBOX"


class ImapConfigOut(BaseModel):
    enabled: bool = False
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_folder: str = "INBOX"
    password_set: bool = False


@router.get("", response_model=ImapConfigOut)
async def get_imap_settings(
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    config = await get_imap_config(db)
    return ImapConfigOut(
        enabled=config.enabled,
        imap_host=config.imap_host,
        imap_port=config.imap_port,
        imap_user=config.imap_user,
        imap_folder=config.imap_folder,
        password_set=config.password_set,
    )


@router.patch("", response_model=ImapConfigOut)
async def update_imap_settings(
    body: ImapConfigIn,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    if body.imap_pass == "":
        existing = await get_imap_config(db)
        password = existing.imap_pass
    else:
        password = body.imap_pass

    config = ImapConfig(
        enabled=body.enabled,
        imap_host=body.imap_host,
        imap_port=body.imap_port,
        imap_user=body.imap_user,
        imap_pass=password,
        imap_folder=body.imap_folder,
    )
    await save_imap_config(config, db)

    updated = await get_imap_config(db)
    return ImapConfigOut(
        enabled=updated.enabled,
        imap_host=updated.imap_host,
        imap_port=updated.imap_port,
        imap_user=updated.imap_user,
        imap_folder=updated.imap_folder,
        password_set=updated.password_set,
    )


@router.post("/test")
async def test_imap_settings(
    body: ImapConfigIn,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    if body.imap_pass == "":
        existing = await get_imap_config(db)
        password = existing.imap_pass
    else:
        password = body.imap_pass

    config = ImapConfig(
        enabled=body.enabled,
        imap_host=body.imap_host,
        imap_port=body.imap_port,
        imap_user=body.imap_user,
        imap_pass=password,
        imap_folder=body.imap_folder,
    )
    result = await test_imap_connection(config)
    return result
