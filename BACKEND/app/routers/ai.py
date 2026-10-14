import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.ai_service import (
    AIProviderUnavailable,
    catalogue_follow_up_search_context,
    configured_providers,
    prepare_catalogue_index,
    retrieve_catalog_context,
    stream_completion,
)
from app.ai_features import (
    generate_product_description,
    moderate_product_content,
    run_catalog_agent,
)
from app.ai_usage import AIQuotaExceeded, AIUsageUnavailable, get_ai_usage
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.security import authenticated_user_rate_limit_key, limiter


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


class ProductDescriptionRequest(BaseModel):
    product_name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0)
    features: str = Field(min_length=1, max_length=2000)

    @field_validator("features")
    @classmethod
    def require_descriptive_features(cls, value: str) -> str:
        features = value.strip()
        if not any(character.isalpha() for character in features):
            raise ValueError("Add at least one descriptive product feature.")
        return features


class ProductContentModerationRequest(BaseModel):
    product_name: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=1000)


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


@router.get("/usage")
def get_ai_usage_report(
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    try:
        return get_ai_usage()
    except AIQuotaExceeded as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error


@router.post("/catalogue/prepare")
@limiter.limit("10/minute", key_func=authenticated_user_rate_limit_key)
def prepare_ai_catalogue(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return {"products_loaded": prepare_catalogue_index(db)}


@router.post("/chat/stream")
@limiter.limit("10/minute", key_func=authenticated_user_rate_limit_key)
def stream_ai_chat(
    request: Request,
    response: Response,
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    providers = configured_providers()
    if not providers:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No AI provider is configured. Add a Groq or Gemini API key.",
        )
    chat_messages = [message.model_dump() for message in body.messages]
    question = chat_messages[-1]["content"]
    history = chat_messages[:-1]
    search_context = catalogue_follow_up_search_context(question, history)
    if search_context:
        context, sources = retrieve_catalog_context(
            db,
            question,
            search_context=search_context,
        )
    else:
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
        except AIUsageUnavailable as error:
            yield _sse("error", {"detail": str(error)})
        except AIQuotaExceeded as error:
            yield _sse("error", {"detail": str(error)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/product-description")
@limiter.limit("10/minute", key_func=authenticated_user_rate_limit_key)
def create_product_description(
    request: Request,
    response: Response,
    body: ProductDescriptionRequest,
    current_user: User = Depends(get_current_user),
):
    del current_user
    try:
        description, provider, cached = generate_product_description(
            product_name=body.product_name,
            price=body.price,
            features=body.features,
        )
    except AIUsageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    except AIQuotaExceeded as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(error),
        ) from error
    except AIProviderUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error
    return {"description": description, "provider": provider, "cached": cached}


@router.post("/moderate")
@limiter.limit("10/minute", key_func=authenticated_user_rate_limit_key)
def moderate_product_description(
    request: Request,
    response: Response,
    body: ProductContentModerationRequest,
    current_user: User = Depends(get_current_user),
):
    del current_user
    try:
        result, provider, cached = moderate_product_content(
            content=body.content,
            product_name=body.product_name,
        )
    except AIUsageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    except AIQuotaExceeded as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(error),
        ) from error
    except AIProviderUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    return {
        **result.model_dump(),
        "provider": provider,
        "cached": cached,
    }


@router.post("/agent")
@limiter.limit("10/minute", key_func=authenticated_user_rate_limit_key)
def run_ai_product_agent(
    request: Request,
    response: Response,
    body: AIChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return run_catalog_agent(
            messages=[message.model_dump() for message in body.messages],
            db=db,
            user_id=current_user.id,
        )
    except AIUsageUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    except AIQuotaExceeded as error:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(error),
        ) from error
    except AIProviderUnavailable as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
