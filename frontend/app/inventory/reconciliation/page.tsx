"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  detectStockDiscrepancies,
  getStockReconciliation,
  type StockReconciliation,
  type StockReconciliationItem,
} from "@/lib/inventory";

function StatusBadge({
  status,
}: {
  status: StockReconciliationItem["status"];
}) {
  const styles = {
    reconciled: "bg-emerald-50 text-emerald-700",
    discrepancy: "bg-red-50 text-red-700",
    missing_opening_balance: "bg-amber-50 text-amber-700",
  };

  const labels = {
    reconciled: "Reconciled",
    discrepancy: "Discrepancy",
    missing_opening_balance: "Missing baseline",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-sm text-neutral-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">
        {value}
      </p>
      <p className="mt-2 text-xs text-neutral-500">{description}</p>
    </div>
  );
}

export default function StockReconciliationPage() {
  const [data, setData] = useState<StockReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadReconciliation = useCallback(async () => {
    try {
      setError("");
      const result = await getStockReconciliation();
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load stock reconciliation.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReconciliation();
  }, [loadReconciliation]);

  async function handleDetection() {
    try {
      setDetecting(true);
      setError("");
      setSuccess("");

      const result = await detectStockDiscrepancies();

      setSuccess(`Discrepancy detection completed. ${JSON.stringify(result)}`);

      await loadReconciliation();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Discrepancy detection failed.",
      );
    } finally {
      setDetecting(false);
    }
  }

  const items = data?.items ?? [];

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950 md:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <Link
            href="/inventory"
            className="text-sm text-neutral-500 transition hover:text-red-600"
          >
            ← Back to Inventory
          </Link>

          <div className="mt-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
                Inventory control
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Stock Reconciliation
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-neutral-500">
                Compare opening balances and recorded stock movements against
                current product quantities.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => void loadReconciliation()}
                disabled={loading}
                className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-neutral-100 disabled:opacity-50"
              >
                Refresh
              </button>

              <button
                onClick={handleDetection}
                disabled={detecting || loading}
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {detecting ? "Detecting..." : "Run discrepancy detection"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
            Loading stock reconciliation...
          </div>
        ) : data ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Total products"
                value={data.total_products}
                description="Products included in reconciliation"
              />

              <SummaryCard
                title="Reconciled"
                value={data.reconciled}
                description="Ledger matches current stock"
              />

              <SummaryCard
                title="Discrepancies"
                value={data.discrepancies}
                description="Calculated stock does not match"
              />

              <SummaryCard
                title="Missing baselines"
                value={data.missing_opening_balances}
                description="Opening balances not recorded"
              />
            </section>

            <section className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              <div className="flex flex-col justify-between gap-2 border-b border-neutral-200 p-5 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-semibold">Product reconciliation</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    {items.length} products returned
                  </p>
                </div>

                <Link
                  href="/inventory/alerts"
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  View discrepancy alerts →
                </Link>
              </div>

              {items.length === 0 ? (
                <div className="p-10 text-center text-sm text-neutral-500">
                  No products available for reconciliation.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                      <tr>
                        <th className="px-5 py-4">Product</th>
                        <th className="px-5 py-4">Opening balance</th>
                        <th className="px-5 py-4">Movement total</th>
                        <th className="px-5 py-4">Calculated</th>
                        <th className="px-5 py-4">Current stock</th>
                        <th className="px-5 py-4">Difference</th>
                        <th className="px-5 py-4">Status</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-neutral-100">
                      {items.map((item) => (
                        <tr
                          key={item.product_id}
                          className="transition hover:bg-neutral-50"
                        >
                          <td className="px-5 py-4">
                            <Link
                              href={`/products/${item.product_id}`}
                              className="font-semibold hover:text-red-600"
                            >
                              {item.product_name}
                            </Link>
                            <p className="mt-1 text-xs text-neutral-400">
                              {item.sku ?? "No SKU"}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            {item.opening_balance ?? "—"}
                          </td>

                          <td className="px-5 py-4">
                            {item.movement_total ?? "—"}
                          </td>

                          <td className="px-5 py-4">
                            {item.calculated_stock ?? "—"}
                          </td>

                          <td className="px-5 py-4 font-semibold">
                            {item.current_stock}
                          </td>

                          <td
                            className={`px-5 py-4 font-semibold ${
                              item.difference
                                ? "text-red-600"
                                : "text-neutral-500"
                            }`}
                          >
                            {item.difference ?? "—"}
                          </td>

                          <td className="px-5 py-4">
                            <StatusBadge status={item.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Reconciliation compares recorded balances and ledger movements.
              Products without an opening balance cannot be fully reconciled.
              Detection creates or updates alerts; it does not adjust stock.
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
