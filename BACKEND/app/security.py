from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import settings


limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL,
    default_limits=["120/minute"],
    headers_enabled=True,
)
