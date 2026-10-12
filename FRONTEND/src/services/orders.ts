import api from "./api";
import type {
  CancelOrderResponse,
  CreateOrderResponse,
  Order,
  UpdateOrderStatusResponse,
} from "../types";

export const createOrder = async (
  deliveryAddress: string
): Promise<CreateOrderResponse> => {
  const { data } = await api.post<CreateOrderResponse>("/orders/", {
    delivery_address: deliveryAddress,
  });
  return data;
};

export const getOrders = async (): Promise<Order[]> => {
  const { data } = await api.get<Order[]>("/orders/");
  return data;
};

export const getOrder = async (orderId: string | number): Promise<Order> => {
  const { data } = await api.get<Order>(`/orders/${orderId}`);
  return data;
};

export const cancelOrder = async (
  orderId: number
): Promise<CancelOrderResponse> => {
  const { data } = await api.post<CancelOrderResponse>(
    `/orders/${orderId}/cancel`
  );
  return data;
};

export const updateOrderStatus = async (
  orderId: number,
  status: "dispatched" | "out_for_delivery" | "delivered"
): Promise<UpdateOrderStatusResponse> => {
  const { data } = await api.post<UpdateOrderStatusResponse>(
    `/orders/${orderId}/status`,
    { status }
  );
  return data;
};
