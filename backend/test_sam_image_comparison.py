import asyncio
import base64
from pathlib import Path
from io import BytesIO

from PIL import Image, ImageOps

from openai import AsyncOpenAI

from app.config import (
    MODEL_API_KEY,
    MODEL_API_BASE_URL,
    META_MODELS,
)

from app.database import SessionLocal
from app.models import EvidenceFile


OUTPUT_DIR = Path("/tmp/hsain_sam_tests")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PROMPT = "packaged food"

client = AsyncOpenAI(
    api_key=MODEL_API_KEY,
    base_url=MODEL_API_BASE_URL,
    timeout=180.0,
    max_retries=0,
)


def prepare_images():
    db = SessionLocal()

    try:
        evidence = db.get(EvidenceFile, 15)

        if evidence is None:
            raise RuntimeError("Evidence 15 not found")

        source_path = Path(evidence.storage_path)

    finally:
        db.close()

    shelf2_path = Path("/Users/nikki/Downloads/shelf2.png")

    if not shelf2_path.exists():
        raise FileNotFoundError(shelf2_path)

    prepared = []

    # Original JPEG.
    prepared.append((
        "shelf01_original",
        source_path,
        "image/jpeg",
    ))

    with Image.open(source_path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")

        # Re-encoded JPEG.
        jpeg_path = OUTPUT_DIR / "shelf01_reencoded.jpg"

        image.save(
            jpeg_path,
            format="JPEG",
            quality=95,
        )

        prepared.append((
            "shelf01_reencoded",
            jpeg_path,
            "image/jpeg",
        ))

        # PNG conversion.
        png_path = OUTPUT_DIR / "shelf01_converted.png"

        image.save(
            png_path,
            format="PNG",
        )

        prepared.append((
            "shelf01_png",
            png_path,
            "image/png",
        ))

        # Resized image.
        resized = image.copy()
        resized.thumbnail((900, 900))

        resized_path = OUTPUT_DIR / "shelf01_resized.jpg"

        resized.save(
            resized_path,
            format="JPEG",
            quality=90,
        )

        prepared.append((
            "shelf01_resized",
            resized_path,
            "image/jpeg",
        ))

    # Known successful control image.
    prepared.append((
        "shelf2_control",
        shelf2_path,
        "image/png",
    ))

    return prepared


async def test_image(name, path, content_type):
    image_bytes = path.read_bytes()

    data_url = (
        f"data:{content_type};base64,"
        f"{base64.b64encode(image_bytes).decode('utf-8')}"
    )

    print(f"\n{'=' * 55}")
    print("TEST:", name)
    print("File size:", len(image_bytes))
    print("MIME:", content_type)

    response = await client.responses.create(
        model=META_MODELS["sam"],
        input=[
            {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": PROMPT,
                    },
                    {
                        "type": "input_image",
                        "image_url": data_url,
                    },
                ],
            }
        ],
    )

    output = response.output_text or ""

    print("Response ID:", response.id)
    print("Status:", response.status)
    print("Images processed:", getattr(
        response.usage,
        "images_processed",
        None,
    ))
    print("Output tokens:", getattr(
        response.usage,
        "output_tokens",
        None,
    ))
    print("Output length:", len(output))
    print("Boxes:", output.count("<|box;"))
    print("Masks:", output.count("<|mask;"))


async def main():
    prepared = prepare_images()

    print("SAM model:", META_MODELS["sam"])
    print("Prompt:", PROMPT)

    for name, path, content_type in prepared:
        try:
            await test_image(
                name,
                path,
                content_type,
            )

        except Exception as exc:
            print(
                f"\n{name} FAILED:",
                type(exc).__name__,
                str(exc),
            )


if __name__ == "__main__":
    asyncio.run(main())
