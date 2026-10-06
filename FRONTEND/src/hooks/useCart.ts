import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCartStore } from "../stores/cartStore";
import { getCart, addToCart, removeFromCart } from "../services/cart";
import { getProduct } from "../services/products";
import type { Cart, CartItem, CartResponse, Product } from "../types";

export const cartQueryKey = ["cart"];
export const cartItemsQueryKey = (cart: Cart) =>
  [...cartQueryKey, "items", cart] as const;

export function useCartQuery(enabled = true) {
  const setCart = useCartStore((state) => state.setCart);
  const query = useQuery<Cart, Error>({
    queryKey: cartQueryKey,
    queryFn: async () => {
      const { cart } = await getCart();
      setCart(cart);
      return cart;
    },
    enabled,
  });

  useEffect(() => {
    if (enabled && query.data) setCart(query.data);
    if (!enabled) setCart({});
  }, [enabled, query.data, setCart]);

  return query;
}

export function useCartItems(cart: Cart = {}, enabled = true) {
  const queryClient = useQueryClient();

  return useQuery<CartItem[], Error>({
    queryKey: cartItemsQueryKey(cart),
    queryFn: async () =>
      Promise.all(
        Object.entries(cart).map(async ([productId, quantity]) => ({
          product: await queryClient.fetchQuery({
            queryKey: ["products", "detail", productId],
            queryFn: () => getProduct(productId),
          }),
          quantity,
        }))
      ),
    enabled,
  });
}

interface AddToCartVariables {
  productId: number;
  quantity: number;
  product: Product;
}

interface CartMutationContext {
  previousCart: Cart | undefined;
  previousItems: CartItem[] | undefined;
  optimisticCart: Cart;
}

export function useAddToCart() {
  const queryClient = useQueryClient();
  const addItem = useCartStore((state) => state.addItem);
  const setCart = useCartStore((state) => state.setCart);

  return useMutation<CartResponse, Error, AddToCartVariables, CartMutationContext>({
    mutationFn: ({ productId, quantity }) => addToCart(productId, quantity),
    onMutate: async ({ productId, quantity, product }) => {
      await queryClient.cancelQueries({ queryKey: cartQueryKey });
      const previousCart = queryClient.getQueryData<Cart>(cartQueryKey);
      const previousItems = queryClient.getQueryData<CartItem[]>(
        cartItemsQueryKey(previousCart || {})
      );
      const key = String(productId);
      const nextCart = {
        ...(previousCart || {}),
        [key]: (previousCart?.[key] || 0) + quantity,
      };

      addItem(productId, quantity);
      queryClient.setQueryData(cartQueryKey, nextCart);
      const nextItemsKey = cartItemsQueryKey(nextCart);
      if (previousItems) {
        const itemIndex = previousItems.findIndex(
          ({ product: itemProduct }) => String(itemProduct.id) === key
        );
        queryClient.setQueryData(
          nextItemsKey,
          itemIndex === -1
            ? [...previousItems, { product, quantity }]
            : previousItems.map((item, index) =>
                index === itemIndex
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              )
        );
      }

      return { previousCart, previousItems, optimisticCart: nextCart };
    },
    onSuccess: ({ cart }) => {
      setCart(cart);
      queryClient.setQueryData(cartQueryKey, cart);
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCart) {
        setCart(context.previousCart);
        queryClient.setQueryData(cartQueryKey, context.previousCart);
      } else {
        useCartStore.getState().clear();
        queryClient.removeQueries({ queryKey: cartQueryKey });
      }
      if (context?.previousItems) {
        queryClient.removeQueries({
          queryKey: cartItemsQueryKey(context.optimisticCart),
          exact: true,
        });
        queryClient.setQueryData(
          cartItemsQueryKey(context.previousCart || {}),
          context.previousItems
        );
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cartQueryKey }),
  });
}

export function useRemoveFromCart() {
  const queryClient = useQueryClient();
  const removeItem = useCartStore((state) => state.removeItem);
  const setCart = useCartStore((state) => state.setCart);

  return useMutation<CartResponse, Error, number, CartMutationContext>({
    mutationFn: (productId) => removeFromCart(productId),
    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: cartQueryKey });
      const previousCart = queryClient.getQueryData<Cart>(cartQueryKey);
      const previousItems = queryClient.getQueryData<CartItem[]>(
        cartItemsQueryKey(previousCart || {})
      );
      const nextCart = { ...(previousCart || {}) };
      delete nextCart[String(productId)];

      removeItem(productId);
      queryClient.setQueryData(cartQueryKey, nextCart);
      const nextItemsKey = cartItemsQueryKey(nextCart);
      if (previousItems) {
        queryClient.setQueryData(
          nextItemsKey,
          previousItems.filter(
            ({ product }) => String(product.id) !== String(productId)
          )
        );
      }

      return { previousCart, previousItems, optimisticCart: nextCart };
    },
    onSuccess: ({ cart }) => {
      setCart(cart);
      queryClient.setQueryData(cartQueryKey, cart);
    },
    onError: (_error, _productId, context) => {
      if (context?.previousCart) {
        setCart(context.previousCart);
        queryClient.setQueryData(cartQueryKey, context.previousCart);
      }
      if (context?.previousItems) {
        queryClient.removeQueries({
          queryKey: cartItemsQueryKey(context.optimisticCart),
          exact: true,
        });
        queryClient.setQueryData(
          cartItemsQueryKey(context.previousCart || {}),
          context.previousItems
        );
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cartQueryKey }),
  });
}
