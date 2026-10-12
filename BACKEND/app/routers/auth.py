from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response as FastAPIResponse,
    status
)
from sqlalchemy import func

from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_refresh_token,
    hash_password,
    verify_password
)

from app.database import get_db
from app.dependencies import get_current_user
from app.models import RefreshSession, User

from app.schemas import (
    RefreshTokenRequest,
    Token,
    UserCreate,
    UserLogin,
    UserResponse
)
from app.security import limiter


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"]
)


# ============================================================
# REGISTER
# ============================================================

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED
)
@limiter.limit("5/minute")
def register(
    request: Request,
    response: FastAPIResponse,
    user_data: UserCreate,
    db: Session = Depends(get_db),
):
    normalized_email = user_data.email.strip().lower()

    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user = User(
        name=user_data.name,
        email=normalized_email,
        hashed_password=hash_password(
            user_data.password
        ),
        is_active=True
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


# ============================================================
# LOGIN
# ============================================================

@router.post(
    "/login",
    response_model=Token
)
@limiter.limit("5/minute")
def login(
    request: Request,
    response: FastAPIResponse,
    credentials: UserLogin,
    db: Session = Depends(get_db),
):
    normalized_email = credentials.email.strip().lower()

    user = (
        db.query(User)
        .filter(
            func.lower(User.email) == normalized_email
        )
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    if not verify_password(
        credentials.password,
        user.hashed_password
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={
                "WWW-Authenticate": "Bearer"
            }
        )

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    access_token = create_access_token(
        {
            "sub": str(user.id)
        }
    )

    refresh_token = create_refresh_token(
        {
            "sub": str(user.id)
        }
    )
    refresh_payload = decode_token(refresh_token)
    if refresh_payload is None:
        raise RuntimeError("New refresh token could not be decoded")
    db.add(RefreshSession(
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token),
        expires_at=datetime.fromtimestamp(
            refresh_payload["exp"],
            timezone.utc,
        ),
    ))
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


# ============================================================
# REFRESH TOKEN
# ============================================================

@router.post(
    "/refresh",
    response_model=Token
)
@limiter.limit("10/minute")
def refresh_token(
    request: Request,
    response: FastAPIResponse,
    token_data: RefreshTokenRequest,
    db: Session = Depends(get_db),
):

    payload = decode_token(
        token_data.refresh_token
    )

    if payload is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    if payload.get("type") != "refresh":

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token required"
        )

    user_id = payload.get("sub")

    if user_id is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    try:

        user_id = int(user_id)

    except (TypeError, ValueError):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID"
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    now = datetime.now(timezone.utc)
    session_updated = (
        db.query(RefreshSession)
        .filter(
            RefreshSession.user_id == user.id,
            RefreshSession.token_hash == hash_refresh_token(token_data.refresh_token),
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > now,
        )
        .update(
            {RefreshSession.revoked_at: now},
            synchronize_session=False,
        )
    )
    if session_updated != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has already been used or revoked",
        )

    new_access_token = create_access_token(
        {
            "sub": str(user.id)
        }
    )
    new_refresh_token = create_refresh_token(
        {
            "sub": str(user.id)
        }
    )
    new_refresh_payload = decode_token(new_refresh_token)
    if new_refresh_payload is None:
        db.rollback()
        raise RuntimeError("New refresh token could not be decoded")
    db.add(RefreshSession(
        user_id=user.id,
        token_hash=hash_refresh_token(new_refresh_token),
        expires_at=datetime.fromtimestamp(
            new_refresh_payload["exp"],
            timezone.utc,
        ),
    ))
    db.commit()

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def logout(
    request: Request,
    response: FastAPIResponse,
    token_data: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    payload = decode_token(token_data.refresh_token)
    if payload and payload.get("type") == "refresh":
        try:
            user_id = int(payload["sub"])
        except (KeyError, TypeError, ValueError):
            return FastAPIResponse(status_code=status.HTTP_204_NO_CONTENT)

        db.query(RefreshSession).filter(
            RefreshSession.user_id == user_id,
            RefreshSession.token_hash == hash_refresh_token(token_data.refresh_token),
            RefreshSession.revoked_at.is_(None),
        ).update(
            {RefreshSession.revoked_at: datetime.now(timezone.utc)},
            synchronize_session=False,
        )
        db.commit()
    return FastAPIResponse(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================
# CURRENT USER
# ============================================================

@router.get(
    "/me",
    response_model=UserResponse
)
def get_me(
    current_user: User = Depends(
        get_current_user
    )
):

    return current_user