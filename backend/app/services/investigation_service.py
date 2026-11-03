import json
import logging
import re

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import META_MODELS
from app.models import AIInvestigationReport

from app.services.meta_client import generate_wonder_response
from app.services.investigation_context import (
    build_investigation_context,
)
from app.services.investigation_prompt import (
    build_investigation_prompt,
)

from app.schemas.investigation_report import (
    InvestigationReport,
)


logger = logging.getLogger(__name__)


class InvestigationGenerationError(Exception):
    """Raised when an AI investigation cannot be generated safely."""

    pass


# ============================================================
# AI RESPONSE PARSING
# ============================================================

def parse_ai_json_response(response: str) -> dict:
    """
    Parse the JSON response returned by Muse Wonder.

    Supports:
    - Standard JSON objects
    - JSON wrapped in Markdown code fences

    Rejects:
    - Empty responses
    - Invalid JSON
    - Non-object JSON responses
    """

    if not response or not response.strip():
        raise InvestigationGenerationError(
            "AI returned an empty response."
        )

    cleaned = response.strip()

    # Remove opening Markdown code fence.
    cleaned = re.sub(
        r"^```(?:json)?\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Remove closing Markdown code fence.
    cleaned = re.sub(
        r"\s*```$",
        "",
        cleaned,
    )

    try:
        parsed = json.loads(cleaned)

    except json.JSONDecodeError as exc:
        raise InvestigationGenerationError(
            "AI returned an invalid JSON response."
        ) from exc

    if not isinstance(parsed, dict):
        raise InvestigationGenerationError(
            "AI response must be a JSON object."
        )

    return parsed


# ============================================================
# GENERATE INVESTIGATION REPORT
# ============================================================

def generate_investigation_report(
    db: Session,
    product_id: int,
) -> dict:
    """
    Generate and persist an AI inventory investigation report.

    Workflow:
        1. Build inventory context.
        2. Build investigation prompt.
        3. Generate response using Muse Wonder.
        4. Parse JSON response.
        5. Validate report using Pydantic.
        6. Persist the validated report.
        7. Return the saved report.

    Inventory is never modified by this service.
    """

    try:

        # ----------------------------------------------------
        # 1. BUILD DATABASE CONTEXT
        # ----------------------------------------------------

        context = build_investigation_context(
            db=db,
            product_id=product_id,
        )

        if not context or not context.get("product"):
            raise InvestigationGenerationError(
                "Unable to build investigation context."
            )

        product_name = context["product"].get("name")

        if not product_name:
            raise InvestigationGenerationError(
                "Product information is incomplete."
            )

        # ----------------------------------------------------
        # 2. BUILD INVESTIGATION PROMPT
        # ----------------------------------------------------

        prompt = build_investigation_prompt(context)

        if not prompt:
            raise InvestigationGenerationError(
                "Unable to build the investigation prompt."
            )

        # ----------------------------------------------------
        # 3. GENERATE RESPONSE USING MUSE WONDER
        # ----------------------------------------------------

        raw_response = generate_wonder_response(prompt)

        # ----------------------------------------------------
        # 4. PARSE AI RESPONSE
        # ----------------------------------------------------

        parsed_response = parse_ai_json_response(
            raw_response
        )

        # ----------------------------------------------------
        # 5. VALIDATE REPORT
        # ----------------------------------------------------

        report = InvestigationReport.model_validate(
            parsed_response
        )

        report_data = report.model_dump()

        # ----------------------------------------------------
        # 6. PREPARE DATABASE RECORD
        # ----------------------------------------------------

        db_report = AIInvestigationReport(
            product_id=product_id,
            product_name=product_name,
            model=META_MODELS["wonder"],
            status="completed",
            report_json=json.dumps(
                report_data,
                ensure_ascii=False,
            ),
            context_snapshot=json.dumps(
                context,
                ensure_ascii=False,
                default=str,
            ),
        )

        db.add(db_report)

        # Flush assigns database-generated values while
        # keeping the transaction open.
        db.flush()

        db.refresh(db_report)

        # Prepare the response before committing.
        result = {
            "id": db_report.id,
            "product_id": db_report.product_id,
            "product_name": db_report.product_name,
            "model": db_report.model,
            "status": db_report.status,
            "report": report_data,
            "created_at": db_report.created_at.isoformat(),
        }

        # Commit only after successful persistence and refresh.
        db.commit()

        logger.info(
            "Investigation report generated successfully. "
            "Product ID: %s, Report ID: %s, Model: %s",
            product_id,
            db_report.id,
            META_MODELS["wonder"],
        )

        return result

    # --------------------------------------------------------
    # SCHEMA VALIDATION FAILURE
    # --------------------------------------------------------

    except ValidationError:

        db.rollback()

        logger.exception(
            "Investigation report schema validation failed. "
            "Product ID: %s",
            product_id,
        )

        raise InvestigationGenerationError(
            "AI generated a report that did not meet the required schema."
        ) from None

    # --------------------------------------------------------
    # EXPECTED INVESTIGATION FAILURE
    # --------------------------------------------------------

    except InvestigationGenerationError:

        db.rollback()

        logger.exception(
            "Investigation report generation failed. "
            "Product ID: %s",
            product_id,
        )

        raise

    # --------------------------------------------------------
    # VALUE ERRORS
    # --------------------------------------------------------

    except ValueError:

        db.rollback()

        logger.exception(
            "Invalid investigation input or context. "
            "Product ID: %s",
            product_id,
        )

        raise

    # --------------------------------------------------------
    # UNEXPECTED FAILURE
    # --------------------------------------------------------

    except Exception:

        db.rollback()

        logger.exception(
            "Unexpected investigation service failure. "
            "Product ID: %s",
            product_id,
        )

        raise InvestigationGenerationError(
            "An unexpected error occurred while generating the investigation."
        ) from None


# ============================================================
# RETRIEVE INVESTIGATION REPORT
# ============================================================

def get_investigation_report(
    db: Session,
    report_id: int,
):
    """
    Retrieve one previously generated investigation report.
    """

    record = (
        db.query(AIInvestigationReport)
        .filter(
            AIInvestigationReport.id == report_id
        )
        .first()
    )

    if not record:
        return None

    return {
        "id": record.id,
        "product_id": record.product_id,
        "product_name": record.product_name,
        "model": record.model,
        "status": record.status,
        "report": json.loads(record.report_json),
        "created_at": record.created_at.isoformat(),
    }


# ============================================================
# LIST PRODUCT INVESTIGATION REPORTS
# ============================================================

def get_product_investigation_reports(
    db: Session,
    product_id: int,
    skip: int = 0,
    limit: int = 20,
):
    """
    Retrieve paginated investigation report history
    for a specific product.
    """

    records = (
        db.query(AIInvestigationReport)
        .filter(
            AIInvestigationReport.product_id == product_id
        )
        .order_by(
            AIInvestigationReport.created_at.desc()
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [
        {
            "id": record.id,
            "product_id": record.product_id,
            "product_name": record.product_name,
            "model": record.model,
            "status": record.status,
            "created_at": record.created_at.isoformat(),
        }
        for record in records
    ]