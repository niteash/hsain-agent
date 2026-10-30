from typing import Literal

from pydantic import BaseModel, Field, ConfigDict


MovementType = Literal[
    "receipt",
    "sale",
    "adjustment",
]


class MovementProposalCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    movement_type: MovementType

    quantity: int = Field(
        gt=0,
        le=1000000,
    )

    source_line_item_index: int | None = Field(
        default=None,
        ge=0,
    )

    reason: str = Field(
        min_length=5,
        max_length=1000,
    )


class MovementDecision(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    decision: Literal["approve", "reject"]

    approved_by: str = Field(
        min_length=2,
        max_length=120,
    )

    rejection_reason: str | None = Field(
        default=None,
        max_length=1000,
    )


class MovementProposalResponse(BaseModel):
    id: int
    investigation_id: int
    evidence_id: int
    product_id: int

    movement_type: MovementType

    quantity: int
    quantity_delta: int

    source_line_item_index: int | None

    reason: str
    status: str

    approved_by: str | None
    approved_at: str | None

    rejection_reason: str | None
    stock_movement_id: int | None
    created_at: str


class MovementAuditResponse(BaseModel):
    id: int
    proposal_id: int
    action: str
    actor: str
    previous_status: str | None
    new_status: str
    details: dict
    created_at: str