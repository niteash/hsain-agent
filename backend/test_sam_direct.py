import base64
from pathlib import Path

from openai import OpenAI

from app.config import (
    MODEL_API_BASE_URL,
    MODEL_API_KEY,
    META_MODELS,
)

IMAGE_PATH = Path("/Users/nikki/Downloads/shelf2.png")
OBJECT_PROMPT = "packaged food"

image_data = base64.b64encode(
    IMAGE_PATH.read_bytes()
).decode("ascii")

client = OpenAI(
    api_key=MODEL_API_KEY,
    base_url=MODEL_API_BASE_URL,
    timeout=120,
)

response = client.responses.create(
    model=META_MODELS["sam"],
    input=[
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
                    "image_url": f"data:image/png;base64,{image_data}",
                },
            ],
        }
    ],
)
print("\n========== RESPONSE EXTRACTION DEBUG ==========")

print(
    "response.output_text length:",
    len(response.output_text or "")
)

for output_index, output_item in enumerate(response.output):
    print(f"\nOutput item {output_index}:")
    print("Type:", output_item.type)

    for content_index, content in enumerate(
        getattr(output_item, "content", [])
    ):
        print(f"\nContent {content_index}:")
        print("Type:", content.type)

        text_value = getattr(content, "text", None)

        if text_value is not None:
            print("Text length:", len(text_value))
            print("Text preview:", repr(text_value[:500]))
print("Response ID:", response.id)
print("Model:", response.model)
print("Output text:", repr(response.output_text))
print("Full response:")
print(response.model_dump_json(indent=2))