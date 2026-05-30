import os
import aiofiles
from datetime import datetime
from fastapi import UploadFile
from ..config import settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".webp"}
MAX_SIZE_MB = 10


async def save_receipt(expense_id: int, file: UploadFile) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type {ext} not allowed")

    now = datetime.now()
    subdir = f"{now.year}/{now.month:02d}"
    full_dir = os.path.join(settings.receipts_dir, subdir)
    os.makedirs(full_dir, exist_ok=True)

    safe_name = f"{expense_id}_{file.filename}".replace(" ", "_")
    full_path = os.path.join(full_dir, safe_name)
    relative_path = f"{subdir}/{safe_name}"

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise ValueError(f"File exceeds {MAX_SIZE_MB}MB limit")

    async with aiofiles.open(full_path, "wb") as f:
        await f.write(content)

    return relative_path


def delete_receipt(relative_path: str) -> None:
    full_path = os.path.join(settings.receipts_dir, relative_path)
    if os.path.exists(full_path):
        os.remove(full_path)


def get_full_path(relative_path: str) -> str:
    return os.path.join(settings.receipts_dir, relative_path)
