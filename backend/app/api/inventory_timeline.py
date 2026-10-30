import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_db

from app.models import (
    EvidenceAnalysis,
    EvidenceFile,
    Investigation,
    Product,
)

from app.services.inventory_timeline import (
    get_document_events,
    build_product_timeline,
)


router = APIRouter(
    prefix="/api/investigations",
    tags=["Inventory Timeline"],
)


@router.get("/{investigation_id}/timeline")
def get_investigation_timeline(
    investigation_id: int,
    db: Session = Depends(get_db),
):

    # ============================================
    # GET INVESTIGATION
    # ============================================

    investigation = db.get(
        Investigation,
        investigation_id,
    )

    if investigation is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found.",
        )

    # ============================================
    # GET PRODUCT
    # ============================================

    product = db.get(
        Product,
        investigation.product_id,
    )

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation product not found.",
        )

    # ============================================
    # GET EVIDENCE FILES
    # ============================================

    evidence_statement = (
        select(EvidenceFile)
        .where(
            EvidenceFile.investigation_id == investigation_id
        )
        .order_by(EvidenceFile.id.asc())
    )

    evidence_files = db.scalars(
        evidence_statement
    ).all()

    records = []

    # ============================================
    # LOAD SAVED ANALYSES
    # ============================================

    for evidence in evidence_files:

        analysis_record = db.scalar(
            select(EvidenceAnalysis).where(
                EvidenceAnalysis.evidence_id == evidence.id
            )
        )

        if analysis_record is None:
            continue

        try:
            analysis_data = json.loads(
                analysis_record.analysis_json
            )

        except (json.JSONDecodeError, TypeError):
            continue

        # Use the authoritative database document type.
        analysis_data["document_type"] = (
            analysis_record.document_type
        )

        records.append({
            "evidence_id": evidence.id,
            "original_filename": evidence.original_filename,
            "created_at": (
                evidence.created_at.isoformat()
                if evidence.created_at
                else None
            ),
            "analysis": analysis_data,
        })

    # ============================================
    # BUILD TIMELINE
    # ============================================

    investigation_context = {
        "investigation_id": investigation.id,
        "product_id": product.id,
        "product_name": product.name,
        "sku": product.sku,
        "expected_stock": investigation.expected_stock,
        "physical_stock": investigation.physical_stock,
        "units_sold": investigation.units_sold,
        "expected_remaining_stock": (
            investigation.expected_remaining_stock
        ),
        "discrepancy": investigation.discrepancy,
    }

    events = get_document_events(records)

    timeline = build_product_timeline(
        investigation=investigation_context,
        events=events,
    )

    return {
        "investigation_id": investigation.id,
        "product": {
            "product_id": product.id,
            "name": product.name,
            "sku": product.sku,
            "current_stock": product.current_stock,
        },
        "investigation_summary": {
            "expected_stock": investigation.expected_stock,
            "physical_stock": investigation.physical_stock,
            "expected_remaining_stock": (
                investigation.expected_remaining_stock
            ),
            "discrepancy": investigation.discrepancy,
            "status": investigation.status,
        },
        "documents_analyzed": len(records),
        "timeline": timeline,
    }