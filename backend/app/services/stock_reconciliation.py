from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Product,
    StockMovement,
    StockOpeningBalance,
)


def build_stock_reconciliation(
    db: Session,
    product: Product,
) -> dict:
    baseline = db.scalar(
        select(StockOpeningBalance).where(
            StockOpeningBalance.product_id == product.id
        )
    )

    if baseline is None:
        return {
            "product_id": product.id,
            "product_name": product.name,
            "sku": product.sku,
            "status": "missing_opening_balance",
            "opening_balance": None,
            "movement_count": None,
            "movement_total": None,
            "calculated_stock": None,
            "current_stock": product.current_stock,
            "difference": None,
        }

    movements = db.scalars(
        select(StockMovement).where(
            StockMovement.product_id == product.id,
            StockMovement.created_at >= baseline.effective_at,
        ).order_by(
            StockMovement.created_at,
            StockMovement.id,
        )
    ).all()

    movement_total = sum(
        movement.quantity_delta
        for movement in movements
    )

    calculated_stock = (
        baseline.opening_quantity + movement_total
    )

    difference = (
        product.current_stock - calculated_stock
    )

    return {
        "product_id": product.id,
        "product_name": product.name,
        "sku": product.sku,
        "status": (
            "reconciled"
            if difference == 0
            else "discrepancy"
        ),
        "opening_balance": baseline.opening_quantity,
        "effective_at": baseline.effective_at.isoformat(),
        "movement_count": len(movements),
        "movement_total": movement_total,
        "calculated_stock": calculated_stock,
        "current_stock": product.current_stock,
        "difference": difference,
    }


def reconcile_all_products(db: Session) -> dict:
    products = db.scalars(
        select(Product).order_by(Product.id)
    ).all()

    results = [
        build_stock_reconciliation(db, product)
        for product in products
    ]

    return {
        "total_products": len(results),
        "reconciled": sum(
            item["status"] == "reconciled"
            for item in results
        ),
        "discrepancies": sum(
            item["status"] == "discrepancy"
            for item in results
        ),
        "missing_opening_balances": sum(
            item["status"] == "missing_opening_balance"
            for item in results
        ),
        "items": results,
    }