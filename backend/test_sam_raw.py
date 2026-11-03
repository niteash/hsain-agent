import asyncio
import base64
import hashlib
import json
import logging
from pathlib import Path

import httpx

from app.config import (
    MODEL_API_BASE_URL,
    MODEL_API_KEY,
    META_MODELS,
    MAX_UPLOAD_SIZE,
)

logging.basicConfig(level=logging.INFO)

IMAGE_PATH = Path("/Users/nikki/Downloads/shelf2.png")
CONTENT_TYPE = "image/png"
OBJECT_PROMPT = "packaged food"

MODEL = META_MODELS["sam"]


def create_data_url(path: Path) -> str:
    encoded = base64.b64encode(
        path.read_bytes()
    ).decode("ascii")

    return f"data:{CONTENT_TYPE};base64,{encoded}"


def inspect_response(
    label: str,
    data: dict,
) -> None:

    print(f"\n{'=' * 65}")
    print(f"TEST: {label}")
    print("=" * 65)

    print("Response ID:", data.get("id"))
    print("Model:", data.get("model"))
    print("Status:", data.get("status"))
    print("Usage:", data.get("usage"))

    output = data.get("output", [])

    print("Output items:", len(output))

    for index, item in enumerate(output):

        print(f"\nOUTPUT ITEM {index}")
        print("Type:", item.get("type"))
        print("Status:", item.get("status"))

        for content_index, content in enumerate(
            item.get("content", [])
        ):

            text = content.get("text", "")

            print(f"\nCONTENT {content_index}")
            print("Type:", content.get("type"))
            print("Text length:", len(text))

            print(
                "Bounding boxes:",
                text.count("<|box;"),
            )

            print(
                "Masks:",
                text.count("<|mask;"),
            )

            if text:
                print("Preview:", repr(text[:500]))

    print("=" * 65)


async def main():

    if not MODEL_API_KEY:
        raise RuntimeError("MODEL_API_KEY is missing.")

    if not IMAGE_PATH.is_file():
        raise FileNotFoundError(IMAGE_PATH)

    file_size = IMAGE_PATH.stat().st_size

    if file_size <= 0 or file_size > MAX_UPLOAD_SIZE:
        raise ValueError("Invalid image size.")

    image_bytes = IMAGE_PATH.read_bytes()

    print("\n========== REQUEST INFORMATION ==========")
    print("Image:", IMAGE_PATH)
    print("Content type:", CONTENT_TYPE)
    print("Image size:", file_size)
    print("SHA256:", hashlib.sha256(image_bytes).hexdigest())
    print("Prompt:", OBJECT_PROMPT)
    print("Model:", MODEL)
    print("==========================================\n")

    image_url = create_data_url(IMAGE_PATH)

    endpoint = (
        MODEL_API_BASE_URL.rstrip("/")
        + "/responses"
    )

    headers = {
        "Authorization": f"Bearer {MODEL_API_KEY}",
        "Content-Type": "application/json",
    }

    # --------------------------------------------------------
    # FORMAT A: Explicit message input
    # --------------------------------------------------------

    payload_a = {
        "model": MODEL,
        "stream": False,
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": OBJECT_PROMPT,
                    },
                    {
                        "type": "input_image",
                        "image_url": image_url,
                    },
                ],
            }
        ],
    }

    # --------------------------------------------------------
    # FORMAT B: Standard role/content input
    # --------------------------------------------------------

    payload_b = {
        "model": MODEL,
        "stream": False,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": OBJECT_PROMPT,
                    },
                    {
                        "type": "input_image",
                        "image_url": image_url,
                    },
                ],
            }
        ],
    }

    timeout = httpx.Timeout(120.0)

    async with httpx.AsyncClient(
        timeout=timeout,
    ) as client:

        for label, payload in [
            ("FORMAT A: Explicit message", payload_a),
            ("FORMAT B: Standard role/content", payload_b),
        ]:

            print(f"\nSending {label}...")

            response = await client.post(
                endpoint,
                headers=headers,
                json=payload,
            )

            print("HTTP status:", response.status_code)

            if response.status_code >= 400:
                print("Error:", response.text[:2000])
                continue

            data = response.json()

            inspect_response(
                label,
                data,
            )


if __name__ == "__main__":
    asyncio.run(main())