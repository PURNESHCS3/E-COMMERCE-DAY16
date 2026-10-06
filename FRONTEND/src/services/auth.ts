import api from "./api";
import type { LoginRequest, RegisterRequest, TokenResponse, User } from "../types";

export const registerUser = async (payload: RegisterRequest): Promise<User> => {
  const { data } = await api.post<User>("/auth/register", payload);
  return data;
};

export const loginUser = async (payload: LoginRequest): Promise<TokenResponse> => {
  const { data } = await api.post<TokenResponse>("/auth/login", payload);
  return data;
};

export const getCurrentUser = async (): Promise<User> => {
  const { data } = await api.get<User>("/auth/me");
  return data;
};
