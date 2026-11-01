"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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
  accent,
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

      <p className={`mt-3 text-3xl font-bold ${colors[accent ?? "black"]}`}>
        {formatNumber(value)}
      </p>

      <p className="mt-2 text-xs text-zinc-400">{description}</p>
    </div>
  );
}

function ReconciliationBadge({ status }: { status: string }) {
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
    void loadDashboard();
  }, [loadDashboard]);

  const totalStock =
    reconciliation?.items.reduce(
      (total, product) => total + product.current_stock,
      0,
    ) ?? 0;

  const recentDiscrepancies =
    reconciliation?.items.filter((item) => item.status === "discrepancy") ?? [];

  return (
    <main className="min-h-screen bg-[#f7f7f8]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        {/* Header */}
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
                Monitor stock positions, transaction history, and inventory
                discrepancies.
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

        {loading && !reconciliation ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
            Loading inventory data...
          </div>
        ) : (
          <>
            {/* Metrics */}
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

            {/* Secondary metrics */}
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
                accent="black"
              />
            </section>

            {/* Quick actions */}
            <section className="mb-8">
              <SectionHeader
                title="Inventory operations"
                description="Navigate to inventory control workflows."
              />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              </div>
            </section>

            {/* Discrepancies */}
            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              <SectionHeader
                title="Products requiring attention"
                description="Products whose recorded stock differs from calculated stock."
                href="/inventory/reconciliation"
                linkLabel="View reconciliation"
              />

              {recentDiscrepancies.length === 0 ? (
                <EmptyState message="No stock discrepancies detected by the current reconciliation." />
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
                      {recentDiscrepancies.slice(0, 5).map((item) => (
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
                            <ReconciliationBadge status={item.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Opening balances */}
            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              <SectionHeader
                title="Opening balance coverage"
                description="Products that need a verified starting stock quantity."
                href="/inventory/reconciliation"
                linkLabel="View all"
              />

              <div className="space-y-3">
                {(reconciliation?.items ?? [])
                  .filter((item) => item.status === "missing_opening_balance")
                  .slice(0, 5)
                  .map((item) => (
                    <div
                      key={item.product_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-4"
                    >
                      <div>
                        <Link
                          href={`/products/${item.product_id}`}
                          className="text-sm font-semibold text-zinc-900 hover:text-red-600"
                        >
                          {item.product_name}
                        </Link>

                        <p className="mt-1 text-xs text-zinc-500">
                          Current recorded stock: {item.current_stock}
                        </p>
                      </div>

                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                        Baseline required
                      </span>
                    </div>
                  ))}

                {reconciliation?.missing_opening_balances === 0 && (
                  <EmptyState message="Every product has an opening balance." />
                )}
              </div>
            </section>

            {/* Recent alerts */}
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

            {/* Recent movements */}
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

                          <td className="px-4 py-4 whitespace-nowrap text-xs text-zinc-500">
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
    </main>
  );
}

function QuickAction({
  title,
  description,
  href,
  number,
}: {
  title: string;
  description: string;
  href: string;
  number: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
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
