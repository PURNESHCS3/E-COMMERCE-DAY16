import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Products from "./Products";
import { server, testProduct } from "../test/server";

function renderProducts() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Products />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("product catalog", () => {
  it("loads products and filters by the user's search", async () => {
    renderProducts();

    expect(await screen.findByText(testProduct.name)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search products" }), {
      target: { value: "missing" },
    });

    expect(await screen.findByText("No loaded products match your search."))
      .toBeInTheDocument();
  });

  it("shows a recoverable message when the catalog request fails", async () => {
    server.use(
      http.get("http://127.0.0.1:8000/api/products/", () =>
        HttpResponse.json({ detail: "Catalog unavailable" }, { status: 503 })
      )
    );

    renderProducts();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Catalog unavailable"
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
