from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app.models import User


def _access_token(client, email: str, password: str = "password123") -> str:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_customer_websocket_persists_messages_and_limits_history(
    client,
    auth_headers,
    test_user,
    db: Session,
):
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    other_customer = User(
        name="Other Customer",
        email="other@example.com",
        hashed_password="unused",
        is_active=True,
    )
    db.add(other_customer)
    db.commit()

    with client.websocket_connect(
        "/api/ws",
        headers={"origin": "http://localhost:5173"},
    ) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        assert websocket.receive_json() == {"type": "auth.ok"}

        websocket.send_json({
            "type": "chat.send",
            "body": "I need help with my order.",
            "user_id": other_customer.id,
        })
        event = websocket.receive_json()

    assert event["type"] == "chat.message"
    assert event["message"]["user_id"] == test_user.id
    assert event["message"]["sender_id"] == test_user.id
    assert event["message"]["body"] == "I need help with my order."

    history = client.get("/api/chat/messages", headers=auth_headers)
    assert history.status_code == 200
    assert [message["body"] for message in history.json()] == [
        "I need help with my order."
    ]
    forbidden = client.get(
        f"/api/chat/messages?user_id={other_customer.id}",
        headers=auth_headers,
    )
    assert forbidden.status_code == 403


def test_admin_can_reply_and_list_persistent_conversations(
    client,
    admin_headers,
    test_user,
    db: Session,
):
    customer = User(
        name="Chat Customer",
        email="chat-customer@example.com",
        hashed_password="unused",
        is_active=True,
    )
    db.add(customer)
    db.commit()
    token = admin_headers["Authorization"].removeprefix("Bearer ")

    with client.websocket_connect("/api/ws") as websocket:
        websocket.send_json({"type": "auth", "token": token})
        assert websocket.receive_json() == {"type": "auth.ok"}
        websocket.send_json({
            "type": "chat.send",
            "user_id": customer.id,
            "body": "How can we help?",
        })
        event = websocket.receive_json()

    assert event["type"] == "chat.message"
    assert event["message"]["user_id"] == customer.id
    assert event["message"]["sender_id"] == test_user.id

    conversations = client.get(
        "/api/chat/conversations",
        headers=admin_headers,
    )
    assert conversations.status_code == 200
    assert conversations.json()[0]["user_id"] == customer.id
    assert conversations.json()[0]["last_message"] == "How can we help?"

    history = client.get(
        f"/api/chat/messages?user_id={customer.id}",
        headers=admin_headers,
    )
    assert history.status_code == 200
    assert history.json()[0]["sender_role"] == "admin"


def test_websocket_rejects_invalid_access_token(client):
    with client.websocket_connect("/api/ws") as websocket:
        websocket.send_json({"type": "auth", "token": "not-a-jwt"})
        try:
            websocket.receive_json()
        except WebSocketDisconnect as error:
            assert error.code == 4401
        else:
            raise AssertionError("WebSocket accepted an invalid access token.")
