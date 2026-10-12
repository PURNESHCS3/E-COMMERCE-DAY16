import pytest

from app.models import Product


def test_api_responses_include_security_headers(client):
    response = client.get("/api/products/?limit=12")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["cache-control"] == "no-store"


def test_api_compresses_large_responses(client, db):
    db.add_all([
        Product(
            name=f"Compression product {index}",
            description="A repeated product description for gzip coverage. " * 12,
            price=12.5,
            stock=4,
            is_active=True,
        )
        for index in range(8)
    ])
    db.commit()

    response = client.get("/api/products/?limit=12")

    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"


def test_login_is_rate_limited(client):
    responses = [
        client.post(
            "/api/auth/login",
            json={"email": "missing@example.com", "password": "not-a-password"},
        )
        for _ in range(6)
    ]

    assert [response.status_code for response in responses[:5]] == [401] * 5
    assert responses[5].status_code == 429


@pytest.mark.parametrize(
    ("method", "path", "payload", "limit", "allowed_statuses"),
    [
        (
            "POST",
            "/api/auth/register",
            {"name": "Rate Limit User", "email": "rate-limit@example.com", "password": "password123"},
            5,
            {201, 400},
        ),
        (
            "POST",
            "/api/auth/refresh",
            {"refresh_token": "invalid-token"},
            10,
            {401},
        ),
        (
            "POST",
            "/api/auth/logout",
            {"refresh_token": "invalid-token"},
            10,
            {204},
        ),
        (
            "GET",
            "/api/products/search?q=phone&limit=20",
            None,
            30,
            {200},
        ),
    ],
)
def test_other_rate_limited_routes_enforce_limits(
    client,
    method,
    path,
    payload,
    limit,
    allowed_statuses,
):
    responses = [
        client.request(method, path, json=payload)
        for _ in range(limit + 1)
    ]

    assert all(response.status_code in allowed_statuses for response in responses[:limit])
    assert responses[-1].status_code == 429
