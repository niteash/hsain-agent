from io import BytesIO
from pathlib import Path

from fastapi import HTTPException
from pypdf import PdfReader

from app.config import UPLOAD_DIR

MAX_PDF_PAGES = 30
MAX_EXTRACTED_CHARACTERS = 50_000


def extract_pdf_text(storage_path: str) -> dict:
    path = Path(storage_path).resolve()

    if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Evidence file is unavailable.",
        )

    try:
        content = path.read_bytes()
        reader = PdfReader(BytesIO(content), strict=True)

        if reader.is_encrypted:
            raise HTTPException(
                status_code=422,
                detail="Encrypted PDFs are not supported.",
            )

        page_count = len(reader.pages)

        if page_count == 0:
            raise HTTPException(
                status_code=422,
                detail="PDF contains no pages.",
            )

        if page_count > MAX_PDF_PAGES:
            raise HTTPException(
                status_code=422,
                detail=f"PDF exceeds the {MAX_PDF_PAGES}-page limit.",
            )

        extracted_pages = []

        for page_number, page in enumerate(reader.pages, start=1):
            page_text = page.extract_text() or ""

            extracted_pages.append(
                f"--- PAGE {page_number} ---\n{page_text}"
            )

        extracted_text = "\n\n".join(extracted_pages).strip()

        if not extracted_text:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No selectable text found. "
                    "This PDF may require OCR."
                ),
            )

        if len(extracted_text) > MAX_EXTRACTED_CHARACTERS:
            extracted_text = extracted_text[:MAX_EXTRACTED_CHARACTERS]

        return {
            "extracted_text": extracted_text,
            "page_count": page_count,
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from this PDF.",
        )