import { useState } from "react";
import { ArrowLeft, ClipboardList, FileDown, MapPin, PackageCheck } from "lucide-react";
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
      className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {!id ? (
            <Link to={`${ordersPath}/${order.id}`} className="text-lg font-semibold text-slate-950 hover:text-emerald-800 hover:underline">
              Order #{order.id}
            </Link>
          ) : (
            <p className="text-lg font-semibold text-slate-950">Order #{order.id}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {order.created_at && (
              <time dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString()}</time>
            )}
            {user?.role === "admin" && <span>Customer #{order.user_id}</span>}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="text-lg font-semibold tracking-tight text-slate-950">
            ₹{Number(order.total_amount).toFixed(2)}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium capitalize ${
            order.status === "delivered"
              ? "bg-emerald-50 text-emerald-800"
              : order.status === "cancelled"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-900"
          }`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            Status: {order.status.replaceAll("_", " ")}
          </span>
        </div>
      </div>
      {order.delivery_address && (
        <p className="mt-4 flex items-start gap-2 border-t border-stone-100 pt-4 text-sm text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" aria-hidden="true" />
          <span><span className="font-medium text-slate-800">Deliver to:</span> {order.delivery_address}</span>
        </p>
      )}
      {order.status === "cancelled" && (
        <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          This order was cancelled by the store administrator.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
        <Button
          type="button"
          size="sm"
          className="rounded-full bg-emerald-800 text-white shadow-sm hover:bg-emerald-900"
          disabled={invoiceJob.isPending && invoiceJob.variables === order.id}
          onClick={() => invoiceJob.mutate(order.id)}
        >
          <FileDown className="mr-2 h-4 w-4" />
          {invoiceJob.isPending && invoiceJob.variables === order.id
            ? "Queueing invoice..."
            : "Generate invoice PDF"}
        </Button>
        {user?.role === "admin" && (
          <>
            {nextStatus[order.status] && (
              <Button
                type="button"
                size="sm"
                className="rounded-full"
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
                className="rounded-full"
                disabled={cancelOrder.isPending && cancelOrder.variables === order.id}
                onClick={() => handleCancel(order)}
              >
                {cancelOrder.isPending && cancelOrder.variables === order.id ? "Cancelling..." : "Cancel order"}
              </Button>
            )}
          </>
        )}
      </div>
      {id && order.items && order.items.length > 0 && (
        <ul className="mt-5 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-[#fafaf8] px-3 text-sm text-slate-600 sm:px-4">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
                  {imageSrc(item.product?.image_url ?? null) ? (
                    <img
                      src={imageSrc(item.product?.image_url ?? null) ?? undefined}
                      alt={item.product?.name ?? "Ordered product"}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain p-1"
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
      {id && (
        <Link to={ordersPath} className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All orders
        </Link>
      )}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[0.16em] text-emerald-800">
            {user?.role === "admin" ? "STORE MANAGEMENT" : "YOUR SHOPHUB"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            {id ? `Order #${id}` : user?.role === "admin" ? "All orders" : "Your orders"}
          </h1>
          {!id && <p className="mt-2 text-sm text-slate-500">Track your purchases and delivery progress.</p>}
        </div>
        {id && (
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm text-slate-600">
            <PackageCheck className="h-4 w-4 text-emerald-800" aria-hidden="true" />
            Order details
          </span>
        )}
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {!error && showStatusTabs && (
        <>
          <div role="tablist" aria-label="Filter orders by status" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-2 shadow-sm">
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
                  className={`shrink-0 rounded-xl px-4 py-3 text-sm font-medium transition ${
                    selected
                      ? "bg-emerald-900 text-white shadow-sm"
                      : "text-slate-500 hover:bg-stone-100 hover:text-slate-900"
                  }`}
                >
                  {column.title}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${selected ? "bg-white/15 text-white" : "bg-stone-100 text-slate-600"}`}>
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
              <p className="rounded-2xl border border-dashed border-stone-300 bg-white py-12 text-center text-slate-500">
                No {orderColumns.find((column) => column.status === selectedStatus)?.title.toLowerCase()} orders.
              </p>
            )}
          </section>
        </>
      )}
      {!error && !showStatusTabs && (
        displayedOrders.length > 0 ? (
          <ul className="space-y-4">{displayedOrders.map(renderOrder)}</ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
            <ClipboardList className="mx-auto mb-3 h-9 w-9 text-emerald-800" aria-hidden="true" />
            <p className="font-medium text-slate-900">No orders yet.</p>
            <p className="mt-1 text-sm text-slate-500">Your purchases will appear here when you place an order.</p>
            {!id && user?.role !== "admin" && (
              <Link to="/" className="mt-4 inline-flex text-sm font-medium text-emerald-900 hover:underline">
                Browse products
              </Link>
            )}
          </div>
        )
      )}
    </main>
  );
}
