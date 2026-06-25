-- V20: Convert all monetary DOUBLE PRECISION columns to NUMERIC
-- for proper decimal precision without floating-point rounding errors.
-- Columns that are already NUMERIC (tax_amount, tax_rate, tax_amount_eur) are left untouched.
-- distance_km in mileage_records is a measurement, not money, and stays DOUBLE PRECISION.

BEGIN;

-- Drop CHECK constraints that reference the columns we're altering
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_amount_original;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_amount_eur;
ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS chk_reports_total_amount;
ALTER TABLE advance_payments DROP CONSTRAINT IF EXISTS chk_advances_amount_original;
ALTER TABLE advance_payments DROP CONSTRAINT IF EXISTS chk_advances_amount_eur;
ALTER TABLE fx_rates DROP CONSTRAINT IF EXISTS chk_fx_rate_positive;

-- categories
ALTER TABLE categories ALTER COLUMN limit_amount TYPE NUMERIC USING limit_amount::numeric;

-- expense_reports
ALTER TABLE expense_reports ALTER COLUMN total_amount TYPE NUMERIC USING total_amount::numeric;

-- expenses (only the monetary columns; tax fields were already NUMERIC)
ALTER TABLE expenses ALTER COLUMN amount_original TYPE NUMERIC USING amount_original::numeric;
ALTER TABLE expenses ALTER COLUMN amount_eur TYPE NUMERIC USING amount_eur::numeric;
ALTER TABLE expenses ALTER COLUMN fx_rate TYPE NUMERIC USING fx_rate::numeric;

-- fx_rates
ALTER TABLE fx_rates ALTER COLUMN rate TYPE NUMERIC USING rate::numeric;

-- advance_payments
ALTER TABLE advance_payments ALTER COLUMN amount_original TYPE NUMERIC USING amount_original::numeric;
ALTER TABLE advance_payments ALTER COLUMN amount_eur TYPE NUMERIC USING amount_eur::numeric;
ALTER TABLE advance_payments ALTER COLUMN fx_rate TYPE NUMERIC USING fx_rate::numeric;
ALTER TABLE advance_payments ALTER COLUMN requested_amount TYPE NUMERIC USING requested_amount::numeric;

-- mileage_records (all monetary; distance_km stays DOUBLE PRECISION)
ALTER TABLE mileage_records ALTER COLUMN rate_before_tax TYPE NUMERIC USING rate_before_tax::numeric;
ALTER TABLE mileage_records ALTER COLUMN rate_after_tax TYPE NUMERIC USING rate_after_tax::numeric;
ALTER TABLE mileage_records ALTER COLUMN amount_before_tax TYPE NUMERIC USING amount_before_tax::numeric;
ALTER TABLE mileage_records ALTER COLUMN amount_eur TYPE NUMERIC USING amount_eur::numeric;

-- Recreate CHECK constraints
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount_original CHECK (amount_original >= 0);
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount_eur CHECK (amount_eur >= 0);
ALTER TABLE expense_reports ADD CONSTRAINT chk_reports_total_amount CHECK (total_amount >= 0);
ALTER TABLE advance_payments ADD CONSTRAINT chk_advances_amount_original CHECK (amount_original >= 0);
ALTER TABLE advance_payments ADD CONSTRAINT chk_advances_amount_eur CHECK (amount_eur >= 0);
ALTER TABLE fx_rates ADD CONSTRAINT chk_fx_rate_positive CHECK (rate > 0);

END;
