from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import login
from xpenses.services.storage.manager import get_storage_config


@pytest.mark.asyncio
async def test_storage_settings_get_defaults(client: AsyncClient, pool):
    await login(client, "mod1")
    resp = await client.get("/api/settings/storage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider_type"] == "local"
    assert "local" in data


@pytest.mark.asyncio
async def test_storage_settings_patch_and_get(client: AsyncClient, pool):
    await login(client, "mod1")
    payload = {
        "provider_type": "s3",
        "s3": {
            "endpoint_url": "http://minio.local",
            "access_key": "myaccesskey",
            "secret_key": "mysecretkey",
            "bucket_name": "receipts-bucket",
            "region_name": "us-east-1"
        }
    }
    resp = await client.patch("/api/settings/storage", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider_type"] == "s3"
    assert data["s3"]["secret_key"] == "••••••••"

    # GET config to verify masking
    resp2 = await client.get("/api/settings/storage")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["provider_type"] == "s3"
    assert data2["s3"]["secret_key"] == "••••••••"

    # Verify decryption internally
    async with pool.acquire() as conn:
        config = await get_storage_config(conn)
        assert config["s3"]["secret_key"] == "mysecretkey"
        await conn.execute("DELETE FROM app_settings WHERE key = 'storage_config'")


@pytest.mark.asyncio
async def test_storage_settings_non_mod_forbidden(client: AsyncClient):
    await login(client, "tech1")
    resp_get = await client.get("/api/settings/storage")
    assert resp_get.status_code == 403

    resp_patch = await client.patch(
        "/api/settings/storage",
        json={"provider_type": "local"},
    )
    assert resp_patch.status_code == 403

    resp_test = await client.post(
        "/api/settings/storage/test",
        json={"provider_type": "local"},
    )
    assert resp_test.status_code == 403


@pytest.mark.asyncio
async def test_storage_settings_test_endpoint_success(client: AsyncClient):
    await login(client, "mod1")

    payload = {
        "provider_type": "s3",
        "s3": {
            "endpoint_url": "http://minio.local",
            "access_key": "myaccesskey",
            "secret_key": "mysecretkey",
            "bucket_name": "receipts-bucket",
            "region_name": "us-east-1"
        }
    }

    with patch("xpenses.services.storage.s3.S3StorageProvider.test_connection", new_callable=AsyncMock) as mock_test:
        mock_test.return_value = (True, "")
        resp = await client.post("/api/settings/storage/test", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True


@pytest.mark.asyncio
async def test_storage_settings_test_endpoint_failure(client: AsyncClient):
    await login(client, "mod1")

    payload = {
        "provider_type": "s3",
        "s3": {
            "endpoint_url": "http://minio.local",
            "access_key": "myaccesskey",
            "secret_key": "mysecretkey",
            "bucket_name": "receipts-bucket",
            "region_name": "us-east-1"
        }
    }

    with patch("xpenses.services.storage.s3.S3StorageProvider.test_connection", new_callable=AsyncMock) as mock_test:
        mock_test.return_value = (False, "Bucket not found")
        resp = await client.post("/api/settings/storage/test", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "bucket not found" in data["message"].lower()


@pytest.mark.asyncio
async def test_storage_settings_migration_status(client: AsyncClient):
    await login(client, "mod1")
    resp = await client.get("/api/settings/storage/migration-status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("idle", "running", "completed", "failed")
