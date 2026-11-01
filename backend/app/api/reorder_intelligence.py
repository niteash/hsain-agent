from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Product
from app.services.reorder_intelligence import (
    calculate_reorder_recommendation,
)


router = APIRouter(
    prefix="/api/reorder-intelligence",
    tags=["Reorder Intelligence"],
)


ALLOWED_URGENCIES = {
    "critical",
    "high",
    "medium",
    "normal",
    "undetermined",
}


def validate_parameters(
    lead_time_days: int,
    safety_buffer_days: int,
    target_cover_days: int,
    limit: int | None = None,
    offset: int | None = None,
):

    if not 1 <= lead_time_days <= 365:
        raise HTTPException(
            status_code=400,
            detail="Lead time must be between 1 and 365 days.",
        )

    if not 0 <= safety_buffer_days <= 365:
        raise HTTPException(
            status_code=400,
            detail="Safety buffer must be between 0 and 365 days.",
        )

    if not 1 <= target_cover_days <= 365:
        raise HTTPException(
            status_code=400,
            detail="Target coverage must be between 1 and 365 days.",
        )

    if limit is not None and not 1 <= limit <= 100:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100.",
        )

    if offset is not None and offset < 0:
        raise HTTPException(
            status_code=400,
            detail="Offset cannot be negative.",
        )


def build_summary(results: list[dict]) -> dict:

    return {
        "total_products": len(results),

        "reorder_required": sum(
            item["decision"]["reorder_required"]
            for item in results
        ),

        "critical": sum(
            item["decision"]["urgency"] == "critical"
            for item in results
        ),

        "high": sum(
            item["decision"]["urgency"] == "high"
            for item in results
        ),

        "medium": sum(
            item["decision"]["urgency"] == "medium"
            for item in results
        ),

        "normal": sum(
            item["decision"]["urgency"] == "normal"
            for item in results
        ),

        "undetermined": sum(
            item["decision"]["urgency"] == "undetermined"
            for item in results
        ),
    }


@router.get("/")
def get_reorder_recommendations(
    lead_time_days: int = 7,
    safety_buffer_days: int = 3,
    target_cover_days: int = 30,
    urgency: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):

    validate_parameters(
        lead_time_days,
        safety_buffer_days,
        target_cover_days,
        limit,
        offset,
    )

    if urgency and urgency not in ALLOWED_URGENCIES:
        raise HTTPException(
            status_code=400,
            detail="Invalid urgency level.",
        )

    products = db.scalars(
        select(Product).order_by(Product.id.asc())
    ).all()

    results = [
        calculate_reorder_recommendation(
            product=product,
            db=db,
            lead_time_days=lead_time_days,
            safety_buffer_days=safety_buffer_days,
            target_cover_days=target_cover_days,
        )
        for product in products
    ]

    results.sort(
        key=lambda item: (
            not item["decision"]["reorder_required"],
            {
                "critical": 0,
                "high": 1,
                "medium": 2,
                "normal": 3,
                "undetermined": 4,
            }[item["decision"]["urgency"]],
            item["product_name"].casefold(),
        )
    )

    # Summary always represents the complete inventory.
    # It is independent of the selected urgency filter.
    summary = build_summary(results)

    # Apply filtering only to returned items.
    filtered_results = results

    if urgency:
        filtered_results = [
            item
            for item in results
            if item["decision"]["urgency"] == urgency
        ]

    total = len(filtered_results)

    return {
        "planning_parameters": {
            "lead_time_days": lead_time_days,
            "safety_buffer_days": safety_buffer_days,
            "target_cover_days": target_cover_days,
          "note": (
    "Lead time and safety buffer are fallback planning assumptions. "
    "Product-level configurations override these defaults when set. "
    "These values are not verified supplier lead times."
),
        },

        "summary": summary,

        "total": total,
        "limit": limit,
        "offset": offset,

        "items": filtered_results[offset:offset + limit],
    }


@router.get("/products/{product_id}")
def get_product_reorder_recommendation(
    product_id: int,
    lead_time_days: int = 7,
    safety_buffer_days: int = 3,
    target_cover_days: int = 30,
    db: Session = Depends(get_db),
):

    validate_parameters(
        lead_time_days,
        safety_buffer_days,
        target_cover_days,
    )

    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    return calculate_reorder_recommendation(
        product=product,
        db=db,
        lead_time_days=lead_time_days,
        safety_buffer_days=safety_buffer_days,
        target_cover_days=target_cover_days,
    )