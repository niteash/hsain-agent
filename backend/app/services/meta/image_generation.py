import base64
import logging
import re
from pathlib import Path
from typing import Any

from app.config import BACKEND_DIR, META_MODELS
from app.services.meta_client import get_meta_client

logger = logging.getLogger(__name__)

IMAGE_MODEL = META_MODELS["image"]

GENERATED_IMAGE_DIR = (
    BACKEND_DIR / "generated" / "images"
).resolve()

MAX_PROMPT_LENGTH = 12000


def ensure_output_directory() -> Path:
    GENERATED_IMAGE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )
    return GENERATED_IMAGE_DIR


def validate_prompt(prompt: str) -> str:
    if not isinstance(prompt, str):
        raise ValueError("Prompt must be a string.")

    prompt = prompt.strip()

    if not prompt:
        raise ValueError("Image generation prompt cannot be empty.")

    if len(prompt) > MAX_PROMPT_LENGTH:
        raise ValueError("Image generation prompt is too long.")

    return prompt


def safe_filename(value: str) -> str:
    value = re.sub(
        r"[^a-zA-Z0-9_-]+",
        "-",
        value,
    )

    return value.strip("-_")[:60] or "generated-image"


def get_response_field(
    value: Any,
    field: str,
    default: Any = None,
) -> Any:
    if isinstance(value, dict):
        return value.get(field, default)

    return getattr(value, field, default)


def generate_inventory_image(
    prompt: str,
    *,
    filename_prefix: str = "hsain",
    previous_response_id: str | None = None,
) -> dict[str, Any]:

    prompt = validate_prompt(prompt)

    client = get_meta_client()

    request_arguments: dict[str, Any] = {
    "model": IMAGE_MODEL,
    "input": prompt,
    "tools": [
        {
            "type": "image_generation",
        }
    ],
}

    if previous_response_id:
        if not previous_response_id.startswith("resp_"):
            raise ValueError(
                "Invalid previous response identifier."
            )

        request_arguments["previous_response_id"] = (
            previous_response_id
        )

    logger.info(
        "Starting Muse Image generation. Model=%s",
        IMAGE_MODEL,
    )

    response = client.responses.create(
        **request_arguments,
    )

    response_status = get_response_field(
        response,
        "status",
    )

    if response_status != "completed":
        raise RuntimeError(
            f"Muse Image did not complete successfully: "
            f"{response_status}"
        )

    output_items = get_response_field(
        response,
        "output",
        [],
    )

    image_item = next(
        (
            item
            for item in output_items
            if get_response_field(item, "type")
            == "image_generation_call"
        ),
        None,
    )

    if image_item is None:
        raise RuntimeError(
            "Muse Image completed without an image output."
        )

    image_base64 = get_response_field(
        image_item,
        "result",
    )

    if not isinstance(image_base64, str) or not image_base64:
        raise RuntimeError(
            "Muse Image returned an empty image result."
        )

    try:
        image_bytes = base64.b64decode(
            image_base64,
            validate=True,
        )
    except Exception as exc:
        raise RuntimeError(
            "Muse Image returned invalid image data."
        ) from exc

    if not image_bytes:
        raise RuntimeError(
            "Generated image is empty."
        )

    # Muse Image may return WebP, PNG, or JPEG.
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        extension = ".webp"
    elif image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        extension = ".png"
    elif image_bytes.startswith(b"\xff\xd8\xff"):
        extension = ".jpg"
    else:
        raise RuntimeError(
            "Generated image has an unsupported format."
        )

    output_dir = ensure_output_directory()

    image_name = safe_filename(filename_prefix)

    output_path = (
        output_dir / f"{image_name}-{get_response_field(response, 'id')}{extension}"
    ).resolve()

    if output_path.parent != output_dir:
        raise RuntimeError(
            "Invalid generated image destination."
        )

    output_path.write_bytes(image_bytes)

    logger.info(
        "Muse Image generation completed. Response=%s",
        get_response_field(response, "id"),
    )

    return {
        "status": "completed",
        "model": IMAGE_MODEL,
        "response_id": get_response_field(response, "id"),
        "image_generation_id": get_response_field(
            image_item,
            "id",
        ),
        "filename": output_path.name,
        "file_size": len(image_bytes),
        "content_type": {
            ".webp": "image/webp",
            ".png": "image/png",
            ".jpg": "image/jpeg",
        }[extension],
        "storage_path": str(output_path),
    }