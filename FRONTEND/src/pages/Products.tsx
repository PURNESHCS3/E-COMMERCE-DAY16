import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import ProductCard from "../components/ProductCard";
import { Input } from "../components/ui/input";
import { getProducts } from "../services/products";
import { getApiErrorMessage } from "../lib/apiError";

const PAGE_SIZE = 12;

export default function Products() {
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const loadMoreRef = useRef(null);
  const {
    data,
    error,
    isPending,
    isError,
    isFetchNextPageError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["products", "infinite"],
    queryFn: ({ pageParam }) =>
      getProducts({ skip: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
  });

  const products = useMemo(
    () => data?.pages.flat() ?? [],
    [data]
  );
  const filtersActive =
    query.length > 0 || stockFilter !== "all" || sort !== "default";

  const filtered = useMemo(() => {
    const result = products.filter((product) => {
      const text = `${product.name} ${product.description || ""}`.toLowerCase();
      const matchesSearch = text.includes(query.toLowerCase());
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "available" && product.stock > 0) ||
        (stockFilter === "out" && product.stock === 0);
      return matchesSearch && matchesStock;
    });

    return [...result].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [products, query, stockFilter, sort]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage || isFetchNextPageError) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "240px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);

  useEffect(() => {
    if (
      filtersActive &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError
    ) {
      fetchNextPage();
    }
  }, [
    fetchNextPage,
    filtersActive,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <section className="mb-8 rounded-2xl bg-slate-900 px-6 py-10 text-white sm:px-10">
        <p className="mb-2 text-sm font-medium text-slate-300">SHOPHUB</p>
        <h1 className="text-3xl font-bold sm:text-4xl">
          Find your next product from Shophub!
        </h1>
      </section>

      <div className="mb-8 grid gap-3 md:grid-cols-[1fr_180px_200px]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search loaded products..."
            aria-label="Search products"
            className="pl-9"
          />
        </div>
        <select
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value)}
          aria-label="Filter by stock"
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="all">All stock</option>
          <option value="available">In stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort products"
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="default">Sort: Default</option>
          <option value="price-low">Price: Low to high</option>
          <option value="price-high">Price: High to low</option>
          <option value="name">Name: A to Z</option>
        </select>
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <SlidersHorizontal className="h-4 w-4" />
        {filtered.length} loaded product{filtered.length !== 1 ? "s" : ""} shown
      </div>
      {filtersActive && hasNextPage && (
        <p role="status" className="mb-4 text-sm text-slate-500">
          Loading the catalog to apply filters to every product...
        </p>
      )}

      {isPending && (
        <div className="py-16 text-center text-slate-500">Loading products...</div>
      )}
      {isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {getApiErrorMessage(error, "Unable to load products.")}
          <button
            type="button"
            onClick={() => (isFetchNextPageError ? fetchNextPage() : refetch())}
            className="ml-2 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {data && filtered.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center text-slate-500">
          No loaded products match your search.
        </div>
      )}

      {data && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              prioritizeImage={index === 0}
            />
          ))}
        </div>
      )}

      <div ref={loadMoreRef} aria-hidden="true" className="h-1" />
      {isFetchingNextPage && (
        <p role="status" className="py-6 text-center text-sm text-slate-500">
          Loading more products...
        </p>
      )}
      {hasNextPage && !isFetchingNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          className="mx-auto mt-6 block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Load more products
        </button>
      )}
    </main>
  );
}
