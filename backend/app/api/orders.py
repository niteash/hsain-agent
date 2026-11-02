from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.dependencies import get_db
from app.models import (
    Investigation,
    Product,
    Supplier,
    SupplierOrder,
)

router = APIRouter(prefix="/api/orders", tags=["Supplier Orders"])


ACTIVE_ORDER_STATUSES = {
    "pending_approval",
    "simulated_ordered",
    "rejected",
}


class OrderProposalRequest(BaseModel):
    investigation_id: int
    quantity: int = Field(gt=0, le=10000)
    supplier_id: int | None = None


class OrderApprovalRequest(BaseModel):
    decision: Literal["approve", "reject"]
    approved_by: str = Field(min_length=1, max_length=120)


def serialize_order(order: SupplierOrder) -> dict:
    product = order.__dict__.get("product")
    supplier = order.__dict__.get("supplier")

    return {
        "order_id": order.id,
        "investigation_id": order.investigation_id,
        "product_id": order.product_id,
        "product_name": product.name if product else None,
        "supplier_id": order.supplier_id,
        "supplier_name": supplier.name if supplier else None,
        "quantity": order.quantity,
        "reason": order.reason,
        "status": order.status,
        "approved_by": order.approved_by,
        "approved_at": (
            order.approved_at.isoformat()
            if order.approved_at else None
        ),
        "created_at": order.created_at.isoformat(),
    }


def get_order_query():
    return select(SupplierOrder).options(
        joinedload(SupplierOrder.supplier),
        joinedload(SupplierOrder.product),
    )


# ============================================================
# ELIGIBLE INVESTIGATIONS
# ============================================================

@router.get("/eligible-investigations")
def get_eligible_investigations(
    db: Session = Depends(get_db),
):
    investigations = db.scalars(
        select(Investigation)
        .options(
            joinedload(Investigation.product)
            .joinedload(Product.preferred_supplier)
        )
        .where(Investigation.discrepancy < 0)
        .order_by(Investigation.created_at.desc())
    ).unique().all()

    results = []

    for investigation in investigations:

        existing_order = db.scalar(
            select(SupplierOrder.id)
            .where(
                SupplierOrder.investigation_id == investigation.id
            )
            .limit(1)
        )

        if existing_order is not None:
            continue

        product = investigation.product
        supplier = product.preferred_supplier

        results.append({
            "investigation_id": investigation.id,
            "product_id": product.id,
            "product_name": product.name,
            "sku": product.sku,
            "discrepancy": investigation.discrepancy,
            "status": investigation.status,
            "created_at": investigation.created_at.isoformat(),
            "current_stock": product.current_stock,
            "preferred_supplier": (
                {
                    "supplier_id": supplier.id,
                    "supplier_name": supplier.name,
                    "is_active": supplier.is_active,
                }
                if supplier else None
            ),
        })

    return results


# ============================================================
# CREATE PROPOSAL
# ============================================================

@router.post("/propose")
def propose_order(
    request: OrderProposalRequest,
    db: Session = Depends(get_db),
):
    investigation = db.scalar(
        select(Investigation)
        .options(
            joinedload(Investigation.product)
            .joinedload(Product.preferred_supplier)
        )
        .where(Investigation.id == request.investigation_id)
    )

    if investigation is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found.",
        )

    if investigation.discrepancy >= 0:
        raise HTTPException(
            status_code=409,
            detail="A reorder proposal requires a confirmed stock shortage.",
        )

    existing_order = db.scalar(
        select(SupplierOrder)
        .where(
            SupplierOrder.investigation_id == investigation.id
        )
        .limit(1)
    )

    if existing_order is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A proposal already exists for investigation "
                f"#{investigation.id}. "
                f"Current status: {existing_order.status}."
            ),
        )

    product = investigation.product

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    # Explicit selection takes priority.
    # Otherwise, use the product's preferred supplier.
    supplier_id = (
        request.supplier_id
        if request.supplier_id is not None
        else product.preferred_supplier_id
    )

    if supplier_id is None:
        raise HTTPException(
            status_code=422,
            detail="Select a supplier or configure a preferred supplier.",
        )

    supplier = db.get(Supplier, supplier_id)

    if supplier is None:
        raise HTTPException(
            status_code=404,
            detail="Selected supplier not found.",
        )

    if not supplier.is_active:
        raise HTTPException(
            status_code=409,
            detail="The selected supplier is inactive.",
        )

    order = SupplierOrder(
        investigation_id=investigation.id,
        product_id=product.id,
        supplier_id=supplier.id,
        quantity=request.quantity,
        reason=(
            f"Proposed after investigation #{investigation.id}: "
            f"recorded shortage of "
            f"{abs(investigation.discrepancy)} units. "
            "This is a human-reviewable proposal, not a confirmed "
            "purchase commitment."
        ),
        status="pending_approval",
    )

    try:
        db.add(order)
        db.commit()
        db.refresh(order)

        order = db.scalar(
            get_order_query().where(
                SupplierOrder.id == order.id
            )
        )

        return serialize_order(order)

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not save the order proposal.",
        )


# ============================================================
# APPROVE / REJECT
# ============================================================

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
        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

    if order.status != "pending_approval":
        raise HTTPException(
            status_code=409,
            detail=f"Order is already {order.status}.",
        )

    try:
        order.status = (
            "rejected"
            if request.decision == "reject"
            else "simulated_ordered"
        )

        order.approved_by = request.approved_by.strip()
        order.approved_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(order)

        order = db.scalar(
            get_order_query().where(
                SupplierOrder.id == order_id
            )
        )

        return serialize_order(order)

    except SQLAlchemyError:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not save the order decision.",
        )


# ============================================================
# VERIFY ORDER
# ============================================================

@router.get("/{order_id}")
def verify_order(
    order_id: int,
    db: Session = Depends(get_db),
):
    order = db.scalar(
        get_order_query().where(
            SupplierOrder.id == order_id
        )
    )

    if order is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found.",
        )

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
                "Simulated order recorded locally. "
                "No external supplier was contacted."
                if order.status == "simulated_ordered"
                else "Order retrieved. No external supplier was contacted."
            ),
        },
    }


# ============================================================
# LIST ORDERS
# ============================================================

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

    query = get_order_query()

    if status is not None:
        query = query.where(
            SupplierOrder.status == status
        )

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
    ).unique().all()

    return {
        "items": [
            serialize_order(order)
            for order in orders
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }