from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Investigation, Product


def get_or_create_product(
    db: Session,
    name: str,
    initial_stock: int,
) -> Product:
    product = db.scalar(
        select(Product).where(Product.name == name)
    )

    if product is None:
        product = Product(
            name=name,
            current_stock=initial_stock,
        )
        db.add(product)
        db.flush()

    return product


def save_investigation(
    db: Session,
    product_id: int,
    expected_stock: int,
    physical_stock: int,
    units_sold: int,
    expected_remaining_stock: int,
    discrepancy: int,
    status: str,
    investigation: str,
    recommended_action: str,
    evidence_notes: str,
) -> Investigation:
    record = Investigation(
        product_id=product_id,
        expected_stock=expected_stock,
        physical_stock=physical_stock,
        units_sold=units_sold,
        expected_remaining_stock=expected_remaining_stock,
        discrepancy=discrepancy,
        status=status,
        investigation=investigation,
        recommended_action=recommended_action,
        evidence_notes=evidence_notes,
    )

    db.add(record)
    db.flush()

    return record
