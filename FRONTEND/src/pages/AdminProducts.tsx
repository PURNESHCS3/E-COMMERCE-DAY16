import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { createProduct, deleteProduct, getProducts, updateProduct, uploadProductImage } from "../services/products";
import { getApiErrorMessage } from "../lib/apiError";
import type { Product, ProductPayload } from "../types";

const emptyForm = {
  name: "",
  description: "",
  price: "",
  stock: "",
};

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({
    queryKey: ["products", "admin"],
    queryFn: () => getProducts(),
  });
  const [searchParams] = useSearchParams();
  const editProductId = searchParams.get("edit");
  const products = productsQuery.data || [];
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!editProductId || !productsQuery.data) return;
    const productToEdit = productsQuery.data.find(
      (product) => String(product.id) === editProductId
    );
    if (!productToEdit || editingId === productToEdit.id) return;

    setEditingId(productToEdit.id);
    setForm({
      name: productToEdit.name,
      description: productToEdit.description || "",
      price: String(productToEdit.price),
      stock: String(productToEdit.stock),
    });
  }, [editProductId, editingId, productsQuery.data]);

  const updateField = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setImageFile(null);
    setFileInputKey((current) => current + 1);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload: ProductPayload = {
      ...form,
      price: Number(form.price),
      stock: Number(form.stock),
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
    setFileInputKey((current) => current + 1);
    setForm({
      name: product.name,
      description: product.description || "",
      price: String(product.price),
      stock: String(product.stock),
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
            Product image (optional)
            <input
              key={fileInputKey}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setImageFile(event.target.files?.[0] || null)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-medium"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create product"}</Button>
          {editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancel edit</Button>}
        </div>
      </form>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Products</h2>
        {productsQuery.isPending ? (
          <p className="py-8 text-center text-slate-500">Loading products...</p>
        ) : products.length === 0 ? (
          <p className="border-y py-8 text-center text-slate-500">No active products.</p>
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
                {products.map((product) => (
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