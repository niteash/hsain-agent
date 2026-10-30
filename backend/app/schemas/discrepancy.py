from pydantic import BaseModel, Field


class ResolveDiscrepancyRequest(BaseModel):
    resolved_by: str = Field(min_length=2, max_length=120)
    resolution_notes: str = Field(min_length=3, max_length=2000)