"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ProductForm from "@/components/products/ProductForm";
import { getProduct, updateProduct } from "@/lib/products";

import type { Product, ProductCreateInput } from "@/types/product";

export default function ProductDetailsClient({
  productId,
}: {
  productId: string;
}) {
  const [product, setProduct] = useState<Product | null>(null);

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ============================================================
  // LOAD PRODUCT
  // ============================================================

  const loadProduct = useCallback(async () => {
    const id = Number(productId);

    if (!Number.isSafeInteger(id) || id <= 0) {
      setError("Invalid product ID.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await getProduct(id);
      setProduct(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load product.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  // ============================================================
  // UPDATE PRODUCT
  // ============================================================

  async function handleUpdate(input: ProductCreateInput) {
    if (!product || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await updateProduct(product.id, input);

      setProduct(updated);
      setEditing(false);
      setSuccess("Product configuration updated successfully.");
    } catch (err) {
      throw err instanceof Error ? err : new Error("Unable to update product.");
    } finally {
      setSaving(false);
    }
  }

  // ============================================================
  // LOADING STATE
  // ============================================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f8] p-10">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-red-600" />

          <p className="mt-4 text-sm font-medium text-zinc-500">
            Loading product...
          </p>
        </div>
      </main>
    );
  }

  // ============================================================
  // ERROR STATE
  // ============================================================

  if (error && !product) {
    return (
      <main className="min-h-screen bg-[#f7f7f8] p-6 sm:p-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-xl text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-zinc-900">
            Unable to load product
          </h1>

          <p className="mt-2 text-sm leading-6 text-red-600">
            {error || "Product not found."}
          </p>

          <Link
            href="/products"
            className="mt-6 inline-flex items-center rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            ← Back to products
          </Link>
        </div>
      </main>
    );
  }

  if (!product) return null;

  // ============================================================
  // MAIN PAGE
  // ============================================================

  return (
    <main className="min-h-screen bg-[#f7f7f8]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        {/* BREADCRUMB */}

        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <Link href="/" className="transition hover:text-red-600">
              Dashboard
            </Link>

            <span>/</span>

            <Link href="/products" className="transition hover:text-red-600">
              Products
            </Link>

            <span>/</span>

            <span className="font-medium text-zinc-900">Product details</span>
          </div>

          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 transition hover:text-red-700"
          >
            ← Back to products
          </Link>
        </div>

        {/* PRODUCT CARD */}

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {/* HEADER */}

          <div className="flex flex-col justify-between gap-5 border-b border-zinc-100 p-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                Product #{product.id}
              </p>

              <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950">
                {product.name}
              </h1>

              <p className="mt-1 text-sm text-zinc-500">
                SKU: {product.sku || "Not assigned"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSuccess("");
                setError("");
                setEditing((current) => !current);
              }}
              className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              {editing ? "Close editor" : "Edit product"}
            </button>
          </div>

          {/* SUCCESS MESSAGE */}

          {success && (
            <div className="mx-6 mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                ✓
              </div>

              <p className="text-sm font-medium text-emerald-700">{success}</p>
            </div>
          )}

          {/* UPDATE ERROR */}

          {error && product && (
            <div className="mx-6 mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* PRODUCT OVERVIEW */}

          <div className="grid gap-5 p-6 sm:grid-cols-2">
            {/* CURRENT STOCK */}

            <div className="rounded-xl border border-zinc-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-500">
                  Current stock
                </p>

                <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                  Inventory
                </span>
              </div>

              <p className="mt-4 text-4xl font-bold tracking-tight text-zinc-950">
                {product.current_stock}
              </p>

              <p className="mt-2 text-xs text-zinc-400">
                Units currently recorded in inventory.
              </p>
            </div>

            {/* PRODUCT IDENTIFIER */}

            <div className="rounded-xl border border-zinc-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-500">
                  Product identifier
                </p>

                <span className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                  ID
                </span>
              </div>

              <p className="mt-4 text-4xl font-bold tracking-tight text-zinc-950">
                #{product.id}
              </p>

              <p className="mt-2 text-xs text-zinc-400">
                Unique internal product identifier.
              </p>
            </div>
          </div>

          {/* STOCK CONFIGURATION */}

          <div className="border-t border-zinc-100 p-6">
            <div className="mb-5">
              <h2 className="font-bold text-zinc-900">Stock configuration</h2>

              <p className="mt-1 text-sm text-zinc-500">
                Configured inventory thresholds.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <ConfigurationCard
                label="Minimum stock"
                value={product.minimum_stock}
              />

              <ConfigurationCard
                label="Reorder point"
                value={product.reorder_point}
              />

              <ConfigurationCard
                label="Maximum stock"
                value={product.maximum_stock}
              />
            </div>
          </div>

          {/* REPLENISHMENT CONFIGURATION */}

          <div className="border-t border-zinc-100 p-6">
            <div className="mb-5">
              <h2 className="font-bold text-zinc-900">
                Replenishment configuration
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Product-specific purchasing and planning settings.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ConfigurationCard
                label="Lead time"
                value={
                  product.lead_time_days !== null
                    ? `${product.lead_time_days} days`
                    : "Global default"
                }
              />

              <ConfigurationCard
                label="Safety buffer"
                value={
                  product.safety_buffer_days !== null
                    ? `${product.safety_buffer_days} days`
                    : "Global default"
                }
              />

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs font-medium text-zinc-500">
                  Preferred supplier
                </p>

                {product.preferred_supplier ? (
                  <>
                    <p className="mt-2 text-lg font-bold text-zinc-900">
                      {product.preferred_supplier.name}
                    </p>

                    <p className="mt-1 text-xs text-zinc-500">
                      {product.preferred_supplier.email || "No email available"}
                    </p>

                    <span
                      className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        product.preferred_supplier.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {product.preferred_supplier.is_active
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </>
                ) : (
                  <p className="mt-2 text-lg font-semibold text-zinc-400">
                    Not assigned
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* EDIT FORM */}

          {editing && (
            <div className="border-t border-zinc-100 bg-zinc-50/50 p-6">
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                  Product management
                </p>

                <h2 className="mt-2 text-xl font-bold text-zinc-950">
                  Edit product configuration
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Update product information, stock thresholds, and
                  replenishment settings.
                </p>
              </div>

              <ProductForm
                product={product}
                onSubmit={handleUpdate}
                onCancel={() => setEditing(false)}
              />
            </div>
          )}
        </section>

        {/* INVENTORY PROTECTION */}

        <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
              !
            </div>

            <div>
              <p className="text-sm font-semibold text-red-800">
                Inventory protection
              </p>

              <p className="mt-1 text-xs leading-6 text-red-700">
                Editing product information and replenishment settings does not
                modify current stock. Inventory changes must be supported by
                verified evidence and approved inventory movement proposals.
                Supplier configuration does not automatically create or approve
                purchase orders.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ============================================================
// CONFIGURATION CARD
// ============================================================

function ConfigurationCard({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  const displayValue =
    value === null || value === undefined ? "Not configured" : value;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>

      <p className="mt-2 text-lg font-bold text-zinc-900">{displayValue}</p>
    </div>
  );
}
