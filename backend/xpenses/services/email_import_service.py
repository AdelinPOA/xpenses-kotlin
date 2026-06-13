import logging
import re
from datetime import datetime, timezone

import asyncpg

logger = logging.getLogger(__name__)


def parse_delegation_email(text: str) -> dict | None:
    # Find start and end dates
    start_match = re.search(r"Starttermin\s+([\d\.]+)", text)
    end_match = re.search(r"Endtermin\s+([\d\.]+)", text)

    if not start_match or not end_match:
        return None

    # Retrieve other structured info
    order_match = re.search(r"Kundenauftrag\s+(\d+)", text)
    customer_match = re.search(r"Kunde\s+(?:\d+\s+)?([^\n\r]+)", text)
    location_match = re.search(r"TechnPlatz\s+(?:\S+\s+)?([^\n\r]+)", text)
    task_match = re.search(r"Positionstyp\s+([^\n\r]+)", text)

    def parse_german_date(dt_str: str) -> str | None:
        try:
            return datetime.strptime(dt_str.strip(), "%d.%m.%Y").strftime("%Y-%m-%d")
        except Exception:
            return None

    date_from = parse_german_date(start_match.group(1))
    date_to = parse_german_date(end_match.group(1))

    if not date_from or not date_to:
        return None

    order = order_match.group(1).strip() if order_match else "Unknown Order"
    customer = customer_match.group(1).strip() if customer_match else "Unknown Customer"
    location = location_match.group(1).strip() if location_match else "Unknown Location"
    task = task_match.group(1).strip() if task_match else "Installation"

    # Normalize whitespace
    customer = re.sub(r"\s+", " ", customer).strip()
    location = re.sub(r"\s+", " ", location).strip()
    task = re.sub(r"\s+", " ", task).strip()

    title = f"Delegation: {customer} ({location})"
    description = (
        f"Kundenauftrag: {order}\n"
        f"Location: {location}\n"
        f"Task: {task}"
    )

    return {
        "title": title[:200],
        "date_from": date_from,
        "date_to": date_to,
        "description": description.strip(),
    }


async def process_incoming_email(
    from_address: str, body_text: str, conn: asyncpg.Connection
) -> bool:
    email_clean = from_address.strip()
    if "<" in email_clean and ">" in email_clean:
        email_clean = email_clean.split("<")[1].split(">")[0].strip()

    user_row = await conn.fetchrow(
        "SELECT id, is_active FROM users WHERE LOWER(email) = LOWER($1)",
        email_clean,
    )
    if not user_row:
        logger.warning(f"Email import skipped: no user found with email {email_clean}")
        return False

    if not user_row["is_active"]:
        logger.warning(f"Email import skipped: user {email_clean} is inactive")
        return False

    user_id = user_row["id"]

    parsed = parse_delegation_email(body_text)
    if not parsed:
        logger.warning(
            f"Email import skipped: could not parse delegation patterns in email body from {email_clean}"
        )
        return False

    now = datetime.now(timezone.utc)
    await conn.execute(
        """
        INSERT INTO expense_reports (title, description, date_from, date_to, status, user_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'draft', $5, $6, $6)
        """,
        parsed["title"],
        parsed["description"],
        parsed["date_from"],
        parsed["date_to"],
        user_id,
        now,
    )
    logger.info(
        f"Successfully created draft report '{parsed['title']}' for user {email_clean}"
    )
    return True


async def simulate_incoming_email(
    from_address: str, body_text: str, conn: asyncpg.Connection
) -> dict:
    email_clean = from_address.strip()
    if "<" in email_clean and ">" in email_clean:
        email_clean = email_clean.split("<")[1].split(">")[0].strip()

    user_row = await conn.fetchrow(
        "SELECT id, display_name, is_active FROM users WHERE LOWER(email) = LOWER($1)",
        email_clean,
    )
    if not user_row:
        return {
            "success": False,
            "error": f"No user found with email '{email_clean}'",
            "parsed": None,
        }

    if not user_row["is_active"]:
        return {
            "success": False,
            "error": f"User '{user_row['display_name']}' ({email_clean}) is inactive",
            "parsed": None,
        }

    user_id = user_row["id"]

    parsed = parse_delegation_email(body_text)
    if not parsed:
        return {
            "success": False,
            "error": "Could not parse delegation patterns (Starttermin/Endtermin) in email body",
            "parsed": None,
        }

    now = datetime.now(timezone.utc)
    report_id = await conn.fetchval(
        """
        INSERT INTO expense_reports (title, description, date_from, date_to, status, user_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'draft', $5, $6, $6)
        RETURNING id
        """,
        parsed["title"],
        parsed["description"],
        parsed["date_from"],
        parsed["date_to"],
        user_id,
        now,
    )
    return {
        "success": True,
        "report_id": report_id,
        "parsed": parsed,
        "user_display_name": user_row["display_name"],
    }

