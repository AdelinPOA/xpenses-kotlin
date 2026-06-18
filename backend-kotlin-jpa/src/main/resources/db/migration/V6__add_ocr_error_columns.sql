-- Add error tracking columns to ocr_comparisons
ALTER TABLE ocr_comparisons ADD COLUMN IF NOT EXISTS easyocr_error TEXT;
ALTER TABLE ocr_comparisons ADD COLUMN IF NOT EXISTS gemini_error TEXT;
ALTER TABLE ocr_comparisons ADD COLUMN IF NOT EXISTS mineru_error TEXT;
