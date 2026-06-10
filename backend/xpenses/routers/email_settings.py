import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import require_role
from ..database import get_db
from ..services.email_settings_service import (
    EmailConfig,
    get_smtp_config,
    save_smtp_config,
    test_smtp_connection,
)

router = APIRouter(prefix="/api/settings/email", tags=["email_settings"])


class EmailConfigIn(BaseModel):
    emails_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = Field(587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = ""


class EmailConfigOut(BaseModel):
    emails_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_from: str = ""
    password_set: bool = False


class TestEmailIn(BaseModel):
    to: str


@router.get("", response_model=EmailConfigOut)
async def get_email_settings(
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    config = await get_smtp_config(db)
    return EmailConfigOut(
        emails_enabled=config.emails_enabled,
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_user=config.smtp_user,
        smtp_from=config.smtp_from,
        password_set=config.password_set,
    )


@router.patch("", response_model=EmailConfigOut)
async def update_email_settings(
    body: EmailConfigIn,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    if body.smtp_pass == "":
        existing = await get_smtp_config(db)
        password = existing.smtp_pass
    else:
        password = body.smtp_pass

    config = EmailConfig(
        emails_enabled=body.emails_enabled,
        smtp_host=body.smtp_host,
        smtp_port=body.smtp_port,
        smtp_user=body.smtp_user,
        smtp_pass=password,
        smtp_from=body.smtp_from,
    )
    await save_smtp_config(config, db)

    updated = await get_smtp_config(db)
    return EmailConfigOut(
        emails_enabled=updated.emails_enabled,
        smtp_host=updated.smtp_host,
        smtp_port=updated.smtp_port,
        smtp_user=updated.smtp_user,
        smtp_from=updated.smtp_from,
        password_set=updated.password_set,
    )


@router.post("/test")
async def test_email_settings(
    body: TestEmailIn,
    current_user: dict = require_role("mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    config = await get_smtp_config(db)
    result = await test_smtp_connection(config, body.to)
    return result
