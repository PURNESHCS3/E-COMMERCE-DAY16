import { describe, expect, it } from "vitest";
import type { User } from "../types";
import { getOrderNotification } from "./orderNotification";

const customer: User = {
  id: 7,
  name: "Test Customer",
  email: "customer@example.com",
  is_active: true,
  role: "customer",
};

const admin: User = { ...customer, id: 1, role: "admin" };

describe("getOrderNotification", () => {
  it("tells customers when their order is confirmed", () => {
    expect(getOrderNotification(customer, {
      type: "order.updated",
      order_id: 25,
      user_id: customer.id,
      status: "confirmed",
    })).toEqual({
      title: "Order confirmed",
      message: "Your order #25 has been confirmed.",
    });
  });

  it("tells admins when a new order is placed", () => {
    expect(getOrderNotification(admin, {
      type: "order.updated",
      order_id: 25,
      user_id: customer.id,
      status: "confirmed",
    })).toEqual({
      title: "New order",
      message: "Order #25 has been placed by customer #7.",
    });
  });

  it("uses customer-friendly messages for delivery updates", () => {
    expect(getOrderNotification(customer, {
      type: "order.updated",
      order_id: 25,
      user_id: customer.id,
      status: "out_for_delivery",
    })).toEqual({
      title: "Order Out For Delivery",
      message: "Your order #25 is out for delivery.",
    });
  });

  it("tells admins when an order moves to delivery", () => {
    expect(getOrderNotification(admin, {
      type: "order.updated",
      order_id: 25,
      user_id: customer.id,
      status: "out_for_delivery",
    })).toEqual({
      title: "Order Out For Delivery",
      message: "Order #25 for customer #7 is out for delivery.",
    });
  });
});
