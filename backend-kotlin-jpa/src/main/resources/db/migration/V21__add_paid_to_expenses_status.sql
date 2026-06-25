-- V21: Add 'paid' to the expenses status CHECK constraint.
-- ReportService.payReport sets each attached expense to status='paid' when a report
-- is paid, but the V5 chk_expenses_status constraint only allowed
-- 'draft', 'submitted', 'approved', 'rejected' — so paying a report raised a CHECK
-- violation (HTTP 500) in production. (The expense_reports constraint already allows 'paid'.)

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_status;
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_status
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid'));
