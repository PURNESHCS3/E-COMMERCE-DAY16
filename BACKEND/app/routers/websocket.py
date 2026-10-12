import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.auth import decode_token
from app.database import get_db, settings
from app.models import ChatMessage, User
from app.websocket_manager import manager


router = APIRouter(
    prefix="/api",
    tags=["WebSocket"]
)


def _authenticated_user(
    token: str,
    db: Session,
) -> tuple[int, str, str, float] | None:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None

    try:
        user_id = int(payload["sub"])
        expires_at = float(payload["exp"])
    except (KeyError, TypeError, ValueError):
        return None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        return None
    return user.id, user.role, user.name, expires_at


def _save_chat_message(
    db: Session,
    sender_id: int,
    target_user_id: int,
    body: str,
) -> dict:
    message = ChatMessage(
        user_id=target_user_id,
        sender_id=sender_id,
        body=body,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    sender = db.query(User).filter(User.id == sender_id).first()
    if sender is None:
        raise RuntimeError("Chat sender disappeared before message serialization")
    serialized = {
        "id": message.id,
        "user_id": message.user_id,
        "sender_id": sender.id,
        "sender_name": sender.name,
        "sender_role": sender.role,
        "body": message.body,
        "created_at": message.created_at.isoformat(),
    }
    db.commit()
    return serialized


async def _handle_chat_message(
    websocket: WebSocket,
    data: dict,
    sender_id: int,
    sender_role: str,
    db: Session,
) -> None:
    body = data.get("body")
    if not isinstance(body, str) or not body.strip() or len(body.strip()) > 2000:
        await websocket.send_json({
            "type": "error",
            "message": "Messages must contain 1 to 2000 characters.",
        })
        return

    if sender_role == "admin":
        target_user_id = data.get("user_id")
        if not isinstance(target_user_id, int) or isinstance(target_user_id, bool) or target_user_id <= 0:
            await websocket.send_json({
                "type": "error",
                "message": "Choose a customer before sending a message.",
            })
            return
        customer = db.query(User).filter(
            User.id == target_user_id,
            User.role != "admin",
            User.is_active.is_(True),
        ).first()
        if customer is None:
            db.rollback()
            await websocket.send_json({
                "type": "error",
                "message": "Customer conversation not found.",
            })
            return
        db.commit()
    else:
        target_user_id = sender_id

    message = _save_chat_message(db, sender_id, target_user_id, body.strip())
    event = {"type": "chat.message", "message": message}
    await manager.send_to_user(target_user_id, event)
    await manager.send_to_admins(event)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    origin = websocket.headers.get("origin")
    if origin and origin.rstrip("/") not in settings.cors_origin_list:
        await websocket.close(code=4403, reason="Origin is not allowed")
        return

    await websocket.accept()
    try:
        auth_message = await asyncio.wait_for(
            websocket.receive_json(),
            timeout=10,
        )
    except (asyncio.TimeoutError, ValueError):
        await websocket.close(code=4401, reason="Authentication required")
        return
    except WebSocketDisconnect:
        return

    if not isinstance(auth_message, dict) or auth_message.get("type") != "auth":
        await websocket.close(code=4401, reason="Authentication required")
        return

    token = auth_message.get("token")
    if not isinstance(token, str):
        await websocket.close(code=4401, reason="Invalid access token")
        return

    principal = _authenticated_user(token, db)
    db.commit()
    if principal is None:
        await websocket.close(code=4401, reason="Invalid or expired access token")
        return

    user_id, role, _name, expires_at = principal
    manager.connect(websocket, user_id, role)
    await websocket.send_json({"type": "auth.ok"})

    try:
        while True:
            remaining_lifetime = expires_at - datetime.now(timezone.utc).timestamp()
            if remaining_lifetime <= 0:
                await websocket.close(code=4401, reason="Access token expired")
                break

            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=remaining_lifetime,
                )
            except asyncio.TimeoutError:
                await websocket.close(code=4401, reason="Access token expired")
                break
            except ValueError:
                await websocket.close(code=1003, reason="Invalid JSON message")
                break

            if not isinstance(data, dict):
                await websocket.send_json({
                    "type": "error",
                    "message": "Expected a JSON event object.",
                })
                continue

            if data.get("type") == "chat.send":
                await _handle_chat_message(websocket, data, user_id, role, db)
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": "Unsupported WebSocket event.",
                })
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
