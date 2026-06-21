-- Add sha256 hashing column to ocr_comparisons for duplicate detection and caching
ALTER TABLE ocr_comparisons ADD COLUMN IF NOT EXISTS sha256 VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_ocr_comparisons_sha256 ON ocr_comparisons(sha256);
