from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db

from app.services.investigation_service import (
    generate_investigation_report,
    get_investigation_report,
    get_product_investigation_reports,
    InvestigationGenerationError,
)

from app.schemas.ai_investigation import (
    AIInvestigationReportResponse,
    AIInvestigationReportListItem,
)


router = APIRouter(
    prefix="/api/investigations",
    tags=["AI Investigations"],
)


@router.post(
    "/products/{product_id}/generate",
    response_model=AIInvestigationReportResponse,
)
def generate_report(
    product_id: int,
    db: Session = Depends(get_db),
):

    try:

        return generate_investigation_report(
            db=db,
            product_id=product_id,
        )

    except ValueError as exc:

        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )

    except InvestigationGenerationError as exc:

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )


@router.get(
    "/reports/{report_id}",
    response_model=AIInvestigationReportResponse,
)
def retrieve_report(
    report_id: int,
    db: Session = Depends(get_db),
):

    report = get_investigation_report(
        db=db,
        report_id=report_id,
    )

    if not report:

        raise HTTPException(
            status_code=404,
            detail="Investigation report not found.",
        )

    return report


@router.get(
    "/products/{product_id}/reports",
    response_model=list[AIInvestigationReportListItem],
)
def list_product_reports(
    product_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):

    return get_product_investigation_reports(
        db=db,
        product_id=product_id,
        skip=skip,
        limit=limit,
    )