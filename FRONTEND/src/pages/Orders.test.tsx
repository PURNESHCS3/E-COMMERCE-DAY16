import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { server, testUser } from "../test/server";
import { useAuthStore } from "../stores/authStore";
import Orders from "./Orders";

describe("admin order status controls", () => {
  it("advances delivery status and displays each next action", async () => {
    localStorage.setItem("access_token", "admin-token");
    useAuthStore.setState({
      user: { ...testUser, role: "admin" },
      loading: false,
    });

    let status = "confirmed";
    server.use(
      http.get("http://127.0.0.1:8000/api/orders/", () =>
        HttpResponse.json([
          {
            id: 17,
            user_id: 9,
            total_amount: 1250,
            delivery_address: "12 Market Road, Mumbai",
            status,
          },
          {
            id: 18,
            user_id: 10,
            total_amount: 750,
            delivery_address: "4 Lake Road, Pune",
            status: "cancelled",
          },
        ])
      ),
      http.post("http://127.0.0.1:8000/api/orders/17/status", async ({ request }) => {
        const body = await request.json() as { status: string };
        status = body.status;
        return HttpResponse.json({
          message: "Order status updated successfully",
          order_id: 17,
          status,
        });
      })
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/orders"]}>
          <Routes>
            <Route path="/admin/orders" element={<Orders />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByRole("tablist", { name: "Filter orders by status" })).toBeInTheDocument();
    for (const status of ["Pending", "Confirmed", "Dispatched", "Out for delivery", "Delivered", "Cancelled"]) {
      expect(screen.getByRole("tab", { name: new RegExp(status) })).toBeInTheDocument();
    }
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Order #17");
    expect(screen.queryByText("Order #18")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /cancelled/i }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Order #18");
    expect(screen.queryByText("Order #17")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /confirmed/i }));

    await user.click(await screen.findByRole("button", { name: "Mark dispatched" }));
    expect(await screen.findByRole("tabpanel")).toHaveTextContent("Status: dispatched");
    expect(screen.getByRole("button", { name: "Mark out for delivery" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark out for delivery" }));
    expect(await screen.findByText("Status: out for delivery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark delivered" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark delivered" }));
    expect(await screen.findByText("Status: delivered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark delivered" })).not.toBeInTheDocument();
  });
});

describe("customer order details", () => {
  it("opens an order and shows its product details", async () => {
    localStorage.setItem("access_token", "customer-token");
    useAuthStore.setState({ user: testUser, loading: false });
    server.use(
      http.get("http://127.0.0.1:8000/api/orders/", () =>
        HttpResponse.json([{
          id: 21,
          user_id: testUser.id,
          total_amount: 2000,
          delivery_address: "12 Market Road, Mumbai",
          status: "confirmed",
        }])
      ),
      http.get("http://127.0.0.1:8000/api/orders/21", () =>
        HttpResponse.json({
          id: 21,
          user_id: testUser.id,
          total_amount: 2000,
          delivery_address: "12 Market Road, Mumbai",
          status: "confirmed",
          items: [{
            id: 1,
            product_id: 1,
            quantity: 2,
            price: 1000,
            product: {
              id: 1,
              name: "Test Headphones",
              description: "Wireless audio",
              image_url: null,
            },
          }],
        })
      )
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/orders"]}>
          <Routes>
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<Orders />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await user.click(await screen.findByRole("link", { name: "Order #21" }));

    expect(await screen.findByText("Test Headphones")).toBeInTheDocument();
    expect(screen.getByText("Wireless audio")).toBeInTheDocument();
    expect(screen.getByText("2 × ₹1000.00")).toBeInTheDocument();
  });
});
