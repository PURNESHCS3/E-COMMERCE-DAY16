import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { Cart, Product, User } from "../types";

export const testProduct: Product = {
  id: 1,
  name: "Test Headphones",
  description: "Wireless audio",
  features: "Bluetooth connectivity",
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
  http.get("http://127.0.0.1:8000/api/products/search", ({ request }) => {
    const query = new URL(request.url).searchParams.get("q");
    return HttpResponse.json(query === "missing" ? [] : [testProduct]);
  }),
  http.get("http://127.0.0.1:8000/api/products/semantic-search", ({ request }) => {
    const query = new URL(request.url).searchParams.get("q");
    return HttpResponse.json(query === "missing" ? [] : [testProduct]);
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
    ])
  ),
  http.get("http://127.0.0.1:8000/api/products/1", () =>
    HttpResponse.json(testProduct)
  ),
  http.get("http://127.0.0.1:8000/api/auth/me", () =>
    HttpResponse.json(testUser)
  ),
  http.get("http://127.0.0.1:8000/api/ai/providers", () =>
    HttpResponse.json({ providers: [] })
  ),
  http.get("http://127.0.0.1:8000/api/ai/usage", () =>
    HttpResponse.json({
      date: "2026-10-13",
      daily_limit: 100,
      total_requests: 0,
      remaining_requests: 100,
      provider_requests: { groq: 0, gemini: 0 },
      estimated_token_limit: 300000,
      estimated_tokens_used: 0,
      estimated_tokens_remaining: 300000,
      details: [],
    })
  ),
  http.post("http://127.0.0.1:8000/api/ai/product-description", () =>
    HttpResponse.json({
      description: "A reliable product for everyday use.",
      provider: "groq",
      cached: false,
    })
  ),
  http.post("http://127.0.0.1:8000/api/ai/moderate", () =>
    HttpResponse.json({
      approved: true,
      reason: "Appropriate product description.",
      provider: "groq",
      cached: false,
    })
  ),
  http.post("http://127.0.0.1:8000/api/ai/agent", () =>
    HttpResponse.json({
      answer: "A matching product is available.",
      provider: "groq",
      sources: [],
      tool_calls: ["search_catalog"],
      cached: false,
    })
  ),
  http.get("http://127.0.0.1:8000/api/cart/", () =>
    HttpResponse.json({ cart: testCart })
  ),
  http.delete("http://127.0.0.1:8000/api/cart/1", () =>
    HttpResponse.json({ message: "Product removed from cart", cart: {} })
  )
);
