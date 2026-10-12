from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.models import ChatMessage, User
from app.schemas import ChatConversationResponse, ChatMessageResponse


router = APIRouter(
    prefix="/api/chat",
    tags=["Chat"]
)


def serialize_message(message: ChatMessage, sender: User) -> dict:
    return {
        "id": message.id,
        "user_id": message.user_id,
        "sender_id": message.sender_id,
        "sender_name": sender.name,
        "sender_role": sender.role,
        "body": message.body,
        "created_at": message.created_at,
    }


@router.get("/messages", response_model=list[ChatMessageResponse])
def get_messages(
    user_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        if user_id is None:
            raise HTTPException(
                status_code=400,
                detail="Select a customer conversation"
            )
        conversation_user_id = user_id
    else:
        if user_id is not None and user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Conversation access denied")
        conversation_user_id = current_user.id

    rows = (
        db.query(ChatMessage, User)
        .join(User, User.id == ChatMessage.sender_id)
        .filter(ChatMessage.user_id == conversation_user_id)
        .order_by(ChatMessage.id.desc())
        .limit(200)
        .all()
    )
    return [
        serialize_message(message, sender)
        for message, sender in reversed(rows)
    ]


@router.get(
    "/conversations",
    response_model=list[ChatConversationResponse],
)
def get_conversations(
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    latest_per_user = (
        db.query(
            ChatMessage.user_id.label("user_id"),
            func.max(ChatMessage.id).label("message_id"),
        )
        .group_by(ChatMessage.user_id)
        .subquery()
    )
    rows = (
        db.query(ChatMessage, User)
        .join(latest_per_user, ChatMessage.id == latest_per_user.c.message_id)
        .join(User, User.id == ChatMessage.user_id)
        .order_by(ChatMessage.id.desc())
        .all()
    )
    return [
        {
            "user_id": message.user_id,
            "user_name": customer.name,
            "last_message": message.body,
            "created_at": message.created_at,
        }
        for message, customer in rows
    ]
