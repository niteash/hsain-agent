import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import (
    ALLOWED_EVIDENCE_TYPES,
    MAX_UPLOAD_SIZE,
    UPLOAD_DIR,
)


def validate_file_signature(content: bytes, content_type: str) -> bool:
    signatures = {
        "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
        "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": lambda data: (
            len(data) >= 12
            and data.startswith(b"RIFF")
            and data[8:12] == b"WEBP"
        ),
        "application/pdf": lambda data: data.startswith(b"%PDF-"),
    }

    validator = signatures.get(content_type)

    return bool(validator and validator(content))


async def save_evidence_file(
    file: UploadFile,
) -> dict:
    content_type = file.content_type or ""

    if content_type not in ALLOWED_EVIDENCE_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Upload JPEG, PNG, WebP, or PDF.",
        )

    content = await file.read(MAX_UPLOAD_SIZE + 1)

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File exceeds the 10 MB upload limit.",
        )

    if not validate_file_signature(content, content_type):
        raise HTTPException(
            status_code=415,
            detail="File content does not match its declared file type.",
        )

    extension = ALLOWED_EVIDENCE_TYPES[content_type]
    stored_filename = f"{uuid.uuid4().hex}{extension}"

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    storage_path = UPLOAD_DIR / stored_filename

    try:
        storage_path.write_bytes(content)
    except OSError:
        raise HTTPException(
            status_code=500,
            detail="Could not store the uploaded evidence.",
        )

    original_filename = Path(file.filename or "evidence").name
    original_filename = "".join(
        char for char in original_filename
        if char.isprintable()
    )[:255] or "evidence"

    return {
        "original_filename": original_filename,
        "stored_filename": stored_filename,
        "content_type": content_type,
        "file_size": len(content),
        "storage_path": str(storage_path),
    }


def delete_evidence_file(storage_path: str) -> None:
    path = Path(storage_path).resolve()

    if path.parent != UPLOAD_DIR.resolve():
        return

    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass