import json

from fastapi import APIRouter, Depends, HTTPException
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import MODEL_NAME
from app.dependencies import get_db
from app.models import (
    EvidenceAnalysis,
    EvidenceExtraction,
    EvidenceFile,
    Investigation,
    Product,
)
from app.schemas.evidence import EvidenceAnalysisResult
from app.services.document_extractor import extract_pdf_text
from app.services.evidence_analyzer import analyze_evidence


router = APIRouter(
    prefix="/api/document-analysis",
    tags=["Document Intelligence"],
)


# ---------------------------------------------------------
# PDF TEXT EXTRACTION
# ---------------------------------------------------------

@router.post("/{evidence_id}/extract")
def extract_evidence_document(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    evidence = db.get(EvidenceFile, evidence_id)

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    if evidence.content_type != "application/pdf":
        raise HTTPException(
            status_code=415,
            detail="Currently only PDF extraction is supported.",
        )

    extracted = extract_pdf_text(evidence.storage_path)

    existing = db.scalar(
        select(EvidenceExtraction).where(
            EvidenceExtraction.evidence_id == evidence_id
        )
    )

    if existing:
        existing.extracted_text = extracted["extracted_text"]
        existing.page_count = extracted["page_count"]
        existing.status = "completed"

        record = existing

    else:
        record = EvidenceExtraction(
            evidence_id=evidence_id,
            extracted_text=extracted["extracted_text"],
            page_count=extracted["page_count"],
            status="completed",
        )

        db.add(record)

    try:
        db.commit()
        db.refresh(record)

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not save extracted document text.",
        )

    return {
        "evidence_id": evidence_id,
        "extraction_id": record.id,
        "status": record.status,
        "page_count": record.page_count,
        "character_count": len(record.extracted_text),
        "extracted_text": record.extracted_text,
    }


# ---------------------------------------------------------
# GET EXTRACTED DOCUMENT TEXT
# ---------------------------------------------------------

@router.get("/{evidence_id}/extraction")
def get_evidence_extraction(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    evidence = db.get(EvidenceFile, evidence_id)

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    record = db.scalar(
        select(EvidenceExtraction).where(
            EvidenceExtraction.evidence_id == evidence_id
        )
    )

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Document has not been extracted yet.",
        )

    return {
        "evidence_id": evidence_id,
        "extraction_id": record.id,
        "status": record.status,
        "page_count": record.page_count,
        "character_count": len(record.extracted_text),
        "extracted_text": record.extracted_text,
    }


# ---------------------------------------------------------
# META MUSE SPARK DOCUMENT ANALYSIS
# ---------------------------------------------------------

@router.post("/{evidence_id}/analyze")
def analyze_uploaded_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    # 1. Find uploaded evidence

    evidence = db.get(EvidenceFile, evidence_id)

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    # 2. Require completed extraction

    extraction = db.scalar(
        select(EvidenceExtraction).where(
            EvidenceExtraction.evidence_id == evidence_id
        )
    )

    if extraction is None:
        raise HTTPException(
            status_code=409,
            detail="Extract the document before analyzing it.",
        )

    if not extraction.extracted_text.strip():
        raise HTTPException(
            status_code=422,
            detail="Extracted document contains no usable text.",
        )

    # 3. Retrieve linked investigation

    investigation = db.get(
        Investigation,
        evidence.investigation_id,
    )

    if investigation is None:
        raise HTTPException(
            status_code=404,
            detail="Linked investigation not found.",
        )

    # 4. Retrieve product information

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

    # 5. Build investigation context

    investigation_context = {
        "investigation_id": investigation.id,
        "product_name": product_name,
        "expected_stock": investigation.expected_stock,
        "physical_stock": investigation.physical_stock,
        "units_sold": investigation.units_sold,
        "expected_remaining_stock": (
            investigation.expected_remaining_stock
        ),
        "discrepancy": investigation.discrepancy,
        "status": investigation.status,
    }

    # 6. Analyze document using Meta Muse Spark

    try:
        analysis = analyze_evidence(
            extracted_text=extraction.extracted_text,
            investigation_context=investigation_context,
        )

    except (APIConnectionError, APITimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Meta Model API is temporarily unavailable.",
        )

    except APIStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Meta Model API returned HTTP {exc.status_code}.",
        )

    except RuntimeError:
        raise HTTPException(
            status_code=500,
            detail="Meta Model API configuration is invalid.",
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )

    # 7. Validate structured analysis

    if not isinstance(analysis, EvidenceAnalysisResult):
        raise HTTPException(
            status_code=502,
            detail="Invalid structured evidence analysis.",
        )

    analysis_data = analysis.model_dump()

    # 8. Find existing analysis

    existing = db.scalar(
        select(EvidenceAnalysis).where(
            EvidenceAnalysis.evidence_id == evidence_id
        )
    )

    serialized_analysis = json.dumps(
        analysis_data,
        ensure_ascii=False,
    )

    # 9. Update or create analysis record

    if existing:
        existing.document_type = analysis.document_type

        existing.is_inventory_relevant = (
            analysis.is_inventory_relevant
        )

        existing.analysis_json = serialized_analysis
        existing.model = MODEL_NAME

        record = existing

    else:
        record = EvidenceAnalysis(
            evidence_id=evidence_id,
            document_type=analysis.document_type,
            is_inventory_relevant=(
                analysis.is_inventory_relevant
            ),
            analysis_json=serialized_analysis,
            model=MODEL_NAME,
        )

        db.add(record)

    # 10. Persist analysis

    try:
        db.commit()
        db.refresh(record)

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Could not save evidence analysis.",
        )

    # 11. Return structured result

    return {
        "analysis_id": record.id,
        "evidence_id": evidence_id,
        "document_type": record.document_type,
        "is_inventory_relevant": (
            record.is_inventory_relevant
        ),
        "model": record.model,
        "analysis": analysis_data,
    }


# ---------------------------------------------------------
# GET SAVED AI ANALYSIS
# ---------------------------------------------------------

@router.get("/{evidence_id}/analysis")
def get_evidence_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    evidence = db.get(EvidenceFile, evidence_id)

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    record = db.scalar(
        select(EvidenceAnalysis).where(
            EvidenceAnalysis.evidence_id == evidence_id
        )
    )

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence analysis not found.",
        )

    try:
        analysis_data = json.loads(record.analysis_json)

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Stored evidence analysis is invalid.",
        )

    return {
        "analysis_id": record.id,
        "evidence_id": evidence_id,
        "document_type": record.document_type,
        "is_inventory_relevant": (
            record.is_inventory_relevant
        ),
        "model": record.model,
        "created_at": record.created_at.isoformat(),
        "analysis": analysis_data,
    }