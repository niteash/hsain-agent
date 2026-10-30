import re
import unicodedata
from typing import Any


def normalize_product_name(value: str | None) -> str:
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKC", value).casefold()

    characters = []

    for char in normalized:
        category = unicodedata.category(char)

        if category.startswith(("L", "N")):
            characters.append(char)
        elif char.isspace():
            characters.append(" ")

    return re.sub(r"\s+", " ", "".join(characters)).strip()


def normalize_sku(value: str | None) -> str:
    if not value:
        return ""

    return re.sub(
        r"[^a-zA-Z0-9]",
        "",
        unicodedata.normalize("NFKC", value),
    ).casefold()


def get_line_items(inventory_data: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Supports both the new multi-product format and legacy single-product data.
    """

    line_items = inventory_data.get("line_items")

    if isinstance(line_items, list) and line_items:
        return [
            item for item in line_items
            if isinstance(item, dict)
        ]

    # Backward compatibility with older analysis records.
    if (
        inventory_data.get("product_name")
        or inventory_data.get("sku")
        or inventory_data.get("quantity") is not None
    ):
        return [{
            "product_name": inventory_data.get("product_name"),
            "sku": inventory_data.get("sku"),
            "quantity": inventory_data.get("quantity"),
            "quantity_unit": inventory_data.get("quantity_unit"),
            "quantity_type": inventory_data.get("quantity_type", "unknown"),
            "unit_price": inventory_data.get("unit_price"),
            "total_price": inventory_data.get("total_price"),
            "currency": inventory_data.get("currency"),
        }]

    return []


def match_product(
    investigation: dict[str, Any],
    line_item: dict[str, Any],
) -> tuple[bool, str | None]:
    """
    Exact matching only. No fuzzy matching to avoid false product matches.
    """

    investigation_sku = normalize_sku(
        investigation.get("sku")
    )

    evidence_sku = normalize_sku(
        line_item.get("sku")
    )

    if investigation_sku and evidence_sku:
        if investigation_sku == evidence_sku:
            return True, "sku"

    investigation_name = normalize_product_name(
        investigation.get("product_name")
    )

    evidence_name = normalize_product_name(
        line_item.get("product_name")
    )

    if investigation_name and evidence_name:
        if investigation_name == evidence_name:
            return True, "product_name"

    return False, None


def reconcile_line_item(
    investigation: dict[str, Any],
    line_item: dict[str, Any],
    index: int,
) -> dict[str, Any]:

    matched, matched_by = match_product(
        investigation,
        line_item,
    )

    quantity_type = line_item.get(
        "quantity_type",
        "unknown",
    )

    quantity = line_item.get("quantity")

    result = {
        "line_item_index": index,
        "product_name": line_item.get("product_name"),
        "sku": line_item.get("sku"),
        "quantity": quantity,
        "quantity_unit": line_item.get("quantity_unit"),
        "quantity_type": quantity_type,
        "unit_price": line_item.get("unit_price"),
        "total_price": line_item.get("total_price"),
        "currency": line_item.get("currency"),
        "product_match": matched,
        "matched_by": matched_by,
        "status": "needs_review",
        "checks": [],
        "limitations": [],
        "conclusion": "",
    }

    if not matched:
        result["checks"].append({
            "check": "product_identity",
            "passed": False,
            "details": (
                "This line item does not exactly match the "
                "investigated product by SKU or normalized name."
            ),
        })

        result["conclusion"] = (
            "This line item does not match the investigated product."
        )

        return result

    result["checks"].append({
        "check": "product_identity",
        "passed": True,
        "details": f"Product matched using {matched_by}.",
    })

    if quantity is None:
        result["limitations"].append(
            "No usable quantity was extracted."
        )

        result["conclusion"] = (
            "The product matches, but no usable quantity was found."
        )

        return result

    if quantity_type == "physical_count":
        expected_stock = investigation.get("expected_stock")
        physical_stock = investigation.get("physical_stock")

        result["checks"].append({
            "check": "physical_count",
            "passed": True,
            "details": (
                "The document identifies this quantity as a "
                "physical inventory count."
            ),
        })

        if physical_stock is not None and quantity == physical_stock:
            result["checks"].append({
                "check": "reported_physical_count",
                "passed": True,
                "details": (
                    "The extracted physical count matches the "
                    "investigation's recorded physical count."
                ),
            })

            result["status"] = "corroborated"

            result["conclusion"] = (
                "The document corroborates the recorded physical count. "
                "Authenticity and date still require verification."
            )

        else:
            result["status"] = "needs_review"

            result["limitations"].append(
                "The extracted physical count does not match "
                "the investigation's recorded physical count."
            )

            result["conclusion"] = (
                "The physical-count figures differ. Manual review is required."
            )

        if expected_stock is not None and physical_stock is not None:
            result["checks"].append({
                "check": "investigation_discrepancy",
                "passed": expected_stock != physical_stock,
                "details": (
                    f"Investigation records expected stock "
                    f"{expected_stock} and physical stock {physical_stock}."
                ),
            })

    else:
        result["status"] = "needs_review"

        result["limitations"].append(
            f"The quantity represents '{quantity_type}', "
            "not a verified physical stock count."
        )

        result["conclusion"] = (
            "The product matches, but this quantity cannot independently "
            "verify the current physical stock."
        )

    result["limitations"].extend([
        "Document authenticity has not been independently verified.",
        "The document date and investigation period must be checked.",
    ])

    return result


def reconcile_evidence(
    investigation: dict[str, Any],
    analysis: dict[str, Any],
) -> dict[str, Any]:

    inventory_data = analysis.get("inventory_data") or {}

    line_items = get_line_items(inventory_data)

    result = {
        "status": "needs_review",
        "product_match": False,
        "matched_products": [],
        "line_item_results": [],
        "checks": [],
        "conclusion": "",
        "limitations": [],
    }

    if not analysis.get("is_inventory_relevant", False):
        result["status"] = "not_relevant"

        result["checks"].append({
            "check": "inventory_relevance",
            "passed": False,
            "details": (
                "The document was classified as unrelated to inventory."
            ),
        })

        result["conclusion"] = (
            "This document cannot support the inventory investigation."
        )

        return result

    if not line_items:
        result["checks"].append({
            "check": "product_identity",
            "passed": False,
            "details": (
                "No identifiable product line items were extracted."
            ),
        })

        result["limitations"].append(
            "The document does not contain usable product information."
        )

        result["conclusion"] = (
            "Manual review is required because no product could be identified."
        )

        return result

    for index, line_item in enumerate(line_items):
        line_result = reconcile_line_item(
            investigation=investigation,
            line_item=line_item,
            index=index,
        )

        result["line_item_results"].append(line_result)

        if line_result["product_match"]:
            result["matched_products"].append({
                "line_item_index": index,
                "product_name": line_result["product_name"],
                "sku": line_result["sku"],
                "quantity": line_result["quantity"],
                "quantity_type": line_result["quantity_type"],
                "status": line_result["status"],
            })

    matched_results = [
        item
        for item in result["line_item_results"]
        if item["product_match"]
    ]

    result["product_match"] = bool(matched_results)

    if not matched_results:
        result["status"] = "product_mismatch"

        result["checks"].append({
            "check": "product_identity",
            "passed": False,
            "details": (
                "None of the extracted products match the "
                "investigated product."
            ),
        })

        result["conclusion"] = (
            "The document contains product information, but none of "
            "the products match the current investigation."
        )

        return result

    result["checks"].append({
        "check": "product_identity",
        "passed": True,
        "details": (
            f"Found {len(matched_results)} matching line item(s)."
        ),
    })

    result["limitations"].append(
        "Only matching line items are relevant to this investigation."
    )

    result["limitations"].append(
        "Invoice quantities do not establish that goods were received "
        "or are currently available in stock."
    )

    result["limitations"].append(
        "Document authenticity has not been independently verified."
    )

    if any(item["status"] == "corroborated" for item in matched_results):
        result["status"] = "corroborated"

        result["conclusion"] = (
            "At least one matching line item corroborates the recorded "
            "physical count. Human verification is still required."
        )

    else:
        result["status"] = "needs_review"

        result["conclusion"] = (
            "Matching product information was found, but the evidence "
            "does not independently establish current physical stock. "
            "Manual verification is required."
        )

    return result