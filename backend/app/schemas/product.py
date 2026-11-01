from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class StockThresholdFields(BaseModel):
    minimum_stock: int | None = Field(default=None, ge=0)
    reorder_point: int | None = Field(default=None, ge=0)
    maximum_stock: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_threshold_order(self):
        minimum = self.minimum_stock
        reorder = self.reorder_point
        maximum = self.maximum_stock

        if minimum is not None and reorder is not None:
            if minimum > reorder:
                raise ValueError(
                    "Minimum stock cannot exceed the reorder point."
                )

        if reorder is not None and maximum is not None:
            if reorder > maximum:
                raise ValueError(
                    "Reorder point cannot exceed maximum stock."
                )

        if minimum is not None and maximum is not None:
            if minimum > maximum:
                raise ValueError(
                    "Minimum stock cannot exceed maximum stock."
                )

        return self


class SupplierSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    contact_person: str | None
    email: str | None
    phone: str | None
    is_active: bool


class ProductCreate(StockThresholdFields):
    name: str = Field(min_length=2, max_length=120)
    sku: str | None = Field(default=None, max_length=80)

    lead_time_days: int | None = Field(default=None, ge=0)
    safety_buffer_days: int | None = Field(default=None, ge=0)
    preferred_supplier_id: int | None = Field(default=None, gt=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()

        if len(value) < 2:
            raise ValueError(
                "Product name must contain at least 2 characters."
            )

        return value

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, value: str | None) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    sku: str | None = Field(default=None, max_length=80)

    minimum_stock: int | None = Field(default=None, ge=0)
    reorder_point: int | None = Field(default=None, ge=0)
    maximum_stock: int | None = Field(default=None, ge=0)

    lead_time_days: int | None = Field(default=None, ge=0)
    safety_buffer_days: int | None = Field(default=None, ge=0)
    preferred_supplier_id: int | None = Field(default=None, gt=0)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None

        value = value.strip()

        if len(value) < 2:
            raise ValueError(
                "Product name must contain at least 2 characters."
            )

        return value

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, value: str | None) -> str | None:
        if value is None:
            return None

        return value.strip() or None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sku: str | None
    current_stock: int

    minimum_stock: int | None
    reorder_point: int | None
    maximum_stock: int | None

    lead_time_days: int | None
    safety_buffer_days: int | None

    preferred_supplier_id: int | None
    preferred_supplier: SupplierSummaryResponse | None = None

    created_at: datetime