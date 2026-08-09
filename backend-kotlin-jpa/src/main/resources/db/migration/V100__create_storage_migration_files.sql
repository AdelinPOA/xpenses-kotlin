CREATE TABLE storage_migration_files (
    job_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (job_id, file_path)
);

CREATE INDEX idx_storage_migration_files_status
    ON storage_migration_files(job_id, status, updated_at);
