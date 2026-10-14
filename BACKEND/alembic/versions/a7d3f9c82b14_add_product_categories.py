"""add product categories

Revision ID: a7d3f9c82b14
Revises: 4d91b7c2e6a3
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7d3f9c82b14"
down_revision: Union[str, Sequence[str], None] = "4d91b7c2e6a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("category", sa.String(length=80), nullable=True))
    op.create_index("ix_products_category", "products", ["category"])


def downgrade() -> None:
    op.drop_index("ix_products_category", table_name="products")
    op.drop_column("products", "category")
