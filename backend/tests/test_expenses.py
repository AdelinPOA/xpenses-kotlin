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
