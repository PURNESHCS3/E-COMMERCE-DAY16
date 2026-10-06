export interface User {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  role: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
}

export interface ProductPayload {
  name: string;
  description: string;
  price: number;
  stock: number;
}

export interface ProductPageParams {
  skip?: number;
  limit?: number;
}

export type Cart = Record<string, number>;

export interface CartResponse {
  message?: string;
  cart: Cart;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  id: number;
  product_id: number;
  quantity: number;
  price: number;
}

export interface Order {
  id: number;
  user_id: number;
  total_amount: number;
  delivery_address: string | null;
  status: string;
  created_at?: string | null;
  items?: OrderItem[];
}

export interface CreateOrderResponse {
  message: string;
  order_id: number;
  total_amount: number;
  delivery_address: string;
  status: string;
}

export interface CancelOrderResponse {
  message: string;
  order_id: number;
  status: string;
}

export interface UploadedImageResponse {
  image_url: string;
}

export interface ApiErrorResponse {
  detail?: string;
}

export type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
export type ButtonSize = "default" | "sm" | "lg";
