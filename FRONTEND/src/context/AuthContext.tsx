import { useEffect, type PropsWithChildren } from "react";
import { getCurrentUser } from "../services/auth";
import { useAuthStore } from "../stores/authStore";

export function AuthProvider({ children }: PropsWithChildren) {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!localStorage.getItem("access_token")) {
        setLoading(false);
        return;
      }
      try {
        const currentUser = await getCurrentUser();
        if (active) setUser(currentUser);
      } catch {
        if (active) logout();
      } finally {
        if (active) setLoading(false);
      }
    };

    const handleLogout = () => {
      logout();
      setLoading(false);
    };
    window.addEventListener("auth:logout", handleLogout);
    bootstrap();

    return () => {
      active = false;
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, [logout, setLoading, setUser]);

  return children;
}