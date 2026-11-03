from functools import lru_cache

from openai import OpenAI

from app.config import (
    MODEL_API_BASE_URL,
    MODEL_API_KEY,
    MODEL_NAME,
    META_MODELS,
    validate_config,
)


@lru_cache(maxsize=1)
def get_meta_client() -> OpenAI:
    validate_config()

    return OpenAI(
        api_key=MODEL_API_KEY,
        base_url=MODEL_API_BASE_URL,
        timeout=60.0,
        max_retries=2,
    )


def generate_with_model(
    prompt: str,
    model: str,
    instructions: str | None = None,
) -> str:
    client = get_meta_client()

    response = client.responses.create(
        model=model,
        instructions=instructions,
        input=prompt,
    )

    output = response.output_text.strip()

    if not output:
        raise RuntimeError(
            f"Meta model {model} returned an empty response."
        )

    return output


def generate_response(prompt: str) -> str:
    return generate_with_model(
        prompt=prompt,
        model=MODEL_NAME,
    )


def generate_spark_response(
    prompt: str,
    instructions: str | None = None,
) -> str:
    return generate_with_model(
        prompt=prompt,
        model=META_MODELS["spark"],
        instructions=instructions,
    )


def generate_wonder_response(
    prompt: str,
    instructions: str | None = None,
) -> str:
    return generate_with_model(
        prompt=prompt,
        model=META_MODELS["wonder"],
        instructions=instructions,
    )