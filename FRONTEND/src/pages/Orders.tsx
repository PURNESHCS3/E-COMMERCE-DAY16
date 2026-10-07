import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useCancelOrder, useOrder, useOrders } from "../hooks/useOrders";
import { getApiErrorMessage } from "../lib/apiError";
import { useAuth } from "../context/AuthContext";
import type { Order } from "../types";

export default function Orders() {
  const { id } = useParams();
  const user = useAuth((state) => state.user);
  const ordersPath = user?.role === "admin" ? "/admin/orders" : "/orders";
  const ordersQuery = useOrders(!id);
  const orderQuery = useOrder(id, Boolean(id));
  const cancelOrder = useCancelOrder();
  const [notice, setNotice] = useState("");

  const query = id ? orderQuery : ordersQuery;
  const orders: Order[] = id
    ? orderQuery.data ? [orderQuery.data] : []
    : ordersQuery.data || [];
  const error = query.error
    ? getApiErrorMessage(query.error, "Could not load orders.")
    : cancelOrder.error
      ? getApiErrorMessage(cancelOrder.error, "Could not cancel this order.")
      : "";

  const handleCancel = (order: Order) => {
    if (!window.confirm(`Cancel order #${order.id}? The reserved stock will be returned.`)) return;

    setNotice("");
    cancelOrder.mutate(order.id, {
      onSuccess: () => setNotice(`Order #${order.id} was cancelled.`),
    });
  };

  if (query.isPending) return <div className="py-16 text-center text-slate-500">Loading orders...</div>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">
          {id ? `Order #${id}` : user?.role === "admin" ? "All orders" : "Your orders"}
        </h1>
        {id && <Link to={ordersPath} className="text-sm underline">All orders</Link>}
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {!error && orders.length === 0 && <p className="border-y py-10 text-center text-slate-500">No orders yet.</p>}
      {!error && orders.length > 0 && (
        <ul className="divide-y border-y">
          {orders.map((order) => (
            <li key={order.id} className="py-5">
              {!id && <Link to={`${ordersPath}/${order.id}`} className="font-semibold hover:underline">Order #{order.id}</Link>}
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-slate-600">
                <span className="capitalize">Status: {order.status}</span>
                {user?.role === "admin" && <span>Customer #{order.user_id}</span>}
                <span>₹{Number(order.total_amount).toFixed(2)}</span>
                {order.created_at && <time dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString()}</time>}
              </div>
              {order.delivery_address && (
                <p className="mt-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-800">Deliver to:</span> {order.delivery_address}
                </p>
              )}
              {order.status === "cancelled" && (
                <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  This order was cancelled by the store administrator.
                </p>
              )}
              {user?.role === "admin" && order.status === "confirmed" && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="mt-3"
                  disabled={cancelOrder.isPending && cancelOrder.variables === order.id}
                  onClick={() => handleCancel(order)}
                >
                  {cancelOrder.isPending && cancelOrder.variables === order.id ? "Cancelling..." : "Cancel order"}
                </Button>
              )}
              {id && order.items && order.items.length > 0 && (
                <ul className="mt-4 space-y-2 border-t pt-4 text-sm text-slate-600">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4">
                      <span>Product #{item.product_id} × {item.quantity}</span>
                      <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
