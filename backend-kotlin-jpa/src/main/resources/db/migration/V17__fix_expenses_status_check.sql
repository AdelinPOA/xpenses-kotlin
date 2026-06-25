-- Fix the status CHECK constraint on expenses table to include 'paid' status.
-- The existing CHECK constraint ensures only valid status transitions,
-- but 'paid' was missing from the allowed list.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid', 'cancelled'));
