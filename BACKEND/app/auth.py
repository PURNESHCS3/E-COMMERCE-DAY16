import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.database import settings


# ============================================================
# Password Hashing
# ============================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


def hash_password(password: str) -> str:
    """
    Hash a plain-text password.
    """
    return pwd_context.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    """
    Verify a plain-text password against a hashed password.
    """
    return pwd_context.verify(
        plain_password,
        hashed_password
    )


# ============================================================
# JWT Configuration
# ============================================================

ALGORITHM = settings.JWT_ALGORITHM
SECRET_KEY = settings.JWT_SECRET
REFRESH_SECRET_KEY = settings.effective_jwt_refresh_secret

ACCESS_TOKEN_EXPIRE_MINUTES = (
    settings.ACCESS_TOKEN_EXPIRE_MINUTES
)
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS


# ============================================================
# Create Access Token
# ============================================================

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a JWT access token.
    """

    to_encode = data.copy()

    if expires_delta:
        expire = (
            datetime.now(timezone.utc)
            + expires_delta
        )
    else:
        expire = (
            datetime.now(timezone.utc)
            + timedelta(
                minutes=ACCESS_TOKEN_EXPIRE_MINUTES
            )
        )

    to_encode.update({
        "exp": expire,
        "jti": secrets.token_urlsafe(16),
        "type": "access"
    })

    encoded_jwt = jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return encoded_jwt


# ============================================================
# Create Refresh Token
# ============================================================

def create_refresh_token(
    data: dict
) -> str:
    """
    Create a refresh token with the configured lifetime.
    """

    to_encode = data.copy()

    expire = (
        datetime.now(timezone.utc)
        + timedelta(
            days=REFRESH_TOKEN_EXPIRE_DAYS
        )
    )

    to_encode.update({
        "exp": expire,
        "jti": secrets.token_urlsafe(16),
        "type": "refresh"
    })

    encoded_jwt = jwt.encode(
        to_encode,
        REFRESH_SECRET_KEY,
        algorithm=ALGORITHM
    )

    return encoded_jwt


# ============================================================
# Decode JWT
# ============================================================

def decode_token(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT token.

    Returns the payload if valid.
    Returns None if invalid.
    """

    try:
        token_type = jwt.get_unverified_claims(token).get("type")
    except JWTError:
        return None

    if token_type == "access":
        signing_keys = (SECRET_KEY,)
    elif token_type == "refresh":
        signing_keys = (REFRESH_SECRET_KEY,)
    else:
        return None

    for signing_key in signing_keys:
        try:
            return jwt.decode(
                token,
                signing_key,
                algorithms=[ALGORITHM]
            )
        except JWTError:
            continue
    return None


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()