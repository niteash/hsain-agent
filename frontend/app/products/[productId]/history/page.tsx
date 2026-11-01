"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  FileText,
  RefreshCw,
} from "lucide-react";

import { getStockLedger, type StockLedgerItem } from "@/lib/inventory";

const PAGE_SIZE = 20;

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString();
}

function ProductHistoryContent() {
  const params = useParams<{ productId: string }>();
  const productId = Number(params.productId);

  const [movements, setMovements] = useState<StockLedgerItem[]>([]);
  const [product, setProduct] = useState<{
    id: number;
    name: string;
    sku: string | null;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  const loadHistory = useCallback(async () => {
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      setError("Invalid product ID.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await getStockLedger({
        product_id: productId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });

      setMovements(result.items ?? []);

      if (result.items?.length) {
        setProduct(result.items[0].product);
      } else if (page === 0) {
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

        const response = await fetch(`${apiUrl}/api/products/${productId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load product information.");
        }

        const productData = await response.json();

        setProduct({
          id: productData.id,
          name: productData.name,
          sku: productData.sku,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load product history.",
      );
    } finally {
      setLoading(false);
    }
  }, [productId, page]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const totalReceived = movements
    .filter((movement) => movement.quantity_delta > 0)
    .reduce((sum, movement) => sum + movement.quantity_delta, 0);

  const totalDeducted = movements
    .filter((movement) => movement.quantity_delta < 0)
    .reduce((sum, movement) => sum + Math.abs(movement.quantity_delta), 0);

  const hasNextPage = movements.length === PAGE_SIZE;

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/inventory" className="hover:text-red-600">
            Inventory
          </Link>
          <span>/</span>
          <Link href="/products" className="hover:text-red-600">
            Products
          </Link>
          <span>/</span>
          <span className="text-zinc-900">Stock history</span>
        </div>

        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href={`/products/${productId}`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700"
            >
              <ArrowLeft size={15} />
              Back to product
            </Link>

            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
              Inventory audit trail
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">
              {product?.name ?? "Product stock history"}
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              {product?.sku ? `SKU: ${product.sku}` : `Product #${productId}`}
            </p>
          </div>

          <button
            onClick={() => void loadHistory()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">Transactions</p>
            <p className="mt-3 text-3xl font-bold">{movements.length}</p>
            <p className="mt-2 text-xs text-zinc-400">Records on this page</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">Units received</p>
            <p className="mt-3 text-3xl font-bold text-emerald-600">
              +{totalReceived}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Incoming movements on this page
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-500">Units deducted</p>
            <p className="mt-3 text-3xl font-bold text-red-600">
              -{totalDeducted}
            </p>
            <p className="mt-2 text-xs text-zinc-400">
              Outgoing movements on this page
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4">
          <div className="flex gap-3">
            <Boxes className="mt-0.5 shrink-0 text-red-600" size={20} />
            <div>
              <p className="text-sm font-semibold text-red-900">
                Recorded inventory movements
              </p>
              <p className="mt-1 text-xs leading-5 text-red-800">
                This history contains stock ledger entries, not pending
                proposals. The current stock shown is the latest recorded
                product quantity, not a historical running balance.
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 p-5">
            <h2 className="font-bold text-zinc-950">Movement history</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Newest stock movements appear first.
            </p>
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
          ) : movements.length === 0 ? (
            <div className="p-12 text-center">
              <Boxes size={36} className="mx-auto text-zinc-300" />
              <h3 className="mt-4 font-semibold text-zinc-900">
                No stock movements
              </h3>
              <p className="mt-2 text-sm text-zinc-500">
                No approved stock transactions have been recorded for this
                product yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {movements.map((movement) => {
                const receipt = movement.quantity_delta > 0;

                return (
                  <article
                    key={movement.movement_id}
                    className="p-5 transition hover:bg-zinc-50"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                            receipt
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-red-50 text-red-600"
                          }`}
                        >
                          {receipt ? (
                            <ArrowDownLeft size={20} />
                          ) : (
                            <ArrowUpRight size={20} />
                          )}
                        </div>

                        <div>
                          <p className="font-semibold text-zinc-950">
                            {movement.movement_type.replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Movement #{movement.movement_id}
                          </p>
                        </div>
                      </div>

                      <div className="sm:text-right">
                        <p
                          className={`text-lg font-bold ${
                            receipt ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {receipt ? "+" : ""}
                          {movement.quantity_delta} units
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDate(movement.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 rounded-xl bg-zinc-50 p-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-zinc-400">Reason</p>
                        <p className="mt-1 text-sm text-zinc-700">
                          {movement.reason}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-zinc-400">
                          Latest current stock
                        </p>
                        <p className="mt-1 text-sm font-semibold text-zinc-900">
                          {movement.current_stock} units
                        </p>
                      </div>

                      {movement.notes && (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-zinc-400">Notes</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                            {movement.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-4">
                      {movement.evidence_id !== null && (
                        <Link
                          href={`/evidence?evidence_id=${movement.evidence_id}`}
                          className="inline-flex items-center gap-2 text-xs font-semibold text-red-600 hover:text-red-700"
                        >
                          <FileText size={14} />
                          Evidence #{movement.evidence_id}
                        </Link>
                      )}

                      {movement.investigation_id !== null && (
                        <Link
                          href={`/investigations?investigation_id=${movement.investigation_id}`}
                          className="text-xs font-semibold text-zinc-600 hover:text-red-600"
                        >
                          Investigation #{movement.investigation_id}
                        </Link>
                      )}

                      {movement.proposal_id !== null && (
                        <Link
                          href={`/movements?proposal_id=${movement.proposal_id}`}
                          className="text-xs font-semibold text-zinc-600 hover:text-red-600"
                        >
                          Proposal #{movement.proposal_id}
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-zinc-100 p-4">
            <button
              disabled={page === 0 || loading}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              <ArrowLeft size={15} />
              Previous
            </button>

            <span className="text-xs text-zinc-400">Page {page + 1}</span>

            <button
              disabled={movements.length < PAGE_SIZE || loading}
              onClick={() => setPage((value) => value + 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductHistoryFallback() {
  return (
    <main className="min-h-screen bg-[#f7f7f8] p-10 text-center text-sm text-zinc-500">
      Loading product history...
    </main>
  );
}

export default function ProductHistoryPage() {
  return (
    <Suspense fallback={<ProductHistoryFallback />}>
      <ProductHistoryContent />
    </Suspense>
  );
}
