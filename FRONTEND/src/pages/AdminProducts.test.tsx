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
      features: "Noise cancellation",
      category: "Electronics",
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
    fireEvent.change(screen.getByLabelText("Features"), {
      target: { value: "Noise cancellation" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Electronics" },
    });
    fireEvent.change(screen.getByLabelText("Or use a public image URL"), {
      target: { value: imageUrl },
    });

    fireEvent.load(await screen.findByAltText("Public image URL preview"));
    fireEvent.click(screen.getByRole("button", { name: "Use image URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(submittedPayload?.image_url).toBe(imageUrl);
      expect(submittedPayload?.features).toBe("Noise cancellation");
      expect(submittedPayload?.category).toBe("Electronics");
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Product created.");
  });
});

describe("admin product form", () => {
  it("requires the admin to select a category manually", async () => {
    renderAdminProducts();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Wireless headphones" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "49.99" },
    });
    fireEvent.change(screen.getByLabelText("Stock"), {
      target: { value: "4" },
    });
    const category = screen.getByRole("combobox");
    expect(category).toBeRequired();
    const form = screen.getByRole("button", { name: "Create product" }).closest("form");
    if (!form) throw new Error("Product form was not rendered.");
    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a product category.");
  });

  it("generates a moderated description from the product name and features", async () => {
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/product-description", async ({ request }) => {
        requestBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
          description: "Comfortable wireless headphones for everyday listening.",
          provider: "groq",
          cached: false,
        });
      }),
    );
    renderAdminProducts();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Wireless headphones" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "49.99" },
    });
    fireEvent.change(screen.getByLabelText("Features"), {
      target: { value: "Bluetooth audio\nWireless design" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Generate with AI" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Description")).toHaveValue(
        "Comfortable wireless headphones for everyday listening.",
      );
    });
    expect(requestBody).toEqual({
      product_name: "Wireless headphones",
      price: 49.99,
      features: "Bluetooth audio\nWireless design",
    });
    expect(screen.getByText(/passed content moderation/)).toBeInTheDocument();
  });

  it("does not generate a description from numeric-only features", async () => {
    let descriptionRequestSent = false;
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/product-description", () => {
        descriptionRequestSent = true;
        return HttpResponse.json({
          description: "Generated description",
          provider: "groq",
          cached: false,
        });
      }),
    );
    renderAdminProducts();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Wireless headphones" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "49.99" },
    });
    fireEvent.change(screen.getByLabelText("Features"), {
      target: { value: "40 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate with AI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add at least one descriptive product feature",
    );
    expect(descriptionRequestSent).toBe(false);
  });

  it("shows a moderation rejection so an administrator can revise the description", async () => {
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/moderate", () =>
        HttpResponse.json({
          approved: false,
          reason: "Contains unsafe language.",
          provider: "gemini",
          cached: false,
        }),
      ),
    );
    renderAdminProducts();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Wireless headphones" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "A description that needs review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review with AI" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Contains unsafe language.");
    expect(screen.getByText(/Description needs revision/)).toBeInTheDocument();
  });

  it("does not save a product when AI moderation rejects its description", async () => {
    let productSaveRequested = false;
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/moderate", () =>
        HttpResponse.json({
          approved: false,
          reason: "Contains unsafe language.",
          provider: "groq",
          cached: false,
        }),
      ),
      http.post("http://127.0.0.1:8000/api/products/", () => {
        productSaveRequested = true;
        return HttpResponse.json(testProduct);
      }),
    );
    renderAdminProducts();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Wireless headphones" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "49.99" },
    });
    fireEvent.change(screen.getByLabelText("Stock"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "A description that needs review" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Electronics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create product" }));

    expect(await screen.findByText(/The description needs revision/)).toBeInTheDocument();
    expect(productSaveRequested).toBe(false);
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
