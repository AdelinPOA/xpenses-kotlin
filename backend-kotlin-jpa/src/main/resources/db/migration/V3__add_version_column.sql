-- Add optimistic locking version column to expense_reports table
ALTER TABLE expense_reports ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
