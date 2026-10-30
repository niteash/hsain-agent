import pytest

from pydantic import ValidationError

from app.schemas.investigation_report import InvestigationReport


def valid_report():

    return {
        "report_title": "Inventory Investigation Report",
        "executive_summary": "Current stock matches the opening balance.",
        "current_inventory_position": {
            "current_stock": 24,
            "opening_balance": 24,
            "ledger_movement_count": 0,
            "assessment": "No recorded stock movements."
        },
        "verified_facts": [
            {
                "fact": "Current stock is 24.",
                "source": "Products database",
                "confidence": "high"
            }
        ],
        "historical_findings": [],
        "discrepancies": [],
        "possible_explanations": [],
        "missing_information": [],
        "risk_assessment": {
            "level": "low",
            "reason": "No current discrepancy is recorded."
        },
        "recommended_actions": [
            {
                "action": "Perform a physical stock count.",
                "priority": "medium",
                "requires_human_approval": True
            }
        ],
        "final_conclusion": "No current discrepancy is established.",
        "root_cause_identified": False,
        "human_verification_required": True
    }


def test_valid_report():

    report = InvestigationReport.model_validate(
        valid_report()
    )

    assert report.current_inventory_position.current_stock == 24


def test_invalid_confidence():

    data = valid_report()

    data["verified_facts"][0]["confidence"] = "certain"

    with pytest.raises(ValidationError):
        InvestigationReport.model_validate(data)


def test_invalid_risk_level():

    data = valid_report()

    data["risk_assessment"]["level"] = "extreme"

    with pytest.raises(ValidationError):
        InvestigationReport.model_validate(data)


def test_unknown_fields_rejected():

    data = valid_report()

    data["unknown_field"] = "unexpected"

    with pytest.raises(ValidationError):
        InvestigationReport.model_validate(data)


def test_missing_required_field():

    data = valid_report()

    del data["executive_summary"]

    with pytest.raises(ValidationError):
        InvestigationReport.model_validate(data)