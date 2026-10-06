import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, User, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "../context/AuthContext";
import { useCartQuery } from "../hooks/useCart";
import { useCartStore } from "../stores/cartStore";

export default function Navbar() {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const cartQuantities = useCartStore((state) => state.quantities);
  const cartCount = Object.values(cartQuantities).reduce<number>((sum, quantity) => sum + quantity, 0);
  useCartQuery(Boolean(user && user.role !== "admin"));
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold">
          <ShoppingBag className="h-6 w-6" />
          ShopHub
        </Link>

        <nav className="flex items-center gap-2">
          <Link to="/" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">Products</Link>
          {user ? (
            <>
              {user.role === "admin" ? (
                <>
                  <Link to="/admin/products" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">Manage products</Link>
                  <Link to="/admin/orders" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">All orders</Link>
                </>
              ) : (
                <>
                  <Link to="/cart" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
                    Cart{cartCount > 0 ? ` (${cartCount})` : ""}
                  </Link>
                  <Link to="/orders" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">Orders</Link>
                </>
              )}
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
  );
}