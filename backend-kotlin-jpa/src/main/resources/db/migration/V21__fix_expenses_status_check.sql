-- Fix C0: Add 'paid' to the expenses CHECK constraint.
-- Mirror of V12 which fixed the same issue for advance_payments.
-- In production, payReport() sets expense status to 'paid', which PostgreSQL rejects.

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS chk_expenses_status;
ALTER TABLE expenses ADD CONSTRAINT chk_expenses_status
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid'));
