import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { API_URL } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { useCartItems, useCartQuery, useRemoveFromCart } from "../hooks/useCart";
import { getApiErrorMessage } from "../lib/apiError";

function imageSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_URL.replace(/\/api$/, "")}${url}`;
}

export default function Cart() {
  const user = useAuth((state) => state.user);
  const cartQuery = useCartQuery(Boolean(user));
  const itemsQuery = useCartItems(cartQuery.data || {}, cartQuery.isSuccess);
  const removeMutation = useRemoveFromCart();

  const items = itemsQuery.data || [];
  const error =
    (removeMutation.error ? getApiErrorMessage(removeMutation.error, "Could not remove this item.") : "") ||
    (cartQuery.error ? getApiErrorMessage(cartQuery.error, "Could not load your cart.") : "") ||
    (itemsQuery.error ? getApiErrorMessage(itemsQuery.error, "Could not load the products in your cart.") : "");

  const total = items.reduce(
    (sum, { product, quantity }) => sum + product.price * quantity,
    0
  );

  if (cartQuery.isPending || (cartQuery.isSuccess && itemsQuery.isPending)) {
    return <div className="py-16 text-center text-slate-500">Loading cart...</div>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8">
        <p className="mb-1 text-xs font-semibold tracking-[0.16em] text-emerald-800">YOUR SHOPPING BAG</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Your cart</h1>
        <p className="mt-2 text-sm text-slate-500">
          {items.length} item{items.length !== 1 ? "s" : ""} in your cart
        </p>
      </div>
      {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center text-slate-600">
          <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-emerald-800" aria-hidden="true" />
          <p className="text-lg font-semibold text-slate-900">Your cart is empty.</p>
          <p className="mt-2 text-sm text-slate-500">It’s a good time to find a new favorite.</p>
          <Link to="/" className="mt-5 inline-flex">
            <Button className="rounded-full">Browse products</Button>
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white px-4 shadow-sm sm:px-6">
            {items.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-5 sm:gap-5">
                <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f0f1ed] sm:h-24 sm:w-24">
                    {imageSrc(product.image_url) ? (
                      <img src={imageSrc(product.image_url) ?? undefined} alt={product.name} referrerPolicy="no-referrer" className="h-full w-full object-contain p-2" />
                    ) : (
                      <span className="px-1 text-center text-[10px] text-slate-400">No image</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link to={`/products/${product.id}`} className="font-semibold text-slate-900 hover:text-emerald-800 hover:underline">{product.name}</Link>
                    <p className="mt-1 text-sm text-slate-500">
                      {quantity} × ₹{Number(product.price).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <span className="font-semibold text-slate-900">₹{(product.price * quantity).toFixed(2)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => removeMutation.mutate(product.id)}
                    disabled={removeMutation.isPending}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Card className="sticky top-28 border-stone-200 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-slate-950">Order summary</h2>
              <div className="mt-5 flex justify-between border-b border-stone-200 pb-4 text-sm text-slate-600">
                <span>Subtotal</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Delivery details are collected securely at checkout.
              </p>
              <div className="mt-5 flex justify-between border-t border-stone-200 pt-4 text-base font-semibold text-slate-950">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
              <Link to="/checkout" className="mt-5 block">
                <Button className="h-12 w-full rounded-xl">Proceed to checkout</Button>
              </Link>
              <Link to="/" className="mt-4 block text-center text-sm font-medium text-emerald-900 hover:underline">
                Continue shopping
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}