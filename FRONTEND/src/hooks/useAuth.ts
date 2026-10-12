import { useAuthStore, type AuthState } from "../stores/authStore";

export const useAuth = <T,>(selector: (state: AuthState) => T): T =>
  useAuthStore(selector);
