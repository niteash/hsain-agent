from __future__ import annotations

import base64
import logging

from pathlib import Path
from typing import Any, AsyncIterator

from openai import (
    AsyncOpenAI,
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
)

from meta_sam_parser import (
    ImageSegmentationResult,
    ResponsesEventLike,
    SegmentationBoxRecord,
    SegmentationMaskRecord,
    decode_mask_to_raster,
    decode_mask_to_svg_path,
    image_segmentation_format,
    parse_responses_stream,
)

from app.config import (
    MODEL_API_BASE_URL,
    MODEL_API_KEY,
    META_MODELS,
    MAX_UPLOAD_SIZE,
)

from app.services.meta.image import SUPPORTED_IMAGE_TYPES


logger = logging.getLogger(__name__)


# ============================================================
# CONFIGURATION
# ============================================================

SAM_MODEL = META_MODELS["sam"]

SAM_TIMEOUT = 120.0

SAM_MAX_RETRIES = 2

MAX_PROMPT_LENGTH = 120

MAX_LOG_PREVIEW = 1000


# ============================================================
# CLIENT
# ============================================================

def get_sam_client() -> AsyncOpenAI:
    if not MODEL_API_KEY:
        raise RuntimeError(
            "MODEL_API_KEY is not configured."
        )

    return AsyncOpenAI(
        api_key=MODEL_API_KEY,
        base_url=MODEL_API_BASE_URL,
        timeout=SAM_TIMEOUT,
        max_retries=SAM_MAX_RETRIES,
    )


# ============================================================
# SDK OBJECT NORMALIZATION
# ============================================================

def to_plain_data(value: Any) -> Any:
    """
    Convert SDK, Pydantic, enum and dataclass-like
    objects into JSON-compatible Python values.
    """

    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, bytes):
        return None

    if isinstance(value, dict):
        return {
            str(key): to_plain_data(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            to_plain_data(item)
            for item in value
        ]

    if isinstance(value, set):
        return [
            to_plain_data(item)
            for item in value
        ]

    if hasattr(value, "value"):
        return to_plain_data(value.value)

    if hasattr(value, "model_dump"):
        try:
            return to_plain_data(
                value.model_dump(
                    mode="json",
                    exclude_none=True,
                )
            )
        except (TypeError, ValueError):
            return to_plain_data(
                value.model_dump()
            )

    if hasattr(value, "to_dict"):
        try:
            return to_plain_data(
                value.to_dict()
            )
        except Exception:
            pass

    if hasattr(value, "__dict__"):
        return {
            key: to_plain_data(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }

    return str(value)


def get_field(
    obj: Any,
    field: str,
    default: Any = None,
) -> Any:
    """
    Read a field from a dictionary or SDK object.
    """

    if isinstance(obj, dict):
        return obj.get(field, default)

    value = getattr(
        obj,
        field,
        default,
    )

    if value is not default:
        return value

    plain = to_plain_data(obj)

    if isinstance(plain, dict):
        return plain.get(field, default)

    return default


def enum_value(value: Any) -> str:
    """
    Normalize enum values into readable strings.
    """

    if hasattr(value, "value"):
        value = value.value

    return str(value).lower().split(".")[-1]


# ============================================================
# IMAGE VALIDATION
# ============================================================

def validate_image(
    image_path: str,
    content_type: str,
) -> Path:
    """
    Validate image format, existence and file size.
    """

    path = Path(image_path).resolve()

    if content_type not in SUPPORTED_IMAGE_TYPES:
        raise ValueError(
            "Unsupported image format. "
            "Use JPEG, PNG, or WebP."
        )

    if not path.is_file():
        raise FileNotFoundError(
            "Segmentation image was not found."
        )

    file_size = path.stat().st_size

    if file_size <= 0:
        raise ValueError(
            "Image file is empty."
        )

    if file_size > MAX_UPLOAD_SIZE:
        raise ValueError(
            "Image exceeds the maximum upload size."
        )

    return path


# ============================================================
# IMAGE DATA URL
# ============================================================

def create_image_data_url(
    image_path: Path,
    content_type: str,
) -> str:
    """
    Convert an image into a base64 data URL.
    """

    encoded = base64.b64encode(
        image_path.read_bytes()
    ).decode("ascii")

    return (
        f"data:{content_type};base64,{encoded}"
    )


# ============================================================
# INPUT VALIDATION
# ============================================================

def validate_object_prompt(
    object_prompt: str,
) -> str:
    """
    Validate the object category sent to SAM.
    """

    if not isinstance(object_prompt, str):
        raise ValueError(
            "Object prompt must be a string."
        )

    prompt = object_prompt.strip()

    if not prompt:
        raise ValueError(
            "Object prompt cannot be empty."
        )

    if len(prompt) > MAX_PROMPT_LENGTH:
        raise ValueError(
            f"Object prompt must not exceed "
            f"{MAX_PROMPT_LENGTH} characters."
        )

    return prompt


# ============================================================
# RESPONSES INPUT
# ============================================================

def build_sam_input(
    object_prompt: str,
    image_data_url: str,
) -> list[dict[str, Any]]:
    """
    Build the Responses API input.
    """

    return [
        {
            "type": "message",
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": object_prompt,
                },
                {
                    "type": "input_image",
                    "image_url": image_data_url,
                },
            ],
        }
    ]


# ============================================================
# OUTPUT TEXT EXTRACTION
# ============================================================

def extract_output_lanes(
    response: Any,
) -> list[dict[str, Any]]:
    """
    Extract actual output_text lanes from the
    Responses API.

    Does not collect arbitrary strings from the response.
    """

    output = get_field(
        response,
        "output",
        [],
    ) or []

    lanes: list[dict[str, Any]] = []

    for output_index, output_item in enumerate(output):

        item_id = get_field(
            output_item,
            "id",
        )

        content_items = get_field(
            output_item,
            "content",
            [],
        ) or []

        for content_index, content in enumerate(content_items):

            content_type = get_field(
                content,
                "type",
            )

            if content_type != "output_text":
                continue

            content_text = get_field(
                content,
                "text",
            )

            if not isinstance(content_text, str):
                continue

            lanes.append(
                {
                    "item_id": item_id,
                    "output_index": output_index,
                    "content_index": content_index,
                    "text": content_text,
                }
            )

    return lanes


def extract_response_text(
    response: Any,
) -> str:
    """
    Extract actual Responses API output_text content.
    """

    lanes = extract_output_lanes(response)

    return "\n".join(
        lane["text"]
        for lane in lanes
        if lane["text"]
    )


# ============================================================
# SAM PROTOCOL VALIDATION
# ============================================================

def count_sam_records(
    raw_text: str,
) -> tuple[int, int]:
    """
    Count recognized SAM bounding boxes and masks.
    """

    if not isinstance(raw_text, str):
        return 0, 0

    return (
        raw_text.count("<|box;"),
        raw_text.count("<|mask;"),
    )


def validate_sam_protocol(
    raw_text: str,
) -> None:
    """
    Validate that the response contains SAM records.

    Recognized records:

        <|box;...|>
        <|mask;...|>

    This function only validates.
    """

    if not isinstance(raw_text, str) or not raw_text.strip():
        raise RuntimeError(
            "SAM returned empty output_text content."
        )

    box_count, mask_count = count_sam_records(
        raw_text
    )

    if box_count == 0 and mask_count == 0:
        raise RuntimeError(
            "SAM returned completed output without "
            "recognizable segmentation records."
        )

    if box_count == 0:
        logger.warning(
            "SAM returned masks without bounding boxes."
        )

    if mask_count == 0:
        logger.warning(
            "SAM returned bounding boxes without masks."
        )

    logger.info(
        "SAM protocol validated. Boxes=%s, Masks=%s",
        box_count,
        mask_count,
    )


# ============================================================
# SAM RESPONSE DIAGNOSTICS
# ============================================================

def debug_sam_response(
    response: Any,
    raw_text: str,
) -> None:
    """
    Inspect response structure without logging
    enormous encoded segmentation mask payloads.
    """

    logger.info("=" * 70)
    logger.info("SAM RESPONSE DIAGNOSTICS")
    logger.info("=" * 70)

    logger.info(
        "Response class: %s",
        type(response),
    )

    logger.info(
        "Response status: %s",
        get_field(response, "status"),
    )

    logger.info(
        "Extracted text length: %s",
        len(raw_text),
    )

    logger.info(
        "Extracted text preview: %r",
        raw_text[:MAX_LOG_PREVIEW],
    )

    output = get_field(
        response,
        "output",
        [],
    ) or []

    logger.info(
        "Output item count: %s",
        len(output),
    )

    for output_index, item in enumerate(output):

        logger.info(
            "OUTPUT ITEM %s | id=%s | type=%s",
            output_index,
            get_field(item, "id"),
            get_field(item, "type"),
        )

        content_items = get_field(
            item,
            "content",
            [],
        ) or []

        for content_index, content in enumerate(content_items):

            content_type = get_field(
                content,
                "type",
            )

            content_text = get_field(
                content,
                "text",
            )

            logger.info(
                "CONTENT %s.%s | type=%s",
                output_index,
                content_index,
                content_type,
            )

            if isinstance(content_text, str):

                logger.info(
                    "CONTENT TEXT | length=%s | preview=%r",
                    len(content_text),
                    content_text[:500],
                )

                logger.info(
                    "CONTENT TOKENS | boxes=%s | masks=%s",
                    content_text.count("<|box;"),
                    content_text.count("<|mask;"),
                )

    logger.info(
        "END SAM RESPONSE DIAGNOSTICS"
    )

    logger.info("=" * 70)


# ============================================================
# OUTPUT ITEM IDENTIFICATION
# ============================================================

def find_output_lane(
    response: Any,
    raw_text: str,
) -> dict[str, Any]:
    """
    Find the actual output_text lane containing
    the SAM segmentation protocol.
    """

    lanes = extract_output_lanes(response)

    matching_lanes = [
        lane
        for lane in lanes
        if (
            "<|box;" in lane["text"]
            or "<|mask;" in lane["text"]
        )
    ]

    if len(matching_lanes) != 1:
        raise RuntimeError(
            "Expected exactly one SAM segmentation output lane. "
            f"Found: {len(matching_lanes)}."
        )

    lane = matching_lanes[0]

    if not isinstance(lane["item_id"], str):
        raise RuntimeError(
            "SAM output item is missing a valid ID."
        )

    if lane["text"] != raw_text:
        raise RuntimeError(
            "Extracted SAM protocol does not match "
            "the original output lane."
        )

    return lane


# ============================================================
# COMPLETED RESPONSE EVENT ADAPTER
# ============================================================

async def completed_response_events(
    response: Any,
    raw_text: str,
) -> AsyncIterator[ResponsesEventLike]:
    """
    Adapt a completed non-streaming response into
    events expected by meta-sam-parser.
    """

    validate_sam_protocol(raw_text)

    lane = find_output_lane(
        response=response,
        raw_text=raw_text,
    )

    logger.info(
        (
            "ADAPTING SAM RESPONSE | "
            "item_id=%s | output_index=%s | "
            "content_index=%s | text_length=%s"
        ),
        lane["item_id"],
        lane["output_index"],
        lane["content_index"],
        len(raw_text),
    )

    yield {
        "type": "response.output_text.done",
        "item_id": lane["item_id"],
        "output_index": lane["output_index"],
        "content_index": lane["content_index"],
        "text": raw_text,
    }

    yield {
        "type": "response.completed",
    }


# ============================================================
# PARSE SEGMENTATION RESPONSE
# ============================================================

async def parse_image_events(
    events: AsyncIterator[ResponsesEventLike],
) -> ImageSegmentationResult:

    parsed = parse_responses_stream(
        events,
        image_segmentation_format(),
    )

    return await parsed.final_result()


# ============================================================
# RESULT VALIDATION
# ============================================================

def validate_segmentation_result(
    result: ImageSegmentationResult,
) -> None:

    outcome_status = enum_value(
        result.outcome.status
    )

    if outcome_status != "completed":

        reason = getattr(
            result.outcome,
            "reason",
            "unknown",
        )

        detail = getattr(
            result.outcome,
            "detail",
            None,
        )

        raise RuntimeError(
            f"SAM segmentation incomplete: "
            f"{reason}. {detail or ''}"
        )

    errors = [
        diagnostic
        for diagnostic in result.diagnostics
        if enum_value(diagnostic.severity) == "error"
    ]

    if errors:

        messages = "; ".join(
            (
                f"Line {item.line}: "
                f"{item.message}"
            )
            for item in errors
        )

        raise RuntimeError(
            "SAM parser rejected segmentation output: "
            f"{messages}"
        )


# ============================================================
# FRAME SERIALIZATION
# ============================================================

def serialize_frame(frame: Any) -> Any:
    """
    Normalize optional frame metadata.
    """

    if frame is None:
        return None

    return to_plain_data(frame)


# ============================================================
# BOUNDING BOX SERIALIZATION
# ============================================================

def serialize_box(
    record: SegmentationBoxRecord,
) -> dict[str, Any]:

    return {
        "object_id": record.object_id,
        "left": record.left,
        "top": record.top,
        "right": record.right,
        "bottom": record.bottom,
        "confidence": record.confidence,
        "frame": serialize_frame(record.frame),
    }


# ============================================================
# MASK SERIALIZATION
# ============================================================

def serialize_mask(
    record: SegmentationMaskRecord,
) -> dict[str, Any]:
    """
    Decode SAM masks into frontend-friendly data.

    Original encoded mask payloads are not returned.
    """

    raster = decode_mask_to_raster(
        record.mask
    )

    svg_path = decode_mask_to_svg_path(
        record.mask
    )

    foreground_pixels = sum(
        1
        for pixel in raster
        if pixel != 0
    )

    return {
        "object_id": record.object_id,
        "width": record.mask.width,
        "height": record.mask.height,
        "encoding": enum_value(record.mask.encoding),
        "revision": record.revision,
        "confidence": record.confidence,
        "foreground_pixels": foreground_pixels,
        "svg_path": svg_path,
        "bounds": {
            "left": record.bounds.left,
            "top": record.bounds.top,
            "right": record.bounds.right,
            "bottom": record.bounds.bottom,
        },
        "frame": serialize_frame(record.frame),
    }


# ============================================================
# SERIALIZE SEGMENTATION RESULTS
# ============================================================

def serialize_segmentation_result(
    result: ImageSegmentationResult,
    object_prompt: str,
) -> dict[str, Any]:

    boxes: list[dict[str, Any]] = []
    masks: list[dict[str, Any]] = []
    other_records: list[dict[str, Any]] = []

    for record in result.records:

        if isinstance(record, SegmentationBoxRecord):

            boxes.append(
                serialize_box(record)
            )

        elif isinstance(record, SegmentationMaskRecord):

            masks.append(
                serialize_mask(record)
            )

        else:

            other_records.append(
                to_plain_data(record)
            )

    diagnostics = [
        {
            "severity": enum_value(item.severity),
            "code": item.code,
            "line": item.line,
            "message": item.message,
        }
        for item in result.diagnostics
    ]

    media = to_plain_data(
        result.media
    )

    return {
        "analysis_type": "sam_image_segmentation",
        "status": "completed",
        "model": SAM_MODEL,
        "object_prompt": object_prompt,
        "outcome": enum_value(result.outcome.status),
        "revision": result.revision,
        "media": media,
        "raw_output_length": len(result.raw_output),
        "total_records": len(result.records),
        "total_detected_objects": len(boxes),
        "total_masks": len(masks),
        "boxes": boxes,
        "masks": masks,
        "other_records": other_records,
        "diagnostics": diagnostics,
        "human_verification_required": True,
        "inventory_mutation_performed": False,
    }


# ============================================================
# NO-DETECTION RESULT
# ============================================================

def build_no_detections_result(
    object_prompt: str,
    response: Any,
    raw_text: str,
) -> dict[str, Any]:
    """
    Return a valid result when SAM completes successfully
    but produces no recognizable segmentation records.

    This is not an API failure.
    """

    debug_sam_response(
        response=response,
        raw_text=raw_text,
    )

    logger.warning(
        "SAM completed without segmentation records. "
        "Prompt=%s | Text length=%s",
        object_prompt,
        len(raw_text),
    )

    return {
        "analysis_type": "sam_image_segmentation",
        "status": "no_detections",
        "model": SAM_MODEL,
        "object_prompt": object_prompt,
        "outcome": "completed",
        "revision": None,
        "media": None,
        "raw_output_length": len(raw_text),
        "total_records": 0,
        "total_detected_objects": 0,
        "total_masks": 0,
        "boxes": [],
        "masks": [],
        "other_records": [],
        "diagnostics": [
            {
                "severity": "warning",
                "code": "NO_SEGMENTATION_RECORDS",
                "line": None,
                "message": (
                    "SAM completed the request but returned "
                    "no recognizable bounding boxes or masks. "
                    "Try a clearer image or a broader object prompt."
                ),
            }
        ],
        "response_preview": raw_text[:500],
        "human_verification_required": True,
        "inventory_mutation_performed": False,
    }


# ============================================================
# MAIN SEGMENTATION FUNCTION
# ============================================================

async def segment_inventory_image(
    image_path: str,
    content_type: str,
    object_prompt: str,
) -> dict[str, Any]:
    """
    Segment a specific object category in a retail image.

    Examples:
        object_prompt="packaged food"
        object_prompt="biscuit packets"
        object_prompt="bottles"

    This function performs visual segmentation only.

    It does not:

        - Modify inventory.
        - Change product quantities.
        - Confirm product identity.
        - Approve stock adjustments.
        - Create supplier orders.
    """

    # --------------------------------------------------------
    # 1. VALIDATE INPUTS
    # --------------------------------------------------------

    path = validate_image(
        image_path=image_path,
        content_type=content_type,
    )

    prompt = validate_object_prompt(
        object_prompt
    )

    # --------------------------------------------------------
    # 2. BUILD IMAGE DATA URL
    # --------------------------------------------------------

    image_url = create_image_data_url(
        image_path=path,
        content_type=content_type,
    )

    request_input = build_sam_input(
        object_prompt=prompt,
        image_data_url=image_url,
    )

    logger.info(
        "Starting SAM segmentation. Model=%s, Prompt=%s",
        SAM_MODEL,
        prompt,
    )

    client = get_sam_client()

    # --------------------------------------------------------
    # 3. META SAM API REQUEST
    # --------------------------------------------------------

    try:

        async with client:

            response = await client.responses.create(
                model=SAM_MODEL,
                input=request_input,
                stream=False,
            )

        response_status = get_field(
            response,
            "status",
        )

        if response_status != "completed":

            raise RuntimeError(
                "SAM response did not complete successfully. "
                f"Status: {response_status}"
            )

        # ----------------------------------------------------
        # 4. EXTRACT ACTUAL OUTPUT TEXT
        # ----------------------------------------------------

        raw_text = extract_response_text(
            response
        )

        box_count, mask_count = count_sam_records(
            raw_text
        )

        output_items = get_field(
            response,
            "output",
            [],
        ) or []

        logger.info(
            (
                "SAM RESPONSE RECEIVED | "
                "status=%s | output_items=%s | "
                "text_length=%s | boxes=%s | masks=%s"
            ),
            response_status,
            len(output_items),
            len(raw_text),
            box_count,
            mask_count,
        )

        # ----------------------------------------------------
        # 5. HANDLE NO-DETECTION RESPONSE
        # ----------------------------------------------------

        if box_count == 0 and mask_count == 0:

            return build_no_detections_result(
                object_prompt=prompt,
                response=response,
                raw_text=raw_text,
            )

        # ----------------------------------------------------
        # 6. VALIDATE SAM PROTOCOL
        # ----------------------------------------------------

        validate_sam_protocol(
            raw_text
        )

        # ----------------------------------------------------
        # 7. ADAPT RESPONSE INTO PARSER EVENTS
        # ----------------------------------------------------

        events = completed_response_events(
            response=response,
            raw_text=raw_text,
        )

        # ----------------------------------------------------
        # 8. PARSE SAM OUTPUT
        # ----------------------------------------------------

        result = await parse_image_events(
            events
        )

        # ----------------------------------------------------
        # 9. VALIDATE PARSER RESULT
        # ----------------------------------------------------

        validate_segmentation_result(
            result
        )

        # ----------------------------------------------------
        # 10. SERIALIZE RESULT
        # ----------------------------------------------------

        serialized = serialize_segmentation_result(
            result=result,
            object_prompt=prompt,
        )

        logger.info(
            (
                "SAM segmentation completed. "
                "Prompt=%s | Records=%s | "
                "Boxes=%s | Masks=%s"
            ),
            prompt,
            serialized["total_records"],
            serialized["total_detected_objects"],
            serialized["total_masks"],
        )

        return serialized

    except APIConnectionError:

        logger.exception(
            "SAM API connection error. Model=%s",
            SAM_MODEL,
        )

        raise

    except APITimeoutError:

        logger.exception(
            "SAM API timeout. Model=%s",
            SAM_MODEL,
        )

        raise

    except APIStatusError as exc:

        logger.exception(
            "SAM API returned HTTP %s. Model=%s",
            exc.status_code,
            SAM_MODEL,
        )

        raise

    except Exception:

        logger.exception(
            "SAM segmentation failed. Model=%s | Prompt=%s",
            SAM_MODEL,
            prompt,
        )

        raise