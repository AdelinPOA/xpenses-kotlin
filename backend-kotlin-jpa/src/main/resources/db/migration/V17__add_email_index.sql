-- Add index on users.email for findByEmail lookups used by EmailImportService
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
