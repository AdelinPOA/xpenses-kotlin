-- Add @Version optimistic locking columns to financial entities
-- for database-level conflict detection
ALTER TABLE advance_payments ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mileage_records ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;

-- Add token_version column for H5 token invalidation on password change
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
