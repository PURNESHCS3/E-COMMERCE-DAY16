import api from "./api";
import type {
  Product,
  ProductPageParams,
  ProductPayload,
  UploadedImageResponse,
} from "../types";

export const getProducts = async (
  { skip, limit }: ProductPageParams = {}
): Promise<Product[]> => {
  const { data } = await api.get<Product[]>("/products/", {
    params: { skip, limit },
  });
  return data;
};

export const getProduct = async (id: string | number): Promise<Product> => {
  const { data } = await api.get<Product>(`/products/${id}`);
  return data;
};

export const searchProducts = async (
  query: string,
): Promise<Product[]> => {
  const { data } = await api.get<Product[]>("/products/search", {
    params: { q: query, limit: 100 },
  });
  return data;
};

export const createProduct = async (payload: ProductPayload): Promise<Product> => {
  const { data } = await api.post<Product>("/products/", payload);
  return data;
};

export const updateProduct = async (
  id: number,
  payload: ProductPayload
): Promise<Product> => {
  const { data } = await api.put<Product>(`/products/${id}`, payload);
  return data;
};

export const deleteProduct = async (id: number): Promise<{ message: string }> => {
  const { data } = await api.delete<{ message: string }>(`/products/${id}`);
  return data;
};

export const uploadProductImage = async (
  id: number,
  file: File
): Promise<UploadedImageResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<UploadedImageResponse>(
    `/products/${id}/image`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
};
