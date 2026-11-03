from __future__ import annotations

import logging
import math

from collections import defaultdict
from typing import Any


logger = logging.getLogger(__name__)


# ============================================================
# CONFIGURATION
# ============================================================

PROCESSOR_VERSION = "1.0.0"

VALID_STATUSES = {
    "completed",
    "no_detections",
}

REQUIRED_BOX_FIELDS = {
    "object_id",
    "left",
    "top",
    "right",
    "bottom",
}

REQUIRED_MASK_FIELDS = {
    "object_id",
    "width",
    "height",
    "encoding",
    "bounds",
}


# ============================================================
# VALIDATION HELPERS
# ============================================================

def is_valid_number(value: Any) -> bool:
    """
    Check whether a value is a finite numeric value.

    Boolean values are deliberately rejected because bool
    is a subclass of int in Python.
    """

    if isinstance(value, bool):
        return False

    if not isinstance(value, (int, float)):
        return False

    return math.isfinite(value)


def require_number(
    value: Any,
    field_name: str,
) -> float:
    """
    Validate and normalize a numeric field.
    """

    if not is_valid_number(value):
        raise ValueError(
            f"Invalid numeric value for {field_name}."
        )

    return float(value)


def validate_required_fields(
    data: dict[str, Any],
    required_fields: set[str],
    record_type: str,
) -> None:
    """
    Validate required record fields.
    """

    missing = (
        required_fields - data.keys()
    )

    if missing:
        raise ValueError(
            f"{record_type} is missing fields: "
            f"{', '.join(sorted(missing))}"
        )


def normalize_object_id(
    value: Any,
) -> str:
    """
    Normalize SAM object identifiers.

    Object identifiers are treated as strings to avoid
    accidental integer/string mismatches.
    """

    if value is None:
        raise ValueError(
            "SAM object ID cannot be null."
        )

    object_id = str(value).strip()

    if not object_id:
        raise ValueError(
            "SAM object ID cannot be empty."
        )

    return object_id


# ============================================================
# BOUNDING BOX PROCESSING
# ============================================================

def normalize_bounding_box(
    box: dict[str, Any],
) -> dict[str, Any]:
    """
    Normalize a SAM bounding box.

    Coordinates remain in their original image coordinate
    system. This function does not resize or transform them.
    """

    if not isinstance(box, dict):
        raise ValueError(
            "Bounding box must be a dictionary."
        )

    validate_required_fields(
        box,
        REQUIRED_BOX_FIELDS,
        "Bounding box",
    )

    object_id = normalize_object_id(
        box["object_id"]
    )

    left = require_number(
        box["left"],
        "left",
    )

    top = require_number(
        box["top"],
        "top",
    )

    right = require_number(
        box["right"],
        "right",
    )

    bottom = require_number(
        box["bottom"],
        "bottom",
    )

    if right <= left:
        raise ValueError(
            f"Invalid bounding box width for object {object_id}."
        )

    if bottom <= top:
        raise ValueError(
            f"Invalid bounding box height for object {object_id}."
        )

    width = right - left
    height = bottom - top

    area = width * height

    confidence = box.get("confidence")

    if confidence is not None:

        confidence = require_number(
            confidence,
            "confidence",
        )

        if not 0 <= confidence <= 1:
            raise ValueError(
                "Bounding box confidence must be between 0 and 1."
            )

    return {
        "object_id": object_id,
        "coordinates": {
            "left": left,
            "top": top,
            "right": right,
            "bottom": bottom,
        },
        "width": width,
        "height": height,
        "area": area,
        "confidence": confidence,
        "frame": box.get("frame"),
    }


# ============================================================
# MASK PROCESSING
# ============================================================

def normalize_mask(
    mask: dict[str, Any],
) -> dict[str, Any]:
    """
    Normalize SAM segmentation mask metadata.

    The encoded mask is not reconstructed here.
    The original SVG path is preserved for frontend rendering.
    """

    if not isinstance(mask, dict):
        raise ValueError(
            "Segmentation mask must be a dictionary."
        )

    validate_required_fields(
        mask,
        REQUIRED_MASK_FIELDS,
        "Segmentation mask",
    )

    object_id = normalize_object_id(
        mask["object_id"]
    )

    width = mask["width"]
    height = mask["height"]

    if (
        isinstance(width, bool)
        or not isinstance(width, int)
        or width <= 0
    ):
        raise ValueError(
            f"Invalid mask width for object {object_id}."
        )

    if (
        isinstance(height, bool)
        or not isinstance(height, int)
        or height <= 0
    ):
        raise ValueError(
            f"Invalid mask height for object {object_id}."
        )

    bounds = mask["bounds"]

    if not isinstance(bounds, dict):
        raise ValueError(
            f"Invalid mask bounds for object {object_id}."
        )

    required_bounds = {
        "left",
        "top",
        "right",
        "bottom",
    }

    validate_required_fields(
        bounds,
        required_bounds,
        "Mask bounds",
    )

    left = require_number(
        bounds["left"],
        "mask.bounds.left",
    )

    top = require_number(
        bounds["top"],
        "mask.bounds.top",
    )

    right = require_number(
        bounds["right"],
        "mask.bounds.right",
    )

    bottom = require_number(
        bounds["bottom"],
        "mask.bounds.bottom",
    )

    if right <= left or bottom <= top:
        raise ValueError(
            f"Invalid mask bounding region for object {object_id}."
        )

    confidence = mask.get("confidence")

    if confidence is not None:

        confidence = require_number(
            confidence,
            "mask.confidence",
        )

        if not 0 <= confidence <= 1:
            raise ValueError(
                "Mask confidence must be between 0 and 1."
            )

    foreground_pixels = mask.get(
        "foreground_pixels"
    )

    if foreground_pixels is not None:

        if (
            isinstance(foreground_pixels, bool)
            or not isinstance(foreground_pixels, int)
            or foreground_pixels < 0
        ):
            raise ValueError(
                f"Invalid foreground pixel count for object {object_id}."
            )

        if foreground_pixels > width * height:
            raise ValueError(
                f"Foreground pixel count exceeds mask dimensions "
                f"for object {object_id}."
            )

    return {
        "object_id": object_id,
        "dimensions": {
            "width": width,
            "height": height,
        },
        "encoding": str(
            mask["encoding"]
        ),
        "revision": mask.get("revision"),
        "confidence": confidence,
        "foreground_pixels": foreground_pixels,
        "bounds": {
            "left": left,
            "top": top,
            "right": right,
            "bottom": bottom,
        },
        "svg_path": mask.get("svg_path"),
        "frame": mask.get("frame"),
    }


# ============================================================
# OBJECT ASSOCIATION
# ============================================================

def associate_objects(
    boxes: list[dict[str, Any]],
    masks: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Associate SAM bounding boxes and masks using object_id.

    Multiple records for the same ID are preserved rather
    than silently counted as separate physical products.
    """

    box_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

    mask_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for box in boxes:
        box_groups[box["object_id"]].append(box)

    for mask in masks:
        mask_groups[mask["object_id"]].append(mask)

    all_object_ids = (
        set(box_groups)
        | set(mask_groups)
    )

    objects: list[dict[str, Any]] = []

    warnings: list[str] = []

    for object_id in sorted(
        all_object_ids,
        key=lambda item: (
            not item.isdigit(),
            int(item) if item.isdigit() else item,
        ),
    ):

        object_boxes = box_groups.get(
            object_id,
            [],
        )

        object_masks = mask_groups.get(
            object_id,
            [],
        )

        if not object_boxes:

            warnings.append(
                f"Object {object_id} has a mask but no bounding box."
            )

        if not object_masks:

            warnings.append(
                f"Object {object_id} has a bounding box but no mask."
            )

        if len(object_boxes) > 1:

            warnings.append(
                f"Object {object_id} has multiple bounding box records."
            )

        if len(object_masks) > 1:

            warnings.append(
                f"Object {object_id} has multiple mask records."
            )

        box = (
            object_boxes[0]
            if object_boxes
            else None
        )

        mask = (
            object_masks[0]
            if object_masks
            else None
        )

        objects.append(
            {
                "object_id": object_id,
                "bounding_box": box,
                "segmentation_mask": mask,
                "has_bounding_box": bool(object_boxes),
                "has_segmentation_mask": bool(object_masks),
                "is_fully_segmented": (
                    bool(object_boxes)
                    and bool(object_masks)
                ),
                "bounding_box_record_count": len(object_boxes),
                "mask_record_count": len(object_masks),
            }
        )

    return objects, warnings


# ============================================================
# SEGMENTATION QUALITY SUMMARY
# ============================================================

def build_quality_summary(
    objects: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Calculate structural segmentation quality metrics.

    These metrics describe parser output completeness.
    They do not measure product identification accuracy.
    """

    total_objects = len(objects)

    objects_with_boxes = sum(
        1
        for item in objects
        if item["has_bounding_box"]
    )

    objects_with_masks = sum(
        1
        for item in objects
        if item["has_segmentation_mask"]
    )

    fully_segmented = sum(
        1
        for item in objects
        if item["is_fully_segmented"]
    )

    if total_objects:

        completeness = (
            fully_segmented / total_objects
        )

    else:

        completeness = 0.0

    return {
        "total_unique_object_ids": total_objects,
        "objects_with_bounding_boxes": objects_with_boxes,
        "objects_with_masks": objects_with_masks,
        "fully_segmented_objects": fully_segmented,
        "segmentation_record_completeness": round(
            completeness,
            4,
        ),
    }


# ============================================================
# MAIN PROCESSOR
# ============================================================

def process_sam_result(
    sam_result: dict[str, Any],
) -> dict[str, Any]:
    """
    Process the output of segment_inventory_image().

    This processor:

        - Validates SAM result structure.
        - Normalizes bounding boxes.
        - Normalizes mask metadata.
        - Associates records by object ID.
        - Calculates structural completeness.
        - Produces candidate instance counts.

    It does not:

        - Identify product SKUs.
        - Confirm product identity.
        - Verify physical stock.
        - Modify inventory.
        - Approve inventory adjustments.
    """

    # --------------------------------------------------------
    # 1. VALIDATE INPUT
    # --------------------------------------------------------

    if not isinstance(sam_result, dict):
        raise ValueError(
            "SAM result must be a dictionary."
        )

    status = sam_result.get("status")

    if status not in VALID_STATUSES:
        raise ValueError(
            f"Unsupported SAM result status: {status}."
        )

    model = sam_result.get("model")

    if not isinstance(model, str) or not model:
        raise ValueError(
            "SAM model metadata is missing."
        )

    object_prompt = sam_result.get(
        "object_prompt"
    )

    if not isinstance(object_prompt, str):
        raise ValueError(
            "SAM object prompt is missing."
        )

    # --------------------------------------------------------
    # 2. HANDLE NO DETECTIONS
    # --------------------------------------------------------

    if status == "no_detections":

        return {
            "processor_version": PROCESSOR_VERSION,
            "status": "no_detections",
            "model": model,
            "object_prompt": object_prompt,
            "objects": [],
            "candidate_instance_count": 0,
            "quality": build_quality_summary([]),
            "warnings": [
                "SAM did not return recognizable segmentation records."
            ],
            "human_verification_required": True,
            "inventory_mutation_performed": False,
        }

    # --------------------------------------------------------
    # 3. RETRIEVE RAW RECORDS
    # --------------------------------------------------------

    boxes = sam_result.get("boxes")

    masks = sam_result.get("masks")

    if not isinstance(boxes, list):
        raise ValueError(
            "SAM bounding boxes must be a list."
        )

    if not isinstance(masks, list):
        raise ValueError(
            "SAM masks must be a list."
        )

    # --------------------------------------------------------
    # 4. NORMALIZE BOUNDING BOXES
    # --------------------------------------------------------

    normalized_boxes = []

    invalid_boxes = []

    for index, box in enumerate(boxes):

        try:

            normalized_boxes.append(
                normalize_bounding_box(box)
            )

        except (ValueError, TypeError) as exc:

            logger.warning(
                "Invalid SAM bounding box at index %s: %s",
                index,
                exc,
            )

            invalid_boxes.append(
                {
                    "index": index,
                    "reason": str(exc),
                }
            )

    # --------------------------------------------------------
    # 5. NORMALIZE MASKS
    # --------------------------------------------------------

    normalized_masks = []

    invalid_masks = []

    for index, mask in enumerate(masks):

        try:

            normalized_masks.append(
                normalize_mask(mask)
            )

        except (ValueError, TypeError) as exc:

            logger.warning(
                "Invalid SAM mask at index %s: %s",
                index,
                exc,
            )

            invalid_masks.append(
                {
                    "index": index,
                    "reason": str(exc),
                }
            )

    # --------------------------------------------------------
    # 6. ASSOCIATE BOXES AND MASKS
    # --------------------------------------------------------

    objects, association_warnings = associate_objects(
        boxes=normalized_boxes,
        masks=normalized_masks,
    )

    # --------------------------------------------------------
    # 7. BUILD QUALITY SUMMARY
    # --------------------------------------------------------

    quality = build_quality_summary(
        objects
    )

    # --------------------------------------------------------
    # 8. BUILD WARNINGS
    # --------------------------------------------------------

    warnings = list(
        association_warnings
    )

    if invalid_boxes:

        warnings.append(
            f"{len(invalid_boxes)} bounding box records were invalid."
        )

    if invalid_masks:

        warnings.append(
            f"{len(invalid_masks)} mask records were invalid."
        )

    if quality["total_unique_object_ids"] == 0:

        warnings.append(
            "No valid SAM object records were available."
        )

    # --------------------------------------------------------
    # 9. BUILD PROCESSOR RESULT
    # --------------------------------------------------------

    result = {
        "processor_version": PROCESSOR_VERSION,
        "status": (
            "completed"
            if objects
            else "no_valid_objects"
        ),
        "model": model,
        "object_prompt": object_prompt,
        "objects": objects,
        "candidate_instance_count": sum(
    1 for item in objects
    if item["has_bounding_box"]
),
        "quality": quality,
        "invalid_records": {
            "bounding_boxes": invalid_boxes,
            "masks": invalid_masks,
        },
        "warnings": warnings,
        "counting_policy": {
            "count_basis": "unique_sam_object_ids",
            "is_verified_physical_count": False,
            "duplicate_resolution_performed": False,
            "human_verification_required": True,
        },
        "human_verification_required": True,
        "inventory_mutation_performed": False,
    }

    logger.info(
        (
            "SAM result processing completed. "
            "Objects=%s | Fully segmented=%s | "
            "Warnings=%s"
        ),
        quality["total_unique_object_ids"],
        quality["fully_segmented_objects"],
        len(warnings),
    )

    return result