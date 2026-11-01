import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.dependencies import get_db

from app.models import (
    EvidenceAnalysis,
    EvidenceFile,
    EvidenceReconciliation,
    Investigation,
    Product,
    StockDiscrepancy,
    StockDiscrepancyAuditLog,
)

from app.schemas.discrepancy import ResolveDiscrepancyRequest

from app.services.evidence_reconciliation import reconcile_evidence

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
# AUDIT HELPERS
# ============================================================

def create_discrepancy_audit(
    db: Session,
    *,
    alert_id: int,
    product_id: int,
    action: str,
    actor: str,
    previous_status: str | None,
    new_status: str | None,
    details: dict,
):
    record = StockDiscrepancyAuditLog(
        alert_id=alert_id,
        product_id=product_id,
        action=action,
        actor=actor,
        previous_status=previous_status,
        new_status=new_status,
        details_json=json.dumps(
            details,
            ensure_ascii=False,
            default=str,
        ),
    )

    db.add(record)

    return record


def discrepancy_snapshot(alert: StockDiscrepancy) -> dict:
    return {
        "alert_id": alert.id,
        "product_id": alert.product_id,
        "opening_balance": alert.opening_balance,
        "calculated_stock": alert.calculated_stock,
        "current_stock": alert.current_stock,
        "difference": alert.difference,
        "status": alert.status,
        "occurrences": alert.occurrences,
    }


def serialize_audit_entry(entry: StockDiscrepancyAuditLog) -> dict:
    try:
        details = json.loads(entry.details_json or "{}")
    except (json.JSONDecodeError, TypeError):
        details = {
            "error": "Stored audit details are invalid."
        }

    return {
        "id": entry.id,
        "alert_id": entry.alert_id,
        "product_id": entry.product_id,
        "action": entry.action,
        "actor": entry.actor,
        "previous_status": entry.previous_status,
        "new_status": entry.new_status,
        "details": details,
        "created_at": (
            entry.created_at.isoformat()
            if entry.created_at
            else None
        ),
    }


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
# AUTOMATED DISCREPANCY DETECTION
# ============================================================

@router.post("/stock/detect")
def run_discrepancy_detection(
    db: Session = Depends(get_db),
):
    try:
        existing_alerts = db.scalars(
            select(StockDiscrepancy)
        ).all()

        before = {
            alert.id: {
                "status": alert.status,
                "occurrences": alert.occurrences,
                "snapshot": discrepancy_snapshot(alert),
            }
            for alert in existing_alerts
        }

        result = detect_stock_discrepancies(db)

        audit_events = []

        # New discrepancy alerts
        for alert_id in result["detected_alert_ids"]:
            alert = db.get(StockDiscrepancy, alert_id)

            if alert is None:
                continue

            create_discrepancy_audit(
                db,
                alert_id=alert.id,
                product_id=alert.product_id,
                action="detected",
                actor="system",
                previous_status=None,
                new_status=alert.status,
                details={
                    "current": discrepancy_snapshot(alert),
                    "message": "A new stock discrepancy was detected.",
                },
            )

            audit_events.append({
                "alert_id": alert.id,
                "action": "detected",
            })

        # Recurring discrepancies
        for alert_id in result["updated_alert_ids"]:
            alert = db.get(StockDiscrepancy, alert_id)
            previous = before.get(alert_id)

            if alert is None or previous is None:
                continue

            create_discrepancy_audit(
                db,
                alert_id=alert.id,
                product_id=alert.product_id,
                action="recurrence",
                actor="system",
                previous_status=previous["status"],
                new_status=alert.status,
                details={
                    "previous": previous["snapshot"],
                    "current": discrepancy_snapshot(alert),
                    "previous_occurrences": previous["occurrences"],
                    "current_occurrences": alert.occurrences,
                },
            )

            audit_events.append({
                "alert_id": alert.id,
                "action": "recurrence",
            })

        # Automatically resolved discrepancies
        for alert_id in result["resolved_alert_ids"]:
            alert = db.get(StockDiscrepancy, alert_id)
            previous = before.get(alert_id)

            if alert is None or previous is None:
                continue

            create_discrepancy_audit(
                db,
                alert_id=alert.id,
                product_id=alert.product_id,
                action="auto_resolved",
                actor="system",
                previous_status="open",
                new_status="resolved",
                details={
                    "previous": previous["snapshot"],
                    "current": discrepancy_snapshot(alert),
                    "resolution_notes": alert.resolution_notes,
                    "stock_modified": False,
                },
            )

            audit_events.append({
                "alert_id": alert.id,
                "action": "auto_resolved",
            })

        # One atomic commit for alert changes and audit records.
        db.commit()

        return {
            "result": result,
            "audit_events_created": len(audit_events),
            "audit_events": audit_events,
        }

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Discrepancy detection failed.",
        ) from exc
# ============================================================
# DISCREPANCY ALERT HISTORY
# ============================================================

@router.get("/stock/alerts")
def get_stock_discrepancy_alerts(
    status: str | None = Query(
        default=None,
        pattern="^(open|resolved)$",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    db: Session = Depends(get_db),
):
    statement = select(StockDiscrepancy)

    count_statement = select(
        func.count(StockDiscrepancy.id)
    )

    if status:
        statement = statement.where(
            StockDiscrepancy.status == status
        )

        count_statement = count_statement.where(
            StockDiscrepancy.status == status
        )

    total = db.scalar(count_statement) or 0

    records = db.scalars(
        statement
        .order_by(StockDiscrepancy.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": (
                    item.product.name
                    if item.product
                    else None
                ),
                "opening_balance": item.opening_balance,
                "calculated_stock": item.calculated_stock,
                "current_stock": item.current_stock,
                "difference": item.difference,
                "status": item.status,
                "occurrences": item.occurrences,
                "first_detected_at": (
                    item.first_detected_at.isoformat()
                    if item.first_detected_at
                    else None
                ),
                "last_detected_at": (
                    item.last_detected_at.isoformat()
                    if item.last_detected_at
                    else None
                ),
                "resolved_at": (
                    item.resolved_at.isoformat()
                    if item.resolved_at
                    else None
                ),
                "resolved_by": item.resolved_by,
                "resolution_notes": item.resolution_notes,
            }
            for item in records
        ],
    }


# ============================================================
# DISCREPANCY AUDIT HISTORY
# ============================================================

@router.get("/stock/alerts/{alert_id}/audit")
def get_discrepancy_audit_history(
    alert_id: int,
    limit: int = Query(
        default=100,
        ge=1,
        le=200,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    db: Session = Depends(get_db),
):
    alert = db.get(StockDiscrepancy, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Discrepancy alert not found.",
        )

    count_statement = select(
        func.count(StockDiscrepancyAuditLog.id)
    ).where(
        StockDiscrepancyAuditLog.alert_id == alert_id
    )

    total = db.scalar(count_statement) or 0

    records = db.scalars(
        select(StockDiscrepancyAuditLog)
        .where(
            StockDiscrepancyAuditLog.alert_id == alert_id
        )
        .order_by(
            StockDiscrepancyAuditLog.created_at.asc(),
            StockDiscrepancyAuditLog.id.asc(),
        )
        .limit(limit)
        .offset(offset)
    ).all()

    return {
        "alert_id": alert.id,
        "product_id": alert.product_id,
        "product_name": (
            alert.product.name
            if alert.product
            else None
        ),
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            serialize_audit_entry(record)
            for record in records
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
    """
    Resolve an alert and record the reviewer decision.

    This does not modify product stock.
    """

    alert = db.get(
        StockDiscrepancy,
        alert_id,
    )

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

    previous_snapshot = discrepancy_snapshot(alert)

    alert.status = "resolved"
    alert.active_product_id = None
    alert.resolved_at = datetime.now(timezone.utc)
    alert.resolved_by = payload.resolved_by
    alert.resolution_notes = payload.resolution_notes

    create_discrepancy_audit(
        db,
        alert_id=alert.id,
        product_id=alert.product_id,
        action="resolved",
        actor=payload.resolved_by,
        previous_status="open",
        new_status="resolved",
        details={
            "previous": previous_snapshot,
            "current": {
                **previous_snapshot,
                "status": "resolved",
            },
            "resolved_by": payload.resolved_by,
            "resolution_notes": payload.resolution_notes,
            "message": "Discrepancy alert manually resolved by a reviewer.",
            "stock_modified": False,
        },
    )

    try:
        db.commit()
        db.refresh(alert)

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not resolve discrepancy alert.",
        ) from exc

    return {
        "message": "Discrepancy alert resolved.",
        "alert_id": alert.id,
        "product_id": alert.product_id,
        "status": alert.status,
        "resolved_by": alert.resolved_by,
        "resolved_at": (
            alert.resolved_at.isoformat()
            if alert.resolved_at
            else None
        ),
        "stock_modified": False,
    }


# ============================================================
# EVIDENCE RECONCILIATION - CREATE
# ============================================================

@router.post("/{evidence_id}")
def create_reconciliation(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    evidence = db.get(
        EvidenceFile,
        evidence_id,
    )

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

    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(
            status_code=500,
            detail="Stored evidence analysis is invalid.",
        ) from exc

    context = build_investigation_context(
        investigation,
        product_name,
    )

    try:
        reconciliation_result = reconcile_evidence(
            investigation=context,
            analysis=analysis_data,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Evidence reconciliation failed.",
        ) from exc

    record = EvidenceReconciliation(
        evidence_id=evidence_id,
        investigation_id=investigation.id,
        status=reconciliation_result["status"],
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
    evidence = db.get(
        EvidenceFile,
        evidence_id,
    )

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
            result = json.loads(
                record.result_json
            )

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