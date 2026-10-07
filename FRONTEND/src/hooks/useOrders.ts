import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelOrder, createOrder, getOrder, getOrders } from "../services/orders";
import { cartItemsQueryKey, cartQueryKey } from "./useCart";
import { useCartStore } from "../stores/cartStore";

export const ordersQueryKey = ["orders"] as const;
export const orderQueryKey = (orderId: string | number) =>
  [...ordersQueryKey, orderId] as const;

export function useOrders(enabled = true) {
  return useQuery({
    queryKey: ordersQueryKey,
    queryFn: getOrders,
    enabled,
  });
}

export function useOrder(orderId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: orderQueryKey(orderId || ""),
    queryFn: () => {
      if (!orderId) throw new Error("An order ID is required.");
      return getOrder(orderId);
    },
    enabled: enabled && Boolean(orderId),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  const clearCart = useCartStore((state) => state.clear);

  return useMutation({
    mutationFn: createOrder,
    onSuccess: async () => {
      clearCart();
      queryClient.setQueryData(cartQueryKey, {});
      queryClient.setQueryData(cartItemsQueryKey({}), []);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cartQueryKey }),
        queryClient.invalidateQueries({ queryKey: ordersQueryKey }),
      ]);
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelOrder,
    onSuccess: async (result, orderId) => {
      queryClient.setQueryData(ordersQueryKey, (orders: Awaited<ReturnType<typeof getOrders>> | undefined) =>
        orders?.map((order) =>
          order.id === orderId ? { ...order, status: result.status } : order
        )
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ordersQueryKey }),
        queryClient.invalidateQueries({ queryKey: orderQueryKey(orderId) }),
      ]);
    },
  });
}
