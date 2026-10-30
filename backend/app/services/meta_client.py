from openai import OpenAI

from app.config import (
    MODEL_API_BASE_URL,
    MODEL_API_KEY,
    MODEL_NAME,
    validate_config,
)


def get_meta_client() -> OpenAI:
    validate_config()

    return OpenAI(
        api_key=MODEL_API_KEY,
        base_url=MODEL_API_BASE_URL,
        timeout=30.0,
        max_retries=1,
    )


def generate_response(prompt: str) -> str:
    client = get_meta_client()

    response = client.responses.create(
        model=MODEL_NAME,
        input=prompt,
    )

    output = response.output_text.strip()

    if not output:
        raise RuntimeError("Meta Model API returned an empty response.")

    return output
