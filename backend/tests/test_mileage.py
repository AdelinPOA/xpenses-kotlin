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
    assert rec["rate_before_tax"] == 0.60
    assert rec["rate_after_tax"] == 0.40
    assert rec["amount_before_tax"] == 36.0
    assert rec["amount_eur"] == 24.0
    assert rec["report_id"] == report["id"]
    assert "start_time" in rec
    assert "end_time" in rec
    assert rec["duration_minutes"] == 90.0


@pytest.mark.asyncio
async def test_list_mileage(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_mileage(
        client, report["id"],
        start_time="2026-01-05T08:00:00Z", end_time="2026-01-05T09:00:00Z",
    )
    await create_mileage(
        client, report["id"],
        start_time="2026-01-15T10:00:00Z", end_time="2026-01-15T11:30:00Z",
    )

    resp = await client.get(f"/api/reports/{report['id']}/mileage")
    assert resp.status_code == 200
    records = resp.json()
    assert len(records) == 2
    assert records[0]["start_time"] < records[1]["start_time"]


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
    assert updated["amount_before_tax"] == round(80.0 * 0.60, 2)
    assert updated["amount_eur"] == round(80.0 * 0.40, 2)


@pytest.mark.asyncio
async def test_update_mileage_times(client):
    await login(client, "tech1")
    report = await create_report(client)
    rec = await create_mileage(client, report["id"])

    resp = await client.patch(
        f"/api/reports/{report['id']}/mileage/{rec['id']}",
        json={"start_time": "2026-01-10T07:00:00Z", "end_time": "2026-01-10T10:00:00Z"},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["duration_minutes"] == 180.0


@pytest.mark.asyncio
async def test_invalid_time_range(client):
    await login(client, "tech1")
    report = await create_report(client)

    resp = await client.post(
        f"/api/reports/{report['id']}/mileage",
        json={
            "origin": "A", "destination": "B", "distance_km": 10,
            "start_time": "2026-01-10T10:00:00Z", "end_time": "2026-01-10T08:00:00Z",
        },
    )
    assert resp.status_code == 422


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
        json={
            "origin": "A", "destination": "B", "distance_km": 10,
            "start_time": "2026-01-10T08:00:00Z",
            "end_time": "2026-01-10T09:00:00Z",
        },
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
            json={
                "origin": "A", "destination": "B", "distance_km": 10,
                "start_time": "2026-01-10T08:00:00Z",
                "end_time": "2026-01-10T09:00:00Z",
            },
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_report_total_includes_mileage(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_expense(client, amount=100.0, currency="EUR")
    await create_mileage(client, report["id"], distance_km=100.0)

    resp = await client.get(f"/api/reports/{report['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_mileage_eur"] == round(100.0 * 0.40, 2)
    assert len(data["mileage_records"]) == 1
