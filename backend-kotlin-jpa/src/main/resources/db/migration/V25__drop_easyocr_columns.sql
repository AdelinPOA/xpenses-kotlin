ALTER TABLE ocr_comparisons
    DROP COLUMN IF EXISTS easyocr_amount,
    DROP COLUMN IF EXISTS easyocr_date,
    DROP COLUMN IF EXISTS easyocr_merchant,
    DROP COLUMN IF EXISTS easyocr_category_id,
    DROP COLUMN IF EXISTS easyocr_error;
