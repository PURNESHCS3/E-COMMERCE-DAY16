import { expect, test, type Page } from "@playwright/test";
import type { Cart, Order, Product, User } from "../src/types";

const apiBase = "http://127.0.0.1:8000/api";
const product: Product = {
  id: 1,
  name: "E2E Headphones",
  description: "Comfortable wireless headphones",
  price: 1250,
  stock: 5,
  image_url: null,
  is_active: true,
};
const secondProduct: Product = {
  ...product,
  id: 2,
  name: "Everyday Backpack",
  description: "A lightweight travel bag",
  price: 1800,
  stock: 0,
};
const customer: User = {
  id: 42,
  name: "Playwright Shopper",
  email: "shopper@example.com",
  is_active: true,
  role: "customer",
};
const admin: User = { ...customer, role: "admin" };
const order: Order = {
  id: 101,
  user_id: customer.id,
  total_amount: product.price,
  delivery_address: "123 Test Street, Test City",
  status: "confirmed",
  items: [
    {
      id: 201,
      product_id: product.id,
      quantity: 1,
      price: product.price,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        image_url: product.image_url,
      },
    },
  ],
};

async function seedSession(page: Page, user: User = customer) {
  let nextMessageId = 501;
  await page.routeWebSocket(`${apiBase.replace(/^http/, "ws")}/ws`, (socket) => {
    socket.onMessage((message) => {
      const event = JSON.parse(String(message)) as {
        type?: string;
        body?: string;
        user_id?: number;
      };
      if (event.type === "auth") socket.send(JSON.stringify({ type: "auth.ok" }));
      if (event.type === "chat.send" && event.body) {
        socket.send(JSON.stringify({
          type: "chat.message",
          message: {
            id: nextMessageId++,
            user_id: event.user_id ?? user.id,
            sender_id: user.id,
            sender_name: user.name,
            sender_role: user.role,
            body: event.body,
            created_at: new Date().toISOString(),
          },
        }));
      }
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "e2e-access-token");
  });
  await page.route(`${apiBase}/auth/me`, (route) =>
    route.fulfill({ json: user })
  );
  await page.route(`${apiBase}/cart/`, (route) =>
    route.fulfill({ json: { cart: {} } })
  );
}

test.describe("storefront and protected pages", () => {
  test("catalog searches products and switches the theme", async ({ page }) => {
    await page.route(`${apiBase}/products/**`, (route) =>
      route.fulfill({ json: [product, secondProduct] })
    );
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /find your next product/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
    await expect(page.getByRole("heading", { name: secondProduct.name })).toBeVisible();
    await page.getByRole("textbox", { name: "Search products" }).fill("backpack");

    await expect(page.getByRole("heading", { name: secondProduct.name })).toBeVisible();
    await expect(page.getByRole("heading", { name: product.name })).toHaveCount(0);
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("product details show price, stock, and description", async ({ page }) => {
    await page.route(`${apiBase}/products/1`, (route) =>
      route.fulfill({ json: product })
    );
    await page.goto("/products/1");

    await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
    await expect(page.getByText(product.description!)).toBeVisible();
    await expect(page.getByText("₹1250.00")).toBeVisible();
    await expect(page.getByText("5 units available")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();
  });

  test("registration submits account details and returns to login", async ({ page }) => {
    let submittedBody: unknown;
    await page.route(`${apiBase}/auth/register`, async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({ json: { message: "User registered successfully" } });
    });
    await page.goto("/register");

    await page.getByPlaceholder("Full name").fill("New Shopper");
    await page.getByPlaceholder("Email").fill("new@example.com");
    await page.getByPlaceholder("Password (minimum 6 characters)").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Register" }).click();

    await expect(page).toHaveURL(/\/login$/);
    expect(submittedBody).toEqual({
      name: "New Shopper",
      email: "new@example.com",
      password: "secret123",
    });
  });

  test("account page displays the signed-in user's profile", async ({ page }) => {
    await seedSession(page);
    await page.goto("/account");

    await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible();
    await expect(page.getByText(`Name: ${customer.name}`)).toBeVisible();
    await expect(page.getByText(`Email: ${customer.email}`)).toBeVisible();
    await expect(page.getByText("Role: customer")).toBeVisible();
  });

  test("customer support sends and displays a live chat message", async ({ page }) => {
    await seedSession(page);
    await page.route(`${apiBase}/chat/messages*`, (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/support");

    await expect(page.getByRole("heading", { name: "Customer support" })).toBeVisible();
    await expect(page.getByText("Real-time connection: connected")).toBeVisible();
    await page.getByRole("textbox", { name: "Message" }).fill("Can you help me?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Can you help me?")).toBeVisible();
  });

  test("cart displays its products and removes an item", async ({ page }) => {
    await seedSession(page);
    let cart: Cart = { "1": 1 };
    await page.route(`${apiBase}/cart/`, (route) =>
      route.fulfill({ json: { cart } })
    );
    await page.route(`${apiBase}/products/1`, (route) =>
      route.fulfill({ json: product })
    );
    await page.route(`${apiBase}/cart/1`, async (route) => {
      cart = {};
      await route.fulfill({ json: { message: "Product removed", cart } });
    });
    await page.goto("/cart");

    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
    await expect(page.getByText(product.name)).toBeVisible();
    await expect(page.getByText("Total ₹1250.00")).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("checkout validates the delivery address before placing an order", async ({ page }) => {
    await seedSession(page);
    let orderRequests = 0;
    await page.route(`${apiBase}/cart/`, (route) =>
      route.fulfill({ json: { cart: { "1": 1 } } })
    );
    await page.route(`${apiBase}/products/1`, (route) =>
      route.fulfill({ json: product })
    );
    await page.route(`${apiBase}/orders/`, async (route) => {
      orderRequests += 1;
      await route.fulfill({ json: order });
    });
    await page.goto("/checkout");

    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByText("Enter a delivery address with at least 10 characters.")).toBeVisible();
    await page.getByLabel(/Delivery address/).fill("Too short");
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.getByText("Enter a delivery address with at least 10 characters.")).toBeVisible();
    expect(orderRequests).toBe(0);
  });

  test("checkout places an order and opens its details", async ({ page }) => {
    await seedSession(page);
    let submittedAddress = "";
    await page.route(`${apiBase}/cart/`, (route) =>
      route.fulfill({ json: { cart: { "1": 1 } } })
    );
    await page.route(`${apiBase}/products/1`, (route) =>
      route.fulfill({ json: product })
    );
    await page.route(`${apiBase}/orders/`, async (route) => {
      const body = route.request().postDataJSON() as { delivery_address: string };
      submittedAddress = body.delivery_address;
      await route.fulfill({
        json: {
          message: "Order placed successfully",
          order_id: order.id,
          total_amount: order.total_amount,
          delivery_address: submittedAddress,
          status: order.status,
        },
      });
    });
    await page.route(`${apiBase}/orders/101`, (route) =>
      route.fulfill({ json: { ...order, delivery_address: submittedAddress } })
    );
    await page.goto("/checkout");
    await page.getByLabel(/Delivery address/).fill(order.delivery_address!);
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(page).toHaveURL(/\/orders\/101$/);
    await expect(page.getByRole("heading", { name: "Order #101" })).toBeVisible();
    await expect(page.getByText(product.name)).toBeVisible();
    await expect(page.getByText("1 × ₹1250.00")).toBeVisible();
    expect(submittedAddress).toBe(order.delivery_address);
  });

  test("order history opens a previous order's details", async ({ page }) => {
    await seedSession(page);
    await page.route(`${apiBase}/orders/`, (route) =>
      route.fulfill({ json: [order] })
    );
    await page.route(`${apiBase}/orders/101`, (route) =>
      route.fulfill({ json: order })
    );
    await page.goto("/orders");

    await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
    await expect(page.getByText("Status: confirmed")).toBeVisible();
    await page.getByRole("link", { name: "Order #101" }).click();
    await expect(page).toHaveURL(/\/orders\/101$/);
    await expect(page.getByText("Deliver to: 123 Test Street, Test City")).toBeVisible();
    await expect(page.getByText(product.name)).toBeVisible();
    await expect(page.getByText("1 × ₹1250.00")).toBeVisible();
  });

  test("admin creates a product and can open order management", async ({ page }) => {
    await seedSession(page, admin);
    let products = [product];
    await page.route(`${apiBase}/products/`, async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as Omit<Product, "id" | "is_active">;
        const created: Product = { ...body, id: 3, is_active: true };
        products = [...products, created];
        await route.fulfill({ json: created });
        return;
      }
      await route.fulfill({ json: products });
    });
    await page.route(`${apiBase}/orders/`, (route) =>
      route.fulfill({ json: [order] })
    );
    await page.goto("/admin/products");

    await expect(page.getByRole("heading", { name: "Product management" })).toBeVisible();
    await page.getByLabel("Name").fill("New E2E Product");
    await page.getByLabel("Price").fill("2000");
    await page.getByLabel("Stock").fill("3");
    await page.getByLabel("Description").fill("A newly created test product");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByRole("status")).toHaveText("Product created.");
    await expect(page.getByRole("cell", { name: /New E2E Product/ })).toBeVisible();
    await page.getByRole("link", { name: "View all orders" }).click();
    await expect(page).toHaveURL(/\/admin\/orders$/);
    await expect(page.getByRole("heading", { name: "All orders" })).toBeVisible();
    await expect(page.getByText("Customer #42")).toBeVisible();
  });

  test("admin cancels a confirmed order", async ({ page }) => {
    await seedSession(page, admin);
    let currentOrder = order;
    page.on("dialog", (dialog) => dialog.accept());
    await page.route(`${apiBase}/orders/`, (route) =>
      route.fulfill({ json: [currentOrder] })
    );
    await page.route(`${apiBase}/orders/101/cancel`, async (route) => {
      currentOrder = { ...currentOrder, status: "cancelled" };
      await route.fulfill({
        json: {
          message: "Order cancelled successfully",
          order_id: currentOrder.id,
          status: currentOrder.status,
        },
      });
    });
    await page.goto("/admin/orders");

    await expect(page.getByRole("heading", { name: "All orders" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel order" }).click();
    await expect(page.getByText("Order #101 was cancelled.", { exact: true })).toBeVisible();
    await expect(page.getByText("Status: cancelled")).toBeVisible();
  });
});
