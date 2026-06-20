-- V12: Fix advance_payments CHECK constraint to include 'requested' status
-- The controller creates advances with status='requested' for type=request,
-- but the V5 constraint only allows 'paid', 'pending', 'rejected'.

ALTER TABLE advance_payments DROP CONSTRAINT IF EXISTS chk_advances_status;
ALTER TABLE advance_payments ADD CONSTRAINT chk_advances_status
    CHECK (status IN ('paid', 'pending', 'rejected', 'requested'));
