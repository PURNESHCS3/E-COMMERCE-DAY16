import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AdminProducts from "./AdminProducts";
import { server, testProduct } from "../test/server";
import type { Product } from "../types";

function renderAdminProducts() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminProducts />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("admin product image URLs", () => {
  it("saves a selected public HTTPS image URL with the product", async () => {
    const imageUrl = "https://cdn.example.org/headphones.jpg";
    const createdProduct: Product = {
      ...testProduct,
      id: 2,
      name: "URL image headphones",
      image_url: imageUrl,
    };
    let submittedPayload: Record<string, unknown> | undefined;

    server.use(
      http.post("http://127.0.0.1:8000/api/products/", async ({ request }) => {
        submittedPayload = await request.json() as Record<string, unknown>;
        return HttpResponse.json(createdProduct);
      })
    );

    renderAdminProducts();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "URL image headphones" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "25.50" },
    });
    fireEvent.change(screen.getByLabelText("Stock"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Or use a public image URL"), {
      target: { value: imageUrl },
    });

    fireEvent.load(await screen.findByAltText("Public image URL preview"));
    fireEvent.click(screen.getByRole("button", { name: "Use image URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(submittedPayload?.image_url).toBe(imageUrl);
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Product created.");
  });
});

describe("admin product search", () => {
  it("uses the storefront partial and typo-tolerant product search", async () => {
    const wirelessHeadphones: Product = {
      ...testProduct,
      id: 3,
      name: "Wireless Headphones",
    };
    const searchedQueries: string[] = [];

    server.use(
      http.get("http://127.0.0.1:8000/api/products/search", ({ request }) => {
        const query = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
        searchedQueries.push(query);
        return HttpResponse.json(
          ["w", "wi", "wire", "wireless", "wirless"].includes(query)
            ? [wirelessHeadphones]
            : []
        );
      })
    );

    renderAdminProducts();
    await screen.findByText(testProduct.name);
    const search = screen.getByRole("textbox", { name: "Search manage products" });

    for (const query of ["w", "wi", "wire", "wireless", "wirless"]) {
      fireEvent.change(search, { target: { value: query } });
      await waitFor(() => expect(searchedQueries).toContain(query), {
        timeout: 2000,
      });
      expect(await screen.findByText("Wireless Headphones")).toBeInTheDocument();
    }
  });
});
