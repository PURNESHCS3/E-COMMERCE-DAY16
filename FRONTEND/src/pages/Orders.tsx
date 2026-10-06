import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { cancelOrder, getOrder, getOrders } from "../services/orders";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage } from "../lib/apiError";
import type { Order } from "../types";

export default function Orders() {
  const { id } = useParams();
  const user = useAuth((state) => state.user);
  const ordersPath = user?.role === "admin" ? "/admin/orders" : "/orders";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => {
    const loadOrders = async () => {
      setLoading(true);
      setError("");
      setNotice("");
      try {
        const result = id ? await getOrder(id) : await getOrders();
        setOrders(Array.isArray(result) ? result : [result]);
      } catch (err) {
        setError(getApiErrorMessage(err, "Could not load orders."));
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [id]);

  const handleCancel = async (order: Order) => {
    if (!window.confirm(`Cancel order #${order.id}? The reserved stock will be returned.`)) return;

    setError("");
    setNotice("");
    setCancellingId(order.id);
    try {
      const result = await cancelOrder(order.id);
      setOrders((current) => current.map((item) => item.id === order.id
        ? { ...item, status: result.status }
        : item));
      setNotice(`Order #${order.id} was cancelled. The customer will see the updated status.`);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not cancel this order."));
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) return <div className="py-16 text-center text-slate-500">Loading orders...</div>;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">
          {id ? `Order #${id}` : user?.role === "admin" ? "All orders" : "Your orders"}
        </h1>
        {id && <Link to={ordersPath} className="text-sm underline">All orders</Link>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {!error && orders.length === 0 && <p className="border-y py-10 text-center text-slate-500">No orders yet.</p>}
      {!error && orders.length > 0 && (
        <ul className="divide-y border-y">
          {orders.map((order) => (
            <li key={order.id} className="py-5">
              {!id && <Link to={`${ordersPath}/${order.id}`} className="font-semibold hover:underline">Order #{order.id}</Link>}
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-slate-600">
                <span className="capitalize">{order.status}</span>
                {user?.role === "admin" && <span>Customer #{order.user_id}</span>}
                <span>₹{Number(order.total_amount).toFixed(2)}</span>
                {order.created_at && <time dateTime={order.created_at ?? undefined}>{new Date(order.created_at).toLocaleDateString()}</time>}
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
                  disabled={cancellingId === order.id}
                  onClick={() => handleCancel(order)}
                >
                  {cancellingId === order.id ? "Cancelling..." : "Cancel order"}
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