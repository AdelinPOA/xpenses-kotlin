CREATE TABLE IF NOT EXISTS fuel_prices (
    id SERIAL PRIMARY KEY,
    fuel_type VARCHAR(20) NOT NULL,
    price_date VARCHAR(10) NOT NULL,
    source_date DATE NOT NULL,
    source VARCHAR(32) NOT NULL,
    price_ron_per_liter NUMERIC(10, 4) NOT NULL,
    station_count INTEGER,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fuel_prices_type_date UNIQUE (fuel_type, price_date),
    CONSTRAINT chk_fuel_prices_nonnegative CHECK (price_ron_per_liter >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fuel_prices_fetched_at ON fuel_prices (fetched_at DESC);

ALTER TABLE mileage_records
    ADD COLUMN IF NOT EXISTS fuel_price_source VARCHAR(32);
