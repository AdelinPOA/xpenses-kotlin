ALTER TABLE mileage_records
    ADD COLUMN IF NOT EXISTS fuel_consumption_l_per_100km NUMERIC,
    ADD COLUMN IF NOT EXISTS fuel_price_ron_per_liter NUMERIC,
    ADD COLUMN IF NOT EXISTS fuel_exchange_rate NUMERIC,
    ADD COLUMN IF NOT EXISTS fuel_cost_eur NUMERIC,
    ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS withholding_amount NUMERIC;
ALTER TABLE mileage_records
    ADD COLUMN IF NOT EXISTS pension_rate NUMERIC,
    ADD COLUMN IF NOT EXISTS health_rate NUMERIC,
    ADD COLUMN IF NOT EXISTS income_tax_rate NUMERIC,
    ADD COLUMN IF NOT EXISTS tax_deduction_eur NUMERIC;
