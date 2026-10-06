import { memo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { API_URL } from "../services/api";
import type { Product } from "../types";

function imageSrc(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${API_URL.replace("/api", "")}${url}`;
}

interface ProductCardProps {
  product: Product;
  prioritizeImage?: boolean;
}

function ProductCard({ product, prioritizeImage = false }: ProductCardProps) {
  const src = imageSrc(product.image_url);

  return (
    <Card className="overflow-hidden transition hover:-translate-y-1 hover:shadow-lg">
      <div className="aspect-[4/3] bg-slate-100">
        {src ? (
          <img
            src={src}
            alt={product.name}
            loading={prioritizeImage ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={prioritizeImage ? "high" : "auto"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">No image</div>
        )}
      </div>
      <CardContent className="space-y-3">
        <div>
          <h3 className="font-semibold">{product.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">
            {product.description || "No description available."}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">₹{Number(product.price).toFixed(2)}</span>
          <span className="text-xs text-slate-500">{product.stock} in stock</span>
        </div>
        <Link to={`/products/${product.id}`} className="block">
          <Button className="w-full">View Details</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default memo(ProductCard);