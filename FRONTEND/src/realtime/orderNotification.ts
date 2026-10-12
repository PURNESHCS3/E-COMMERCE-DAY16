import type { ServerRealtimeEvent, User } from "../types";

type OrderUpdatedEvent = Extract<ServerRealtimeEvent, { type: "order.updated" }>;

export function getOrderNotification(
  user: User,
  event: OrderUpdatedEvent,
): { title: string; message: string } {
  const status = event.status.replaceAll("_", " ");

  if (user.role === "admin" && event.status === "confirmed") {
    return {
      title: "New order",
      message: `Order #${event.order_id} has been placed by customer #${event.user_id}.`,
    };
  }

  if (event.status === "confirmed") {
    return {
      title: "Order confirmed",
      message: `Your order #${event.order_id} has been confirmed.`,
    };
  }

  const title = status.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    title: `Order ${title}`,
    message: user.role === "admin"
      ? `Order #${event.order_id} for customer #${event.user_id} is ${status}.`
      : `Your order #${event.order_id} is ${status}.`,
  };
}
