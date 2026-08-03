CREATE TABLE ocr_result_cache (
    id SERIAL PRIMARY KEY,
    sha256 VARCHAR(64) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    contract_version VARCHAR(50) NOT NULL,
    result_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ocr_result_cache_identity UNIQUE (sha256, provider, model, contract_version)
);

CREATE INDEX idx_ocr_result_cache_last_used_at ON ocr_result_cache(last_used_at);
