import { useState } from "react";
import { FileDown } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  useCancelOrder,
  useOrder,
  useOrders,
  useUpdateOrderStatus,
} from "../hooks/useOrders";
import { getApiErrorMessage } from "../lib/apiError";
import { useAuth } from "../hooks/useAuth";
import { API_URL } from "../services/api";
import { createInvoiceJob } from "../services/jobs";
import type { BackgroundJob, Order } from "../types";

function imageSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_URL.replace(/\/api$/, "")}${url}`;
}

const orderColumns = [
  { status: "pending", title: "Pending" },
  { status: "confirmed", title: "Confirmed" },
  { status: "dispatched", title: "Dispatched" },
  { status: "out_for_delivery", title: "Out for delivery" },
  { status: "delivered", title: "Delivered" },
  { status: "cancelled", title: "Cancelled" },
] as const;

export default function Orders() {
  const { id } = useParams();
  const user = useAuth((state) => state.user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ordersPath = user?.role === "admin" ? "/admin/orders" : "/orders";
  const ordersQuery = useOrders(!id);
  const orderQuery = useOrder(id, Boolean(id));
  const cancelOrder = useCancelOrder();
  const updateStatus = useUpdateOrderStatus();
  const invoiceJob = useMutation({
    mutationFn: createInvoiceJob,
    onSuccess: async (job) => {
      const jobsQueryKey = ["background-jobs", user?.id] as const;
      await queryClient.cancelQueries({ queryKey: jobsQueryKey });
      queryClient.setQueryData<BackgroundJob[]>(jobsQueryKey, (jobs = []) => [
        job,
        ...jobs.filter((existingJob) => existingJob.id !== job.id),
      ]);
      navigate(`/jobs?job=${job.id}`);
    },
  });
  const [notice, setNotice] = useState("");
  const [selectedStatus, setSelectedStatus] =
    useState<(typeof orderColumns)[number]["status"]>("confirmed");

  const query = id ? orderQuery : ordersQuery;
  const orders: Order[] = id
    ? orderQuery.data ? [orderQuery.data] : []
    : ordersQuery.data || [];
  const showStatusTabs = user?.role === "admin" && !id;
  const displayedOrders = showStatusTabs
    ? orders.filter((order) => order.status === selectedStatus)
    : orders;
  const error = query.error
    ? getApiErrorMessage(query.error, "Could not load orders.")
    : cancelOrder.error
      ? getApiErrorMessage(cancelOrder.error, "Could not cancel this order.")
      : updateStatus.error
        ? getApiErrorMessage(updateStatus.error, "Could not update this order.")
        : invoiceJob.error
          ? getApiErrorMessage(invoiceJob.error, "Could not start invoice generation.")
      : "";

  const handleCancel = (order: Order) => {
    if (!window.confirm(`Cancel order #${order.id}? The reserved stock will be returned.`)) return;

    setNotice("");
    cancelOrder.mutate(order.id, {
      onSuccess: () => {
        setSelectedStatus("cancelled");
        setNotice(`Order #${order.id} was cancelled.`);
      },
    });
  };

  const nextStatus: Record<string, {
    status: "dispatched" | "out_for_delivery" | "delivered";
    label: string;
  }> = {
    confirmed: { status: "dispatched", label: "Mark dispatched" },
    dispatched: { status: "out_for_delivery", label: "Mark out for delivery" },
    out_for_delivery: { status: "delivered", label: "Mark delivered" },
  };

  const handleStatusUpdate = (
    order: Order,
    status: "dispatched" | "out_for_delivery" | "delivered"
  ) => {
    setNotice("");
    updateStatus.mutate(
      { orderId: order.id, status },
      {
        onSuccess: () => {
          setSelectedStatus(status);
          setNotice(`Order #${order.id} is now ${status.replaceAll("_", " ")}.`);
        },
      }
    );
  };

  const renderOrder = (order: Order) => (
    <li
      key={order.id}
      className={showStatusTabs
        ? "rounded-lg border bg-white p-4 shadow-sm"
        : "py-5"}
    >
      {!id && <Link to={`${ordersPath}/${order.id}`} className="font-semibold hover:underline">Order #{order.id}</Link>}
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm text-slate-600">
        <span className="capitalize">Status: {order.status.replaceAll("_", " ")}</span>
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
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        disabled={invoiceJob.isPending && invoiceJob.variables === order.id}
        onClick={() => invoiceJob.mutate(order.id)}
      >
        <FileDown className="mr-2 h-4 w-4" />
        {invoiceJob.isPending && invoiceJob.variables === order.id
          ? "Queueing invoice..."
          : "Generate invoice PDF"}
      </Button>
      {user?.role === "admin" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {nextStatus[order.status] && (
            <Button
              type="button"
              size="sm"
              disabled={updateStatus.isPending && updateStatus.variables?.orderId === order.id}
              onClick={() => handleStatusUpdate(order, nextStatus[order.status].status)}
            >
              {updateStatus.isPending && updateStatus.variables?.orderId === order.id
                ? "Updating..."
                : nextStatus[order.status].label}
            </Button>
          )}
          {order.status === "confirmed" && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={cancelOrder.isPending && cancelOrder.variables === order.id}
              onClick={() => handleCancel(order)}
            >
              {cancelOrder.isPending && cancelOrder.variables === order.id ? "Cancelling..." : "Cancel order"}
            </Button>
          )}
        </div>
      )}
      {id && order.items && order.items.length > 0 && (
        <ul className="mt-4 space-y-2 border-t pt-4 text-sm text-slate-600">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                  {imageSrc(item.product?.image_url ?? null) ? (
                    <img
                      src={imageSrc(item.product?.image_url ?? null) ?? undefined}
                      alt={item.product?.name ?? "Ordered product"}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="px-1 text-center text-[10px] text-slate-400">No image</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {item.product?.name ?? `Product #${item.product_id}`}
                  </p>
                  {item.product?.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.product.description}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    {item.quantity} × ₹{Number(item.price).toFixed(2)}
                  </p>
                </div>
              </div>
              <span className="shrink-0 font-medium text-slate-900">
                ₹{(item.price * item.quantity).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );

  if (query.isPending) return <div className="py-16 text-center text-slate-500">Loading orders...</div>;

  return (
    <main className={`mx-auto ${showStatusTabs ? "max-w-7xl" : "max-w-4xl"} px-4 py-10 sm:px-6`}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">
          {id ? `Order #${id}` : user?.role === "admin" ? "All orders" : "Your orders"}
        </h1>
        {id && <Link to={ordersPath} className="text-sm underline">All orders</Link>}
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {!error && showStatusTabs && (
        <>
          <div role="tablist" aria-label="Filter orders by status" className="mb-6 flex gap-2 overflow-x-auto border-b">
            {orderColumns.map((column) => {
              const count = orders.filter((order) => order.status === column.status).length;
              const selected = selectedStatus === column.status;
              return (
                <button
                  key={column.status}
                  type="button"
                  role="tab"
                  id={`order-status-tab-${column.status}`}
                  aria-selected={selected}
                  aria-controls="order-status-panel"
                  onClick={() => setSelectedStatus(column.status)}
                  className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition ${
                    selected
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {column.title}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <section
            id="order-status-panel"
            role="tabpanel"
            aria-labelledby={`order-status-tab-${selectedStatus}`}
          >
            {displayedOrders.length > 0 ? (
              <ul className="space-y-3">{displayedOrders.map(renderOrder)}</ul>
            ) : (
              <p className="rounded-lg border border-dashed py-10 text-center text-slate-500">
                No {orderColumns.find((column) => column.status === selectedStatus)?.title.toLowerCase()} orders.
              </p>
            )}
          </section>
        </>
      )}
      {!error && !showStatusTabs && (
        displayedOrders.length > 0 ? (
          <ul className="divide-y border-y">{displayedOrders.map(renderOrder)}</ul>
        ) : (
          <p className="border-y py-10 text-center text-slate-500">No orders yet.</p>
        )
      )}
    </main>
  );
}
