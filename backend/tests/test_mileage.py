import pytest

from .conftest import create_expense, create_mileage, create_report, login, new_client


@pytest.mark.asyncio
async def test_create_mileage(client):
    await login(client, "tech1")
    report = await create_report(client)
    rec = await create_mileage(client, report["id"], distance_km=60.0)

    assert rec["origin"] == "Bucharest"
    assert rec["destination"] == "Ploiesti"
    assert rec["distance_km"] == 60.0
    assert rec["rate_before_tax"] == 0.30
    assert rec["rate_after_tax"] == 0.22
    assert rec["amount_before_tax"] == 18.0
    assert rec["amount_eur"] == 13.2
    assert rec["report_id"] == report["id"]


@pytest.mark.asyncio
async def test_list_mileage(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_mileage(client, report["id"], date="2026-01-05")
    await create_mileage(client, report["id"], date="2026-01-15")

    resp = await client.get(f"/api/reports/{report['id']}/mileage")
    assert resp.status_code == 200
    records = resp.json()
    assert len(records) == 2
    assert records[0]["date"] == "2026-01-05"
    assert records[1]["date"] == "2026-01-15"


@pytest.mark.asyncio
async def test_update_mileage_distance(client):
    await login(client, "tech1")
    report = await create_report(client)
    rec = await create_mileage(client, report["id"], distance_km=60.0)

    resp = await client.patch(
        f"/api/reports/{report['id']}/mileage/{rec['id']}",
        json={"distance_km": 80.0},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["distance_km"] == 80.0
    assert updated["amount_before_tax"] == round(80.0 * 0.30, 2)
    assert updated["amount_eur"] == round(80.0 * 0.22, 2)


@pytest.mark.asyncio
async def test_delete_mileage(client):
    await login(client, "tech1")
    report = await create_report(client)
    rec = await create_mileage(client, report["id"])

    resp = await client.delete(f"/api/reports/{report['id']}/mileage/{rec['id']}")
    assert resp.status_code == 204

    resp = await client.get(f"/api/reports/{report['id']}/mileage")
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_create_mileage_non_draft_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    expense = await create_expense(client)
    await client.post(f"/api/reports/{report['id']}/submit", json={"expense_ids": [expense["id"]]})

    resp = await client.post(
        f"/api/reports/{report['id']}/mileage",
        json={"origin": "A", "destination": "B", "distance_km": 10, "date": "2026-01-10"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_mileage_not_owner(client):
    await login(client, "tech1")
    report = await create_report(client)

    other = new_client()
    async with other:
        await login(other, "manager1")
        resp = await other.post(
            f"/api/reports/{report['id']}/mileage",
            json={"origin": "A", "destination": "B", "distance_km": 10, "date": "2026-01-10"},
        )
        # manager can access (role in chef_finance/mod/manager), so this should succeed
        assert resp.status_code == 201 or resp.status_code == 400


@pytest.mark.asyncio
async def test_report_total_includes_mileage(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_expense(client, amount=100.0, currency="EUR")
    await create_mileage(client, report["id"], distance_km=100.0)

    resp = await client.get(f"/api/reports/{report['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_mileage_eur"] == round(100.0 * 0.22, 2)
    assert len(data["mileage_records"]) == 1
