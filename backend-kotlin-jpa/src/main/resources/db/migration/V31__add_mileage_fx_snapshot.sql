-- V31: persist the EUR FX snapshot for mileage reimbursement rows.
-- Existing mileage rates are EUR/km; this adds attribution without changing
-- the historical amount_eur or any report totals.

BEGIN;

ALTER TABLE mileage_records
    ADD COLUMN amount_original NUMERIC,
    ADD COLUMN currency_original VARCHAR(3),
    ADD COLUMN fx_rate NUMERIC;

UPDATE mileage_records
SET amount_original = amount_eur,
    currency_original = 'EUR',
    fx_rate = 1;

ALTER TABLE mileage_records
    ALTER COLUMN amount_original SET NOT NULL,
    ALTER COLUMN currency_original SET NOT NULL,
    ALTER COLUMN fx_rate SET NOT NULL;

ALTER TABLE mileage_records
    ADD CONSTRAINT chk_mileage_amount_original_nonnegative CHECK (amount_original >= 0),
    ADD CONSTRAINT chk_mileage_fx_rate_positive CHECK (fx_rate > 0);

END;
