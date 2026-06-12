"""Tests for the /api/expenses endpoints."""

import pytest

from tests.conftest import create_expense, create_report, login, new_client


@pytest.mark.asyncio
async def test_create_expense_eur(client):
    await login(client, "tech1")
    expense = await create_expense(client, amount=75.0, currency="EUR")

    assert expense["amount_original"] == 75.0
    assert expense["currency_original"] == "EUR"
    assert expense["amount_eur"] == 75.0
    assert expense["fx_rate"] == 1.0


@pytest.mark.asyncio
async def test_create_expense_with_category(client):
    await login(client, "tech1")
    expense = await create_expense(client, category_id=1)

    assert expense["category_id"] == 1
    assert expense["category_name"] is not None
    assert isinstance(expense["category_name"], str)
    assert len(expense["category_name"]) > 0


@pytest.mark.asyncio
async def test_list_expenses(client):
    await login(client, "tech1")
    await create_expense(client, merchant="Shop A")
    await create_expense(client, merchant="Shop B")
    await create_expense(client, merchant="Shop C")

    resp = await client.get("/api/expenses")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3


@pytest.mark.asyncio
async def test_list_expenses_filter_status(client):
    await login(client, "tech1")
    await create_expense(client)

    resp_draft = await client.get("/api/expenses", params={"status": "draft"})
    assert resp_draft.status_code == 200
    assert len(resp_draft.json()) == 1

    resp_submitted = await client.get("/api/expenses", params={"status": "submitted"})
    assert resp_submitted.status_code == 200
    assert len(resp_submitted.json()) == 0


@pytest.mark.asyncio
async def test_get_single_expense(client):
    await login(client, "tech1")
    created = await create_expense(
        client, amount=42.0, currency="EUR", merchant="Corner Store", description="Lunch"
    )
    expense_id = created["id"]

    resp = await client.get(f"/api/expenses/{expense_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == expense_id
    assert data["amount_original"] == 42.0
    assert data["currency_original"] == "EUR"
    assert data["merchant"] == "Corner Store"
    assert data["description"] == "Lunch"
    assert data["status"] == "draft"
    assert "receipts" in data


@pytest.mark.asyncio
async def test_update_expense(client):
    await login(client, "tech1")
    expense = await create_expense(client, merchant="Old Merchant", description="Old desc")
    expense_id = expense["id"]

    resp = await client.patch(
        f"/api/expenses/{expense_id}",
        json={"merchant": "New Merchant", "description": "New desc"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["merchant"] == "New Merchant"
    assert data["description"] == "New desc"


@pytest.mark.asyncio
async def test_update_expense_recalculates_fx(client):
    await login(client, "tech1")
    expense = await create_expense(client, amount=50.0, currency="EUR")
    assert expense["amount_eur"] == 50.0

    expense_id = expense["id"]
    resp = await client.patch(
        f"/api/expenses/{expense_id}",
        json={"amount": 100.0, "currency": "EUR"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount_original"] == 100.0
    assert data["amount_eur"] == 100.0
    assert data["fx_rate"] == 1.0


@pytest.mark.asyncio
async def test_cannot_edit_submitted_expense(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client)

    attach = await client.post(
        f"/api/reports/{report['id']}/attach",
        json={"expense_ids": [expense["id"]]},
    )
    assert attach.status_code == 200

    submit = await client.post(f"/api/reports/{report['id']}/submit")
    assert submit.status_code == 200

    resp = await client.patch(
        f"/api/expenses/{expense['id']}",
        json={"merchant": "Changed"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_expense(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    expense_id = expense["id"]

    del_resp = await client.delete(f"/api/expenses/{expense_id}")
    assert del_resp.status_code == 204

    get_resp = await client.get(f"/api/expenses/{expense_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_cannot_delete_submitted_expense(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client)

    attach = await client.post(
        f"/api/reports/{report['id']}/attach",
        json={"expense_ids": [expense["id"]]},
    )
    assert attach.status_code == 200

    submit = await client.post(f"/api/reports/{report['id']}/submit")
    assert submit.status_code == 200

    resp = await client.delete(f"/api/expenses/{expense['id']}")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_ownership_isolation(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    expense_id = expense["id"]

    async with new_client() as other_client:
        await login(other_client, "manager1")
        resp = await other_client.get(f"/api/expenses/{expense_id}")
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_access(client):
    resp = await client.get("/api/expenses")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_attach_expense_to_report_via_patch(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client, title="Attach Test")

    resp = await client.patch(f"/api/expenses/{expense['id']}", json={"report_id": report["id"]})
    assert resp.status_code == 200
    assert resp.json()["report_id"] == report["id"]


@pytest.mark.asyncio
async def test_detach_expense_from_report_via_patch(client):
    await login(client, "tech1")
    report = await create_report(client)
    expense = await create_expense(client, report_id=report["id"])
    assert expense["report_id"] == report["id"]

    resp = await client.patch(f"/api/expenses/{expense['id']}", json={"report_id": None})
    assert resp.status_code == 200
    assert resp.json()["report_id"] is None


@pytest.mark.asyncio
async def test_cannot_attach_to_submitted_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_expense(client, report_id=report["id"])
    await client.post(f"/api/reports/{report['id']}/submit")

    expense = await create_expense(client)
    resp = await client.patch(f"/api/expenses/{expense['id']}", json={"report_id": report["id"]})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_cannot_attach_to_another_users_report(client):
    await login(client, "tech1")
    expense = await create_expense(client)

    async with new_client() as other_client:
        await login(other_client, "manager1")
        other_report = await create_report(other_client, title="Manager Report")

    resp = await client.patch(f"/api/expenses/{expense['id']}", json={"report_id": other_report["id"]})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_duplicate_expense_success(client, pool):
    import os

    from xpenses.config import settings

    await login(client, "tech1")
    report = await create_report(client)
    expense = await create_expense(
        client, amount=123.45, currency="USD", merchant="Test Merchant", description="Test Description", report_id=report["id"]
    )
    expense_id = expense["id"]

    # Add dummy receipt to original to verify it's NOT copied
    rel_path = "2026/06/test_receipt.png"
    receipt_dir = os.path.join(settings.receipts_dir, "2026/06")
    os.makedirs(receipt_dir, exist_ok=True)
    with open(os.path.join(receipt_dir, "test_receipt.png"), "wb") as f:
        f.write(b"test receipt content")

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO receipts (expense_id, file_path, original_name) VALUES ($1, $2, $3)",
            expense_id, rel_path, "test_receipt.png"
        )

    # Call duplication endpoint
    resp = await client.post(f"/api/expenses/{expense_id}/duplicate")
    assert resp.status_code == 201
    duplicated = resp.json()

    # Assert basic cloning rules
    assert duplicated["id"] != expense_id
    assert duplicated["amount_original"] == 123.45
    assert duplicated["currency_original"] == "USD"
    assert duplicated["merchant"] == "Test Merchant"
    assert duplicated["description"] == "Test Description"
    
    # Assert reset fields
    assert duplicated["status"] == "draft"
    assert duplicated["report_id"] is None
    assert len(duplicated["receipts"]) == 0
    assert duplicated["receipt_path"] is None


@pytest.mark.asyncio
async def test_duplicate_expense_unauthorized(client):
    await login(client, "tech1")
    expense = await create_expense(client, amount=10.0)
    expense_id = expense["id"]

    # Log in as another user and attempt duplication
    async with new_client() as other_client:
        await login(other_client, "manager1")
        resp = await other_client.post(f"/api/expenses/{expense_id}/duplicate")
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_duplicate_expense_not_found(client):
    await login(client, "tech1")
    resp = await client.post("/api/expenses/999999/duplicate")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_fx_service_zero_rate_value_error():
    from unittest.mock import patch

    import pytest

    from xpenses.services.fx_service import get_rate

    with patch("xpenses.services.fx_service._fetch_frankfurter", return_value=0.0):
        with patch("xpenses.services.fx_service._fetch_fallback", return_value=0.0):
            with pytest.raises(ValueError) as excinfo:
                await get_rate("USD", "2026-01-10")
            assert "Invalid rate returned" in str(excinfo.value)


@pytest.mark.asyncio
async def test_save_receipt_path_traversal():
    from io import BytesIO
    from unittest.mock import patch

    import pytest
    from fastapi import UploadFile

    from xpenses.services.storage import save_receipt

    # Upload file with allowed extension
    f = UploadFile(filename="test.png", file=BytesIO(b"dummy receipt data"))

    # Mock os.path.basename to return a traversing name to test the resolver guard
    with patch("os.path.basename", return_value="../../../../../etc/passwd.png"):
        with pytest.raises(ValueError) as excinfo:
            await save_receipt(999, f)
        assert "Invalid target filepath" in str(excinfo.value)


@pytest.mark.asyncio
async def test_list_expenses_all_roles(client):
    # tech1 creates an expense
    await login(client, "tech1")
    await create_expense(client, amount=10.0, description="tech1 expense")

    # manager1 creates an expense
    async with new_client() as manager_client:
        await login(manager_client, "manager1")
        await create_expense(manager_client, amount=20.0, description="manager1 expense")

        # manager1 requests GET /api/expenses?all=true and should see both expenses
        resp = await manager_client.get("/api/expenses?all=true")
        assert resp.status_code == 200
        expenses = resp.json()
        descriptions = [e["description"] for e in expenses]
        assert "tech1 expense" in descriptions
        assert "manager1 expense" in descriptions

    # tech1 requests GET /api/expenses?all=true and should only see their own expense
    resp = await client.get("/api/expenses?all=true")
    assert resp.status_code == 200
    expenses = resp.json()
    descriptions = [e["description"] for e in expenses]
    assert "tech1 expense" in descriptions
    assert "manager1 expense" not in descriptions

