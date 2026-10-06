import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, delay } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { server, testProduct, testUser } from "../test/server";
import { useAuthStore } from "../stores/authStore";
import { useCartStore } from "../stores/cartStore";
import Cart from "./Cart";

function renderCart() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/cart"]}>
        <AuthProvider>
          <Cart />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("shopping cart", () => {
  it("removes an item immediately and displays the empty-cart state", async () => {
    localStorage.setItem("access_token", "test-token");
    useAuthStore.setState({ user: testUser, loading: false });
    useCartStore.getState().setCart({ "1": 1 });
    server.use(
      http.get("http://127.0.0.1:8000/api/cart/", () =>
        HttpResponse.json({ cart: { "1": 1 } })
      ),
      http.get("http://127.0.0.1:8000/api/products/1", () =>
        HttpResponse.json(testProduct)
      ),
      http.delete("http://127.0.0.1:8000/api/cart/1", async () => {
        await delay(100);
        return HttpResponse.json({
          message: "Product removed from cart",
          cart: {},
        });
      })
    );

    const user = userEvent.setup();
    renderCart();

    expect(await screen.findByText(testProduct.name)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("restores the cart and reports an error when removal fails", async () => {
    localStorage.setItem("access_token", "test-token");
    useAuthStore.setState({ user: testUser, loading: false });
    useCartStore.getState().setCart({ "1": 1 });
    server.use(
      http.get("http://127.0.0.1:8000/api/cart/", () =>
        HttpResponse.json({ cart: { "1": 1 } })
      ),
      http.get("http://127.0.0.1:8000/api/products/1", () =>
        HttpResponse.json(testProduct)
      ),
      http.delete("http://127.0.0.1:8000/api/cart/1", async () => {
        await delay(100);
        return HttpResponse.json(
          { detail: "Cart service unavailable" },
          { status: 503 }
        );
      })
    );

    const user = userEvent.setup();
    renderCart();

    expect(await screen.findByText(testProduct.name)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Your cart is empty.")).toBeInTheDocument();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cart service unavailable"
    );
    expect(await screen.findByText(testProduct.name)).toBeInTheDocument();
  });
});
