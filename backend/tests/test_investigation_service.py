import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services.investigation_service import (
    parse_ai_json_response,
    generate_investigation_report,
    InvestigationGenerationError,
)

from tests.test_investigation_report_schema import valid_report


def test_parse_valid_json():
    response = json.dumps(valid_report())

    result = parse_ai_json_response(response)

    assert result["report_title"] == "Inventory Investigation Report"


def test_parse_markdown_json():
    response = (
        "```json\n"
        + json.dumps(valid_report())
        + "\n```"
    )

    result = parse_ai_json_response(response)

    assert "executive_summary" in result


def test_reject_invalid_json():
    with pytest.raises(InvestigationGenerationError):
        parse_ai_json_response("This is not JSON")


def test_reject_empty_response():
    with pytest.raises(InvestigationGenerationError):
        parse_ai_json_response("")


@patch(
    "app.services.investigation_service.generate_response"
)
@patch(
    "app.services.investigation_service.build_investigation_context"
)
def test_generate_investigation_report(
    mock_context,
    mock_generate,
):
    mock_db = MagicMock()

    context = {
        "product": {
            "id": 1,
            "name": "Coca-Cola 500ml",
            "current_stock": 24,
        },
        "context_metadata": {
            "total_movements": 0,
        },
    }

    mock_context.return_value = context

    mock_generate.return_value = json.dumps(
        valid_report()
    )

    # Simulate database-generated values.
    def simulate_refresh(obj):
        obj.id = 101
        obj.created_at = datetime.now(timezone.utc)

    mock_db.refresh.side_effect = simulate_refresh

    result = generate_investigation_report(
        db=mock_db,
        product_id=1,
    )

    # Verify returned report.
    assert result["id"] == 101
    assert result["product_id"] == 1
    assert result["product_name"] == "Coca-Cola 500ml"
    assert result["model"] is not None
    assert result["status"] == "completed"
    assert result["report"]["report_title"] == (
        "Inventory Investigation Report"
    )
    assert result["created_at"] is not None

    # Verify persistence.
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()

    # Verify AI generation.
    mock_context.assert_called_once_with(
        db=mock_db,
        product_id=1,
    )
    mock_generate.assert_called_once()


@patch(
    "app.services.investigation_service.generate_response"
)
@patch(
    "app.services.investigation_service.build_investigation_context"
)
def test_reject_invalid_ai_report(
    mock_context,
    mock_generate,
):
    mock_db = MagicMock()

    mock_context.return_value = {
        "product": {
            "id": 1,
            "name": "Coca-Cola 500ml",
        },
        "context_metadata": {},
    }

    invalid_report = valid_report()
    invalid_report["risk_assessment"]["level"] = "extreme"

    mock_generate.return_value = json.dumps(
        invalid_report
    )

    with pytest.raises(InvestigationGenerationError):
        generate_investigation_report(
            db=mock_db,
            product_id=1,
        )

    # Invalid AI output must not be persisted.
    mock_db.add.assert_not_called()
    mock_db.commit.assert_not_called()
    mock_db.rollback.assert_called_once()