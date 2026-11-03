import asyncio
import json
import logging
from pathlib import Path

from app.services.meta.sam import segment_inventory_image

logging.basicConfig(level=logging.INFO)

IMAGE_PATH = Path("/absolute/path/to/your/shelf-image.jpg")
CONTENT_TYPE = "image/jpeg"
OBJECT_PROMPT = "biscuit packets"


async def main():
    if not IMAGE_PATH.is_file():
        raise FileNotFoundError(
            f"Test image not found: {IMAGE_PATH}"
        )

    result = await segment_inventory_image(
        image_path=str(IMAGE_PATH),
        content_type=CONTENT_TYPE,
        object_prompt=OBJECT_PROMPT,
    )

    print("\n========== SAM SEGMENTATION RESULT ==========\n")

    print(
        json.dumps(
            result,
            indent=2,
            ensure_ascii=False,
        )
    )

    print("\n========== SUMMARY ==========\n")

    print("Model:", result["model"])
    print("Outcome:", result["outcome"])
    print("Detected objects:", result["total_detected_objects"])
    print("Segmentation masks:", result["total_masks"])
    print("Diagnostics:", len(result["diagnostics"]))


if __name__ == "__main__":
    asyncio.run(main())