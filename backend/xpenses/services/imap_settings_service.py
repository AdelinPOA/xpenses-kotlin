import dataclasses
import datetime
import json
import logging
import imaplib
import asyncio
import asyncpg
from cryptography.fernet import InvalidToken

from .crypto import get_fernet

logger = logging.getLogger(__name__)


@dataclasses.dataclass
class ImapConfig:
    enabled: bool = False
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_pass: str = ""
    imap_folder: str = "INBOX"
    password_set: bool = False


async def get_imap_config(conn: asyncpg.Connection) -> ImapConfig:
    row = await conn.fetchrow(
        "SELECT value FROM app_settings WHERE key = 'imap_config'"
    )
    if not row:
        return ImapConfig()

    data = json.loads(row["value"])
    encrypted_pw = data.get("imap_pass", "")
    decrypted = ""
    password_set = False

    if encrypted_pw:
        try:
            fernet = get_fernet(b"xpenses-imap-pw")
            decrypted = fernet.decrypt(encrypted_pw.encode()).decode()
            password_set = True
        except (InvalidToken, Exception) as e:
            logger.error(f"Failed to decrypt IMAP password: {e}")
            decrypted = ""
            password_set = False
    else:
        decrypted = ""

    return ImapConfig(
        enabled=data.get("enabled", False),
        imap_host=data.get("imap_host", ""),
        imap_port=data.get("imap_port", 993),
        imap_user=data.get("imap_user", ""),
        imap_pass=decrypted,
        imap_folder=data.get("imap_folder", "INBOX"),
        password_set=password_set,
    )


async def save_imap_config(config: ImapConfig, conn: asyncpg.Connection) -> None:
    if config.imap_pass:
        fernet = get_fernet(b"xpenses-imap-pw")
        encrypted_pw = fernet.encrypt(config.imap_pass.encode()).decode()
    else:
        encrypted_pw = ""

    data = {
        "enabled": config.enabled,
        "imap_host": config.imap_host,
        "imap_port": config.imap_port,
        "imap_user": config.imap_user,
        "imap_pass": encrypted_pw,
        "imap_folder": config.imap_folder,
    }

    now = datetime.datetime.now(datetime.timezone.utc)
    await conn.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('imap_config', $1, $2)
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = $2
        """,
        json.dumps(data),
        now,
    )


def _test_imap_connection_sync(config: ImapConfig) -> dict:
    try:
        if config.imap_port == 993:
            client = imaplib.IMAP4_SSL(config.imap_host, config.imap_port, timeout=10)
        else:
            client = imaplib.IMAP4(config.imap_host, config.imap_port, timeout=10)

        with client:
            client.login(config.imap_user, config.imap_pass)
            rv, data = client.select(config.imap_folder)
            if rv == "OK":
                return {"success": True, "message": "Successfully connected and selected folder."}
            else:
                return {"success": False, "message": f"Connected, but folder selection failed: {rv}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def test_imap_connection(config: ImapConfig) -> dict:
    return await asyncio.to_thread(_test_imap_connection_sync, config)
