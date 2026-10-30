import re
import unicodedata

from datetime import datetime
from typing import Any


DOCUMENT_EVENT_MAP = {
    "supplier_invoice": "invoiced",
    "purchase_receipt": "received",
    "delivery_note": "delivery_reported",
    "sales_report": "sold",
    "inventory_count_sheet": "physical_count",
    "stock_report": "stock_reported",
}


def normalize_value(value: str | None) -> str:
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKC", value).casefold()

    return re.sub(
        r"\s+",
        " ",
        normalized,
    ).strip()


def normalize_sku(value: str | None) -> str:
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKC", value)

    return re.sub(
        r"[^a-zA-Z0-9]",
        "",
        normalized,
    ).casefold()


def parse_document_date(
    inventory_data: dict[str, Any],
) -> str | None:

    date_value = (
        inventory_data.get("document_date")
        or inventory_data.get("invoice_date")
        or inventory_data.get("report_date")
        or inventory_data.get("count_date")
    )

    if not isinstance(date_value, str):
        return None

    formats = [
        "%Y-%m-%d",
        "%d %B %Y",
        "%d %b %Y",
        "%d/%m/%Y",
        "%d-%m-%Y",
    ]

    for date_format in formats:
        try:
            return datetime.strptime(
                date_value.strip(),
                date_format,
            ).date().isoformat()

        except ValueError:
            continue

    return None


def get_document_events(
    evidence_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    events = []

    for record in evidence_records:

        analysis = record.get("analysis") or {}

        inventory_data = analysis.get("inventory_data") or {}

        document_type = analysis.get("document_type", "other")

        event_type = DOCUMENT_EVENT_MAP.get(document_type)

        if not event_type:
            continue

        document_date = parse_document_date(inventory_data)

        line_items = inventory_data.get("line_items") or []

        # Legacy single-product compatibility.
        if not line_items and inventory_data.get("product_name"):
            line_items = [{
                "product_name": inventory_data.get("product_name"),
                "sku": inventory_data.get("sku"),
                "quantity": inventory_data.get("quantity"),
                "quantity_unit": inventory_data.get("quantity_unit"),
                "quantity_type": inventory_data.get(
                    "quantity_type",
                    "unknown",
                ),
            }]

        for index, item in enumerate(line_items):

            if not isinstance(item, dict):
                continue

            events.append({
                "evidence_id": record.get("evidence_id"),
                "document_type": document_type,
                "event_type": event_type,
                "document_date": document_date,
                "line_item_index": index,
                "product_name": item.get("product_name"),
                "sku": item.get("sku"),
                "quantity": item.get("quantity"),
                "quantity_unit": item.get("quantity_unit"),
                "quantity_type": item.get(
                    "quantity_type",
                    "unknown",
                ),
                "unit_price": item.get("unit_price"),
                "total_price": item.get("total_price"),
                "currency": item.get("currency"),
                "source": {
                    "evidence_id": record.get("evidence_id"),
                    "document_type": document_type,
                },
            })

    events.sort(
        key=lambda event: (
            event["document_date"] is None,
            event["document_date"] or "",
        )
    )

    return events


def product_matches(
    investigation: dict[str, Any],
    event: dict[str, Any],
) -> bool:

    investigation_sku = normalize_sku(
        investigation.get("sku")
    )

    event_sku = normalize_sku(
        event.get("sku")
    )

    if investigation_sku and event_sku:
        if investigation_sku == event_sku:
            return True

    investigation_name = normalize_value(
        investigation.get("product_name")
    )

    event_name = normalize_value(
        event.get("product_name")
    )

    return bool(
        investigation_name
        and event_name
        and investigation_name == event_name
    )


def build_product_timeline(
    investigation: dict[str, Any],
    events: list[dict[str, Any]],
) -> dict[str, Any]:

    matching_events = []

    unmatched_events = []

    for event in events:

        if product_matches(investigation, event):
            matching_events.append(event)

        else:
            unmatched_events.append(event)

    return {
        "investigation_product": investigation.get("product_name"),
        "investigation_sku": investigation.get("sku"),
        "total_events": len(events),
        "matching_events": len(matching_events),
        "unmatched_events": len(unmatched_events),
        "events": matching_events,
        "limitations": [
            "Events represent information extracted from documents, not independently verified facts.",
            "An invoice does not prove that goods were received.",
            "A delivery note does not independently establish current on-hand stock.",
            "A sales report does not establish physical stock.",
            "A physical count represents stock at the reported count time only.",
            "Events without a reliable document date cannot be placed confidently in chronological order.",
            "Quantities with different units must not be added together.",
            "Document authenticity has not been independently verified.",
        ],
    }