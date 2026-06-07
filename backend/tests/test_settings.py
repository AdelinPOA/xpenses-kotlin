import pytest

from .conftest import create_mileage, create_report, login


@pytest.mark.asyncio
async def test_get_mileage_rates(client):
    await login(client, "tech1")
    resp = await client.get("/api/settings/mileage-rates")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mileage_rate_before_tax"] == 0.60
    assert data["mileage_rate_after_tax"] == 0.40


@pytest.mark.asyncio
async def test_update_mileage_rates_cfo(client):
    await login(client, "cfo1")
    resp = await client.patch(
        "/api/settings/mileage-rates",
        json={"mileage_rate_before_tax": 0.75, "mileage_rate_after_tax": 0.50},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mileage_rate_before_tax"] == 0.75
    assert data["mileage_rate_after_tax"] == 0.50


@pytest.mark.asyncio
async def test_update_mileage_rates_forbidden(client):
    await login(client, "tech1")
    resp = await client.patch(
        "/api/settings/mileage-rates",
        json={"mileage_rate_before_tax": 0.75},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_rates_negative_rejected(client):
    await login(client, "cfo1")
    resp = await client.patch(
        "/api/settings/mileage-rates",
        json={"mileage_rate_before_tax": -0.10},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_mileage_uses_db_rates(client):
    await login(client, "cfo1")
    await client.patch(
        "/api/settings/mileage-rates",
        json={"mileage_rate_before_tax": 0.80, "mileage_rate_after_tax": 0.55},
    )

    await login(client, "tech1")
    report = await create_report(client)
    rec = await create_mileage(client, report["id"], distance_km=100.0)

    assert rec["rate_before_tax"] == 0.80
    assert rec["rate_after_tax"] == 0.55
    assert rec["amount_before_tax"] == 80.0
    assert rec["amount_eur"] == 55.0
