"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  getDiscrepancyAlertAudit,
  type DiscrepancyAuditItem,
  type DiscrepancyAuditResponse,
} from "@/lib/inventory";

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getActionLabel(action: string) {
  const labels: Record<string, string> = {
    detected: "Discrepancy detected",
    recurrence: "Discrepancy detected again",
    auto_resolved: "Automatically resolved",
    resolved: "Manually resolved",
  };

  return labels[action] ?? action.replaceAll("_", " ");
}

function getActionStyle(action: string) {
  if (action === "detected" || action === "recurrence") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  if (action === "auto_resolved" || action === "resolved") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  return "bg-neutral-100 text-neutral-700 border-neutral-200";
}

function formatStatus(value: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function AuditDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details ?? {});

  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        No additional details were recorded.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="rounded-xl border border-neutral-100 bg-neutral-50 p-3"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {key.replaceAll("_", " ")}
          </p>

          <p className="mt-1 break-words text-sm font-medium text-neutral-800">
            {typeof value === "object"
              ? JSON.stringify(value)
              : String(value ?? "—")}
          </p>
        </div>
      ))}
    </div>
  );
}

function AuditEvent({ item }: { item: DiscrepancyAuditItem }) {
  return (
    <article className="relative border-l-2 border-neutral-200 pb-8 pl-7 last:border-transparent last:pb-0">
      <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-red-600 ring-2 ring-red-100" />

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getActionStyle(
                item.action,
              )}`}
            >
              {getActionLabel(item.action)}
            </span>

            <p className="mt-3 text-sm font-semibold text-neutral-900">
              {item.actor || "Unknown actor"}
            </p>

            <p className="mt-1 text-xs text-neutral-500">
              {formatDate(item.created_at)}
            </p>
          </div>

          <span className="text-xs text-neutral-400">Event #{item.id}</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs text-neutral-500">Previous status</p>
            <p className="mt-1 text-sm font-semibold capitalize">
              {formatStatus(item.previous_status)}
            </p>
          </div>

          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs text-neutral-500">New status</p>
            <p className="mt-1 text-sm font-semibold capitalize">
              {formatStatus(item.new_status)}
            </p>
          </div>
        </div>

        <AuditDetails details={item.details ?? {}} />
      </div>
    </article>
  );
}

function DiscrepancyHistoryContent() {
  const params = useParams<{ alertId: string }>();
  const alertId = Number(params.alertId);

  const [data, setData] = useState<DiscrepancyAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (!Number.isInteger(alertId) || alertId <= 0) {
        setError("Invalid discrepancy alert ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const result = await getDiscrepancyAlertAudit(alertId, 100, 0);

        if (active) {
          setData(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load discrepancy audit history.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [alertId]);

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950 md:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/inventory/alerts"
          className="text-sm text-neutral-500 transition hover:text-red-600"
        >
          ← Back to discrepancy alerts
        </Link>

        <header className="mb-8 mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
            Inventory control
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Discrepancy Audit History
          </h1>

          {data && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-sm text-neutral-500">
                Alert #{data.alert_id}
              </span>

              <span className="font-semibold">{data.product_name}</span>

              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                Product #{data.product_id}
              </span>
            </div>
          )}

          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">
            A chronological record of discrepancy detection, recurrence,
            automatic resolution, and human resolution decisions.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
            Loading audit history...
          </div>
        ) : data ? (
          <>
            <section className="mb-7 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                <p className="text-sm text-neutral-500">Recorded events</p>
                <p className="mt-2 text-3xl font-semibold">{data.total}</p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                <p className="text-sm text-neutral-500">Alert identifier</p>
                <p className="mt-2 text-2xl font-semibold">#{data.alert_id}</p>
              </div>
            </section>

            {data.items.length === 0 ? (
              <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-xl">
                  ◷
                </div>

                <h2 className="mt-4 font-semibold">No audit events recorded</h2>

                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-500">
                  No audit events are available for this alert. It may have been
                  created before discrepancy audit logging was introduced.
                  Historical events are not reconstructed automatically.
                </p>
              </div>
            ) : (
              <section className="rounded-2xl border border-neutral-200 bg-white p-6 md:p-8">
                <h2 className="mb-7 text-lg font-semibold">Event timeline</h2>

                <div>
                  {data.items.map((item) => (
                    <AuditEvent key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}

export default function DiscrepancyHistoryPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-50 p-10 text-center text-sm text-neutral-500">
          Loading discrepancy history...
        </main>
      }
    >
      <DiscrepancyHistoryContent />
    </Suspense>
  );
}
