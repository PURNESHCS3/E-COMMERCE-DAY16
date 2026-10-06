import api from "./api";
import type { CartResponse } from "../types";

export const getCart = async (): Promise<CartResponse> => {
  const { data } = await api.get<CartResponse>("/cart/");
  return data;
};

export const addToCart = async (
  productId: number,
  quantity = 1
): Promise<CartResponse> => {
  const { data } = await api.post<CartResponse>("/cart/add", {
    product_id: productId,
    quantity,
  });
  return data;
};

export const removeFromCart = async (
  productId: number
): Promise<CartResponse> => {
  const { data } = await api.delete<CartResponse>(`/cart/${productId}`);
  return data;
};
