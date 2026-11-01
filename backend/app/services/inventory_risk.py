from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    InventoryMovementProposal,
    Product,
    StockDiscrepancy,
    StockMovement,
    StockOpeningBalance,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def calculate_stock_risk(
    product: Product,
    db: Session,
) -> dict[str, Any]:

    score = 0
    factors = []
    recommendations = []

    # --------------------------------------------------------
    # 1. STOCK THRESHOLD RISK
    # --------------------------------------------------------

    stock = product.current_stock

    if stock <= 0:
        score += 70

        factors.append({
            "type": "out_of_stock",
            "severity": "critical",
            "points": 70,
            "description": "Product is currently out of stock.",
        })

        recommendations.append(
            "Replenish this product immediately."
        )

    elif (
        product.minimum_stock is not None
        and stock <= product.minimum_stock
    ):
        score += 30

        factors.append({
            "type": "critical_stock",
            "severity": "critical",
            "points": 30,
            "description": (
                f"Current stock ({stock}) is at or below "
                f"minimum stock ({product.minimum_stock})."
            ),
        })

        recommendations.append(
            "Prioritize replenishment."
        )

    elif (
        product.reorder_point is not None
        and stock <= product.reorder_point
    ):
        score += 20

        factors.append({
            "type": "low_stock",
            "severity": "high",
            "points": 20,
            "description": (
                f"Current stock ({stock}) is at or below "
                f"the reorder point ({product.reorder_point})."
            ),
        })

        recommendations.append(
            "Review replenishment requirements."
        )

    elif (
        product.maximum_stock is not None
        and stock > product.maximum_stock
    ):
        score += 8

        factors.append({
            "type": "overstocked",
            "severity": "low",
            "points": 8,
            "description": (
                f"Current stock ({stock}) exceeds "
                f"maximum stock ({product.maximum_stock})."
            ),
        })

        recommendations.append(
            "Review purchasing quantities and excess stock."
        )

    # --------------------------------------------------------
    # 2. OPEN DISCREPANCY RISK
    # --------------------------------------------------------

    discrepancy = db.scalar(
        select(StockDiscrepancy)
        .where(
            StockDiscrepancy.product_id == product.id,
            StockDiscrepancy.status == "open",
        )
        .order_by(
            StockDiscrepancy.last_detected_at.desc(),
            StockDiscrepancy.id.desc(),
        )
        .limit(1)
    )

    if discrepancy:

        discrepancy_points = 25

        recurrence_points = min(
            max(discrepancy.occurrences - 1, 0) * 5,
            15,
        )

        points = discrepancy_points + recurrence_points

        score += points

        factors.append({
            "type": "open_discrepancy",
            "severity": "critical",
            "points": points,
            "description": (
                f"An unresolved stock discrepancy exists. "
                f"Difference: {discrepancy.difference} units. "
                f"Detection occurrences: {discrepancy.occurrences}."
            ),
            "alert_id": discrepancy.id,
            "difference": discrepancy.difference,
            "occurrences": discrepancy.occurrences,
        })

        recommendations.append(
            "Investigate and verify the physical stock discrepancy."
        )

    # --------------------------------------------------------
    # 3. VERIFIED SALES VELOCITY
    # --------------------------------------------------------

    period_days = 30
    period_start = utc_now() - timedelta(days=period_days)

    sales_statement = (
        select(
            StockMovement,
            InventoryMovementProposal,
        )
        .join(
            InventoryMovementProposal,
            InventoryMovementProposal.stock_movement_id
            == StockMovement.id,
        )
        .where(
            StockMovement.product_id == product.id,
            InventoryMovementProposal.status == "approved",
            InventoryMovementProposal.movement_type == "sale",
            StockMovement.created_at >= period_start,
            StockMovement.quantity_delta < 0,
        )
    )

    approved_sales = db.execute(
        sales_statement
    ).all()

    units_sold = sum(
        abs(movement.quantity_delta)
        for movement, _ in approved_sales
    )

    average_daily_sales = units_sold / period_days

    days_of_cover = None

    if units_sold > 0:

        days_of_cover = stock / average_daily_sales

        if days_of_cover <= 3:
            points = 15
            severity = "critical"

        elif days_of_cover <= 7:
            points = 10
            severity = "high"

        elif days_of_cover <= 14:
            points = 5
            severity = "medium"

        else:
            points = 0
            severity = "low"

        if points:
            score += points

            factors.append({
                "type": "sales_velocity",
                "severity": severity,
                "points": points,
                "description": (
                    f"At the verified 30-day sales rate, "
                    f"available stock covers approximately "
                    f"{days_of_cover:.1f} days."
                ),
                "units_sold_30_days": units_sold,
                "average_daily_sales": round(
                    average_daily_sales,
                    2,
                ),
                "days_of_cover": round(days_of_cover, 1),
            })

            recommendations.append(
                "Review replenishment timing against recent sales."
            )

    else:

        factors.append({
            "type": "sales_data_unavailable",
            "severity": "informational",
            "points": 0,
            "description": (
                "No approved sales movements were recorded "
                "during the last 30 days. Actual sales velocity "
                "cannot be established from the available records."
            ),
        })

        recommendations.append(
            "Verify sales history before relying on sales-based "
            "replenishment calculations."
        )

    # --------------------------------------------------------
    # 4. DATA RELIABILITY
    # --------------------------------------------------------

    opening_balance = db.scalar(
        select(StockOpeningBalance).where(
            StockOpeningBalance.product_id == product.id
        )
    )

    has_opening_balance = opening_balance is not None
    has_sales_history = units_sold > 0

    if has_opening_balance and has_sales_history:
        data_confidence = "high"

    elif has_opening_balance or has_sales_history:
        data_confidence = "medium"

    else:
        data_confidence = "low"

    if not has_opening_balance:

        factors.append({
            "type": "missing_opening_balance",
            "severity": "warning",
            "points": 0,
            "description": (
                "No verified opening balance is recorded. "
                "Historical stock reconciliation is incomplete."
            ),
        })

        recommendations.append(
            "Record and verify an opening stock balance."
        )

    else:

        factors.append({
            "type": "opening_balance_available",
            "severity": "informational",
            "points": 0,
            "description": (
                "An opening stock balance is recorded. "
                "This supports historical stock reconciliation."
            ),
        })

    # --------------------------------------------------------
    # 5. FINAL RISK CLASSIFICATION
    # --------------------------------------------------------

    score = min(score, 100)

    if score >= 70:
        risk_level = "critical"

    elif score >= 45:
        risk_level = "high"

    elif score >= 20:
        risk_level = "medium"

    else:
        risk_level = "low"

    if not recommendations:
        recommendations.append(
            "Continue routine inventory monitoring."
        )

    # --------------------------------------------------------
    # 6. RESPONSE
    # --------------------------------------------------------

    return {
        "product_id": product.id,
        "product_name": product.name,
        "sku": product.sku,
        "current_stock": stock,

        "thresholds": {
            "minimum_stock": product.minimum_stock,
            "reorder_point": product.reorder_point,
            "maximum_stock": product.maximum_stock,
        },

        "risk_score": score,
        "risk_level": risk_level,

        "data_confidence": data_confidence,

        "data_quality": {
            "opening_balance_available": has_opening_balance,
            "verified_sales_available": has_sales_history,
            "sales_period_days": period_days,
        },

        "sales_velocity": {
            "period_days": period_days,
            "units_sold": units_sold,
            "average_daily_sales": round(
                average_daily_sales,
                2,
            ),
            "days_of_cover": (
                round(days_of_cover, 1)
                if days_of_cover is not None
                else None
            ),
        },

        "factors": factors,
        "recommendations": recommendations,
    }