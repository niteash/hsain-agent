from __future__ import annotations

import json
import logging

from pathlib import Path
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
)

from sqlalchemy import select
from sqlalchemy.orm import Session

from starlette.concurrency import run_in_threadpool

from app.config import UPLOAD_DIR
from app.dependencies import get_db

from app.models import (
    EvidenceFile,
    EvidenceVisualAnalysis,
    Investigation,
    Product,
)

from app.services.meta.image import (
    SUPPORTED_IMAGE_TYPES,
    analyze_inventory_image,
)

from app.services.meta.sam import (
    SAM_MODEL,
    segment_inventory_image,
)

from app.services.meta.sam_processor import (
    process_sam_result,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/multimodal",
    tags=["Multimodal Intelligence"],
)


# ============================================================
# CONFIGURATION
# ============================================================

RELEVANT_CLASSIFICATIONS = {
    "relevant_inventory_image",
    "partially_relevant_image",
}

REJECTED_CLASSIFICATIONS = {
    "unrelated_image",
    "insufficient_image_quality",
}

SUPPORTED_CLASSIFICATIONS = (
    RELEVANT_CLASSIFICATIONS
    | REJECTED_CLASSIFICATIONS
)

VALID_DETECTION_STATUSES = {
    "detected",
    "not_detected",
    "uncertain",
}

VALID_CONFIDENCE_LEVELS = {
    "low",
    "medium",
    "high",
}


# ============================================================
# RESPONSE HELPERS
# ============================================================

def build_segmentation_failure(
    error: Exception,
    object_prompt: str,
) -> dict[str, Any]:
    """
    Construct a safe SAM failure response.

    Never expose API keys, request headers,
    or raw provider responses.
    """

    if isinstance(
        error,
        (APIConnectionError, APITimeoutError),
    ):
        message = (
            "Meta Model API is temporarily unavailable."
        )

    elif isinstance(error, APIStatusError):
        message = (
            f"Meta Model API returned HTTP "
            f"{error.status_code}."
        )

    elif isinstance(error, FileNotFoundError):
        message = "Evidence image is unavailable."

    elif isinstance(error, ValueError):
        message = str(error)

    else:
        message = (
            "Segmentation could not be completed."
        )

    return {
        "status": "failed",
        "model": SAM_MODEL,
        "object_prompt": object_prompt,
        "results": None,
        "processed_results": None,
        "processing_status": "failed",
        "processing_error": message,
        "error": message,
        "human_verification_required": True,
        "inventory_mutation_performed": False,
    }


def build_segmentation_skipped(
    object_prompt: str,
    reason: str,
) -> dict[str, Any]:
    """
    Construct a safe response when SAM is intentionally skipped.
    """

    return {
        "status": "skipped",
        "model": SAM_MODEL,
        "object_prompt": object_prompt,
        "results": None,
        "processed_results": None,
        "processing_status": "not_started",
        "processing_error": None,
        "error": None,
        "reason": reason,
        "human_verification_required": True,
        "inventory_mutation_performed": False,
    }


def serialize_analysis(
    data: dict[str, Any],
) -> str:
    """
    Serialize analysis data for SQLAlchemy storage.
    """

    return json.dumps(
        data,
        ensure_ascii=False,
        default=str,
    )


# ============================================================
# MUSE SPARK RESPONSE VALIDATION
# ============================================================

def validate_spark_analysis(
    spark_result: dict[str, Any],
    expected_target: str,
) -> dict[str, Any]:
    """
    Validate Muse Spark output before using it
    to determine the next pipeline stage.

    The investigation product and visual inspection target
    are independent identities.

    The returned target analysis must correspond to the
    target explicitly requested by the user.
    """

    if not isinstance(spark_result, dict):
        raise ValueError(
            "Muse Spark returned an invalid response."
        )

    findings = spark_result.get("analysis")

    if not isinstance(findings, dict):
        raise ValueError(
            "Muse Spark response is missing analysis findings."
        )

    # --------------------------------------------------------
    # TARGET ANALYSIS VALIDATION
    # --------------------------------------------------------

    target_analysis = findings.get("target_analysis")

    if not isinstance(target_analysis, dict):
        raise ValueError(
            "Muse Spark response is missing target analysis."
        )

    detection_status = target_analysis.get(
        "detection_status"
    )

    if detection_status not in VALID_DETECTION_STATUSES:
        raise ValueError(
            "Muse Spark returned an invalid target detection status."
        )

    requested_target = target_analysis.get(
        "requested_target"
    )

    if (
        not isinstance(requested_target, str)
        or not requested_target.strip()
    ):
        raise ValueError(
            "Muse Spark returned an invalid requested target."
        )

    # Do not accept a response about a different target.
    if requested_target.strip().casefold() != expected_target.strip().casefold():
        raise ValueError(
            "Muse Spark analyzed a different visual inspection target "
            f"than requested: {expected_target}."
        )

    confidence = target_analysis.get("confidence")

    if confidence not in VALID_CONFIDENCE_LEVELS:
        raise ValueError(
            "Muse Spark returned an invalid target confidence."
        )

    reason = target_analysis.get("reason")

    if not isinstance(reason, str) or not reason.strip():
        raise ValueError(
            "Muse Spark returned an invalid target analysis reason."
        )

    matched_description = target_analysis.get(
        "matched_description"
    )

    location_description = target_analysis.get(
        "location_description"
    )

    brand = target_analysis.get("brand")

    for field_name, value in {
        "matched_description": matched_description,
        "location_description": location_description,
        "brand": brand,
    }.items():

        if value is not None and not isinstance(value, str):
            raise ValueError(
                f"Target analysis field '{field_name}' "
                "must be a string or null."
            )

    if detection_status == "detected":

        if (
            not isinstance(matched_description, str)
            or not matched_description.strip()
        ):
            raise ValueError(
                "A detected target must include a matched description."
            )

        if (
            not isinstance(location_description, str)
            or not location_description.strip()
        ):
            raise ValueError(
                "A detected target must include a location description."
            )

    validated_target_analysis = {
        "requested_target": expected_target,
        "detection_status": detection_status,
        "matched_description": matched_description,
        "brand": brand,
        "location_description": location_description,
        "confidence": confidence,
        "reason": reason.strip(),
    }

    # --------------------------------------------------------
    # EVIDENCE RELEVANCE VALIDATION
    # --------------------------------------------------------

    relevance = findings.get("evidence_relevance")

    if not isinstance(relevance, dict):
        raise ValueError(
            "Muse Spark response is missing evidence relevance."
        )

    classification = relevance.get("classification")

    if (
        not isinstance(classification, str)
        or classification not in SUPPORTED_CLASSIFICATIONS
    ):
        raise ValueError(
            "Muse Spark returned an unsupported evidence classification."
        )

    is_relevant = relevance.get("is_relevant")

    requires_replacement = relevance.get(
        "requires_replacement_evidence"
    )

    if not isinstance(is_relevant, bool):
        raise ValueError(
            "Muse Spark returned an invalid is_relevant value."
        )

    if not isinstance(requires_replacement, bool):
        raise ValueError(
            "Muse Spark returned an invalid "
            "requires_replacement_evidence value."
        )

    reason = relevance.get("reason")

    if not isinstance(reason, str) or not reason.strip():
        raise ValueError(
            "Muse Spark returned an invalid evidence relevance reason."
        )

    # --------------------------------------------------------
    # CLASSIFICATION CONSISTENCY
    # --------------------------------------------------------

    expected_relevance = (
        classification in RELEVANT_CLASSIFICATIONS
    )

    if is_relevant != expected_relevance:
        raise ValueError(
            "Evidence classification conflicts with "
            "the is_relevant value."
        )

    # --------------------------------------------------------
    # REPLACEMENT REQUIREMENT CONSISTENCY
    # --------------------------------------------------------

    if (
        classification == "relevant_inventory_image"
        and requires_replacement
    ):
        raise ValueError(
            "A relevant inventory image cannot require "
            "replacement evidence."
        )

    if (
        classification in REJECTED_CLASSIFICATIONS
        and not requires_replacement
    ):
        raise ValueError(
            "Rejected evidence must require replacement evidence."
        )

    # --------------------------------------------------------
    # RETURN VALIDATED RESULT
    # --------------------------------------------------------

    return {
        "findings": findings,

        "target_analysis": validated_target_analysis,

        "evidence_relevance": {
            "is_relevant": is_relevant,
            "classification": classification,
            "reason": reason.strip(),
            "requires_replacement_evidence": (
                requires_replacement
            ),
        },

        "classification": classification,

        "is_relevant": is_relevant,

        "requires_replacement_evidence": (
            requires_replacement
        ),

        "model": spark_result.get("model"),

        "response_id": spark_result.get("response_id"),
    }


# ============================================================
# EVIDENCE ROUTING
# ============================================================

def determine_segmentation_route(
    classification: str,
    requires_replacement_evidence: bool,
) -> tuple[bool, str | None]:
    """
    Determine whether SAM should run.

    SAM is intended for relevant physical inventory images,
    not product catalogue images or unrelated evidence.
    """

    if classification == "relevant_inventory_image":
        return True, None

    if classification == "partially_relevant_image":

        if requires_replacement_evidence:
            return (
                False,
                (
                    "The image provides partial product information "
                    "but does not provide sufficient physical "
                    "inventory evidence. Replacement evidence "
                    "is required before shelf segmentation."
                ),
            )

        return True, None

    if classification == "unrelated_image":
        return (
            False,
            "The image is unrelated to the investigation product.",
        )

    if classification == "insufficient_image_quality":
        return (
            False,
            (
                "Image quality is insufficient for reliable "
                "inventory segmentation. Upload a clearer image."
            ),
        )

    return (
        False,
        "Unsupported evidence classification.",
    )


# ============================================================
# SAM RESPONSE WRAPPER
# ============================================================

def wrap_segmentation_result(
    result: dict[str, Any],
    object_prompt: str,
    processed_result: dict[str, Any] | None = None,
    processing_status: str = "completed",
    processing_error: str | None = None,
) -> dict[str, Any]:
    """
    Normalize SAM output and its processed results.

    Processing results are kept separate from the
    original SAM response to preserve source provenance.
    """

    status = result.get("status", "failed")

    if status not in {
        "completed",
        "no_detections",
    }:
        raise ValueError(
            "SAM returned an unsupported result status."
        )

    return {
        "status": status,
        "model": SAM_MODEL,
        "object_prompt": object_prompt,
        "results": result,
        "processed_results": processed_result,
        "processing_status": processing_status,
        "processing_error": processing_error,
        "error": None,
        "human_verification_required": True,
        "inventory_mutation_performed": False,
    }


# ============================================================
# SAM RESULT PROCESSING
# ============================================================

def safely_process_sam_result(
    segmentation_result: dict[str, Any],
) -> tuple[dict[str, Any] | None, str, str | None]:
    """
    Process SAM output without losing original segmentation.

    Returns:
        processed_result
        processing_status
        processing_error

    The processor must not mutate inventory.
    """

    try:
        processed_result = process_sam_result(
            segmentation_result
        )

        if not isinstance(processed_result, dict):
            raise ValueError(
                "SAM processor returned an invalid result."
            )

        return (
            processed_result,
            "completed",
            None,
        )

    except Exception:
        logger.exception(
            "SAM result processing failed."
        )

        return (
            None,
            "failed",
            (
                "SAM segmentation succeeded, but "
                "result processing could not be completed."
            ),
        )


# ============================================================
# ANALYSIS REVISION HELPERS
# ============================================================

def get_next_analysis_revision(
    existing: EvidenceVisualAnalysis | None,
) -> int:
    """
    Calculate the next analysis revision.

    A new revision invalidates the relevance of old
    human-review decisions for the previous analysis.
    """

    if existing is None:
        return 1

    current_revision = existing.analysis_revision or 1

    return int(current_revision) + 1


# ============================================================
# MAIN MULTIMODAL ENDPOINT
# ============================================================

@router.post(
    "/evidence/{evidence_id}/analyze-image"
)
async def analyze_evidence_image(
    evidence_id: int,
    object_prompt: str | None = Query(
        default=None,
        min_length=1,
        max_length=120,
        description=(
            "Optional visual inspection target for Muse Spark "
            "and SAM. Defaults to the investigation product name."
        ),
    ),
    db: Session = Depends(get_db),
):
    """
    Perform evidence-aware multimodal inventory analysis.

    Pipeline:

        1. Validate evidence.
        2. Retrieve investigation and product.
        3. Determine independent visual inspection target.
        4. Analyze image using Muse Spark.
        5. Validate target-specific findings.
        6. Validate evidence classification.
        7. Determine whether SAM should run.
        8. Run SAM when evidence is suitable.
        9. Process SAM segmentation results.
        10. Persist combined analysis.
        11. Return structured results.

    This endpoint never modifies inventory.
    """

    # ========================================================
    # 1. RETRIEVE EVIDENCE
    # ========================================================

    evidence = db.get(
        EvidenceFile,
        evidence_id,
    )

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    # ========================================================
    # 2. VALIDATE IMAGE TYPE
    # ========================================================

    if evidence.content_type not in SUPPORTED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                "Evidence must be a JPEG, PNG, "
                "or WebP image."
            ),
        )

    # ========================================================
    # 3. VALIDATE STORAGE PATH
    # ========================================================

    image_path = Path(
        evidence.storage_path
    ).resolve()

    upload_directory = UPLOAD_DIR.resolve()

    if image_path.parent != upload_directory:
        raise HTTPException(
            status_code=400,
            detail="Invalid evidence storage location.",
        )

    if not image_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Evidence image is unavailable.",
        )

    # ========================================================
    # 4. RETRIEVE INVESTIGATION
    # ========================================================

    investigation = db.get(
        Investigation,
        evidence.investigation_id,
    )

    if investigation is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found.",
        )

    # ========================================================
    # 5. RETRIEVE INVESTIGATION PRODUCT
    # ========================================================

    product = db.get(
        Product,
        investigation.product_id,
    )

    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation product not found.",
        )

    # ========================================================
    # 6. DETERMINE VISUAL INSPECTION TARGET
    # ========================================================

    investigation_product = product.name.strip()

    visual_inspection_target = (
        object_prompt.strip()
        if object_prompt and object_prompt.strip()
        else investigation_product
    )

    if not investigation_product:
        raise HTTPException(
            status_code=400,
            detail="Investigation product name is invalid.",
        )

    if not visual_inspection_target:
        raise HTTPException(
            status_code=400,
            detail=(
                "A valid visual inspection target "
                "or investigation product is required."
            ),
        )

    # ========================================================
    # 7. BUILD INVESTIGATION CONTEXT
    # ========================================================

    context = {
        "investigation_id": investigation.id,

        "product_id": product.id,

        # Original investigation product.
        # This value must never be overwritten by the target.
        "product_name": investigation_product,

        # Independent visual inspection target.
        "visual_inspection_target": visual_inspection_target,

        "expected_stock": investigation.expected_stock,

        "physical_stock": investigation.physical_stock,

        "units_sold": investigation.units_sold,

        "expected_remaining_stock": (
            investigation.expected_remaining_stock
        ),

        "discrepancy": investigation.discrepancy,

        "status": investigation.status,
    }

    logger.info(
        (
            "Starting multimodal inspection. "
            "Evidence=%s | Investigation product=%s | "
            "Visual target=%s"
        ),
        evidence_id,
        investigation_product,
        visual_inspection_target,
    )

    # ========================================================
    # 8. RUN MUSE SPARK IMAGE ANALYSIS
    # ========================================================

    try:
        spark_result = await run_in_threadpool(
            analyze_inventory_image,
            image_path=str(image_path),
            content_type=evidence.content_type,
            investigation_context=context,
        )

    except (
        APIConnectionError,
        APITimeoutError,
    ):
        logger.exception(
            "Muse Spark API connection error."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Meta Model API is temporarily unavailable."
            ),
        )

    except APIStatusError as exc:
        logger.exception(
            "Muse Spark API returned HTTP %s.",
            exc.status_code,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Meta Model API returned HTTP "
                f"{exc.status_code}."
            ),
        )

    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Evidence image is unavailable.",
        )

    except ValueError as exc:
        logger.exception(
            "Muse Spark returned invalid image analysis."
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )

    except Exception:
        logger.exception(
            "Unexpected Muse Spark analysis error."
        )

        raise HTTPException(
            status_code=500,
            detail="Unexpected image analysis error.",
        )

    # ========================================================
    # 9. VALIDATE MUSE SPARK RESPONSE
    # ========================================================

    try:
        validated_spark = validate_spark_analysis(
            spark_result,
            expected_target=visual_inspection_target,
        )

        findings = validated_spark["findings"]

        target_analysis = validated_spark[
            "target_analysis"
        ]

        evidence_relevance = (
            validated_spark["evidence_relevance"]
        )

        classification = (
            validated_spark["classification"]
        )

        is_inventory_relevant = (
            validated_spark["is_relevant"]
        )

        requires_replacement_evidence = (
            validated_spark["requires_replacement_evidence"]
        )

        spark_model = validated_spark["model"]

        response_id = validated_spark["response_id"]

        if not isinstance(spark_model, str) or not spark_model:
            raise ValueError(
                "Muse Spark model metadata is missing."
            )

        if not isinstance(response_id, str) or not response_id:
            raise ValueError(
                "Muse Spark response ID is missing."
            )

    except (KeyError, TypeError, ValueError) as exc:
        logger.exception(
            "Invalid Muse Spark response structure."
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Image analysis returned an unexpected "
                "or inconsistent response."
            ),
        ) from exc

    # ========================================================
    # 10. DETERMINE SEGMENTATION ROUTE
    # ========================================================

    should_run_sam, skip_reason = (
        determine_segmentation_route(
            classification=classification,
            requires_replacement_evidence=(
                requires_replacement_evidence
            ),
        )
    )

    # ========================================================
    # 11. RUN SAM AND PROCESS ITS RESULTS
    # ========================================================

    if not should_run_sam:

        logger.info(
            (
                "Skipping SAM segmentation. "
                "Evidence=%s | Classification=%s | "
                "Replacement required=%s"
            ),
            evidence_id,
            classification,
            requires_replacement_evidence,
        )

        segmentation_data = build_segmentation_skipped(
            object_prompt=visual_inspection_target,
            reason=(
                skip_reason
                or "Evidence is unsuitable for segmentation."
            ),
        )

    else:

        try:

            # ------------------------------------------------
            # 11A. RUN SAM
            # ------------------------------------------------

            segmentation_result = await segment_inventory_image(
                image_path=str(image_path),
                content_type=evidence.content_type,
                object_prompt=visual_inspection_target,
            )

            # ------------------------------------------------
            # 11B. VALIDATE SAM RESPONSE
            # ------------------------------------------------

            if not isinstance(segmentation_result, dict):
                raise ValueError(
                    "SAM returned an invalid response."
                )

            sam_status = segmentation_result.get("status")

            if sam_status not in {
                "completed",
                "no_detections",
            }:
                raise ValueError(
                    "SAM returned an unsupported result status."
                )

            # ------------------------------------------------
            # 11C. PROCESS SAM RESPONSE
            # ------------------------------------------------

            (
                processed_result,
                processing_status,
                processing_error,
            ) = safely_process_sam_result(
                segmentation_result
            )

            # ------------------------------------------------
            # 11D. BUILD FINAL SEGMENTATION RESPONSE
            # ------------------------------------------------

            segmentation_data = wrap_segmentation_result(
                result=segmentation_result,
                object_prompt=visual_inspection_target,
                processed_result=processed_result,
                processing_status=processing_status,
                processing_error=processing_error,
            )

            logger.info(
                (
                    "SAM segmentation finished. "
                    "Evidence=%s | Target=%s | Status=%s | "
                    "Boxes=%s | Masks=%s | Processing=%s"
                ),
                evidence_id,
                visual_inspection_target,
                sam_status,
                segmentation_result.get(
                    "total_detected_objects",
                    0,
                ),
                segmentation_result.get(
                    "total_masks",
                    0,
                ),
                processing_status,
            )

        except Exception as exc:

            logger.exception(
                "SAM segmentation failed for evidence %s.",
                evidence_id,
            )

            segmentation_data = build_segmentation_failure(
                error=exc,
                object_prompt=visual_inspection_target,
            )

    # ========================================================
    # 12. BUILD COMBINED ANALYSIS
    # ========================================================

    analysis_data = {
        "analysis_type": (
            "multimodal_inventory_inspection"
        ),

        "evidence_id": evidence.id,

        "investigation_id": investigation.id,

        # Original investigation product.
        "product": {
            "id": product.id,
            "name": investigation_product,
        },

        # Independent visual inspection target.
        "visual_inspection": {
            "requested_target": visual_inspection_target,
            "target_analysis": target_analysis,
        },

        "source": {
            "filename": evidence.original_filename,
            "content_type": evidence.content_type,
            "file_size": evidence.file_size,
        },

        "models": {
            "reasoning": spark_model,
            "segmentation": (
                SAM_MODEL
                if should_run_sam
                else None
            ),
        },

        "evidence_classification": {
            "classification": classification,
            "is_inventory_relevant": (
                is_inventory_relevant
            ),
            "requires_replacement_evidence": (
                requires_replacement_evidence
            ),
            "reason": evidence_relevance["reason"],
        },

        "spark_analysis": {
            "response_id": response_id,
            "evidence_relevance": evidence_relevance,
            "findings": findings,
        },

        "segmentation": segmentation_data,

        "verification": {
            "status": "pending",
            "verified_by": None,
            "verified_at": None,
            "human_verification_required": True,
        },

        "inventory_mutation_performed": False,
    }

    # ========================================================
    # 13. DETERMINE OVERALL ANALYSIS STATUS
    # ========================================================

    if classification in REJECTED_CLASSIFICATIONS:

        overall_status = "rejected"

    elif requires_replacement_evidence:

        overall_status = "needs_replacement"

    elif segmentation_data["status"] == "completed":

        if (
            segmentation_data.get("processing_status")
            == "failed"
        ):
            overall_status = "partial_success"

        else:
            overall_status = "completed"

    elif segmentation_data["status"] == "no_detections":

        overall_status = "partial_success"

    elif segmentation_data["status"] == "skipped":

        overall_status = "partial_success"

    else:

        overall_status = "partial_success"

    analysis_data["status"] = overall_status

    # ========================================================
    # 14. FIND EXISTING VISUAL ANALYSIS
    # ========================================================

    try:

        existing = db.scalar(
            select(EvidenceVisualAnalysis).where(
                EvidenceVisualAnalysis.evidence_id == evidence_id
            )
        )

    except Exception:

        db.rollback()

        logger.exception(
            "Could not retrieve existing visual analysis "
            "for evidence %s.",
            evidence_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Could not retrieve existing visual analysis.",
        )

    # ========================================================
    # 15. DETERMINE ANALYSIS REVISION
    # ========================================================

    next_revision = get_next_analysis_revision(
        existing
    )

    analysis_data["analysis_revision"] = next_revision

    # ========================================================
    # 16. BUILD MODEL METADATA
    # ========================================================

    if should_run_sam:

        combined_model = (
            f"{spark_model} + {SAM_MODEL}"
        )

    else:

        combined_model = spark_model

    # ========================================================
    # 17. SERIALIZE ANALYSIS
    # ========================================================

    serialized = serialize_analysis(
        analysis_data
    )

    # ========================================================
    # 18. CREATE OR UPDATE VISUAL ANALYSIS
    # ========================================================

    try:

        if existing is not None:

            existing.analysis_revision = next_revision

            existing.model = combined_model

            existing.is_inventory_relevant = (
                is_inventory_relevant
            )

            existing.verification_status = "pending"

            existing.analysis_json = serialized

            record = existing

        else:

            record = EvidenceVisualAnalysis(
                evidence_id=evidence_id,
                analysis_revision=next_revision,
                model=combined_model,
                is_inventory_relevant=(
                    is_inventory_relevant
                ),
                verification_status="pending",
                analysis_json=serialized,
            )

            db.add(record)

        db.commit()

        db.refresh(record)

    except Exception:

        db.rollback()

        logger.exception(
            "Could not save multimodal analysis for evidence %s.",
            evidence_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Could not save multimodal analysis.",
        )

    # ========================================================
    # 19. RETURN STRUCTURED RESPONSE
    # ========================================================

    return {
        "success": True,

        "message": (
            "Multimodal inventory analysis completed."
            if overall_status == "completed"
            else (
                "Multimodal inventory analysis finished "
                "with review requirements."
            )
        ),

        "analysis_id": record.id,

        "evidence_id": evidence.id,

        "investigation_id": investigation.id,

        "analysis_revision": record.analysis_revision,

        "status": overall_status,

        "model": combined_model,

        "models": {
            "reasoning": spark_model,
            "segmentation": (
                SAM_MODEL
                if should_run_sam
                else None
            ),
        },

        "investigation_product": {
            "id": product.id,
            "name": investigation_product,
        },

        "visual_inspection": {
            "requested_target": visual_inspection_target,
            "target_analysis": target_analysis,
        },

        "is_inventory_relevant": (
            is_inventory_relevant
        ),

        "verification_status": (
            record.verification_status
        ),

        "human_verification_required": True,

        "inventory_mutation_performed": False,

        "analysis": analysis_data,
    }


# ============================================================
# GET SAVED VISUAL ANALYSIS
# ============================================================

@router.get(
    "/evidence/{evidence_id}/analysis"
)
def get_evidence_visual_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    """
    Retrieve the latest saved visual analysis for evidence.
    """

    evidence = db.get(
        EvidenceFile,
        evidence_id,
    )

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    record = db.scalar(
        select(EvidenceVisualAnalysis).where(
            EvidenceVisualAnalysis.evidence_id == evidence_id
        )
    )

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Visual analysis not found.",
        )

    try:

        analysis_data = json.loads(
            record.analysis_json
        )

    except (TypeError, json.JSONDecodeError):

        logger.exception(
            "Stored visual analysis JSON is invalid. "
            "Evidence=%s",
            evidence_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Stored visual analysis is invalid.",
        )

    if not isinstance(analysis_data, dict):

        raise HTTPException(
            status_code=500,
            detail="Stored visual analysis has an invalid structure.",
        )

    # Keep the database revision authoritative.
    analysis_data["analysis_revision"] = (
        record.analysis_revision
    )

    # Backward-compatible retrieval for existing analyses.
    visual_inspection = analysis_data.get(
        "visual_inspection"
    )

    if not isinstance(visual_inspection, dict):

        findings = analysis_data.get(
            "spark_analysis",
            {},
        ).get("findings", {})

        if isinstance(findings, dict):

            target_analysis = findings.get(
                "target_analysis"
            )

            if isinstance(target_analysis, dict):

                visual_inspection = {
                    "requested_target": (
                        target_analysis.get("requested_target")
                    ),
                    "target_analysis": target_analysis,
                }

                analysis_data["visual_inspection"] = (
                    visual_inspection
                )

    return {
        "success": True,

        "analysis_id": record.id,

        "evidence_id": record.evidence_id,

        "analysis_revision": record.analysis_revision,

        "model": record.model,

        "is_inventory_relevant": (
            record.is_inventory_relevant
        ),

        "verification_status": (
            record.verification_status
        ),

        "visual_inspection": analysis_data.get(
            "visual_inspection"
        ),

        "analysis": analysis_data,

        "inventory_mutation_performed": False,
    }