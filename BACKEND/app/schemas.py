from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic import field_validator

from app.image_urls import normalize_product_image_url
from app.product_categories import PRODUCT_CATEGORIES, normalize_product_category


# ============================================================
# USER SCHEMAS
# ============================================================

class UserCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=2,
        max_length=100
    )

    email: EmailStr

    password: str = Field(
        ...,
        min_length=6,
        max_length=100
    )


class UserLogin(BaseModel):
    email: EmailStr

    password: str = Field(
        ...,
        min_length=6,
        max_length=100
    )


class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    is_active: bool
    role: str

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# JWT TOKEN SCHEMAS
# ============================================================

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# Keep TokenResponse as an alias-compatible schema
# for any other router/code that uses this name.

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


# ============================================================
# PRODUCT SCHEMAS
# ============================================================

class ProductCreate(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=200
    )

    description: Optional[str] = Field(
        default=None,
        max_length=1000
    )

    features: Optional[str] = Field(
        default=None,
        max_length=2000
    )

    category: Optional[str] = Field(
        default=None,
        max_length=80
    )

    price: float = Field(
        ...,
        gt=0
    )

    stock: int = Field(
        ...,
        ge=0
    )

    image_url: Optional[str] = None

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value: str | None) -> str | None:
        return normalize_product_image_url(value)

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        category = normalize_product_category(value)
        if category is None:
            allowed = ", ".join(PRODUCT_CATEGORIES)
            raise ValueError(f"Choose a category from: {allowed}.")
        return category


class ProductResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    features: Optional[str] = None
    category: Optional[str] = None
    price: float
    stock: int
    image_url: Optional[str]
    is_active: bool

    model_config = ConfigDict(
        from_attributes=True
    )


# ============================================================
# CART SCHEMAS
# ============================================================

class CartItem(BaseModel):
    product_id: int
    quantity: int = Field(
        ...,
        gt=0
    )


class CartResponse(BaseModel):
    items: list[CartItem]


# ============================================================
# ORDER SCHEMAS
# ============================================================

class OrderItemCreate(BaseModel):
    product_id: int

    quantity: int = Field(
        ...,
        gt=0
    )


class OrderCreate(BaseModel):
    delivery_address: str = Field(
        ...,
        min_length=10,
        max_length=500
    )


class OrderStatusUpdate(BaseModel):
    status: Literal["dispatched", "out_for_delivery", "delivered"]


class OrderProductResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OrderItemResponse(BaseModel):
    id: int
    product_id: int
    quantity: int
    price: float
    product: Optional[OrderProductResponse] = None

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id: int
    user_id: int
    total_amount: float
    delivery_address: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    items: list[OrderItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(
        from_attributes=True
    )


class ChatMessageResponse(BaseModel):
    id: int
    user_id: int
    sender_id: int
    sender_name: str
    sender_role: str
    body: str
    created_at: datetime


class ChatConversationResponse(BaseModel):
    user_id: int
    user_name: str
    last_message: str
    created_at: datetime