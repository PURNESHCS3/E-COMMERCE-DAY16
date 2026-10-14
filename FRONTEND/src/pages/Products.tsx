import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  BookOpen,
  Cpu,
  Dumbbell,
  Gamepad2,
  Headphones,
  House,
  Laptop,
  Layers,
  Search,
  Shapes,
  Shirt,
  ShoppingBasket,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Watch,
  Footprints,
  type LucideIcon,
} from "lucide-react";
import ProductCard from "../components/ProductCard";
import { Input } from "../components/ui/input";
import {
  getProductCategories,
  getProducts,
  semanticSearchProducts,
} from "../services/products";
import { getApiErrorMessage } from "../lib/apiError";

const PAGE_SIZE = 12;

const categoryIcons: Record<string, LucideIcon> = {
  Electronics: Cpu,
  Footwear: Footprints,
  Clothing: Shirt,
  "Home & Kitchen": House,
  "Beauty & Personal Care": Sparkles,
  Books: BookOpen,
  "Sports & Outdoors": Dumbbell,
  "Toys & Games": Gamepad2,
  Accessories: Watch,
  Grocery: ShoppingBasket,
  Other: Shapes,
  Uncategorized: Layers,
};

export default function Products() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const [selectedCategory, setSelectedCategory] = useState("");
  const categoriesQuery = useQuery({
    queryKey: ["products", "categories"],
    queryFn: getProductCategories,
  });
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
    queryKey: ["products", "infinite", selectedCategory],
    queryFn: ({ pageParam }) =>
      getProducts({
        skip: pageParam,
        limit: PAGE_SIZE,
        category: selectedCategory || undefined,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
    enabled: !query.trim(),
  });
  const searchResult = useQuery({
    queryKey: ["products", "search", debouncedQuery, selectedCategory],
    queryFn: () =>
      semanticSearchProducts(debouncedQuery, selectedCategory || undefined),
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
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <section className="storefront-surface relative mb-10 min-h-[300px] overflow-hidden rounded-[2rem] border border-[#e3e8df] px-6 py-9 sm:px-10 sm:py-11 lg:min-h-[348px] lg:px-14 lg:py-14">
        <div className="relative z-10 max-w-[430px] lg:max-w-xl">
          <p className="hero-kicker mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-900/10 px-3 py-1.5 text-[11px] font-semibold tracking-[0.17em]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            THE SHOPHUB EDIT
          </p>
          <h1 className="max-w-lg text-[2.65rem] font-semibold leading-[1.05] tracking-[-0.055em] text-[#19271e] sm:text-5xl lg:text-[3.65rem]">
            Find your next <span className="font-serif italic font-medium text-emerald-900">favorite.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-[#5b6a5e] sm:text-base sm:leading-7">
            A considered collection of everyday tech, ready for whatever comes next.
          </p>
          <a
            href="#product-catalog"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-emerald-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-950"
          >
            Explore the collection
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 top-1/2 hidden h-[290px] w-[440px] -translate-y-1/2 items-center justify-center md:flex md:scale-75 md:origin-right lg:scale-100">
          <div className="storefront-orb absolute right-8 top-5 h-64 w-64 rounded-full bg-[#d9e4d3]" />
          <div className="absolute right-8 top-8 h-64 w-64 rounded-full border border-white/75" />
          <div className="storefront-light-tile absolute right-24 top-14 h-24 w-24 rounded-[2rem] rotate-[-12deg] border border-white/80 bg-white/75 p-5 text-emerald-900 shadow-xl backdrop-blur">
            <Headphones className="h-full w-full stroke-[1.25]" />
          </div>
          <div className="absolute right-48 top-24 h-28 w-28 rounded-[2rem] rotate-[9deg] border border-white/80 bg-[#f9f8f3]/90 p-6 text-[#344d3b] shadow-xl backdrop-blur">
            <Watch className="h-full w-full stroke-[1.2]" />
          </div>
          <div className="storefront-phone-tile absolute right-20 top-36 h-24 w-24 rounded-[1.8rem] rotate-[8deg] border border-white/80 bg-[#e7eee4]/95 p-5 text-emerald-950 shadow-xl backdrop-blur">
            <Smartphone className="h-full w-full stroke-[1.2]" />
          </div>
          <div className="absolute right-56 top-0 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/80 bg-[#fcfbf6]/90 text-[#607361] shadow-lg">
            <Laptop className="h-8 w-8 stroke-[1.2]" />
          </div>
          <div className="storefront-light-tile absolute bottom-6 right-6 rounded-full border border-white/80 bg-white/75 px-4 py-2 text-xs font-semibold tracking-wide text-emerald-950 shadow-md backdrop-blur">
            MADE FOR EVERY DAY
          </div>
        </div>
      </section>

      <section id="product-catalog" aria-label="Product catalogue" className="scroll-mt-28">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[0.16em] text-emerald-800">THE COLLECTION</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Find your thing</h2>
        </div>
        <p className="text-sm text-slate-500">Thoughtful picks, all in one place.</p>
      </div>

      <div className="mb-6 grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_180px_200px] md:p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search all products..."
            aria-label="Search products"
            className="h-12 border-stone-200 bg-[#fafaf8] pl-10"
          />
        </div>
        <select
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value)}
          aria-label="Filter by stock"
          className="h-12 rounded-xl border border-stone-200 bg-[#fafaf8] px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
        >
          <option value="all">All stock</option>
          <option value="available">In stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort products"
          className="h-12 rounded-xl border border-stone-200 bg-[#fafaf8] px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
        >
          <option value="default">Sort: Default</option>
          <option value="price-low">Price: Low to high</option>
          <option value="price-high">Price: High to low</option>
          <option value="name">Name: A to Z</option>
        </select>
      </div>

      <div
        role="group"
        aria-label="Product categories"
        className="category-scrollbar mb-6 flex gap-2 overflow-x-auto overscroll-x-contain pb-3"
      >
        <button
          type="button"
          aria-pressed={selectedCategory === ""}
          onClick={() => setSelectedCategory("")}
          className={`flex min-w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border px-4 py-2 text-sm font-medium transition ${
            selectedCategory === ""
              ? "border-emerald-900 bg-emerald-900 text-white"
              : "border-stone-200 bg-white text-slate-700 hover:border-emerald-800 hover:text-emerald-900"
          }`}
        >
          <Layers className="mb-1 h-5 w-5" aria-hidden="true" />
          <span>All</span>
        </button>
        {categoriesQuery.data?.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={selectedCategory === category}
            onClick={() => setSelectedCategory(category)}
            className={`flex min-w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border px-4 py-2 text-sm font-medium transition ${
              selectedCategory === category
                ? "border-emerald-900 bg-emerald-900 text-white"
                : "border-stone-200 bg-white text-slate-700 hover:border-emerald-800 hover:text-emerald-900"
            }`}
          >
            {(() => {
              const CategoryIcon = categoryIcons[category] ?? Shapes;
              return <CategoryIcon className="h-5 w-5" aria-hidden="true" />;
            })()}
            <span>{category}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <SlidersHorizontal className="h-4 w-4" />
          {filtered.length} product{filtered.length !== 1 ? "s" : ""} shown
        </p>
        <span className="hidden rounded-full bg-[#e9eee6] px-3 py-1 text-xs font-medium text-emerald-900 sm:inline-flex">
          Refined finds for everyday
        </span>
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
      {categoriesQuery.isError && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {getApiErrorMessage(categoriesQuery.error, "Unable to load product categories.")}
          <button
            type="button"
            onClick={() => void categoriesQuery.refetch()}
            className="ml-2 font-medium underline"
          >
            Retry
          </button>
        </div>
      )}

      {(query.trim() ? searchResult.data : data) && filtered.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center text-slate-500">
          {selectedCategory
            ? `No products found in ${selectedCategory}.`
            : "No products match your search."}
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
      </section>
    </main>
  );
}
