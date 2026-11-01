"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  getDiscrepancyAlerts,
  resolveDiscrepancyAlert,
  type StockDiscrepancyAlert,
} from "@/lib/inventory";

type AlertStatus = "open" | "resolved";

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

export default function StockAlertsPage() {
  const [alerts, setAlerts] = useState<StockDiscrepancyAlert[]>([]);
  const [status, setStatus] = useState<AlertStatus>("open");
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedAlert, setSelectedAlert] =
    useState<StockDiscrepancyAlert | null>(null);

  const [resolvedBy, setResolvedBy] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [total, setTotal] = useState(0);

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await getDiscrepancyAlerts(status, 100, 0);

      setAlerts(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load discrepancy alerts.",
      );
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  async function handleResolve() {
    if (!selectedAlert) return;

    if (resolvedBy.trim().length < 2) {
      setError("Enter the name of the person resolving this alert.");
      return;
    }

    if (resolutionNotes.trim().length < 3) {
      setError("Please provide resolution notes.");
      return;
    }

    try {
      setResolvingId(selectedAlert.id);
      setError("");
      setSuccess("");

      await resolveDiscrepancyAlert(selectedAlert.id, {
        resolved_by: resolvedBy.trim(),
        resolution_notes: resolutionNotes.trim(),
      });

      const resolvedAlertId = selectedAlert.id;

      setSelectedAlert(null);
      setResolvedBy("");
      setResolutionNotes("");

      setSuccess(`Discrepancy alert #${resolvedAlertId} resolved.`);

      await loadAlerts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not resolve discrepancy alert.",
      );
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950 md:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
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
                Discrepancy Alerts
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                Review stock discrepancies, investigate their causes, examine
                audit records, and document human resolution decisions.
              </p>
            </div>

            <Link
              href="/inventory/reconciliation"
              className="rounded-xl bg-neutral-950 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Stock reconciliation →
            </Link>
          </div>
        </div>

        {/* Feedback messages */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <span>{error}</span>

            <button
              onClick={() => setError("")}
              className="font-semibold"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
          >
            <span>{success}</span>

            <button
              onClick={() => setSuccess("")}
              className="font-semibold"
              aria-label="Dismiss success message"
            >
              ×
            </button>
          </div>
        )}

        {/* Filters */}
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setStatus("open")}
              aria-pressed={status === "open"}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                status === "open"
                  ? "bg-red-600 text-white"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              Open alerts
            </button>

            <button
              onClick={() => setStatus("resolved")}
              aria-pressed={status === "resolved"}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                status === "resolved"
                  ? "bg-red-600 text-white"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              Resolved history
            </button>
          </div>

          <button
            onClick={() => void loadAlerts()}
            disabled={loading}
            className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </section>

        {/* Alert count */}
        <section className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">
            {status === "open" ? "Open discrepancy alerts" : "Resolved alerts"}
          </p>

          <p className="mt-2 text-3xl font-semibold">{total}</p>
        </section>

        {/* Alert list */}
        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
            Loading discrepancy alerts...
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-xl">
              ✓
            </div>

            <h2 className="mt-4 font-semibold">No {status} alerts</h2>

            <p className="mt-2 text-sm text-neutral-500">
              {status === "open"
                ? "No active stock discrepancies were found."
                : "No resolved discrepancy records are available."}
            </p>

            {status === "open" && (
              <Link
                href="/inventory/reconciliation"
                className="mt-5 inline-flex rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                View reconciliation →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <article
                key={alert.id}
                className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300"
              >
                {/* Alert header */}
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-neutral-400">
                        ALERT #{alert.id}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          alert.status === "open"
                            ? "bg-red-50 text-red-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {alert.status === "open" ? "Open" : "Resolved"}
                      </span>
                    </div>

                    <Link
                      href={`/products/${alert.product_id}`}
                      className="mt-3 block text-lg font-semibold transition hover:text-red-600"
                    >
                      {alert.product_name}
                    </Link>

                    <p className="mt-1 text-xs text-neutral-500">
                      Product ID: {alert.product_id}
                    </p>

                    {/* History navigation */}
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <Link
                        href={`/inventory/alerts/${alert.id}/history`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 transition hover:text-red-700"
                      >
                        <span>◷</span>
                        View audit history
                        <span>→</span>
                      </Link>

                      <Link
                        href={`/products/${alert.product_id}/history`}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 transition hover:text-neutral-900"
                      >
                        <span>↔</span>
                        Product movement history
                        <span>→</span>
                      </Link>
                    </div>
                  </div>

                  {alert.status === "open" && (
                    <button
                      onClick={() => {
                        setSelectedAlert(alert);
                        setError("");
                        setSuccess("");
                      }}
                      className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
                    >
                      Review and resolve
                    </button>
                  )}
                </div>

                {/* Stock comparison */}
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Opening balance</p>

                    <p className="mt-1 text-lg font-semibold">
                      {alert.opening_balance}
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Calculated stock</p>

                    <p className="mt-1 text-lg font-semibold">
                      {alert.calculated_stock}
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Current stock</p>

                    <p className="mt-1 text-lg font-semibold">
                      {alert.current_stock}
                    </p>
                  </div>

                  <div className="rounded-xl bg-red-50 p-3">
                    <p className="text-xs text-red-600">Difference</p>

                    <p className="mt-1 text-lg font-semibold text-red-700">
                      {alert.difference > 0 ? "+" : ""}
                      {alert.difference}
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">
                      Detection occurrences
                    </p>

                    <p className="mt-1 text-lg font-semibold">
                      {alert.occurrences}
                    </p>
                  </div>
                </div>

                {/* Detection timestamps */}
                <div className="mt-5 grid gap-3 border-t border-neutral-100 pt-4 text-xs text-neutral-500 sm:grid-cols-2">
                  <p>First detected: {formatDate(alert.first_detected_at)}</p>

                  <p>Last detected: {formatDate(alert.last_detected_at)}</p>
                </div>

                {/* Resolution details */}
                {alert.status === "resolved" && (
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-emerald-800">
                        Resolution details
                      </p>

                      <span className="text-xs font-medium text-emerald-700">
                        Review recorded
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-emerald-700">
                      Resolved by: {alert.resolved_by ?? "Not recorded"}
                    </p>

                    <p className="mt-1 text-sm text-emerald-700">
                      Resolved at: {formatDate(alert.resolved_at)}
                    </p>

                    <p className="mt-2 text-sm leading-6 text-emerald-800">
                      {alert.resolution_notes ?? "No resolution notes."}
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {/* Resolution modal */}
        {selectedAlert && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
            onMouseDown={(event) => {
              if (
                event.target === event.currentTarget &&
                resolvingId === null
              ) {
                setSelectedAlert(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="resolve-alert-title"
              className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                    Human review required
                  </p>

                  <h2
                    id="resolve-alert-title"
                    className="mt-2 text-xl font-semibold"
                  >
                    Resolve alert #{selectedAlert.id}
                  </h2>

                  <p className="mt-1 text-sm text-neutral-500">
                    {selectedAlert.product_name}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedAlert(null)}
                  disabled={resolvingId !== null}
                  className="text-xl text-neutral-400 transition hover:text-neutral-900 disabled:opacity-50"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm">
                <p className="font-semibold text-red-800">
                  Recorded discrepancy:{" "}
                  {selectedAlert.difference > 0 ? "+" : ""}
                  {selectedAlert.difference} units
                </p>

                <p className="mt-1 text-red-700">
                  Current stock: {selectedAlert.current_stock} · Calculated
                  stock: {selectedAlert.calculated_stock}
                </p>
              </div>

              <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleResolve();
                }}
              >
                <div>
                  <label
                    htmlFor="resolvedBy"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Reviewed by
                  </label>

                  <input
                    id="resolvedBy"
                    value={resolvedBy}
                    onChange={(event) => setResolvedBy(event.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                    disabled={resolvingId !== null}
                    placeholder="Enter reviewer name"
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-red-500 disabled:bg-neutral-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="resolutionNotes"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Resolution notes
                  </label>

                  <textarea
                    id="resolutionNotes"
                    value={resolutionNotes}
                    onChange={(event) => setResolutionNotes(event.target.value)}
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={4}
                    disabled={resolvingId !== null}
                    placeholder="Explain how this discrepancy was reviewed and verified."
                    className="w-full resize-y rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-red-500 disabled:bg-neutral-50"
                  />
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs leading-5 text-amber-800">
                    Resolving this alert records the human review only. It does
                    not change product stock or create a stock movement. Any
                    stock correction must go through the movement approval
                    workflow.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(null)}
                    disabled={resolvingId !== null}
                    className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold transition hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={resolvingId === selectedAlert.id}
                    className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resolvingId === selectedAlert.id
                      ? "Resolving..."
                      : "Confirm resolution"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
