import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { Cart, Product, User } from "../types";

export const testProduct: Product = {
  id: 1,
  name: "Test Headphones",
  description: "Wireless audio",
  price: 1000,
  stock: 4,
  image_url: null,
  is_active: true,
};

export const testUser: User = {
  id: 7,
  name: "Test Shopper",
  email: "shopper@example.com",
  is_active: true,
  role: "customer",
};

export const testCart: Cart = { "1": 1 };

export const server = setupServer(
  http.get("http://127.0.0.1:8000/api/products/", () =>
    HttpResponse.json([testProduct])
  ),
  http.get("http://127.0.0.1:8000/api/products/1", () =>
    HttpResponse.json(testProduct)
  ),
  http.get("http://127.0.0.1:8000/api/auth/me", () =>
    HttpResponse.json(testUser)
  ),
  http.get("http://127.0.0.1:8000/api/cart/", () =>
    HttpResponse.json({ cart: testCart })
  ),
  http.delete("http://127.0.0.1:8000/api/cart/1", () =>
    HttpResponse.json({ message: "Product removed from cart", cart: {} })
  )
);
