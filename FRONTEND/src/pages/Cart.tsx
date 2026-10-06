import { useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { createOrder } from "../services/orders";
import { API_URL } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCartStore } from "../stores/cartStore";
import { cartItemsQueryKey, cartQueryKey, useCartItems, useCartQuery, useRemoveFromCart } from "../hooks/useCart";
import { getApiErrorMessage } from "../lib/apiError";
import type { CreateOrderResponse } from "../types";

function imageSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_URL.replace(/\/api$/, "")}${url}`;
}

export default function Cart() {
  const user = useAuth((state) => state.user);
  const queryClient = useQueryClient();
  const cartQuery = useCartQuery(Boolean(user));
  const itemsQuery = useCartItems(cartQuery.data || {}, cartQuery.isSuccess);
  const removeMutation = useRemoveFromCart();
  const setCart = useCartStore((state) => state.setCart);
  const [orderError, setOrderError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<CreateOrderResponse | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");

  const items = itemsQuery.data || [];
  const error = orderError ||
    (removeMutation.error ? getApiErrorMessage(removeMutation.error, "Could not remove this item.") : "") ||
    (cartQuery.error ? getApiErrorMessage(cartQuery.error, "Could not load your cart.") : "") ||
    (itemsQuery.error ? getApiErrorMessage(itemsQuery.error, "Could not load the products in your cart.") : "");

  const checkout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOrderError("");
    if (deliveryAddress.trim().length < 10) {
      setOrderError("Enter a delivery address with at least 10 characters.");
      return;
    }

    setSubmitting(true);
    try {
      setOrder(await createOrder(deliveryAddress.trim()));
      setCart({});
      queryClient.setQueryData(cartQueryKey, {});
      queryClient.setQueryData(cartItemsQueryKey({}), []);
      await queryClient.invalidateQueries({ queryKey: cartQueryKey });
      setDeliveryAddress("");
    } catch (err) {
      setOrderError(getApiErrorMessage(err, "Could not place your order."));
    } finally {
      setSubmitting(false);
    }
  };

  const total = items.reduce(
    (sum, { product, quantity }) => sum + product.price * quantity,
    0
  );

  if (cartQuery.isPending || (cartQuery.isSuccess && itemsQuery.isPending)) {
    return <div className="py-16 text-center text-slate-500">Loading cart...</div>;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-3xl font-bold">Your cart</h1>
      {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {order && (
        <p role="status" className="mb-5 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Order #{order.order_id} placed. <Link className="underline" to={`/orders/${order.order_id}`}>View order</Link>
        </p>
      )}

      {items.length === 0 ? (
        <div className="border-y py-10 text-center text-slate-600">
          <p>Your cart is empty.</p>
          <Link to="/" className="mt-4 inline-block font-medium text-slate-900 underline">Browse products</Link>
        </div>
      ) : (
        <>
          <ul className="divide-y border-y">
            {items.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-center justify-between gap-4 py-5">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                    {imageSrc(product.image_url) ? (
                      <img src={imageSrc(product.image_url) ?? undefined} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="px-1 text-center text-[10px] text-slate-400">No image</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link to={`/products/${product.id}`} className="font-semibold hover:underline">{product.name}</Link>
                    <p className="mt-1 text-sm text-slate-500">
                      {quantity} × ₹{Number(product.price).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-semibold">₹{(product.price * quantity).toFixed(2)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeMutation.mutate(product.id)}
                    disabled={removeMutation.isPending}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <form onSubmit={checkout} className="ml-auto mt-6 max-w-xl space-y-5">
            <label className="block space-y-2 text-sm font-medium">
              Delivery address
              <textarea
                value={deliveryAddress}
                onChange={(event) => setDeliveryAddress(event.target.value)}
                minLength={10}
                maxLength={500}
                rows={3}
                required
                placeholder="Street, city, state, postal code"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
              />
              <span className="block text-xs font-normal text-slate-500">
                Enter at least 10 characters. Used for this order only.
              </span>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
              <span className="text-lg font-semibold">Total ₹{total.toFixed(2)}</span>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Placing order..." : "Place order"}
              </Button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}