from math import ceil
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Investigation,
    Product,
    SupplierOrder,
)
from app.services.inventory_risk import calculate_stock_risk


ACTIVE_ORDER_STATUSES = {
    "pending_approval",
    "simulated_ordered",
}

SALES_PERIOD_DAYS = 30


def calculate_reorder_recommendation(
    product: Product,
    db: Session,
    lead_time_days: int = 7,
    safety_buffer_days: int = 3,
    target_cover_days: int = 30,
) -> dict[str, Any]:

    stock = product.current_stock

    # --------------------------------------------------------
    # 1. EFFECTIVE PRODUCT PLANNING PARAMETERS
    # --------------------------------------------------------

    effective_lead_time_days = (
        product.lead_time_days
        if product.lead_time_days is not None
        else lead_time_days
    )

    effective_safety_buffer_days = (
        product.safety_buffer_days
        if product.safety_buffer_days is not None
        else safety_buffer_days
    )

    lead_time_source = (
        "product_configuration"
        if product.lead_time_days is not None
        else "api_default"
    )

    safety_buffer_source = (
        "product_configuration"
        if product.safety_buffer_days is not None
        else "api_default"
    )

    # --------------------------------------------------------
    # 2. VERIFIED SALES DATA
    # --------------------------------------------------------

    risk = calculate_stock_risk(product, db)
    sales = risk["sales_velocity"]

    units_sold = sales["units_sold"]

    # Use exact velocity internally.
    # The risk service's displayed value may be rounded.
    average_daily_sales_exact = (
        units_sold / SALES_PERIOD_DAYS
    )

    # Keep the existing risk-service value for display compatibility.
    average_daily_sales = round(
        average_daily_sales_exact,
        2,
    )

    days_of_cover = sales["days_of_cover"]

    data_quality = risk.get("data_quality", {})

    verified_sales_available = data_quality.get(
        "verified_sales_available",
        units_sold > 0,
    )

    # --------------------------------------------------------
    # 3. REORDER POINT CALCULATION
    # --------------------------------------------------------

    reorder_lead_time = (
        effective_lead_time_days
        + effective_safety_buffer_days
    )

    calculated_reorder_point = None

    if (
        verified_sales_available
        and average_daily_sales_exact > 0
    ):
        calculated_reorder_point = ceil(
            average_daily_sales_exact * reorder_lead_time
        )

    configured_reorder_point = product.reorder_point

    if configured_reorder_point is not None:
        effective_reorder_point = configured_reorder_point
        reorder_point_source = "configured"

    elif calculated_reorder_point is not None:
        effective_reorder_point = calculated_reorder_point
        reorder_point_source = "calculated_from_verified_sales"

    else:
        effective_reorder_point = None
        reorder_point_source = "unavailable"

    # --------------------------------------------------------
    # 4. REPLENISHMENT STATUS
    # --------------------------------------------------------

    if stock <= 0:
        reorder_required = True
        urgency = "critical"

    elif effective_reorder_point is None:
        reorder_required = False
        urgency = "undetermined"

    elif stock <= effective_reorder_point:
        reorder_required = True

        if days_of_cover is not None and days_of_cover <= 3:
            urgency = "critical"

        elif days_of_cover is not None and days_of_cover <= 7:
            urgency = "high"

        else:
            urgency = "medium"

    else:
        reorder_required = False
        urgency = "normal"

    # --------------------------------------------------------
    # 5. CALCULATED REPLENISHMENT QUANTITY
    # --------------------------------------------------------

    target_stock = None
    quantity_calculation = None

    if product.maximum_stock is not None:

        target_stock = product.maximum_stock

        calculated_replenishment_quantity = max(
            target_stock - stock,
            0,
        )

        quantity_source = "configured_maximum_stock"

        quantity_calculation = {
            "formula": "maximum_stock - current_stock",
            "target_stock": target_stock,
            "current_stock": stock,
            "calculated_quantity": calculated_replenishment_quantity,
            "result": calculated_replenishment_quantity,
        }

    elif (
        verified_sales_available
        and average_daily_sales_exact > 0
    ):

        target_stock = ceil(
            average_daily_sales_exact * target_cover_days
        )

        calculated_replenishment_quantity = max(
            target_stock - stock,
            0,
        )

        quantity_source = "sales_based_target_coverage"

        quantity_calculation = {
            "formula": (
                "ceil(average_daily_sales * target_cover_days) "
                "- current_stock"
            ),
            "average_daily_sales_exact": average_daily_sales_exact,
            "target_cover_days": target_cover_days,
            "target_stock": target_stock,
            "current_stock": stock,
            "calculated_quantity": calculated_replenishment_quantity,
            "result": calculated_replenishment_quantity,
        }

    else:
        calculated_replenishment_quantity = None
        quantity_source = "insufficient_data"

    # --------------------------------------------------------
    # 6. FINAL RECOMMENDATION
    # --------------------------------------------------------

    # The calculated quantity represents the mathematical
    # replenishment gap. It is preserved even when replenishment
    # is not currently required.
    #
    # The final recommended quantity represents the actual
    # decision based on the reorder status.

    if reorder_required:
        recommended_quantity = calculated_replenishment_quantity

    else:
        recommended_quantity = 0

    if reorder_required:
        final_quantity_reason = "replenishment_required"

    elif effective_reorder_point is None:
        final_quantity_reason = "reorder_point_unavailable"

    else:
        final_quantity_reason = "stock_above_reorder_point"

    final_quantity_calculation = {
        "calculated_quantity": calculated_replenishment_quantity,
        "recommended_quantity": recommended_quantity,
        "reorder_required": reorder_required,
        "reason": final_quantity_reason,
    }

    if quantity_calculation is not None:
        quantity_calculation["reorder_required"] = reorder_required

    # --------------------------------------------------------
    # 7. EXISTING SUPPLIER ORDER PROPOSALS
    # --------------------------------------------------------

    existing_orders = db.scalars(
        select(SupplierOrder)
        .where(
            SupplierOrder.product_id == product.id,
            SupplierOrder.status.in_(ACTIVE_ORDER_STATUSES),
        )
        .order_by(SupplierOrder.created_at.desc())
    ).all()

    existing_order_quantity = sum(
        order.quantity
        for order in existing_orders
    )

    # Pending and simulated proposals are NOT confirmed deliveries.
    # They must never be deducted from recommended replenishment.

    remaining_recommended_quantity = recommended_quantity

    # --------------------------------------------------------
    # 8. RELATED SHORTAGE INVESTIGATION
    # --------------------------------------------------------

    shortage_investigation = db.scalar(
        select(Investigation)
        .where(
            Investigation.product_id == product.id,
            Investigation.discrepancy < 0,
        )
        .order_by(Investigation.created_at.desc())
        .limit(1)
    )

    # --------------------------------------------------------
    # 9. RECOMMENDATIONS
    # --------------------------------------------------------

    recommendations = []

    if stock <= 0:
        recommendations.append(
            "Product is out of stock. Verify physical inventory "
            "and prioritize replenishment."
        )

    elif reorder_required:
        recommendations.append(
            "Stock has reached the replenishment threshold."
        )

    if not verified_sales_available:
        recommendations.append(
            "No approved sales movement records are available "
            "for the analysis period. Verify sales history before "
            "relying on sales-based calculations."
        )

    if effective_reorder_point is None:
        recommendations.append(
            "Configure a reorder point or record verified sales "
            "to calculate one."
        )

    if recommended_quantity is None:
        recommendations.append(
            "Configure maximum stock or record verified sales "
            "before calculating an order quantity."
        )

    if existing_order_quantity > 0:
        recommendations.append(
            f"Existing supplier-order proposals total "
            f"{existing_order_quantity} units. These are not "
            "confirmed incoming inventory. Review their status "
            "before creating another proposal."
        )

    if (
        reorder_required
        and recommended_quantity is not None
        and recommended_quantity > 0
    ):
        recommendations.append(
            "Review the suggested order quantity before creating "
            "a supplier-order proposal."
        )

    if not recommendations:
        recommendations.append(
            "Stock is currently above its replenishment threshold."
        )

    # --------------------------------------------------------
    # 10. RESPONSE
    # --------------------------------------------------------

    return {
        "product_id": product.id,
        "product_name": product.name,
        "sku": product.sku,
        "current_stock": stock,

        "sales": {
            "period_days": SALES_PERIOD_DAYS,
            "units_sold": units_sold,
            "average_daily_sales": average_daily_sales,
            "average_daily_sales_exact": average_daily_sales_exact,
            "days_of_cover": days_of_cover,
            "verified_sales_available": verified_sales_available,
        },

        "reorder_calculation": {
            "lead_time_days": effective_lead_time_days,
            "safety_buffer_days": effective_safety_buffer_days,
            "target_cover_days": target_cover_days,

            "lead_time_source": lead_time_source,
            "safety_buffer_source": safety_buffer_source,

            "configured_lead_time_days": product.lead_time_days,
            "configured_safety_buffer_days": product.safety_buffer_days,

            "reorder_period_days": reorder_lead_time,

            "configured_reorder_point": configured_reorder_point,
            "calculated_reorder_point": calculated_reorder_point,
            "effective_reorder_point": effective_reorder_point,
            "reorder_point_source": reorder_point_source,

            "reorder_point_calculation": {
                "formula": (
                    "ceil(average_daily_sales * "
                    "(lead_time_days + safety_buffer_days))"
                ),
                "average_daily_sales_exact": average_daily_sales_exact,
                "lead_time_days": effective_lead_time_days,
                "safety_buffer_days": effective_safety_buffer_days,
                "result": calculated_reorder_point,
                "available": calculated_reorder_point is not None,
            },

            "maximum_stock": product.maximum_stock,
            "target_stock": target_stock,

            # Mathematical replenishment calculation.
            "quantity_calculation": quantity_calculation,

            # Final business decision.
            "final_quantity_calculation": final_quantity_calculation,
        },

        "decision": {
            "reorder_required": reorder_required,
            "urgency": urgency,
            "recommended_quantity": recommended_quantity,
            "quantity_source": quantity_source,
            "existing_order_quantity": existing_order_quantity,
            "remaining_recommended_quantity": (
                remaining_recommended_quantity
            ),
        },

        "existing_orders": [
            {
                "order_id": order.id,
                "quantity": order.quantity,
                "status": order.status,
                "created_at": order.created_at.isoformat(),
                "confirmed_incoming_stock": False,
            }
            for order in existing_orders
        ],

        "related_investigation": (
            {
                "investigation_id": shortage_investigation.id,
                "discrepancy": shortage_investigation.discrepancy,
                "status": shortage_investigation.status,
            }
            if shortage_investigation
            else None
        ),

        "risk": {
            "score": risk["risk_score"],
            "level": risk["risk_level"],
            "data_confidence": risk["data_confidence"],
        },

        "recommendations": recommendations,

        "requires_human_approval": True,
        "automatically_ordered": False,
        "inventory_modified": False,
    }