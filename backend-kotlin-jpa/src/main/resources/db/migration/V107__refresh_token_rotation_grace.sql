ALTER TABLE refresh_tokens
    ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_rotated
    ON refresh_tokens(user_id, rotated_at);
