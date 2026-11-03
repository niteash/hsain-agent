from alembic import op
import sqlalchemy as sa


revision = "d2a79afba5e7"
down_revision = "a41c9d7e2b60"
branch_labels = None
depends_on = None

def upgrade() -> None:

    op.add_column(
        "evidence_visual_analyses",
        sa.Column(
            "analysis_revision",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )

    op.create_table(
        "visual_detection_reviews",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
        ),

        sa.Column(
            "evidence_id",
            sa.Integer(),
            sa.ForeignKey(
                "evidence_files.id",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),

        sa.Column(
            "analysis_revision",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "object_id",
            sa.String(100),
            nullable=False,
        ),

        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="pending",
        ),

        sa.Column(
            "actor",
            sa.String(120),
            nullable=True,
        ),

        sa.Column(
            "note",
            sa.Text(),
            nullable=False,
            server_default="",
        ),

        sa.Column(
            "detection_snapshot_json",
            sa.Text(),
            nullable=False,
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.UniqueConstraint(
            "evidence_id",
            "analysis_revision",
            "object_id",
            name="uq_visual_review_evidence_revision_object",
        ),

        sa.CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'needs_review')",
            name="ck_visual_detection_review_status",
        ),
    )

    op.create_index(
        "ix_visual_detection_reviews_evidence_id",
        "visual_detection_reviews",
        ["evidence_id"],
    )

    op.create_index(
        "ix_visual_detection_reviews_status",
        "visual_detection_reviews",
        ["status"],
    )

    op.create_table(
        "visual_detection_review_events",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
        ),

        sa.Column(
            "review_id",
            sa.Integer(),
            sa.ForeignKey(
                "visual_detection_reviews.id",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),

        sa.Column(
            "action",
            sa.String(40),
            nullable=False,
        ),

        sa.Column(
            "actor",
            sa.String(120),
            nullable=False,
        ),

        sa.Column(
            "previous_status",
            sa.String(30),
            nullable=True,
        ),

        sa.Column(
            "new_status",
            sa.String(30),
            nullable=False,
        ),

        sa.Column(
            "details_json",
            sa.Text(),
            nullable=False,
            server_default="{}",
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_visual_detection_review_events_review_id",
        "visual_detection_review_events",
        ["review_id"],
    )

    op.create_index(
        "ix_visual_detection_review_events_created_at",
        "visual_detection_review_events",
        ["created_at"],
    )


def downgrade() -> None:

    op.drop_index(
        "ix_visual_detection_review_events_created_at",
        table_name="visual_detection_review_events",
    )

    op.drop_index(
        "ix_visual_detection_review_events_review_id",
        table_name="visual_detection_review_events",
    )

    op.drop_table(
        "visual_detection_review_events",
    )

    op.drop_index(
        "ix_visual_detection_reviews_status",
        table_name="visual_detection_reviews",
    )

    op.drop_index(
        "ix_visual_detection_reviews_evidence_id",
        table_name="visual_detection_reviews",
    )

    op.drop_table(
        "visual_detection_reviews",
    )

    op.drop_column(
        "evidence_visual_analyses",
        "analysis_revision",
    )