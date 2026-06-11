import asyncio
import base64
import dataclasses
import datetime
import io
import json
import logging
import re

import asyncpg
import httpx
import numpy as np
from PIL import Image
from cryptography.fernet import InvalidToken

from ..config import settings
from .crypto import get_fernet

logger = logging.getLogger(__name__)

Image.MAX_IMAGE_PIXELS = 25_000_000
MAX_EDGE = 2000

_reader = None


@dataclasses.dataclass
class OCRConfig:
    provider: str = "easyocr"
    ocr_enabled: bool = True
    gemini_api_key: str = ""
    password_set: bool = False


async def get_ocr_config(conn: asyncpg.Connection) -> OCRConfig:
    row = await conn.fetchrow(
        "SELECT value FROM app_settings WHERE key = 'ocr_config'"
    )
    if not row:
        return OCRConfig(
            provider="easyocr",
            ocr_enabled=settings.ocr_enabled,
            gemini_api_key="",
            password_set=False,
        )

    try:
        data = json.loads(row["value"])
    except Exception:
        data = {}

    encrypted_key = data.get("gemini_api_key", "")
    decrypted = ""
    password_set = False

    if encrypted_key:
        try:
            fernet = get_fernet(b"xpenses-gemini-ocr-pw")
            decrypted = fernet.decrypt(encrypted_key.encode()).decode()
            password_set = True
        except (InvalidToken, Exception) as e:
            logger.error(f"Failed to decrypt Gemini OCR key: {e}")
            decrypted = ""
            password_set = False

    return OCRConfig(
        provider=data.get("provider", "easyocr"),
        ocr_enabled=data.get("ocr_enabled", True),
        gemini_api_key=decrypted,
        password_set=password_set,
    )


async def save_ocr_config(config: OCRConfig, conn: asyncpg.Connection) -> None:
    if config.gemini_api_key:
        fernet = get_fernet(b"xpenses-gemini-ocr-pw")
        encrypted_key = fernet.encrypt(config.gemini_api_key.encode()).decode()
    else:
        encrypted_key = ""

    data = {
        "provider": config.provider,
        "ocr_enabled": config.ocr_enabled,
        "gemini_api_key": encrypted_key,
    }

    now = datetime.datetime.now(datetime.timezone.utc)
    await conn.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('ocr_config', $1, $2)
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = $2
        """,
        json.dumps(data),
        now,
    )


async def test_gemini_connection(api_key: str) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key={api_key}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10.0)
            if resp.status_code == 200:
                return {"success": True, "message": "Gemini API connection successful!"}
            else:
                try:
                    error_msg = resp.json().get("error", {}).get("message", resp.text)
                except Exception:
                    error_msg = resp.text
                return {"success": False, "message": f"Gemini API error: {error_msg}"}
    except Exception as e:
        return {"success": False, "message": f"Connection test failed: {e}"}


def _empty_result(warnings: list[str]) -> dict:
    return {
        "amount": None,
        "currency": None,
        "tax_amount": None,
        "tax_rate": None,
        "date": None,
        "merchant": None,
        "category_id": None,
        "description": None,
        "raw_text": "",
        "confidence": 0.0,
        "warnings": warnings,
    }


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr

        langs = [lang.strip() for lang in settings.ocr_languages.split(",")]
        _reader = easyocr.Reader(langs, gpu=False)
    return _reader


def _load_pil_image(file_bytes: bytes, filename: str) -> tuple[Image.Image | None, list[str]]:
    if filename.lower().endswith(".pdf"):
        try:
            from pdf2image import convert_from_bytes

            pages = convert_from_bytes(file_bytes, first_page=1, last_page=1, dpi=150, size=(MAX_EDGE, None))
            if not pages:
                return None, ["Could not extract page from PDF"]
            return pages[0], []
        except MemoryError:
            return None, ["PDF too large to render"]
        except Exception as exc:
            return None, [f"PDF conversion failed: {exc}"]
    else:
        try:
            pil_image = Image.open(io.BytesIO(file_bytes))
            pil_image.verify()
            pil_image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            w, h = pil_image.size
            if max(w, h) > MAX_EDGE:
                ratio = MAX_EDGE / max(w, h)
                pil_image = pil_image.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
            return pil_image, []
        except Image.DecompressionBombError:
            return None, ["Image too large (possible decompression bomb)"]
        except Exception as exc:
            return None, [f"Image open failed: {exc}"]


class BaseOCRProvider:
    async def scan(self, file_bytes: bytes, filename: str, categories: list[dict] | None = None) -> dict:
        raise NotImplementedError()


class EasyOCRProvider(BaseOCRProvider):
    async def scan(self, file_bytes: bytes, filename: str, categories: list[dict] | None = None) -> dict:
        pil_image, errors = _load_pil_image(file_bytes, filename)
        if errors:
            return _empty_result(errors)

        image_np = np.array(pil_image)

        try:
            reader = _get_reader()
            results = await asyncio.to_thread(reader.readtext, image_np)
        except Exception as exc:
            return _empty_result([f"OCR failed: {exc}"])

        lines: list[str] = []
        confidences: list[float] = []
        for _bbox, text, conf in results:
            lines.append(text)
            confidences.append(conf)

        raw_text = "\n".join(lines)
        mean_confidence = float(np.mean(confidences)) if confidences else 0.0

        amount, currency = extract_amount(lines)
        tax_amount, tax_rate = extract_tax(lines)
        date = extract_date(lines)
        merchant = extract_merchant(lines)

        # Basic keyword-based category matching
        category_id = None
        if categories and raw_text:
            text_lower = raw_text.lower()
            for cat in categories:
                cat_name_lower = cat["name"].lower()
                if cat_name_lower in text_lower:
                    category_id = cat["id"]
                    break
                # Check sub-words
                words = [w.strip() for w in cat_name_lower.split() if len(w.strip()) > 3]
                if words and any(w in text_lower for w in words):
                    category_id = cat["id"]
                    break

        description = f"Scanned receipt from {merchant}" if merchant else "Scanned receipt"

        warnings = []
        if amount is None:
            warnings.append("Could not extract amount")
        if date is None:
            warnings.append("Could not extract date")
        if merchant is None:
            warnings.append("Could not extract merchant")

        return {
            "amount": amount,
            "currency": currency,
            "tax_amount": tax_amount,
            "tax_rate": tax_rate,
            "date": date,
            "merchant": merchant,
            "category_id": category_id,
            "description": description,
            "raw_text": raw_text,
            "confidence": round(mean_confidence, 4),
            "warnings": warnings,
        }


class GeminiOCRProvider(BaseOCRProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def scan(self, file_bytes: bytes, filename: str, categories: list[dict] | None = None) -> dict:
        pil_image, errors = _load_pil_image(file_bytes, filename)
        if errors:
            return _empty_result(errors)

        # Convert PIL to JPEG bytes in memory
        buffer = io.BytesIO()
        pil_image.save(buffer, format="JPEG")
        jpeg_bytes = buffer.getvalue()
        b64_data = base64.b64encode(jpeg_bytes).decode("utf-8")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={self.api_key}"
        
        categories_str = ", ".join([f"{c['id']}: {c['name']}" for c in categories]) if categories else "None available"

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": (
                                "Analyze this receipt, bill, invoice, or ticket image. "
                                "Extract the following fields and return them in the requested JSON structure: "
                                "merchant (store/provider name), amount (total amount paid), currency (3-letter ISO code e.g. EUR, USD, RON), "
                                "tax_amount (total tax/VAT paid), tax_rate (percentage e.g. 19.0), date (in YYYY-MM-DD format), "
                                "raw_text (full OCR transcription of the text on the receipt), "
                                f"category_id (Select the best-matching integer category ID from this list: {categories_str}. If none match, return null), "
                                "and description (a brief, human-friendly summary of the expense description or receipt items)."
                            )
                        },
                        {
                            "inlineData": {
                                "mimeType": "image/jpeg",
                                "data": b64_data
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "merchant": {"type": "STRING"},
                        "amount": {"type": "NUMBER"},
                        "currency": {"type": "STRING"},
                        "tax_amount": {"type": "NUMBER"},
                        "tax_rate": {"type": "NUMBER"},
                        "date": {"type": "STRING"},
                        "category_id": {"type": "INTEGER"},
                        "description": {"type": "STRING"},
                        "raw_text": {"type": "STRING"}
                    }
                }
            }
        }

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
            
            warnings = []
            amount = result.get("amount")
            date = result.get("date")
            merchant = result.get("merchant")
            
            if amount is not None:
                amount = float(amount)
            else:
                warnings.append("Could not extract amount")
                
            if date:
                if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
                    warnings.append("Extracted date format is invalid")
                    date = None
            else:
                warnings.append("Could not extract date")
                
            if not merchant:
                warnings.append("Could not extract merchant")

            currency = result.get("currency")
            if currency:
                currency = currency.upper().strip()

            tax_amount = result.get("tax_amount")
            if tax_amount is not None:
                tax_amount = float(tax_amount)

            tax_rate = result.get("tax_rate")
            if tax_rate is not None:
                tax_rate = float(tax_rate)

            # Validate that the returned category_id is in our active categories
            category_id = result.get("category_id")
            if category_id is not None:
                valid_ids = {c["id"] for c in categories} if categories else set()
                if category_id not in valid_ids:
                    category_id = None

            return {
                "amount": amount,
                "currency": currency,
                "tax_amount": tax_amount,
                "tax_rate": tax_rate,
                "date": date,
                "merchant": merchant,
                "category_id": category_id,
                "description": result.get("description"),
                "raw_text": result.get("raw_text", ""),
                "confidence": 1.0,
                "warnings": warnings,
            }


async def scan_receipt(file_bytes: bytes, filename: str, db: asyncpg.Connection | None = None) -> dict:
    categories = []
    config = None
    if db:
        config = await get_ocr_config(db)
        try:
            rows = await db.fetch("SELECT id, name FROM categories WHERE is_active = true")
            categories = [{"id": r["id"], "name": r["name"]} for r in rows]
        except Exception as e:
            logger.error(f"Failed to fetch categories: {e}")
    else:
        from ..database import get_pool
        pool = get_pool()
        try:
            async with pool.acquire() as conn:
                config = await get_ocr_config(conn)
                rows = await conn.fetch("SELECT id, name FROM categories WHERE is_active = true")
                categories = [{"id": r["id"], "name": r["name"]} for r in rows]
        except Exception as e:
            logger.error(f"Failed to acquire database connection for OCR config: {e}")
            config = OCRConfig(provider="easyocr", ocr_enabled=True)

    if not config.ocr_enabled:
        return _empty_result(["OCR is disabled in settings"])

    if config.provider == "gemini" and config.gemini_api_key:
        try:
            provider = GeminiOCRProvider(config.gemini_api_key)
            return await provider.scan(file_bytes, filename, categories=categories)
        except Exception as exc:
            logger.error(f"Gemini OCR failed, falling back to EasyOCR: {exc}")
            provider = EasyOCRProvider()
            result = await provider.scan(file_bytes, filename, categories=categories)
            result["warnings"].append(f"Gemini OCR failed: {exc}. Fell back to local EasyOCR.")
            return result
    else:
        provider = EasyOCRProvider()
        return await provider.scan(file_bytes, filename, categories=categories)



def extract_amount(lines: list[str]) -> tuple[float | None, str | None]:
    """Extract the total amount and currency from OCR text lines."""

    TOTAL_KEYWORDS = {"total", "suma", "amount", "to pay", "de plata", "plata", "grand total"}

    CURRENCY_SYMBOL_MAP = {"€": "EUR", "$": "USD"}
    CURRENCY_CODE_MAP = {"EUR": "EUR", "RON": "RON", "USD": "USD", "GBP": "GBP", "LEI": "RON"}

    # Patterns: (regex, group_amount, group_currency_or_None)
    PATTERNS = [
        # Currency symbol before amount: €12.50  $1,234.56  €1.234,56
        (re.compile(r"([€$])\s*([\d.,]+\d{2})"), 2, 1),
        # Currency code after amount: 12.50 EUR  1.234,56 RON
        (re.compile(r"([\d.,]+\d{2})\s*(EUR|RON|USD|GBP|lei)", re.IGNORECASE), 1, 2),
        # Plain decimal number: 12.50  1.234,56
        (re.compile(r"((?:\d{1,3}\.)*\d{1,6}[,]\d{2}|\d{1,6}\.\d{2})"), 1, None),
    ]

    def _parse_amount(raw: str) -> float:
        # European comma decimal: replace last comma with dot if it looks like separator
        # e.g. "1.234,56" → 1234.56  or "12,50" → 12.50
        if "," in raw and "." in raw:
            # assume dot is thousands separator, comma is decimal
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", ".")
        return float(raw)

    def _resolve_currency(sym: str) -> str | None:
        upper = sym.strip().upper()
        if sym.strip() in CURRENCY_SYMBOL_MAP:
            return CURRENCY_SYMBOL_MAP[sym.strip()]
        return CURRENCY_CODE_MAP.get(upper)

    def _find_in_line(line: str) -> tuple[float | None, str | None]:
        for pattern, amt_grp, cur_grp in PATTERNS:
            m = pattern.search(line)
            if m:
                try:
                    amount = _parse_amount(m.group(amt_grp))
                except ValueError:
                    continue
                currency = None
                if cur_grp is not None:
                    currency = _resolve_currency(m.group(cur_grp))
                return amount, currency
        return None, None

    def _guess_global_currency() -> str | None:
        full_text = " ".join(lines).upper()
        if "€" in full_text or "EUR" in full_text:
            return "EUR"
        if "$" in full_text or "USD" in full_text:
            return "USD"
        if "RON" in full_text or "LEI" in full_text:
            return "RON"
        return None

    # First pass: look on lines that contain total keywords
    keyword_results: list[tuple[float, str | None]] = []
    for i, line in enumerate(lines):
        lower = line.lower()
        if any(kw in lower for kw in TOTAL_KEYWORDS):
            # Check current line
            amt, cur = _find_in_line(line)
            if amt is not None:
                keyword_results.append((amt, cur))
                continue

            # Look ahead up to 2 lines
            for j in range(1, 3):
                if i + j < len(lines):
                    lookahead_amt, lookahead_cur = _find_in_line(lines[i + j])
                    if lookahead_amt is not None:
                        keyword_results.append((lookahead_amt, lookahead_cur))
                        break

    final_amt, final_cur = None, None

    if keyword_results:
        # Return the last keyword match (usually the grand total at the bottom)
        final_amt, final_cur = keyword_results[-1]
    else:
        # Second pass: find largest amount across all lines
        all_results: list[tuple[float, str | None]] = []
        for line in lines:
            amt, cur = _find_in_line(line)
            if amt is not None:
                all_results.append((amt, cur))

        if all_results:
            final_amt, final_cur = max(all_results, key=lambda x: x[0])

    if final_amt is not None and final_cur is None:
        final_cur = _guess_global_currency()

    return final_amt, final_cur


def extract_tax(lines: list[str]) -> tuple[float | None, float | None]:
    """Extract tax amount and rate from OCR text lines."""
    TAX_KEYWORDS = {"tax", "vat", "tva", "taxa"}
    for line in lines:
        lower = line.lower()
        if any(kw in lower for kw in TAX_KEYWORDS):
            pct_match = re.search(r"(\d+(?:[.,]\d+)?)\s*%", line)
            rate = float(pct_match.group(1).replace(",", ".")) if pct_match else None

            amt_match = re.search(r"(\d+(?:[.,]\d{2}))", line)
            amt = float(amt_match.group(1).replace(",", ".")) if amt_match else None

            if amt is not None or rate is not None:
                return amt, rate
    return None, None


def extract_date(lines: list[str]) -> str | None:
    """Extract a date from OCR text lines, returning ISO format YYYY-MM-DD."""

    # DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
    DD_MM_YYYY = re.compile(r"(\d{2})[./\-](\d{2})[./\-](\d{4})")
    # YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    YYYY_MM_DD = re.compile(r"(\d{4})[./\-](\d{2})[./\-](\d{2})")

    for line in lines:
        # Try ISO format first
        m = YYYY_MM_DD.search(line)
        if m:
            year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year:04d}-{month:02d}-{day:02d}"

        # Try European DD/MM/YYYY format
        m = DD_MM_YYYY.search(line)
        if m:
            day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year:04d}-{month:02d}-{day:02d}"

    return None


def extract_merchant(lines: list[str]) -> str | None:
    """Extract merchant name from OCR text lines."""

    SKIP_KEYWORDS = {
        "bon fiscal",
        "receipt",
        "factura",
        "invoice",
        "chitanta",
        "tax invoice",
        "fiscal receipt",
    }
    DATE_PATTERN = re.compile(r"\d{2}[./\-]\d{2}[./\-]\d{2,4}")
    NUMBERS_ONLY = re.compile(r"^[\d\s\W]+$")

    for line in lines:
        stripped = line.strip()

        # Too short
        if len(stripped) < 3:
            continue

        # Skip date-like lines
        if DATE_PATTERN.search(stripped):
            continue

        # Skip lines that are only numbers/symbols
        if NUMBERS_ONLY.match(stripped):
            continue

        # Skip common receipt headers
        if stripped.lower() in SKIP_KEYWORDS:
            continue

        return stripped.title()

    return None
