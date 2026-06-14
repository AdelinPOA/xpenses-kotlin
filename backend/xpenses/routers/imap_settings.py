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


class EmailSimulationIn(BaseModel):
    from_address: str
    body_text: str


class EmailSimulationParsed(BaseModel):
    title: str
    date_from: str
    date_to: str
    description: str


class EmailSimulationOut(BaseModel):
    success: bool
    error: str | None = None
    report_id: int | None = None
    parsed: EmailSimulationParsed | None = None
    local_parsed: EmailSimulationParsed | None = None
    gemini_parsed: EmailSimulationParsed | None = None
    gemini_error: str | None = None
    user_display_name: str | None = None


@router.post("/simulate", response_model=EmailSimulationOut)
async def simulate_email_ingestion(
    body: EmailSimulationIn,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    from ..services.email_import_service import simulate_incoming_email
    result = await simulate_incoming_email(body.from_address, body.body_text, db)
    return EmailSimulationOut(
        success=result["success"],
        error=result.get("error"),
        report_id=result.get("report_id"),
        parsed=result.get("parsed"),
        local_parsed=result.get("local_parsed"),
        gemini_parsed=result.get("gemini_parsed"),
        gemini_error=result.get("gemini_error"),
        user_display_name=result.get("user_display_name"),
    )

