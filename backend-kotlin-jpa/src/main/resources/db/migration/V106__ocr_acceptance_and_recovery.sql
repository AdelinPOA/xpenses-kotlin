ALTER TABLE ocr_jobs
    ADD COLUMN acceptance_key VARCHAR(256),
    ADD COLUMN acceptance_fingerprint VARCHAR(64),
    ADD COLUMN requested_report_id INTEGER,
    ADD COLUMN report_link_status VARCHAR(24) NOT NULL DEFAULT 'NOT_REQUESTED';

ALTER TABLE ocr_jobs
    ADD CONSTRAINT chk_ocr_jobs_acceptance_fingerprint
        CHECK ((acceptance_key IS NULL) = (acceptance_fingerprint IS NULL)),
    ADD CONSTRAINT chk_ocr_jobs_report_link_status
        CHECK (report_link_status IN ('NOT_REQUESTED', 'PENDING', 'LINKED', 'CONFLICT'));

CREATE UNIQUE INDEX uq_ocr_jobs_user_acceptance_key
    ON ocr_jobs (user_id, acceptance_key)
    WHERE acceptance_key IS NOT NULL;

CREATE TABLE ocr_job_action_operations (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES ocr_jobs(id) ON DELETE CASCADE,
    action VARCHAR(32) NOT NULL,
    request_key VARCHAR(256) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ocr_job_action_operations_key UNIQUE (user_id, job_id, action, request_key)
);
