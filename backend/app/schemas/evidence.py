from typing import Literal

from pydantic import BaseModel, Field, ConfigDict


# ============================================================
# DOCUMENT TYPES
# ============================================================

DocumentType = Literal[
    "supplier_invoice",
    "purchase_receipt",
    "stock_report",
    "sales_report",
    "inventory_count_sheet",
    "delivery_note",
    "other",
]


# ============================================================
# QUANTITY TYPES
# ============================================================

QuantityType = Literal[
    "opening_stock",
    "quantity_delivered",
    "quantity_sold",
    "physical_count",
    "closing_stock",
    "unknown",
]


# ============================================================
# INVENTORY LINE ITEM
# ============================================================

class InventoryLineItem(BaseModel):
    """
    Represents one product line extracted from a document.

    A single invoice can contain multiple InventoryLineItem objects.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    product_name: str | None = None

    sku: str | None = None

    quantity: float | None = Field(
        default=None,
        ge=0,
    )

    quantity_unit: str | None = None

    quantity_type: QuantityType = "unknown"

    unit_price: float | None = Field(
        default=None,
        ge=0,
    )

    total_price: float | None = Field(
        default=None,
        ge=0,
    )

    currency: str | None = None


# ============================================================
# INVENTORY DATA
# ============================================================

class InventoryData(BaseModel):
    """
    Structured inventory information extracted from a document.

    Supports multiple products while retaining legacy fields
    for compatibility with previously stored analysis records.
    """

    # New multi-product structure.
    line_items: list[InventoryLineItem] = Field(
        default_factory=list,
    )

    # Legacy single-product fields.
    # Retained so previously stored analysis JSON remains readable.
    product_name: str | None = None

    quantity: float | None = None

    quantity_type: QuantityType = "unknown"

    unit_price: float | None = None

    invoice_number: str | None = None

    invoice_date: str | None = None

    currency: str | None = None


# ============================================================
# EVIDENCE ANALYSIS RESULT
# ============================================================

class EvidenceAnalysisResult(BaseModel):
    document_type: DocumentType

    is_inventory_relevant: bool

    detected_entities: list[str] = Field(
        default_factory=list,
    )

    inventory_data: InventoryData = Field(
        default_factory=InventoryData,
    )

    observations: list[str] = Field(
        default_factory=list,
    )

    limitations: list[str] = Field(
        default_factory=list,
    )