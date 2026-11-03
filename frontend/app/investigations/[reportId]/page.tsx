"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  Info,
  Printer,
  ShieldCheck,
  ShieldAlert,
  Package,
  Target,
  TrendingUp,
} from "lucide-react";

import { getAIInvestigationReport } from "@/lib/investigations";

import type {
  AIInvestigationReport,
  ConfidenceLevel,
  PriorityLevel,
  RiskLevel,
} from "@/types/investigation";

// ============================================================
// HELPERS
// ============================================================

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}

// ============================================================
// BADGES
// ============================================================

function RiskBadge({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, string> = {
    low: "border-zinc-200 bg-zinc-100 text-zinc-700",
    medium: "border-amber-200 bg-amber-50 text-amber-700",
    high: "border-red-200 bg-red-50 text-red-700",
    critical: "border-red-300 bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${styles[level]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {level} risk
    </span>
  );
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const styles: Record<ConfidenceLevel, string> = {
    high: "bg-zinc-900 text-white",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles[level]}`}
    >
      {level} confidence
    </span>
  );
}

function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const styles: Record<PriorityLevel, string> = {
    low: "bg-zinc-100 text-zinc-600",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-red-50 text-red-700",
    critical: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

// ============================================================
// REUSABLE SECTION
// ============================================================

function ReportSection({
  number,
  title,
  description,
  count,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-6 md:px-8">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-sm font-bold text-red-600">
            {number}
          </span>

          <div>
            <h2 className="text-lg font-bold tracking-tight text-zinc-950">
              {title}
            </h2>

            {description && (
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                {description}
              </p>
            )}
          </div>
        </div>

        {count !== undefined && (
          <span className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600">
            {count}
          </span>
        )}
      </div>

      <div className="p-6 md:p-8">{children}</div>
    </section>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-10 text-center">
      <Info className="mx-auto h-6 w-6 text-zinc-400" />

      <p className="mt-3 text-sm text-zinc-500">{message}</p>
    </div>
  );
}

// ============================================================
// INVENTORY METRIC
// ============================================================

function InventoryMetric({
  label,
  value,
  description,
  icon: Icon,
  dark = false,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        dark
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-200 bg-white text-zinc-950"
      }`}
    >
      <div className="flex items-center justify-between">
        <p
          className={`text-xs font-bold uppercase tracking-wider ${
            dark ? "text-zinc-400" : "text-zinc-400"
          }`}
        >
          {label}
        </p>

        <Icon className={`h-5 w-5 ${dark ? "text-red-400" : "text-red-600"}`} />
      </div>

      <p className="mt-5 text-4xl font-bold tracking-tight">{value}</p>

      <p className={`mt-2 text-xs ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
        {description}
      </p>
    </div>
  );
}

// ============================================================
// LOADING
// ============================================================

function ReportLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-5">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-red-600" />

        <p className="mt-5 text-sm font-semibold text-zinc-700">
          Loading investigation report
        </p>

        <p className="mt-2 text-xs text-zinc-400">
          Retrieving recorded investigation findings...
        </p>
      </div>
    </main>
  );
}

// ============================================================
// REPORT CONTENT
// ============================================================

function InvestigationReportContent() {
  const params = useParams<{ reportId: string }>();
  const router = useRouter();

  const [data, setData] = useState<AIInvestigationReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Local review checklist.
  // This is NOT persisted as evidence or backend investigation data.
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const reportId = params.reportId;

  useEffect(() => {
    let active = true;

    async function loadReport() {
      try {
        setLoading(true);
        setError("");
        setData(null);
        setCheckedItems({});

        const parsedId = Number(reportId);

        if (!Number.isInteger(parsedId) || parsedId <= 0) {
          throw new Error("Invalid investigation report ID.");
        }

        const result = await getAIInvestigationReport(parsedId);

        if (active) {
          setData(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load investigation report.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadReport();

    return () => {
      active = false;
    };
  }, [reportId]);

  const confidenceSummary = useMemo(() => {
    if (!data) {
      return {
        high: 0,
        medium: 0,
        low: 0,
      };
    }

    return data.report.verified_facts.reduce(
      (summary, item) => {
        summary[item.confidence] += 1;
        return summary;
      },
      {
        high: 0,
        medium: 0,
        low: 0,
      },
    );
  }, [data]);

  const completedChecklistCount =
    Object.values(checkedItems).filter(Boolean).length;

  const totalChecklistCount = data?.report.missing_information.length ?? 0;

  function toggleChecklistItem(index: number) {
    setCheckedItems((previous) => ({
      ...previous,
      [index]: !previous[index],
    }));
  }

  function handlePrint() {
    window.print();
  }

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return <ReportLoading />;
  }

  // ==========================================================
  // ERROR
  // ==========================================================

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#f7f7f8] px-5 py-20">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertCircle className="h-7 w-7" />
          </div>

          <h1 className="mt-5 text-xl font-bold text-zinc-950">
            Unable to load report
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {error || "Investigation report not found."}
          </p>

          <button
            type="button"
            onClick={() => router.push("/investigations")}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to investigations
          </button>
        </div>
      </main>
    );
  }

  // ==========================================================
  // REPORT DATA
  // ==========================================================

  const report = data.report;
  const position = report.current_inventory_position;

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-6 md:px-8 md:py-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-6xl">
        {/* ================================================== */}
        {/* TOP NAVIGATION */}
        {/* ================================================== */}

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <button
            type="button"
            onClick={() => router.push("/investigations")}
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-red-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Investigation archive
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-red-300 hover:text-red-600"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>

        {/* ================================================== */}
        {/* REPORT HEADER */}
        {/* ================================================== */}

        <header className="mb-7 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 p-6 md:p-9">
            <div className="flex flex-col justify-between gap-7 md:flex-row md:items-start">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                  AI investigation report
                </div>

                <h1 className="text-3xl font-bold tracking-tight text-zinc-950 md:text-4xl">
                  {report.report_title}
                </h1>

                <p className="mt-4 text-sm text-zinc-500">
                  Investigation #{data.id}
                  <span className="mx-2 text-zinc-300">/</span>
                  Product{" "}
                  <span className="font-semibold text-zinc-800">
                    {data.product_name}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
                <RiskBadge level={report.risk_assessment.level} />

                <span className="text-xs text-zinc-400">
                  Status: {data.status}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-6 sm:grid-cols-3 md:px-9">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                <Clock3 className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs text-zinc-400">Generated</p>

                <p className="mt-1 text-sm font-semibold text-zinc-800">
                  {formatDate(data.created_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Package className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs text-zinc-400">Product ID</p>

                <p className="mt-1 text-sm font-semibold text-zinc-800">
                  #{data.product_id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                <FileText className="h-5 w-5" />
              </div>

              <div>
                <p className="text-xs text-zinc-400">AI model</p>

                <p className="mt-1 text-sm font-semibold text-zinc-800">
                  {data.model}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* ================================================== */}
        {/* EXECUTIVE SUMMARY */}
        {/* ================================================== */}

        <section className="mb-7 overflow-hidden rounded-2xl bg-zinc-950 p-7 text-white md:p-9">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-red-400" />

            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">
              Executive summary
            </p>
          </div>

          <p className="mt-6 max-w-4xl text-lg leading-8 text-zinc-200 md:text-xl">
            {report.executive_summary}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-zinc-200">
              {report.root_cause_identified ? (
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              ) : (
                <CircleHelp className="h-4 w-4 text-amber-400" />
              )}

              {report.root_cause_identified
                ? "Root cause identified"
                : "Root cause undetermined"}
            </span>

            <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-300">
              <ShieldAlert className="h-4 w-4" />

              {report.human_verification_required
                ? "Human verification required"
                : "Review before action"}
            </span>
          </div>
        </section>

        {/* ================================================== */}
        {/* INVENTORY POSITION */}
        {/* ================================================== */}

        <section className="mb-7">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">
              Inventory intelligence
            </p>

            <h2 className="mt-2 text-xl font-bold text-zinc-950">
              Current inventory position
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Quantities recorded in the inventory system.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InventoryMetric
              label="Current stock"
              value={formatNumber(position.current_stock)}
              description="Recorded inventory quantity"
              icon={Package}
            />

            <InventoryMetric
              label="Opening balance"
              value={formatNumber(position.opening_balance)}
              description="Recorded baseline quantity"
              icon={TrendingUp}
            />

            <InventoryMetric
              label="Ledger movements"
              value={position.ledger_movement_count}
              description="Recorded stock movements"
              icon={ClipboardCheck}
              dark
            />
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-red-600" />

              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Inventory assessment
              </p>
            </div>

            <p className="mt-4 text-sm leading-7 text-zinc-700">
              {position.assessment}
            </p>
          </div>
        </section>

        {/* ================================================== */}
        {/* EVIDENCE CONFIDENCE OVERVIEW */}
        {/* ================================================== */}

        <section className="mb-7 rounded-2xl border border-zinc-200 bg-white p-6 md:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <h2 className="font-bold text-zinc-950">
                Evidence confidence overview
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Confidence labels assigned to returned verified facts.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
                High: {confidenceSummary.high}
              </span>

              <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Medium: {confidenceSummary.medium}
              </span>

              <span className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                Low: {confidenceSummary.low}
              </span>
            </div>
          </div>

          <p className="mt-5 border-t border-zinc-100 pt-4 text-xs leading-6 text-zinc-400">
            Checklist progress is stored only in this page&apos;s temporary
            state. Checking an item does not mean evidence was collected,
            verified, or saved. They are not independent verification of the
            underlying evidence.
          </p>
        </section>

        <div className="space-y-6">
          {/* ================================================== */}
          {/* 01 VERIFIED FACTS */}
          {/* ================================================== */}

          <ReportSection
            number="01"
            title="Verified facts"
            description="Information attributed to recorded system data."
            count={report.verified_facts.length}
          >
            {report.verified_facts.length === 0 ? (
              <EmptyState message="No verified facts were returned." />
            ) : (
              <div className="space-y-5">
                {report.verified_facts.map((item, index) => (
                  <article
                    key={index}
                    className="border-l-2 border-zinc-900 pl-5"
                  >
                    <p className="text-sm leading-7 text-zinc-800">
                      {item.fact}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="text-xs text-zinc-400">
                        Source: {item.source}
                      </span>

                      <ConfidenceBadge level={item.confidence} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </ReportSection>

          {/* ================================================== */}
          {/* 02 HISTORICAL FINDINGS */}
          {/* ================================================== */}

          <ReportSection
            number="02"
            title="Historical findings"
            description="Previous investigations and recorded inventory events."
            count={report.historical_findings.length}
          >
            {report.historical_findings.length === 0 ? (
              <EmptyState message="No historical findings were returned." />
            ) : (
              <div className="space-y-4">
                {report.historical_findings.map((item, index) => (
                  <article
                    key={index}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-5"
                  >
                    <p className="text-sm leading-7 text-zinc-800">
                      {item.finding}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-400">
                      <span>Source: {item.source}</span>

                      <span>Status: {item.status}</span>

                      {item.timestamp && (
                        <span>{formatDate(item.timestamp)}</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </ReportSection>

          {/* ================================================== */}
          {/* 03 DISCREPANCIES */}
          {/* ================================================== */}

          <ReportSection
            number="03"
            title="Identified discrepancies"
            description="Differences identified from available inventory records."
            count={report.discrepancies.length}
          >
            {report.discrepancies.length === 0 ? (
              <EmptyState message="No discrepancies were returned." />
            ) : (
              <div className="space-y-4">
                {report.discrepancies.map((item, index) => (
                  <article
                    key={index}
                    className="rounded-xl border border-red-100 bg-red-50/40 p-5"
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <h3 className="font-bold text-zinc-900">
                        {item.description}
                      </h3>

                      <span className="inline-flex w-fit rounded-lg bg-white px-3 py-2 text-sm font-bold text-red-700">
                        {item.quantity_difference === null
                          ? "Quantity unknown"
                          : `${
                              item.quantity_difference > 0 ? "+" : ""
                            }${item.quantity_difference} units`}
                      </span>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-zinc-700">
                      {item.explanation}
                    </p>

                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Status: {item.status}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </ReportSection>

          {/* ================================================== */}
          {/* 04 POSSIBLE EXPLANATIONS */}
          {/* ================================================== */}

          <ReportSection
            number="04"
            title="Possible explanations"
            description="Potential causes. These are hypotheses, not confirmed root causes."
            count={report.possible_explanations.length}
          >
            {report.possible_explanations.length === 0 ? (
              <EmptyState message="No possible explanations were returned." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {report.possible_explanations.map((item, index) => (
                  <article
                    key={index}
                    className="rounded-xl border border-zinc-200 p-5"
                  >
                    <div className="mb-4">
                      <ConfidenceBadge level={item.confidence} />
                    </div>

                    <h3 className="font-bold leading-6 text-zinc-900">
                      {item.explanation}
                    </h3>

                    <p className="mt-3 text-sm leading-7 text-zinc-500">
                      {item.supporting_information}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </ReportSection>

          {/* ================================================== */}
          {/* 05 MISSING INFORMATION */}
          {/* ================================================== */}

          <ReportSection
            number="05"
            title="Missing information"
            description="Information that may help personnel reach a more conclusive investigation."
            count={report.missing_information.length}
          >
            {report.missing_information.length === 0 ? (
              <EmptyState message="No missing information was identified." />
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-4">
                  <div>
                    <p className="text-sm font-bold text-zinc-800">
                      Local review checklist
                    </p>

                    <p className="mt-1 text-xs text-zinc-500">
                      Mark items you have reviewed.
                    </p>
                  </div>

                  <span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-zinc-700">
                    {completedChecklistCount} / {totalChecklistCount} reviewed
                  </span>
                </div>

                <div className="mb-5 h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-red-600 transition-all"
                    style={{
                      width: `${
                        totalChecklistCount
                          ? (completedChecklistCount / totalChecklistCount) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="space-y-3">
                  {report.missing_information.map((item, index) => {
                    const checked = Boolean(checkedItems[index]);

                    return (
                      <button
                        type="button"
                        key={index}
                        onClick={() => toggleChecklistItem(index)}
                        className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition ${
                          checked
                            ? "border-zinc-200 bg-zinc-50"
                            : "border-zinc-200 bg-white hover:border-red-200"
                        }`}
                      >
                        {checked ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                        ) : (
                          <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-zinc-300" />
                        )}

                        <span
                          className={`text-sm leading-7 ${
                            checked
                              ? "text-zinc-400 line-through"
                              : "text-zinc-700"
                          }`}
                        >
                          {item}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-5 text-xs leading-6 text-zinc-400">
                  Checklist progress is stored only in this page&apos;s
                  temporary state. Checking an item does not mean evidence was
                  collected, verified, or saved.
                </p>
              </>
            )}
          </ReportSection>

          {/* ================================================== */}
          {/* 06 RISK ASSESSMENT */}
          {/* ================================================== */}

          <ReportSection
            number="06"
            title="Risk assessment"
            description="AI assessment of potential inventory-control risk."
          >
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <RiskBadge level={report.risk_assessment.level} />

                <span className="text-xs text-zinc-400">
                  Operational risk classification
                </span>
              </div>

              <p className="mt-5 text-sm leading-7 text-zinc-700">
                {report.risk_assessment.reason}
              </p>
            </div>
          </ReportSection>

          {/* ================================================== */}
          {/* 07 RECOMMENDED ACTIONS */}
          {/* ================================================== */}

          <ReportSection
            number="07"
            title="Recommended actions"
            description="Suggested next steps for authorized personnel."
            count={report.recommended_actions.length}
          >
            {report.recommended_actions.length === 0 ? (
              <EmptyState message="No recommended actions were returned." />
            ) : (
              <div className="space-y-4">
                {report.recommended_actions.map((item, index) => (
                  <article
                    key={index}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-200 p-5 md:flex-row md:items-center"
                  >
                    <div className="flex items-start gap-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-sm font-bold text-red-600">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div>
                        <p className="text-sm leading-7 text-zinc-800">
                          {item.action}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {item.requires_human_approval ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Requires human approval
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              No approval flagged
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <PriorityBadge priority={item.priority} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </ReportSection>

          {/* ================================================== */}
          {/* FINAL CONCLUSION */}
          {/* ================================================== */}

          <section className="overflow-hidden rounded-2xl border border-red-200 bg-white">
            <div className="border-b border-red-100 bg-red-50/60 px-6 py-5 md:px-8">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-red-600" />

                <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
                  Final conclusion
                </p>
              </div>
            </div>

            <div className="p-6 md:p-8">
              <p className="text-base leading-8 text-zinc-800">
                {report.final_conclusion}
              </p>

              <div className="mt-7 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50/50 p-5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

                <div>
                  <p className="text-sm font-bold text-zinc-900">
                    Human review required
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {report.human_verification_required
                      ? "Authorized personnel must verify the findings and supporting evidence before taking inventory action."
                      : "Review the findings and supporting evidence before taking inventory action."}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ================================================== */}
        {/* FOOTER */}
        {/* ================================================== */}

        <footer className="mt-10 border-t border-zinc-200 pt-6">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <p className="text-xs leading-6 text-zinc-400">
              Hsain Agent · Evidence-based inventory intelligence
            </p>

            <p className="text-xs text-zinc-400">
              Report #{data.id} · {data.model}
            </p>
          </div>

          <p className="mt-3 max-w-4xl text-xs leading-6 text-zinc-400">
            AI-generated findings are decision-support information. This report
            does not independently authorize stock adjustments, supplier orders,
            or other inventory mutations. All operational actions remain subject
            to authorized human review and approval.
          </p>
        </footer>
      </div>

      {/* PRINT STYLES */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm;
          }

          body {
            background: white !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          main {
            min-height: auto !important;
          }

          section,
          article {
            break-inside: avoid;
          }

          button {
            display: none !important;
          }

          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}

// ============================================================
// PAGE EXPORT
// ============================================================

export default function InvestigationReportPage() {
  return (
    <Suspense fallback={<ReportLoading />}>
      <InvestigationReportContent />
    </Suspense>
  );
}
