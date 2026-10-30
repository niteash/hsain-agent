"use client";

import type { Product } from "@/types/product";

type ProductSelectorProps = {
  products: Product[];
  selectedProductId: number | null;
  onSelect: (productId: number) => void;
  loading?: boolean;
};

export default function ProductSelector({
  products,
  selectedProductId,
  onSelect,
  loading = false,
}: ProductSelectorProps) {
  return (
    <div>
      <label
        htmlFor="product"
        className="mb-2 block text-sm font-semibold text-zinc-700"
      >
        Select product
      </label>

      <select
        id="product"
        value={selectedProductId ?? ""}
        onChange={(event) => onSelect(Number(event.target.value))}
        disabled={loading || products.length === 0}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-500/10 disabled:cursor-not-allowed disabled:bg-zinc-100"
      >
        <option value="" disabled>
          {loading ? "Loading products..." : "Choose a product"}
        </option>

        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name} — Stock: {product.current_stock}
          </option>
        ))}
      </select>

      {!loading && products.length === 0 && (
        <p className="mt-2 text-sm text-zinc-500">
          No products are currently available.
        </p>
      )}
    </div>
  );
}
