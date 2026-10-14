from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import decode_token
from app.database import settings


def authenticated_user_rate_limit_key(request: Request) -> str:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token:
        payload = decode_token(token)
        user_id = payload.get("sub") if payload and payload.get("type") == "access" else None
        if user_id is not None:
            return f"ai-user:{user_id}"
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,
    default_limits=["120/minute"],
    headers_enabled=True,
)
