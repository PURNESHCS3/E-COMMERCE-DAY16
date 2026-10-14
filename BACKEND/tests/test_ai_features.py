import json
from types import SimpleNamespace

from app.ai_service import LLMProvider
from app.ai_features import (
    generate_product_description,
    run_catalog_agent,
)


class FakeRedis:
    def __init__(self):
        self.values = {}

    def get(self, key):
        return self.values.get(key)

    def setex(self, key, _ttl, value):
        self.values[key] = value

    def delete(self, key):
        self.values.pop(key, None)

    def eval(self, _script, key_count, *args):
        keys = args[:key_count]
        limit = int(args[key_count])
        total = int(self.values.get(keys[0], 0))
        if total >= limit:
            return 0
        total += 1
        self.values[keys[0]] = total
        self.values[keys[1]] = int(self.values.get(keys[1], 0)) + 1
        return total


def test_generated_description_is_moderated_and_cached(monkeypatch):
    from app import ai_features

    cache = FakeRedis()
    calls = []
    provider = LLMProvider("groq", "test-key", "https://example.test", "test-model")

    class FakeModel:
        def invoke(self, messages):
            calls.append(messages)
            if "Review the supplied product name" in messages[0].content:
                return SimpleNamespace(
                    content='{"approved": true, "reason": "Appropriate product description."}'
                )
            return SimpleNamespace(
                content="A comfortable wireless headset for clear everyday listening."
            )

    monkeypatch.setattr(ai_features, "redis_client", cache)
    monkeypatch.setattr(ai_features, "_chat_model", lambda _provider: FakeModel())

    first = generate_product_description(
        product_name="Wireless Headphones",
        price=49.99,
        features="Bluetooth audio\nWireless design",
        providers=[provider],
    )
    second = generate_product_description(
        product_name="Wireless Headphones",
        price=49.99,
        features="Bluetooth audio\nWireless design",
        providers=[provider],
    )

    assert first == (
        "A comfortable wireless headset for clear everyday listening.",
        "groq",
        False,
    )
    assert second == (first[0], "groq", True)
    assert len(calls) == 2
    prompt_input = json.loads(calls[0][1].content)
    assert prompt_input == {
        "product_name": "Wireless Headphones",
        "price": 49.99,
        "features": "Bluetooth audio\nWireless design",
    }
    assert cache.values


def test_overlong_generated_description_is_shortened_before_moderation(monkeypatch):
    from app import ai_features

    cache = FakeRedis()
    provider = LLMProvider("groq", "test-key", "https://example.test", "test-model")
    calls = []

    class FakeModel:
        def invoke(self, messages):
            calls.append(messages)
            if "Review the supplied product name" in messages[0].content:
                return SimpleNamespace(
                    content='{"approved": true, "reason": "Appropriate product description."}'
                )
            if "Rewrite the supplied product description" in messages[0].content:
                return SimpleNamespace(content="A concise factual description.")
            return SimpleNamespace(content="A" * 1200)

    monkeypatch.setattr(ai_features, "redis_client", cache)
    monkeypatch.setattr(ai_features, "_chat_model", lambda _provider: FakeModel())

    description, provider_name, cached = generate_product_description(
        product_name="Wireless Headphones",
        price=49.99,
        features="Bluetooth audio",
        providers=[provider],
    )

    assert description == "A concise factual description."
    assert len(description) < ai_features.MAX_PRODUCT_DESCRIPTION_LENGTH
    assert provider_name == "groq"
    assert cached is False
    assert len(calls) == 3
    assert "target_character_limit" in calls[1][1].content


def test_overlong_description_after_shortening_is_not_returned(monkeypatch):
    from app import ai_features

    provider = LLMProvider("groq", "test-key", "https://example.test", "test-model")

    class FakeModel:
        def invoke(self, messages):
            return SimpleNamespace(
                content='{"approved": true, "reason": "Appropriate product description."}'
                if "Review the supplied product name" in messages[0].content
                else "A" * 1200
            )

    monkeypatch.setattr(ai_features, "redis_client", FakeRedis())
    monkeypatch.setattr(ai_features, "_chat_model", lambda _provider: FakeModel())

    try:
        generate_product_description(
            product_name="Wireless Headphones",
            price=49.99,
            features="Bluetooth audio",
            providers=[provider],
        )
    except ai_features.AIProviderUnavailable as error:
        assert "999-character limit" in str(error)
    else:
        raise AssertionError("An overlong description was returned")


def test_feature_provider_retries_once(monkeypatch):
    from app import ai_features

    options = {}

    def fake_chat_openai(**kwargs):
        options.update(kwargs)
        return object()

    monkeypatch.setattr(ai_features, "ChatOpenAI", fake_chat_openai)
    ai_features._chat_model(
        LLMProvider("groq", "test-key", "https://example.test", "test-model")
    )

    assert options["max_retries"] == 1
    assert options["max_tokens"] == ai_features.settings.AI_MAX_COMPLETION_TOKENS


def test_quota_exhaustion_stops_provider_fallback(monkeypatch):
    from app import ai_features

    providers = [
        LLMProvider("groq", "test-key", "https://example.test", "groq-model"),
        LLMProvider("gemini", "test-key", "https://example.test", "gemini-model"),
    ]
    invoked = []

    def reject_budget(*_args, **_kwargs):
        raise ai_features.AIQuotaExceeded(
            "The daily estimated AI token budget has been reached."
        )

    monkeypatch.setattr(ai_features, "reserve_provider_call", reject_budget)
    monkeypatch.setattr(
        ai_features,
        "_chat_model",
        lambda _provider: invoked.append(True),
    )

    try:
        ai_features._invoke_with_fallback(
            providers,
            [SimpleNamespace(content="prompt")],
            feature="chat_stream",
        )
    except ai_features.AIQuotaExceeded as error:
        assert "estimated AI token budget" in str(error)
    else:
        raise AssertionError("Quota exhaustion should stop fallback immediately")
    assert invoked == []


def test_catalog_agent_calls_search_tool_and_caches_response(monkeypatch):
    from app import ai_features

    cache = FakeRedis()
    provider = LLMProvider("groq", "test-key", "https://example.test", "test-model")
    tool_call = {
        "id": "call-search",
        "name": "search_catalog",
        "args": {"query": "wireless headphones"},
    }
    calls = []

    class FakeQuery:
        def filter(self, *_args):
            return self

        def order_by(self, *_args):
            return self

        def limit(self, *_args):
            return self

        def all(self):
            return [
                SimpleNamespace(
                    id=7,
                    name="Wireless Headphones",
                    description="Bluetooth audio",
                    price=49.99,
                    stock=4,
                )
            ]

    class FakeDB:
        def query(self, *_args):
            return FakeQuery()

    class FakeModel:
        def bind_tools(self, tools):
            assert {tool["function"]["name"] for tool in tools} == {
                "search_catalog",
                "get_product_details",
            }
            return self

        def invoke(self, messages):
            calls.append(messages)
            if len(calls) == 1:
                return SimpleNamespace(content="", tool_calls=[tool_call], type="ai")
            assert any(message.type == "tool" for message in messages)
            return SimpleNamespace(
                content="Wireless Headphones are available for ₹49.99. [Product #7]",
                tool_calls=[],
                type="ai",
            )

    monkeypatch.setattr(ai_features, "redis_client", cache)
    monkeypatch.setattr(ai_features, "_chat_model", lambda _provider: FakeModel())
    monkeypatch.setattr(
        ai_features,
        "retrieve_catalog_context",
        lambda _db, query: (
            f"Wireless Headphones matching {query}",
            [{
                "product_id": 7,
                "name": "Wireless Headphones",
                "price": 49.99,
                "stock": 4,
                "image_url": None,
                "relevance": 0.92,
            }],
        ),
    )

    arguments = {
        "messages": [{"role": "user", "content": "Find wireless headphones"}],
        "db": FakeDB(),
        "user_id": 9,
        "providers": [provider],
    }
    first = run_catalog_agent(**arguments)
    second = run_catalog_agent(**arguments)

    assert first["provider"] == "groq"
    assert first["tool_calls"] == ["search_catalog"]
    assert first["sources"][0]["product_id"] == 7
    assert first["cached"] is False
    assert second["cached"] is True
    assert second["answer"] == first["answer"]
    assert len(calls) == 2


def test_ai_description_endpoint_reports_provider_failure(client, auth_headers, monkeypatch):
    from app.ai_features import AIProviderUnavailable

    def unavailable(**_kwargs):
        raise AIProviderUnavailable("AI providers are unavailable.")

    monkeypatch.setattr("app.routers.ai.generate_product_description", unavailable)
    response = client.post(
        "/api/ai/product-description",
        headers=auth_headers,
        json={
            "product_name": "Headphones",
            "price": 49.99,
            "features": "Bluetooth connectivity",
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "AI providers are unavailable."


def test_ai_description_usage_control_failure_is_service_unavailable(
    client,
    auth_headers,
    monkeypatch,
):
    from app.ai_usage import AIQuotaExceeded, AIUsageUnavailable

    def unavailable(**_kwargs):
        raise AIUsageUnavailable("AI usage controls are unavailable.")

    monkeypatch.setattr("app.routers.ai.generate_product_description", unavailable)
    response = client.post(
        "/api/ai/product-description",
        headers=auth_headers,
        json={
            "product_name": "Headphones",
            "price": 49.99,
            "features": "Bluetooth connectivity",
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "AI usage controls are unavailable."

    def exhausted(**_kwargs):
        raise AIQuotaExceeded("The daily AI request budget has been reached.")

    monkeypatch.setattr("app.routers.ai.generate_product_description", exhausted)
    response = client.post(
        "/api/ai/product-description",
        headers=auth_headers,
        json={
            "product_name": "Headphones",
            "price": 49.99,
            "features": "Bluetooth connectivity",
        },
    )
    assert response.status_code == 429


def test_ai_description_is_generated_synchronously(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.routers.ai.generate_product_description",
        lambda **_kwargs: ("A factual description.", "groq", False),
    )
    response = client.post(
        "/api/ai/product-description",
        headers=auth_headers,
        json={
            "product_name": "Headphones",
            "price": 49.99,
            "features": "Bluetooth connectivity",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "description": "A factual description.",
        "provider": "groq",
        "cached": False,
    }
    assert client.post(
        "/api/ai/product-description/jobs",
        headers=auth_headers,
        json={
            "product_name": "Headphones",
            "price": 49.99,
            "features": "Bluetooth connectivity",
        },
    ).status_code == 404


def test_ai_product_category_endpoint_is_removed(client, auth_headers):
    response = client.post(
        "/api/ai/product-category",
        headers=auth_headers,
        json={
            "product_name": "Headphones",
            "description": "Audio headset",
            "features": "Bluetooth connectivity",
        },
    )

    assert response.status_code == 404


def test_ai_description_endpoint_rejects_numeric_only_features(client, auth_headers):
    response = client.post(
        "/api/ai/product-description",
        headers=auth_headers,
        json={"product_name": "Headphones", "price": 49.99, "features": "123 456"},
    )

    assert response.status_code == 422


def test_ai_moderation_endpoint_returns_review(client, auth_headers, monkeypatch):
    from app.ai_features import ModerationResult

    monkeypatch.setattr(
        "app.routers.ai.moderate_product_content",
        lambda **_kwargs: (
            ModerationResult(approved=False, reason="Contains unsafe language."),
            "gemini",
            True,
        ),
    )
    response = client.post(
        "/api/ai/moderate",
        headers=auth_headers,
        json={"product_name": "Headphones", "content": "Unsafe description"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "approved": False,
        "reason": "Contains unsafe language.",
        "provider": "gemini",
        "cached": True,
    }
