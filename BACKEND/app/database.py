import hashlib
import hmac
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parent.parent


# ============================================================
# Settings
# ============================================================

class Settings(BaseSettings):

    DATABASE_URL: str

    JWT_SECRET: str
    JWT_REFRESH_SECRET: str | None = None
    JWT_ALGORITHM: str = "HS256"
    PRODUCTION: bool = False

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PRODUCT_SEARCH_SIMILARITY_THRESHOLD: float = Field(default=0.25, ge=0, le=1)
    GROQ_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    GROQ_MODEL: str = "qwen/qwen3.8-27b"
    GEMINI_MODEL: str = "gemini-3.8-flash"
    CHROMA_PERSIST_DIRECTORY: str = str(BACKEND_DIR / "app" / "vector_store")

    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173,"
        "http://localhost:4173,"
        "http://127.0.0.1:4173"
    )

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR / "app" / ".env"),
        extra="ignore"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [
            origin.strip().rstrip("/")
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]
        if "*" in origins:
            raise ValueError("CORS_ORIGINS cannot contain '*' when credentials are enabled")
        return origins

    @property
    def effective_jwt_refresh_secret(self) -> str:
        if self.JWT_REFRESH_SECRET:
            return self.JWT_REFRESH_SECRET
        return hmac.new(
            self.JWT_SECRET.encode(),
            b"refresh-token-signing-key",
            hashlib.sha256,
        ).hexdigest()


settings = Settings()


# ============================================================
# PostgreSQL Engine
# ============================================================

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True
)


# ============================================================
# Database Session
# ============================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# ============================================================
# SQLAlchemy Base
# ============================================================

Base = declarative_base()


# ============================================================
# Database Dependency
# ============================================================

def get_db():

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()