from __future__ import annotations

import json
import logging
import math

from datetime import datetime, timezone
from typing import Literal, Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from pydantic import (
    BaseModel,
    Field,
    field_validator,
)

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_db

from app.models import (
    EvidenceFile,
    EvidenceVisualAnalysis,
    VisualDetectionReview,
    VisualDetectionReviewEvent,
)


logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/api/multimodal",
    tags=["Visual Detection Verification"],
)


REVIEW_STATUSES = {
    "pending",
    "accepted",
    "rejected",
    "needs_review",
}


# ============================================================
# TIME
# ============================================================

def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class DetectionReviewRequest(BaseModel):

    status: Literal[
        "accepted",
        "rejected",
        "needs_review",
    ]

    actor: str = Field(
        min_length=1,
        max_length=120,
    )

    note: str = Field(
        default="",
        max_length=2000,
    )

    @field_validator("actor")
    @classmethod
    def validate_actor(cls, value: str) -> str:

        value = value.strip()

        if not value:
            raise ValueError(
                "Actor name cannot be empty."
            )

        return value

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str) -> str:
        return value.strip()


class VerificationCompleteRequest(BaseModel):

    actor: str = Field(
        min_length=1,
        max_length=120,
    )

    note: str = Field(
        default="",
        max_length=2000,
    )

    @field_validator("actor")
    @classmethod
    def validate_actor(cls, value: str) -> str:

        value = value.strip()

        if not value:
            raise ValueError(
                "Actor name cannot be empty."
            )

        return value

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str) -> str:
        return value.strip()


# ============================================================
# JSON HELPERS
# ============================================================

def safely_decode_json(
    value: str | None,
) -> dict:

    if not value:
        return {}

    try:

        decoded = json.loads(value)

        if isinstance(decoded, dict):
            return decoded

        return {}

    except (
        TypeError,
        json.JSONDecodeError,
    ):

        logger.warning(
            "Malformed JSON found in visual review audit."
        )

        return {}


def encode_json(value: Any) -> str:

    return json.dumps(
        value,
        ensure_ascii=False,
        default=str,
    )


# ============================================================
# ANALYSIS HELPERS
# ============================================================

def decode_analysis(
    record: EvidenceVisualAnalysis,
) -> dict:

    try:

        data = json.loads(
            record.analysis_json
        )

    except (
        TypeError,
        json.JSONDecodeError,
    ) as exc:

        logger.exception(
            "Invalid visual analysis JSON for evidence %s",
            record.evidence_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Stored visual analysis is invalid.",
        ) from exc

    if not isinstance(data, dict):

        raise HTTPException(
            status_code=500,
            detail=(
                "Stored visual analysis has "
                "an invalid structure."
            ),
        )

    # The database revision is authoritative.
    data["analysis_revision"] = (
        record.analysis_revision
    )

    return data


def get_current_analysis(
    evidence_id: int,
    db: Session,
) -> tuple[
    EvidenceFile,
    EvidenceVisualAnalysis,
    dict,
]:

    evidence = db.get(
        EvidenceFile,
        evidence_id,
    )

    if evidence is None:

        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    analysis = db.scalar(
        select(EvidenceVisualAnalysis)
        .where(
            EvidenceVisualAnalysis.evidence_id
            == evidence_id
        )
    )

    if analysis is None:

        raise HTTPException(
            status_code=404,
            detail="No visual analysis found.",
        )

    data = decode_analysis(
        analysis
    )

    return (
        evidence,
        analysis,
        data,
    )


# ============================================================
# DETECTION VALIDATION
# ============================================================

def is_valid_coordinate(
    value: Any,
) -> bool:

    if isinstance(value, bool):
        return False

    if not isinstance(value, (int, float)):
        return False

    return math.isfinite(float(value))


def validate_bounding_box(
    bounding_box: dict,
) -> bool:

    coordinates = bounding_box.get(
        "coordinates"
    )

    if not isinstance(coordinates, dict):
        return False

    required = {
        "left",
        "top",
        "right",
        "bottom",
    }

    if not required.issubset(coordinates):
        return False

    left = coordinates["left"]
    top = coordinates["top"]
    right = coordinates["right"]
    bottom = coordinates["bottom"]

    if not all(
        is_valid_coordinate(value)
        for value in (
            left,
            top,
            right,
            bottom,
        )
    ):
        return False

    # Reject zero-area or inverted bounding boxes.
    if float(left) >= float(right):
        return False

    if float(top) >= float(bottom):
        return False

    return True


def get_reviewable_objects(
    analysis_data: dict,
) -> list[dict]:

    segmentation = analysis_data.get(
        "segmentation"
    )

    if not isinstance(segmentation, dict):
        return []

    if segmentation.get("status") != "completed":
        return []

    if segmentation.get("processing_status") != "completed":
        return []

    processed = segmentation.get(
        "processed_results"
    )

    if not isinstance(processed, dict):
        return []

    objects = processed.get("objects")

    if not isinstance(objects, list):
        return []

    candidates = []

    seen_object_ids = set()

    for item in objects:

        if not isinstance(item, dict):
            continue

        object_id = item.get(
            "object_id"
        )

        if object_id is None:
            continue

        object_id = str(
            object_id
        ).strip()

        if not object_id:
            continue

        if len(object_id) > 100:
            logger.warning(
                "Skipping oversized SAM object ID."
            )
            continue

        # Duplicate IDs cannot safely represent
        # separate review records.
        if object_id in seen_object_ids:

            logger.warning(
                "Duplicate SAM object ID skipped: %s",
                object_id,
            )

            continue

        bounding_box = item.get(
            "bounding_box"
        )

        if not isinstance(bounding_box, dict):
            continue

        if not validate_bounding_box(
            bounding_box
        ):
            continue

        seen_object_ids.add(
            object_id
        )

        box_record_count = item.get(
            "bounding_box_record_count",
            0,
        )

        mask_record_count = item.get(
            "mask_record_count",
            0,
        )

        duplicate_records = (
            isinstance(box_record_count, int)
            and box_record_count > 1
        ) or (
            isinstance(mask_record_count, int)
            and mask_record_count > 1
        )

        candidates.append({

            "object_id": object_id,

            "bounding_box": bounding_box,

            "segmentation_mask": item.get(
                "segmentation_mask"
            ),

            "has_segmentation_mask": bool(
                item.get(
                    "has_segmentation_mask"
                )
            ),

            "is_fully_segmented": bool(
                item.get(
                    "is_fully_segmented"
                )
            ),

            "duplicate_records": duplicate_records,

        })

    return candidates


# ============================================================
# REVIEW DATABASE HELPERS
# ============================================================

def get_review_map(
    evidence_id: int,
    revision: int,
    db: Session,
) -> dict[str, VisualDetectionReview]:

    reviews = db.scalars(
        select(VisualDetectionReview).where(
            VisualDetectionReview.evidence_id
            == evidence_id,

            VisualDetectionReview.analysis_revision
            == revision,
        )
    ).all()

    return {
        item.object_id: item
        for item in reviews
    }


def get_or_create_review(
    evidence_id: int,
    revision: int,
    candidate: dict,
    db: Session,
) -> VisualDetectionReview:

    object_id = candidate["object_id"]

    review = db.scalar(
        select(VisualDetectionReview)
        .where(
            VisualDetectionReview.evidence_id
            == evidence_id,

            VisualDetectionReview.analysis_revision
            == revision,

            VisualDetectionReview.object_id
            == object_id,
        )
    )

    if review is not None:
        return review

    review = VisualDetectionReview(

        evidence_id=evidence_id,

        analysis_revision=revision,

        object_id=object_id,

        status="pending",

        detection_snapshot_json=encode_json(
            candidate
        ),

    )

    # Use a savepoint to handle concurrent creation
    # without invalidating the outer transaction.
    try:

        with db.begin_nested():

            db.add(review)
            db.flush()

        return review

    except IntegrityError:

        existing = db.scalar(
            select(VisualDetectionReview)
            .where(
                VisualDetectionReview.evidence_id
                == evidence_id,

                VisualDetectionReview.analysis_revision
                == revision,

                VisualDetectionReview.object_id
                == object_id,
            )
        )

        if existing is not None:
            return existing

        raise


# ============================================================
# REVIEW SUMMARY
# ============================================================

def build_review_summary(
    candidates: list[dict],
    reviews: dict[str, VisualDetectionReview],
) -> dict:

    counts = {
        "pending": 0,
        "accepted": 0,
        "rejected": 0,
        "needs_review": 0,
    }

    for candidate in candidates:

        review = reviews.get(
            candidate["object_id"]
        )

        status = (
            review.status
            if review is not None
            else "pending"
        )

        if status not in REVIEW_STATUSES:

            logger.error(
                "Unexpected review status: %s",
                status,
            )

            status = "pending"

        counts[status] += 1

    total = len(candidates)

    resolved = (
        counts["accepted"]
        + counts["rejected"]
    )

    return {

        "total_candidates": total,

        "accepted": counts["accepted"],

        "rejected": counts["rejected"],

        "pending": counts["pending"],

        "needs_review": counts["needs_review"],

        "resolved": resolved,

        "completion_percentage": (
            round(
                resolved / total * 100,
                2,
            )
            if total
            else 100.0
        ),

        "can_complete": (
            total > 0
            and counts["pending"] == 0
            and counts["needs_review"] == 0
        ),

    }


# ============================================================
# AUDIT EVENT HELPERS
# ============================================================

def record_review_event(
    review: VisualDetectionReview,
    action: str,
    actor: str,
    previous_status: str | None,
    new_status: str,
    note: str,
    db: Session,
) -> None:

    event = VisualDetectionReviewEvent(

        review_id=review.id,

        action=action,

        actor=actor,

        previous_status=previous_status,

        new_status=new_status,

        details_json=encode_json({
            "note": note,
        }),

    )

    db.add(event)


def invalidate_verification(
    analysis: EvidenceVisualAnalysis,
    analysis_data: dict,
    actor: str,
    note: str,
) -> bool:

    if analysis.verification_status != "verified":
        return False

    timestamp = utc_now_iso()

    verification_events = analysis_data.get(
        "verification_events",
        [],
    )

    if not isinstance(
        verification_events,
        list,
    ):
        verification_events = []

    verification_events.append({

        "action": "verification_invalidated",

        "actor": actor,

        "timestamp": timestamp,

        "analysis_revision": analysis.analysis_revision,

        "reason": (
            "A detection review changed after verification."
        ),

        "note": note,

    })

    analysis_data["verification_events"] = (
        verification_events
    )

    previous_verification = analysis_data.get(
        "verification",
        {},
    )

    analysis_data["previous_verification"] = (
        previous_verification
    )

    analysis_data["verification"] = {

        "status": "pending",

        "verified_by": None,

        "verified_at": None,

        "analysis_revision": analysis.analysis_revision,

        "human_verification_required": True,

        "invalidated_at": timestamp,

        "invalidated_by": actor,

    }

    analysis.verification_status = "pending"

    analysis.analysis_json = encode_json(
        analysis_data
    )

    return True


# ============================================================
# GET DETECTIONS
# ============================================================

@router.get(
    "/evidence/{evidence_id}/detections"
)
def get_detection_candidates(
    evidence_id: int,
    db: Session = Depends(get_db),
):

    evidence, analysis, analysis_data = (
        get_current_analysis(
            evidence_id,
            db,
        )
    )

    candidates = get_reviewable_objects(
        analysis_data
    )

    revision = analysis.analysis_revision

    reviews = get_review_map(
        evidence_id,
        revision,
        db,
    )

    results = []

    for candidate in candidates:

        review = reviews.get(
            candidate["object_id"]
        )

        results.append({

            **candidate,

            "review": {

                "status": (
                    review.status
                    if review
                    else "pending"
                ),

                "actor": (
                    review.actor
                    if review
                    else None
                ),

                "note": (
                    review.note
                    if review
                    else ""
                ),

                "updated_at": (
                    review.updated_at
                    if review
                    else None
                ),

            },

        })

    return {

        "evidence_id": evidence_id,

        "analysis_id": analysis.id,

        "analysis_revision": revision,

        "candidate_count": len(results),

        "detections": results,

        "verification": build_review_summary(
            candidates,
            reviews,
        ),

        "inventory_mutation_performed": False,

    }


# ============================================================
# UPDATE DETECTION REVIEW
# ============================================================

@router.patch(
    "/evidence/{evidence_id}/detections/{object_id}"
)
def update_detection_review(
    evidence_id: int,
    object_id: str,
    payload: DetectionReviewRequest,
    db: Session = Depends(get_db),
):

    _, analysis, analysis_data = (
        get_current_analysis(
            evidence_id,
            db,
        )
    )

    candidates = get_reviewable_objects(
        analysis_data
    )

    candidate = next(
        (
            item
            for item in candidates
            if item["object_id"] == object_id
        ),
        None,
    )

    if candidate is None:

        raise HTTPException(
            status_code=404,
            detail=(
                "Detection candidate not found in "
                "the current analysis revision."
            ),
        )

    revision = analysis.analysis_revision

    actor = payload.actor
    note = payload.note

    try:

        review = get_or_create_review(
            evidence_id=evidence_id,
            revision=revision,
            candidate=candidate,
            db=db,
        )

        previous_status = review.status

        review.status = payload.status

        review.actor = actor

        review.note = note

        review.updated_at = utc_now()

        record_review_event(
            review=review,
            action="detection_review_updated",
            actor=actor,
            previous_status=previous_status,
            new_status=payload.status,
            note=note,
            db=db,
        )

        verification_invalidated = (
            invalidate_verification(
                analysis=analysis,
                analysis_data=analysis_data,
                actor=actor,
                note=note,
            )
        )

        db.commit()

        db.refresh(review)

    except HTTPException:
        db.rollback()
        raise

    except Exception:

        db.rollback()

        logger.exception(
            "Could not save visual detection review."
        )

        raise HTTPException(
            status_code=500,
            detail="Could not save detection review.",
        )

    return {

        "evidence_id": evidence_id,

        "analysis_revision": revision,

        "object_id": object_id,

        "status": review.status,

        "actor": review.actor,

        "note": review.note,

        "verification_invalidated": (
            verification_invalidated
        ),

        "inventory_mutation_performed": False,

    }


# ============================================================
# GET VERIFICATION PROGRESS
# ============================================================

@router.get(
    "/evidence/{evidence_id}/verification"
)
def get_verification_progress(
    evidence_id: int,
    db: Session = Depends(get_db),
):

    _, analysis, analysis_data = (
        get_current_analysis(
            evidence_id,
            db,
        )
    )

    candidates = get_reviewable_objects(
        analysis_data
    )

    reviews = get_review_map(
        evidence_id,
        analysis.analysis_revision,
        db,
    )

    return {

        "evidence_id": evidence_id,

        "analysis_revision": analysis.analysis_revision,

        "verification_status": analysis.verification_status,

        "verification": analysis_data.get(
            "verification",
            {},
        ),

        "summary": build_review_summary(
            candidates,
            reviews,
        ),

        "inventory_mutation_performed": False,

    }


# ============================================================
# COMPLETE VERIFICATION
# ============================================================

@router.post(
    "/evidence/{evidence_id}/verification/complete"
)
def complete_verification(
    evidence_id: int,
    payload: VerificationCompleteRequest,
    db: Session = Depends(get_db),
):

    _, analysis, analysis_data = (
        get_current_analysis(
            evidence_id,
            db,
        )
    )

    candidates = get_reviewable_objects(
        analysis_data
    )

    revision = analysis.analysis_revision

    reviews = get_review_map(
        evidence_id,
        revision,
        db,
    )

    summary = build_review_summary(
        candidates,
        reviews,
    )

    if not candidates:

        raise HTTPException(
            status_code=409,
            detail=(
                "There are no reviewable detection candidates."
            ),
        )

    if not summary["can_complete"]:

        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    "Verification cannot be completed "
                    "while candidates remain unresolved."
                ),
                "summary": summary,
            },
        )

    # Idempotency: don't create another completion
    # record for an already verified revision.
    if (
        analysis.verification_status == "verified"
        and analysis_data.get("verification", {}).get(
            "status"
        ) == "verified"
    ):

        existing_verification = analysis_data[
            "verification"
        ]

        return {

            "evidence_id": evidence_id,

            "analysis_revision": revision,

            "verification_status": "verified",

            "verified_by": existing_verification.get(
                "verified_by"
            ),

            "verified_at": existing_verification.get(
                "verified_at"
            ),

            "summary": summary,

            "already_verified": True,

            "inventory_mutation_performed": False,

        }

    actor = payload.actor
    timestamp = utc_now_iso()

    try:

        verification = {

            "status": "verified",

            "verified_by": actor,

            "verified_at": timestamp,

            "analysis_revision": revision,

            "summary": summary,

            "note": payload.note,

            "human_verification_required": False,

        }

        verification_history = analysis_data.get(
            "verification_history",
            [],
        )

        if not isinstance(
            verification_history,
            list,
        ):
            verification_history = []

        verification_history.append(
            verification
        )

        analysis_data["verification_history"] = (
            verification_history
        )

        analysis_data["verification"] = (
            verification
        )

        analysis_data["analysis_revision"] = (
            revision
        )

        analysis.verification_status = "verified"

        analysis.analysis_json = encode_json(
            analysis_data
        )

        db.commit()

        db.refresh(analysis)

    except Exception:

        db.rollback()

        logger.exception(
            "Could not complete visual verification."
        )

        raise HTTPException(
            status_code=500,
            detail="Could not complete verification.",
        )

    return {

        "evidence_id": evidence_id,

        "analysis_revision": revision,

        "verification_status": "verified",

        "verified_by": actor,

        "verified_at": timestamp,

        "summary": summary,

        "already_verified": False,

        "inventory_mutation_performed": False,

        "message": (
            "Visual detection verification completed. "
            "No inventory quantities were changed."
        ),

    }


# ============================================================
# REVIEW AUDIT HISTORY
# ============================================================

@router.get(
    "/evidence/{evidence_id}/verification/audit"
)
def get_verification_audit(
    evidence_id: int,
    db: Session = Depends(get_db),
):

    evidence = db.get(
        EvidenceFile,
        evidence_id,
    )

    if evidence is None:

        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    current_analysis = db.scalar(
        select(EvidenceVisualAnalysis)
        .where(
            EvidenceVisualAnalysis.evidence_id
            == evidence_id
        )
    )

    reviews = db.scalars(
        select(VisualDetectionReview)
        .where(
            VisualDetectionReview.evidence_id
            == evidence_id
        )
        .order_by(
            VisualDetectionReview.analysis_revision,
            VisualDetectionReview.object_id,
        )
    ).all()

    review_ids = [
        review.id
        for review in reviews
    ]

    events = []

    if review_ids:

        events = db.scalars(
            select(VisualDetectionReviewEvent)
            .where(
                VisualDetectionReviewEvent.review_id.in_(
                    review_ids
                )
            )
            .order_by(
                VisualDetectionReviewEvent.created_at,
                VisualDetectionReviewEvent.id,
            )
        ).all()

    analysis_data = (
        decode_analysis(current_analysis)
        if current_analysis is not None
        else {}
    )

    return {

        "evidence_id": evidence_id,

        "current_analysis_revision": (
            current_analysis.analysis_revision
            if current_analysis is not None
            else None
        ),

        "verification": analysis_data.get(
            "verification",
            {},
        ),

        "verification_history": analysis_data.get(
            "verification_history",
            [],
        ),

        "verification_events": analysis_data.get(
            "verification_events",
            [],
        ),

        "reviews": [

            {

                "review_id": review.id,

                "analysis_revision": (
                    review.analysis_revision
                ),

                "object_id": review.object_id,

                "status": review.status,

                "actor": review.actor,

                "note": review.note,

                "detection_snapshot": safely_decode_json(
                    review.detection_snapshot_json
                ),

                "created_at": review.created_at,

                "updated_at": review.updated_at,

            }

            for review in reviews

        ],

        "events": [

            {

                "id": event.id,

                "review_id": event.review_id,

                "action": event.action,

                "actor": event.actor,

                "previous_status": event.previous_status,

                "new_status": event.new_status,

                "details": safely_decode_json(
                    event.details_json
                ),

                "created_at": event.created_at,

            }

            for event in events

        ],

        "inventory_mutation_performed": False,

    }