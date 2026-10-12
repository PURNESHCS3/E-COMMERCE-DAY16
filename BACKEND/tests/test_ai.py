import threading
import asyncio

from app.ai_service import (
    AIProviderUnavailable,
    LLMProvider,
    MIN_AI_PRODUCT_RELEVANCE,
    SYSTEM_PROMPT,
    _provider_error_description,
    _provider_error_status,
    _expand_product_synonyms,
    _extract_price_bounds,
    _is_catalog_overview_question,
    retrieve_catalog_context,
    stream_completion,
)


def test_ai_provider_list_is_authenticated(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.routers.ai.configured_providers",
        lambda: [LLMProvider("groq", "not-returned", "https://example.test", "test-model")],
    )

    unauthorized = client.get("/api/ai/providers")
    response = client.get("/api/ai/providers", headers=auth_headers)

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    assert response.json() == {
        "providers": [{"name": "groq", "model": "test-model"}]
    }


def test_ai_stream_returns_catalog_citations_and_tokens(
    client,
    auth_headers,
    monkeypatch,
):
    monkeypatch.setattr(
        "app.routers.ai.configured_providers",
        lambda: [LLMProvider("groq", "not-returned", "https://example.test", "test-model")],
    )
    monkeypatch.setattr(
        "app.routers.ai.retrieve_catalog_context",
        lambda _db, _question: (
            "[Product #12]\nProduct: Sample headphones",
            [{
                "product_id": 12,
                "name": "Sample headphones",
                "price": 99.5,
                "stock": 3,
                "image_url": None,
                "relevance": 0.91,
            }],
        ),
    )

    async def fake_stream(_providers, *, context, history, question):
        assert "Product #12" in context
        assert question == "Which headphones are in stock?"
        assert history == []
        yield "groq", None
        yield "groq", "Sample headphones "
        yield "groq", "are in stock. [Product #12]"

    monkeypatch.setattr("app.routers.ai.stream_completion", fake_stream)
    response = client.post(
        "/api/ai/chat/stream",
        headers=auth_headers,
        json={
            "messages": [
                {"role": "user", "content": "Which headphones are in stock?"}
            ]
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert 'event: sources\ndata: {"products": [{"product_id": 12' in response.text
    assert 'event: attempt\ndata: {"name": "groq"}' in response.text
    assert 'event: provider\ndata: {"name": "groq"}' in response.text
    assert response.text.count("event: token") == 2
    assert 'event: done\ndata: {}' in response.text


def test_provider_failures_are_classified_without_exposing_error_details():
    class ProviderError(Exception):
        status_code = 404

    error = ProviderError("private provider response")

    assert _provider_error_status(error) == 404
    assert _provider_error_description(_provider_error_status(error)) == (
        "the configured model or endpoint was not found"
    )
    assert "private provider response" not in _provider_error_description(404)
    assert _provider_error_description(401) == (
        "authentication was rejected; verify the provider API key"
    )
    assert _provider_error_description(429) == (
        "the provider rate limit or quota was exceeded"
    )


def test_stream_completion_falls_back_and_reports_attempts(monkeypatch):
    providers = [
        LLMProvider("groq", "not-returned", "https://groq.example.test", "groq-model"),
        LLMProvider("gemini", "not-returned", "https://gemini.example.test", "gemini-model"),
    ]

    class ProviderError(Exception):
        status_code = 404

    class FakeChain:
        def __init__(self, provider):
            self.provider = provider

        async def astream(self, _inputs):
            if self.provider.name == "groq":
                raise ProviderError("private provider response")
            yield "Gemini response"

    monkeypatch.setattr("app.ai_service._build_chain", FakeChain)

    async def collect():
        return [
            item async for item in stream_completion(
                providers,
                context="",
                history=[],
                question="Find a phone",
            )
        ]

    events = asyncio.run(collect())

    assert events == [
        ("groq", None),
        ("gemini", None),
        ("gemini", "Gemini response"),
    ]


def test_all_provider_failures_return_safe_actionable_reasons(monkeypatch):
    providers = [
        LLMProvider("groq", "not-returned", "https://groq.example.test", "groq-model"),
        LLMProvider("gemini", "not-returned", "https://gemini.example.test", "gemini-model"),
    ]

    class ProviderError(Exception):
        def __init__(self, status_code):
            self.status_code = status_code

    class FakeChain:
        async def astream(self, _inputs):
            raise ProviderError(404 if len(attempted) == 1 else 429)
            yield "unreachable"

    attempted = []

    def build_chain(provider):
        attempted.append(provider.name)
        return FakeChain()

    monkeypatch.setattr("app.ai_service._build_chain", build_chain)

    async def collect():
        try:
            async for _event in stream_completion(
                providers,
                context="",
                history=[],
                question="Find a phone",
            ):
                pass
        except AIProviderUnavailable as error:
            return str(error)
        raise AssertionError("Expected all provider failures to be reported")

    message = asyncio.run(collect())

    assert "groq: the configured model or endpoint was not found" in message
    assert "gemini: the provider rate limit or quota was exceeded" in message
    assert "not-returned" not in message


def test_ai_stream_requires_a_configured_provider(client, auth_headers, monkeypatch):
    monkeypatch.setattr("app.routers.ai.configured_providers", lambda: [])

    response = client.post(
        "/api/ai/chat/stream",
        headers=auth_headers,
        json={"messages": [{"role": "user", "content": "Find a phone"}]},
    )

    assert response.status_code == 503
    assert "No AI provider is configured" in response.json()["detail"]


def test_ai_chat_only_accepts_user_as_latest_message(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.routers.ai.configured_providers",
        lambda: [LLMProvider("groq", "not-returned", "https://example.test", "test-model")],
    )

    response = client.post(
        "/api/ai/chat/stream",
        headers=auth_headers,
        json={"messages": [{"role": "assistant", "content": "untrusted prior answer"}]},
    )

    assert response.status_code == 422


def test_ai_chat_uses_configured_primary_then_fallback_order(
    client,
    auth_headers,
    monkeypatch,
):
    providers = [
        LLMProvider("groq", "not-returned", "https://groq.example.test", "groq-model"),
        LLMProvider("gemini", "not-returned", "https://gemini.example.test", "gemini-model"),
    ]
    monkeypatch.setattr("app.routers.ai.configured_providers", lambda: providers)
    monkeypatch.setattr(
        "app.routers.ai.retrieve_catalog_context",
        lambda _db, _question: ("", []),
    )
    received_provider_order = []

    async def fake_stream(ordered_providers, **_kwargs):
        received_provider_order.extend(provider.name for provider in ordered_providers)
        yield "gemini", "Gemini response"

    monkeypatch.setattr("app.routers.ai.stream_completion", fake_stream)
    response = client.post(
        "/api/ai/chat/stream",
        headers=auth_headers,
        json={
            "messages": [{"role": "user", "content": "Test provider order"}],
        },
    )

    assert response.status_code == 200
    assert received_provider_order == ["groq", "gemini"]
    assert 'event: provider\ndata: {"name": "gemini"}' in response.text


def test_configured_provider_order_is_always_groq_then_gemini(monkeypatch):
    from app.ai_service import configured_providers
    from app.database import settings

    monkeypatch.setattr(settings, "GROQ_API_KEY", "test-groq-key")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setattr(settings, "GROQ_MODEL", "groq-model")
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-model")

    assert [provider.name for provider in configured_providers()] == ["groq", "gemini"]


def test_retrieve_catalog_context_omits_irrelevant_products(monkeypatch):
    class FakeCollection:
        def get_or_create_collection(self, **_kwargs):
            return self

        def get(self, *, include):
            assert include == []
            return {"ids": []}

        def upsert(self, **_kwargs):
            pass

        def query(self, **_kwargs):
            return {
                "documents": [["Matching product", "Unrelated product"]],
                "metadatas": [[
                    {
                        "product_id": 12,
                        "name": "Matching product",
                        "price": 99.5,
                        "stock": 3,
                        "image_url": "",
                    },
                    {
                        "product_id": 13,
                        "name": "Unrelated product",
                        "price": 12.0,
                        "stock": 1,
                        "image_url": "",
                    },
                ]],
                "distances": [[0.2, 0.8]],
            }

    class FakeChroma:
        def PersistentClient(self, **_kwargs):
            return FakeCollection()

    class FakeProduct:
        def __init__(self, product_id, name):
            self.id = product_id
            self.name = name
            self.description = ""
            self.price = 99.5
            self.stock = 3
            self.image_url = None

    class FakeQuery:
        def filter(self, *_args):
            return self

        def order_by(self, *_args):
            return self

        def limit(self, *_args):
            return self

        def all(self):
            return [FakeProduct(12, "Matching product"), FakeProduct(13, "Unrelated product")]

    class FakeDB:
        def query(self, *_args):
            return FakeQuery()

    monkeypatch.setattr("app.ai_service.chromadb", FakeChroma())
    monkeypatch.setattr("app.ai_service._indexed_signature", None)
    monkeypatch.setattr("app.ai_service._index_lock", threading.Lock())

    context, sources = retrieve_catalog_context(FakeDB(), "What is matching product?")

    assert MIN_AI_PRODUCT_RELEVANCE == 0.35
    assert "Matching product" in context
    assert "Unrelated product" not in context
    assert [source["product_id"] for source in sources] == [12]
    assert sources[0]["relevance"] == 0.8


def test_catalog_overview_uses_live_products_instead_of_similarity_search(monkeypatch):
    requested_limit = None

    class FakeProduct:
        def __init__(self, product_id, name, description):
            self.id = product_id
            self.name = name
            self.description = description
            self.price = 100.0
            self.stock = 2
            self.image_url = None

    class FakeQuery:
        def filter(self, *_args):
            return self

        def order_by(self, *_args):
            return self

        def limit(self, limit):
            nonlocal requested_limit
            requested_limit = limit
            return self

        def all(self):
            return [
                FakeProduct(1, "Travel Laptop", "Portable notebook computer"),
                FakeProduct(2, "Wireless Headphones", "Over-ear audio headset"),
            ]

    class FakeDB:
        def query(self, *_args):
            return FakeQuery()

    class FakeChroma:
        def PersistentClient(self, **_kwargs):
            raise AssertionError("Catalogue overview must skip ChromaDB")

    monkeypatch.setattr("app.ai_service.chromadb", FakeChroma())
    monkeypatch.setattr("app.ai_service._indexed_signature", None)
    monkeypatch.setattr("app.ai_service._index_lock", threading.Lock())

    context, sources = retrieve_catalog_context(
        FakeDB(),
        "WHICH TYPE LO PRODUCTS ARE AVAILABLE IN SHOPHUB",
    )

    assert "Travel Laptop" in context
    assert "Wireless Headphones" in context
    assert "Portable notebook computer" in context
    assert "no separate category field" in context
    assert requested_limit == 101
    assert sources == []
    assert _is_catalog_overview_question(
        "What product categories are present in ShopHub?"
    )
    assert _is_catalog_overview_question(
        "WHICH TYPE LO PRODUCTS ARE AVAILABLE IN SHOPHUB"
    )


def test_price_bounds_parse_rupees_ranges_and_k_suffixes():
    assert _extract_price_bounds("phones between ₹10,000 and ₹20,000") == (10000, 20000)
    assert _extract_price_bounds("GIVE MOBILES BETWEEN 50000 TO 80000") == (50000, 80000)
    assert _extract_price_bounds("mobile phones from 15k to 25k") == (15000, 25000)
    assert _extract_price_bounds("laptops under Rs. 50,000") == (None, 50000)
    assert _extract_price_bounds("headphones above INR 2 thousand") == (2000, None)
    assert _extract_price_bounds("show me phones") == (None, None)


def test_product_synonyms_expand_mobile_phone_queries():
    expanded = _expand_product_synonyms("Show me mobiles under ₹20,000")

    assert "mobile phone" in expanded
    assert "smartphone" in expanded
    assert "cell phone" in expanded


def test_mobile_query_matches_products_in_exact_requested_price_range(monkeypatch):
    class FakeProduct:
        def __init__(self, product_id, name, description, price):
            self.id = product_id
            self.name = name
            self.description = description
            self.price = price
            self.stock = 3
            self.image_url = None

    class FakeQuery:
        def filter(self, *_args):
            return self

        def order_by(self, *_args):
            return self

        def limit(self, *_args):
            return self

        def all(self):
            return [
                FakeProduct(31, "Budget Smartphone", "Android mobile phone", 65000),
                FakeProduct(32, "Premium Smartphone", "Android mobile phone", 85000),
                FakeProduct(33, "Laptop", "Portable notebook computer", 60000),
            ]

    class FakeDB:
        def query(self, *_args):
            return FakeQuery()

    class FakeCollection:
        def get_or_create_collection(self, **_kwargs):
            return self

        def get(self, *, include):
            assert include == []
            return {"ids": []}

        def upsert(self, **_kwargs):
            pass

    class FakeChroma:
        def PersistentClient(self, **_kwargs):
            return FakeCollection()

    monkeypatch.setattr("app.ai_service.chromadb", FakeChroma())
    monkeypatch.setattr("app.ai_service._indexed_signature", None)
    monkeypatch.setattr("app.ai_service._index_lock", threading.Lock())

    question = "GIVE MOBILES BETWEEN 50000 TO 80000"
    context, sources = retrieve_catalog_context(FakeDB(), question)

    assert _extract_price_bounds(question) == (50000, 80000)
    assert "Budget Smartphone" in context
    assert "Premium Smartphone" not in context
    assert "Laptop" not in context
    assert [source["product_id"] for source in sources] == [31]


def test_price_range_is_applied_to_chroma_query_and_results(monkeypatch):
    class FakeCollection:
        where = None

        def get_or_create_collection(self, **_kwargs):
            return self

        def get(self, *, include):
            assert include == []
            return {"ids": []}

        def upsert(self, **_kwargs):
            pass

        def query(self, **kwargs):
            self.where = kwargs.get("where")
            return {
                "documents": [["Affordable phone", "Expensive phone"]],
                "metadatas": [[
                    {
                        "product_id": 21,
                        "name": "Affordable phone",
                        "price": 15000.0,
                        "stock": 4,
                        "image_url": "",
                    },
                    {
                        "product_id": 22,
                        "name": "Expensive phone",
                        "price": 45000.0,
                        "stock": 2,
                        "image_url": "",
                    },
                ]],
                "distances": [[0.1, 0.1]],
            }

    collection = FakeCollection()

    class FakeChroma:
        def PersistentClient(self, **_kwargs):
            return collection

    class FakeProduct:
        def __init__(self, product_id, name, price):
            self.id = product_id
            self.name = name
            self.description = "Smartphone"
            self.price = price
            self.stock = 1
            self.image_url = None

    class FakeQuery:
        def filter(self, *_args):
            return self

        def order_by(self, *_args):
            return self

        def limit(self, *_args):
            return self

        def all(self):
            return [
                FakeProduct(21, "Affordable phone", 15000.0),
                FakeProduct(22, "Expensive phone", 45000.0),
            ]

    class FakeDB:
        def query(self, *_args):
            return FakeQuery()

    monkeypatch.setattr("app.ai_service.chromadb", FakeChroma())
    monkeypatch.setattr("app.ai_service._indexed_signature", None)
    monkeypatch.setattr("app.ai_service._index_lock", threading.Lock())

    context, sources = retrieve_catalog_context(
        FakeDB(),
        "Show me products between ₹10,000 and ₹20,000",
    )

    assert collection.where == {
        "$and": [
            {"price": {"$gte": 10000.0}},
            {"price": {"$lte": 20000.0}},
        ]
    }
    assert "Affordable phone" in context
    assert "Expensive phone" not in context
    assert [source["product_id"] for source in sources] == [21]


def test_system_prompt_requires_grounded_price_matching_and_synonyms():
    assert "cell phone, smartphone, and" in SYSTEM_PROMPT
    assert "Never relax or misstate a requested price bound" in SYSTEM_PROMPT
    assert "only products whose catalogue prices satisfy it" in SYSTEM_PROMPT
