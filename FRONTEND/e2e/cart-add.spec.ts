import { expect, test } from "@playwright/test";
import type { Cart, Product, User } from "../src/types";

const apiBase = "http://127.0.0.1:8000/api";
const product: Product = {
  id: 7,
  name: "Mocked Cart Backpack",
  description: "A lightweight backpack for everyday use",
  price: 1800,
  stock: 4,
  image_url: null,
  is_active: true,
};
const user: User = {
  id: 42,
  name: "Playwright Shopper",
  email: "shopper@example.com",
  is_active: true,
  role: "customer",
};

test("adds a product to the cart using mocked API responses", async ({ page }) => {
  let cart: Cart = {};
  let addRequestBody: unknown;

  await page.addInitScript(() => {
    localStorage.setItem("access_token", "e2e-access-token");
  });

  await page.route(`${apiBase}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    if (pathname === "/api/auth/me" && method === "GET") {
      await route.fulfill({ json: user });
    } else if (pathname === "/api/products/7" && method === "GET") {
      await route.fulfill({ json: product });
    } else if (pathname === "/api/cart/" && method === "GET") {
      await route.fulfill({ json: { cart } });
    } else if (pathname === "/api/cart/add" && method === "POST") {
      addRequestBody = route.request().postDataJSON();
      cart = { [String(product.id)]: 1 };
      await route.fulfill({
        json: { message: "Product added to cart", cart },
      });
    } else {
      await route.fulfill({ status: 404, json: { detail: "Not mocked" } });
    }
  });

  await page.goto("/products/7");
  await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();

  await expect(page.getByRole("status")).toHaveText("Added to cart.");
  await expect(page.getByRole("link", { name: "Cart (1)" })).toBeVisible();
  expect(addRequestBody).toEqual({ product_id: product.id, quantity: 1 });

  await page.getByRole("link", { name: "Cart (1)" }).click();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();
  await expect(
    page.getByText(`1 × ₹${product.price.toFixed(2)}`)
  ).toBeVisible();
});
