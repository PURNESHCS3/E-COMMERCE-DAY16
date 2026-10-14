import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("filters catalog products by a selected category and returns to all products", async () => {
    const categorizedProduct = {
      ...testProduct,
      category: "Electronics",
      name: "Categorized headphones",
    };
    const requestedCategories: Array<string | null> = [];
    server.use(
      http.get("http://127.0.0.1:8000/api/products/", ({ request }) => {
        const category = new URL(request.url).searchParams.get("category");
        requestedCategories.push(category);
        return HttpResponse.json(
          category === "Electronics"
            ? [categorizedProduct]
            : category === "Books"
              ? []
              : [testProduct],
        );
      }),
      http.get("http://127.0.0.1:8000/api/products/categories", () =>
        HttpResponse.json([
          "Electronics",
          "Footwear",
          "Clothing",
          "Home & Kitchen",
          "Beauty & Personal Care",
          "Books",
          "Sports & Outdoors",
          "Toys & Games",
          "Accessories",
          "Grocery",
          "Other",
        ]),
      ),
    );
    renderProducts();

    expect(await screen.findByRole("heading", { name: testProduct.name }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Electronics" }));

    expect(await screen.findByRole("heading", { name: categorizedProduct.name }))
      .toBeInTheDocument();
    await waitFor(() => expect(requestedCategories).toContain("Electronics"));
    expect(screen.getByRole("button", { name: "Electronics" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Books" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Books" }).querySelector("svg"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Books" }));
    expect(await screen.findByText("No products found in Books.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByRole("heading", { name: testProduct.name }))
      .toBeInTheDocument();
    await waitFor(() => expect(requestedCategories.filter((category) => category === null)).toHaveLength(2));
  });

  it("shows 12 products initially and loads another page only when requested", async () => {
    const products = Array.from({ length: 25 }, (_, index) => ({
      ...testProduct,
      id: index + 1,
      name: `Catalog Product ${index + 1}`,
    }));
    const requestedOffsets: number[] = [];
    server.use(
      http.get("http://127.0.0.1:8000/api/products/", ({ request }) => {
        const params = new URL(request.url).searchParams;
        const skip = Number(params.get("skip") ?? 0);
        const limit = Number(params.get("limit") ?? products.length);
        requestedOffsets.push(skip);
        return HttpResponse.json(products.slice(skip, skip + limit));
      }),
    );
    renderProducts();

    const catalog = await screen.findByRole("heading", { name: "Catalog Product 1" });
    const initialGrid = catalog.closest("div.grid");
    expect(initialGrid).not.toBeNull();
    await waitFor(() => {
      expect(within(initialGrid as HTMLElement).getAllByRole("heading", { level: 3 }))
        .toHaveLength(12);
    });
    expect(requestedOffsets).toEqual([0]);
    expect(screen.getByRole("button", { name: "Load more products" })).toBeInTheDocument();

    fireEvent.scroll(window, { target: { scrollY: 1000 } });
    expect(requestedOffsets).toEqual([0]);
    expect(within(initialGrid as HTMLElement).getAllByRole("heading", { level: 3 }))
      .toHaveLength(12);

    fireEvent.click(screen.getByRole("button", { name: "Load more products" }));
    await screen.findByRole("heading", { name: "Catalog Product 13" });
    await waitFor(() => {
      expect(within(initialGrid as HTMLElement).getAllByRole("heading", { level: 3 }))
        .toHaveLength(24);
    });
    expect(requestedOffsets).toEqual([0, 12]);
    expect(within(initialGrid as HTMLElement).getAllByRole("heading", { level: 3 }))
      .toHaveLength(24);
    expect(screen.getByRole("button", { name: "Load more products" })).toBeInTheDocument();

    fireEvent.scroll(window, { target: { scrollY: 2000 } });
    expect(requestedOffsets).toEqual([0, 12]);
    expect(within(initialGrid as HTMLElement).getAllByRole("heading", { level: 3 }))
      .toHaveLength(24);
  });

  it("shows a disabled load-more button while the next page is loading", async () => {
    const products = Array.from({ length: 24 }, (_, index) => ({
      ...testProduct,
      id: index + 1,
      name: `Next Page Product ${index + 1}`,
    }));
    let releaseNextPage: (() => void) | undefined;
    server.use(
      http.get("http://127.0.0.1:8000/api/products/", async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const skip = Number(params.get("skip") ?? 0);
        const limit = Number(params.get("limit") ?? 12);
        if (skip === 12) {
          await new Promise<void>((resolve) => {
            releaseNextPage = resolve;
          });
        }
        return HttpResponse.json(products.slice(skip, skip + limit));
      }),
    );
    renderProducts();
    await screen.findByRole("heading", { name: "Next Page Product 1" });
    fireEvent.click(screen.getByRole("button", { name: "Load more products" }));
    const loadingButton = await screen.findByRole("button", { name: "Loading more products..." });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toBeVisible();
    releaseNextPage?.();
    expect(await screen.findByRole("heading", { name: "Next Page Product 13" }))
      .toBeInTheDocument();
  });

  it("loads products and filters by the user's search", async () => {
    renderProducts();

    expect(await screen.findByText(testProduct.name)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search products" }), {
      target: { value: "missing" },
    });

    expect(await screen.findByText("No products match your search."))
      .toBeInTheDocument();
  });

  it("uses semantic search for natural-language product queries", async () => {
    const semanticProduct = {
      ...testProduct,
      id: 3,
      name: "Noise Cancelling Headphones",
    };
    const semanticQueries: string[] = [];
    server.use(
      http.get(
        "http://127.0.0.1:8000/api/products/semantic-search",
        ({ request }) => {
          semanticQueries.push(new URL(request.url).searchParams.get("q") ?? "");
          return HttpResponse.json([semanticProduct]);
        },
      ),
    );
    renderProducts();
    fireEvent.change(screen.getByRole("textbox", { name: "Search products" }), {
      target: { value: "something comfortable for travel" },
    });

    expect(
      await screen.findByText("Noise Cancelling Headphones"),
    ).toBeInTheDocument();
    expect(semanticQueries).toContain("something comfortable for travel");
  });

  it("shows products for partial search letters as the user types", async () => {
    const wirelessHeadphones = {
      ...testProduct,
      id: 2,
      name: "Wireless Headphones",
    };
    const searchedQueries: string[] = [];
    const handleSearch = ({ request }: { request: Request }) => {
      const query = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
      searchedQueries.push(query);
      const matches = ["w", "wi", "wire", "wireless", "wireless hea"].includes(query);
      return HttpResponse.json(matches ? [wirelessHeadphones] : []);
    };
    server.use(
      http.get("http://127.0.0.1:8000/api/products/search", handleSearch),
      http.get("http://127.0.0.1:8000/api/products/semantic-search", handleSearch),
    );
    renderProducts();
    const search = screen.getByRole("textbox", { name: "Search products" });
    expect(screen.queryByRole("combobox", { name: "Product search mode" }))
      .not.toBeInTheDocument();

    for (const query of ["w", "wi", "wire", "wireless"]) {
      fireEvent.change(search, { target: { value: query } });
      await waitFor(() => expect(searchedQueries).toContain(query), {
        timeout: 2000,
      });
      expect(await screen.findByText("Wireless Headphones")).toBeInTheDocument();
    }
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
