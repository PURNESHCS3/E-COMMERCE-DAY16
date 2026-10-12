import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { getProduct } from "../services/products";
import { API_URL } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { useAddToCart } from "../hooks/useCart";
import { getApiErrorMessage } from "../lib/apiError";
import type { Product } from "../types";

function imageSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_URL.replace("/api", "")}${url}`;
}

export default function ProductDetails() {
  const { id } = useParams();
  const {
    data: product,
    error,
    isPending,
  } = useQuery({
    queryKey: ["products", "detail", id],
    queryFn: () => getProduct(id!),
    enabled: Boolean(id),
  });
  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-4xl px-4 py-16 text-center text-red-600">
        {getApiErrorMessage(error, "Product not found.")}
      </div>
    );
  }
  if (isPending || !product) return <div className="py-16 text-center text-slate-500">Loading product...</div>;

  return <ProductDetailsContent id={id ?? ""} product={product} />;
}

interface ProductDetailsContentProps {
  id: string;
  product: Product;
}

function ProductDetailsContent({ id, product }: ProductDetailsContentProps) {
  const user = useAuth((state) => state.user);
  const navigate = useNavigate();
  const [cartMessage, setCartMessage] = useState("");
  const addMutation = useAddToCart();
  const addToCartAsync = addMutation.mutateAsync;
  const adding = addMutation.isPending;
  const src = imageSrc(product.image_url);

  const handleAddToCart = useCallback(async () => {
    if (!user) {
      navigate("/login", { state: { from: `/products/${id}` } });
      return;
    }

    setCartMessage("");
    try {
      await addToCartAsync({ productId: product.id, quantity: 1, product });
      setCartMessage("Added to cart.");
    } catch (err) {
      setCartMessage(getApiErrorMessage(err, "Could not add this product to your cart."));
    }
  }, [addToCartAsync, id, navigate, product, user]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-2">
          <div className="min-h-[360px] bg-slate-100">
            {src ? <img src={src} alt={product.name} referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400">No image</div>}
          </div>
          <CardContent className="flex flex-col justify-center p-8">
            <p className="mb-2 text-sm uppercase tracking-wide text-slate-400">Product #{product.id}</p>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="mt-5 leading-7 text-slate-600">{product.description || "No description available."}</p>
            <div className="mt-8 text-3xl font-bold">₹{Number(product.price).toFixed(2)}</div>
            <p className="mt-2 text-sm text-slate-500">
              {product.stock > 0 ? `${product.stock} units available` : "Currently out of stock"}
            </p>
            {user?.role === "admin" ? (
              <Link to={`/admin/products?edit=${product.id}`} className="mt-6 block">
                <Button className="w-full">Edit product</Button>
              </Link>
            ) : (
              <>
                <Button className="mt-6 w-full" onClick={handleAddToCart} disabled={product.stock === 0 || adding}>
                  {adding ? "Adding..." : product.stock === 0 ? "Out of stock" : "Add to cart"}
                </Button>
                {cartMessage && <p role="status" className="mt-3 text-center text-sm text-slate-600">{cartMessage}</p>}
              </>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}