"""Correct visual analysis evidence index.

Revision ID: ad230947c6e9
Revises: f3a91c7d2e10
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


revision: str = "ad230947c6e9"
down_revision: Union[str, Sequence[str], None] = "f3a91c7d2e10"
branch_labels = None
depends_on = None


TABLE_NAME = "evidence_visual_analyses"
INDEX_NAME = "ix_evidence_visual_analyses_evidence_id"


def get_evidence_index():
    """Return the target index, if it exists."""
    bind = op.get_bind()
    inspector = inspect(bind)

    indexes = inspector.get_indexes(TABLE_NAME)

    return next(
        (
            index
            for index in indexes
            if index["name"] == INDEX_NAME
        ),
        None,
    )


def upgrade() -> None:
    """
    Ensure evidence_id has a non-unique index.

    Uniqueness is already enforced separately by:
    uq_evidence_visual_analyses_evidence_id.
    """
    index = get_evidence_index()

    if index is None:
        op.create_index(
            INDEX_NAME,
            TABLE_NAME,
            ["evidence_id"],
            unique=False,
        )
        return

    if index["unique"]:
        op.drop_index(
            INDEX_NAME,
            table_name=TABLE_NAME,
        )

        op.create_index(
            INDEX_NAME,
            TABLE_NAME,
            ["evidence_id"],
            unique=False,
        )


def downgrade() -> None:
    """
    Restore the unique index created by the historical migration.
    """
    index = get_evidence_index()

    if index is None:
        op.create_index(
            INDEX_NAME,
            TABLE_NAME,
            ["evidence_id"],
            unique=True,
        )
        return

    if not index["unique"]:
        op.drop_index(
            INDEX_NAME,
            table_name=TABLE_NAME,
        )

        op.create_index(
            INDEX_NAME,
            TABLE_NAME,
            ["evidence_id"],
            unique=True,
        )