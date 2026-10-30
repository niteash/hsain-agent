from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Investigation, Product, SupplierOrder

router = APIRouter(prefix="/api/orders", tags=["Supplier Orders"])


class OrderProposalRequest(BaseModel):
    investigation_id: int
    quantity: int = Field(gt=0, le=10000)


class OrderApprovalRequest(BaseModel):
    decision: Literal["approve", "reject"]
    approved_by: str = Field(min_length=1, max_length=120)


def serialize_order(order: SupplierOrder) -> dict:
    return {
        "order_id": order.id,
        "investigation_id": order.investigation_id,
        "product_id": order.product_id,
        "quantity": order.quantity,
        "reason": order.reason,
        "status": order.status,
        "approved_by": order.approved_by,
        "approved_at": (
            order.approved_at.isoformat()
            if order.approved_at
            else None
        ),
        "created_at": order.created_at.isoformat(),
    }


@router.post("/propose")
def propose_order(
    request: OrderProposalRequest,
    db: Session = Depends(get_db),
):
    investigation = db.get(Investigation, request.investigation_id)

    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found.")

    if investigation.discrepancy >= 0:
        raise HTTPException(
            status_code=409,
            detail="A reorder proposal requires a confirmed stock shortage.",
        )
        
    existing_order = db.scalar(
        select(SupplierOrder).where(
            SupplierOrder.investigation_id == investigation.id
        )
    )

    if existing_order is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A reorder proposal already exists for investigation "
                f"#{investigation.id}. "
                f"Current order status: {existing_order.status}."
            ),
        )

    
    product = db.get(Product, investigation.product_id)

    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")

    order = SupplierOrder(
        investigation_id=investigation.id,
        product_id=product.id,
        quantity=request.quantity,
        reason=(
            f"Proposed after investigation #{investigation.id}: "
            f"recorded shortage of {abs(investigation.discrepancy)} units. "
            "The reorder quantity is a human-reviewable proposal, not an "
            "automatically calculated purchase commitment."
        ),
        status="pending_approval",
    )

    try:
        db.add(order)
        db.commit()
        db.refresh(order)
        return serialize_order(order)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the order proposal.",
        )


@router.post("/{order_id}/decision")
def decide_order(
    order_id: int,
    request: OrderApprovalRequest,
    db: Session = Depends(get_db),
):
    order = db.scalar(
        select(SupplierOrder)
        .where(SupplierOrder.id == order_id)
        .with_for_update()
    )

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")

    if order.status != "pending_approval":
        raise HTTPException(
            status_code=409,
            detail=f"Order is already {order.status}; decision cannot be changed.",
        )

    try:
        if request.decision == "reject":
            order.status = "rejected"
            order.approved_by = request.approved_by.strip()
            order.approved_at = datetime.now(timezone.utc)
        else:
            order.status = "simulated_ordered"
            order.approved_by = request.approved_by.strip()
            order.approved_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(order)
        return serialize_order(order)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the order decision.",
        )


@router.get("/{order_id}")
def verify_order(
    order_id: int,
    db: Session = Depends(get_db),
):
    order = db.get(SupplierOrder, order_id)

    if order is None:
        raise HTTPException(status_code=404, detail="Order not found.")

    return {
        **serialize_order(order),
        "verification": {
            "record_exists": True,
            "status_persisted": order.status in {
                "pending_approval",
                "rejected",
                "simulated_ordered",
            },
            "supplier_order_sent": False,
            "message": (
                "Simulated order recorded in the local database. "
                "No external supplier was contacted."
                if order.status == "simulated_ordered"
                else "Order record retrieved; no external supplier was contacted."
            ),
        },
    }



@router.get("")
def list_orders(
    limit: int = 20,
    offset: int = 0,
    status: Literal[
        "pending_approval",
        "simulated_ordered",
        "rejected",
    ] | None = None,
    db: Session = Depends(get_db),
):
    if not 1 <= limit <= 100:
        raise HTTPException(
            status_code=422,
            detail="Limit must be between 1 and 100.",
        )

    if offset < 0:
        raise HTTPException(
            status_code=422,
            detail="Offset cannot be negative.",
        )

    query = select(SupplierOrder)

    if status is not None:
        query = query.where(SupplierOrder.status == status)

    total_query = select(SupplierOrder.id)

    if status is not None:
        total_query = total_query.where(
            SupplierOrder.status == status
        )

    total = len(db.scalars(total_query).all())

    orders = db.scalars(
        query
        .order_by(SupplierOrder.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return {
        "items": [serialize_order(order) for order in orders],
        "total": total,
        "limit": limit,
        "offset": offset,
    }