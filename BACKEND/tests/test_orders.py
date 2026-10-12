def test_create_order(
    client,
    test_product,
    auth_headers
):

    client.post(
        "/api/cart/add",
        headers=auth_headers,
        json={
            "product_id": test_product.id,
            "quantity": 2
        }
    )

    response = client.post(
        "/api/orders/",
        headers=auth_headers,
        json={"delivery_address": "12 Market Road, Mumbai, Maharashtra"}
    )

    assert response.status_code == 200

    data = response.json()

    assert data["message"] == "Order placed successfully"
    assert data["status"] == "confirmed"
    assert data["order_id"] > 0
    assert data["delivery_address"] == "12 Market Road, Mumbai, Maharashtra"


def test_order_empty_cart(
    client,
    auth_headers
):

    response = client.post(
        "/api/orders/",
        headers=auth_headers,
        json={"delivery_address": "12 Market Road, Mumbai, Maharashtra"}
    )

    assert response.status_code == 400

    assert response.json()["detail"] == "Cart is empty"


def test_get_orders(
    client,
    auth_headers
):

    response = client.get(
        "/api/orders/",
        headers=auth_headers
    )

    assert response.status_code == 200


def test_get_nonexistent_order(
    client,
    auth_headers
):

    response = client.get(
        "/api/orders/99999",
        headers=auth_headers
    )

    assert response.status_code == 404


def test_order_details_include_ordered_product_details(
    client,
    auth_headers,
    test_user,
    test_product,
    db
):
    from app.models import Order, OrderItem

    order = Order(
        user_id=test_user.id,
        total_amount=test_product.price * 2,
        status="confirmed"
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(
        order_id=order.id,
        product_id=test_product.id,
        quantity=2,
        price=test_product.price
    ))
    db.commit()

    response = client.get(
        f"/api/orders/{order.id}",
        headers=auth_headers
    )

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["product_id"] == test_product.id
    assert item["quantity"] == 2
    assert item["price"] == test_product.price
    assert item["product"] == {
        "id": test_product.id,
        "name": test_product.name,
        "description": test_product.description,
        "image_url": test_product.image_url
    }


def test_users_only_see_their_own_orders(
    client,
    auth_headers,
    test_user,
    db
):

    from app.models import Order, User
    from app.auth import hash_password

    other_user = User(
        name="Other User",
        email="other@example.com",
        hashed_password=hash_password("password123"),
        is_active=True
    )
    db.add(other_user)
    db.flush()

    other_order = Order(
        user_id=other_user.id,
        total_amount=50,
        status="confirmed"
    )
    db.add(other_order)
    db.commit()

    response = client.get("/api/orders/", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []
    assert client.get(
        f"/api/orders/{other_order.id}",
        headers=auth_headers
    ).status_code == 404


def test_admin_can_view_all_orders(
    client,
    admin_headers,
    test_user,
    db
):

    from app.models import Order, User

    other_user = User(
        name="Other User",
        email="other@example.com",
        hashed_password="unused",
        is_active=True
    )
    db.add(other_user)
    db.flush()

    orders = [
        Order(user_id=test_user.id, total_amount=50, status="confirmed"),
        Order(user_id=other_user.id, total_amount=75, status="confirmed")
    ]
    db.add_all(orders)
    db.commit()

    response = client.get("/api/orders/", headers=admin_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2
    assert client.get(
        f"/api/orders/{orders[1].id}",
        headers=admin_headers
    ).status_code == 200


def test_admin_can_cancel_order_and_restore_stock(
    client,
    admin_headers,
    test_user,
    test_product,
    db
):

    from app.models import Order, OrderItem

    original_stock = test_product.stock
    order = Order(
        user_id=test_user.id,
        total_amount=test_product.price * 2,
        status="confirmed"
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(
        order_id=order.id,
        product_id=test_product.id,
        quantity=2,
        price=test_product.price
    ))
    test_product.stock -= 2
    db.commit()

    response = client.post(
        f"/api/orders/{order.id}/cancel",
        headers=admin_headers
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    db.refresh(order)
    db.refresh(test_product)
    assert order.status == "cancelled"
    assert test_product.stock == original_stock

    repeated = client.post(
        f"/api/orders/{order.id}/cancel",
        headers=admin_headers
    )
    assert repeated.status_code == 409
    db.refresh(test_product)
    assert test_product.stock == original_stock


def test_regular_user_cannot_cancel_order(
    client,
    auth_headers,
    test_user,
    db
):

    from app.models import Order

    order = Order(
        user_id=test_user.id,
        total_amount=50,
        status="confirmed"
    )
    db.add(order)
    db.commit()

    response = client.post(
        f"/api/orders/{order.id}/cancel",
        headers=auth_headers
    )

    assert response.status_code == 403
    db.refresh(order)
    assert order.status == "confirmed"


def test_admin_can_progress_order_status_sequentially(
    client,
    admin_headers,
    test_user,
    db
):
    from app.models import Order

    order = Order(
        user_id=test_user.id,
        total_amount=50,
        status="confirmed"
    )
    db.add(order)
    db.commit()

    skipped = client.post(
        f"/api/orders/{order.id}/status",
        headers=admin_headers,
        json={"status": "out_for_delivery"}
    )
    assert skipped.status_code == 409

    for status in ("dispatched", "out_for_delivery", "delivered"):
        response = client.post(
            f"/api/orders/{order.id}/status",
            headers=admin_headers,
            json={"status": status}
        )
        assert response.status_code == 200
        assert response.json()["status"] == status

    db.refresh(order)
    assert order.status == "delivered"


def test_order_status_update_notifies_customer_over_websocket(
    client,
    admin_headers,
    test_user,
    db
):
    from app.auth import hash_password
    from app.models import Order, User

    customer = User(
        name="Order Customer",
        email="order-customer@example.com",
        hashed_password=hash_password("password123"),
        is_active=True
    )
    db.add(customer)
    db.flush()
    order = Order(
        user_id=customer.id,
        total_amount=50,
        status="confirmed"
    )
    db.add(order)
    db.commit()

    login = client.post(
        "/api/auth/login",
        json={
            "email": customer.email,
            "password": "password123"
        }
    )
    assert login.status_code == 200
    customer_token = login.json()["access_token"]

    with client.websocket_connect("/api/ws") as websocket:
        websocket.send_json({"type": "auth", "token": customer_token})
        assert websocket.receive_json() == {"type": "auth.ok"}

        response = client.post(
            f"/api/orders/{order.id}/status",
            headers=admin_headers,
            json={"status": "dispatched"}
        )
        assert response.status_code == 200

        event = websocket.receive_json()

    assert event == {
        "type": "order.updated",
        "order_id": order.id,
        "user_id": customer.id,
        "status": "dispatched"
    }


def test_order_status_update_notifies_customer_and_admin(
    client,
    admin_headers,
    test_user,
    db
):
    from app.auth import hash_password
    from app.models import Order, User

    customer = User(
        name="Order Customer",
        email="order-customer@example.com",
        hashed_password=hash_password("password123"),
        is_active=True
    )
    db.add(customer)
    db.flush()
    order = Order(
        user_id=customer.id,
        total_amount=50,
        status="confirmed"
    )
    db.add(order)
    db.commit()

    customer_login = client.post(
        "/api/auth/login",
        json={
            "email": customer.email,
            "password": "password123"
        }
    )
    assert customer_login.status_code == 200
    customer_token = customer_login.json()["access_token"]
    admin_token = admin_headers["Authorization"].removeprefix("Bearer ")
    expected_event = {
        "type": "order.updated",
        "order_id": order.id,
        "user_id": customer.id,
        "status": "dispatched"
    }

    with client.websocket_connect("/api/ws") as customer_socket:
        customer_socket.send_json({"type": "auth", "token": customer_token})
        assert customer_socket.receive_json() == {"type": "auth.ok"}
        with client.websocket_connect("/api/ws") as admin_socket:
            admin_socket.send_json({"type": "auth", "token": admin_token})
            assert admin_socket.receive_json() == {"type": "auth.ok"}

            response = client.post(
                f"/api/orders/{order.id}/status",
                headers=admin_headers,
                json={"status": "dispatched"}
            )
            assert response.status_code == 200
            assert customer_socket.receive_json() == expected_event
            assert admin_socket.receive_json() == expected_event


def test_regular_user_cannot_update_order_status(
    client,
    auth_headers,
    test_user,
    db
):
    from app.models import Order

    order = Order(
        user_id=test_user.id,
        total_amount=50,
        status="confirmed"
    )
    db.add(order)
    db.commit()

    response = client.post(
        f"/api/orders/{order.id}/status",
        headers=auth_headers,
        json={"status": "dispatched"}
    )

    assert response.status_code == 403
    db.refresh(order)
    assert order.status == "confirmed"


def test_order_reduces_stock(
    client,
    test_product,
    auth_headers,
    db
):

    from app.redis_client import redis_client

    original_stock = test_product.stock
    redis_client.set("products:all", "stale product list")

    client.post(
        "/api/cart/add",
        headers=auth_headers,
        json={
            "product_id": test_product.id,
            "quantity": 2
        }
    )

    response = client.post(
        "/api/orders/",
        headers=auth_headers,
        json={"delivery_address": "12 Market Road, Mumbai, Maharashtra"}
    )

    assert response.status_code == 200

    db.refresh(test_product)

    assert test_product.stock == original_stock - 2
    assert redis_client.get("products:all") is None