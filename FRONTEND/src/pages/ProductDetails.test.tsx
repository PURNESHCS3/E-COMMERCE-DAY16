import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ProductDetails from "./ProductDetails";
import { server, testProduct } from "../test/server";

describe("product details information toggle", () => {
  it("shows the description and price first, then allows switching to features and back", async () => {
    const product = {
      ...testProduct,
      description: "Comfortable headphones for everyday listening.",
      features: "Bluetooth connectivity\nFoldable design",
    };
    server.use(
      http.get("http://127.0.0.1:8000/api/products/1", () =>
        HttpResponse.json(product),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/products/1"]}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetails />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(product.description)).toBeInTheDocument();
    const informationPanel = screen.getByLabelText("Product description");
    expect(informationPanel).toHaveClass("h-44", "overflow-y-auto");
    expect(screen.getByText("₹1000.00")).toBeInTheDocument();
    expect(screen.queryByText("Bluetooth connectivity")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View features" }));
    expect(screen.getByText("Bluetooth connectivity")).toBeInTheDocument();
    expect(screen.getByText("Foldable design")).toBeInTheDocument();
    expect(screen.queryByText(product.description)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Product features")).toHaveClass("h-44", "overflow-y-auto");
    expect(screen.getByRole("button", { name: "View description" })).toHaveClass("h-9");

    fireEvent.click(screen.getByRole("button", { name: "View description" }));
    expect(screen.getByText(product.description)).toBeInTheDocument();
    expect(screen.queryByText("Bluetooth connectivity")).not.toBeInTheDocument();
  });
});
