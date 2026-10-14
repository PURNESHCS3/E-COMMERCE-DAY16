import threading
import asyncio

from app.ai_service import (
    AIProviderUnavailable,
    LLMProvider,
    MIN_AI_PRODUCT_RELEVANCE,
    SYSTEM_PROMPT,
    catalogue_follow_up_search_context,
    _provider_error_description,
    _provider_error_status,
    _expand_product_synonyms,
    _extract_price_bounds,
    _is_catalog_overview_question,
    prepare_catalogue_index,
    retrieve_catalog_context,
    stream_completion,
)
from app.models import Product


class FakeCatalogCollection:
    def __init__(self):
        self.ids = []
        self.documents = []
        self.metadatas = []

    def get(self, *, include):
        assert include == []
        return {"ids": self.ids}

    def upsert(self, *, ids, documents, metadatas):
        self.ids = ids
        self.documents = documents
        self.metadatas = metadatas

    def delete(self, *, ids):
        self.ids = [item_id for item_id in self.ids if item_id not in ids]

    def query(self, **_kwargs):
        raise AssertionError("Explicit comparison should use catalogue name matches")


def test_catalogue_prepare_endpoint_indexes_active_products(
    client,
    auth_headers,
    db,
    monkeypatch,
):
    from app import ai_service

    db.add(Product(
        name="Apple iPhone 16",
        price=799.0,
        stock=3,
        is_active=True,
    ))
    db.add(Product(
        name="Inactive Phone",
        price=99.0,
        stock=0,
        is_active=False,
    ))
    db.commit()
    collection = FakeCatalogCollection()
    monkeypatch.setattr(ai_service, "_catalog_collection", lambda: collection)
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    response = client.post("/api/ai/catalogue/prepare", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {"products_loaded": 1}
    assert collection.ids == [f"product-{db.query(Product).filter_by(name='Apple iPhone 16').one().id}"]


def test_comparison_retrieves_each_named_product_group_and_available_iphones(
    db,
    monkeypatch,
):
    from app import ai_service

    products = [
        Product(name="Apple iPhone 16", price=799.0, stock=5, is_active=True),
        Product(name="Apple iPhone 16 Pro", price=999.0, stock=2, is_active=True),
        Product(name="Apple iPhone 15", price=699.0, stock=0, is_active=True),
        Product(name="Samsung Galaxy S26", price=899.0, stock=4, is_active=True),
        Product(name="Samsung Galaxy S25", price=799.0, stock=3, is_active=True),
    ]
    db.add_all(products)
    db.commit()
    collection = FakeCatalogCollection()
    monkeypatch.setattr(ai_service, "_catalog_collection", lambda: collection)
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    context, sources = retrieve_catalog_context(
        db,
        "Compare iPhones available and Samsung Galaxy S26",
    )

    names = [source["name"] for source in sources]
    assert names == [
        "Apple iPhone 16",
        "Apple iPhone 16 Pro",
        "Samsung Galaxy S26",
    ]
    assert "Catalogue matches for requested item 'iPhones available'" in context
    assert "Catalogue matches for requested item 'Samsung Galaxy S26'" in context
    assert "Apple iPhone 15" not in context
    assert "Samsung Galaxy S25" not in context


def test_comparison_between_iphone_and_google_pixel_retrieves_both_products(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add_all([
        Product(name="Apple iPhone 16", price=799.0, stock=5, is_active=True),
        Product(name="Google Pixel 9", price=799.0, stock=4, is_active=True),
        Product(name="Samsung Galaxy S26", price=899.0, stock=3, is_active=True),
    ])
    db.commit()
    collection = FakeCatalogCollection()
    monkeypatch.setattr(ai_service, "_catalog_collection", lambda: collection)
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    context, sources = retrieve_catalog_context(
        db,
        "compare between iphone and google pixel",
    )

    assert [source["name"] for source in sources] == [
        "Apple iPhone 16",
        "Google Pixel 9",
    ]
    assert "No matching active products were found." not in context


def test_follow_up_search_reuses_previous_product_intent():
    history = [
        {"role": "user", "content": "Show me mobiles for photography"},
        {"role": "assistant", "content": "Here are two current options."},
    ]

    assert catalogue_follow_up_search_context(
        "What about cheaper ones?",
        history,
    ) == "Show me mobiles for photography"
    assert catalogue_follow_up_search_context(
        "Find wireless headphones",
        history,
    ) is None
    assert catalogue_follow_up_search_context("What about those?", []) is None


def test_follow_up_context_is_used_for_catalogue_search(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add(Product(
        name="Affordable Camera",
        description="Digital camera",
        price=30000.0,
        stock=3,
        is_active=True,
    ))
    db.commit()
    product_id = db.query(Product).filter_by(
        name="Affordable Camera"
    ).one().id

    class FakeCollection(FakeCatalogCollection):
        query_options = None

        def query(self, **kwargs):
            self.query_options = kwargs
            return {
                "documents": [["Affordable Camera"]],
                "metadatas": [[{
                    "product_id": product_id,
                    "name": "Affordable Camera",
                    "price": 30000.0,
                    "stock": 3,
                    "image_url": "",
                    "category": "Electronics",
                }]],
                "distances": [[0.1]],
            }

    collection = FakeCollection()
    monkeypatch.setattr(ai_service, "_catalog_collection", lambda: collection)
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    context, sources = retrieve_catalog_context(
        db,
        "What about cheaper ones?",
        search_context="Show me cameras under ₹50,000",
    )

    assert "Show me cameras under ₹50,000" in collection.query_options["query_texts"][0]
    assert collection.query_options.get("where") is None
    assert "Affordable Camera" in context
    assert [source["name"] for source in sources] == ["Affordable Camera"]


def test_prepare_catalogue_index_refreshes_product_snapshot(db, monkeypatch):
    from app import ai_service

    db.add(Product(
        name="Samsung Galaxy S26",
        price=899.0,
        stock=4,
        is_active=True,
    ))
    db.commit()
    collection = FakeCatalogCollection()
    monkeypatch.setattr(ai_service, "_catalog_collection", lambda: collection)
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    assert prepare_catalogue_index(db) == 1
    assert collection.documents[0].startswith("Product: Samsung Galaxy S26")


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


def test_streaming_provider_retries_once(monkeypatch):
    from app import ai_service

    options = {}

    class Runnable:
        def __or__(self, _other):
            return self

    def fake_chat_openai(**kwargs):
        options.update(kwargs)
        return Runnable()

    monkeypatch.setattr(ai_service, "PROMPT", Runnable())
    monkeypatch.setattr(ai_service, "ChatOpenAI", fake_chat_openai)

    ai_service._build_chain(
        LLMProvider("groq", "test-key", "https://example.test", "test-model")
    )

    assert options["max_retries"] == 1
    assert options["stream_usage"] is True
    assert options["max_tokens"] == ai_service.settings.AI_MAX_COMPLETION_TOKENS


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


def test_ai_stream_reports_budget_exhaustion_without_fallback(
    client,
    auth_headers,
    monkeypatch,
):
    from app.ai_usage import AIQuotaExceeded

    providers = [
        LLMProvider("groq", "not-returned", "https://groq.example.test", "groq-model"),
        LLMProvider("gemini", "not-returned", "https://gemini.example.test", "gemini-model"),
    ]
    monkeypatch.setattr("app.routers.ai.configured_providers", lambda: providers)
    monkeypatch.setattr(
        "app.routers.ai.retrieve_catalog_context",
        lambda _db, _question: ("", []),
    )

    async def exhausted_stream(_providers, **_kwargs):
        raise AIQuotaExceeded(
            "The daily estimated AI token budget has been reached."
        )
        yield "unreachable", None

    monkeypatch.setattr("app.routers.ai.stream_completion", exhausted_stream)
    response = client.post(
        "/api/ai/chat/stream",
        headers=auth_headers,
        json={"messages": [{"role": "user", "content": "Find a phone"}]},
    )

    assert response.status_code == 200
    assert "event: error" in response.text
    assert "daily estimated AI token budget has been reached" in response.text


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


def test_ai_chat_rate_limit_is_scoped_to_authenticated_user(
    client,
    auth_headers,
    test_user,
    db,
    monkeypatch,
):
    from app.auth import create_access_token, hash_password
    from app.models import User

    monkeypatch.setattr(
        "app.routers.ai.configured_providers",
        lambda: [LLMProvider("groq", "not-returned", "https://example.test", "test-model")],
    )
    monkeypatch.setattr(
        "app.routers.ai.retrieve_catalog_context",
        lambda _db, _question: ("", []),
    )

    async def fake_stream(_providers, **_kwargs):
        yield "groq", "Answer"

    monkeypatch.setattr("app.routers.ai.stream_completion", fake_stream)
    payload = {"messages": [{"role": "user", "content": "Find a phone"}]}
    responses = [
        client.post("/api/ai/chat/stream", headers=auth_headers, json=payload)
        for _ in range(11)
    ]
    assert [response.status_code for response in responses[:10]] == [200] * 10
    assert responses[-1].status_code == 429

    other_user = User(
        name="Another User",
        email="another-rate-limit@example.com",
        hashed_password=hash_password("password123"),
        is_active=True,
    )
    db.add(other_user)
    db.commit()
    db.refresh(other_user)
    other_headers = {
        "Authorization": f"Bearer {create_access_token({'sub': str(other_user.id)})}"
    }
    other_response = client.post(
        "/api/ai/chat/stream",
        headers=other_headers,
        json=payload,
    )
    assert other_response.status_code == 200


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
    assert "Use the supplied category when present" in context
    assert requested_limit == 101
    assert sources == []
    assert _is_catalog_overview_question(
        "What product categories are present in ShopHub?"
    )
    assert _is_catalog_overview_question(
        "WHICH TYPE LO PRODUCTS ARE AVAILABLE IN SHOPHUB"
    )


def test_book_category_question_returns_only_active_book_catalogue_items(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add_all([
        Product(
            name="Muruga: The Lord of War, the God of Wisdom",
            description="A book about Muruga.",
            category="Books",
            price=499.0,
            stock=2,
            is_active=True,
        ),
        Product(
            name="Believe: What Life and Cricket Taught Me",
            description="A memoir about life and cricket.",
            category="Books",
            price=599.0,
            stock=0,
            is_active=True,
        ),
        Product(
            name="Samsung Galaxy S26",
            description="Android smartphone.",
            category="Electronics",
            price=89999.0,
            stock=30,
            is_active=True,
        ),
    ])
    db.commit()
    monkeypatch.setattr(
        ai_service,
        "_catalog_collection",
        lambda: (_ for _ in ()).throw(
            AssertionError("A category lookup must not use vector similarity.")
        ),
    )

    context, sources = retrieve_catalog_context(
        db,
        "which books are available in shophub",
    )

    assert [source["name"] for source in sources] == [
        "Muruga: The Lord of War, the God of Wisdom",
    ]
    assert all(source["category"] == "Books" for source in sources)
    assert "Active products in the Books category" in context
    assert "Samsung Galaxy S26" not in context


def test_category_browse_uses_live_catalogue_categories_not_a_fixed_alias_list(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add_all([
        Product(
            name="Board Game",
            category="Toys & Games",
            price=25,
            stock=2,
            is_active=True,
        ),
        Product(
            name="Bluetooth Speaker",
            category="Electronics",
            price=40,
            stock=3,
            is_active=True,
        ),
    ])
    db.commit()
    monkeypatch.setattr(
        ai_service,
        "_catalog_collection",
        lambda: (_ for _ in ()).throw(
            AssertionError("A category lookup must not use vector similarity.")
        ),
    )

    _context, sources = retrieve_catalog_context(
        db,
        "what toys do you have?",
    )

    assert [source["name"] for source in sources] == ["Board Game"]
    assert sources[0]["category"] == "Toys & Games"


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


def test_mobile_query_returns_matching_catalogue_products_without_vector_match(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add_all([
        Product(
            name="Apple iPhone 16",
            description="Smartphone with an advanced camera",
            features="Rear Camera: 48MP",
            price=799.0,
            stock=4,
            is_active=True,
        ),
        Product(
            name="Samsung Galaxy S26",
            description="Android smartphone with a large display",
            features="Rear Camera: 50MP",
            price=899.0,
            stock=3,
            is_active=True,
        ),
        Product(
            name="Wireless Headphones",
            description="Over-ear audio headset",
            price=99.0,
            stock=8,
            is_active=True,
        ),
    ])
    db.commit()
    collection = FakeCatalogCollection()
    monkeypatch.setattr(ai_service, "_catalog_collection", lambda: collection)
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    context, sources = retrieve_catalog_context(db, "Show me mobiles")

    assert [source["name"] for source in sources] == [
        "Apple iPhone 16",
        "Samsung Galaxy S26",
    ]
    assert "Wireless Headphones" not in context


def test_mobile_search_excludes_printers_and_keeps_phone_matches(db, monkeypatch):
    from app import ai_service

    db.add_all([
        Product(
            name="HP Smart Tank 790 All-in-One",
            description="Print from a mobile phone using the wireless app.",
            features=(
                "Printer Type: Ink-tank multifunction printer\n"
                "Mobile Printing: HP Smart app support"
            ),
            category="Electronics",
            price=29000.0,
            stock=10,
            is_active=True,
        ),
        Product(
            name="iPhone 18 Pro Max",
            description="Premium smartphone with an advanced camera.",
            price=3000.0,
            stock=18,
            is_active=True,
        ),
        Product(
            name="Apple iPhone 15",
            description="Smartphone with a high-resolution camera.",
            price=69999.0,
            stock=25,
            is_active=True,
        ),
        Product(
            name="OnePlus 12",
            description="Android smartphone with a bright display.",
            price=64999.0,
            stock=20,
            is_active=True,
        ),
        Product(
            name="Google Pixel 9",
            description="Smartphone with Google Tensor processor.",
            price=79999.0,
            stock=18,
            is_active=True,
        ),
        Product(
            name="Samsung Galaxy S26",
            description="Android smartphone with a large display.",
            features="Brand: Samsung\nModel: Galaxy S26",
            price=89999.0,
            stock=30,
            is_active=True,
        ),
        Product(
            name="Samsung Galaxy S26",
            description="Android smartphone with a large display.",
            price=89999.0,
            stock=12,
            is_active=True,
        ),
    ])
    db.commit()
    collection = FakeCatalogCollection()
    monkeypatch.setattr(ai_service, "_catalog_collection", lambda: collection)
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    context, sources = retrieve_catalog_context(db, "Show me mobiles")

    names = [source["name"] for source in sources]
    assert "HP Smart Tank 790 All-in-One" not in names
    assert "Samsung Galaxy S26" in names
    assert len(names) == 5
    assert "mobile phone using the wireless app" not in context


def test_mobile_search_applies_misspelled_processor_and_price_constraints(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add_all([
        Product(
            name="iPhone 18 Pro Max",
            features="Processor: Apple A20 Pro",
            category="Electronics",
            price=3000,
            stock=18,
            is_active=True,
        ),
        Product(
            name="OnePlus 12",
            features="Processor: Qualcomm Snapdragon 8 Gen 3",
            category="Electronics",
            price=64999,
            stock=20,
            is_active=True,
        ),
        Product(
            name="Samsung Galaxy S26",
            features="Processor: Snapdragon 8 Elite Gen 5 or Exynos 2600",
            category="Electronics",
            price=74999,
            stock=30,
            is_active=True,
        ),
        Product(
            name="HP Smart Tank 790 All-in-One",
            features="Printer Type: Ink-tank printer\nMobile Printing: Supported",
            category="Electronics",
            price=10000,
            stock=10,
            is_active=True,
        ),
    ])
    db.commit()
    monkeypatch.setattr(
        ai_service,
        "_catalog_collection",
        lambda: FakeCatalogCollection(),
    )
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    context, sources = retrieve_catalog_context(
        db,
        "suggest mobiles under 15000 with qualcum processor",
    )

    assert sources == []
    assert "No active mobile phones under 15,000" in context

    _context, sources = retrieve_catalog_context(
        db,
        "suggest mobiles under 80000 with Qualcomm processor",
    )

    assert [source["name"] for source in sources] == [
        "OnePlus 12",
        "Samsung Galaxy S26",
    ]
    assert all(source["price"] < 80000 for source in sources)


def test_catalogue_search_matches_misspelled_feature_terms_and_price_bounds(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add_all([
        Product(
            name="Nikon Mirrorless Camera",
            description="A compact camera for travel photography.",
            features="Optical Image Stabilization: Yes",
            category="Cameras",
            price=45000,
            stock=5,
            is_active=True,
        ),
        Product(
            name="Sony Premium Camera",
            description="A professional camera with optical image stabilization.",
            features="Optical Image Stabilization: Yes",
            category="Cameras",
            price=85000,
            stock=2,
            is_active=True,
        ),
        Product(
            name="Wireless Speaker",
            description="Portable Bluetooth speaker.",
            features="Wireless connectivity",
            category="Electronics",
            price=5000,
            stock=12,
            is_active=True,
        ),
    ])
    db.commit()
    monkeypatch.setattr(
        ai_service,
        "_catalog_collection",
        lambda: FakeCatalogCollection(),
    )
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    _context, sources = retrieve_catalog_context(
        db,
        "recommend a camera with optical stablization under 50000",
    )

    assert [source["name"] for source in sources] == ["Nikon Mirrorless Camera"]


def test_catalogue_search_does_not_treat_phone_brand_as_processor_filter(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add(Product(
        name="Samsung Galaxy S26",
        description="Android smartphone with a bright display.",
        category="Electronics",
        price=74999,
        stock=8,
        is_active=True,
    ))
    db.commit()
    monkeypatch.setattr(
        ai_service,
        "_catalog_collection",
        lambda: FakeCatalogCollection(),
    )
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    _context, sources = retrieve_catalog_context(
        db,
        "show Samsung Galaxy S26",
    )

    assert [source["name"] for source in sources] == ["Samsung Galaxy S26"]


def test_mobile_vector_search_does_not_cite_printer_matching_mobile_printing(
    db,
    monkeypatch,
):
    from app import ai_service

    db.add(Product(
        name="HP Smart Tank 790 All-in-One",
        description="Print from a mobile phone using the wireless app.",
        features=(
            "Printer Type: Ink-tank multifunction printer\n"
            "Mobile Printing: HP Smart app support"
        ),
        category="Electronics",
        price=29000.0,
        stock=10,
        is_active=True,
    ))
    db.commit()
    product_id = db.query(Product).filter_by(
        name="HP Smart Tank 790 All-in-One"
    ).one().id

    class FakeCollection(FakeCatalogCollection):
        def query(self, **_kwargs):
            return {
                "documents": [["Product: HP Smart Tank 790 All-in-One"]],
                "metadatas": [[{
                    "product_id": product_id,
                    "name": "HP Smart Tank 790 All-in-One",
                    "price": 29000.0,
                    "stock": 10,
                    "image_url": "",
                    "category": "Electronics",
                }]],
                "distances": [[0.1]],
            }

    collection = FakeCollection()
    monkeypatch.setattr(ai_service, "_catalog_collection", lambda: collection)
    monkeypatch.setattr(ai_service, "_indexed_signature", None)

    context, sources = retrieve_catalog_context(db, "Show me smartphones")

    assert context == ""
    assert sources == []


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
