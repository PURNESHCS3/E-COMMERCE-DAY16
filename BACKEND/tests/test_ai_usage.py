import pytest

from app import ai_usage


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.hashes = {}

    def eval(self, script, key_count, *args):
        keys = args[:key_count]
        arguments = args[key_count:]
        if "local requests" in script:
            request_limit, token_limit, requested_tokens = map(int, arguments[:3])
            total = int(self.values.get(keys[0], 0))
            if total >= request_limit:
                return -1
            token_total = int(self.values.get(keys[2], 0))
            if token_total + requested_tokens > token_limit:
                return -2
            self.values[keys[0]] = total + 1
            self.values[keys[1]] = int(self.values.get(keys[1], 0)) + 1
            self.values[keys[2]] = token_total + requested_tokens
            details = self.hashes.setdefault(keys[3], {})
            details[arguments[4]] = details.get(arguments[4], 0) + 1
            details[arguments[5]] = details.get(arguments[5], 0) + requested_tokens
            return requested_tokens
        if "local reserved_tokens" in script:
            details = self.hashes.setdefault(keys[0], {})
            details[arguments[0]] = details.get(arguments[0], 0) + 1
            actual_tokens = int(arguments[2])
            if actual_tokens >= 0 and actual_tokens != int(arguments[1]):
                delta = actual_tokens - int(arguments[1])
                self.values[keys[1]] = int(self.values.get(keys[1], 0)) + delta
                details[arguments[4]] = details.get(arguments[4], 0) + delta
            return 1
        details = self.hashes.setdefault(keys[0], {})
        details[arguments[0]] = details.get(arguments[0], 0) + 1
        return 1

    def get(self, key):
        return self.values.get(key)

    def hgetall(self, key):
        return self.hashes.get(key, {})


def test_daily_provider_budget_counts_providers_and_stops_at_limit(monkeypatch):
    cache = FakeRedis()
    monkeypatch.setattr(ai_usage, "redis_client", cache)
    monkeypatch.setattr(ai_usage.settings, "AI_DAILY_PROVIDER_CALL_LIMIT", 2)
    monkeypatch.setattr(ai_usage.settings, "AI_DAILY_ESTIMATED_TOKEN_LIMIT", 10000)
    monkeypatch.setattr(ai_usage.settings, "AI_MAX_COMPLETION_TOKENS", 128)

    groq_reservation = ai_usage.reserve_provider_call(
        "groq", "groq-model", "description", "short prompt"
    )
    gemini_reservation = ai_usage.reserve_provider_call(
        "gemini", "gemini-model", "chat_stream", "short prompt"
    )
    ai_usage.record_provider_outcome(
        "groq",
        "groq-model",
        "description",
        "successes",
        reserved_tokens=groq_reservation,
        actual_tokens=20,
    )
    ai_usage.record_provider_outcome(
        "gemini",
        "gemini-model",
        "chat_stream",
        "failures",
        reserved_tokens=gemini_reservation,
    )
    with pytest.raises(ai_usage.AIQuotaExceeded, match="budget has been reached"):
        ai_usage.reserve_provider_call("groq", "groq-model", "description", "short")

    report = ai_usage.get_ai_usage()
    assert report["daily_limit"] == 2
    assert report["total_requests"] == 2
    assert report["remaining_requests"] == 0
    assert report["provider_requests"] == {"groq": 1, "gemini": 1}
    assert report["estimated_token_limit"] == 10000
    assert report["estimated_tokens_used"] == 20 + gemini_reservation
    assert {
        (row["provider"], row["model"], row["feature"]): row
        for row in report["details"]
    } == {
        ("groq", "groq-model", "description"): {
            "provider": "groq",
            "model": "groq-model",
            "feature": "description",
            "attempts": 1,
            "successes": 1,
            "failures": 0,
            "cache_hits": 0,
            "estimated_tokens": 20,
        },
        ("gemini", "gemini-model", "chat_stream"): {
            "provider": "gemini",
            "model": "gemini-model",
            "feature": "chat_stream",
            "attempts": 1,
            "successes": 0,
            "failures": 1,
            "cache_hits": 0,
            "estimated_tokens": gemini_reservation,
        },
    }


def test_estimated_token_budget_stops_provider_call(monkeypatch):
    cache = FakeRedis()
    monkeypatch.setattr(ai_usage, "redis_client", cache)
    monkeypatch.setattr(ai_usage.settings, "AI_DAILY_PROVIDER_CALL_LIMIT", 100)
    monkeypatch.setattr(ai_usage.settings, "AI_DAILY_ESTIMATED_TOKEN_LIMIT", 130)
    monkeypatch.setattr(ai_usage.settings, "AI_MAX_COMPLETION_TOKENS", 128)

    assert ai_usage.reserve_provider_call(
        "groq", "test-model", "chat_stream", ""
    ) == 129
    with pytest.raises(ai_usage.AIQuotaExceeded, match="estimated AI token budget"):
        ai_usage.reserve_provider_call(
            "groq", "test-model", "chat_stream", "prompt"
        )
    assert ai_usage.get_ai_usage()["total_requests"] == 1


def test_usage_store_failure_blocks_provider_attempt(monkeypatch):
    from redis.exceptions import RedisError

    class UnavailableRedis:
        def eval(self, *_args):
            raise RedisError("redis unavailable")

    monkeypatch.setattr(ai_usage, "redis_client", UnavailableRedis())

    with pytest.raises(ai_usage.AIUsageUnavailable, match="controls are unavailable"):
        ai_usage.reserve_provider_call(
            "groq", "test-model", "description", "private prompt content"
        )


def test_invalid_reservation_result_is_not_reported_as_quota(monkeypatch):
    class InvalidRedis:
        def eval(self, *_args):
            return 0

    monkeypatch.setattr(ai_usage, "redis_client", InvalidRedis())

    with pytest.raises(ai_usage.AIUsageUnavailable, match="controls rejected"):
        ai_usage.reserve_provider_call(
            "groq", "test-model", "description", "private prompt content"
        )


def test_cache_hit_is_reported_without_reserving_provider_budget(monkeypatch):
    cache = FakeRedis()
    monkeypatch.setattr(ai_usage, "redis_client", cache)

    ai_usage.record_cache_hit("groq", "test-model", "description")
    report = ai_usage.get_ai_usage()

    assert report["total_requests"] == 0
    assert report["details"] == [{
        "provider": "groq",
        "model": "test-model",
        "feature": "description",
        "attempts": 0,
        "successes": 0,
        "failures": 0,
        "cache_hits": 1,
        "estimated_tokens": 0,
    }]


def test_usage_keys_expire_at_next_utc_midnight():
    from datetime import datetime, timezone

    total, provider_prefix, expiry, usage_date = ai_usage._usage_keys(
        datetime(2026, 10, 13, 23, 30, tzinfo=timezone.utc)
    )

    assert total == "ai:usage:20261013:total"
    assert provider_prefix == "ai:usage:20261013:provider:"
    assert expiry == int(datetime(2026, 10, 14, tzinfo=timezone.utc).timestamp())
    assert usage_date == "2026-10-13"


def test_ai_usage_report_is_admin_only(
    client,
    auth_headers,
    admin_headers,
    test_user,
    db,
    monkeypatch,
):
    monkeypatch.setattr(
        "app.routers.ai.get_ai_usage",
        lambda: {
            "date": "2026-10-13",
            "daily_limit": 100,
            "total_requests": 4,
            "remaining_requests": 96,
            "provider_requests": {"groq": 3, "gemini": 1},
            "estimated_token_limit": 300000,
            "estimated_tokens_used": 200,
            "estimated_tokens_remaining": 299800,
            "details": [{
                "provider": "groq",
                "model": "qwen-test",
                "feature": "description",
                "attempts": 3,
                "successes": 3,
                "failures": 0,
                "cache_hits": 1,
                "estimated_tokens": 200,
            }],
        },
    )

    test_user.role = "customer"
    db.commit()
    assert client.get("/api/ai/usage", headers=auth_headers).status_code == 403
    test_user.role = "admin"
    db.commit()
    response = client.get("/api/ai/usage", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["total_requests"] == 4