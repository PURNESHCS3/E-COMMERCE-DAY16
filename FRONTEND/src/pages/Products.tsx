import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import ProductCard from "../components/ProductCard";
import { Input } from "../components/ui/input";
import { getProducts, searchProducts } from "../services/products";
import { getApiErrorMessage } from "../lib/apiError";

const PAGE_SIZE = 12;

export default function Products() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [sort, setSort] = useState("default");
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
    enabled: !query.trim(),
  });
  const searchResult = useQuery({
    queryKey: ["products", "search", debouncedQuery],
    queryFn: () => searchProducts(debouncedQuery),
    enabled: Boolean(debouncedQuery),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const products = useMemo(
    () => query.trim() ? searchResult.data ?? [] : data?.pages.flat() ?? [],
    [data, query, searchResult.data]
  );
  const filtersActive =
    stockFilter !== "all" || sort !== "default";

  const filtered = useMemo(() => {
    const result = products.filter((product) => {
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "available" && product.stock > 0) ||
        (stockFilter === "out" && product.stock === 0);
      return matchesStock;
    });

    return [...result].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [products, stockFilter, sort]);

  useEffect(() => {
    if (
      !query.trim() &&
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
    query,
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
            placeholder="Search all products..."
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
        {filtered.length} product{filtered.length !== 1 ? "s" : ""} shown
      </div>
      {!query.trim() && filtersActive && hasNextPage && (
        <p role="status" className="mb-4 text-sm text-slate-500">
          Loading the catalog to apply filters to every product...
        </p>
      )}

      {isPending && !query.trim() && (
        <div className="py-16 text-center text-slate-500">Loading products...</div>
      )}
      {searchResult.isFetching && debouncedQuery && (
        <p role="status" className="py-6 text-center text-sm text-slate-500">Searching products...</p>
      )}
      {(query.trim() ? searchResult.isError : isError) && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {getApiErrorMessage(
            query.trim() ? searchResult.error : error,
            query.trim() ? "Unable to search products." : "Unable to load products.",
          )}
          <button
            type="button"
            onClick={() => query.trim()
              ? searchResult.refetch()
              : isFetchNextPageError ? fetchNextPage() : refetch()}
            className="ml-2 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {(query.trim() ? searchResult.data : data) && filtered.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center text-slate-500">
          No products match your search.
        </div>
      )}

      {(query.trim() ? searchResult.data : data) && (
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

      {!query.trim() && hasNextPage && (
        <button
          type="button"
          disabled={isFetchingNextPage}
          onClick={() => {
            if (!isFetchingNextPage) fetchNextPage();
          }}
          className="mx-auto mt-6 block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          {isFetchingNextPage ? "Loading more products..." : "Load more products"}
        </button>
      )}
      {!query.trim() && isFetchingNextPage && (
        <p role="status" className="py-6 text-center text-sm text-slate-500">
          Loading more products...
        </p>
      )}
    </main>
  );
}
