"""Create the original 13 application tables.

Revision ID: e60a2bfda5b9
Revises:
"""

from typing import Sequence, Union

from alembic import op

from migrations.legacy_baseline_models import Base as LegacyBase


revision: str = "e60a2bfda5b9"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the original historical database schema."""
    LegacyBase.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    """Drop the original historical database schema."""
    LegacyBase.metadata.drop_all(bind=op.get_bind())
