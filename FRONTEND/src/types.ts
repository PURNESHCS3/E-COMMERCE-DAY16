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
  image_url?: string | null;
}

export interface ProductPageParams {
  skip?: number;
  limit?: number;
}

export interface BackgroundJobResult {
  order_id?: number;
  filename?: string;
  processed?: number;
  imported?: number;
  rejected?: number;
  errors?: string[];
  errors_truncated?: boolean;
}

export interface BackgroundJob {
  id: string;
  kind: "invoice" | "product_import";
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  result: BackgroundJobResult | null;
  error: string | null;
  created_at: string | null;
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
  product?: {
    id: number;
    name: string;
    description: string | null;
    image_url: string | null;
  } | null;
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

export interface UpdateOrderStatusResponse {
  message: string;
  order_id: number;
  status: string;
}

export interface ChatMessage {
  id: number;
  user_id: number;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  body: string;
  created_at: string;
}

export interface ChatConversation {
  user_id: number;
  user_name: string;
  last_message: string;
  created_at: string;
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIProductSource {
  product_id: number;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  relevance: number;
}

export interface AIProviderInfo {
  name: string;
  model: string;
}

export type ClientRealtimeEvent = {
  type: "chat.send";
  body: string;
  user_id?: number;
};

export type ServerRealtimeEvent =
  | { type: "auth.ok" }
  | { type: "order.updated"; order_id: number; user_id: number; status: string }
  | { type: "chat.message"; message: ChatMessage }
  | { type: "error"; message: string };

export interface UploadedImageResponse {
  image_url: string;
}

export interface ApiErrorResponse {
  detail?: string;
}

export type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
export type ButtonSize = "default" | "sm" | "lg";
