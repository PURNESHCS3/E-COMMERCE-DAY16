import api from "./api";
import type { LoginRequest, RegisterRequest, TokenResponse, User } from "../types";

export const refreshSessionTokens = async (): Promise<TokenResponse> => {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) throw new Error("No refresh token is available.");

  const { data } = await api.post<TokenResponse>("/auth/refresh", {
    refresh_token: refreshToken,
  });
  localStorage.setItem("access_token", data.access_token);
  localStorage.setItem("refresh_token", data.refresh_token);
  return data;
};

export const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  await api.post("/auth/logout", { refresh_token: refreshToken });
};

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
