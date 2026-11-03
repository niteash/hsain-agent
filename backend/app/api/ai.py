from fastapi import APIRouter, Depends, HTTPException
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import MODEL_NAME
from app.dependencies import get_db
from app.services.meta.spark import ask_spark
from app.services.meta_client import generate_response


router = APIRouter(
    prefix="/api/ai",
    tags=["AI"],
)


class AITestResponse(BaseModel):
    status: str
    model: str
    message: str


class AIChatRequest(BaseModel):
    question: str = Field(
        min_length=1,
        max_length=4000,
    )


class AIToolCall(BaseModel):
    tool: str
    arguments: dict
    success: bool


class AIChatResponse(BaseModel):
    answer: str
    model: str
    tool_calls: list[AIToolCall]
    response_id: str


def handle_meta_error(exc: Exception):

    if isinstance(
        exc,
        (APIConnectionError, APITimeoutError),
    ):
        raise HTTPException(
            status_code=503,
            detail="Could not connect to Meta Model API.",
        )

    if isinstance(exc, APIStatusError):
        raise HTTPException(
            status_code=502,
            detail=f"Meta Model API returned HTTP {exc.status_code}.",
        )

    if isinstance(exc, RuntimeError):
        raise HTTPException(
            status_code=500,
            detail="Meta Model API configuration or execution error.",
        )

    raise HTTPException(
        status_code=500,
        detail="An unexpected AI service error occurred.",
    )


@router.get(
    "/test",
    response_model=AITestResponse,
)
def test_meta_api():

    prompt = (
        "You are Hsain Agent, an AI back-office assistant "
        "for small retail shops. Reply with one short sentence "
        "confirming you are ready to investigate retail inventory "
        "discrepancies. Do not claim to have accessed inventory."
    )

    try:
        result = generate_response(prompt)

        return AITestResponse(
            status="success",
            model=MODEL_NAME,
            message=result,
        )

    except (
        APIConnectionError,
        APITimeoutError,
        APIStatusError,
        RuntimeError,
    ) as exc:
        handle_meta_error(exc)


@router.post(
    "/chat",
    response_model=AIChatResponse,
)
def chat_with_agent(
    request: AIChatRequest,
    db: Session = Depends(get_db),
):

    try:
        result = ask_spark(
            db=db,
            question=request.question,
        )

        return AIChatResponse(
            answer=result["answer"],
            model=result["model"],
            tool_calls=result["tool_calls"],
            response_id=result["response_id"],
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    except (
        APIConnectionError,
        APITimeoutError,
        APIStatusError,
        RuntimeError,
    ) as exc:
        handle_meta_error(exc)