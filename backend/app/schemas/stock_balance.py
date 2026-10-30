from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class OpeningBalanceCreate(BaseModel):
    opening_quantity: int = Field(ge=0)
    source: str = Field(min_length=2, max_length=120)
    recorded_by: str = Field(min_length=2, max_length=120)
    notes: str = Field(default="", max_length=2000)
    effective_at: datetime | None = None


class OpeningBalanceResponse(BaseModel):
    id: int
    product_id: int
    opening_quantity: int
    effective_at: datetime
    source: str
    notes: str
    recorded_by: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)