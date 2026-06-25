-- Add version column for optimistic locking on financial entities
-- that use @SQLDelete with WHERE id=? AND version=?
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
