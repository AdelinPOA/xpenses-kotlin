import json
import logging
import re
from datetime import datetime, timezone

import asyncpg

logger = logging.getLogger(__name__)


def parse_date_flexible(dt_str: str) -> str | None:
    # Try different formats
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y.%m.%d"):
        try:
            return datetime.strptime(dt_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_delegation_email_local(text: str) -> dict | None:
    # Match patterns like: DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
    date_patterns = [
        r"\b\d{2}\.\d{2}\.\d{4}\b",
        r"\b\d{4}-\d{2}-\d{2}\b",
        r"\b\d{2}/\d{2}/\d{4}\b",
        r"\b\d{2}-\d{2}-\d{4}\b",
        r"\b\d{4}\.\d{2}\.\d{2}\b",
    ]
    all_dates_found = []
    for pat in date_patterns:
        matches = re.findall(pat, text)
        for m in matches:
            parsed_date = parse_date_flexible(m)
            if parsed_date and parsed_date not in all_dates_found:
                all_dates_found.append(parsed_date)

    start_keywords = ["starttermin", "start date", "start", "begin", "from", "ab", "von", "inceput", "plecare", "din"]
    end_keywords = ["endtermin", "end date", "end", "to", "until", "bis", "sfarsit", "intoarcere", "pana"]

    date_from = None
    date_to = None

    lines = text.splitlines()
    for line in lines:
        line_lower = line.lower()
        found_date_in_line = None
        for pat in date_patterns:
            m = re.search(pat, line)
            if m:
                found_date_in_line = parse_date_flexible(m.group(0))
                if found_date_in_line:
                    break
        
        if found_date_in_line:
            if any(kw in line_lower for kw in start_keywords):
                date_from = found_date_in_line
            elif any(kw in line_lower for kw in end_keywords):
                date_to = found_date_in_line

    if not date_from or not date_to:
        sorted_dates = sorted(all_dates_found)
        if len(sorted_dates) >= 2:
            if not date_from:
                date_from = sorted_dates[0]
            if not date_to:
                date_to = sorted_dates[-1]
        elif len(sorted_dates) == 1:
            if not date_from:
                date_from = sorted_dates[0]
            if not date_to:
                date_to = sorted_dates[0]

    if not date_from or not date_to:
        return None

    customer = None
    location = None
    order = None
    task = None

    customer_kws = ["kunde", "customer", "client", "beneficiar"]
    location_kws = ["technplatz", "location", "ort", "locatie", "place", "site", "santier"]
    order_kws = ["kundenauftrag", "auftrag", "order", "comanda", "project", "projekt"]
    task_kws = ["positionstyp", "task", "position", "activitate", "work"]

    # Extract Order
    for kw in order_kws:
        pattern = re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)
        for line in lines:
            match = pattern.search(line)
            if match:
                idx = match.start()
                val_part = line[idx + len(kw):].strip()
                val_part = re.sub(r"^[:\s\t\-]+", "", val_part)
                if val_part:
                    # Clean up to keep first word/code
                    code_match = re.search(r"^(\w+)", val_part)
                    if code_match:
                        code = code_match.group(1)
                        # Avoid matching short conversational words
                        if code.lower() not in {"for", "the", "a", "of", "to", "in", "on", "job", "work", "is", "are", "with"}:
                            order = code
                            break
        if order:
            break

    # Extract Customer
    for kw in customer_kws:
        pattern = re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)
        for line in lines:
            match = pattern.search(line)
            if match:
                idx = match.start()
                val_part = line[idx + len(kw):].strip()
                val_part = re.sub(r"^[:\s\t\-]+", "", val_part)
                if val_part:
                    val_part = re.sub(r"^\d+\s+", "", val_part)
                    if val_part:
                        customer = val_part
                        break
        if customer:
            break

    # Extract Location
    for kw in location_kws:
        pattern = re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)
        for line in lines:
            match = pattern.search(line)
            if match:
                idx = match.start()
                val_part = line[idx + len(kw):].strip()
                val_part = re.sub(r"^[:\s\t\-]+", "", val_part)
                if val_part:
                    val_part = re.sub(r"^[A-Z]\d+\s+", "", val_part)
                    if val_part:
                        location = val_part
                        break
        if location:
            break

    # Extract Task
    for kw in task_kws:
        pattern = re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)
        for line in lines:
            match = pattern.search(line)
            if match:
                idx = match.start()
                val_part = line[idx + len(kw):].strip()
                val_part = re.sub(r"^[:\s\t\-]+", "", val_part)
                if val_part:
                    first_word = re.search(r"^(\w+)", val_part)
                    if first_word and first_word.group(1).lower() not in {"for", "on", "in", "to", "with", "the", "a"}:
                        task = val_part
                        break
        if task:
            break

    customer = customer.strip() if customer else "Unknown Customer"
    location = location.strip() if location else "Unknown Location"
    order = order.strip() if order else "Unknown Order"
    task = task.strip() if task else "Installation"

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


def parse_delegation_email(text: str) -> dict | None:
    # Maintained for backward compatibility of synchronous test suites
    return parse_delegation_email_local(text)


async def parse_delegation_email_gemini(text: str, api_key: str) -> dict | None:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Analyze this email body and extract structured details about a professional delegation or business trip. "
                            "Extract the following fields and return them in the requested JSON structure: "
                            "title (a concise summary like 'Delegation: [Customer] ([Location])', max 200 characters), "
                            "date_from (start date in YYYY-MM-DD format), "
                            "date_to (end date in YYYY-MM-DD format), "
                            "and description (a brief, human-friendly summary of key details, such as order number, location, and tasks)."
                        )
                    },
                    {
                        "text": text
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "date_from": {"type": "STRING"},
                    "date_to": {"type": "STRING"},
                    "description": {"type": "STRING"}
                },
                "required": ["title", "date_from", "date_to", "description"]
            }
        }
    }
    
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, timeout=30.0)
        if resp.status_code != 200:
            raise Exception(f"Gemini API returned status code {resp.status_code}: {resp.text}")
        
        resp_data = resp.json()
        candidate = resp_data.get("candidates", [{}])[0]
        content = candidate.get("content", {})
        parts = content.get("parts", [{}])
        text_response = parts[0].get("text", "{}")
        
        try:
            result = json.loads(text_response)
        except Exception as e:
            raise Exception(f"Failed to parse JSON response from Gemini: {e}. Raw: {text_response}")
            
        date_from = result.get("date_from")
        date_to = result.get("date_to")
        
        if date_from and not re.match(r"^\d{4}-\d{2}-\d{2}$", date_from):
            date_from = None
        if date_to and not re.match(r"^\d{4}-\d{2}-\d{2}$", date_to):
            date_to = None
            
        if not date_from or not date_to:
            return None
            
        return {
            "title": result.get("title", "Delegation Report")[:200],
            "date_from": date_from,
            "date_to": date_to,
            "description": result.get("description", "").strip(),
        }


async def parse_delegation_email_async(text: str, conn: asyncpg.Connection | None = None) -> dict | None:
    if conn:
        try:
            from .ocr_service import get_ocr_config
            ocr_cfg = await get_ocr_config(conn)
            if ocr_cfg.ocr_enabled and ocr_cfg.provider == "gemini" and ocr_cfg.gemini_api_key:
                parsed = await parse_delegation_email_gemini(text, ocr_cfg.gemini_api_key)
                if parsed:
                    return parsed
        except Exception as e:
            logger.error(f"Gemini email parsing failed, falling back to local: {e}")
            
    return parse_delegation_email_local(text)


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

    parsed = await parse_delegation_email_async(body_text, conn)
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

    # 1. Local Parsing
    local_parsed = parse_delegation_email_local(body_text)

    # 2. Gemini Parsing
    gemini_parsed = None
    gemini_error = None
    try:
        from .ocr_service import get_ocr_config
        ocr_cfg = await get_ocr_config(conn)
        if ocr_cfg.ocr_enabled and ocr_cfg.gemini_api_key:
            gemini_parsed = await parse_delegation_email_gemini(body_text, ocr_cfg.gemini_api_key)
        else:
            gemini_error = "Gemini key not configured or OCR disabled in settings"
    except Exception as e:
        gemini_error = str(e)
        logger.error(f"Simulation Gemini email parsing failed: {e}")

    # Use Gemini if enabled and successful, otherwise local
    from .ocr_service import get_ocr_config
    ocr_cfg = await get_ocr_config(conn)
    use_gemini = ocr_cfg.ocr_enabled and ocr_cfg.provider == "gemini" and gemini_parsed is not None
    final_parsed = gemini_parsed if use_gemini else local_parsed

    if not final_parsed:
        return {
            "success": False,
            "error": "Could not parse delegation patterns in email body with active provider",
            "parsed": None,
            "local_parsed": local_parsed,
            "gemini_parsed": gemini_parsed,
            "gemini_error": gemini_error,
            "active_parser": "gemini" if use_gemini else "local",
        }

    now = datetime.now(timezone.utc)
    report_id = await conn.fetchval(
        """
        INSERT INTO expense_reports (title, description, date_from, date_to, status, user_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, 'draft', $5, $6, $6)
        RETURNING id
        """,
        final_parsed["title"],
        final_parsed["description"],
        final_parsed["date_from"],
        final_parsed["date_to"],
        user_id,
        now,
    )

    return {
        "success": True,
        "report_id": report_id,
        "parsed": final_parsed,
        "local_parsed": local_parsed,
        "gemini_parsed": gemini_parsed,
        "gemini_error": gemini_error,
        "active_parser": "gemini" if use_gemini else "local",
        "user_display_name": user_row["display_name"],
    }

