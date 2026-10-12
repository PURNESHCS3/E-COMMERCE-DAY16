import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models import (
    Product,
    Order,
    OrderItem
)
from app.schemas import OrderCreate, OrderResponse, OrderStatusUpdate
from app.dependencies import get_admin_user, get_current_user
from app.redis_client import redis_client
from app.websocket_manager import manager


router = APIRouter(
    prefix="/api/orders",
    tags=["Orders"]
)

NEXT_ORDER_STATUS = {
    "confirmed": "dispatched",
    "dispatched": "out_for_delivery",
    "out_for_delivery": "delivered",
}


@router.post("/")
async def create_order(
    order_data: OrderCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):

    key = f"cart:{current_user.id}"

    cart = redis_client.get(key)

    if not cart:
        raise HTTPException(
            status_code=400,
            detail="Cart is empty"
        )

    cart_data = json.loads(cart)

    total_amount = 0

    product_ids = [int(product_id) for product_id in cart_data]
    products = {
        product.id: product
        for product in db.query(Product)
        .filter(
            Product.id.in_(product_ids),
            Product.is_active.is_(True),
        )
        .all()
    }
    order_items = []

    for product_id, quantity in cart_data.items():
        product = products.get(int(product_id))

        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Product {product_id} not found"
            )

        if quantity > product.stock:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.name}"
            )

        total_amount += (
            product.price * quantity
        )

        order_items.append(
            {
                "product": product,
                "quantity": quantity
            }
        )

    order = Order(
        user_id=current_user.id,
        total_amount=total_amount,
        delivery_address=order_data.delivery_address.strip(),
        status="confirmed"
    )

    db.add(order)
    db.flush()

    for item in order_items:

        product = item["product"]
        quantity = item["quantity"]

        product.stock -= quantity

        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=quantity,
            price=product.price
        )

        db.add(order_item)

    db.commit()
    db.refresh(order)

    redis_client.delete(key)
    redis_client.delete("products:all")

    order_event = {
        "type": "order.updated",
        "order_id": order.id,
        "user_id": current_user.id,
        "status": "confirmed"
    }
    await manager.send_to_user(current_user.id, order_event)
    await manager.send_to_admins(order_event)

    return {
        "message": "Order placed successfully",
        "order_id": order.id,
        "total_amount": total_amount,
        "delivery_address": order.delivery_address,
        "status": order.status
    }


@router.get("/")
def get_orders(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):

    if current_user.role == "admin":
        return (
            db.query(Order)
            .options(selectinload(Order.items).joinedload(OrderItem.product))
            .all()
        )

    return (
        db.query(Order)
        .options(selectinload(Order.items).joinedload(OrderItem.product))
        .filter(Order.user_id == current_user.id)
        .all()
    )


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):

    query = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product)
        )
        .filter(Order.id == order_id)
    )

    if current_user.role != "admin":
        query = query.filter(Order.user_id == current_user.id)

    order = query.first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    return order


@router.post("/{order_id}/status")
async def update_order_status(
    order_id: int,
    status_data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_admin_user)
):
    order = (
        db.query(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product)
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    expected_status = NEXT_ORDER_STATUS.get(order.status)
    if status_data.status != expected_status:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot change order status from '{order.status}' to '{status_data.status}'"
        )

    order.status = status_data.status
    db.commit()
    db.refresh(order)

    order_event = {
        "type": "order.updated",
        "order_id": order.id,
        "user_id": order.user_id,
        "status": order.status
    }
    await manager.send_to_user(order.user_id, order_event)
    await manager.send_to_admins(order_event)

    return {
        "message": "Order status updated successfully",
        "order_id": order.id,
        "status": order.status
    }


@router.post("/{order_id}/cancel")
async def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_admin_user)
):

    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Order not found"
        )

    if order.status == "cancelled":
        raise HTTPException(
            status_code=409,
            detail="Order is already cancelled"
        )

    if order.status != "confirmed":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel an order with status '{order.status}'"
        )

    for item in order.items:
        if item.product:
            item.product.stock += item.quantity

    order.status = "cancelled"
    db.commit()
    db.refresh(order)

    redis_client.delete("products:all")

    order_event = {
        "type": "order.updated",
        "order_id": order.id,
        "user_id": order.user_id,
        "status": order.status
    }
    await manager.send_to_user(order.user_id, order_event)
    await manager.send_to_admins(order_event)

    return {
        "message": "Order cancelled successfully",
        "order_id": order.id,
        "status": order.status
    }