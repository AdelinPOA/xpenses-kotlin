import pytest

from .conftest import create_advance, create_expense, create_report, login, new_client


@pytest.mark.asyncio
async def test_create_advance_eur(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=200.0, currency="EUR")

    assert adv["amount_original"] == 200.0
    assert adv["currency_original"] == "EUR"
    assert adv["amount_eur"] == 200.0
    assert adv["fx_rate"] == 1.0
    assert adv["report_id"] == report["id"]
    assert adv["description"] == "Cash advance"
    assert adv["status"] == "paid"


@pytest.mark.asyncio
async def test_list_advances(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_advance(client, report["id"], amount=100.0, date="2026-01-05")
    await create_advance(client, report["id"], amount=200.0, date="2026-01-15")

    resp = await client.get(f"/api/reports/{report['id']}/advances")
    assert resp.status_code == 200
    advances = resp.json()
    assert len(advances) == 2
    assert advances[0]["date"] == "2026-01-05"
    assert advances[1]["date"] == "2026-01-15"


@pytest.mark.asyncio
async def test_update_advance(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=100.0)

    resp = await client.patch(
        f"/api/reports/{report['id']}/advances/{adv['id']}",
        json={"amount": 300.0, "description": "Updated advance"},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["amount_original"] == 300.0
    assert updated["amount_eur"] == 300.0
    assert updated["description"] == "Updated advance"


@pytest.mark.asyncio
async def test_update_advance_not_owner(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=100.0)

    other = new_client()
    async with other:
        await login(other, "manager1")
        resp = await other.patch(
            f"/api/reports/{report['id']}/advances/{adv['id']}",
            json={"amount": 300.0, "description": "Attempted update"},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_advance(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"])

    resp = await client.delete(f"/api/reports/{report['id']}/advances/{adv['id']}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/reports/{report['id']}/advances")
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_cannot_add_advance_to_submitted_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    expense = await create_expense(client)
    await client.post(f"/api/reports/{report['id']}/submit", json={"expense_ids": [expense["id"]]})

    resp = await client.post(
        f"/api/reports/{report['id']}/advances",
        json={"amount": 100.0, "currency": "EUR", "date": "2026-01-10"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_cannot_modify_advance_on_submitted_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"])
    expense = await create_expense(client)
    await client.post(f"/api/reports/{report['id']}/submit", json={"expense_ids": [expense["id"]]})

    resp = await client.patch(
        f"/api/reports/{report['id']}/advances/{adv['id']}",
        json={"amount": 500.0},
    )
    assert resp.status_code == 400

    resp = await client.delete(f"/api/reports/{report['id']}/advances/{adv['id']}")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_advances_in_report_response(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_advance(client, report["id"], amount=50.0)
    await create_advance(client, report["id"], amount=30.0)

    resp = await client.get(f"/api/reports/{report['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["advances"]) == 2
    assert data["total_advances"] == 80.0


@pytest.mark.asyncio
async def test_report_total_reimbursable_calculation(client):
    await login(client, "tech1")
    report = await create_report(client)
    expense = await create_expense(client, amount=50.0)
    await client.post(f"/api/reports/{report['id']}/attach", json={"expense_ids": [expense["id"]]})
    await create_advance(client, report["id"], amount=30.0, advance_type="paid")
    await create_advance(client, report["id"], amount=500.0, advance_type="request")

    resp = await client.get(f"/api/reports/{report['id']}")
    data = resp.json()
    assert data["total_advances"] == 30.0
    assert data["daily_allowance"] == 1550.0
    assert data["total_reimbursable"] == 1570.0



@pytest.mark.asyncio
async def test_advances_deleted_with_report(client, pool):
    await login(client, "tech1")
    report = await create_report(client)
    await create_advance(client, report["id"])

    resp = await client.delete(f"/api/reports/{report['id']}")
    assert resp.status_code == 204

    async with pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM advance_payments WHERE report_id = $1",
            report["id"],
        )
        assert count == 0


@pytest.mark.asyncio
async def test_request_advance(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    assert adv["status"] == "requested"
    assert adv["requested_amount"] == 500.0
    assert adv["requested_currency"] == "EUR"
    assert adv["amount_eur"] == 0
    assert adv["amount_original"] == 0


@pytest.mark.asyncio
async def test_manager_pays_request(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    async with new_client() as mgr:
        await login(mgr, "manager1")
        resp = await mgr.post(
            f"/api/reports/{report['id']}/advances/{adv['id']}/pay",
            json={"amount": 400.0, "currency": "EUR", "date": "2026-01-12"},
        )
        assert resp.status_code == 200
        paid = resp.json()
        assert paid["status"] == "paid"
        assert paid["amount_original"] == 400.0
        assert paid["amount_eur"] == 400.0
        assert paid["paid_by"] is not None
        assert paid["paid_by_name"] is not None


@pytest.mark.asyncio
async def test_manager_rejects_request(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    async with new_client() as mgr:
        await login(mgr, "manager1")
        resp = await mgr.post(
            f"/api/reports/{report['id']}/advances/{adv['id']}/reject",
            json={"reason": "Too much"},
        )
        assert resp.status_code == 200
        rejected = resp.json()
        assert rejected["status"] == "rejected"
        assert rejected["rejected_by"] is not None


@pytest.mark.asyncio
async def test_manager_adds_paid_advance_to_other_report(client):
    await login(client, "tech1")
    report = await create_report(client)

    async with new_client() as mgr:
        await login(mgr, "manager1")
        resp = await mgr.post(
            f"/api/reports/{report['id']}/advances",
            json={"type": "paid", "amount": 200.0, "currency": "EUR", "date": "2026-01-10", "description": "Per diem"},
        )
        assert resp.status_code == 201
        adv = resp.json()
        assert adv["status"] == "paid"
        assert adv["paid_by"] is not None


@pytest.mark.asyncio
async def test_technician_cannot_pay_request(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    resp = await client.post(
        f"/api/reports/{report['id']}/advances/{adv['id']}/pay",
        json={"amount": 400.0, "currency": "EUR", "date": "2026-01-12"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_only_paid_advances_in_totals(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_advance(client, report["id"], amount=100.0, advance_type="paid")
    await create_advance(client, report["id"], amount=9999.0, advance_type="request")

    resp = await client.get(f"/api/reports/{report['id']}")
    data = resp.json()
    assert data["total_advances"] == 100.0


@pytest.mark.asyncio
async def test_global_pending_endpoint(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_advance(client, report["id"], amount=300.0, advance_type="request")
    await create_advance(client, report["id"], amount=100.0, advance_type="paid")

    # Technician cannot access global pending
    resp = await client.get("/api/advances/pending")
    assert resp.status_code == 403

    async with new_client() as mgr:
        await login(mgr, "manager1")
        resp = await mgr.get("/api/advances/pending")
        assert resp.status_code == 200
        pending = resp.json()
        assert len(pending) == 1
        assert pending[0]["requested_amount"] == 300.0
        assert pending[0]["user_display_name"] != ""
        assert pending[0]["report_title"] == "Test Report"


@pytest.mark.asyncio
async def test_technician_cancels_own_request(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    resp = await client.delete(f"/api/reports/{report['id']}/advances/{adv['id']}")
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_request_advance_on_submitted_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    expense = await create_expense(client)
    await client.post(f"/api/reports/{report['id']}/submit", json={"expense_ids": [expense["id"]]})

    adv = await create_advance(client, report["id"], amount=200.0, advance_type="request")
    assert adv["status"] == "requested"
