def test_register_user(client):

    response = client.post(
        "/api/auth/register",
        json={
            "name": "New User",
            "email": "newuser@example.com",
            "password": "password123"
        }
    )

    assert response.status_code in [200, 201]

    data = response.json()

    assert "email" in data
    assert data["role"] == "user"


def test_login_success(client, test_user):

    response = client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "password123"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert "access_token" in data
    assert "refresh_token" in data


def test_login_existing_account_with_different_email_case(client, test_user):
    response = client.post(
        "/api/auth/login",
        json={
            "email": "TEST@EXAMPLE.COM",
            "password": "password123"
        }
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_register_rejects_email_duplicate_with_different_case(client, test_user):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Duplicate User",
            "email": "TEST@EXAMPLE.COM",
            "password": "password123"
        }
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_refresh_rotates_access_and_refresh_tokens(client, test_user):
    login_response = client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "password123"
        }
    )
    assert login_response.status_code == 200
    original_tokens = login_response.json()

    refresh_response = client.post(
        "/api/auth/refresh",
        json={"refresh_token": original_tokens["refresh_token"]}
    )

    assert refresh_response.status_code == 200
    refreshed_tokens = refresh_response.json()
    assert refreshed_tokens["access_token"] != original_tokens["access_token"]
    assert refreshed_tokens["refresh_token"] != original_tokens["refresh_token"]
    assert client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {refreshed_tokens['access_token']}"}
    ).status_code == 200
    assert client.post(
        "/api/auth/refresh",
        json={"refresh_token": original_tokens["access_token"]}
    ).status_code == 401
    assert client.post(
        "/api/auth/refresh",
        json={"refresh_token": original_tokens["refresh_token"]}
    ).status_code == 401
    assert client.post(
        "/api/auth/logout",
        json={"refresh_token": refreshed_tokens["refresh_token"]}
    ).status_code == 204
    assert client.post(
        "/api/auth/refresh",
        json={"refresh_token": refreshed_tokens["refresh_token"]}
    ).status_code == 401


def test_login_wrong_password(client, test_user):

    response = client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "wrongpassword"
        }
    )

    assert response.status_code in [400, 401]


def test_login_invalid_email(client):

    response = client.post(
        "/api/auth/login",
        json={
            "email": "doesnotexist@example.com",
            "password": "password123"
        }
    )

    assert response.status_code in [400, 401, 404, 422]


def test_protected_product_creation_without_token(
    client
):

    response = client.post(
        "/api/products/",
        json={
            "name": "Unauthorized Product",
            "description": "Test",
            "price": 100,
            "stock": 5
        }
    )

    assert response.status_code == 401