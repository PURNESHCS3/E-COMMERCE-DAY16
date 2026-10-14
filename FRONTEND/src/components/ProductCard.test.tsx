import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { testProduct } from "../test/server";
import ProductCard from "./ProductCard";

describe("ProductCard", () => {
  it("shows the product description in the listing card", () => {
    render(
      <MemoryRouter>
        <ProductCard
          product={{
            ...testProduct,
            description: "Product listing description.",
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: testProduct.name })).not.toHaveClass("text-lg");
    expect(screen.getByText("Product listing description.")).toBeInTheDocument();
  });

  it("fills the product image frame without padding", () => {
    render(
      <MemoryRouter>
        <ProductCard
          product={{ ...testProduct, image_url: "uploads/headphones.jpg" }}
        />
      </MemoryRouter>,
    );

    const image = screen.getByRole("img", { name: testProduct.name });
    expect(image).toHaveAttribute(
      "src",
      "http://127.0.0.1:8000/uploads/headphones.jpg",
    );
    expect(image).toHaveClass("object-cover");
    expect(image).not.toHaveClass("p-4", "p-5");
  });

  it("shows a clear placeholder when an image is missing or fails to load", () => {
    const { rerender } = render(
      <MemoryRouter>
        <ProductCard product={testProduct} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("img", {
      name: `${testProduct.name} image unavailable`,
    })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ProductCard
          product={{ ...testProduct, image_url: "https://cdn.example.com/item.jpg" }}
        />
      </MemoryRouter>,
    );
    fireEvent.error(screen.getByRole("img", { name: testProduct.name }));

    expect(screen.getByRole("img", {
      name: `${testProduct.name} image unavailable`,
    })).toBeInTheDocument();
  });
});
