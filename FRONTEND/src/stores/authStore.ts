import { create } from "zustand";
import { useCartStore } from "./cartStore";
import { getCurrentUser, loginUser, revokeRefreshToken } from "../services/auth";
import { queryClient } from "../queryClient";
import { useNotificationStore } from "./notificationStore";
import { clearAIChatHistory } from "../services/ai";
import type { User } from "../types";

export interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  login: async (email, password) => {
    queryClient.removeQueries({ queryKey: ["cart"] });
    queryClient.removeQueries({ queryKey: ["chat"] });
    useCartStore.getState().clear();
    const tokens = await loginUser({ email, password });
    clearAIChatHistory();
    localStorage.setItem("access_token", tokens.access_token);
    localStorage.setItem("refresh_token", tokens.refresh_token);

    try {
      const user = await getCurrentUser();
      set({ user });
      return user;
    } catch (error) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      queryClient.removeQueries({ queryKey: ["cart"] });
      queryClient.removeQueries({ queryKey: ["chat"] });
      useCartStore.getState().clear();
      throw error;
    }
  },
  logout: () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      void revokeRefreshToken(refreshToken).catch((error: unknown) => {
        console.error("Unable to revoke the refresh token during logout.", error);
      });
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    clearAIChatHistory();
    queryClient.removeQueries({ queryKey: ["cart"] });
    useCartStore.getState().clear();
    useNotificationStore.getState().clear();
    set({ user: null });
  },
}));
