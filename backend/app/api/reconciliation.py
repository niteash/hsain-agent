import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_db

from app.models import (
    EvidenceAnalysis,
    EvidenceFile,
    EvidenceReconciliation,
    Investigation,
    Product,
    StockMovement,
    StockOpeningBalance,
)

from app.services.evidence_reconciliation import reconcile_evidence
from app.models import StockDiscrepancy
from app.schemas.discrepancy import ResolveDiscrepancyRequest

from datetime import datetime, timezone

from app.models import StockDiscrepancy

from app.schemas.discrepancy import ResolveDiscrepancyRequest

from app.services.stock_reconciliation import (
    build_stock_reconciliation,
    reconcile_all_products,
)

from app.services.discrepancy_service import (
    detect_stock_discrepancies,
)
router = APIRouter(
    prefix="/api/reconciliation",
    tags=["Reconciliation"],
)


# ============================================================
# INVESTIGATION CONTEXT
# ============================================================

def build_investigation_context(
    investigation: Investigation,
    product_name: str,
) -> dict:
    return {
        "investigation_id": investigation.id,
        "product_name": product_name,
        "expected_stock": investigation.expected_stock,
        "physical_stock": investigation.physical_stock,
        "units_sold": investigation.units_sold,
        "expected_remaining_stock": investigation.expected_remaining_stock,
        "discrepancy": investigation.discrepancy,
        "status": investigation.status,
    }


# ============================================================
# STOCK RECONCILIATION HELPERS
# ============================================================

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

# ============================================================
# STOCK RECONCILIATION
# ============================================================

@router.get("/stock")
def reconcile_all_stock(
    db: Session = Depends(get_db),
):
    return reconcile_all_products(db)


@router.get("/stock/products/{product_id}")
def reconcile_single_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    return build_stock_reconciliation(db, product)
# ============================================================
# STOCK RECONCILIATION - SINGLE PRODUCT
# ============================================================

@router.get("/stock/products/{product_id}")
def reconcile_single_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found.",
        )

    return build_stock_reconciliation(db, product)
# ============================================================
# AUTOMATED DISCREPANCY DETECTION
# ============================================================

@router.post("/stock/detect")
def run_discrepancy_detection(
    db: Session = Depends(get_db),
):
    try:
        return detect_stock_discrepancies(db)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Discrepancy detection failed.",
        ) from exc


# ============================================================
# DISCREPANCY ALERT HISTORY
# ============================================================

@router.get("/stock/alerts")
def get_stock_discrepancy_alerts(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=422,
            detail="Limit must be between 1 and 100.",
        )

    if offset < 0:
        raise HTTPException(
            status_code=422,
            detail="Offset cannot be negative.",
        )

    if status and status not in {"open", "resolved"}:
        raise HTTPException(
            status_code=422,
            detail="Status must be open or resolved.",
        )

    statement = (
        select(StockDiscrepancy)
        .order_by(StockDiscrepancy.id.desc())
    )

    if status:
        statement = statement.where(
            StockDiscrepancy.status == status
        )

    total = len(db.scalars(statement).all())

    records = db.scalars(
        statement.limit(limit).offset(offset)
    ).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product.name,
                "opening_balance": item.opening_balance,
                "calculated_stock": item.calculated_stock,
                "current_stock": item.current_stock,
                "difference": item.difference,
                "status": item.status,
                "occurrences": item.occurrences,
                "first_detected_at": item.first_detected_at.isoformat(),
                "last_detected_at": item.last_detected_at.isoformat(),
                "resolved_at": (
                    item.resolved_at.isoformat()
                    if item.resolved_at else None
                ),
                "resolved_by": item.resolved_by,
                "resolution_notes": item.resolution_notes,
            }
            for item in records
        ],
    }


# ============================================================
# RESOLVE DISCREPANCY ALERT
# ============================================================

@router.post("/stock/alerts/{alert_id}/resolve")
def resolve_stock_discrepancy(
    alert_id: int,
    payload: ResolveDiscrepancyRequest,
    db: Session = Depends(get_db),
):
    alert = db.get(StockDiscrepancy, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Discrepancy alert not found.",
        )

    if alert.status != "open":
        raise HTTPException(
            status_code=409,
            detail="This discrepancy alert has already been resolved.",
        )

    alert.status = "resolved"
    alert.active_product_id = None
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolved_by = payload.resolved_by
    alert.resolution_notes = payload.resolution_notes

    try:
        db.commit()
        db.refresh(alert)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not resolve discrepancy alert.",
        )

    return {
        "message": "Discrepancy alert resolved.",
        "alert_id": alert.id,
        "product_id": alert.product_id,
        "status": alert.status,
        "resolved_by": alert.resolved_by,
        "resolved_at": alert.resolved_at.isoformat(),
    }

# ============================================================
# EVIDENCE RECONCILIATION - CREATE
# ============================================================

@router.post("/{evidence_id}")
def create_reconciliation(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    evidence = db.get(EvidenceFile, evidence_id)

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    analysis_record = db.scalar(
        select(EvidenceAnalysis).where(
            EvidenceAnalysis.evidence_id == evidence_id
        )
    )

    if analysis_record is None:
        raise HTTPException(
            status_code=409,
            detail="Analyze the evidence before reconciliation.",
        )

    investigation = db.get(
        Investigation,
        evidence.investigation_id,
    )

    if investigation is None:
        raise HTTPException(
            status_code=404,
            detail="Linked investigation not found.",
        )

    product_name = db.scalar(
        select(Product.name).where(
            Product.id == investigation.product_id
        )
    )

    if product_name is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation product not found.",
        )

    try:
        analysis_data = json.loads(
            analysis_record.analysis_json
        )

    except (json.JSONDecodeError, TypeError):
        raise HTTPException(
            status_code=500,
            detail="Stored evidence analysis is invalid.",
        )

    context = build_investigation_context(
        investigation,
        product_name,
    )

    # Deterministic evidence reconciliation.
    reconciliation_result = reconcile_evidence(
        investigation=context,
        analysis=analysis_data,
    )

    status = reconciliation_result["status"]

    record = EvidenceReconciliation(
        evidence_id=evidence_id,
        investigation_id=investigation.id,
        status=status,
        result_json=json.dumps(
            reconciliation_result,
            ensure_ascii=False,
        ),
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not save evidence reconciliation.",
        ) from exc

    return {
        "reconciliation_id": record.id,
        "evidence_id": evidence_id,
        "investigation_id": investigation.id,
        "status": record.status,
        "result": reconciliation_result,
    }


# ============================================================
# EVIDENCE RECONCILIATION - HISTORY
# ============================================================

@router.get("/{evidence_id}")
def get_reconciliation_history(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    evidence = db.get(EvidenceFile, evidence_id)

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    statement = (
        select(EvidenceReconciliation)
        .where(
            EvidenceReconciliation.evidence_id == evidence_id
        )
        .order_by(
            EvidenceReconciliation.id.desc()
        )
    )

    records = db.scalars(statement).all()

    items = []

    for record in records:
        try:
            result = json.loads(record.result_json)

        except (json.JSONDecodeError, TypeError):
            result = {
                "error": "Stored reconciliation result is invalid."
            }

        items.append({
            "reconciliation_id": record.id,
            "investigation_id": record.investigation_id,
            "status": record.status,
            "created_at": (
                record.created_at.isoformat()
                if record.created_at
                else None
            ),
            "result": result,
        })

    return {
        "evidence_id": evidence_id,
        "total": len(items),
        "items": items,
    }