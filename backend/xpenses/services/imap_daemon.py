import asyncio
import email
from email.header import decode_header
import imaplib
import logging

from ..database import get_pool
from .email_import_service import process_incoming_email
from .imap_settings_service import get_imap_config, ImapConfig

logger = logging.getLogger(__name__)

_daemon_task: asyncio.Task | None = None
_running: bool = False


def _fetch_unseen_emails_sync(config: ImapConfig) -> list[dict]:
    emails = []
    try:
        if config.imap_port == 993:
            client = imaplib.IMAP4_SSL(config.imap_host, config.imap_port, timeout=10)
        else:
            client = imaplib.IMAP4(config.imap_host, config.imap_port, timeout=10)

        with client:
            client.login(config.imap_user, config.imap_pass)
            client.select(config.imap_folder)

            rv, data = client.search(None, "UNSEEN")
            if rv != "OK" or not data or not data[0]:
                return []

            msg_ids = data[0].split()
            for msg_id in msg_ids:
                rv, msg_data = client.fetch(msg_id, "(RFC822)")
                if rv != "OK" or not msg_data or not msg_data[0]:
                    continue

                raw_email = msg_data[0][1]
                if not raw_email:
                    continue

                msg = email.message_from_bytes(raw_email)

                # Decode From header
                from_header = msg.get("From", "")
                decoded_from = ""
                if from_header:
                    for part, encoding in decode_header(from_header):
                        if isinstance(part, bytes):
                            decoded_from += part.decode(
                                encoding or "utf-8", errors="replace"
                            )
                        else:
                            decoded_from += part

                # Extract body
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disposition = str(part.get("Content-Disposition"))
                        if (
                            content_type == "text/plain"
                            and "attachment" not in content_disposition
                        ):
                            payload = part.get_payload(decode=True)
                            if payload:
                                charset = part.get_content_charset() or "utf-8"
                                body = payload.decode(charset, errors="replace")
                                break
                else:
                    payload = msg.get_payload(decode=True)
                    if payload:
                        charset = msg.get_content_charset() or "utf-8"
                        body = payload.decode(charset, errors="replace")

                emails.append({"id": msg_id, "from": decoded_from, "body": body})
    except Exception as e:
        logger.error(f"IMAP fetch error: {e}")
    return emails


def _mark_emails_seen_sync(config: ImapConfig, msg_ids: list[bytes]) -> None:
    if not msg_ids:
        return
    try:
        if config.imap_port == 993:
            client = imaplib.IMAP4_SSL(config.imap_host, config.imap_port, timeout=10)
        else:
            client = imaplib.IMAP4(config.imap_host, config.imap_port, timeout=10)

        with client:
            client.login(config.imap_user, config.imap_pass)
            client.select(config.imap_folder)
            for msg_id in msg_ids:
                client.store(msg_id, "+FLAGS", "\\Seen")
    except Exception as e:
        logger.error(f"IMAP mark seen error: {e}")


async def imap_daemon_loop():
    global _running
    _running = True
    logger.info("IMAP background daemon started.")

    while _running:
        try:
            pool = get_pool()
            if not pool:
                await asyncio.sleep(5)
                continue

            async with pool.acquire() as conn:
                config = await get_imap_config(conn)

            if (
                config.enabled
                and config.imap_host
                and config.imap_user
                and config.imap_pass
            ):
                emails = await asyncio.to_thread(_fetch_unseen_emails_sync, config)

                processed_ids = []
                if emails:
                    async with pool.acquire() as conn:
                        for item in emails:
                            # Process the email text
                            await process_incoming_email(
                                item["from"], item["body"], conn
                            )
                            processed_ids.append(item["id"])

                if processed_ids:
                    await asyncio.to_thread(
                        _mark_emails_seen_sync, config, processed_ids
                    )
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"IMAP daemon loop error: {e}")

        # Check for new emails every 60 seconds
        await asyncio.sleep(60)


def start_imap_daemon():
    global _daemon_task
    if _daemon_task is None or _daemon_task.done():
        _daemon_task = asyncio.create_task(imap_daemon_loop())


def stop_imap_daemon():
    global _running
    _running = False
    if _daemon_task and not _daemon_task.done():
        _daemon_task.cancel()
