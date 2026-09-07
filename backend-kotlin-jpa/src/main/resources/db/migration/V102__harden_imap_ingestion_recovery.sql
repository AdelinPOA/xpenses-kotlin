ALTER TABLE imap_ingestion_messages
    ADD COLUMN claim_token UUID,
    ADD COLUMN next_attempt_at TIMESTAMPTZ,
    ADD COLUMN expense_report_id INTEGER,
    ADD COLUMN acknowledgement_status TEXT NOT NULL DEFAULT 'NONE',
    ADD COLUMN acknowledgement_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN acknowledgement_claim_token UUID,
    ADD COLUMN acknowledgement_claimed_at TIMESTAMPTZ,
    ADD COLUMN acknowledgement_next_attempt_at TIMESTAMPTZ,
    ADD COLUMN acknowledged_at TIMESTAMPTZ,
    ADD COLUMN rejection_reason TEXT;

UPDATE imap_ingestion_messages
   SET acknowledgement_status = 'CONFIRMED',
       acknowledged_at = COALESCE(processed_at, NOW())
 WHERE status = 'PROCESSED';

CREATE INDEX idx_imap_ingestion_due
    ON imap_ingestion_messages(status, next_attempt_at, claimed_at);

CREATE INDEX idx_imap_ingestion_ack_due
    ON imap_ingestion_messages(acknowledgement_status, acknowledgement_next_attempt_at, acknowledgement_claimed_at);
