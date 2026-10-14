"""add product features

Revision ID: 4d91b7c2e6a3
Revises: 90c731ab3d12
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4d91b7c2e6a3"
down_revision: Union[str, Sequence[str], None] = "90c731ab3d12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("features", sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "features")
