from fastapi import APIRouter, HTTPException
from openai import APIConnectionError, APIStatusError, APITimeoutError
from pydantic import BaseModel

from app.config import MODEL_NAME
from app.services.meta_client import generate_response

router = APIRouter(prefix="/api/ai", tags=["AI"])


class AITestResponse(BaseModel):
    status: str
    model: str
    message: str


@router.get("/test", response_model=AITestResponse)
def test_meta_api():
    prompt = (
        "You are Hsain Agent, an AI back-office assistant for small retail shops. "
        "Reply with one short sentence confirming you are ready to investigate "
        "retail inventory discrepancies. Do not claim to have accessed inventory."
    )

    try:
        result = generate_response(prompt)
        return AITestResponse(
            status="success",
            model=MODEL_NAME,
            message=result,
        )
    except (APIConnectionError, APITimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Could not connect to Meta Model API.",
        )
    except APIStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Meta Model API returned HTTP {exc.status_code}.",
        )
    except RuntimeError:
        raise HTTPException(
            status_code=500,
            detail="Meta Model API configuration is invalid.",
        )
