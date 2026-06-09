import aiosmtplib
from email.message import EmailMessage
from ..config import settings
import logging

logger = logging.getLogger(__name__)

async def send_email(to_email: str, subject: str, content: str):
    if not settings.emails_enabled:
        logger.info(f"Email disabled. Would have sent to {to_email}: {subject}")
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(content)

    try:
        # If port is 465, we usually use use_tls=True. 
        # For 587 or 25, we often use starttls or plain.
        # Let's support TLS for 465.
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user,
            password=settings.smtp_pass,
            use_tls=settings.smtp_port == 465,
        )
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
