import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import { useThemeStore } from "./stores/themeStore";

const Products = lazy(() => import("./pages/Products"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Account = lazy(() => import("./pages/Account"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Orders = lazy(() => import("./pages/Orders"));
const AdminProducts = lazy(() => import("./pages/AdminProducts"));

export default function App() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <>
      <Navbar />
      <Suspense fallback={<div className="py-16 text-center text-slate-500">Loading page...</div>}>
        <Routes>
          <Route path="/" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetails />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/account" element={<Account />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<Orders />} />
          </Route>

          <Route element={<ProtectedRoute requiredRole="admin" />}>
            <Route path="/admin/products" element={<AdminProducts />} />
            <Route path="/admin/orders" element={<Orders />} />
            <Route path="/admin/orders/:id" element={<Orders />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}