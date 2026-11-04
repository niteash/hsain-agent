"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  getStockReconciliation,
  getDiscrepancyAlerts,
  getStockLedger,
  getPendingMovements,
  type StockReconciliation,
  type StockDiscrepancyAlert,
  type StockLedgerItem,
  type PendingMovementList,
} from "@/lib/inventory";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Product = {
  product_id: number;
  product_name: string;
  current_stock: number;
};

type OpeningBalanceForm = {
  opening_quantity: string;
  source: string;
  recorded_by: string;
  notes: string;
  effective_at: string;
};

const INITIAL_FORM: OpeningBalanceForm = {
  opening_quantity: "",
  source: "Physical stock count",
  recorded_by: "",
  notes: "",
  effective_at: "",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function MetricCard({
  label,
  value,
  description,
  accent = "black",
}: {
  label: string;
  value: number;
  description: string;
  accent?: "red" | "green" | "amber" | "black";
}) {
  const colors = {
    red: "text-red-600",
    green: "text-emerald-600",
    amber: "text-amber-600",
    black: "text-zinc-950",
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className={`mt-3 text-3xl font-bold ${colors[accent]}`}>
        {formatNumber(value)}
      </p>
      <p className="mt-2 text-xs text-zinc-400">{description}</p>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    reconciled: "bg-emerald-50 text-emerald-700",
    discrepancy: "bg-red-50 text-red-700",
    missing_opening_balance: "bg-amber-50 text-amber-700",
  };

  const labels: Record<string, string> = {
    reconciled: "Reconciled",
    discrepancy: "Discrepancy",
    missing_opening_balance: "Missing baseline",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-zinc-100 text-zinc-600"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function SectionHeader({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-zinc-950">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>

      {href && (
        <Link
          href={href}
          className="text-sm font-semibold text-red-600 hover:text-red-700"
        >
          {linkLabel ?? "View all"} →
        </Link>
      )}
    </div>
  );
}

export default function InventoryDashboardPage() {
  const [reconciliation, setReconciliation] =
    useState<StockReconciliation | null>(null);

  const [alerts, setAlerts] = useState<StockDiscrepancyAlert[]>([]);
  const [ledger, setLedger] = useState<StockLedgerItem[]>([]);
  const [pending, setPending] = useState<PendingMovementList | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<OpeningBalanceForm>(INITIAL_FORM);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [reconciliationResult, alertResult, ledgerResult, pendingResult] =
        await Promise.all([
          getStockReconciliation(),
          getDiscrepancyAlerts("open", 5, 0),
          getStockLedger({ limit: 8, offset: 0 }),
          getPendingMovements(),
        ]);

      setReconciliation(reconciliationResult);
      setAlerts(alertResult.items ?? []);
      setLedger(ledgerResult.items ?? []);
      setPending(pendingResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load inventory dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDashboard]);

  const openForm = (product: Product) => {
    setSelectedProduct(product);
    setForm(INITIAL_FORM);
    setFormError("");
    setSuccessMessage("");
  };

  const closeForm = () => {
    if (submitting) return;
    setSelectedProduct(null);
    setForm(INITIAL_FORM);
    setFormError("");
  };

  const updateField = (field: keyof OpeningBalanceForm, value: string) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const submitOpeningBalance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedProduct) return;

    setFormError("");

    const quantity = Number(form.opening_quantity);

    if (
      form.opening_quantity.trim() === "" ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      setFormError("Enter a valid whole-number opening quantity.");
      return;
    }

    if (form.source.trim().length < 2) {
      setFormError("Source must contain at least 2 characters.");
      return;
    }

    if (form.recorded_by.trim().length < 2) {
      setFormError("Recorded by must contain at least 2 characters.");
      return;
    }

    let effectiveAt: string | null = null;

    if (form.effective_at) {
      const date = new Date(form.effective_at);

      if (Number.isNaN(date.getTime())) {
        setFormError("Enter a valid effective date.");
        return;
      }

      effectiveAt = date.toISOString();
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/inventory-movements/products/${selectedProduct.product_id}/opening-balance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            opening_quantity: quantity,
            source: form.source.trim(),
            recorded_by: form.recorded_by.trim(),
            notes: form.notes.trim(),
            effective_at: effectiveAt,
          }),
        },
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof result?.detail === "string"
            ? result.detail
            : "Unable to record opening balance.",
        );
      }

      setSuccessMessage(
        `${selectedProduct.product_name}: opening balance set to ${formatNumber(quantity)} units.`,
      );

      setSelectedProduct(null);
      setForm(INITIAL_FORM);

      await loadDashboard();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Unable to record opening balance.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const totalStock =
    reconciliation?.items.reduce(
      (total, product) => total + product.current_stock,
      0,
    ) ?? 0;

  const discrepancies =
    reconciliation?.items.filter((item) => item.status === "discrepancy") ?? [];

  const missingBalances =
    reconciliation?.items.filter(
      (item) => item.status === "missing_opening_balance",
    ) ?? [];

  return (
    <main className="min-h-screen bg-[#f7f7f8]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        {/* HEADER */}
        <header className="mb-8">
          <div className="mb-3 text-sm text-zinc-500">
            <Link href="/" className="hover:text-red-600">
              Dashboard
            </Link>
            {" / "}
            <span className="text-zinc-900">Inventory</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
                Inventory operations
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">
                Inventory Overview
              </h1>

              <p className="mt-2 text-sm text-zinc-500">
                Monitor stock positions, transactions, and discrepancies.
              </p>
            </div>

            <button
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </header>

        {/* ERROR */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
            <button
              onClick={() => void loadDashboard()}
              className="ml-2 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* SUCCESS */}
        {successMessage && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {successMessage}
            <button
              onClick={() => setSuccessMessage("")}
              aria-label="Dismiss"
              className="font-semibold"
            >
              ✕
            </button>
          </div>
        )}

        {loading && !reconciliation ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
            Loading inventory data...
          </div>
        ) : (
          <>
            {/* METRICS */}
            <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total products"
                value={reconciliation?.total_products ?? 0}
                description="Registered inventory items"
              />

              <MetricCard
                label="Total stock units"
                value={totalStock}
                description="Current recorded quantities"
              />

              <MetricCard
                label="Reconciled products"
                value={reconciliation?.reconciled ?? 0}
                description="Matching ledger calculations"
                accent="green"
              />

              <MetricCard
                label="Discrepancies"
                value={reconciliation?.discrepancies ?? 0}
                description="Stock values that do not match"
                accent="red"
              />
            </section>

            <section className="mb-8 grid gap-4 sm:grid-cols-2">
              <MetricCard
                label="Missing opening balances"
                value={reconciliation?.missing_opening_balances ?? 0}
                description="Products without a verified baseline"
                accent="amber"
              />

              <MetricCard
                label="Pending movement approvals"
                value={pending?.total ?? 0}
                description="Evidence-backed proposals awaiting review"
              />
            </section>

            {/* QUICK ACTIONS */}
            <section className="mb-8">
              <SectionHeader
                title="Inventory operations"
                description="Navigate to inventory control workflows."
              />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <QuickAction
                  title="Movement ledger"
                  description="Review approved stock transactions."
                  href="/inventory/timeline"
                  number="01"
                />

                <QuickAction
                  title="Reconciliation"
                  description="Compare calculated and recorded stock."
                  href="/inventory/reconciliation"
                  number="02"
                />

                <QuickAction
                  title="Discrepancy alerts"
                  description="Investigate stock differences."
                  href="/inventory/alerts"
                  number="03"
                />

                <QuickAction
                  title="Products"
                  description="Manage your product catalogue."
                  href="/products"
                  number="04"
                />

                <QuickAction
                  title="Reorder Intelligence"
                  description="Review stock risks and reorder recommendations."
                  href="/inventory/reorder"
                  number="05"
                  featured
                />

                <QuickAction
                  title="Supplier Orders"
                  description="Create and review supplier orders."
                  href="/orders"
                  number="06"
                  featured
                />
              </div>
            </section>

            {/* OPENING BALANCE MANAGEMENT */}
            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              <SectionHeader
                title="Opening stock management"
                description="Initialize inventory using verified physical stock counts."
              />

              {missingBalances.length === 0 ? (
                <EmptyState message="All products have an opening balance." />
              ) : (
                <div className="space-y-3">
                  {missingBalances.map((product) => (
                    <div
                      key={product.product_id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-100 bg-amber-50/50 p-4"
                    >
                      <div>
                        <Link
                          href={`/products/${product.product_id}`}
                          className="font-semibold text-zinc-900 hover:text-red-600"
                        >
                          {product.product_name}
                        </Link>

                        <p className="mt-1 text-xs text-zinc-500">
                          Product ID: {product.product_id}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          Current recorded stock:{" "}
                          {formatNumber(product.current_stock)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge status={product.status} />

                        <button
                          onClick={() =>
                            openForm({
                              product_id: product.product_id,
                              product_name: product.product_name,
                              current_stock: product.current_stock,
                            })
                          }
                          disabled={product.current_stock !== 0}
                          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
                        >
                          + Set opening stock
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* DISCREPANCIES */}
            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              <SectionHeader
                title="Products requiring attention"
                description="Products whose recorded stock differs from calculated stock."
                href="/inventory/reconciliation"
                linkLabel="View reconciliation"
              />

              {discrepancies.length === 0 ? (
                <EmptyState message="No stock discrepancies detected." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-zinc-100 text-xs uppercase text-zinc-400">
                      <tr>
                        <th className="py-3 pr-4">Product</th>
                        <th className="px-4 py-3">Calculated</th>
                        <th className="px-4 py-3">Recorded</th>
                        <th className="px-4 py-3">Difference</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-zinc-100">
                      {discrepancies.slice(0, 5).map((item) => (
                        <tr key={item.product_id}>
                          <td className="py-4 pr-4">
                            <Link
                              href={`/products/${item.product_id}`}
                              className="font-semibold text-zinc-900 hover:text-red-600"
                            >
                              {item.product_name}
                            </Link>
                          </td>

                          <td className="px-4 py-4">{item.calculated_stock}</td>

                          <td className="px-4 py-4">{item.current_stock}</td>

                          <td className="px-4 py-4 font-semibold text-red-600">
                            {item.difference !== null && item.difference > 0
                              ? `+${item.difference}`
                              : item.difference}
                          </td>

                          <td className="px-4 py-4">
                            <Badge status={item.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ACTIVE ALERTS */}
            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              <SectionHeader
                title="Active discrepancy alerts"
                description="Previously detected discrepancy records that remain open."
                href="/inventory/alerts"
              />

              {alerts.length === 0 ? (
                <EmptyState message="No open discrepancy alerts." />
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-100 p-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {alert.product_name}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          Alert #{alert.id} · {alert.occurrences} detection(s)
                        </p>

                        <p className="mt-1 text-xs text-zinc-400">
                          Last detected: {formatDate(alert.last_detected_at)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-bold text-red-600">
                          {alert.difference > 0
                            ? `+${alert.difference}`
                            : alert.difference}{" "}
                          units
                        </p>
                        <span className="text-xs font-semibold text-red-600">
                          Open alert
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* RECENT MOVEMENTS */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              <SectionHeader
                title="Recent stock movements"
                description="Latest entries from the approved stock movement ledger."
                href="/inventory/timeline"
              />

              {ledger.length === 0 ? (
                <EmptyState message="No stock movement ledger entries are available." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-zinc-100 text-xs uppercase text-zinc-400">
                      <tr>
                        <th className="py-3 pr-4">Product</th>
                        <th className="px-4 py-3">Movement</th>
                        <th className="px-4 py-3">Quantity change</th>
                        <th className="px-4 py-3">Current stock</th>
                        <th className="px-4 py-3">Date</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-zinc-100">
                      {ledger.map((movement) => (
                        <tr key={movement.movement_id}>
                          <td className="py-4 pr-4">
                            <Link
                              href={`/products/${movement.product.id}/history`}
                              className="font-semibold text-zinc-900 hover:text-red-600"
                            >
                              {movement.product.name}
                            </Link>
                          </td>

                          <td className="px-4 py-4 capitalize text-zinc-600">
                            {movement.movement_type}
                          </td>

                          <td
                            className={`px-4 py-4 font-semibold ${
                              movement.quantity_delta > 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {movement.quantity_delta > 0 ? "+" : ""}
                            {movement.quantity_delta}
                          </td>

                          <td className="px-4 py-4">
                            {movement.current_stock}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-xs text-zinc-500">
                            {formatDate(movement.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* OPENING BALANCE MODAL */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <div className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-zinc-100 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-red-600">
                  Inventory initialization
                </p>

                <h2 className="mt-2 text-xl font-bold text-zinc-950">
                  Set opening stock
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {selectedProduct.product_name}
                </p>
              </div>

              <button
                onClick={closeForm}
                disabled={submitting}
                aria-label="Close form"
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitOpeningBalance} className="space-y-5 p-6">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">
                  Verify the physical stock before submitting.
                </p>

                <p className="mt-1 text-xs leading-5 text-amber-800">
                  This initializes both the opening balance and current recorded
                  stock. An opening balance can only be created once per product
                  through this endpoint.
                </p>
              </div>

              <FormField label="Opening quantity" required>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={form.opening_quantity}
                  onChange={(event) =>
                    updateField("opening_quantity", event.target.value)
                  }
                  placeholder="e.g. 100"
                  className="form-input"
                />
              </FormField>

              <FormField label="Source" required>
                <input
                  type="text"
                  minLength={2}
                  maxLength={120}
                  required
                  value={form.source}
                  onChange={(event) =>
                    updateField("source", event.target.value)
                  }
                  placeholder="Physical stock count"
                  className="form-input"
                />
              </FormField>

              <FormField label="Recorded by" required>
                <input
                  type="text"
                  minLength={2}
                  maxLength={120}
                  required
                  value={form.recorded_by}
                  onChange={(event) =>
                    updateField("recorded_by", event.target.value)
                  }
                  placeholder="Enter operator name"
                  className="form-input"
                />
              </FormField>

              <FormField label="Effective date">
                <input
                  type="datetime-local"
                  value={form.effective_at}
                  onChange={(event) =>
                    updateField("effective_at", event.target.value)
                  }
                  className="form-input"
                />

                <p className="mt-1 text-xs text-zinc-400">
                  Leave empty to use the current date and time.
                </p>
              </FormField>

              <FormField label="Notes">
                <textarea
                  maxLength={2000}
                  rows={3}
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  placeholder="Additional stock count details..."
                  className="form-input resize-none"
                />
              </FormField>

              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-100 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Recording..." : "Confirm opening stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .form-input {
          width: 100%;
          border: 1px solid #e4e4e7;
          border-radius: 0.75rem;
          padding: 0.75rem 0.875rem;
          font-size: 0.875rem;
          color: #18181b;
          background: white;
          outline: none;
          transition: border-color 150ms ease;
        }

        .form-input:focus {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgb(220 38 38 / 8%);
        }

        .form-input::placeholder {
          color: #a1a1aa;
        }
      `}</style>
    </main>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-zinc-800">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      {children}
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
  number,
  featured = false,
}: {
  title: string;
  description: string;
  href: string;
  number: string;
  featured?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md ${
        featured
          ? "border-red-200 bg-red-50/50 hover:border-red-400"
          : "border-zinc-200 bg-white hover:border-red-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-red-600">{number}</span>
        <span className="text-zinc-400 transition group-hover:translate-x-1 group-hover:text-red-600">
          →
        </span>
      </div>

      <h3 className="mt-5 font-bold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm leading-5 text-zinc-500">{description}</p>
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}
