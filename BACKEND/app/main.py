import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.database import engine, settings
from app.redis_client import redis_client
from app.security import limiter
from app.routers import (
    auth,
    products,
    cart,
    orders,
    websocket,
    chat,
    jobs,
    ai,
)


logger = logging.getLogger(__name__)


app = FastAPI(
    title="E-Commerce API",
    version="1.0.0",
    openapi_url=None if settings.PRODUCTION else "/openapi.json",
    docs_url=None if settings.PRODUCTION else "/docs",
    redoc_url=None if settings.PRODUCTION else "/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if request.url.scheme == "https":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


app.include_router(auth.router)
app.include_router(products.router)
app.include_router(cart.router)
app.include_router(orders.router)
app.include_router(websocket.router)
app.include_router(chat.router)
app.include_router(jobs.router)
app.include_router(ai.router)


@app.get("/healthz", include_in_schema=False)
def health_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        redis_client.ping()
    except (SQLAlchemyError, RedisError) as error:
        logger.warning("Health check failed (%s).", type(error).__name__)
        raise HTTPException(
            status_code=503,
            detail="A required application dependency is unavailable.",
        )
    return {"status": "ok"}


def accepts_webp(accept_header: str) -> bool:
    for media_range in accept_header.split(","):
        media_type, *parameters = media_range.split(";")
        if media_type.strip() != "image/webp":
            continue

        quality = next(
            (
                parameter.split("=", 1)[1].strip()
                for parameter in parameters
                if parameter.strip().startswith("q=")
            ),
            "1",
        )
        try:
            return float(quality) > 0
        except ValueError:
            continue

    return False


@app.get("/static/products/{filename}", include_in_schema=False)
def serve_product_image(filename: str, request: Request):
    if Path(filename).name != filename:
        raise HTTPException(status_code=404, detail="Product image not found")

    image_path = Path(products.UPLOAD_DIR) / filename
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Product image not found")

    webp_path = image_path.with_suffix(".webp")
    response_path = (
        webp_path
        if accepts_webp(request.headers.get("accept", "")) and webp_path.is_file()
        else image_path
    )

    return FileResponse(
        response_path,
        media_type="image/webp" if response_path == webp_path else None,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Vary": "Accept",
        },
    )


app.mount(
    "/static/products",
    StaticFiles(directory=products.UPLOAD_DIR),
    name="product-images"
)