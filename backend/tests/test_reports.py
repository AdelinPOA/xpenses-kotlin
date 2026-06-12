"""Tests for the /api/reports endpoints covering the full report lifecycle."""

import pytest

from tests.conftest import create_expense, create_report, login, new_client


@pytest.mark.asyncio
async def test_create_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    assert report["status"] == "draft"
    assert report["title"] == "Test Report"
    assert report["expenses"] == []


@pytest.mark.asyncio
async def test_list_reports_own_only(client):
    await login(client, "tech1")
    await create_report(client, title="Tech1 Report")

    async with new_client() as manager_client:
        await login(manager_client, "manager1")
        resp = await manager_client.get("/api/reports")
        assert resp.status_code == 200
        ids_seen = [r["title"] for r in resp.json()]
        assert "Tech1 Report" not in ids_seen


@pytest.mark.asyncio
async def test_privileged_sees_all_reports_with_param(client):
    await login(client, "tech1")
    await create_report(client, title="Tech1 Private Report")

    async with new_client() as cfo_client:
        await login(cfo_client, "cfo1")
        # By default, CFO sees only their own (empty)
        resp = await cfo_client.get("/api/reports")
        assert resp.status_code == 200
        assert "Tech1 Private Report" not in [r["title"] for r in resp.json()]

        # With all=true, CFO sees everything
        resp = await cfo_client.get("/api/reports?all=true")
        assert resp.status_code == 200
        titles = [r["title"] for r in resp.json()]
        assert "Tech1 Private Report" in titles


@pytest.mark.asyncio
async def test_update_draft_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    report_id = report["id"]

    resp = await client.patch(
        f"/api/reports/{report_id}", json={"title": "Updated Title"}
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


@pytest.mark.asyncio
async def test_cannot_update_submitted_report(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client)
    report_id = report["id"]

    await client.post(
        f"/api/reports/{report_id}/attach",
        json={"expense_ids": [expense["id"]]},
    )
    submit_resp = await client.post(f"/api/reports/{report_id}/submit")
    assert submit_resp.status_code == 200

    resp = await client.patch(
        f"/api/reports/{report_id}", json={"title": "Should Fail"}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_delete_draft_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    report_id = report["id"]

    resp = await client.delete(f"/api/reports/{report_id}")
    assert resp.status_code == 204

    get_resp = await client.get(f"/api/reports/{report_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_cannot_delete_submitted_report(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client)
    report_id = report["id"]

    await client.post(
        f"/api/reports/{report_id}/attach",
        json={"expense_ids": [expense["id"]]},
    )
    await client.post(f"/api/reports/{report_id}/submit")

    resp = await client.delete(f"/api/reports/{report_id}")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_full_lifecycle_draft_to_paid(client):
    await login(client, "tech1")
    expense = await create_expense(client, amount=120.0)
    report = await create_report(client)
    report_id = report["id"]

    attach_resp = await client.post(
        f"/api/reports/{report_id}/attach",
        json={"expense_ids": [expense["id"]]},
    )
    assert attach_resp.status_code == 200
    assert len(attach_resp.json()["expenses"]) == 1

    submit_resp = await client.post(f"/api/reports/{report_id}/submit")
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "submitted"

    async with new_client() as manager_client:
        await login(manager_client, "manager1")
        approve_resp = await manager_client.post(
            f"/api/reports/{report_id}/approve"
        )
        assert approve_resp.status_code == 200
        assert approve_resp.json()["status"] == "approved"

    async with new_client() as cfo_client:
        await login(cfo_client, "cfo1")
        pay_resp = await cfo_client.post(
            f"/api/reports/{report_id}/pay"
        )
        assert pay_resp.status_code == 200
        assert pay_resp.json()["status"] == "paid"

    verify_resp = await client.get(f"/api/reports/{report_id}")
    assert verify_resp.status_code == 200
    data = verify_resp.json()
    assert data["status"] == "paid"
    assert all(e["status"] == "paid" for e in data["expenses"])


@pytest.mark.asyncio
async def test_submit_requires_expenses(client):
    await login(client, "tech1")
    report = await create_report(client)
    report_id = report["id"]

    resp = await client.post(f"/api/reports/{report_id}/submit")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_recall_submitted_report(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client)
    report_id = report["id"]

    await client.post(
        f"/api/reports/{report_id}/attach",
        json={"expense_ids": [expense["id"]]},
    )
    await client.post(f"/api/reports/{report_id}/submit")

    recall_resp = await client.post(f"/api/reports/{report_id}/recall")
    assert recall_resp.status_code == 200
    data = recall_resp.json()
    assert data["status"] == "draft"
    assert all(e["status"] == "draft" for e in data["expenses"])


@pytest.mark.asyncio
async def test_cannot_approve_own_report(client):
    async with new_client() as manager_client:
        await login(manager_client, "manager1")
        expense_resp = await manager_client.post(
            "/api/expenses",
            json={
                "amount": 50.0,
                "currency": "EUR",
                "date": "2026-01-15",
                "merchant": "Shop",
                "description": "Expense",
            },
        )
        assert expense_resp.status_code == 201
        expense_id = expense_resp.json()["id"]

        report_resp = await manager_client.post(
            "/api/reports",
            json={
                "title": "Manager Own Report",
                "date_from": "2026-01-01",
                "date_to": "2026-01-31",
            },
        )
        assert report_resp.status_code == 201
        report_id = report_resp.json()["id"]

        await manager_client.post(
            f"/api/reports/{report_id}/attach",
            json={"expense_ids": [expense_id]},
        )
        await manager_client.post(f"/api/reports/{report_id}/submit")

        approve_resp = await manager_client.post(
            f"/api/reports/{report_id}/approve"
        )
        assert approve_resp.status_code == 400


@pytest.mark.asyncio
async def test_reject_detaches_expenses(client, pool):
    await login(client, "tech1")
    expense = await create_expense(client)
    expense_id = expense["id"]
    report = await create_report(client)
    report_id = report["id"]

    await client.post(
        f"/api/reports/{report_id}/attach",
        json={"expense_ids": [expense_id]},
    )
    await client.post(f"/api/reports/{report_id}/submit")

    async with new_client() as manager_client:
        await login(manager_client, "manager1")
        reject_resp = await manager_client.post(
            f"/api/reports/{report_id}/reject",
            json={"reason": "Missing receipts"},
        )
        assert reject_resp.status_code == 200
        data = reject_resp.json()
        assert data["status"] == "rejected"
        assert data["expenses"] == []
        assert data["total_amount"] == 0.0

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT report_id, status FROM expenses WHERE id = $1",
            expense_id,
        )
        assert row["report_id"] is None
        assert row["status"] == "draft"


@pytest.mark.asyncio
async def test_cannot_pay_unapproved(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client)
    report_id = report["id"]

    await client.post(
        f"/api/reports/{report_id}/attach",
        json={"expense_ids": [expense["id"]]},
    )
    await client.post(f"/api/reports/{report_id}/submit")

    async with new_client() as cfo_client:
        await login(cfo_client, "cfo1")
        pay_resp = await cfo_client.post(
            f"/api/reports/{report_id}/pay"
        )
        assert pay_resp.status_code == 400
