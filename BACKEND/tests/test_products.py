from pathlib import Path

import pytest

from app.routers.products import UPLOAD_DIR


def test_create_product(
    client,
    admin_headers
):

    response = client.post(
        "/api/products/",
        headers=admin_headers,
        json={
            "name": "Laptop",
            "description": "Test laptop",
            "features": "Lightweight design\nFast processor",
            "category": "Electronics",
            "price": 50000,
            "stock": 10
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["name"] == "Laptop"
    assert data["stock"] == 10
    assert data["features"] == "Lightweight design\nFast processor"
    assert data["category"] == "Electronics"


def test_admin_can_create_product_with_public_https_image_url(
    client,
    admin_headers,
):
    image_url = "https://cdn.example.org/products/laptop.jpg?width=800"

    response = client.post(
        "/api/products/",
        headers=admin_headers,
        json={
            "name": "URL image product",
            "price": 100,
            "stock": 2,
            "image_url": image_url,
        },
    )

    assert response.status_code == 200
    assert response.json()["image_url"] == image_url


def test_product_image_url_rejects_insecure_or_local_urls(client, admin_headers):
    for image_url in (
        "http://cdn.example.org/image.jpg",
        "https://localhost/image.jpg",
        "https://127.0.0.1/image.jpg",
        "https://2130706433/image.jpg",
        "https://0x7f000001/image.jpg",
        "https://0x7f.0.0.1/image.jpg",
        "https://user:password@cdn.example.org/image.jpg",
        "https://cdn.example.org:8443/image.jpg",
    ):
        response = client.post(
            "/api/products/",
            headers=admin_headers,
            json={
                "name": "Invalid URL product",
                "price": 100,
                "stock": 2,
                "image_url": image_url,
            },
        )

        assert response.status_code == 422, image_url


def test_product_update_persists_public_https_image_url(
    client,
    test_product,
    admin_headers,
):
    image_url = "https://images.example.org/headphones.webp"

    response = client.put(
        f"/api/products/{test_product.id}",
        headers=admin_headers,
        json={
            "name": test_product.name,
            "description": test_product.description,
            "price": test_product.price,
            "stock": test_product.stock,
            "image_url": image_url,
        },
    )

    assert response.status_code == 200
    assert response.json()["image_url"] == image_url


def test_product_update_preserves_image_url_when_not_provided(
    client,
    test_product,
    admin_headers,
    db,
):
    from app.models import Product

    image_url = "https://cdn.example.org/existing-image.jpg"
    product = db.get(Product, test_product.id)
    product.image_url = image_url
    db.commit()

    response = client.put(
        f"/api/products/{test_product.id}",
        headers=admin_headers,
        json={
            "name": test_product.name,
            "description": test_product.description,
            "price": test_product.price,
            "stock": test_product.stock,
        },
    )

    assert response.status_code == 200
    assert response.json()["image_url"] == image_url


def test_get_products(
    client,
    test_product
):

    response = client.get(
        "/api/products/"
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data) >= 1


def test_semantic_search_returns_retrieved_catalog_products(
    client,
    test_product,
    monkeypatch,
):
    retrieved = []

    def fake_retrieve(_db, query, *, category, max_results):
        retrieved.append((query, category, max_results))
        return "", [{"product_id": test_product.id}]

    monkeypatch.setattr(
        "app.routers.products.retrieve_catalog_context",
        fake_retrieve,
    )

    response = client.get(
        "/api/products/semantic-search",
        params={
            "q": "something comfortable for travel",
            "category": "Footwear",
            "limit": 12,
        },
    )

    assert response.status_code == 200
    assert [product["id"] for product in response.json()] == [test_product.id]
    assert retrieved == [
        ("something comfortable for travel", "Footwear", 12)
    ]


def test_product_categories_and_catalog_filter(client, admin_headers):
    for name, category in (
        ("Wireless headset", "Electronics"),
        ("Running shoes", "Footwear"),
    ):
        response = client.post(
            "/api/products/",
            headers=admin_headers,
            json={
                "name": name,
                "price": 100,
                "stock": 2,
                "category": category,
            },
        )
        assert response.status_code == 200

    categories = client.get("/api/products/categories")
    assert categories.status_code == 200
    assert categories.json() == [
        "Electronics",
        "Footwear",
        "Clothing",
        "Home & Kitchen",
        "Beauty & Personal Care",
        "Books",
        "Sports & Outdoors",
        "Toys & Games",
        "Accessories",
        "Grocery",
        "Other",
    ]

    electronics = client.get("/api/products/", params={"category": "Electronics"})
    assert electronics.status_code == 200
    assert [product["name"] for product in electronics.json()] == ["Wireless headset"]

    searched = client.get(
        "/api/products/search",
        params={"q": "shoes", "category": "Electronics"},
    )
    assert searched.status_code == 200
    assert searched.json() == []


def test_product_category_must_be_supported(client, admin_headers):
    response = client.post(
        "/api/products/",
        headers=admin_headers,
        json={
            "name": "Unknown category item",
            "price": 100,
            "stock": 2,
            "category": "Unknown category",
        },
    )

    assert response.status_code == 422


def test_product_search_matches_partial_letters_as_they_are_typed(client, db):
    from app.models import Product

    product = Product(
        name="Wireless Headphones",
        description="Noise cancelling audio",
        price=79.99,
        stock=10,
        is_active=True,
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    for query in ("w", "wi", "wire", "wireless", "wireless hea", "wirless"):
        response = client.get(
            "/api/products/search",
            params={"q": query},
        )

        assert response.status_code == 200, query
        assert any(item["id"] == product.id for item in response.json()), query
        if query in {"w", "wi", "wire"}:
            assert len(response.json()) == 1, query


def test_product_search_requires_each_entered_word_to_match(client, db):
    from app.models import Product

    product = Product(
        name="Wireless Headphones",
        description="Noise cancelling audio",
        price=79.99,
        stock=10,
        is_active=True,
    )
    db.add(product)
    db.commit()

    response = client.get(
        "/api/products/search",
        params={"q": "wireless unrelated"},
    )

    assert response.status_code == 200
    assert all(item["name"] != product.name for item in response.json())


def test_postgres_fuzzy_search_uses_configured_threshold_and_excludes_noise(
    client,
    db,
    monkeypatch,
):
    if db.get_bind().dialect.name != "postgresql":
        pytest.skip("PostgreSQL pg_trgm fuzzy search")

    from app import database
    from app.models import Product

    laptop = Product(
        name="Laptop",
        description="Portable computer",
        price=500,
        stock=5,
        is_active=True,
    )
    smart_tv = Product(
        name="Smart TV",
        description="Connected television",
        price=900,
        stock=4,
        is_active=True,
    )
    smart_tv_accessory = Product(
        name="Television Stand",
        description="Designed for smart televisions",
        price=50,
        stock=8,
        is_active=True,
    )
    unrelated = Product(
        name="Desktop",
        description="Office computer",
        price=800,
        stock=3,
        is_active=True,
    )
    db.add_all([laptop, smart_tv, smart_tv_accessory, unrelated])
    db.commit()
    db.refresh(laptop)

    monkeypatch.setattr(database.settings, "PRODUCT_SEARCH_SIMILARITY_THRESHOLD", 0.5)
    response = client.get(
        "/api/products/search",
        params={"q": "leptop"},
    )
    assert response.status_code == 200
    assert all(result["id"] != laptop.id for result in response.json())

    monkeypatch.setattr(database.settings, "PRODUCT_SEARCH_SIMILARITY_THRESHOLD", 0.35)
    response = client.get(
        "/api/products/search",
        params={"q": "leptop"},
    )
    assert response.status_code == 200
    results = response.json()
    assert results
    assert results[0]["id"] == laptop.id
    assert all(result["id"] == laptop.id for result in results)

    monkeypatch.setattr(database.settings, "PRODUCT_SEARCH_SIMILARITY_THRESHOLD", 0.25)
    response = client.get(
        "/api/products/search",
        params={"q": "smort"},
    )
    assert response.status_code == 200
    results = response.json()
    assert results
    assert results[0]["id"] == smart_tv.id
    assert any(result["id"] == smart_tv_accessory.id for result in results)
    assert results.index(next(
        result for result in results if result["id"] == smart_tv.id
    )) < results.index(next(
        result for result in results if result["id"] == smart_tv_accessory.id
    ))

def test_get_product(
    client,
    test_product
):

    response = client.get(
        f"/api/products/{test_product.id}"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == test_product.id


def test_get_nonexistent_product(client):

    response = client.get(
        "/api/products/99999"
    )

    assert response.status_code == 404


def test_update_product(
    client,
    test_product,
    admin_headers
):

    response = client.put(
        f"/api/products/{test_product.id}",
        headers=admin_headers,
        json={
            "name": "Updated Product",
            "description": "Updated description",
            "price": 150,
            "stock": 30
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert data["name"] == "Updated Product"
    assert data["price"] == 150


def test_delete_product(
    client,
    test_product,
    admin_headers
):

    response = client.delete(
        f"/api/products/{test_product.id}",
        headers=admin_headers
    )

    assert response.status_code == 200

    data = response.json()

    assert "message" in data


def test_products_require_auth_for_modification(
    client,
    test_product
):

    response = client.put(
        f"/api/products/{test_product.id}",
        json={
            "name": "Unauthorized Update",
            "description": "Test",
            "price": 100,
            "stock": 10
        }
    )

    assert response.status_code == 401


def test_regular_users_cannot_modify_products(
    client,
    test_product,
    auth_headers
):

    payload = {
        "name": "Unauthorized Update",
        "description": "Test",
        "price": 100,
        "stock": 10
    }

    assert client.post(
        "/api/products/",
        headers=auth_headers,
        json=payload
    ).status_code == 403

    assert client.put(
        f"/api/products/{test_product.id}",
        headers=auth_headers,
        json=payload
    ).status_code == 403

    assert client.delete(
        f"/api/products/{test_product.id}",
        headers=auth_headers
    ).status_code == 403

    assert client.post(
        f"/api/products/{test_product.id}/image",
        headers=auth_headers,
        files={"file": ("image.png", b"test", "image/png")}
    ).status_code == 403


def test_frontend_origin_can_call_api(client):

    for origin in (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ):
        response = client.options(
            "/api/products/",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET"
            }
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_product_images_are_served(client):

    filename = "route-test-image.png"
    image_path = Path(UPLOAD_DIR) / filename
    image_path.write_bytes(b"test image content")

    try:
        response = client.get(f"/static/products/{filename}")
    finally:
        image_path.unlink(missing_ok=True)

    assert response.status_code == 200
    assert response.content == b"test image content"


def test_admin_can_upload_product_image(
    client,
    test_product,
    admin_headers
):

    response = client.post(
        f"/api/products/{test_product.id}/image",
        headers=admin_headers,
        files={"file": ("product.png", b"image content", "image/png")}
    )

    assert response.status_code == 200
    image_url = response.json()["image_url"]
    assert image_url.startswith("/static/products/")

    image_response = client.get(image_url)

    assert image_response.status_code == 200
    assert image_response.content == b"image content"

    image_path = Path(UPLOAD_DIR) / image_url.rsplit("/", 1)[-1]
    image_path.unlink(missing_ok=True)