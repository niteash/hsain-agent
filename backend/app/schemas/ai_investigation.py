from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AIInvestigationReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_name: str
    model: str
    status: str
    report: dict
    created_at: datetime


class AIInvestigationReportListItem(BaseModel):
    id: int
    product_id: int
    product_name: str
    model: str
    status: str
    created_at: datetime