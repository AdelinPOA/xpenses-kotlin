import logging
from email.message import EmailMessage

import aiosmtplib

from ..config import settings

logger = logging.getLogger(__name__)

async def send_email(to_email: str, subject: str, content: str):
    from ..database import get_pool
    from .email_settings_service import EmailConfig, get_smtp_config

    pool = get_pool()
    if pool:
        async with pool.acquire() as conn:
            config = await get_smtp_config(conn)
    else:
        config = EmailConfig(
            emails_enabled=settings.emails_enabled,
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
            smtp_user=settings.smtp_user,
            smtp_pass=settings.smtp_pass,
            smtp_from=settings.smtp_from,
        )

    if not config.emails_enabled:
        logger.info(f"Email disabled. Would have sent to {to_email}: {subject}")
        return

    message = EmailMessage()
    message["From"] = config.smtp_from
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(content)

    try:
        # If port is 465, we usually use use_tls=True.
        # For 587 or 25, we often use starttls or plain.
        # Let's support TLS for 465.
        await aiosmtplib.send(
            message,
            hostname=config.smtp_host,
            port=config.smtp_port,
            username=config.smtp_user,
            password=config.smtp_pass,
            use_tls=config.smtp_port == 465,
        )
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")


def get_submission_email(submitter_name: str, report_title: str, total_amount: float, currency: str) -> tuple[str, str]:
    subject = f"New expense report submitted: {report_title}"
    content = f"{submitter_name} has submitted a new expense report: {report_title}.\nTotal: {total_amount:.2f} {currency}."
    return subject, content


def get_approval_email(report_title: str, approver_name: str) -> tuple[str, str]:
    subject = f"Expense report approved: {report_title}"
    content = f"Your expense report \"{report_title}\" has been approved by {approver_name}."
    return subject, content


def get_rejection_email(report_title: str, rejecter_name: str, reason: str) -> tuple[str, str]:
    subject = f"Expense report rejected: {report_title}"
    content = f"Your expense report \"{report_title}\" has been rejected by {rejecter_name}.\nReason: {reason}."
    return subject, content


def get_payment_email(report_title: str) -> tuple[str, str]:
    subject = f"Expense report paid: {report_title}"
    content = f"Your expense report \"{report_title}\" has been marked as paid."
    return subject, content
