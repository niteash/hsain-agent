"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  Warehouse,
} from "lucide-react";

import { getStockLedger, type StockLedgerItem } from "@/lib/inventory";

const PAGE_SIZE = 20;

type MovementFilter = "all" | "receipt" | "sale";

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isReceipt(movement: StockLedgerItem) {
  return movement.quantity_delta > 0;
}

function getMovementLabel(type: string) {
  const labels: Record<string, string> = {
    receipt: "Goods received",
    sale: "Sale",
    adjustment: "Adjustment",
  };

  return labels[type] ?? type.replaceAll("_", " ");
}

function MovementBadge({ movement }: { movement: StockLedgerItem }) {
  const receipt = isReceipt(movement);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
        receipt ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {receipt ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}

      {getMovementLabel(movement.movement_type)}
    </span>
  );
}

function QuantityChange({ value }: { value: number }) {
  const positive = value > 0;

  return (
    <span
      className={`font-bold ${positive ? "text-emerald-600" : "text-red-600"}`}
    >
      {positive ? "+" : ""}
      {value.toLocaleString()} units
    </span>
  );
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-sm font-medium text-zinc-500">{label}</p>

      <p className="mt-3 text-2xl font-bold text-zinc-950">{value}</p>

      <p className="mt-2 text-xs text-zinc-400">{description}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-14 text-center">
      <Boxes className="mx-auto text-zinc-300" size={36} />

      <h3 className="mt-4 font-semibold text-zinc-800">No movements found</h3>

      <p className="mt-2 text-sm text-zinc-500">{message}</p>
    </div>
  );
}

export default function InventoryTimelinePage() {
  const [movements, setMovements] = useState<StockLedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MovementFilter>("all");

  const loadMovements = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getStockLedger({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });

      setMovements(result.items ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load stock movements.",
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const filteredMovements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return movements.filter((movement) => {
      const matchesSearch =
        !query ||
        movement.product.name.toLowerCase().includes(query) ||
        (movement.product.sku ?? "").toLowerCase().includes(query) ||
        movement.reason.toLowerCase().includes(query) ||
        (movement.notes ?? "").toLowerCase().includes(query);

      const matchesFilter =
        filter === "all" || movement.movement_type === filter;

      return matchesSearch && matchesFilter;
    });
  }, [movements, search, filter]);

  const totalReceived = movements
    .filter(isReceipt)
    .reduce((sum, movement) => sum + movement.quantity_delta, 0);

  const totalDeducted = movements
    .filter((movement) => movement.quantity_delta < 0)
    .reduce((sum, movement) => sum + Math.abs(movement.quantity_delta), 0);

  const hasNextPage = movements.length === PAGE_SIZE;

  return (
    <main className="min-h-screen bg-[#f7f7f8]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/" className="hover:text-red-600">
            Dashboard
          </Link>

          <span>/</span>

          <Link href="/inventory" className="hover:text-red-600">
            Inventory
          </Link>

          <span>/</span>

          <span className="font-medium text-zinc-900">Movement Timeline</span>
        </div>

        {/* Header */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
              Inventory operations
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">
              Stock Movement Timeline
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              A chronological record of approved stock transactions. Track goods
              received, sales deductions, and their supporting evidence.
            </p>
          </div>

          <button
            onClick={() => void loadMovements()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </header>

        {/* Summary */}
        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Transactions on this page"
            value={movements.length}
            description="Approved stock ledger entries"
          />

          <SummaryCard
            label="Units received"
            value={`+${totalReceived.toLocaleString()}`}
            description="Incoming stock on this page"
          />

          <SummaryCard
            label="Units deducted"
            value={`-${totalDeducted.toLocaleString()}`}
            description="Outgoing stock on this page"
          />
        </section>

        {/* Information notice */}
        <div className="mb-6 flex gap-3 rounded-xl border border-red-100 bg-red-50/70 p-4">
          <Warehouse size={19} className="mt-0.5 shrink-0 text-red-600" />

          <div>
            <p className="text-sm font-semibold text-red-900">
              Verified stock ledger
            </p>

            <p className="mt-1 text-xs leading-5 text-red-800">
              This timeline displays recorded stock movements. Pending proposals
              and rejected movements are not included. The current stock shown
              is the product's latest recorded quantity, not its historical
              balance at transaction time.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}

            <button
              onClick={() => void loadMovements()}
              className="ml-2 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Filters */}
        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />

              <input
                type="search"
                placeholder="Search product, SKU, or reason..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All movements"],
                  ["receipt", "Receipts"],
                  ["sale", "Sales"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    filter === value
                      ? "bg-zinc-950 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Movement records */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-5">
            <div>
              <h2 className="font-bold text-zinc-950">Transaction records</h2>

              <p className="mt-1 text-xs text-zinc-500">
                Newest transactions appear first.
              </p>
            </div>

            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
              Page {page + 1}
            </span>
          </div>

          {loading ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-24 animate-pulse rounded-xl bg-zinc-100"
                />
              ))}
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="p-6">
              <EmptyState
                message={
                  movements.length === 0
                    ? "No approved stock movements have been recorded yet."
                    : "Try changing your search or movement filter."
                }
              />
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filteredMovements.map((movement) => (
                <article
                  key={movement.movement_id}
                  className="p-5 transition hover:bg-zinc-50/70"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    {/* Product information */}
                    <div className="flex min-w-0 gap-4">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          isReceipt(movement)
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {isReceipt(movement) ? (
                          <ArrowDownLeft size={21} />
                        ) : (
                          <ArrowUpRight size={21} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <Link
                          href={`/products/${movement.product.id}`}
                          className="font-bold text-zinc-950 hover:text-red-600"
                        >
                          {movement.product.name}
                        </Link>

                        <p className="mt-1 text-xs text-zinc-500">
                          SKU: {movement.product.sku ?? "Not assigned"}
                          {" · "}
                          Movement #{movement.movement_id}
                        </p>

                        <div className="mt-3">
                          <MovementBadge movement={movement} />
                        </div>
                      </div>
                    </div>

                    {/* Quantity and current stock */}
                    <div className="flex flex-wrap items-center gap-8 lg:justify-end">
                      <div>
                        <p className="text-xs text-zinc-400">Quantity change</p>

                        <p className="mt-2">
                          <QuantityChange value={movement.quantity_delta} />
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-zinc-400">Current stock</p>

                        <p className="mt-2 font-bold text-zinc-900">
                          {movement.current_stock.toLocaleString()} units
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Transaction details */}
                  <div className="mt-5 grid gap-4 rounded-xl bg-zinc-50 p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                        Reason
                      </p>

                      <p className="mt-1 text-sm text-zinc-700">
                        {movement.reason || "Not provided"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                        Transaction date
                      </p>

                      <p className="mt-1 text-sm text-zinc-700">
                        {formatDate(movement.created_at)}
                      </p>
                    </div>

                    {movement.notes && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                          Notes
                        </p>

                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                          {movement.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* References */}
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {movement.evidence_id !== null && (
                      <Link
                        href={`/evidence?evidence_id=${movement.evidence_id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
                      >
                        <FileText size={14} />
                        Evidence #{movement.evidence_id}
                        <ExternalLink size={12} />
                      </Link>
                    )}

                    {movement.investigation_id !== null && (
                      <Link
                        href={`/investigations?investigation_id=${movement.investigation_id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-red-600"
                      >
                        <ExternalLink size={13} />
                        Investigation #{movement.investigation_id}
                      </Link>
                    )}

                    {movement.proposal_id !== null && (
                      <span className="text-xs text-zinc-400">
                        Proposal #{movement.proposal_id}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-5 py-4">
            <button
              disabled={page === 0 || loading}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft size={15} />
              Previous
            </button>

            <p className="text-xs text-zinc-400">
              Page {page + 1} · {movements.length} records loaded
            </p>

            <button
              disabled={!hasNextPage || loading}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </section>

        {/* Footer */}
        <div className="mt-6">
          <Link
            href="/inventory"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-red-600"
          >
            <ArrowLeft size={15} />
            Back to inventory overview
          </Link>
        </div>
      </div>
    </main>
  );
}
