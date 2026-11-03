"""Add missing inventory schema objects.

Revision ID: f3a91c7d2e10
Revises: d2a79afba5e7
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "f3a91c7d2e10"
down_revision = "d2a79afba5e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # --------------------------------------------------------
    # PRODUCT STOCK CONFIGURATION
    # --------------------------------------------------------

    product_columns = {
        column["name"]
        for column in inspector.get_columns("products")
    }

    for column_name in (
        "minimum_stock",
        "reorder_point",
        "maximum_stock",
    ):
        if column_name not in product_columns:
            op.add_column(
                "products",
                sa.Column(column_name, sa.Integer(), nullable=True),
            )

    # --------------------------------------------------------
    # STOCK DISCREPANCY AUDIT LOG
    # --------------------------------------------------------

    if not inspector.has_table("stock_discrepancy_audit_logs"):
        op.create_table(
            "stock_discrepancy_audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "alert_id",
                sa.Integer(),
                sa.ForeignKey("stock_discrepancies.id"),
                nullable=False,
            ),
            sa.Column(
                "product_id",
                sa.Integer(),
                sa.ForeignKey("products.id"),
                nullable=False,
            ),
            sa.Column("action", sa.String(40), nullable=False),
            sa.Column(
                "actor",
                sa.String(120),
                nullable=False,
                server_default="system",
            ),
            sa.Column("previous_status", sa.String(30), nullable=True),
            sa.Column("new_status", sa.String(30), nullable=True),
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

    # --------------------------------------------------------
    # AUDIT LOG INDEXES
    # --------------------------------------------------------

    inspector = inspect(bind)

    existing_indexes = {
        index["name"]
        for index in inspector.get_indexes(
            "stock_discrepancy_audit_logs"
        )
    }

    indexes = {
        "ix_stock_discrepancy_audit_logs_alert_id": ["alert_id"],
        "ix_stock_discrepancy_audit_logs_product_id": ["product_id"],
        "ix_stock_discrepancy_audit_logs_action": ["action"],
        "ix_stock_discrepancy_audit_logs_created_at": ["created_at"],
    }

    for index_name, columns in indexes.items():
        if index_name not in existing_indexes:
            op.create_index(
                index_name,
                "stock_discrepancy_audit_logs",
                columns,
                unique=False,
            )


def downgrade() -> None:
    raise RuntimeError(
        "Revision f3a91c7d2e10 is intentionally irreversible. "
        "It reconciles potentially pre-existing schema objects. "
        "Do not remove these objects automatically because they "
        "may contain existing application data."
    )