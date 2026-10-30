from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Investigation, Product

router = APIRouter(
    prefix="/api/investigations",
    tags=["Investigations"],
)


@router.get("")
def list_investigations(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    if not 1 <= limit <= 100:
        raise HTTPException(
            status_code=422,
            detail="limit must be between 1 and 100",
        )

    if offset < 0:
        raise HTTPException(
            status_code=422,
            detail="offset must be non-negative",
        )

    statement = (
        select(Investigation, Product.name)
        .join(Product, Investigation.product_id == Product.id)
        .order_by(Investigation.id.desc())
        .limit(limit)
        .offset(offset)
    )

    rows = db.execute(statement).all()

    return {
        "items": [
            {
                "investigation_id": record.id,
                "product_id": record.product_id,
                "product_name": product_name,
                "expected_stock": record.expected_stock,
                "physical_stock": record.physical_stock,
                "units_sold": record.units_sold,
                "expected_remaining_stock": record.expected_remaining_stock,
                "discrepancy": record.discrepancy,
                "status": record.status,
                "investigation": record.investigation,
                "recommended_action": record.recommended_action,
                "evidence_notes": record.evidence_notes,
                "created_at": record.created_at.isoformat(),
            }
            for record, product_name in rows
        ],
        "limit": limit,
        "offset": offset,
    }
