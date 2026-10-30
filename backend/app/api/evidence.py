from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR
from app.dependencies import get_db
from app.models import EvidenceFile, Investigation
from app.services.evidence import (
    delete_evidence_file,
    save_evidence_file,
)

router = APIRouter(
    prefix="/api/evidence",
    tags=["Evidence"],
)


class EvidenceResponse(BaseModel):
    id: int
    investigation_id: int
    original_filename: str
    content_type: str
    file_size: int
    created_at: str


def serialize_evidence(record: EvidenceFile) -> dict:
    return {
        "id": record.id,
        "investigation_id": record.investigation_id,
        "original_filename": record.original_filename,
        "content_type": record.content_type,
        "file_size": record.file_size,
        "created_at": record.created_at.isoformat(),
    }


@router.post(
    "/{investigation_id}",
    response_model=EvidenceResponse,
    status_code=201,
)
async def upload_evidence(
    investigation_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    investigation = db.get(Investigation, investigation_id)

    if investigation is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found.",
        )

    saved_file = await save_evidence_file(file)

    record = EvidenceFile(
        investigation_id=investigation_id,
        **saved_file,
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)

        return serialize_evidence(record)

    except Exception:
        db.rollback()
        delete_evidence_file(saved_file["storage_path"])
        raise HTTPException(
            status_code=500,
            detail="Could not save evidence metadata.",
        )

    finally:
        await file.close()


@router.get("/{investigation_id}")
def list_evidence(
    investigation_id: int,
    db: Session = Depends(get_db),
):
    investigation = db.get(Investigation, investigation_id)

    if investigation is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found.",
        )

    statement = (
        select(EvidenceFile)
        .where(EvidenceFile.investigation_id == investigation_id)
        .order_by(EvidenceFile.id.desc())
    )

    records = db.scalars(statement).all()

    return {
        "items": [serialize_evidence(record) for record in records],
        "total": len(records),
    }


@router.get("/file/{evidence_id}/download")
def download_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
):
    record = db.get(EvidenceFile, evidence_id)

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Evidence file not found.",
        )

    path = Path(record.storage_path).resolve()

    if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Evidence file is unavailable.",
        )

    return FileResponse(
        path=path,
        media_type=record.content_type,
        filename=record.original_filename,
    )