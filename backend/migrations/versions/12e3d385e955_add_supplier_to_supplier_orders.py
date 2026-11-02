"""add supplier to supplier orders

Revision ID: 12e3d385e955
Revises: 73138735a8ef
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "12e3d385e955"
down_revision: Union[str, Sequence[str], None] = "73138735a8ef"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("supplier_orders") as batch_op:
        batch_op.add_column(
            sa.Column("supplier_id", sa.Integer(), nullable=True)
        )

        batch_op.create_index(
            "ix_supplier_orders_supplier_id",
            ["supplier_id"],
            unique=False,
        )

        batch_op.create_foreign_key(
            "fk_supplier_orders_supplier_id_suppliers",
            "suppliers",
            ["supplier_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("supplier_orders") as batch_op:
        batch_op.drop_constraint(
            "fk_supplier_orders_supplier_id_suppliers",
            type_="foreignkey",
        )

        batch_op.drop_index("ix_supplier_orders_supplier_id")

        batch_op.drop_column("supplier_id")