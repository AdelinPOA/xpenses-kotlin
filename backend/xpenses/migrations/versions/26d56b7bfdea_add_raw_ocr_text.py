"""add_raw_ocr_text

Revision ID: 26d56b7bfdea
Revises: a078be00200b
Create Date: 2026-06-13 04:51:07.801425

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '26d56b7bfdea'
down_revision: Union[str, None] = 'a078be00200b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE expenses ADD COLUMN raw_ocr_text TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE expenses DROP COLUMN IF EXISTS raw_ocr_text;")
