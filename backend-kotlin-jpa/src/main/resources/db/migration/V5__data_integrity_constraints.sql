-- V5: Data integrity constraints, NOT NULL fixes, and missing indexes

-- ── CHECK constraints on status columns ──────────────────────────────────

ALTER TABLE expenses ADD CONSTRAINT chk_expenses_status
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'));

ALTER TABLE expense_reports ADD CONSTRAINT chk_reports_status
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid'));

ALTER TABLE advance_payments ADD CONSTRAINT chk_advances_status
    CHECK (status IN ('paid', 'pending', 'rejected'));

-- ── CHECK constraints on users ───────────────────────────────────────────

ALTER TABLE users ADD CONSTRAINT chk_users_role
    CHECK (role IN ('technician', 'manager', 'chef_finance', 'mod'));

ALTER TABLE users ADD CONSTRAINT chk_users_auth_source
    CHECK (auth_source IN ('local', 'ldap'));

-- ── CHECK constraints: non-negative amounts ──────────────────────────────

ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount_original
    CHECK (amount_original >= 0);

ALTER TABLE expenses ADD CONSTRAINT chk_expenses_amount_eur
    CHECK (amount_eur >= 0);

ALTER TABLE expense_reports ADD CONSTRAINT chk_reports_total_amount
    CHECK (total_amount >= 0);

ALTER TABLE advance_payments ADD CONSTRAINT chk_advances_amount_original
    CHECK (amount_original >= 0);

ALTER TABLE advance_payments ADD CONSTRAINT chk_advances_amount_eur
    CHECK (amount_eur >= 0);

ALTER TABLE mileage_records ADD CONSTRAINT chk_mileage_distance
    CHECK (distance_km >= 0);

-- ── CHECK constraints: positive FX rates ─────────────────────────────────

ALTER TABLE fx_rates ADD CONSTRAINT chk_fx_rate_positive
    CHECK (rate > 0);

-- ── NOT NULL fixes ────────────────────────────────────────────────────────

ALTER TABLE expense_reports ALTER COLUMN user_id SET NOT NULL;

-- ── Missing indexes on FK columns (not auto-indexed by PostgreSQL) ───────

CREATE INDEX IF NOT EXISTS idx_reports_approved_by ON expense_reports(approved_by);
CREATE INDEX IF NOT EXISTS idx_reports_rejected_by ON expense_reports(rejected_by);
CREATE INDEX IF NOT EXISTS idx_reports_signer_id ON expense_reports(signer_id);
CREATE INDEX IF NOT EXISTS idx_advances_paid_by ON advance_payments(paid_by);
CREATE INDEX IF NOT EXISTS idx_advances_rejected_by ON advance_payments(rejected_by);
CREATE INDEX IF NOT EXISTS idx_mileage_user ON mileage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_comp_expense ON ocr_comparisons(expense_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
