"""add background jobs and product search indexes

Revision ID: 90c731ab3d12
Revises: 6e1a98cbd312
Create Date: 2026-10-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "90c731ab3d12"
down_revision: Union[str, Sequence[str], None] = "6e1a98cbd312"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "background_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message", sa.String(length=255), nullable=False),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_background_jobs_owner_id", "background_jobs", ["owner_id"])
    op.create_index("ix_background_jobs_status", "background_jobs", ["status"])

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE INDEX ix_products_search_vector
        ON products USING GIN (
            to_tsvector(
                'english',
                coalesce(name, '') || ' ' || coalesce(description, '')
            )
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_products_name_trgm "
        "ON products USING GIN (lower(name) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_products_description_trgm "
        "ON products USING GIN (lower(description) gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_products_description_trgm")
    op.execute("DROP INDEX IF EXISTS ix_products_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_products_search_vector")
    op.drop_index("ix_background_jobs_status", table_name="background_jobs")
    op.drop_index("ix_background_jobs_owner_id", table_name="background_jobs")
    op.drop_table("background_jobs")
