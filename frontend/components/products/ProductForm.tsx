"use client";

import { useEffect, useState } from "react";

import type { Product, ProductCreateInput, Supplier } from "@/types/product";

import { getSuppliers } from "@/lib/products";

type ProductFormProps = {
  product?: Product;
  onSubmit: (input: ProductCreateInput) => Promise<void>;
  onCancel: () => void;
};

export default function ProductForm({
  product,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");

  const [minimumStock, setMinimumStock] = useState(
    product?.minimum_stock?.toString() ?? "",
  );

  const [reorderPoint, setReorderPoint] = useState(
    product?.reorder_point?.toString() ?? "",
  );

  const [maximumStock, setMaximumStock] = useState(
    product?.maximum_stock?.toString() ?? "",
  );

  const [leadTime, setLeadTime] = useState(
    product?.lead_time_days?.toString() ?? "",
  );

  const [safetyBuffer, setSafetyBuffer] = useState(
    product?.safety_buffer_days?.toString() ?? "",
  );

  const [supplierId, setSupplierId] = useState(
    product?.preferred_supplier_id?.toString() ?? "",
  );

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEditing = Boolean(product);

  useEffect(() => {
    let active = true;

    async function loadSuppliers() {
      try {
        const result = await getSuppliers({
          active_only: true,
        });

        if (active) {
          setSuppliers(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load suppliers.",
          );
        }
      } finally {
        if (active) {
          setSuppliersLoading(false);
        }
      }
    }

    void loadSuppliers();

    return () => {
      active = false;
    };
  }, []);

  function optionalNumber(value: string): number | null {
    return value.trim() === "" ? null : Number(value);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Product name must contain at least 2 characters.");
      return;
    }

    const minimum = optionalNumber(minimumStock);
    const reorder = optionalNumber(reorderPoint);
    const maximum = optionalNumber(maximumStock);

    if (minimum !== null && reorder !== null && minimum > reorder) {
      setError("Minimum stock cannot exceed reorder point.");
      return;
    }

    if (reorder !== null && maximum !== null && reorder > maximum) {
      setError("Reorder point cannot exceed maximum stock.");
      return;
    }

    if (minimum !== null && maximum !== null && minimum > maximum) {
      setError("Minimum stock cannot exceed maximum stock.");
      return;
    }

    setLoading(true);

    try {
      await onSubmit({
        name: name.trim(),
        sku: sku.trim() || null,

        minimum_stock: minimum,
        reorder_point: reorder,
        maximum_stock: maximum,

        lead_time_days: optionalNumber(leadTime),
        safety_buffer_days: optionalNumber(safetyBuffer),

        preferred_supplier_id: supplierId ? Number(supplierId) : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "form-input";

  const labelClass = "mb-2 block text-sm font-semibold text-zinc-800";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* BASIC INFORMATION */}

      <section>
        <div className="mb-4">
          <h3 className="font-bold text-zinc-900">Basic information</h3>

          <p className="mt-1 text-sm text-zinc-500">
            Identify and organize your inventory product.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Product name</label>

            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Coca-Cola 500ml"
              maxLength={120}
              required
            />
          </div>

          <div>
            <label className={labelClass}>SKU</label>

            <input
              className={inputClass}
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              placeholder="e.g. COKE-500"
              maxLength={80}
            />
          </div>
        </div>
      </section>

      {/* STOCK THRESHOLDS */}

      <section className="border-t border-zinc-100 pt-7">
        <div className="mb-4">
          <h3 className="font-bold text-zinc-900">Stock thresholds</h3>

          <p className="mt-1 text-sm text-zinc-500">
            Configure inventory health and replenishment triggers.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Minimum stock</label>

            <input
              type="number"
              min="0"
              className={inputClass}
              value={minimumStock}
              onChange={(event) => setMinimumStock(event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className={labelClass}>Reorder point</label>

            <input
              type="number"
              min="0"
              className={inputClass}
              value={reorderPoint}
              onChange={(event) => setReorderPoint(event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className={labelClass}>Maximum stock</label>

            <input
              type="number"
              min="0"
              className={inputClass}
              value={maximumStock}
              onChange={(event) => setMaximumStock(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
      </section>

      {/* REPLENISHMENT */}

      <section className="border-t border-zinc-100 pt-7">
        <div className="mb-4">
          <h3 className="font-bold text-zinc-900">
            Replenishment configuration
          </h3>

          <p className="mt-1 text-sm text-zinc-500">
            Define supplier and product-specific planning settings.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Lead time (days)</label>

            <input
              type="number"
              min="0"
              className={inputClass}
              value={leadTime}
              onChange={(event) => setLeadTime(event.target.value)}
              placeholder="Use global default"
            />

            <p className="mt-1 text-xs text-zinc-400">
              Expected supplier delivery time.
            </p>
          </div>

          <div>
            <label className={labelClass}>Safety buffer (days)</label>

            <input
              type="number"
              min="0"
              className={inputClass}
              value={safetyBuffer}
              onChange={(event) => setSafetyBuffer(event.target.value)}
              placeholder="Use global default"
            />

            <p className="mt-1 text-xs text-zinc-400">
              Additional coverage against unexpected demand.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Preferred supplier</label>

            <select
              className={inputClass}
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              disabled={suppliersLoading}
            >
              <option value="">No preferred supplier</option>

              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>

            {!suppliersLoading && suppliers.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">
                No active suppliers available. Add a supplier first.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* CURRENT STOCK */}

      {product && (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Current stock
          </p>

          <p className="mt-1 text-2xl font-bold text-zinc-900">
            {product.current_stock}
          </p>

          <p className="mt-1 text-xs text-zinc-500">
            Stock quantities are managed through approved inventory movements.
            Editing product configuration cannot change inventory.
          </p>
        </section>
      )}

      {/* ERROR */}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ACTIONS */}

      <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : isEditing
              ? "Save changes"
              : "Create product"}
        </button>
      </div>
    </form>
  );
}
