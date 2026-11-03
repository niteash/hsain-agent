import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]

load_dotenv(BACKEND_DIR / ".env")

CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]


MODEL_API_KEY = os.getenv("MODEL_API_KEY")

MODEL_API_BASE_URL = os.getenv(
    "MODEL_API_BASE_URL",
    "https://api.meta.ai/v1",
).rstrip("/")

MODEL_NAME = os.getenv("MODEL_NAME", "muse-spark-1.3")

META_MODELS = {
    "spark": os.getenv("MODEL_SPARK", "muse-spark-1.3"),
    "wonder": os.getenv("MODEL_WONDER", "muse-wonder-1.0"),
    "image": os.getenv("MODEL_IMAGE", "muse-image-1.0"),
    "voice": os.getenv(
        "MODEL_VOICE",
        "muse-voice-transcribe-1.0",
    ),
    "sam": os.getenv("MODEL_SAM", "sam-3.1"),
}

UPLOAD_DIR = Path(
    os.getenv(
        "UPLOAD_DIR",
        str(BACKEND_DIR / "uploads" / "investigations"),
    )
).resolve()

MAX_UPLOAD_SIZE = 10 * 1024 * 1024

ALLOWED_EVIDENCE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


def validate_config() -> None:
    if not MODEL_API_KEY:
        raise RuntimeError(
            "MODEL_API_KEY is missing. Configure backend/.env."
        )

    if not MODEL_API_BASE_URL.startswith("https://"):
        raise RuntimeError(
            "MODEL_API_BASE_URL must use HTTPS."
        )