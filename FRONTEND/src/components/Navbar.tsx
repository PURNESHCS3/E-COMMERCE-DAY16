import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  User,
  LogOut,
  MessageCircle,
  Moon,
  Sun,
  PackageSearch,
  ShoppingCart,
  ClipboardList,
  ListTodo,
} from "lucide-react";
import { Button } from "./ui/button";
import NotificationsMenu from "./NotificationsMenu";
import { useAuth } from "../hooks/useAuth";
import { useCartQuery } from "../hooks/useCart";
import { useCartStore } from "../stores/cartStore";
import { useThemeStore } from "../stores/themeStore";
import AIChatWidget from "./AIChatWidget";

export default function Navbar() {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const cartQuantities = useCartStore((state) => state.quantities);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const cartCount = Object.values(cartQuantities).reduce<number>((sum, quantity) => sum + quantity, 0);
  useCartQuery(Boolean(user && user.role !== "admin"));
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
    <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold">
          <ShoppingBag className="h-6 w-6" />
          ShopHub
        </Link>

        <nav className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="rounded-lg p-2 hover:bg-slate-100"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Link to="/" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
            <PackageSearch className="h-4 w-4" aria-hidden="true" /> Products
          </Link>
          {user ? (
            <>
              {user.role === "admin" ? (
                <>
                  <Link to="/admin/products" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    <PackageSearch className="h-4 w-4" aria-hidden="true" /> Manage products
                  </Link>
                  <Link to="/admin/orders" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    <ClipboardList className="h-4 w-4" aria-hidden="true" /> All orders
                  </Link>
                  <Link to="/support" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> Support inbox
                  </Link>
                  <Link to="/jobs" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    <ListTodo className="h-4 w-4" aria-hidden="true" /> Jobs
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/cart" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    Cart{cartCount > 0 ? ` (${cartCount})` : ""}
                  </Link>
                  <Link to="/orders" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    <ClipboardList className="h-4 w-4" aria-hidden="true" /> Orders
                  </Link>
                  <Link to="/support" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> Support
                  </Link>
                  <Link to="/jobs" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    <ListTodo className="h-4 w-4" aria-hidden="true" /> Jobs
                  </Link>
                </>
              )}
              <NotificationsMenu />
              <Link to="/account" className="hidden items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 sm:flex">
                <User className="h-4 w-4" /> {user.name}
              </Link>
              <Button size="sm" variant="outline" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login"><Button size="sm" variant="outline">Login</Button></Link>
              <Link to="/register"><Button size="sm">Register</Button></Link>
            </>
          )}
        </nav>
      </div>
    </header>
    {user && <AIChatWidget />}
    </>
  );
}