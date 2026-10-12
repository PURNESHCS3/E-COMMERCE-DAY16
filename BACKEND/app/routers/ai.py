import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.ai_service import (
    AIProviderUnavailable,
    configured_providers,
    retrieve_catalog_context,
    stream_completion,
)
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.security import limiter


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["AI product assistant"])


class AIChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AIChatRequest(BaseModel):
    messages: list[AIChatMessage] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def latest_message_must_be_from_user(self):
        if self.messages[-1].role != "user":
            raise ValueError("The latest chat message must be from the user.")
        return self


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=True)}\n\n"


@router.get("/providers")
def get_ai_providers(
    current_user: User = Depends(get_current_user),
):
    del current_user
    return {
        "providers": [
            {"name": provider.name, "model": provider.model}
            for provider in configured_providers()
        ]
    }


@router.post("/chat/stream")
@limiter.limit("10/minute")
def stream_ai_chat(
    request: Request,
    response: Response,
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    providers = configured_providers()
    if not providers:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No AI provider is configured. Add a Groq or Gemini API key.",
        )
    chat_messages = [message.model_dump() for message in body.messages]
    question = chat_messages[-1]["content"]
    history = chat_messages[:-1]
    context, sources = retrieve_catalog_context(db, question)

    async def event_stream():
        yield _sse("sources", {"products": sources})
        active_provider: str | None = None
        try:
            async for provider_name, token in stream_completion(
                providers,
                context=context,
                history=history,
                question=question,
            ):
                if token is None:
                    yield _sse("attempt", {"name": provider_name})
                    continue
                if provider_name != active_provider:
                    active_provider = provider_name
                    yield _sse("provider", {"name": provider_name})
                yield _sse("token", {"text": token})
            yield _sse("done", {})
        except AIProviderUnavailable as error:
            logger.warning("AI chat could not complete: %s", error)
            yield _sse("error", {"detail": str(error)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
