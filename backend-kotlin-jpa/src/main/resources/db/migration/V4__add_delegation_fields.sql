-- Add delegation email import fields to expense_reports table
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS kundenauftrag TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS auftragsart TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS positionstyp TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS technplatz_raw TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS technplatz_line BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS kunde_code TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS kunde_name TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS vorgang TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS arbeitsplatz TEXT;
ALTER TABLE expense_reports ADD COLUMN IF NOT EXISTS techniker TEXT;
