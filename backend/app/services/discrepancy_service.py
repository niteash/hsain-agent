from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Product,
    StockDiscrepancy,
)

from app.services.stock_reconciliation import (
    build_stock_reconciliation,
)


def detect_stock_discrepancies(db: Session) -> dict:
    products = db.scalars(
        select(Product).order_by(Product.id)
    ).all()

    detected = []
    updated = []
    resolved = []
    skipped = []

    now = datetime.now(timezone.utc)

    try:
        for product in products:
            result = build_stock_reconciliation(
                db,
                product,
            )

            if result["status"] == "missing_opening_balance":
                skipped.append({
                    "product_id": product.id,
                    "product_name": product.name,
                    "reason": "Missing verified opening balance.",
                })
                continue

            existing = db.scalar(
                select(StockDiscrepancy).where(
                    StockDiscrepancy.active_product_id == product.id,
                    StockDiscrepancy.status == "open",
                )
            )

            if result["status"] == "reconciled":
                if existing:
                    existing.status = "resolved"
                    existing.active_product_id = None
                    existing.resolved_at = now
                    existing.resolution_notes = (
                        "Automatically resolved because stock "
                        "reconciliation now matches the ledger."
                    )
                    resolved.append(existing.id)

                continue

            if existing:
                existing.opening_balance = result["opening_balance"]
                existing.calculated_stock = result["calculated_stock"]
                existing.current_stock = result["current_stock"]
                existing.difference = result["difference"]
                existing.last_detected_at = now
                existing.occurrences += 1

                updated.append(existing.id)

            else:
                alert = StockDiscrepancy(
                    product_id=product.id,
                    active_product_id=product.id,
                    opening_balance=result["opening_balance"],
                    calculated_stock=result["calculated_stock"],
                    current_stock=result["current_stock"],
                    difference=result["difference"],
                    status="open",
                    occurrences=1,
                    first_detected_at=now,
                    last_detected_at=now,
                )

                db.add(alert)
                db.flush()

                detected.append(alert.id)

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {
        "message": "Stock discrepancy detection completed.",
        "detected_count": len(detected),
        "updated_count": len(updated),
        "resolved_count": len(resolved),
        "skipped_count": len(skipped),
        "detected_alert_ids": detected,
        "updated_alert_ids": updated,
        "resolved_alert_ids": resolved,
        "skipped": skipped,
    }