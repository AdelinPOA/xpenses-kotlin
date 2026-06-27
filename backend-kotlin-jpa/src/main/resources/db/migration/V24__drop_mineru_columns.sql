ALTER TABLE ocr_comparisons
    DROP COLUMN IF EXISTS mineru_amount,
    DROP COLUMN IF EXISTS mineru_date,
    DROP COLUMN IF EXISTS mineru_merchant,
    DROP COLUMN IF EXISTS mineru_category_id,
    DROP COLUMN IF EXISTS mineru_error;
