import json

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.dependencies import get_db

from app.models import (
    EvidenceAnalysis,
    EvidenceFile,
    Investigation,
    InventoryMovementProposal,
    MovementAuditLog,
    Product,
    StockMovement,
)

from app.schemas.movement import (
    MovementDecision,
    MovementProposalCreate,
)

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Product,
    StockMovement,
    StockOpeningBalance,
)
from app.schemas.stock_balance import (
    OpeningBalanceCreate,
    OpeningBalanceResponse,
)
router = APIRouter(
    prefix="/api/inventory-movements",
    tags=["Inventory Movements"],
)


ALLOWED_SOURCE_TYPES = {
    "receipt": {"purchase_receipt", "delivery_note"},
    "sale": {"sales_report"},
}


def normalize_name(value: str | None) -> str:
    if not value:
        return ""

    return " ".join(value.casefold().split())


def normalize_sku(value: str | None) -> str:
    if not value:
        return ""

    return "".join(
        char.casefold()
        for char in value
        if char.isalnum()
    )


def get_line_items(analysis_data: dict) -> list[dict]:
    inventory_data = analysis_data.get("inventory_data") or {}

    line_items = inventory_data.get("line_items")

    if isinstance(line_items, list) and line_items:
        return line_items

    if inventory_data.get("product_name"):
        return [
            {
                "product_name": inventory_data.get("product_name"),
                "sku": inventory_data.get("sku"),
                "quantity": inventory_data.get("quantity"),
                "quantity_type": inventory_data.get(
                    "quantity_type",
                    "unknown",
                ),
            }
        ]

    return []


def line_item_matches_product(
    line_item: dict,
    product: Product,
) -> bool:

    product_sku = normalize_sku(product.sku)
    item_sku = normalize_sku(line_item.get("sku"))

    if product_sku and item_sku and product_sku == item_sku:
        return True

    return (
        bool(normalize_name(product.name))
        and normalize_name(product.name)
        == normalize_name(line_item.get("product_name"))
    )


def write_audit_log(
    db: Session,
    *,
    proposal_id: int,
    action: str,
    actor: str,
    previous_status: str | None,
    new_status: str,
    details: dict,
):
    db.add(
        MovementAuditLog(
            proposal_id=proposal_id,
            action=action,
            actor=actor,
            previous_status=previous_status,
            new_status=new_status,
            details_json=json.dumps(details),
        )
    )


def serialize_proposal(
    record: InventoryMovementProposal,
    product: Product | None = None,
    evidence: EvidenceFile | None = None,
) -> dict:

    return {
        "id": record.id,
        "investigation_id": record.investigation_id,
        "evidence_id": record.evidence_id,
        "product_id": record.product_id,
        "product_name": product.name if product else None,
        "product_sku": product.sku if product else None,
        "current_stock": product.current_stock if product else None,
        "evidence_filename": (
            evidence.original_filename if evidence else None
        ),
        "movement_type": record.movement_type,
        "quantity": record.quantity,
        "quantity_delta": record.quantity_delta,
        "source_line_item_index": record.source_line_item_index,
        "reason": record.reason,
        "status": record.status,
        "approved_by": record.approved_by,
        "approved_at": (
            record.approved_at.isoformat()
            if record.approved_at
            else None
        ),
        "rejection_reason": record.rejection_reason,
        "stock_movement_id": record.stock_movement_id,
        "created_at": record.created_at.isoformat(),
    }


def get_proposal_context(
    record: InventoryMovementProposal,
    db: Session,
):
    return (
        db.get(Product, record.product_id),
        db.get(EvidenceFile, record.evidence_id),
    )


# ============================================================
# CREATE MOVEMENT PROPOSAL
# ============================================================

@router.post("/propose")
def create_movement_proposal(
    payload: MovementProposalCreate,
    investigation_id: int,
    evidence_id: int,
    db: Session = Depends(get_db),
):

    investigation = db.get(Investigation, investigation_id)

    if investigation is None:
        raise HTTPException(404, "Investigation not found.")

    evidence = db.get(EvidenceFile, evidence_id)

    if evidence is None:
        raise HTTPException(404, "Evidence file not found.")

    if evidence.investigation_id != investigation_id:
        raise HTTPException(
            400,
            "Evidence does not belong to this investigation.",
        )

    product = db.get(Product, investigation.product_id)

    if product is None:
        raise HTTPException(404, "Investigation product not found.")

    analysis_record = db.scalar(
        select(EvidenceAnalysis).where(
            EvidenceAnalysis.evidence_id == evidence_id
        )
    )

    if analysis_record is None:
        raise HTTPException(
            409,
            "Analyze the evidence before proposing a movement.",
        )

    try:
        analysis_data = json.loads(analysis_record.analysis_json)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(500, "Stored evidence analysis is invalid.")

    if not isinstance(analysis_data, dict):
        raise HTTPException(500, "Stored evidence analysis is invalid.")

    if not analysis_record.is_inventory_relevant:
        raise HTTPException(
            422,
            "This document is not classified as inventory-relevant.",
        )

    if payload.movement_type == "adjustment":
        raise HTTPException(
            422,
            "Manual stock adjustments are not enabled yet.",
        )

    if payload.movement_type not in ALLOWED_SOURCE_TYPES:
        raise HTTPException(422, "Unsupported movement type.")

    allowed_documents = ALLOWED_SOURCE_TYPES[payload.movement_type]

    if analysis_record.document_type not in allowed_documents:
        raise HTTPException(
            422,
            f"{payload.movement_type} requires one of: "
            f"{', '.join(sorted(allowed_documents))}.",
        )

    if payload.source_line_item_index is None:
        raise HTTPException(
            400,
            "A source line item index is required.",
        )

    line_items = get_line_items(analysis_data)

    if payload.source_line_item_index >= len(line_items):
        raise HTTPException(400, "Invalid source line item index.")

    line_item = line_items[payload.source_line_item_index]

    if not line_item_matches_product(line_item, product):
        raise HTTPException(
            422,
            "Selected line item does not match the investigated product.",
        )

    extracted_quantity = line_item.get("quantity")

    if extracted_quantity is None:
        raise HTTPException(
            422,
            "The selected line item has no extracted quantity.",
        )

    if (
        isinstance(extracted_quantity, bool)
        or not isinstance(extracted_quantity, (int, float))
        or not float(extracted_quantity).is_integer()
    ):
        raise HTTPException(
            422,
            "Stock movement quantity must be a whole number.",
        )

    if payload.quantity != int(extracted_quantity):
        raise HTTPException(
            422,
            "Proposed quantity must match the extracted quantity.",
        )

    quantity_type = line_item.get("quantity_type", "unknown")

    if payload.movement_type == "receipt":

        if quantity_type != "quantity_delivered":
            raise HTTPException(
                422,
                "The document does not explicitly establish a delivered quantity.",
            )

        quantity_delta = payload.quantity

    else:

        if quantity_type != "quantity_sold":
            raise HTTPException(
                422,
                "The document does not explicitly establish a sold quantity.",
            )

        quantity_delta = -payload.quantity

    record = InventoryMovementProposal(
        investigation_id=investigation_id,
        evidence_id=evidence_id,
        product_id=product.id,
        movement_type=payload.movement_type,
        quantity=payload.quantity,
        quantity_delta=quantity_delta,
        source_line_item_index=payload.source_line_item_index,
        reason=payload.reason,
        status="pending_approval",
    )

    try:
        db.add(record)
        db.flush()

        write_audit_log(
            db,
            proposal_id=record.id,
            action="created",
            actor="system",
            previous_status=None,
            new_status="pending_approval",
            details={
                "product_id": product.id,
                "quantity": payload.quantity,
                "quantity_delta": quantity_delta,
                "evidence_id": evidence_id,
                "movement_type": payload.movement_type,
            },
        )

        db.commit()
        db.refresh(record)

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            500,
            "Could not create movement proposal.",
        ) from exc

    return serialize_proposal(record, product, evidence)


# ============================================================
# LIST MOVEMENT PROPOSALS
# ============================================================

@router.get("/")
def get_movement_proposals(
    investigation_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):

    statement = select(
        InventoryMovementProposal
    ).order_by(
        InventoryMovementProposal.id.desc()
    )

    if investigation_id is not None:
        statement = statement.where(
            InventoryMovementProposal.investigation_id == investigation_id
        )

    if status:
        statement = statement.where(
            InventoryMovementProposal.status == status
        )

    records = db.scalars(statement).all()

    items = []

    for record in records:
        product, evidence = get_proposal_context(record, db)

        items.append(
            serialize_proposal(record, product, evidence)
        )

    return {
        "total": len(items),
        "items": items,
    }


# ============================================================
# APPROVE / REJECT MOVEMENT
# ============================================================

@router.post("/{proposal_id}/decision")
def decide_movement_proposal(
    proposal_id: int,
    payload: MovementDecision,
    db: Session = Depends(get_db),
):

    try:
        record = db.get(
            InventoryMovementProposal,
            proposal_id,
        )

        if record is None:
            raise HTTPException(404, "Movement proposal not found.")

        product = db.get(Product, record.product_id)

        if product is None:
            raise HTTPException(404, "Product not found.")

        evidence = db.get(EvidenceFile, record.evidence_id)

        if evidence is None:
            raise HTTPException(404, "Evidence file not found.")

        # ----------------------------------------------------
        # REJECT
        # ----------------------------------------------------

        if payload.decision == "reject":

            previous_status = record.status

            result = db.execute(
                update(InventoryMovementProposal)
                .where(
                    InventoryMovementProposal.id == proposal_id,
                    InventoryMovementProposal.status == "pending_approval",
                )
                .values(
                    status="rejected",
                    approved_by=payload.approved_by,
                    rejection_reason=(
                        payload.rejection_reason
                        or "Rejected by reviewer."
                    ),
                )
            )

            if result.rowcount != 1:
                db.rollback()
                raise HTTPException(
                    409,
                    "This proposal has already been processed.",
                )

            write_audit_log(
                db,
                proposal_id=proposal_id,
                action="rejected",
                actor=payload.approved_by,
                previous_status=previous_status,
                new_status="rejected",
                details={
                    "rejection_reason": (
                        payload.rejection_reason
                        or "Rejected by reviewer."
                    ),
                },
            )

            db.commit()

            updated_record = db.get(
                InventoryMovementProposal,
                proposal_id,
            )

            return serialize_proposal(
                updated_record,
                product,
                evidence,
            )

        # ----------------------------------------------------
        # APPROVE
        # ----------------------------------------------------

        if payload.decision != "approve":
            raise HTTPException(422, "Invalid decision.")

        # Atomically claim the pending proposal.
        #
        # Only one request can change pending_approval to approved.
        # A second request receives rowcount = 0.
        claim = db.execute(
            update(InventoryMovementProposal)
            .where(
                InventoryMovementProposal.id == proposal_id,
                InventoryMovementProposal.status == "pending_approval",
                InventoryMovementProposal.stock_movement_id.is_(None),
            )
            .values(
                status="approved",
                approved_by=payload.approved_by,
                approved_at=datetime.now(timezone.utc),
            )
        )

        if claim.rowcount != 1:
            db.rollback()
            raise HTTPException(
                409,
                "This proposal has already been processed.",
            )

        # Atomic stock update.
        #
        # The database applies the increment/decrement directly.
        # The condition prevents negative inventory.
        stock_update = db.execute(
            update(Product)
            .where(
                Product.id == record.product_id,
                Product.current_stock + record.quantity_delta >= 0,
            )
            .values(
                current_stock=(
                    Product.current_stock + record.quantity_delta
                )
            )
        )

        if stock_update.rowcount != 1:
            db.rollback()
            raise HTTPException(
                422,
                "Stock update rejected. Product may not exist or "
                "the movement would make inventory negative.",
            )

        movement = StockMovement(
            product_id=record.product_id,
            quantity_delta=record.quantity_delta,
            reason=record.movement_type,
            notes=(
                f"Approved proposal #{record.id}. "
                f"Evidence #{record.evidence_id}. "
                f"Investigation #{record.investigation_id}. "
                f"Approved by {payload.approved_by}. "
                f"Reason: {record.reason}"
            ),
        )

        db.add(movement)
        db.flush()

        # Link the immutable stock ledger entry to the proposal.
        db.execute(
            update(InventoryMovementProposal)
            .where(
                InventoryMovementProposal.id == proposal_id,
                InventoryMovementProposal.status == "approved",
            )
            .values(
                stock_movement_id=movement.id,
            )
        )

        write_audit_log(
            db,
            proposal_id=proposal_id,
            action="approved",
            actor=payload.approved_by,
            previous_status="pending_approval",
            new_status="approved",
            details={
                "product_id": product.id,
                "quantity": record.quantity,
                "quantity_delta": record.quantity_delta,
                "stock_movement_id": movement.id,
                "evidence_id": record.evidence_id,
                "movement_type": record.movement_type,
            },
        )

        # Proposal status, stock, movement and audit log
        # are committed together.
        db.commit()

        updated_record = db.get(
            InventoryMovementProposal,
            proposal_id,
        )

        updated_product = db.get(
            Product,
            record.product_id,
        )

        return {
            **serialize_proposal(
                updated_record,
                updated_product,
                evidence,
            ),
            "updated_stock": updated_product.current_stock,
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            500,
            "Could not process inventory movement.",
        ) from exc
        
# ============================================================
# MOVEMENT AUDIT HISTORY
# ============================================================

@router.get("/{proposal_id}/audit")
def get_movement_audit_history(
    proposal_id: int,
    db: Session = Depends(get_db),
):
    proposal = db.get(
        InventoryMovementProposal,
        proposal_id,
    )

    if proposal is None:
        raise HTTPException(
            status_code=404,
            detail="Movement proposal not found.",
        )

    records = db.scalars(
        select(MovementAuditLog)
        .where(
            MovementAuditLog.proposal_id == proposal_id
        )
        .order_by(
            MovementAuditLog.created_at.asc(),
            MovementAuditLog.id.asc(),
        )
    ).all()

    items = []

    for record in records:
        try:
            details = json.loads(record.details_json or "{}")
        except (json.JSONDecodeError, TypeError):
            details = {}

        items.append({
            "id": record.id,
            "proposal_id": record.proposal_id,
            "action": record.action,
            "actor": record.actor,
            "previous_status": record.previous_status,
            "new_status": record.new_status,
            "details": details,
            "created_at": record.created_at.isoformat(),
        })

    return {
        "proposal_id": proposal_id,
        "total": len(items),
        "items": items,
    }
    
# ============================================================
# INVENTORY STOCK LEDGER
# ============================================================

@router.get("/ledger")
def get_stock_ledger(
    product_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """
    Retrieve the stock movement ledger.

    Supports:
    - All products
    - Filtering by product
    - Pagination
    - Associated approved movement proposals
    """

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

    statement = (
        select(
            StockMovement,
            Product,
            InventoryMovementProposal,
        )
        .join(
            Product,
            Product.id == StockMovement.product_id,
        )
        .outerjoin(
            InventoryMovementProposal,
            InventoryMovementProposal.stock_movement_id
            == StockMovement.id,
        )
        .order_by(
            StockMovement.created_at.desc(),
            StockMovement.id.desc(),
        )
    )

    if product_id is not None:
        product = db.get(Product, product_id)

        if product is None:
            raise HTTPException(
                status_code=404,
                detail="Product not found.",
            )

        statement = statement.where(
            StockMovement.product_id == product_id
        )

    rows = db.execute(
        statement.limit(limit).offset(offset)
    ).all()

    items = []

    for movement, product, proposal in rows:
        items.append({
            "movement_id": movement.id,
            "product": {
                "id": product.id,
                "name": product.name,
                "sku": product.sku,
            },
            "quantity_delta": movement.quantity_delta,
            "movement_type": (
                proposal.movement_type
                if proposal
                else movement.reason
            ),
            "reason": movement.reason,
            "notes": movement.notes,
            "proposal_id": proposal.id if proposal else None,
            "evidence_id": proposal.evidence_id if proposal else None,
            "investigation_id": (
                proposal.investigation_id if proposal else None
            ),
            "created_at": movement.created_at.isoformat(),
            "current_stock": product.current_stock,
        })

    return {
        "total_returned": len(items),
        "limit": limit,
        "offset": offset,
        "items": items,
    }


# ============================================================
# PRODUCT STOCK LEDGER
# ============================================================

@router.get("/products/{product_id}/ledger")
def get_product_stock_ledger(
    product_id: int,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """
    Retrieve the complete available movement history
    for one product.
    """

    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

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

    statement = (
        select(
            StockMovement,
            InventoryMovementProposal,
        )
        .outerjoin(
            InventoryMovementProposal,
            InventoryMovementProposal.stock_movement_id
            == StockMovement.id,
        )
        .where(
            StockMovement.product_id == product_id
        )
        .order_by(
            StockMovement.created_at.desc(),
            StockMovement.id.desc(),
        )
    )

    rows = db.execute(
        statement.limit(limit).offset(offset)
    ).all()

    items = []

    for movement, proposal in rows:
        items.append({
            "movement_id": movement.id,
            "quantity_delta": movement.quantity_delta,
            "movement_type": (
                proposal.movement_type
                if proposal
                else movement.reason
            ),
            "reason": movement.reason,
            "notes": movement.notes,
            "proposal_id": proposal.id if proposal else None,
            "evidence_id": proposal.evidence_id if proposal else None,
            "investigation_id": (
                proposal.investigation_id if proposal else None
            ),
            "created_at": movement.created_at.isoformat(),
        })

    return {
        "product": {
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "current_stock": product.current_stock,
        },
        "total_returned": len(items),
        "limit": limit,
        "offset": offset,
        "items": items,
    }

# ============================================================
# OPENING BALANCE
# ============================================================

@router.post("/products/{product_id}/opening-balance", status_code=201)
def create_opening_balance(
    product_id: int,
    payload: OpeningBalanceCreate,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    existing = db.scalar(
        select(StockOpeningBalance).where(
            StockOpeningBalance.product_id == product_id
        )
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="An opening balance already exists for this product.",
        )

    effective_at = payload.effective_at or datetime.now(timezone.utc)

    if effective_at.tzinfo is None:
        effective_at = effective_at.replace(tzinfo=timezone.utc)
    else:
        effective_at = effective_at.astimezone(timezone.utc)

    balance = StockOpeningBalance(
        product_id=product_id,
        opening_quantity=payload.opening_quantity,
        effective_at=effective_at,
        source=payload.source,
        notes=payload.notes,
        recorded_by=payload.recorded_by,
    )

    try:
        db.add(balance)
        db.commit()
        db.refresh(balance)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An opening balance already exists for this product.",
        )

    return {
        "message": "Opening balance recorded successfully.",
        "balance": OpeningBalanceResponse.model_validate(balance).model_dump(),
    }


# ============================================================
# GET OPENING BALANCE
# ============================================================

@router.get("/products/{product_id}/opening-balance")
def get_opening_balance(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    balance = db.scalar(
        select(StockOpeningBalance).where(
            StockOpeningBalance.product_id == product_id
        )
    )

    if balance is None:
        return {
            "product_id": product_id,
            "has_opening_balance": False,
            "opening_balance": None,
        }

    return {
        "product_id": product_id,
        "has_opening_balance": True,
        "opening_balance": OpeningBalanceResponse.model_validate(
            balance
        ).model_dump(),
    }


# ============================================================
# STOCK RECONCILIATION
# ============================================================

@router.get("/reconciliation")
def reconcile_inventory(
    db: Session = Depends(get_db),
):
    products = db.scalars(
        select(Product).order_by(Product.id)
    ).all()

    results = []

    for product in products:
        baseline = db.scalar(
            select(StockOpeningBalance).where(
                StockOpeningBalance.product_id == product.id
            )
        )

        if baseline is None:
            results.append({
                "product_id": product.id,
                "product_name": product.name,
                "sku": product.sku,
                "status": "missing_opening_balance",
                "current_stock": product.current_stock,
                "calculated_stock": None,
                "difference": None,
                "opening_balance": None,
                "movements_since_baseline": None,
            })
            continue

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
            movement.quantity_delta for movement in movements
        )

        calculated_stock = baseline.opening_quantity + movement_total
        difference = product.current_stock - calculated_stock

        if difference == 0:
            status = "reconciled"
        else:
            status = "discrepancy"

        results.append({
            "product_id": product.id,
            "product_name": product.name,
            "sku": product.sku,
            "status": status,
            "opening_balance": baseline.opening_quantity,
            "effective_at": baseline.effective_at,
            "movements_since_baseline": len(movements),
            "movement_total": movement_total,
            "calculated_stock": calculated_stock,
            "current_stock": product.current_stock,
            "difference": difference,
        })

    return {
        "total_products": len(products),
        "reconciled": sum(
            item["status"] == "reconciled" for item in results
        ),
        "discrepancies": sum(
            item["status"] == "discrepancy" for item in results
        ),
        "missing_opening_balances": sum(
            item["status"] == "missing_opening_balance"
            for item in results
        ),
        "items": results,
    }