import api from "./api";
import type { CancelOrderResponse, CreateOrderResponse, Order } from "../types";

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
