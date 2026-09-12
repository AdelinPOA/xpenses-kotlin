ALTER TABLE ocr_jobs
    ADD COLUMN stage VARCHAR(20) NOT NULL DEFAULT 'OCR',
    ADD COLUMN lease_token VARCHAR(128),
    ADD COLUMN lease_until TIMESTAMP WITH TIME ZONE,
    ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN next_attempt_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN source_path VARCHAR(1024),
    ADD COLUMN source_content_type VARCHAR(255),
    ADD COLUMN source_size_bytes BIGINT,
    ADD COLUMN source_sha256 VARCHAR(64),
    ADD COLUMN error_code VARCHAR(100),
    ADD COLUMN expense_id INTEGER,
    ADD COLUMN receipt_id INTEGER,
    ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN legacy_status VARCHAR(50),
    ADD COLUMN unrecoverable_reason VARCHAR(100);

-- Existing asynchronous jobs received their bytes only in the worker call.
-- They cannot be resumed safely after a restart, so quarantine them rather
-- than inventing a source or retrying with a different input.
UPDATE ocr_jobs
SET legacy_status = status,
    status = 'UNRECOVERABLE',
    unrecoverable_reason = 'legacy_source_missing',
    stage = 'OCR',
    lease_token = NULL,
    lease_until = NULL,
    updated_at = CURRENT_TIMESTAMP;

ALTER TABLE ocr_jobs
    ALTER COLUMN status SET DEFAULT 'PENDING';

ALTER TABLE ocr_jobs
    ADD CONSTRAINT ocr_jobs_stage_check
        CHECK (stage IN ('OCR', 'EXPENSE', 'RECEIPT')),
    ADD CONSTRAINT ocr_jobs_status_check
        CHECK (status IN (
            'PENDING', 'PROCESSING', 'RETRY_WAIT', 'PAUSED',
            'PERMANENT_FAILURE', 'CANCELLED', 'COMPLETED', 'EXPIRED',
            'UNRECOVERABLE'
        )),
    ADD CONSTRAINT ocr_jobs_attempt_count_nonnegative_check
        CHECK (attempt_count >= 0),
    ADD CONSTRAINT ocr_jobs_expense_fk
        FOREIGN KEY (expense_id) REFERENCES expenses(id),
    ADD CONSTRAINT ocr_jobs_receipt_fk
        FOREIGN KEY (receipt_id) REFERENCES receipts(id);

CREATE INDEX idx_ocr_jobs_claimable
    ON ocr_jobs (status, next_attempt_at);

CREATE INDEX idx_ocr_jobs_lease_expiry
    ON ocr_jobs (lease_until);

CREATE INDEX idx_ocr_jobs_user_status
    ON ocr_jobs (user_id, status);
