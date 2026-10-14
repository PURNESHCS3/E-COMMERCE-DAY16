import { memo, useState } from "react";
import { ImageOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { API_URL } from "../services/api";
import type { Product } from "../types";

function imageSrc(url: string | null): string | null {
  const path = url?.trim();
  if (!path) return null;
  if (/^(https?:)?\/\//i.test(path)) return path;
  const apiOrigin = API_URL.replace(/\/api\/?$/i, "").replace(/\/$/, "");
  return `${apiOrigin}/${path.replace(/^\/+/, "")}`;
}

interface ProductCardProps {
  product: Product;
  prioritizeImage?: boolean;
}

function ProductCard({ product, prioritizeImage = false }: ProductCardProps) {
  const src = imageSrc(product.image_url);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <Card className="product-card group overflow-hidden border-stone-200/90 bg-white">
      <div className="product-card-image relative aspect-[4/3] overflow-hidden">
        {src && src !== failedSrc ? (
          <img
            src={src}
            alt={product.name}
            referrerPolicy="no-referrer"
            loading={prioritizeImage ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={prioritizeImage ? "high" : "auto"}
            onError={() => setFailedSrc(src)}
            className="product-image h-full w-full object-cover"
          />
        ) : (
          <div
            role="img"
            aria-label={`${product.name} image unavailable`}
            className="product-image-fallback flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500"
          >
            <ImageOff className="h-8 w-8 opacity-60" aria-hidden="true" />
            <span>Image unavailable</span>
          </div>
        )}
      </div>
      <CardContent className="space-y-3.5 p-5">
        <div className="min-h-[68px]">
          <h3 className="line-clamp-2 font-semibold leading-5 text-slate-900">{product.name}</h3>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-slate-500">
            {product.description || "No description available."}
          </p>
        </div>
        <div className="flex items-end justify-between gap-2 border-t border-stone-100 pt-3">
          <span className="text-xl font-semibold tracking-tight text-slate-950">₹{Number(product.price).toFixed(2)}</span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            product.stock > 0
              ? "bg-emerald-50 text-emerald-800"
              : "bg-stone-100 text-stone-600"
          }`}>
            {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
          </span>
        </div>
        <Link to={`/products/${product.id}`} className="block">
          <Button className="w-full rounded-xl">View Details</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default memo(ProductCard);