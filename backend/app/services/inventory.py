from typing import Literal

from pydantic import BaseModel, Field, field_validator


class InventoryInvestigationRequest(BaseModel):
    product_name: str = Field(min_length=1, max_length=120)
    expected_stock: int = Field(ge=0)
    physical_stock: int = Field(ge=0)
    units_sold: int = Field(default=0, ge=0)
    evidence_notes: str = Field(default="", max_length=2000)

    @field_validator("product_name")
    @classmethod
    def validate_product_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Product name cannot be empty.")
        return value


class InventoryInvestigationResult(BaseModel):
    product_name: str
    expected_stock: int
    physical_stock: int
    units_sold: int
    expected_remaining_stock: int
    discrepancy: int
    status: Literal["matched", "shortage", "surplus"]
    investigation: str
    recommended_action: str


class EvidenceAwareAnalysis(BaseModel):
    summary: str = Field(min_length=1, max_length=1500)
    possible_causes: list[str] = Field(max_length=5)
    missing_evidence: list[str] = Field(max_length=5)
    recommended_action: str = Field(min_length=1, max_length=1000)
    confidence: Literal["low", "medium", "high"]


def calculate_discrepancy(
    expected_stock: int,
    physical_stock: int,
    units_sold: int = 0,
) -> dict:
    """
    Compare physical stock against expected remaining stock.

    Negative discrepancy: shortage.
    Zero discrepancy: matched.
    Positive discrepancy: surplus.
    """
    if expected_stock < 0 or physical_stock < 0 or units_sold < 0:
        raise ValueError("Stock quantities cannot be negative.")

    if units_sold > expected_stock:
        raise ValueError("Units sold cannot exceed starting stock.")

    expected_remaining = expected_stock - units_sold
    discrepancy = physical_stock - expected_remaining

    if discrepancy == 0:
        status = "matched"
    elif discrepancy < 0:
        status = "shortage"
    else:
        status = "surplus"

    return {
        "expected_remaining_stock": expected_remaining,
        "discrepancy": discrepancy,
        "status": status,
    }