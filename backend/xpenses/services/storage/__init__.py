import os
from datetime import datetime
from pathlib import Path

import asyncpg
from fastapi import UploadFile

from ...config import settings
from .manager import (
    delete_receipt_file,
    get_active_provider,
    get_local_path,
    save_receipt_file,
)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".webp"}
MAX_SIZE_MB = 10


async def save_receipt(expense_id: int, file: UploadFile, db_conn: asyncpg.Connection = None) -> str:
    raw_filename = os.path.basename(file.filename or "receipt")
    ext = os.path.splitext(raw_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type {ext} not allowed")

    now = datetime.now()
    subdir = f"{now.year}/{now.month:02d}"
    # Sanitize: keep only safe characters to prevent path manipulation via filename
    stem = os.path.splitext(raw_filename)[0]
    safe_stem = "".join(c if c.isalnum() or c in "-_" else "_" for c in stem)[:100]
    safe_name = f"{expense_id}_{safe_stem}{ext}"
    relative_path = f"{subdir}/{safe_name}"

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise ValueError(f"File exceeds {MAX_SIZE_MB}MB limit")

    if db_conn is None:
        local_path = settings.receipts_dir
        full_path = Path(local_path).resolve() / relative_path
        # Path traversal protection
        target_abs = Path(full_path).resolve()
        base_abs = Path(local_path).resolve()
        if not target_abs.is_relative_to(base_abs):
            raise ValueError("Invalid target filepath")
        os.makedirs(full_path.parent, exist_ok=True)
        full_path.write_bytes(content)
        return relative_path

    await save_receipt_file(relative_path, content, db_conn)
    return relative_path

async def delete_receipt(relative_path: str, db_conn: asyncpg.Connection = None) -> None:
    if db_conn is None:
        local_path = settings.receipts_dir
        full_path = Path(local_path).resolve() / relative_path
        if full_path.exists():
            full_path.unlink()
        return
    await delete_receipt_file(relative_path, db_conn)

async def get_full_path(relative_path: str, db_conn: asyncpg.Connection = None) -> str:
    if db_conn is None:
        local_path = settings.receipts_dir
        return str((Path(local_path).resolve() / relative_path).resolve())
    return await get_local_path(relative_path, db_conn)

async def scan_orphan_receipts(db_conn: asyncpg.Connection) -> list[str]:
    """
    Compares files in the active storage provider with the receipts table.
    """
    provider = await get_active_provider(db_conn)
    storage_files = set(await provider.list_files())

    rows = await db_conn.fetch("SELECT file_path FROM receipts")
    db_files = {r["file_path"] for r in rows}

    orphans = sorted(list(storage_files - db_files))
    return orphans
