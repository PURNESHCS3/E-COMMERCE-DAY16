from sqlalchemy.exc import SQLAlchemyError
from redis.exceptions import RedisError


def test_health_check_requires_database_and_redis(client, monkeypatch):
    from app import main

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, _statement):
            return 1

    class FakeEngine:
        def connect(self):
            return FakeConnection()

    class FakeRedis:
        def ping(self):
            return True

    monkeypatch.setattr(main, "engine", FakeEngine())
    monkeypatch.setattr(main, "redis_client", FakeRedis())

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_check_returns_service_unavailable_when_database_fails(
    client,
    monkeypatch,
):
    from app import main

    class UnavailableEngine:
        def connect(self):
            raise SQLAlchemyError("database unavailable")

    monkeypatch.setattr(main, "engine", UnavailableEngine())

    response = client.get("/healthz")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "A required application dependency is unavailable."
    )


def test_health_check_returns_service_unavailable_when_redis_fails(
    client,
    monkeypatch,
):
    from app import main

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, _statement):
            return 1

    class FakeEngine:
        def connect(self):
            return FakeConnection()

    class UnavailableRedis:
        def ping(self):
            raise RedisError("redis unavailable")

    monkeypatch.setattr(main, "engine", FakeEngine())
    monkeypatch.setattr(main, "redis_client", UnavailableRedis())

    response = client.get("/healthz")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "A required application dependency is unavailable."
    )
