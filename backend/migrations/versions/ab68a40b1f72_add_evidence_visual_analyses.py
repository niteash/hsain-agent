"""add evidence visual analyses

Revision ID: a41c9d7e2b60
Revises: 12e3d385e955
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a41c9d7e2b60"

down_revision: Union[str, Sequence[str], None] = "12e3d385e955"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evidence_visual_analyses",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),

        sa.Column(
            "evidence_id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "model",
            sa.String(length=100),
            nullable=False,
        ),

        sa.Column(
            "is_inventory_relevant",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),

        sa.Column(
            "verification_status",
            sa.String(length=30),
            nullable=False,
            server_default="pending",
        ),

        sa.Column(
            "analysis_json",
            sa.Text(),
            nullable=False,
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.ForeignKeyConstraint(
            ["evidence_id"],
            ["evidence_files.id"],
            name="fk_evidence_visual_analyses_evidence_id",
            ondelete="CASCADE",
        ),

        sa.UniqueConstraint(
            "evidence_id",
            name="uq_evidence_visual_analyses_evidence_id",
        ),
    )

    op.create_index(
    "ix_evidence_visual_analyses_evidence_id",
    "evidence_visual_analyses",
    ["evidence_id"],
    unique=False,
)


def downgrade() -> None:
    op.drop_index(
        "ix_evidence_visual_analyses_evidence_id",
        table_name="evidence_visual_analyses",
    )

    op.drop_table("evidence_visual_analyses")