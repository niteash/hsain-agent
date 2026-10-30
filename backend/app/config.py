import os

from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

MODEL_API_KEY = os.getenv("MODEL_API_KEY")
MODEL_API_BASE_URL = os.getenv(
    "MODEL_API_BASE_URL",
    "https://api.meta.ai/v1",
)
MODEL_NAME = os.getenv("MODEL_NAME", "muse-spark-1.3")


def validate_config() -> None:
    if not MODEL_API_KEY:
        raise RuntimeError(
            "MODEL_API_KEY is missing. Configure backend/.env."
        )
        
        

BACKEND_DIR = Path(__file__).resolve().parents[1]

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