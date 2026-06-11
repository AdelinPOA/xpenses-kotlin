import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import create_expense, login


@pytest.mark.asyncio
async def test_migrations_applied_on_init(pool):
    # Verify migration table exists and baseline is registered
    async with pool.acquire() as conn:
        version = await conn.fetchval("SELECT MAX(version) FROM schema_migrations")
        assert version >= 1


@pytest.mark.asyncio
async def test_orphan_receipts_scanner_and_cleaner(client: AsyncClient, pool):
    from xpenses.config import settings

    # Setup moderator login
    await login(client, "mod1")

    # 1. Create a dummy file on disk that does not exist in DB
    dummy_dir = os.path.join(settings.receipts_dir, "2026/06")
    os.makedirs(dummy_dir, exist_ok=True)
    dummy_file = os.path.join(dummy_dir, "orphan_test_file.png")
    with open(dummy_file, "wb") as f:
        f.write(b"fake image content")

    # Verify scan endpoint identifies the orphan file
    resp_scan = await client.post("/api/settings/receipts/scan")
    assert resp_scan.status_code == 200
    data_scan = resp_scan.json()
    assert "2026/06/orphan_test_file.png" in data_scan["orphans"]

    # Verify clean endpoint deletes the orphan file
    resp_clean = await client.post("/api/settings/receipts/clean")
    assert resp_clean.status_code == 200
    assert resp_clean.json()["cleaned_count"] >= 1

    # Verify file is deleted on disk
    assert not os.path.exists(dummy_file)


@pytest.mark.asyncio
async def test_delete_expense_removes_physical_file(client: AsyncClient, pool):
    from xpenses.config import settings

    # Setup technician login
    await login(client, "tech1")

    # Create expense
    expense = await create_expense(client, amount=50.0)
    expense_id = expense["id"]

    # Add a receipt record and file manually
    rel_path = "2026/06/receipt_test.png"
    receipt_dir = os.path.join(settings.receipts_dir, "2026/06")
    os.makedirs(receipt_dir, exist_ok=True)
    receipt_file = os.path.join(receipt_dir, "receipt_test.png")
    with open(receipt_file, "wb") as f:
        f.write(b"receipt content")

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO receipts (expense_id, file_path, original_name) VALUES ($1, $2, $3)",
            expense_id, rel_path, "receipt_test.png"
        )

    # Delete expense
    resp = await client.delete(f"/api/expenses/{expense_id}")
    assert resp.status_code == 204

    # Verify file is deleted on disk
    assert not os.path.exists(receipt_file)
