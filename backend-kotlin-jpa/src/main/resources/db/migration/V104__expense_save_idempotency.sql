-- Retain successful save identities indefinitely: expiring a key permits duplicates
-- when a device replays an old, locally retained save. No resource FK: deleting an
-- Expense must not make the same request key create a replacement Expense.
CREATE TABLE expense_save_requests (
    user_id INTEGER NOT NULL REFERENCES users(id),
    operation VARCHAR(100) NOT NULL,
    request_key VARCHAR(300) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, operation, request_key)
);
