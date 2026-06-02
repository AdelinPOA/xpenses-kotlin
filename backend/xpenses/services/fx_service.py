import httpx

from ..database import get_pool

FRANKFURTER_URL = "https://api.frankfurter.dev/v1"
FALLBACK_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/{currency}.min.json"
FALLBACK_LATEST = "https://latest.currency-api.pages.dev/v1/currencies/{currency}.min.json"


async def _fetch_frankfurter(client: httpx.AsyncClient, currency: str, date: str) -> float | None:
    resp = await client.get(
        f"{FRANKFURTER_URL}/{date}",
        params={"from": currency, "to": "EUR"},
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()["rates"]["EUR"]


async def _fetch_fallback(client: httpx.AsyncClient, currency: str, date: str) -> float | None:
    cur_lower = currency.lower()
    url = FALLBACK_URL.format(date=date, currency=cur_lower)
    resp = await client.get(url)
    if resp.status_code == 404:
        resp = await client.get(
            FALLBACK_LATEST.format(currency=cur_lower)
        )
    if resp.status_code != 200:
        return None
    data = resp.json()
    rates = data.get(cur_lower, {})
    eur_rate = rates.get("eur")
    if eur_rate is None:
        return None
    return float(eur_rate)


async def get_rate(from_currency: str, date: str) -> float:
    from_currency = from_currency.upper().strip()
    if from_currency == "EUR":
        return 1.0

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT rate FROM fx_rates WHERE from_currency = $1 AND to_currency = 'EUR' AND rate_date = $2",
            from_currency, date,
        )
        if row:
            return row["rate"]

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            rate = None
            try:
                rate = await _fetch_frankfurter(client, from_currency, date)
            except httpx.HTTPError:
                pass

            if rate is None:
                try:
                    rate = await _fetch_fallback(client, from_currency, date)
                except httpx.HTTPError as e:
                    raise ValueError(f"Failed to fetch exchange rate from fallback: {e}")

        if rate is None:
            raise ValueError(f"Currency {from_currency} not supported by any exchange rate provider")

        await conn.execute(
            """INSERT INTO fx_rates (from_currency, to_currency, rate_date, rate)
               VALUES ($1, 'EUR', $2, $3)
               ON CONFLICT (from_currency, to_currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate""",
            from_currency, date, rate,
        )
        return rate
