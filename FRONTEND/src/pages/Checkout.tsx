import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { getApiErrorMessage } from "../lib/apiError";
import { useCartItems, useCartQuery } from "../hooks/useCart";
import { useCreateOrder } from "../hooks/useOrders";

const checkoutSchema = z.object({
  deliveryAddress: z
    .string()
    .trim()
    .min(10, "Enter a delivery address with at least 10 characters.")
    .max(500, "Delivery address must be 500 characters or fewer."),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

export default function Checkout() {
  const navigate = useNavigate();
  const cartQuery = useCartQuery();
  const cartItemsQuery = useCartItems(cartQuery.data || {}, cartQuery.isSuccess);
  const createOrder = useCreateOrder();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { deliveryAddress: "" },
  });

  const items = cartItemsQuery.data || [];
  const total = items.reduce(
    (sum, { product, quantity }) => sum + product.price * quantity,
    0
  );
  const error = cartQuery.error || cartItemsQuery.error
    ? getApiErrorMessage(
        cartQuery.error || cartItemsQuery.error,
        "Could not load your cart."
      )
    : createOrder.error
      ? getApiErrorMessage(createOrder.error, "Could not place your order.")
      : "";

  const submit = handleSubmit(({ deliveryAddress }) => {
    createOrder.mutate(deliveryAddress, {
      onSuccess: (order) => navigate(`/orders/${order.order_id}`),
    });
  });

  if (cartQuery.isPending || (cartQuery.isSuccess && cartItemsQuery.isPending)) {
    return <div className="py-16 text-center text-slate-500">Loading checkout...</div>;
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold">Checkout</h1>
        {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="border-y py-10 text-center text-slate-600">
          Your cart is empty. Add products before checking out.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 text-3xl font-bold">Checkout</h1>
      {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section aria-labelledby="checkout-items-heading" className="mb-8">
        <h2 id="checkout-items-heading" className="mb-3 text-lg font-semibold">Order summary</h2>
        <ul className="divide-y border-y">
          {items.map(({ product, quantity }) => (
            <li key={product.id} className="flex justify-between gap-4 py-3 text-sm">
              <span>{product.name} × {quantity}</span>
              <span>₹{(product.price * quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-right text-lg font-semibold">Total ₹{total.toFixed(2)}</p>
      </section>

      <form onSubmit={submit} noValidate className="space-y-5">
        <label htmlFor="deliveryAddress" className="block space-y-2 text-sm font-medium">
          Delivery address
          <textarea
            id="deliveryAddress"
            {...register("deliveryAddress")}
            maxLength={500}
            rows={4}
            aria-invalid={Boolean(errors.deliveryAddress)}
            aria-describedby={errors.deliveryAddress ? "deliveryAddress-error" : "deliveryAddress-help"}
            placeholder="Street, city, state, postal code"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
          />
          {errors.deliveryAddress ? (
            <span id="deliveryAddress-error" role="alert" className="block text-sm font-normal text-red-700">
              {errors.deliveryAddress.message}
            </span>
          ) : (
            <span id="deliveryAddress-help" className="block text-xs font-normal text-slate-500">
              Enter at least 10 characters. Used for this order only.
            </span>
          )}
        </label>
        <div className="flex justify-end border-t pt-4">
          <Button type="submit" disabled={createOrder.isPending}>
            {createOrder.isPending ? "Placing order..." : "Place order"}
          </Button>
        </div>
      </form>
    </main>
  );
}
