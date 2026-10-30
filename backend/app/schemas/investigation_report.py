from typing import Literal

from pydantic import BaseModel, Field, ConfigDict


ConfidenceLevel = Literal["high", "medium", "low"]

RiskLevel = Literal["low", "medium", "high", "critical"]

PriorityLevel = Literal["low", "medium", "high", "critical"]


class StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CurrentInventoryPosition(StrictBaseModel):
    current_stock: int | None
    opening_balance: int | None
    ledger_movement_count: int = Field(ge=0)
    assessment: str


class VerifiedFact(StrictBaseModel):
    fact: str
    source: str
    confidence: ConfidenceLevel


class HistoricalFinding(StrictBaseModel):
    finding: str
    source: str
    timestamp: str | None
    status: str


class DiscrepancyFinding(StrictBaseModel):
    description: str
    quantity_difference: int | None
    status: str
    explanation: str


class PossibleExplanation(StrictBaseModel):
    explanation: str
    supporting_information: str
    confidence: ConfidenceLevel


class RiskAssessment(StrictBaseModel):
    level: RiskLevel
    reason: str


class RecommendedAction(StrictBaseModel):
    action: str
    priority: PriorityLevel
    requires_human_approval: bool = True


class InvestigationReport(StrictBaseModel):
    report_title: str

    executive_summary: str

    current_inventory_position: CurrentInventoryPosition

    verified_facts: list[VerifiedFact] = Field(
        default_factory=list
    )

    historical_findings: list[HistoricalFinding] = Field(
        default_factory=list
    )

    discrepancies: list[DiscrepancyFinding] = Field(
        default_factory=list
    )

    possible_explanations: list[PossibleExplanation] = Field(
        default_factory=list
    )

    missing_information: list[str] = Field(
        default_factory=list
    )

    risk_assessment: RiskAssessment

    recommended_actions: list[RecommendedAction] = Field(
        default_factory=list
    )

    final_conclusion: str

    root_cause_identified: bool

    human_verification_required: bool = True