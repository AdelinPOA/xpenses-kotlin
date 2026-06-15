CREATE TABLE ocr_comparisons (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
    receipt_filename VARCHAR(255),
    gemini_amount NUMERIC(12, 2),
    gemini_date VARCHAR(50),
    gemini_merchant VARCHAR(255),
    gemini_category_id INTEGER,
    easyocr_amount NUMERIC(12, 2),
    easyocr_date VARCHAR(50),
    easyocr_merchant VARCHAR(255),
    easyocr_category_id INTEGER,
    mineru_amount NUMERIC(12, 2),
    mineru_date VARCHAR(50),
    mineru_merchant VARCHAR(255),
    mineru_category_id INTEGER,
    provider VARCHAR(50) DEFAULT 'gemini',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
