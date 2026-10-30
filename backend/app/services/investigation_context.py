import json

from datetime import timezone
from sqlalchemy.orm import Session

from app.models import (
    Product,
    StockMovement,
    StockOpeningBalance,
    StockDiscrepancy,
    Investigation,
    EvidenceFile,
    EvidenceExtraction,
    EvidenceAnalysis,
    EvidenceReconciliation,
    InventoryMovementProposal,
)


def serialize_datetime(value):
    if not value:
        return None

    if value.tzinfo is None:
        return value.isoformat()

    return value.astimezone(timezone.utc).isoformat()


def safe_json_loads(value):
    if not value:
        return {}

    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return {
            "parsing_error": True,
            "raw_value": value,
        }


def build_investigation_context(
    db: Session,
    product_id: int,
) -> dict:

    product = db.query(Product).filter(
        Product.id == product_id
    ).first()

    if not product:
        raise ValueError(
            f"Product with ID {product_id} does not exist."
        )

    # --------------------------------------------------
    # OPENING BALANCE
    # --------------------------------------------------

    opening_balance = db.query(
        StockOpeningBalance
    ).filter(
        StockOpeningBalance.product_id == product_id
    ).first()

    opening_data = None

    if opening_balance:
        opening_data = {
            "quantity": opening_balance.opening_quantity,
            "effective_at": serialize_datetime(
                opening_balance.effective_at
            ),
            "source": opening_balance.source,
            "notes": opening_balance.notes,
            "recorded_by": opening_balance.recorded_by,
        }

    # --------------------------------------------------
    # STOCK MOVEMENT LEDGER
    # --------------------------------------------------

    movements = db.query(
        StockMovement
    ).filter(
        StockMovement.product_id == product_id
    ).order_by(
        StockMovement.created_at.asc()
    ).all()

    movement_data = [
        {
            "movement_id": movement.id,
            "quantity_delta": movement.quantity_delta,
            "reason": movement.reason,
            "notes": movement.notes,
            "created_at": serialize_datetime(
                movement.created_at
            ),
        }
        for movement in movements
    ]

    # --------------------------------------------------
    # DISCREPANCY ALERTS
    # --------------------------------------------------

    discrepancies = db.query(
        StockDiscrepancy
    ).filter(
        StockDiscrepancy.product_id == product_id
    ).order_by(
        StockDiscrepancy.created_at.desc()
    ).all()

    discrepancy_data = [
        {
            "alert_id": alert.id,
            "opening_balance": alert.opening_balance,
            "calculated_stock": alert.calculated_stock,
            "current_stock": alert.current_stock,
            "difference": alert.difference,
            "status": alert.status,
            "occurrences": alert.occurrences,
            "first_detected_at": serialize_datetime(
                alert.first_detected_at
            ),
            "last_detected_at": serialize_datetime(
                alert.last_detected_at
            ),
            "resolved_at": serialize_datetime(
                alert.resolved_at
            ),
            "resolved_by": alert.resolved_by,
            "resolution_notes": alert.resolution_notes,
        }
        for alert in discrepancies
    ]

    # --------------------------------------------------
    # PREVIOUS INVESTIGATIONS AND EVIDENCE
    # --------------------------------------------------

    investigations = db.query(
        Investigation
    ).filter(
        Investigation.product_id == product_id
    ).order_by(
        Investigation.created_at.desc()
    ).all()

    investigation_data = []

    for investigation in investigations:

        evidence_records = db.query(
            EvidenceFile
        ).filter(
            EvidenceFile.investigation_id == investigation.id
        ).all()

        evidence_data = []

        for evidence in evidence_records:

            extraction = db.query(
                EvidenceExtraction
            ).filter(
                EvidenceExtraction.evidence_id == evidence.id
            ).first()

            analysis = db.query(
                EvidenceAnalysis
            ).filter(
                EvidenceAnalysis.evidence_id == evidence.id
            ).first()

            reconciliations = db.query(
                EvidenceReconciliation
            ).filter(
                EvidenceReconciliation.evidence_id == evidence.id,
                EvidenceReconciliation.investigation_id
                == investigation.id,
            ).order_by(
                EvidenceReconciliation.created_at.desc()
            ).all()

            evidence_data.append({
                "evidence_id": evidence.id,
              "filename": evidence.original_filename,
                "content_type": evidence.content_type,
                "file_size": evidence.file_size,
                "uploaded_at": serialize_datetime(
                    evidence.created_at
                ),

                "extraction": {
                    "status": extraction.status,
                    "page_count": extraction.page_count,
                    "extracted_text": extraction.extracted_text,
                } if extraction else None,

                "analysis": {
                    "document_type": analysis.document_type,
                    "is_inventory_relevant": (
                        analysis.is_inventory_relevant
                    ),
                    "model": analysis.model,
                    "analysis": safe_json_loads(
                        analysis.analysis_json
                    ),
                } if analysis else None,

                "reconciliations": [
                    {
                        "status": item.status,
                        "result": safe_json_loads(
                            item.result_json
                        ),
                        "created_at": serialize_datetime(
                            item.created_at
                        ),
                    }
                    for item in reconciliations
                ],
            })

        investigation_data.append({
            "investigation_id": investigation.id,
            "expected_stock": investigation.expected_stock,
            "physical_stock": investigation.physical_stock,
            "units_sold": investigation.units_sold,
            "expected_remaining_stock": (
                investigation.expected_remaining_stock
            ),
            "discrepancy": investigation.discrepancy,
            "status": investigation.status,
            "investigation": investigation.investigation,
            "recommended_action": (
                investigation.recommended_action
            ),
            "evidence_notes": investigation.evidence_notes,
            "created_at": serialize_datetime(
                investigation.created_at
            ),
            "evidence": evidence_data,
        })

    # --------------------------------------------------
    # MOVEMENT PROPOSALS
    # --------------------------------------------------

    proposals = db.query(
        InventoryMovementProposal
    ).filter(
        InventoryMovementProposal.product_id == product_id
    ).order_by(
        InventoryMovementProposal.created_at.desc()
    ).all()

    proposal_data = [
        {
            "proposal_id": proposal.id,
            "investigation_id": proposal.investigation_id,
            "evidence_id": proposal.evidence_id,
            "movement_type": proposal.movement_type,
            "quantity": proposal.quantity,
            "quantity_delta": proposal.quantity_delta,
            "reason": proposal.reason,
            "status": proposal.status,
            "approved_by": proposal.approved_by,
            "approved_at": serialize_datetime(
                proposal.approved_at
            ),
            "stock_movement_id": proposal.stock_movement_id,
            "created_at": serialize_datetime(
                proposal.created_at
            ),
        }
        for proposal in proposals
    ]

    # --------------------------------------------------
    # FINAL CONTEXT
    # --------------------------------------------------

    return {
        "product": {
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "current_stock": product.current_stock,
            "created_at": serialize_datetime(
                product.created_at
            ),
        },

        "opening_balance": opening_data,

        "stock_movements": movement_data,

        "discrepancy_history": discrepancy_data,

        "movement_proposals": proposal_data,

        "previous_investigations": investigation_data,

        "context_metadata": {
            "product_id": product.id,
            "total_movements": len(movement_data),
            "total_discrepancy_alerts": len(discrepancy_data),
            "total_proposals": len(proposal_data),
            "total_previous_investigations": len(
                investigation_data
            ),
            "opening_balance_available": (
                opening_balance is not None
            ),
        },
    }
    