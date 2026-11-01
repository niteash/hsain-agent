from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Product
from app.services.inventory_risk import calculate_stock_risk


router = APIRouter(
    prefix="/api/inventory-risk",
    tags=["Inventory Risk"],
)


@router.get("/")
def get_inventory_risk(
    risk_level: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):

    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100.",
        )

    if offset < 0:
        raise HTTPException(
            status_code=400,
            detail="Offset cannot be negative.",
        )

    allowed_levels = {
        "low",
        "medium",
        "high",
        "critical",
    }

    if risk_level and risk_level not in allowed_levels:
        raise HTTPException(
            status_code=400,
            detail="Invalid risk level.",
        )

    products = db.scalars(
        select(Product).order_by(Product.id.asc())
    ).all()

    results = [
        calculate_stock_risk(product, db)
        for product in products
    ]

    # Highest risk first.
    results.sort(
        key=lambda item: (
            -item["risk_score"],
            item["product_name"].casefold(),
        )
    )

    if risk_level:
        results = [
            item
            for item in results
            if item["risk_level"] == risk_level
        ]

    total = len(results)

    paginated_results = results[
        offset:offset + limit
    ]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,

        "summary": {
            "critical": sum(
                item["risk_level"] == "critical"
                for item in results
            ),
            "high": sum(
                item["risk_level"] == "high"
                for item in results
            ),
            "medium": sum(
                item["risk_level"] == "medium"
                for item in results
            ),
            "low": sum(
                item["risk_level"] == "low"
                for item in results
            ),
        },

        "items": paginated_results,
    }


@router.get("/products/{product_id}")
def get_product_inventory_risk(
    product_id: int,
    db: Session = Depends(get_db),
):

    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    return calculate_stock_risk(product, db)