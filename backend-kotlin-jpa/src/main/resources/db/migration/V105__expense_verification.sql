ALTER TABLE expenses
    ADD COLUMN verification_state VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN last_verified_at TIMESTAMPTZ,
    ADD COLUMN last_verified_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE expenses
    ADD CONSTRAINT chk_expenses_verification_state
        CHECK (verification_state IN ('NOT_REQUIRED', 'PENDING', 'VERIFIED'));

CREATE INDEX idx_expenses_user_verification_state
    ON expenses (user_id, verification_state);

CREATE TABLE expense_review_operations (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    request_key VARCHAR(256) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    resulting_version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_expense_review_operations_key UNIQUE (user_id, request_key)
);
