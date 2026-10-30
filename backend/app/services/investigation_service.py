import json
import re

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import MODEL_NAME

from app.services.meta_client import generate_response

from app.services.investigation_context import (
    build_investigation_context,
)

from app.services.investigation_prompt import (
    build_investigation_prompt,
)

from app.schemas.investigation_report import (
    InvestigationReport,
)

from app.models import AIInvestigationReport


class InvestigationGenerationError(Exception):
    pass


def parse_ai_json_response(response: str) -> dict:

    if not response or not response.strip():
        raise InvestigationGenerationError(
            "AI returned an empty response."
        )

    cleaned = response.strip()

    cleaned = re.sub(
        r"^```(?:json)?\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    cleaned = re.sub(
        r"\s*```$",
        "",
        cleaned,
    )

    try:
        parsed = json.loads(cleaned)

    except json.JSONDecodeError as exc:
        raise InvestigationGenerationError(
            f"AI returned invalid JSON: {exc}"
        ) from exc

    if not isinstance(parsed, dict):
        raise InvestigationGenerationError(
            "AI response must be a JSON object."
        )

    return parsed


def generate_investigation_report(
    db: Session,
    product_id: int,
) -> dict:

    try:

        # 1. Build database context.
        context = build_investigation_context(
            db=db,
            product_id=product_id,
        )

        # 2. Build AI prompt.
        prompt = build_investigation_prompt(context)

        # 3. Generate AI response.
        raw_response = generate_response(prompt)

        # 4. Parse response.
        parsed_response = parse_ai_json_response(
            raw_response
        )

        # 5. Validate response.
        report = InvestigationReport.model_validate(
            parsed_response
        )

        report_data = report.model_dump()

        # 6. Persist report.
        db_report = AIInvestigationReport(
            product_id=product_id,
            product_name=context["product"]["name"],
            model=MODEL_NAME,
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
        db.commit()
        db.refresh(db_report)

    
   # 7. Return saved report.
        return {
            "id": db_report.id,
            "product_id": product_id,
            "product_name": db_report.product_name,
            "model": db_report.model,
            "status": db_report.status,
            "report": report_data,
            "created_at": db_report.created_at.isoformat(),
            }
    except ValidationError as exc:

        db.rollback()

        raise InvestigationGenerationError(
            f"AI report failed schema validation: {exc}"
        ) from exc

    except InvestigationGenerationError:

        db.rollback()
        raise

    except ValueError:

        db.rollback()
        raise

    except Exception as exc:

        db.rollback()

        raise InvestigationGenerationError(
            f"Investigation generation failed: {exc}"
        ) from exc


def get_investigation_report(
    db: Session,
    report_id: int,
):

    record = db.query(
        AIInvestigationReport
    ).filter(
        AIInvestigationReport.id == report_id
    ).first()

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


def get_product_investigation_reports(
    db: Session,
    product_id: int,
    skip: int = 0,
    limit: int = 20,
):

    records = db.query(
        AIInvestigationReport
    ).filter(
        AIInvestigationReport.product_id == product_id
    ).order_by(
        AIInvestigationReport.created_at.desc()
    ).offset(
        skip
    ).limit(
        limit
    ).all()

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