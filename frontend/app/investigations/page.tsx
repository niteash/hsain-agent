"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ProductSelector from "@/components/investigations/ProductSelector";

import { getProducts } from "@/lib/products";
import {
  generateAIInvestigation,
  getProductAIInvestigationReports,
} from "@/lib/investigations";

import type { Product } from "@/types/product";
import type { AIInvestigationReportListItem } from "@/types/investigation";

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const completed = status.toLowerCase() === "completed";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        completed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default function InvestigationsPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null,
  );

  const [reports, setReports] = useState<AIInvestigationReportListItem[]>([]);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState("");

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );

  // Load products.
  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        setLoadingProducts(true);
        setError("");

        const result = await getProducts();

        if (!active) return;

        setProducts(result);

        if (result.length > 0) {
          setSelectedProductId(result[0].id);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Unable to load products.",
          );
        }
      } finally {
        if (active) {
          setLoadingProducts(false);
        }
      }
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  // Load report history whenever the selected product changes.
  const loadReports = useCallback(async () => {
    if (!selectedProductId) {
      setReports([]);
      return;
    }

    try {
      setLoadingReports(true);
      setError("");

      const result = await getProductAIInvestigationReports(selectedProductId, {
        skip: 0,
        limit: 20,
      });

      setReports(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load investigation history.",
      );
    } finally {
      setLoadingReports(false);
    }
  }, [selectedProductId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Generate an AI investigation.
  async function handleGenerateReport() {
    if (!selectedProductId || generating) return;

    try {
      setGenerating(true);
      setError("");

      const result = await generateAIInvestigation(selectedProductId);

      router.push(`/investigations/${result.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate AI investigation.",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-10 flex flex-col justify-between gap-5 border-b border-zinc-200 pb-8 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-600" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
                Hsain Agent / Intelligence
              </span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-zinc-950 md:text-5xl">
              AI Investigations
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
              Investigate inventory discrepancies using historical records,
              verified stock movements and supporting evidence.
            </p>
          </div>

          <button
            onClick={() => router.push("/")}
            className="w-fit rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
          >
            ← Back to Dashboard
          </button>
        </header>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* Product selection */}
        <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">
              Investigation workspace
            </p>

            <h2 className="mt-2 text-xl font-bold text-zinc-950">
              Choose inventory item
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Select a product to inspect its inventory history and generate an
              AI investigation report.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <ProductSelector
              products={products}
              selectedProductId={selectedProductId}
              onSelect={setSelectedProductId}
              loading={loadingProducts}
            />

            <button
              onClick={handleGenerateReport}
              disabled={!selectedProductId || generating || loadingProducts}
              className="flex min-h-12 items-center justify-center gap-3 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating report...
                </>
              ) : (
                <>
                  Generate AI Report
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Selected product overview */}
        {selectedProduct && (
          <section className="mb-10">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-950">
                Inventory overview
              </h2>

              <span className="text-xs font-medium text-zinc-400">
                Product ID: #{selectedProduct.id}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Product
                </p>

                <h3 className="mt-3 text-xl font-bold text-zinc-950">
                  {selectedProduct.name}
                </h3>

                <p className="mt-2 text-sm text-zinc-500">
                  SKU: {selectedProduct.sku ?? "Not assigned"}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Current stock
                </p>

                <p className="mt-3 text-4xl font-bold tracking-tight text-zinc-950">
                  {selectedProduct.current_stock}
                </p>

                <p className="mt-2 text-sm text-zinc-500">
                  Units recorded in inventory
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-black p-6 text-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  AI investigation
                </p>

                <p className="mt-3 text-4xl font-bold">{reports.length}</p>

                <p className="mt-2 text-sm text-zinc-400">
                  Previously generated reports
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Report history */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">
                Investigation archive
              </p>

              <h2 className="mt-2 text-xl font-bold text-zinc-950">
                Report history
              </h2>
            </div>

            <span className="text-sm text-zinc-400">
              {reports.length} reports
            </span>
          </div>

          {loadingReports ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
              Loading investigation history...
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl text-red-600">
                ✦
              </div>

              <h3 className="mt-4 font-bold text-zinc-900">
                No investigation reports yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Generate an AI investigation to analyze this product's inventory
                position, historical findings and possible discrepancies.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => router.push(`/investigations/${report.id}`)}
                  className="flex w-full flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 text-left transition hover:border-red-300 hover:shadow-sm md:flex-row md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-bold text-zinc-950">
                        Investigation #{report.id}
                      </h3>

                      <StatusBadge status={report.status} />
                    </div>

                    <p className="mt-2 text-sm text-zinc-500">
                      {report.product_name}
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      Model: {report.model}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-5 md:justify-end">
                    <span className="text-xs text-zinc-400">
                      {formatDate(report.created_at)}
                    </span>

                    <span className="font-semibold text-red-600">
                      View report →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-zinc-200 pt-6">
          <p className="text-xs leading-5 text-zinc-400">
            Hsain Agent · AI-generated findings are decision-support
            information. Inventory changes require authorized human approval.
          </p>
        </footer>
      </div>
    </main>
  );
}
