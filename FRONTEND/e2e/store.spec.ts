import { expect, test } from "@playwright/test";
import type { Cart, Product, User } from "../src/types";

const product: Product = {
  id: 1,
  name: "E2E Headphones",
  description: "Comfortable wireless headphones",
  price: 1250,
  stock: 5,
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

test("shopper logs in, adds a product, and checks out", async ({ page }) => {
  let cart: Cart = {};

  await page.route("http://127.0.0.1:8000/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    if (pathname === "/api/products/" && method === "GET") {
      await route.fulfill({ json: [product] });
    } else if (pathname === "/api/products/1" && method === "GET") {
      await route.fulfill({ json: product });
    } else if (pathname === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        json: {
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          token_type: "bearer",
        },
      });
    } else if (pathname === "/api/auth/me" && method === "GET") {
      await route.fulfill({ json: user });
    } else if (pathname === "/api/cart/" && method === "GET") {
      await route.fulfill({ json: { cart } });
    } else if (pathname === "/api/cart/add" && method === "POST") {
      cart = { "1": (cart["1"] || 0) + 1 };
      await route.fulfill({
        json: { message: "Product added to cart", cart },
      });
    } else if (pathname === "/api/orders/" && method === "POST") {
      cart = {};
      await route.fulfill({
        json: {
          message: "Order placed successfully",
          order_id: 101,
          total_amount: product.price,
          delivery_address: "123 Test Street, Test City",
          status: "confirmed",
        },
      });
    } else {
      await route.fulfill({ status: 404, json: { detail: "Not mocked" } });
    }
  });

  await page.goto("/");
  await page.getByRole("link", { name: "View Details" }).click();
  await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill("secret123");
  await page.locator("form").getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/products\/1$/);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByRole("status")).toHaveText("Added to cart.");
  await page.getByRole("link", { name: /Cart/ }).click();

  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await expect(page.getByText(`Total ₹${product.price.toFixed(2)}`)).toBeVisible();
  await page.getByLabel(/Delivery address/).fill("123 Test Street, Test City");
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page.getByRole("status")).toContainText("Order #101 placed.");
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
});
