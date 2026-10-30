from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

from sqlalchemy import JSON
def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# PRODUCT
# ============================================================

class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(
        String(120),
        unique=True,
        index=True,
    )

    sku: Mapped[str | None] = mapped_column(
        String(80),
        unique=True,
        nullable=True,
    )

    current_stock: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    movements: Mapped[list["StockMovement"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
    )


# ============================================================
# STOCK MOVEMENT
# ============================================================

class StockMovement(Base):
    __tablename__ = "stock_movements"

    __table_args__ = (
        CheckConstraint(
            "quantity_delta != 0",
            name="ck_stock_movement_nonzero",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        index=True,
    )

    quantity_delta: Mapped[int] = mapped_column(Integer)

    reason: Mapped[str] = mapped_column(
        String(80),
    )

    notes: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    product: Mapped["Product"] = relationship(
        back_populates="movements",
    )


# ============================================================
# INVESTIGATION
# ============================================================

class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[int] = mapped_column(primary_key=True)

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        index=True,
    )

    expected_stock: Mapped[int] = mapped_column(Integer)

    physical_stock: Mapped[int] = mapped_column(Integer)

    units_sold: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    expected_remaining_stock: Mapped[int] = mapped_column(Integer)

    discrepancy: Mapped[int] = mapped_column(Integer)

    status: Mapped[str] = mapped_column(
        String(30),
    )

    investigation: Mapped[str] = mapped_column(Text)

    recommended_action: Mapped[str] = mapped_column(Text)

    evidence_notes: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    # Evidence associated with this investigation.
    evidence_files: Mapped[list["EvidenceFile"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )

    # Reconciliation history associated with this investigation.
    reconciliations: Mapped[list["EvidenceReconciliation"]] = relationship(
        back_populates="investigation",
        cascade="all, delete-orphan",
    )


# ============================================================
# SUPPLIER ORDER
# ============================================================

class SupplierOrder(Base):
    __tablename__ = "supplier_orders"

    id: Mapped[int] = mapped_column(primary_key=True)

    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id"),
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        index=True,
    )

    quantity: Mapped[int] = mapped_column(Integer)

    reason: Mapped[str] = mapped_column(Text)

    status: Mapped[str] = mapped_column(
        String(30),
        default="pending_approval",
        index=True,
    )

    approved_by: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )


# ============================================================
# EVIDENCE FILE
# ============================================================

class EvidenceFile(Base):
    __tablename__ = "evidence_files"

    id: Mapped[int] = mapped_column(primary_key=True)

    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"),
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
    )

    stored_filename: Mapped[str] = mapped_column(
        String(255),
        unique=True,
    )

    content_type: Mapped[str] = mapped_column(
        String(100),
    )

    file_size: Mapped[int] = mapped_column(Integer)

    storage_path: Mapped[str] = mapped_column(
        String(500),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    investigation: Mapped["Investigation"] = relationship(
        back_populates="evidence_files",
    )

    # One extraction per evidence document.
    extraction: Mapped["EvidenceExtraction | None"] = relationship(
        back_populates="evidence",
        cascade="all, delete-orphan",
        uselist=False,
    )

    # One structured AI analysis per evidence document.
    analysis: Mapped["EvidenceAnalysis | None"] = relationship(
        back_populates="evidence",
        cascade="all, delete-orphan",
        uselist=False,
    )

    # Multiple reconciliation attempts per evidence document.
    reconciliations: Mapped[list["EvidenceReconciliation"]] = relationship(
        back_populates="evidence",
        cascade="all, delete-orphan",
    )


# ============================================================
# EVIDENCE EXTRACTION
# ============================================================

class EvidenceExtraction(Base):
    __tablename__ = "evidence_extractions"

    id: Mapped[int] = mapped_column(primary_key=True)

    evidence_id: Mapped[int] = mapped_column(
        ForeignKey("evidence_files.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    extracted_text: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="completed",
    )

    page_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    evidence: Mapped["EvidenceFile"] = relationship(
        back_populates="extraction",
    )


# ============================================================
# EVIDENCE ANALYSIS
# ============================================================

class EvidenceAnalysis(Base):
    __tablename__ = "evidence_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)

    evidence_id: Mapped[int] = mapped_column(
        ForeignKey("evidence_files.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    document_type: Mapped[str] = mapped_column(
        String(50),
    )

    is_inventory_relevant: Mapped[bool] = mapped_column(
        default=False,
    )

    # Stores structured JSON, including multiple invoice line items.
    analysis_json: Mapped[str] = mapped_column(
        Text,
    )

    model: Mapped[str] = mapped_column(
        String(100),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    evidence: Mapped["EvidenceFile"] = relationship(
        back_populates="analysis",
    )


# ============================================================
# EVIDENCE RECONCILIATION
# ============================================================

class EvidenceReconciliation(Base):
    __tablename__ = "evidence_reconciliations"

    id: Mapped[int] = mapped_column(primary_key=True)

    evidence_id: Mapped[int] = mapped_column(
        ForeignKey("evidence_files.id", ondelete="CASCADE"),
        index=True,
    )

    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"),
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(40),
    )

    # Stores all reconciliation checks, conclusions and limitations.
    result_json: Mapped[str] = mapped_column(
        Text,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    evidence: Mapped["EvidenceFile"] = relationship(
        back_populates="reconciliations",
    )

    investigation: Mapped["Investigation"] = relationship(
        back_populates="reconciliations",
    )
    
# ============================================================
# INVENTORY MOVEMENT PROPOSAL
# ============================================================

class InventoryMovementProposal(Base):
    __tablename__ = "inventory_movement_proposals"

    id: Mapped[int] = mapped_column(primary_key=True)

    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id"),
        index=True,
    )

    evidence_id: Mapped[int] = mapped_column(
        ForeignKey("evidence_files.id"),
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        index=True,
    )

    # receipt, sale, adjustment
    movement_type: Mapped[str] = mapped_column(
        String(30),
    )

    # Positive quantity entered by the reviewer.
    quantity: Mapped[int] = mapped_column(Integer)

    # Signed stock effect.
    quantity_delta: Mapped[int] = mapped_column(Integer)

    source_line_item_index: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    reason: Mapped[str] = mapped_column(Text)

    status: Mapped[str] = mapped_column(
        String(30),
        default="pending_approval",
        index=True,
    )

    approved_by: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    stock_movement_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_movements.id"),
        nullable=True,
        unique=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    
    
    
# ============================================================
# INVENTORY MOVEMENT AUDIT LOG
# ============================================================

class MovementAuditLog(Base):
    __tablename__ = "movement_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)

    proposal_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_movement_proposals.id"),
        index=True,
    )

    action: Mapped[str] = mapped_column(
        String(30),
        index=True,
    )

    actor: Mapped[str] = mapped_column(
        String(120),
    )

    previous_status: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    new_status: Mapped[str] = mapped_column(
        String(30),
    )

    details_json: Mapped[str] = mapped_column(
        Text,
        default="{}",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
    )
# ============================================================
# STOCK OPENING BALANCE
# ============================================================

class StockOpeningBalance(Base):
    __tablename__ = "stock_opening_balances"

    id: Mapped[int] = mapped_column(primary_key=True)

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        unique=True,
        index=True,
    )

    opening_quantity: Mapped[int] = mapped_column(Integer)

    effective_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    source: Mapped[str] = mapped_column(
        String(120),
    )

    notes: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    recorded_by: Mapped[str] = mapped_column(
        String(120),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    product: Mapped["Product"] = relationship()
    
# ============================================================
# STOCK DISCREPANCY ALERT
# ============================================================

class StockDiscrepancy(Base):
    __tablename__ = "stock_discrepancies"

    id: Mapped[int] = mapped_column(primary_key=True)

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        index=True,
    )

    # Nullable unique key: only one active alert per product.
    # Set to None when the alert is resolved.
    active_product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id"),
        unique=True,
        nullable=True,
    )

    opening_balance: Mapped[int] = mapped_column(Integer)

    calculated_stock: Mapped[int] = mapped_column(Integer)

    current_stock: Mapped[int] = mapped_column(Integer)

    difference: Mapped[int] = mapped_column(Integer)

    status: Mapped[str] = mapped_column(
        String(30),
        default="open",
        index=True,
    )

    occurrences: Mapped[int] = mapped_column(
        Integer,
        default=1,
    )

    first_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    last_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    resolved_by: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    resolution_notes: Mapped[str] = mapped_column(
        Text,
        default="",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    product: Mapped["Product"] = relationship(
        foreign_keys=[product_id],
    )

# ============================================================
# AI INVESTIGATION REPORT
# ============================================================

class AIInvestigationReport(Base):
    __tablename__ = "ai_investigation_reports"

    id: Mapped[int] = mapped_column(primary_key=True)

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        index=True,
    )

    product_name: Mapped[str] = mapped_column(
        String(255),
    )

    model: Mapped[str] = mapped_column(
        String(100),
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="completed",
        index=True,
    )

    report_json: Mapped[str] = mapped_column(Text)

    context_snapshot: Mapped[str] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
    )