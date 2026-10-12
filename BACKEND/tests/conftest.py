import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


# ============================================================
# LOAD .ENV
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent

ENV_FILE = BASE_DIR / ".env"

load_dotenv(
    dotenv_path=ENV_FILE,
    override=True
)


# ============================================================
# TEST DATABASE
# ============================================================

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL"
)

if not TEST_DATABASE_URL:
    raise RuntimeError(
        f"TEST_DATABASE_URL was not found in {ENV_FILE}"
    )

TEST_REDIS_URL = os.getenv("TEST_REDIS_URL")
if not TEST_REDIS_URL:
    raise RuntimeError(
        f"TEST_REDIS_URL was not found in {ENV_FILE}"
    )

app_redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
test_redis = urlparse(TEST_REDIS_URL)
app_redis = urlparse(app_redis_url)
if (
    test_redis.scheme,
    test_redis.hostname,
    test_redis.port,
    test_redis.path,
) == (
    app_redis.scheme,
    app_redis.hostname,
    app_redis.port,
    app_redis.path,
):
    raise RuntimeError(
        "TEST_REDIS_URL must use a different Redis database from REDIS_URL"
    )

# The application routers must use the isolated Redis database during tests too.
os.environ["REDIS_URL"] = TEST_REDIS_URL

from app.main import app
from app.database import Base, get_db
from app.models import BackgroundJob, ChatMessage, Product, RefreshSession, User
from app.redis_client import redis_client
from app.auth import hash_password


# ============================================================
# TEST DATABASE ENGINE
# ============================================================

test_engine = create_engine(
    TEST_DATABASE_URL,
    pool_pre_ping=True
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine
)


# ============================================================
# DATABASE OVERRIDE
# ============================================================

def override_get_db():

    db = TestingSessionLocal()

    try:
        yield db

    finally:
        db.close()


app.dependency_overrides[
    get_db
] = override_get_db


# ============================================================
# DATABASE SETUP
# ============================================================

@pytest.fixture(
    scope="session",
    autouse=True
)
def setup_database():
    if test_engine.dialect.name == "postgresql":
        with test_engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    Base.metadata.drop_all(
        bind=test_engine
    )

    Base.metadata.create_all(
        bind=test_engine
    )

    yield

    Base.metadata.drop_all(
        bind=test_engine
    )


# ============================================================
# RESET DATABASE BEFORE EACH TEST
# ============================================================

@pytest.fixture(
    autouse=True
)
def reset_database():

    db = TestingSessionLocal()

    try:

        # Delete child records first
        # because of foreign keys

        from app.models import OrderItem, Order

        db.query(ChatMessage).delete(synchronize_session=False)
        db.query(RefreshSession).delete(synchronize_session=False)
        db.query(BackgroundJob).delete(synchronize_session=False)
        db.query(OrderItem).delete(
            synchronize_session=False
        )

        db.query(Order).delete(
            synchronize_session=False
        )

        db.query(Product).delete(
            synchronize_session=False
        )

        db.query(User).delete(
            synchronize_session=False
        )

        db.commit()

    finally:

        db.close()

    # Clear Redis
    redis_client.flushdb()

    yield

    # Clear Redis again
    redis_client.flushdb()


# ============================================================
# TEST CLIENT
# ============================================================

@pytest.fixture
def client():

    with TestClient(app) as test_client:
        yield test_client


# ============================================================
# DATABASE SESSION
# ============================================================

@pytest.fixture
def db():

    session = TestingSessionLocal()

    try:
        yield session

    finally:
        session.close()


# ============================================================
# TEST USER
# ============================================================

@pytest.fixture
def test_user(db):

    user = User(
        name="Test User",
        email="test@example.com",
        hashed_password=hash_password(
            "password123"
        ),
        is_active=True
    )

    db.add(user)

    db.commit()

    db.refresh(user)

    return user


# ============================================================
# AUTHENTICATION HEADERS
# ============================================================

@pytest.fixture
def auth_headers(
    client,
    test_user
):

    response = client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "password123"
        }
    )

    assert response.status_code == 200

    data = response.json()

    return {
        "Authorization": (
            f"Bearer {data['access_token']}"
        )
    }


@pytest.fixture
def admin_headers(
    client,
    test_user,
    db
):

    test_user.role = "admin"
    db.commit()

    response = client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "password123"
        }
    )

    assert response.status_code == 200

    return {
        "Authorization": (
            f"Bearer {response.json()['access_token']}"
        )
    }


# ============================================================
# TEST PRODUCT
# ============================================================

@pytest.fixture
def test_product(db):

    product = Product(
        name="Test Product",
        description="Product used for testing",
        price=100.0,
        stock=20,
        is_active=True
    )

    db.add(product)

    db.commit()

    db.refresh(product)

    return product