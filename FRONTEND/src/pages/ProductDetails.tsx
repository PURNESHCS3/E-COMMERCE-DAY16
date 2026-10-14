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
  const [showFeatures, setShowFeatures] = useState(false);
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
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <Card className="overflow-hidden border-stone-200/80 shadow-[0_20px_60px_rgb(27_39_28_/_6%)]">
        <div className="grid md:grid-cols-[1.05fr_0.95fr]">
          <div className="flex min-h-[330px] items-center justify-center bg-[#f0f1ed] p-8 sm:min-h-[460px] sm:p-12">
            {src ? <img src={src} alt={product.name} referrerPolicy="no-referrer" className="max-h-[420px] w-full rounded-xl object-contain mix-blend-multiply" /> : <div className="flex h-full items-center justify-center text-slate-400">No image</div>}
          </div>
          <CardContent className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">A SHOPHUB FIND · #{product.id}</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">{product.name}</h1>
            <div
              id="product-information"
              className="mt-4 h-44 overflow-y-auto overscroll-contain pr-2"
              aria-live="polite"
              tabIndex={0}
              aria-label={showFeatures ? "Product features" : "Product description"}
            >
              {showFeatures ? (
                <section aria-labelledby="product-features-heading">
                  <h2 id="product-features-heading" className="text-sm font-semibold text-slate-900">Features</h2>
                  {product.features?.trim() ? (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-slate-600">
                      {product.features.split(/\r?\n/).map((feature, index) => (
                        feature.trim() && <li key={`${index}-${feature}`}>{feature.trim()}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-600">No features listed.</p>
                  )}
                </section>
              ) : (
                <p className="leading-7 text-slate-600">{product.description || "No description available."}</p>
              )}
            </div>
            <div className="mt-5 border-t border-stone-200 pt-4">
              <div className="text-3xl font-semibold tracking-tight text-slate-950">₹{Number(product.price).toFixed(2)}</div>
              <p className={`mt-2 inline-flex items-center gap-2 text-sm ${
                product.stock > 0 ? "text-emerald-800" : "text-stone-500"
              }`}>
                <span className={`h-2 w-2 rounded-full ${product.stock > 0 ? "bg-emerald-600" : "bg-stone-400"}`} />
                {product.stock > 0 ? `${product.stock} units available` : "Currently out of stock"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full rounded-lg"
              aria-controls="product-information"
              aria-pressed={showFeatures}
              onClick={() => setShowFeatures((current) => !current)}
            >
              {showFeatures ? "View description" : "View features"}
            </Button>
            {user?.role === "admin" ? (
              <Link to={`/admin/products?edit=${product.id}`} className="mt-4 block">
                <Button size="sm" className="h-10 w-full rounded-lg">Edit product</Button>
              </Link>
            ) : (
              <>
                <Button size="sm" className="mt-4 h-10 w-full rounded-lg" onClick={handleAddToCart} disabled={product.stock === 0 || adding}>
                  {adding ? "Adding..." : product.stock === 0 ? "Out of stock" : "Add to cart"}
                </Button>
                {cartMessage && <p role="status" className="mt-3 text-center text-sm text-emerald-800">{cartMessage}</p>}
              </>
            )}
          </CardContent>
        </div>
      </Card>
    </main>
  );
}