import json

from collections import defaultdict
from datetime import timezone

from sqlalchemy import case, exists, func
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Product,
    StockMovement,
    StockOpeningBalance,
    StockDiscrepancy,
    Investigation,
    EvidenceFile,
    EvidenceAnalysis,
    EvidenceReconciliation,
    InventoryMovementProposal,
    SupplierOrder,
)

from app.services.reorder_intelligence import (
    calculate_reorder_recommendation,
)


# ============================================================
# CONTEXT LIMITS
# ============================================================

MAX_STOCK_MOVEMENTS = 100
MAX_DISCREPANCIES = 50
MAX_SUPPLIER_ORDERS = 50
MAX_MOVEMENT_PROPOSALS = 100

MAX_PREVIOUS_INVESTIGATIONS = 10
MAX_EVIDENCE_PER_INVESTIGATION = 5
MAX_RECONCILIATIONS_PER_EVIDENCE = 5

MAX_EXTRACTED_TEXT_CHARS = 4000
MAX_ANALYSIS_JSON_CHARS = 12000
MAX_RECONCILIATION_JSON_CHARS = 6000


# ============================================================
# SERIALIZATION HELPERS
# ============================================================

def serialize_datetime(value):
    if not value:
        return None

    if value.tzinfo is None:
        return value.isoformat()

    return value.astimezone(timezone.utc).isoformat()


def truncate_text(value, max_chars):
    """
    Truncate text without modifying its database source.

    The returned value explicitly indicates truncation.
    """

    if value is None:
        return None

    value = str(value)

    if len(value) <= max_chars:
        return value

    return (
        value[:max_chars]
        + "\n[TRUNCATED: original content exceeds context limit]"
    )


def safe_json_loads(value, max_chars=None):
    """
    Safely parse JSON.

    Invalid JSON never gets returned as an unrestricted raw payload.

    Oversized JSON returns a bounded preview with truncation metadata.
    """

    if not value:
        return {}

    if not isinstance(value, str):
        return {
            "parsing_error": True,
            "reason": "Expected JSON string.",
        }

    original_length = len(value)

    if max_chars and original_length > max_chars:
        return {
            "truncated": True,
            "original_characters": original_length,
            "preview": value[:max_chars],
            "reason": "JSON exceeded context size limit.",
        }

    try:
        return json.loads(value)

    except (json.JSONDecodeError, TypeError):
        return {
            "parsing_error": True,
            "preview": value[:1000],
            "original_characters": original_length,
        }


def count_records(db, model, product_id):
    """
    Count matching product records without loading their contents.
    """

    return (
        db.query(func.count(model.id))
        .filter(model.product_id == product_id)
        .scalar()
        or 0
    )


def estimate_context_size(context: dict) -> dict:
    """
    Estimate serialized context size.

    This is a character-based approximation, not an exact
    model tokenizer calculation.
    """

    serialized = json.dumps(
        context,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )

    characters = len(serialized)

    estimated_tokens = (characters + 3) // 4

    return {
        "serialized_characters": characters,
        "estimated_tokens": estimated_tokens,
        "estimation_method": "characters_divided_by_four",
        "is_exact_token_count": False,
    }


# ============================================================
# PRODUCT
# ============================================================

def get_product(db: Session, product_id: int):

    return (
        db.query(Product)
        .options(
            joinedload(Product.preferred_supplier)
        )
        .filter(Product.id == product_id)
        .first()
    )


# ============================================================
# SUPPLIER
# ============================================================

def build_supplier_data(product):

    supplier = product.preferred_supplier

    if not supplier:
        return None

    return {
        "id": supplier.id,
        "name": supplier.name,
        "is_active": supplier.is_active,
    }


def get_supplier_orders(db: Session, product_id: int):

    total = count_records(
        db,
        SupplierOrder,
        product_id,
    )

    orders = (
        db.query(SupplierOrder)
        .options(
            joinedload(SupplierOrder.supplier)
        )
        .filter(
            SupplierOrder.product_id == product_id
        )
        .order_by(
            SupplierOrder.created_at.desc(),
            SupplierOrder.id.desc(),
        )
        .limit(MAX_SUPPLIER_ORDERS)
        .all()
    )

    data = [
        {
            "order_id": order.id,
            "quantity": order.quantity,
            "status": order.status,
            "reason": order.reason,

            "supplier": (
                {
                    "id": order.supplier.id,
                    "name": order.supplier.name,
                    "is_active": order.supplier.is_active,
                }
                if order.supplier
                else None
            ),

            "approved_by": order.approved_by,

            "approved_at": serialize_datetime(
                order.approved_at
            ),

            "created_at": serialize_datetime(
                order.created_at
            ),

            # Approval does not prove supplier delivery.
            "confirmed_incoming_stock": False,
        }
        for order in orders
    ]

    return data, total


# ============================================================
# OPENING BALANCE
# ============================================================

def get_opening_balance(db: Session, product_id: int):

    opening = (
        db.query(StockOpeningBalance)
        .filter(
            StockOpeningBalance.product_id == product_id
        )
        .first()
    )

    if not opening:
        return None

    return {
        "quantity": opening.opening_quantity,

        "effective_at": serialize_datetime(
            opening.effective_at
        ),

        "source": opening.source,
        "notes": opening.notes,
        "recorded_by": opening.recorded_by,
    }


# ============================================================
# STOCK MOVEMENTS
# ============================================================

def get_stock_movements(db: Session, product_id: int):

    total = count_records(
        db,
        StockMovement,
        product_id,
    )

    movements = (
        db.query(StockMovement)
        .filter(
            StockMovement.product_id == product_id
        )
        .order_by(
            StockMovement.created_at.desc(),
            StockMovement.id.desc(),
        )
        .limit(MAX_STOCK_MOVEMENTS)
        .all()
    )

    # Return chronological order within the selected recent window.
    movements.reverse()

    data = [
        {
            "movement_id": movement.id,
            "quantity_delta": movement.quantity_delta,
            "reason": movement.reason,
            "notes": movement.notes,

            "created_at": serialize_datetime(
                movement.created_at
            ),
        }
        for movement in movements
    ]

    return data, total


# ============================================================
# DISCREPANCIES
# ============================================================

def get_discrepancies(db: Session, product_id: int):

    total = count_records(
        db,
        StockDiscrepancy,
        product_id,
    )

    alerts = (
        db.query(StockDiscrepancy)
        .filter(
            StockDiscrepancy.product_id == product_id
        )
        .order_by(
            StockDiscrepancy.created_at.desc(),
            StockDiscrepancy.id.desc(),
        )
        .limit(MAX_DISCREPANCIES)
        .all()
    )

    data = [
        {
            "alert_id": alert.id,
            "opening_balance": alert.opening_balance,
            "calculated_stock": alert.calculated_stock,
            "current_stock": alert.current_stock,
            "difference": alert.difference,
            "status": alert.status,
            "occurrences": alert.occurrences,

            "first_detected_at": serialize_datetime(
                alert.first_detected_at
            ),

            "last_detected_at": serialize_datetime(
                alert.last_detected_at
            ),

            "resolved_at": serialize_datetime(
                alert.resolved_at
            ),

            "resolved_by": alert.resolved_by,
            "resolution_notes": alert.resolution_notes,
        }
        for alert in alerts
    ]

    return data, total


# ============================================================
# MOVEMENT PROPOSALS
# ============================================================

def get_movement_proposals(db: Session, product_id: int):

    total = count_records(
        db,
        InventoryMovementProposal,
        product_id,
    )

    proposals = (
        db.query(InventoryMovementProposal)
        .filter(
            InventoryMovementProposal.product_id == product_id
        )
        .order_by(
            InventoryMovementProposal.created_at.desc(),
            InventoryMovementProposal.id.desc(),
        )
        .limit(MAX_MOVEMENT_PROPOSALS)
        .all()
    )

    data = [
        {
            "proposal_id": proposal.id,
            "investigation_id": proposal.investigation_id,
            "evidence_id": proposal.evidence_id,
            "movement_type": proposal.movement_type,
            "quantity": proposal.quantity,
            "quantity_delta": proposal.quantity_delta,
            "reason": proposal.reason,
            "status": proposal.status,
            "approved_by": proposal.approved_by,

            "approved_at": serialize_datetime(
                proposal.approved_at
            ),

            "stock_movement_id": proposal.stock_movement_id,

            "created_at": serialize_datetime(
                proposal.created_at
            ),
        }
        for proposal in proposals
    ]

    return data, total


# ============================================================
# EVIDENCE RETRIEVAL
# ============================================================

def get_evidence_for_investigations(
    db: Session,
    investigation_ids: list[int],
):
    """
    Retrieve bounded evidence using database-level ranking.

    Evidence ranking priority:

        1. Inventory-relevant evidence.
        2. Evidence with reconciliation history.
        3. Most recently uploaded evidence.

    Only selected evidence records are loaded into ORM memory.

    Reconciliations are independently ranked and bounded
    per evidence file.

    Important:
        Reconciliation history does not automatically mean
        that evidence has been verified.
    """

    if not investigation_ids:
        return {}, {
            "total": 0,
            "included": 0,
            "excluded": 0,
            "selection_strategy": "relevance_ranked",
        }

    # --------------------------------------------------
    # TOTAL EVIDENCE COUNTS
    # --------------------------------------------------

    evidence_counts = (
        db.query(
            EvidenceFile.investigation_id,
            func.count(EvidenceFile.id).label("total"),
        )
        .filter(
            EvidenceFile.investigation_id.in_(
                investigation_ids
            )
        )
        .group_by(
            EvidenceFile.investigation_id
        )
        .all()
    )

    total_by_investigation = {
        investigation_id: total
        for investigation_id, total in evidence_counts
    }

    total_evidence = sum(
        total_by_investigation.values()
    )

    # --------------------------------------------------
    # EVIDENCE RELEVANCE EXPRESSIONS
    # --------------------------------------------------

    has_reconciliation = exists().where(
        EvidenceReconciliation.evidence_id
        == EvidenceFile.id
    )

    relevance_score = case(
        (
            EvidenceAnalysis.is_inventory_relevant.is_(True),
            2,
        ),
        else_=0,
    )

    reconciliation_score = case(
        (
            has_reconciliation,
            1,
        ),
        else_=0,
    )

    # --------------------------------------------------
    # DATABASE-LEVEL EVIDENCE RANKING
    # --------------------------------------------------

    ranked_evidence = (
        db.query(
            EvidenceFile.id.label("evidence_id"),

            EvidenceFile.investigation_id.label(
                "investigation_id"
            ),

            func.row_number().over(
                partition_by=EvidenceFile.investigation_id,

                order_by=(
                    relevance_score.desc(),
                    reconciliation_score.desc(),
                    EvidenceFile.created_at.desc(),
                    EvidenceFile.id.desc(),
                ),
            ).label("row_number"),
        )
        .outerjoin(
            EvidenceAnalysis,
            EvidenceAnalysis.evidence_id == EvidenceFile.id,
        )
        .filter(
            EvidenceFile.investigation_id.in_(
                investigation_ids
            )
        )
        .subquery()
    )

    # --------------------------------------------------
    # FETCH ONLY TOP-RANKED EVIDENCE
    # --------------------------------------------------

    selected_evidence = (
        db.query(EvidenceFile)
        .options(
            joinedload(EvidenceFile.extraction),
            joinedload(EvidenceFile.analysis),
        )
        .join(
            ranked_evidence,
            ranked_evidence.c.evidence_id == EvidenceFile.id,
        )
        .filter(
            ranked_evidence.c.row_number
            <= MAX_EVIDENCE_PER_INVESTIGATION
        )
        .order_by(
            EvidenceFile.investigation_id.asc(),
            ranked_evidence.c.row_number.asc(),
        )
        .all()
    )

    selected_ids = [
        evidence.id
        for evidence in selected_evidence
    ]

    # --------------------------------------------------
    # RECONCILIATION COUNTS
    # --------------------------------------------------

    reconciliation_counts = {}

    if selected_ids:

        reconciliation_rows = (
            db.query(
                EvidenceReconciliation.evidence_id,

                func.count(
                    EvidenceReconciliation.id
                ).label("total"),
            )
            .filter(
                EvidenceReconciliation.evidence_id.in_(
                    selected_ids
                )
            )
            .group_by(
                EvidenceReconciliation.evidence_id
            )
            .all()
        )

        reconciliation_counts = {
            evidence_id: total
            for evidence_id, total in reconciliation_rows
        }

    # --------------------------------------------------
    # DATABASE-LEVEL RECONCILIATION RANKING
    # --------------------------------------------------

    selected_reconciliations = []

    if selected_ids:

        ranked_reconciliations = (
            db.query(
                EvidenceReconciliation.id.label(
                    "reconciliation_id"
                ),

                EvidenceReconciliation.evidence_id.label(
                    "evidence_id"
                ),

                func.row_number().over(
                    partition_by=(
                        EvidenceReconciliation.evidence_id
                    ),

                    order_by=(
                        EvidenceReconciliation.created_at.desc(),
                        EvidenceReconciliation.id.desc(),
                    ),
                ).label("row_number"),
            )
            .filter(
                EvidenceReconciliation.evidence_id.in_(
                    selected_ids
                )
            )
            .subquery()
        )

        selected_reconciliations = (
            db.query(EvidenceReconciliation)
            .join(
                ranked_reconciliations,

                ranked_reconciliations.c.reconciliation_id
                == EvidenceReconciliation.id,
            )
            .filter(
                ranked_reconciliations.c.row_number
                <= MAX_RECONCILIATIONS_PER_EVIDENCE
            )
            .order_by(
                EvidenceReconciliation.evidence_id.asc(),
                ranked_reconciliations.c.row_number.asc(),
            )
            .all()
        )

    # --------------------------------------------------
    # GROUP RECONCILIATIONS
    # --------------------------------------------------

    reconciliations_by_evidence = defaultdict(list)

    for item in selected_reconciliations:

        reconciliations_by_evidence[
            item.evidence_id
        ].append(item)

    # --------------------------------------------------
    # SERIALIZE EVIDENCE
    # --------------------------------------------------

    evidence_data = {}

    for evidence in selected_evidence:

        extraction = evidence.extraction
        analysis = evidence.analysis

        reconciliations = (
            reconciliations_by_evidence.get(
                evidence.id,
                [],
            )
        )

        original_text = (
            extraction.extracted_text or ""
            if extraction
            else ""
        )

        original_text_length = len(original_text)

        total_reconciliations = (
            reconciliation_counts.get(
                evidence.id,
                0,
            )
        )

        evidence_data.setdefault(
            evidence.investigation_id,
            [],
        )

        evidence_data[
            evidence.investigation_id
        ].append({

            "evidence_id": evidence.id,

            "filename": evidence.original_filename,

            "content_type": evidence.content_type,

            "file_size": evidence.file_size,

            "uploaded_at": serialize_datetime(
                evidence.created_at
            ),

            # --------------------------------------------------
            # EXTRACTION
            # --------------------------------------------------

            "extraction": (
                {
                    "extraction_id": extraction.id,

                    "status": extraction.status,

                    "page_count": extraction.page_count,

                    "extracted_text": truncate_text(
                        original_text,
                        MAX_EXTRACTED_TEXT_CHARS,
                    ),

                    "original_text_characters": (
                        original_text_length
                    ),

                    "text_truncated": (
                        original_text_length
                        > MAX_EXTRACTED_TEXT_CHARS
                    ),
                }
                if extraction
                else None
            ),

            # --------------------------------------------------
            # DOCUMENT ANALYSIS
            # --------------------------------------------------

            "analysis": (
                {
                    "analysis_id": analysis.id,

                    "document_type": analysis.document_type,

                    "is_inventory_relevant": (
                        analysis.is_inventory_relevant
                    ),

                    "model": analysis.model,

                    "analysis": safe_json_loads(
                        analysis.analysis_json,
                        MAX_ANALYSIS_JSON_CHARS,
                    ),
                }
                if analysis
                else None
            ),

            # --------------------------------------------------
            # RECONCILIATIONS
            # --------------------------------------------------

            "reconciliations": [
                {
                    "reconciliation_id": item.id,

                    "status": item.status,

                    "result": safe_json_loads(
                        item.result_json,
                        MAX_RECONCILIATION_JSON_CHARS,
                    ),

                    "created_at": serialize_datetime(
                        item.created_at
                    ),
                }
                for item in reconciliations
            ],

            # --------------------------------------------------
            # EVIDENCE METADATA
            # --------------------------------------------------

            "evidence_metadata": {

                "total_reconciliations": (
                    total_reconciliations
                ),

                "included_reconciliations": (
                    len(reconciliations)
                ),

                "excluded_reconciliations": max(
                    0,
                    total_reconciliations
                    - len(reconciliations),
                ),

                "relevance_ranked": True,

                "selection_priority": (
                    "inventory_relevance_then_reconciliation"
                    "_history_then_recency"
                ),
            },
        })

    # --------------------------------------------------
    # EVIDENCE METADATA
    # --------------------------------------------------

    included_evidence = len(
        selected_evidence
    )

    return evidence_data, {

        "total": total_evidence,

        "included": included_evidence,

        "excluded": max(
            0,
            total_evidence - included_evidence,
        ),

        "selection_strategy": "relevance_ranked",

        "database_level_limit": (
            MAX_EVIDENCE_PER_INVESTIGATION
        ),

        "reconciliation_database_level_limit": (
            MAX_RECONCILIATIONS_PER_EVIDENCE
        ),
    }


# ============================================================
# PREVIOUS INVESTIGATIONS
# ============================================================

def get_previous_investigations(
    db: Session,
    product_id: int,
):

    total = count_records(
        db,
        Investigation,
        product_id,
    )

    investigations = (
        db.query(Investigation)
        .filter(
            Investigation.product_id == product_id
        )
        .order_by(
            Investigation.created_at.desc(),
            Investigation.id.desc(),
        )
        .limit(MAX_PREVIOUS_INVESTIGATIONS)
        .all()
    )

    investigation_ids = [
        investigation.id
        for investigation in investigations
    ]

    evidence_by_investigation, evidence_metadata = (
        get_evidence_for_investigations(
            db,
            investigation_ids,
        )
    )

    data = []

    for investigation in investigations:

        data.append({

            "investigation_id": investigation.id,

            "expected_stock": investigation.expected_stock,

            "physical_stock": investigation.physical_stock,

            "units_sold": investigation.units_sold,

            "expected_remaining_stock": (
                investigation.expected_remaining_stock
            ),

            "discrepancy": investigation.discrepancy,

            "status": investigation.status,

            "investigation": investigation.investigation,

            "recommended_action": (
                investigation.recommended_action
            ),

            "evidence_notes": investigation.evidence_notes,

            "created_at": serialize_datetime(
                investigation.created_at
            ),

            "evidence": evidence_by_investigation.get(
                investigation.id,
                [],
            ),
        })

    metadata = {

        "total": total,

        "included": len(investigations),

        "excluded": max(
            0,
            total - len(investigations),
        ),

        "evidence": evidence_metadata,
    }

    return data, metadata


# ============================================================
# MAIN CONTEXT BUILDER
# ============================================================

def build_investigation_context(
    db: Session,
    product_id: int,
) -> dict:

    # --------------------------------------------------
    # PRODUCT
    # --------------------------------------------------

    product = get_product(
        db,
        product_id,
    )

    if not product:
        raise ValueError(
            f"Product with ID {product_id} does not exist."
        )

    # --------------------------------------------------
    # PRODUCT CONFIGURATION
    # --------------------------------------------------

    product_configuration = {

        "minimum_stock": product.minimum_stock,

        "reorder_point": product.reorder_point,

        "maximum_stock": product.maximum_stock,

        "lead_time_days": product.lead_time_days,

        "safety_buffer_days": product.safety_buffer_days,
    }

    # --------------------------------------------------
    # PREFERRED SUPPLIER
    # --------------------------------------------------

    preferred_supplier = build_supplier_data(
        product
    )

    # --------------------------------------------------
    # DETERMINISTIC REORDER INTELLIGENCE
    # --------------------------------------------------

    reorder_recommendation = (
        calculate_reorder_recommendation(
            product=product,
            db=db,
        )
    )

    # --------------------------------------------------
    # SUPPLIER ORDERS
    # --------------------------------------------------

    supplier_orders, total_supplier_orders = (
        get_supplier_orders(
            db,
            product_id,
        )
    )

    # --------------------------------------------------
    # OPENING BALANCE
    # --------------------------------------------------

    opening_data = get_opening_balance(
        db,
        product_id,
    )

    # --------------------------------------------------
    # STOCK MOVEMENTS
    # --------------------------------------------------

    movement_data, total_movements = (
        get_stock_movements(
            db,
            product_id,
        )
    )

    # --------------------------------------------------
    # DISCREPANCIES
    # --------------------------------------------------

    discrepancy_data, total_discrepancies = (
        get_discrepancies(
            db,
            product_id,
        )
    )

    # --------------------------------------------------
    # MOVEMENT PROPOSALS
    # --------------------------------------------------

    proposal_data, total_proposals = (
        get_movement_proposals(
            db,
            product_id,
        )
    )

    # --------------------------------------------------
    # PREVIOUS INVESTIGATIONS AND EVIDENCE
    # --------------------------------------------------

    investigation_data, investigation_metadata = (
        get_previous_investigations(
            db,
            product_id,
        )
    )

    # --------------------------------------------------
    # CONTEXT METADATA
    # --------------------------------------------------

    context_metadata = {

        "product_id": product.id,

        "limits": {

            "stock_movements": MAX_STOCK_MOVEMENTS,

            "discrepancies": MAX_DISCREPANCIES,

            "supplier_orders": MAX_SUPPLIER_ORDERS,

            "movement_proposals": MAX_MOVEMENT_PROPOSALS,

            "previous_investigations": (
                MAX_PREVIOUS_INVESTIGATIONS
            ),

            "evidence_per_investigation": (
                MAX_EVIDENCE_PER_INVESTIGATION
            ),

            "reconciliations_per_evidence": (
                MAX_RECONCILIATIONS_PER_EVIDENCE
            ),

            "extracted_text_characters": (
                MAX_EXTRACTED_TEXT_CHARS
            ),

            "analysis_json_characters": (
                MAX_ANALYSIS_JSON_CHARS
            ),

            "reconciliation_json_characters": (
                MAX_RECONCILIATION_JSON_CHARS
            ),
        },

        "stock_movements": {

            "total": total_movements,

            "included": len(movement_data),

            "excluded": max(
                0,
                total_movements - len(movement_data),
            ),
        },

        "discrepancies": {

            "total": total_discrepancies,

            "included": len(discrepancy_data),

            "excluded": max(
                0,
                total_discrepancies - len(discrepancy_data),
            ),
        },

        "movement_proposals": {

            "total": total_proposals,

            "included": len(proposal_data),

            "excluded": max(
                0,
                total_proposals - len(proposal_data),
            ),
        },

        "supplier_orders": {

            "total": total_supplier_orders,

            "included": len(supplier_orders),

            "excluded": max(
                0,
                total_supplier_orders - len(supplier_orders),
            ),
        },

        "previous_investigations": (
            investigation_metadata
        ),

        "opening_balance_available": (
            opening_data is not None
        ),

        "preferred_supplier_available": (
            preferred_supplier is not None
        ),

        "reorder_intelligence_available": (
            reorder_recommendation is not None
        ),
    }

    # --------------------------------------------------
    # FINAL CONTEXT
    # --------------------------------------------------

    context = {

        "product": {

            "id": product.id,

            "name": product.name,

            "sku": product.sku,

            "current_stock": product.current_stock,

            "created_at": serialize_datetime(
                product.created_at
            ),
        },

        "product_configuration": product_configuration,

        "preferred_supplier": preferred_supplier,

        "reorder_intelligence": reorder_recommendation,

        "supplier_orders": supplier_orders,

        "opening_balance": opening_data,

        "stock_movements": movement_data,

        "discrepancy_history": discrepancy_data,

        "movement_proposals": proposal_data,

        "previous_investigations": investigation_data,

        "context_metadata": context_metadata,
    }

    # --------------------------------------------------
    # CONTEXT SIZE ESTIMATION
    # --------------------------------------------------

    context_metadata["size_estimate"] = (
        estimate_context_size(context)
    )

    return context