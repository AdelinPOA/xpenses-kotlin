import datetime
import json
import os
from pathlib import Path

import asyncpg
from cryptography.fernet import Fernet, InvalidToken

from ...config import settings
from ...services.crypto import get_fernet
from .base import BaseStorageProvider
from .local import LocalStorageProvider
from .s3 import S3StorageProvider
from .sftp import SFTPStorageProvider
from .smb import SMBStorageProvider
from .webdav import WebDAVStorageProvider

CRYPTO_INFO = b"xpenses-storage-settings"

def _get_encryption_key() -> Fernet:
    return get_fernet(CRYPTO_INFO)

def encrypt_value(val: str) -> str:
    if not val:
        return ""
    fernet = _get_encryption_key()
    return fernet.encrypt(val.encode()).decode()

def decrypt_value(val: str) -> str:
    if not val:
        return ""
    fernet = _get_encryption_key()
    try:
        return fernet.decrypt(val.encode()).decode()
    except (InvalidToken, Exception):
        return ""

async def get_storage_config(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow(
        "SELECT value FROM app_settings WHERE key = 'storage_config'"
    )
    if not row:
        # Default config
        return {
            "provider_type": "local",
            "local": {
                "path": settings.receipts_dir
            }
        }

    try:
        data = json.loads(row["value"])
    except Exception:
        data = {}
    
    # Decrypt sensitive fields
    if "smb" in data and "password" in data["smb"]:
        data["smb"]["password"] = decrypt_value(data["smb"]["password"])
    if "webdav" in data and "password" in data["webdav"]:
        data["webdav"]["password"] = decrypt_value(data["webdav"]["password"])
    if "sftp" in data and "password" in data["sftp"]:
        data["sftp"]["password"] = decrypt_value(data["sftp"]["password"])
    if "s3" in data and "secret_key" in data["s3"]:
        data["s3"]["secret_key"] = decrypt_value(data["s3"]["secret_key"])

    # Ensure local path exists in the config structure
    if "local" not in data:
        data["local"] = {"path": settings.receipts_dir}
    elif not data["local"].get("path"):
        data["local"]["path"] = settings.receipts_dir

    return data

async def save_storage_config(config_data: dict, conn: asyncpg.Connection) -> None:
    # Encrypt sensitive fields
    data = json.loads(json.dumps(config_data)) # deepcopy
    
    if "smb" in data and "password" in data["smb"]:
        if data["smb"]["password"] != "••••••••":
            data["smb"]["password"] = encrypt_value(data["smb"]["password"])
        else:
            # Keep existing password if not modified
            existing = await get_storage_config(conn)
            data["smb"]["password"] = encrypt_value(existing.get("smb", {}).get("password", ""))

    if "webdav" in data and "password" in data["webdav"]:
        if data["webdav"]["password"] != "••••••••":
            data["webdav"]["password"] = encrypt_value(data["webdav"]["password"])
        else:
            existing = await get_storage_config(conn)
            data["webdav"]["password"] = encrypt_value(existing.get("webdav", {}).get("password", ""))

    if "sftp" in data and "password" in data["sftp"]:
        if data["sftp"]["password"] != "••••••••":
            data["sftp"]["password"] = encrypt_value(data["sftp"]["password"])
        else:
            existing = await get_storage_config(conn)
            data["sftp"]["password"] = encrypt_value(existing.get("sftp", {}).get("password", ""))

    if "s3" in data and "secret_key" in data["s3"]:
        if data["s3"]["secret_key"] != "••••••••":
            data["s3"]["secret_key"] = encrypt_value(data["s3"]["secret_key"])
        else:
            existing = await get_storage_config(conn)
            data["s3"]["secret_key"] = encrypt_value(existing.get("s3", {}).get("secret_key", ""))

    now = datetime.datetime.now(datetime.timezone.utc)
    await conn.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('storage_config', $1, $2)
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = $2
        """,
        json.dumps(data),
        now,
    )

def instantiate_provider(config: dict) -> BaseStorageProvider:
    provider_type = config.get("provider_type", "local")
    if provider_type == "local":
        local_path = config.get("local", {}).get("path") or settings.receipts_dir
        return LocalStorageProvider(base_dir=local_path)
    elif provider_type == "smb":
        smb_cfg = config.get("smb", {})
        return SMBStorageProvider(
            host=smb_cfg.get("host", ""),
            share=smb_cfg.get("share", ""),
            username=smb_cfg.get("username", ""),
            password=smb_cfg.get("password", ""),
            domain=smb_cfg.get("domain", ""),
            folder=smb_cfg.get("folder", "receipts")
        )
    elif provider_type == "webdav":
        wd_cfg = config.get("webdav", {})
        return WebDAVStorageProvider(
            url=wd_cfg.get("url", ""),
            username=wd_cfg.get("username", ""),
            password=wd_cfg.get("password", ""),
            folder=wd_cfg.get("folder", "receipts")
        )
    elif provider_type == "sftp":
        sftp_cfg = config.get("sftp", {})
        return SFTPStorageProvider(
            host=sftp_cfg.get("host", ""),
            port=int(sftp_cfg.get("port", 22) or 22),
            username=sftp_cfg.get("username", ""),
            password=sftp_cfg.get("password", ""),
            folder=sftp_cfg.get("folder", "receipts")
        )
    elif provider_type == "s3":
        s3_cfg = config.get("s3", {})
        return S3StorageProvider(
            endpoint_url=s3_cfg.get("endpoint_url", ""),
            access_key=s3_cfg.get("access_key", ""),
            secret_key=s3_cfg.get("secret_key", ""),
            bucket_name=s3_cfg.get("bucket_name", ""),
            region_name=s3_cfg.get("region_name", "")
        )
    else:
        return LocalStorageProvider(base_dir=settings.receipts_dir)

async def get_active_provider(conn: asyncpg.Connection) -> BaseStorageProvider:
    config = await get_storage_config(conn)
    return instantiate_provider(config)

def _get_cache_path(relative_path: str) -> Path:
    base_cache = Path(settings.receipts_dir).resolve() / "cache"
    target = (base_cache / relative_path).resolve()
    # Path traversal protection
    if not target.is_relative_to(base_cache):
        raise ValueError("Invalid target cache path")
    return target

async def get_local_path(relative_path: str, conn: asyncpg.Connection) -> str:
    config = await get_storage_config(conn)
    provider_type = config.get("provider_type", "local")
    
    if provider_type == "local":
        local_path = config.get("local", {}).get("path") or settings.receipts_dir
        base_dir = Path(local_path).resolve()
        target = (base_dir / relative_path).resolve()
        if not target.is_relative_to(base_dir):
            raise ValueError("Invalid target filepath")
        return str(target)

    # Remote provider: check local cache
    cache_path = _get_cache_path(relative_path)
    if not cache_path.exists():
        # Fetch from remote active provider
        provider = instantiate_provider(config)
        
        # Check read fallback: if not in new active provider, check if a migration is/was running
        # and try previous provider/local folder if not found.
        # But for simpler robust fallback: if active fails with FileNotFoundError, try local directory first.
        try:
            content = await provider.download_file(relative_path)
        except Exception as e:
            # Fallback to local default receipts directory if it exists on local disk
            local_fallback = Path(settings.receipts_dir).resolve() / relative_path
            if local_fallback.exists():
                content = local_fallback.read_bytes()
            else:
                # If migration status says running, we check if previous config is stored or fallback
                raise e

        # Write to cache
        os.makedirs(cache_path.parent, exist_ok=True)
        cache_path.write_bytes(content)

    return str(cache_path)

async def save_receipt_file(relative_path: str, content: bytes, conn: asyncpg.Connection) -> None:
    provider = await get_active_provider(conn)
    await provider.upload_file(relative_path, content)
    
    # Save to local cache as well so it's instantly available locally
    config = await get_storage_config(conn)
    provider_type = config.get("provider_type", "local")
    if provider_type != "local":
        cache_path = _get_cache_path(relative_path)
        os.makedirs(cache_path.parent, exist_ok=True)
        cache_path.write_bytes(content)
    else:
        # Save locally to custom path
        local_path = config.get("local", {}).get("path") or settings.receipts_dir
        full_path = Path(local_path).resolve() / relative_path
        os.makedirs(full_path.parent, exist_ok=True)
        full_path.write_bytes(content)

async def delete_receipt_file(relative_path: str, conn: asyncpg.Connection) -> None:
    provider = await get_active_provider(conn)
    await provider.delete_file(relative_path)
    
    # Delete cache file
    try:
        cache_path = _get_cache_path(relative_path)
        if cache_path.exists():
            cache_path.unlink()
    except Exception:
        pass

    # Delete local file if it exists in local storage path
    config = await get_storage_config(conn)
    local_path = config.get("local", {}).get("path") or settings.receipts_dir
    try:
        full_path = Path(local_path).resolve() / relative_path
        if full_path.exists():
            full_path.unlink()
    except Exception:
        pass

async def file_exists_in_active(relative_path: str, conn: asyncpg.Connection) -> bool:
    provider = await get_active_provider(conn)
    return await provider.file_exists(relative_path)


async def update_migration_status(status_data: dict, conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('storage_migration_status', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        """,
        json.dumps(status_data)
    )


async def get_migration_status(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow("SELECT value FROM app_settings WHERE key = 'storage_migration_status'")
    if not row:
        return {
            "status": "idle",
            "total_files": 0,
            "migrated_files": 0,
            "failed_files": 0,
            "errors": []
        }
    return json.loads(row["value"])


async def run_migration_task(old_config: dict, new_config: dict, pool) -> None:
    async with pool.acquire() as conn:
        # Get all receipts
        rows = await conn.fetch("SELECT file_path FROM receipts")
        file_paths = [r["file_path"] for r in rows]
        
        status_data = {
            "status": "running",
            "total_files": len(file_paths),
            "migrated_files": 0,
            "failed_files": 0,
            "errors": []
        }
        await update_migration_status(status_data, conn)

    if not file_paths:
        async with pool.acquire() as conn:
            status_data["status"] = "completed"
            await update_migration_status(status_data, conn)
        return

    old_provider = instantiate_provider(old_config)
    new_provider = instantiate_provider(new_config)

    migrated = 0
    failed = 0
    errors = []

    for path in file_paths:
        try:
            # Download from old
            try:
                content = await old_provider.download_file(path)
            except Exception as e:
                # Fallback to local default receipts directory
                local_fallback = Path(settings.receipts_dir).resolve() / path
                if local_fallback.exists():
                    content = local_fallback.read_bytes()
                else:
                    raise e
            
            # Upload to new
            await new_provider.upload_file(path, content)
            migrated += 1
        except Exception as err:
            failed += 1
            errors.append(f"Failed to migrate {path}: {str(err)}")

        # Periodically update status
        if (migrated + failed) % 5 == 0 or (migrated + failed) == len(file_paths):
            async with pool.acquire() as conn:
                status_data["migrated_files"] = migrated
                status_data["failed_files"] = failed
                status_data["errors"] = errors[:50]  # Cap error list
                await update_migration_status(status_data, conn)

    async with pool.acquire() as conn:
        status_data["status"] = "completed" if failed == 0 else "failed"
        status_data["migrated_files"] = migrated
        status_data["failed_files"] = failed
        status_data["errors"] = errors
        await update_migration_status(status_data, conn)

