import os
from datetime import datetime
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from ..config import settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".webp"}
MAX_SIZE_MB = 10


async def save_receipt(expense_id: int, file: UploadFile) -> str:
    raw_filename = os.path.basename(file.filename or "receipt")
    ext = os.path.splitext(raw_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type {ext} not allowed")

    now = datetime.now()
    subdir = f"{now.year}/{now.month:02d}"
    full_dir = os.path.join(settings.receipts_dir, subdir)

    safe_name = f"{expense_id}_{raw_filename}".replace(" ", "_")
    full_path = os.path.join(full_dir, safe_name)

    # Path traversal protection
    target_abs = Path(full_path).resolve()
    base_abs = Path(settings.receipts_dir).resolve()
    if not target_abs.is_relative_to(base_abs):
        raise ValueError("Invalid target filepath")

    os.makedirs(full_dir, exist_ok=True)

    relative_path = f"{subdir}/{safe_name}"

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise ValueError(f"File exceeds {MAX_SIZE_MB}MB limit")

    async with aiofiles.open(full_path, "wb") as f:
        await f.write(content)

    return relative_path


def delete_receipt(relative_path: str) -> None:
    base_abs = Path(settings.receipts_dir).resolve()
    target_abs = (base_abs / relative_path).resolve()
    if not target_abs.is_relative_to(base_abs):
        return
    if target_abs.exists():
        target_abs.unlink()


def get_full_path(relative_path: str) -> str:
    base_abs = Path(settings.receipts_dir).resolve()
    target_abs = (base_abs / relative_path).resolve()
    if not target_abs.is_relative_to(base_abs):
        raise ValueError("Invalid filepath")
    return str(target_abs)


async def scan_orphan_receipts(db_conn) -> list[str]:
    """
    Compares the files in settings.receipts_dir with the database receipts table.
    Returns a list of relative file paths that exist on disk but not in the database.
    """
    base_abs = Path(settings.receipts_dir).resolve()
    if not base_abs.exists():
        return []

    # Get all relative paths of files in settings.receipts_dir
    disk_files = set()
    for root, _, files in os.walk(base_abs):
        for file in files:
            full_path = Path(root) / file
            # Get path relative to the receipts_dir base
            try:
                rel_path = str(full_path.relative_to(base_abs))
                disk_files.add(rel_path)
            except ValueError:
                continue

    # Get all file_path records from receipts database table
    rows = await db_conn.fetch("SELECT file_path FROM receipts")
    db_files = {r["file_path"] for r in rows}

    # Identify orphans (on disk but not in db)
    orphans = sorted(list(disk_files - db_files))
    return orphans
