import dataclasses
import datetime
import json
import logging
from email.message import EmailMessage

import aiosmtplib
import asyncpg
from cryptography.fernet import InvalidToken

from ..config import settings
from .crypto import get_fernet

logger = logging.getLogger(__name__)


@dataclasses.dataclass
class EmailConfig:
    emails_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = ""
    password_set: bool = False


async def get_smtp_config(conn: asyncpg.Connection) -> EmailConfig:
    row = await conn.fetchrow(
        "SELECT value FROM app_settings WHERE key = 'email_config'"
    )
    if not row:
        return EmailConfig(
            emails_enabled=settings.emails_enabled,
            smtp_host=settings.smtp_host or "",
            smtp_port=settings.smtp_port or 587,
            smtp_user=settings.smtp_user or "",
            smtp_pass=settings.smtp_pass or "",
            smtp_from=settings.smtp_from or "",
            password_set=bool(settings.smtp_pass),
        )

    data = json.loads(row["value"])
    encrypted_pw = data.get("smtp_pass", "")
    decrypted = ""
    password_set = False

    if encrypted_pw:
        try:
            fernet = get_fernet(b"xpenses-smtp-pw")
            decrypted = fernet.decrypt(encrypted_pw.encode()).decode()
            password_set = True
        except (InvalidToken, Exception) as e:
            logger.error(f"Failed to decrypt SMTP password: {e}")
            decrypted = ""
            password_set = False
    else:
        decrypted = ""

    return EmailConfig(
        emails_enabled=data.get("emails_enabled", False),
        smtp_host=data.get("smtp_host", ""),
        smtp_port=data.get("smtp_port", 587),
        smtp_user=data.get("smtp_user", ""),
        smtp_pass=decrypted,
        smtp_from=data.get("smtp_from", ""),
        password_set=password_set,
    )


async def save_smtp_config(config: EmailConfig, conn: asyncpg.Connection) -> None:
    if config.smtp_pass:
        fernet = get_fernet(b"xpenses-smtp-pw")
        encrypted_pw = fernet.encrypt(config.smtp_pass.encode()).decode()
    else:
        encrypted_pw = ""

    data = {
        "emails_enabled": config.emails_enabled,
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_user": config.smtp_user,
        "smtp_pass": encrypted_pw,
        "smtp_from": config.smtp_from,
    }

    now = datetime.datetime.now(datetime.timezone.utc)
    await conn.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('email_config', $1, $2)
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = $2
        """,
        json.dumps(data),
        now,
    )


async def test_smtp_connection(config: EmailConfig, to_email: str) -> dict:
    message = EmailMessage()
    message["From"] = config.smtp_from
    message["To"] = to_email
    message["Subject"] = "Xpenses SMTP Test Connection"
    message.set_content("This is a test email from Xpenses to verify SMTP configuration.")

    try:
        await aiosmtplib.send(
            message,
            hostname=config.smtp_host,
            port=config.smtp_port,
            username=config.smtp_user,
            password=config.smtp_pass,
            use_tls=config.smtp_port == 465,
        )
        return {"success": True, "message": f"Test email sent to {to_email}"}
    except Exception as e:
        logger.error(f"SMTP connection test failed: {e}")
        return {"success": False, "message": str(e)}
