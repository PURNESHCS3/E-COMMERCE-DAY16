import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Menu,
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
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import NotificationsMenu from "./NotificationsMenu";
import { useAuth } from "../hooks/useAuth";
import { useCartQuery } from "../hooks/useCart";
import { useCartStore } from "../stores/cartStore";
import { useThemeStore } from "../stores/themeStore";
import AIChatWidget from "./AIChatWidget";
import AIChatErrorBoundary from "./AIChatErrorBoundary";

export default function Navbar() {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const cartQuantities = useCartStore((state) => state.quantities);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const [mobileOpen, setMobileOpen] = useState(false);
  const cartCount = Object.values(cartQuantities).reduce<number>((sum, quantity) => sum + quantity, 0);
  useCartQuery(Boolean(user && user.role !== "admin"));
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    setMobileOpen(false);
    navigate("/login");
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `site-nav-link flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-emerald-50 text-emerald-900"
        : "text-slate-600 hover:bg-stone-100 hover:text-slate-950"
    }`;

  const navigationLinks = (mobile = false) => (
    <>
      <NavLink to="/" end className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
        <PackageSearch className="h-4 w-4" aria-hidden="true" /> Products
      </NavLink>
      {user?.role === "admin" ? (
        <>
          <NavLink to="/admin/products" className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
            <PackageSearch className="h-4 w-4" aria-hidden="true" /> Manage products
          </NavLink>
          <NavLink to="/admin/orders" className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" /> All orders
          </NavLink>
          <NavLink to="/support" className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Support inbox
          </NavLink>
          <NavLink to="/jobs" className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
            <ListTodo className="h-4 w-4" aria-hidden="true" /> Jobs
          </NavLink>
        </>
      ) : user ? (
        <>
          <NavLink to="/cart" className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            Cart{cartCount > 0 ? ` (${cartCount})` : ""}
          </NavLink>
          <NavLink to="/orders" className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" /> Orders
          </NavLink>
          <NavLink to="/support" className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Support
          </NavLink>
          <NavLink to="/jobs" className={navLinkClass} onClick={() => mobile && setMobileOpen(false)}>
            <ListTodo className="h-4 w-4" aria-hidden="true" /> Jobs
          </NavLink>
        </>
      ) : null}
    </>
  );

  return (
    <>
      <div className="bg-emerald-950 px-4 py-2 text-center text-[11px] font-medium tracking-[0.14em] text-emerald-50 sm:text-xs">
        GOOD FINDS. EVERYDAY FAVORITES.
      </div>
      <header className="site-navbar sticky top-0 z-20 border-b border-stone-200/80 bg-[#fffefa]/95 shadow-[0_4px_20px_rgb(26_40_30_/_3%)] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="group flex shrink-0 items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-900 text-white shadow-sm transition group-hover:-rotate-6">
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-[21px] font-bold tracking-tight text-slate-950">
              Shop<span className="text-emerald-800">Hub</span>
            </span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-0.5 lg:flex">
            {navigationLinks()}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            {user && <div className="hidden lg:block"><NotificationsMenu /></div>}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="navbar-utility-action rounded-full p-2.5 text-slate-600 transition hover:bg-stone-100 hover:text-slate-950"
            >
              {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            {user ? (
              <div className="hidden items-center gap-2 lg:flex">
                <Link to="/account" className="navbar-utility-action flex max-w-36 items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-stone-100">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8eee5] text-xs font-semibold text-emerald-900">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{user.name}</span>
                </Link>
                <Button size="sm" variant="outline" onClick={handleLogout} className="rounded-full">
                  <LogOut className="mr-1.5 h-4 w-4" /> Logout
                </Button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 lg:flex">
                <Link to="/login"><Button size="sm" variant="outline" className="rounded-full">Login</Button></Link>
                <Link to="/register"><Button size="sm" className="rounded-full">Register</Button></Link>
              </div>
            )}
            <button
              type="button"
              aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileOpen((open) => !open)}
              className="navbar-utility-action rounded-full p-2.5 text-slate-700 transition hover:bg-stone-100 lg:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="border-t border-stone-200 bg-[#fffefa] px-4 py-3 shadow-lg lg:hidden sm:px-6"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {navigationLinks(true)}
              {user ? (
                <>
                  <NavLink to="/account" className={navLinkClass} onClick={() => setMobileOpen(false)}>
                    <User className="h-4 w-4" /> {user.name}
                  </NavLink>
                  <div className="flex items-center justify-between rounded-full px-3.5 py-2">
                    <span className="text-sm font-medium text-slate-600">Notifications</span>
                    <NotificationsMenu />
                  </div>
                  <Button size="sm" variant="outline" onClick={handleLogout} className="mt-1 w-full justify-center rounded-full">
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </Button>
                </>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Link to="/login" onClick={() => setMobileOpen(false)}>
                    <Button size="sm" variant="outline" className="w-full rounded-full">Login</Button>
                  </Link>
                  <Link to="/register" onClick={() => setMobileOpen(false)}>
                    <Button size="sm" className="w-full rounded-full">Register</Button>
                  </Link>
                </div>
              )}
            </div>
          </nav>
        )}
      </header>
      {user && (
        <AIChatErrorBoundary>
          <AIChatWidget />
        </AIChatErrorBoundary>
      )}
    </>
  );
}