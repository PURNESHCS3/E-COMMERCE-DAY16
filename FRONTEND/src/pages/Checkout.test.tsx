import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { server, testUser } from "../test/server";
import { useAuthStore } from "../stores/authStore";
import Checkout from "./Checkout";

function renderCheckout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/checkout"]}>
        <AuthProvider>
          <Routes>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders/:id" element={<p>Order created successfully</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("checkout", () => {
  it("shows the current cart summary before accepting an order", async () => {
    localStorage.setItem("access_token", "test-token");
    useAuthStore.setState({ user: testUser, loading: false });
    renderCheckout();

    expect(await screen.findByText("Test Headphones × 1")).toBeInTheDocument();
    expect(screen.getByText("Total ₹1000.00")).toBeInTheDocument();
  });

  it("rejects a blank delivery address", async () => {
    localStorage.setItem("access_token", "test-token");
    useAuthStore.setState({ user: testUser, loading: false });
    let orderRequests = 0;
    server.use(
      http.post("http://127.0.0.1:8000/api/orders/", () => {
        orderRequests += 1;
        return HttpResponse.json({ order_id: 1 });
      })
    );

    const user = userEvent.setup();
    renderCheckout();
    await screen.findByRole("heading", { name: "Order summary" });
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByText("Enter a delivery address with at least 10 characters.")).toBeInTheDocument();
    expect(orderRequests).toBe(0);
  });

  it("rejects addresses shorter than ten characters", async () => {
    localStorage.setItem("access_token", "test-token");
    useAuthStore.setState({ user: testUser, loading: false });
    const user = userEvent.setup();
    renderCheckout();
    await screen.findByRole("heading", { name: "Order summary" });
    await user.type(screen.getByRole("textbox"), "123 Main");
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByText("Enter a delivery address with at least 10 characters.")).toBeInTheDocument();
  });

  it("creates an order and navigates to its details", async () => {
    localStorage.setItem("access_token", "test-token");
    useAuthStore.setState({ user: testUser, loading: false });
    let submittedAddress = "";
    server.use(
      http.post("http://127.0.0.1:8000/api/orders/", async ({ request }) => {
        const body = await request.json() as { delivery_address: string };
        submittedAddress = body.delivery_address;
        return HttpResponse.json({
          message: "Order placed successfully",
          order_id: 9,
          total_amount: 1000,
          delivery_address: submittedAddress,
          status: "confirmed",
        });
      })
    );

    const user = userEvent.setup();
    renderCheckout();
    await screen.findByRole("heading", { name: "Order summary" });
    await user.type(screen.getByRole("textbox"), "123 Main Street, Springfield");
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByText("Order created successfully")).toBeInTheDocument();
    expect(submittedAddress).toBe("123 Main Street, Springfield");
  });

  it("shows backend errors when order creation fails", async () => {
    localStorage.setItem("access_token", "test-token");
    useAuthStore.setState({ user: testUser, loading: false });
    server.use(
      http.post("http://127.0.0.1:8000/api/orders/", () =>
        HttpResponse.json({ detail: "Insufficient stock" }, { status: 400 })
      )
    );

    const user = userEvent.setup();
    renderCheckout();
    await screen.findByRole("heading", { name: "Order summary" });
    await user.type(screen.getByRole("textbox"), "123 Main Street, Springfield");
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient stock");
  });
});
