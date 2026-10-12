import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { createProduct, deleteProduct, getProducts, searchProducts, updateProduct, uploadProductImage } from "../services/products";
import { getApiErrorMessage } from "../lib/apiError";
import type { Product, ProductPayload } from "../types";

const emptyForm = {
  name: "",
  description: "",
  price: "",
  stock: "",
  imageUrl: "",
};

function publicImageUrlError(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a valid public HTTPS image URL.";
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    !hostname ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example") ||
    hostname.includes(":") ||
    /^[\d.]+$/.test(hostname) ||
    /^0x[\da-f]+$/i.test(hostname)
  ) {
    return "Use a public HTTPS image URL without credentials or a custom port.";
  }

  return null;
}

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({
    queryKey: ["products", "admin"],
    queryFn: () => getProducts(),
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchQuery = useQuery({
    queryKey: ["products", "admin-search", debouncedSearch],
    queryFn: () => searchProducts(debouncedSearch),
    enabled: Boolean(debouncedSearch),
  });
  const [searchParams] = useSearchParams();
  const editProductId = searchParams.get("edit");
  const products = productsQuery.data || [];
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [initializedEditProductId, setInitializedEditProductId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [imageUrlSelected, setImageUrlSelected] = useState(false);
  const [imageUrlPreviewLoaded, setImageUrlPreviewLoaded] = useState(false);
  const [imageUrlPreviewFailed, setImageUrlPreviewFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const productToEdit = products.find(
    (product) => String(product.id) === editProductId,
  );
  if (!editProductId && initializedEditProductId !== null) {
    setInitializedEditProductId(null);
  } else if (
    editProductId &&
    productToEdit &&
    initializedEditProductId !== editProductId
  ) {
    setInitializedEditProductId(editProductId);
    setEditingId(productToEdit.id);
    setForm({
      name: productToEdit.name,
      description: productToEdit.description || "",
      price: String(productToEdit.price),
      stock: String(productToEdit.stock),
      imageUrl: productToEdit.image_url?.startsWith("https://")
        ? productToEdit.image_url
        : "",
    });
  }

  const updateField = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setImageFile(null);
    setImageUrlSelected(false);
    setImageUrlPreviewLoaded(false);
    setImageUrlPreviewFailed(false);
    setFileInputKey((current) => current + 1);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    if (imageUrlSelected) {
      const urlError = publicImageUrlError(form.imageUrl.trim());
      if (urlError) {
        setError(urlError);
        setSaving(false);
        return;
      }
      if (!imageUrlPreviewLoaded) {
        setError("Wait for the image preview to load before using this URL.");
        setSaving(false);
        return;
      }
    }

    const payload: ProductPayload = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      stock: Number(form.stock),
      image_url: imageUrlSelected
        ? form.imageUrl.trim()
        : editingId
          ? products.find((product) => product.id === editingId)?.image_url ?? null
          : null,
    };

    const previousProducts = products;
    if (editingId) {
      queryClient.setQueryData<Product[]>(["products", "admin"], (current) =>
        current?.map((product) =>
          product.id === editingId ? { ...product, ...payload } : product
        )
      );
    }

    try {
      const isEditing = Boolean(editingId);
      let product = editingId
        ? await updateProduct(editingId, payload)
        : await createProduct(payload);

      let uploadError = "";
      if (imageFile) {
        try {
          const image = await uploadProductImage(product.id, imageFile);
          product = { ...product, image_url: image.image_url };
        } catch (uploadFailure: unknown) {
          uploadError = getApiErrorMessage(uploadFailure, "Product saved, but its image could not be uploaded.");
        }
      }

      queryClient.setQueryData<Product[]>(["products", "admin"], (current) =>
        editingId
          ? (current || []).map((item) => item.id === product.id ? product : item)
          : [...(current || []), product]
      );
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      setError(uploadError);
      setNotice(uploadError ? "" : isEditing ? "Product updated." : "Product created.");
      resetForm();
    } catch (err: unknown) {
      queryClient.setQueryData(["products", "admin"], previousProducts);
      setError(getApiErrorMessage(err, "Could not save the product."));
    } finally {
      setSaving(false);
    }
  };

  const edit = (product: Product) => {
    setEditingId(product.id);
    setImageFile(null);
    setImageUrlSelected(false);
    setImageUrlPreviewLoaded(false);
    setImageUrlPreviewFailed(false);
    setFileInputKey((current) => current + 1);
    setForm({
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      stock: String(product.stock),
      imageUrl: product.image_url?.startsWith("https://")
        ? product.image_url
        : "",
    });
    setError("");
    setNotice("");
  };

  const remove = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name}?`)) return;

    setError("");
    setNotice("");
    const previousProducts = products;
    queryClient.setQueryData<Product[]>(["products", "admin"], (current) =>
      current?.filter((item) => item.id !== product.id)
    );
    try {
      await deleteProduct(product.id);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      if (editingId === product.id) resetForm();
      setNotice("Product deleted.");
    } catch (err: unknown) {
      queryClient.setQueryData(["products", "admin"], previousProducts);
      setError(getApiErrorMessage(err, "Could not delete the product."));
    }
  };

  const isSearching = Boolean(search.trim());
  const isSearchDebouncing = search.trim() !== debouncedSearch;
  const displayedProducts = isSearching ? searchQuery.data ?? [] : products;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">ADMIN</p>
          <h1 className="mt-1 text-3xl font-bold">Product management</h1>
        </div>
        <Link to="/admin/orders" className="text-sm font-medium underline">View all orders</Link>
      </div>

      {(error || productsQuery.error) && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error || getApiErrorMessage(productsQuery.error, "Could not load products.")}</p>}
      {notice && <p role="status" className="mb-5 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      <form onSubmit={submit} className="mb-10 border-y py-6">
        <h2 className="mb-4 text-lg font-semibold">{editingId ? `Edit product #${editingId}` : "Add product"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            Name
            <Input name="name" value={form.name} onChange={updateField} required maxLength={200} />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Price
            <Input name="price" type="number" min="0.01" step="0.01" value={form.price} onChange={updateField} required />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Stock
            <Input name="stock" type="number" min="0" step="1" value={form.stock} onChange={updateField} required />
          </label>
          <label className="space-y-1 text-sm font-medium sm:col-span-2">
            Description
            <textarea
              name="description"
              value={form.description}
              onChange={updateField}
              maxLength={1000}
              rows={3}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="space-y-1 text-sm font-medium sm:col-span-2">
            Upload product image
            <input
              key={fileInputKey}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setImageFile(file);
                setImageUrlSelected(false);
                if (file) {
                  setForm((current) => ({ ...current, imageUrl: "" }));
                  setImageUrlPreviewLoaded(false);
                  setImageUrlPreviewFailed(false);
                }
              }}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-medium"
            />
          </label>
          <div className="space-y-2 text-sm sm:col-span-2">
            <label htmlFor="product-image-url" className="block font-medium">
              Or use a public image URL
            </label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="product-image-url"
                name="imageUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={form.imageUrl}
                onChange={(event) => {
                  updateField(event);
                  setImageUrlSelected(false);
                  setImageUrlPreviewLoaded(false);
                  setImageUrlPreviewFailed(false);
                }}
                maxLength={500}
                placeholder="https://example.com/product-image.jpg"
                aria-describedby="product-image-url-help"
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  !form.imageUrl.trim() ||
                  !imageUrlPreviewLoaded ||
                  imageUrlPreviewFailed ||
                  Boolean(publicImageUrlError(form.imageUrl.trim()))
                }
                onClick={() => {
                  const urlError = publicImageUrlError(form.imageUrl.trim());
                  if (urlError) {
                    setError(urlError);
                    return;
                  }
                  setImageFile(null);
                  setFileInputKey((current) => current + 1);
                  setImageUrlSelected(true);
                  setError("");
                  setNotice("Public image URL selected. Save the product to apply it.");
                }}
              >
                Use image URL
              </Button>
            </div>
            <p id="product-image-url-help" className="text-xs text-slate-500">
              HTTPS only. The app displays this URL directly and does not download or store a copy.
            </p>
            {form.imageUrl && !imageFile && !publicImageUrlError(form.imageUrl.trim()) && (
              <div className="flex items-center gap-3">
                <img
                  src={form.imageUrl.trim()}
                  alt="Public image URL preview"
                  referrerPolicy="no-referrer"
                  onLoad={() => {
                    setImageUrlPreviewLoaded(true);
                    setImageUrlPreviewFailed(false);
                  }}
                  onError={() => {
                    setImageUrlPreviewLoaded(false);
                    setImageUrlPreviewFailed(true);
                  }}
                  className="h-16 w-16 rounded border bg-white object-cover"
                />
                <p role={imageUrlPreviewFailed ? "alert" : "status"} className="text-xs text-slate-600">
                  {imageUrlPreviewFailed
                    ? "Could not load this image. Check that the URL points directly to a public image."
                    : imageUrlPreviewLoaded
                      ? imageUrlSelected ? "Public image URL selected." : "Preview loaded. Select Use image URL to apply it."
                      : "Loading image preview..."}
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create product"}</Button>
          {editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancel edit</Button>}
        </div>
      </form>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Products</h2>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search all products..."
              aria-label="Search manage products"
              className="pl-9"
            />
          </div>
        </div>
        {(isSearchDebouncing || searchQuery.isFetching) && isSearching && (
          <p role="status" className="mb-3 text-sm text-slate-500">
            Searching products...
          </p>
        )}
        {isSearching && searchQuery.isError && !isSearchDebouncing && (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {getApiErrorMessage(searchQuery.error, "Unable to search products.")}
            <button
              type="button"
              onClick={() => searchQuery.refetch()}
              className="ml-2 font-medium underline"
            >
              Retry
            </button>
          </div>
        )}
        {productsQuery.isPending ? (
          <p className="py-8 text-center text-slate-500">Loading products...</p>
        ) : isSearching && (isSearchDebouncing || searchQuery.isFetching) ? null : displayedProducts.length === 0 ? (
          isSearching && searchQuery.isError ? null : (
            <p className="border-y py-8 text-center text-slate-500">
              {isSearching ? "No products match your search." : "No active products."}
            </p>
          )
        ) : (
          <div className="overflow-x-auto border-y">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4 font-medium">Product</th>
                  <th className="py-3 pr-4 font-medium">Price</th>
                  <th className="py-3 pr-4 font-medium">Stock</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedProducts.map((product) => (
                  <tr key={product.id}>
                    <td className="py-4 pr-4">
                      <p className="font-medium">{product.name}</p>
                      <p className="mt-1 max-w-lg truncate text-slate-500">{product.description || "No description"}</p>
                    </td>
                    <td className="py-4 pr-4">₹{Number(product.price).toFixed(2)}</td>
                    <td className="py-4 pr-4">{product.stock}</td>
                    <td className="py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => edit(product)}>Edit</Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => remove(product)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}