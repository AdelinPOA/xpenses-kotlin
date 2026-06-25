-- Fix M20: Change deleted_at from TIMESTAMP (no time zone) to TIMESTAMPTZ
-- to be consistent with Instant fields and TIMESTAMPTZ elsewhere in the schema.
-- V13 added these as TIMESTAMP (no time zone), causing potential offset drift.

ALTER TABLE expenses ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';
ALTER TABLE expense_reports ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';
ALTER TABLE receipts ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';
