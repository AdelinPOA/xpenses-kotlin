"""add_ocr_comparisons

Revision ID: 9bd9c851f299
Revises: 26d56b7bfdea
Create Date: 2026-06-13 04:51:17.075939

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9bd9c851f299'
down_revision: Union[str, None] = '26d56b7bfdea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
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
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ocr_comparisons CASCADE;")
