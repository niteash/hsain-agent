"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ProductForm from "@/components/products/ProductForm";
import { createProduct, getProducts } from "@/lib/products";
import type { Product } from "@/types/product";

const PAGE_SIZE = 10;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ============================================================
  // LOAD PRODUCTS
  // ============================================================

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getProducts({
        limit: 100,
      });

      setProducts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // ============================================================
  // SEARCH AND FILTER
  // ============================================================

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return products;

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.sku?.toLowerCase().includes(term),
    );
  }, [products, search]);

  // ============================================================
  // PAGINATION
  // ============================================================

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PAGE_SIZE),
  );

  const visibleProducts = filteredProducts.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );

  // ============================================================
  // STATISTICS
  // ============================================================

  const totalUnits = products.reduce(
    (total, product) => total + product.current_stock,
    0,
  );

  const outOfStock = products.filter(
    (product) => product.current_stock === 0,
  ).length;

  const lowStock = products.filter(
    (product) => product.current_stock > 0 && product.current_stock <= 10,
  ).length;

  // ============================================================
  // CREATE PRODUCT
  // ============================================================

  async function handleCreate(input: { name: string; sku: string | null }) {
    await createProduct(input);

    setShowForm(false);
    await loadProducts();
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <main className="min-h-screen bg-[#f7f7f8]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
              <Link href="/" className="transition hover:text-red-600">
                Dashboard
              </Link>

              <span>/</span>

              <span className="text-zinc-900">Products</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-zinc-950">
              Product Management
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              Manage your product catalogue and monitor stock levels.
            </p>
          </div>

          {/* Header Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/suppliers"
              className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:text-red-600"
            >
              Manage suppliers
            </Link>

            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              + Add product
            </button>
          </div>
        </div>

        {/* ================================================== */}
        {/* STATISTICS */}
        {/* ================================================== */}

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total products"
            value={products.length}
            description="Registered products"
          />

          <StatCard
            label="Total stock units"
            value={totalUnits}
            description="Across all products"
          />

          <StatCard
            label="Low stock"
            value={lowStock}
            description="10 units or fewer"
          />

          <StatCard
            label="Out of stock"
            value={outOfStock}
            description="Products with zero stock"
            highlight
          />
        </div>

        {/* ================================================== */}
        {/* PRODUCT TABLE */}
        {/* ================================================== */}

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {/* Table Header */}
          <div className="flex flex-col gap-4 border-b border-zinc-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-zinc-900">All products</h2>

              <p className="mt-1 text-xs text-zinc-500">
                {filteredProducts.length} products found
              </p>
            </div>

            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search name or SKU..."
              className="form-input w-full sm:max-w-xs"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}

              <button
                type="button"
                onClick={() => void loadProducts()}
                className="ml-2 font-semibold underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div className="p-12 text-center text-sm text-zinc-500">
              Loading products...
            </div>
          ) : visibleProducts.length === 0 ? (
            /* Empty State */
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
                📦
              </div>

              <h3 className="font-semibold text-zinc-900">No products found</h3>

              <p className="mt-2 text-sm text-zinc-500">
                {search
                  ? "Try another search term."
                  : "Create your first product to get started."}
              </p>
            </div>
          ) : (
            <>
              {/* Product Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-5 py-4 font-semibold">Product</th>

                      <th className="px-5 py-4 font-semibold">SKU</th>

                      <th className="px-5 py-4 font-semibold">Current stock</th>

                      <th className="px-5 py-4 font-semibold">Status</th>

                      <th className="px-5 py-4 text-right font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-100">
                    {visibleProducts.map((product) => (
                      <tr
                        key={product.id}
                        className="transition hover:bg-zinc-50"
                      >
                        {/* Product */}
                        <td className="px-5 py-4">
                          <div className="font-semibold text-zinc-900">
                            {product.name}
                          </div>

                          <div className="mt-1 text-xs text-zinc-400">
                            ID: #{product.id}
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="px-5 py-4 text-zinc-500">
                          {product.sku || "—"}
                        </td>

                        {/* Current Stock */}
                        <td className="px-5 py-4 font-semibold text-zinc-900">
                          {product.current_stock.toLocaleString()}
                        </td>

                        {/* Stock Status */}
                        <td className="px-5 py-4">
                          <StockBadge stock={product.current_stock} />
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/products/${product.id}`}
                            className="font-semibold text-red-600 transition hover:text-red-700"
                          >
                            View details →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ================================================== */}
              {/* PAGINATION */}
              {/* ================================================== */}

              <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-4">
                <p className="text-xs text-zinc-500">
                  Page {page + 1} of {totalPages}
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((current) => current - 1)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ================================================== */}
        {/* INVENTORY SAFETY NOTICE */}
        {/* ================================================== */}

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
          <span className="text-red-600">ⓘ</span>

          <p className="text-xs leading-5 text-red-800">
            Product details can be edited here, but stock quantities are
            controlled through evidence-backed inventory movements and human
            approval.
          </p>
        </div>
      </div>

      {/* ================================================== */}
      {/* CREATE PRODUCT MODAL */}
      {/* ================================================== */}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-zinc-950">
                Create product
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Add a new product to your catalogue.
              </p>
            </div>

            <ProductForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================
// STATISTICS CARD
// ============================================================

function StatCard({
  label,
  value,
  description,
  highlight = false,
}: {
  label: string;
  value: number;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>

      <p
        className={`mt-3 text-3xl font-bold ${
          highlight ? "text-red-600" : "text-zinc-950"
        }`}
      >
        {value.toLocaleString()}
      </p>

      <p className="mt-2 text-xs text-zinc-400">{description}</p>
    </div>
  );
}

// ============================================================
// STOCK STATUS BADGE
// ============================================================

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) {
    return (
      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
        Out of stock
      </span>
    );
  }

  if (stock <= 10) {
    return (
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        Low stock
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      In stock
    </span>
  );
}
