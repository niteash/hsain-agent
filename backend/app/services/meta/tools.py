import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    EvidenceFile,
    Investigation,
    Product,
    StockMovement,
    Supplier,
    SupplierOrder,
)
from app.services.reorder_intelligence import (
    calculate_reorder_recommendation,
)

logger = logging.getLogger(__name__)


# ============================================================
# TOOL 1: INVENTORY SUMMARY
# ============================================================

def get_inventory_summary(db: Session) -> dict[str, Any]:

    total_products = db.scalar(
        select(func.count(Product.id))
    ) or 0

    total_units = db.scalar(
        select(func.coalesce(func.sum(Product.current_stock), 0))
    ) or 0

    out_of_stock = db.scalar(
        select(func.count(Product.id)).where(
            Product.current_stock <= 0
        )
    ) or 0

    below_minimum = db.scalar(
        select(func.count(Product.id)).where(
            Product.minimum_stock.is_not(None),
            Product.current_stock <= Product.minimum_stock,
        )
    ) or 0

    below_reorder_point = db.scalar(
        select(func.count(Product.id)).where(
            Product.reorder_point.is_not(None),
            Product.current_stock <= Product.reorder_point,
        )
    ) or 0

    return {
        "total_products": total_products,
        "total_units_in_stock": total_units,
        "out_of_stock_products": out_of_stock,
        "below_minimum_stock": below_minimum,
        "below_configured_reorder_point": below_reorder_point,
    }


# ============================================================
# TOOL 2: PRODUCT DETAILS
# ============================================================

def get_product_details(
    db: Session,
    product_id: int,
) -> dict[str, Any]:

    product = db.scalar(
        select(Product)
        .options(joinedload(Product.preferred_supplier))
        .where(Product.id == product_id)
    )

    if product is None:
        return {
            "found": False,
            "message": "Product not found.",
        }

    return {
        "found": True,
        "product": {
            "id": product.id,
            "name": product.name,
            "sku": product.sku,
            "current_stock": product.current_stock,
            "minimum_stock": product.minimum_stock,
            "reorder_point": product.reorder_point,
            "maximum_stock": product.maximum_stock,
            "lead_time_days": product.lead_time_days,
            "safety_buffer_days": product.safety_buffer_days,
            "preferred_supplier": (
                {
                    "id": product.preferred_supplier.id,
                    "name": product.preferred_supplier.name,
                    "is_active": product.preferred_supplier.is_active,
                }
                if product.preferred_supplier
                else None
            ),
        },
    }


# ============================================================
# TOOL 3: PRODUCTS REQUIRING REPLENISHMENT
# ============================================================

def get_products_at_risk(
    db: Session,
) -> dict[str, Any]:

    products = db.scalars(
        select(Product).order_by(Product.id.asc())
    ).all()

    results = []

    for product in products:

        recommendation = calculate_reorder_recommendation(
            product=product,
            db=db,
        )

        if recommendation["decision"]["reorder_required"]:
            results.append(recommendation)

    urgency_order = {
        "critical": 0,
        "high": 1,
        "medium": 2,
        "normal": 3,
        "undetermined": 4,
    }

    results.sort(
        key=lambda item: (
            urgency_order[item["decision"]["urgency"]],
            item["product_name"].casefold(),
        )
    )

    return {
        "total_products_requiring_replenishment": len(results),
        "items": results,
        "source": "deterministic_reorder_intelligence_service",
        "automatically_ordered": False,
        "inventory_modified": False,
        "requires_human_approval": True,
    }


# ============================================================
# TOOL 4: STOCK MOVEMENT HISTORY
# ============================================================

def get_stock_movements(
    db: Session,
    product_id: int,
    limit: int = 20,
) -> dict[str, Any]:

    product = db.get(Product, product_id)

    if product is None:
        return {
            "found": False,
            "message": "Product not found.",
        }

    limit = max(1, min(limit, 100))

    movements = db.scalars(
        select(StockMovement)
        .where(StockMovement.product_id == product_id)
        .order_by(StockMovement.created_at.desc())
        .limit(limit)
    ).all()

    return {
        "found": True,
        "product": {
            "id": product.id,
            "name": product.name,
        },
        "total_returned": len(movements),
        "movements": [
            {
                "id": movement.id,
                "quantity_delta": movement.quantity_delta,
                "reason": movement.reason,
                "notes": movement.notes,
                "created_at": movement.created_at.isoformat(),
            }
            for movement in movements
        ],
    }


# ============================================================
# TOOL 5: INVESTIGATION DETAILS
# ============================================================

def get_investigation_details(
    db: Session,
    investigation_id: int,
) -> dict[str, Any]:

    investigation = db.scalar(
        select(Investigation)
        .options(
            joinedload(Investigation.product),
            joinedload(Investigation.evidence_files),
        )
        .where(Investigation.id == investigation_id)
    )

    if investigation is None:
        return {
            "found": False,
            "message": "Investigation not found.",
        }

    return {
        "found": True,
        "investigation": {
            "id": investigation.id,
            "product": {
                "id": investigation.product.id,
                "name": investigation.product.name,
            },
            "expected_stock": investigation.expected_stock,
            "physical_stock": investigation.physical_stock,
            "units_sold": investigation.units_sold,
            "expected_remaining_stock": (
                investigation.expected_remaining_stock
            ),
            "discrepancy": investigation.discrepancy,
            "status": investigation.status,
            "investigation": investigation.investigation,
            "recommended_action": investigation.recommended_action,
            "evidence_notes": investigation.evidence_notes,
            "created_at": investigation.created_at.isoformat(),
            "evidence_files": [
                {
                    "id": evidence.id,
                    "filename": evidence.original_filename,
                    "content_type": evidence.content_type,
                    "created_at": evidence.created_at.isoformat(),
                }
                for evidence in investigation.evidence_files
            ],
        },
    }


# ============================================================
# TOOL 6: SUPPLIER DETAILS
# ============================================================

def get_supplier_details(
    db: Session,
    supplier_id: int,
) -> dict[str, Any]:

    supplier = db.get(Supplier, supplier_id)

    if supplier is None:
        return {
            "found": False,
            "message": "Supplier not found.",
        }

    products = db.scalars(
        select(Product).where(
            Product.preferred_supplier_id == supplier_id
        )
    ).all()

    return {
        "found": True,
        "supplier": {
            "id": supplier.id,
            "name": supplier.name,
            "contact_person": supplier.contact_person,
            "email": supplier.email,
            "phone": supplier.phone,
            "address": supplier.address,
            "is_active": supplier.is_active,
        },
        "associated_products": [
            {
                "id": product.id,
                "name": product.name,
                "current_stock": product.current_stock,
            }
            for product in products
        ],
    }


# ============================================================
# TOOL 7: SUPPLIER ORDER PROPOSALS
# ============================================================

def get_supplier_order_proposals(
    db: Session,
    product_id: int,
) -> dict[str, Any]:

    product = db.get(Product, product_id)

    if product is None:
        return {
            "found": False,
            "message": "Product not found.",
        }

    orders = db.scalars(
        select(SupplierOrder)
        .options(joinedload(SupplierOrder.supplier))
        .where(SupplierOrder.product_id == product_id)
        .order_by(SupplierOrder.created_at.desc())
    ).all()

    return {
        "found": True,
        "product": {
            "id": product.id,
            "name": product.name,
        },
        "total_proposals": len(orders),
        "proposals": [
            {
                "id": order.id,
                "quantity": order.quantity,
                "status": order.status,
                "reason": order.reason,
                "supplier": (
                    order.supplier.name
                    if order.supplier
                    else None
                ),
                "approved_by": order.approved_by,
                "approved_at": (
                    order.approved_at.isoformat()
                    if order.approved_at
                    else None
                ),
                "created_at": order.created_at.isoformat(),
                "confirmed_incoming_stock": False,
            }
            for order in orders
        ],
        "warning": (
            "Supplier-order proposals must not be treated as "
            "confirmed incoming inventory."
        ),
    }


# ============================================================
# TOOL DEFINITIONS: RESPONSES API FORMAT
# ============================================================

TOOL_DEFINITIONS = [

    {
        "type": "function",
        "name": "get_inventory_summary",
        "description": (
            "Retrieve an overview of the entire inventory, including "
            "product count, total stock units, out-of-stock products, "
            "and products below configured stock thresholds."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
        "strict": True,
    },

    {
        "type": "function",
        "name": "get_product_details",
        "description": (
            "Retrieve detailed information about one product "
            "using its database product ID."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_id": {
                    "type": "integer",
                },
            },
            "required": ["product_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },

    {
        "type": "function",
        "name": "get_products_at_risk",
        "description": (
            "Identify products requiring replenishment. "
            "Uses Hsain Agent's existing deterministic reorder "
            "intelligence service. Never calculate reorder quantities "
            "independently."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
        "strict": True,
    },

    {
        "type": "function",
        "name": "get_stock_movements",
        "description": (
            "Retrieve recent stock movement records for a product."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_id": {
                    "type": "integer",
                },
                "limit": {
                    "type": "integer",
                },
            },
            "required": ["product_id", "limit"],
            "additionalProperties": False,
        },
        "strict": True,
    },

    {
        "type": "function",
        "name": "get_investigation_details",
        "description": (
            "Retrieve an existing inventory discrepancy investigation "
            "and its attached evidence-file metadata."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "investigation_id": {
                    "type": "integer",
                },
            },
            "required": ["investigation_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },

    {
        "type": "function",
        "name": "get_supplier_details",
        "description": (
            "Retrieve supplier information and associated products."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "supplier_id": {
                    "type": "integer",
                },
            },
            "required": ["supplier_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },

    {
        "type": "function",
        "name": "get_supplier_order_proposals",
        "description": (
            "Retrieve supplier-order proposals for a product. "
            "These proposals are not confirmed incoming inventory."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_id": {
                    "type": "integer",
                },
            },
            "required": ["product_id"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]


# ============================================================
# TOOL EXECUTION REGISTRY
# ============================================================

TOOL_EXECUTORS = {
    "get_inventory_summary": get_inventory_summary,
    "get_product_details": get_product_details,
    "get_products_at_risk": get_products_at_risk,
    "get_stock_movements": get_stock_movements,
    "get_investigation_details": get_investigation_details,
    "get_supplier_details": get_supplier_details,
    "get_supplier_order_proposals": get_supplier_order_proposals,
}


def execute_tool(
    db: Session,
    tool_name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:

    executor = TOOL_EXECUTORS.get(tool_name)

    if executor is None:
        return {
            "success": False,
            "error": "Unknown tool.",
        }

    try:
        result = executor(
            db=db,
            **arguments,
        )

        return {
            "success": True,
            "data": result,
        }

    except Exception:
        logger.exception(
            "Meta agent tool execution failed: %s",
            tool_name,
        )

        return {
            "success": False,
            "error": (
                "The requested database operation failed. "
                "Do not invent the missing information."
            ),
        }