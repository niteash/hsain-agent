"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  decideMovementProposal,
  getMovementProposals,
  getEvidenceDownloadUrl,
  type MovementProposal,
  type MovementStatus,
} from "@/lib/api";

type Filter = "all" | MovementStatus;

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_approval: "bg-amber-50 text-amber-700",
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-neutral-100 text-neutral-600"
      }`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-4">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-neutral-900">
        {value === null || value === undefined || value === ""
          ? "Not available"
          : String(value)}
      </p>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function MovementApprovalPage() {
  const [items, setItems] = useState<MovementProposal[]>([]);
  const [selected, setSelected] = useState<MovementProposal | null>(null);

  const [filter, setFilter] = useState<Filter>("pending_approval");

  const [reviewer, setReviewer] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getMovementProposals(
        filter === "all" ? undefined : { status: filter },
      );

      setItems(result.items ?? []);

      setSelected((current) => {
        if (!current) return null;

        return result.items.find((item) => item.id === current.id) ?? null;
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load movement proposals.",
      );
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const pendingCount = items.filter(
    (item) => item.status === "pending_approval",
  ).length;

  const approvedCount = items.filter(
    (item) => item.status === "approved",
  ).length;

  const rejectedCount = items.filter(
    (item) => item.status === "rejected",
  ).length;

  async function handleDecision(decision: "approve" | "reject") {
    if (!selected || processing) return;

    if (reviewer.trim().length < 2) {
      setError("Enter the reviewer's name.");
      return;
    }

    if (decision === "reject" && rejectionReason.trim().length < 5) {
      setError("Provide a rejection reason of at least 5 characters.");
      return;
    }

    const confirmed = window.confirm(
      decision === "approve"
        ? "Approve this movement and update product stock?"
        : "Reject this movement proposal?",
    );

    if (!confirmed) return;

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const result = await decideMovementProposal(selected.id, {
        decision,
        approved_by: reviewer.trim(),
        rejection_reason:
          decision === "reject" ? rejectionReason.trim() : undefined,
      });

      setSelected(result);

      setSuccess(
        decision === "approve"
          ? `Movement approved. Updated stock: ${result.updated_stock ?? "updated"}.`
          : "Movement proposal rejected.",
      );

      setReviewer("");
      setRejectionReason("");

      await loadProposals();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process movement decision.",
      );
    } finally {
      setProcessing(false);
    }
  }

  const projectedStock =
    selected?.current_stock !== null && selected?.current_stock !== undefined
      ? selected.current_stock + selected.quantity_delta
      : null;

  return (
    <main className="min-h-screen bg-[#f8f8f7] px-5 py-8 text-neutral-900 md:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-9">
          <Link
            href="/"
            className="mb-3 inline-flex text-sm text-neutral-500 hover:text-red-600"
          >
            ← Back to dashboard
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
                Inventory operations
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                Movement Approval Center
              </h1>

              <p className="mt-2 text-sm text-neutral-500">
                Review evidence-backed stock movements before they affect
                inventory.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadProposals()}
              disabled={loading}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">Pending approval</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              {pendingCount}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">Approved</p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              {approvedCount}
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-xs text-neutral-500">Rejected</p>
            <p className="mt-2 text-3xl font-bold text-red-600">
              {rejectedCount}
            </p>
          </div>
        </section>

        <div className="mb-5 flex flex-wrap gap-2">
          {(
            [
              ["pending_approval", "Pending"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
              ["all", "All movements"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setFilter(value);
                setSelected(null);
                setError("");
                setSuccess("");
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                filter === value
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-semibold">Movement proposals</h2>
              <span className="text-xs text-neutral-400">
                {items.length} record(s)
              </span>
            </div>

            {loading ? (
              <p className="rounded-xl bg-neutral-50 p-5 text-center text-sm text-neutral-500">
                Loading proposals...
              </p>
            ) : items.length === 0 ? (
              <p className="rounded-xl bg-neutral-50 p-5 text-center text-sm text-neutral-500">
                No movement proposals found.
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setError("");
                      setSuccess("");
                      setRejectionReason("");
                    }}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      selected?.id === item.id
                        ? "border-red-300 bg-red-50"
                        : "border-neutral-100 hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {item.product_name ?? `Product #${item.product_id}`}
                        </p>

                        <p className="mt-1 text-xs capitalize text-neutral-500">
                          {item.movement_type} · {item.quantity} units
                        </p>
                      </div>

                      <StatusBadge status={item.status} />
                    </div>

                    <p className="mt-3 text-xs text-neutral-400">
                      Proposal #{item.id} · Evidence #{item.evidence_id}
                    </p>

                    <p className="mt-1 text-xs text-neutral-400">
                      {formatDate(item.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-6">
            {!selected ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-8 text-center">
                <span className="mb-4 text-5xl">⚖️</span>

                <h2 className="text-lg font-semibold">
                  Select a movement proposal
                </h2>

                <p className="mt-2 max-w-sm text-sm text-neutral-500">
                  Review the source evidence, product identity and stock impact.
                </p>
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Proposal #{selected.id}
                      </p>

                      <h2 className="mt-2 text-xl font-bold">
                        {selected.product_name ??
                          `Product #${selected.product_id}`}
                      </h2>

                      <p className="mt-1 text-sm text-neutral-500">
                        {selected.product_sku
                          ? `SKU: ${selected.product_sku}`
                          : "SKU unavailable"}
                      </p>
                    </div>

                    <StatusBadge status={selected.status} />
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <InfoCard
                      label="Movement type"
                      value={selected.movement_type}
                    />

                    <InfoCard
                      label="Proposed quantity"
                      value={selected.quantity}
                    />

                    <InfoCard
                      label="Stock change"
                      value={
                        selected.quantity_delta > 0
                          ? `+${selected.quantity_delta}`
                          : selected.quantity_delta
                      }
                    />

                    <InfoCard
                      label="Investigation"
                      value={`#${selected.investigation_id}`}
                    />

                    <InfoCard
                      label="Evidence"
                      value={selected.evidence_filename}
                    />

                    <InfoCard
                      label="Created"
                      value={formatDate(selected.created_at)}
                    />
                  </div>

                  <div className="mt-5 rounded-xl bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Proposal reason
                    </p>

                    <p className="mt-2 text-sm leading-6 text-neutral-700">
                      {selected.reason}
                    </p>
                  </div>

                  {selected.evidence_filename && (
                    <a
                      href={getEvidenceDownloadUrl(selected.evidence_id)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold hover:bg-neutral-50"
                    >
                      View source document ↗
                    </a>
                  )}
                </section>

                <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <h3 className="font-semibold">Stock impact preview</h3>

                  <p className="mt-1 text-sm text-neutral-500">
                    This is the projected result if the movement is approved.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-neutral-50 p-4">
                      <p className="text-xs text-neutral-500">Current stock</p>

                      <p className="mt-2 text-2xl font-bold">
                        {selected.current_stock ?? "—"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-neutral-50 p-4">
                      <p className="text-xs text-neutral-500">Stock change</p>

                      <p
                        className={`mt-2 text-2xl font-bold ${
                          selected.quantity_delta >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {selected.quantity_delta > 0
                          ? `+${selected.quantity_delta}`
                          : selected.quantity_delta}
                      </p>
                    </div>

                    <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                      <p className="text-xs text-red-600">Projected stock</p>

                      <p className="mt-2 text-2xl font-bold text-red-700">
                        {projectedStock ?? "—"}
                      </p>
                    </div>
                  </div>

                  {selected.status === "approved" && (
                    <div className="mt-4 rounded-xl bg-green-50 p-4 text-sm text-green-800">
                      Approved by {selected.approved_by ?? "Reviewer"}.
                      {selected.approved_at
                        ? ` ${formatDate(selected.approved_at)}`
                        : ""}
                      {selected.updated_stock !== undefined
                        ? ` Updated stock: ${selected.updated_stock}.`
                        : ""}
                    </div>
                  )}

                  {selected.status === "rejected" && (
                    <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
                      Rejected:{" "}
                      {selected.rejection_reason ?? "No reason provided."}
                    </div>
                  )}
                </section>

                {selected.status === "pending_approval" && (
                  <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <h3 className="font-semibold">Review decision</h3>

                    <p className="mt-1 text-sm text-neutral-500">
                      Your approval will create a stock movement and update the
                      product's current stock.
                    </p>

                    <div className="mt-5">
                      <label
                        htmlFor="reviewer"
                        className="mb-2 block text-sm font-medium"
                      >
                        Reviewer name
                      </label>

                      <input
                        id="reviewer"
                        value={reviewer}
                        onChange={(event) => setReviewer(event.target.value)}
                        placeholder="Enter reviewer name"
                        className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-red-400"
                      />
                    </div>

                    <div className="mt-5">
                      <label
                        htmlFor="rejection-reason"
                        className="mb-2 block text-sm font-medium"
                      >
                        Rejection reason
                      </label>

                      <textarea
                        id="rejection-reason"
                        value={rejectionReason}
                        onChange={(event) =>
                          setRejectionReason(event.target.value)
                        }
                        rows={3}
                        placeholder="Explain why this proposal should be rejected."
                        className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-red-400"
                      />
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={processing}
                        onClick={() => void handleDecision("approve")}
                        className="rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {processing ? "Processing..." : "Approve movement"}
                      </button>

                      <button
                        type="button"
                        disabled={processing}
                        onClick={() => void handleDecision("reject")}
                        className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Reject proposal
                      </button>
                    </div>
                  </section>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
