"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

// ============================================================
// BADGES
// ============================================================

function RiskBadge({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, string> = {
    low: "bg-zinc-100 text-zinc-700",
    medium: "bg-amber-50 text-amber-700",
    high: "bg-red-50 text-red-700",
    critical: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${styles[level]}`}
    >
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
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[level]}`}
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
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase ${styles[priority]}`}
    >
      {priority}
    </span>
  );
}

// ============================================================
// REUSABLE SECTION
// ============================================================

function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 md:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-sm font-bold text-red-600">
          {number}
        </span>

        <div>
          <h2 className="text-lg font-bold text-zinc-950">{title}</h2>

          {description && (
            <p className="mt-1 text-sm text-zinc-500">{description}</p>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}

// ============================================================
// LOADING FALLBACK
// ============================================================

function ReportLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-5">
      <div className="text-center">
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-zinc-200 border-t-red-600" />

        <p className="mt-4 text-sm font-medium text-zinc-500">
          Loading AI investigation...
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

  const reportId = params.reportId;

  useEffect(() => {
    let active = true;

    async function loadReport() {
      try {
        setLoading(true);
        setError("");
        setData(null);

        const parsedReportId = Number(reportId);

        if (!Number.isInteger(parsedReportId) || parsedReportId <= 0) {
          throw new Error("Invalid investigation report ID.");
        }

        const result = await getAIInvestigationReport(parsedReportId);

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

  // ----------------------------------------------------------
  // LOADING STATE
  // ----------------------------------------------------------

  if (loading) {
    return <ReportLoading />;
  }

  // ----------------------------------------------------------
  // ERROR STATE
  // ----------------------------------------------------------

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#f7f7f8] px-5 py-20">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl text-red-600">
            !
          </div>

          <h1 className="mt-5 text-xl font-bold text-zinc-950">
            Unable to load report
          </h1>

          <p className="mt-3 text-sm leading-6 text-red-600">
            {error || "Investigation report not found."}
          </p>

          <button
            onClick={() => router.push("/investigations")}
            className="mt-6 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Back to investigations
          </button>
        </div>
      </main>
    );
  }

  // ----------------------------------------------------------
  // REPORT DATA
  // ----------------------------------------------------------

  const report = data.report;
  const position = report.current_inventory_position;

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <header className="mb-8 border-b border-zinc-200 pb-8">
          <button
            onClick={() => router.push("/investigations")}
            className="mb-8 text-sm font-semibold text-zinc-500 transition hover:text-red-600"
          >
            ← Back to investigations
          </button>

          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-600" />

                <span className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
                  AI Investigation Report #{data.id}
                </span>
              </div>

              <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-zinc-950 md:text-5xl">
                {report.report_title}
              </h1>

              <p className="mt-4 text-sm text-zinc-500">
                Product:{" "}
                <span className="font-semibold text-zinc-800">
                  {data.product_name}
                </span>
              </p>

              <p className="mt-2 text-xs text-zinc-400">
                Generated {formatDate(data.created_at)} · {data.model}
              </p>
            </div>

            <RiskBadge level={report.risk_assessment.level} />
          </div>
        </header>

        {/* ================================================== */}
        {/* EXECUTIVE SUMMARY */}
        {/* ================================================== */}

        <section className="mb-6 rounded-2xl bg-zinc-950 p-7 text-white md:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">
            Executive summary
          </p>

          <p className="mt-5 max-w-4xl text-lg leading-8 text-zinc-200">
            {report.executive_summary}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold">
              {report.root_cause_identified
                ? "Root cause identified"
                : "Root cause undetermined"}
            </span>

            <span className="rounded-full bg-red-500/20 px-4 py-2 text-xs font-semibold text-red-300">
              {report.human_verification_required
                ? "Human verification required"
                : "Human verification not flagged"}
            </span>
          </div>
        </section>

        {/* ================================================== */}
        {/* CURRENT INVENTORY POSITION */}
        {/* ================================================== */}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Current stock
            </p>

            <p className="mt-3 text-4xl font-bold text-zinc-950">
              {position.current_stock ?? "—"}
            </p>

            <p className="mt-2 text-xs text-zinc-400">
              Recorded inventory quantity
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Opening balance
            </p>

            <p className="mt-3 text-4xl font-bold text-zinc-950">
              {position.opening_balance ?? "—"}
            </p>

            <p className="mt-2 text-xs text-zinc-400">
              Recorded baseline quantity
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Approved movements
            </p>

            <p className="mt-3 text-4xl font-bold text-zinc-950">
              {position.ledger_movement_count}
            </p>

            <p className="mt-2 text-xs text-zinc-400">
              Recorded stock movements
            </p>
          </div>
        </div>

        {/* INVENTORY ASSESSMENT */}

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Inventory assessment
          </p>

          <p className="mt-3 text-sm leading-7 text-zinc-700">
            {position.assessment}
          </p>
        </div>

        <div className="space-y-6">
          {/* ================================================== */}
          {/* VERIFIED FACTS */}
          {/* ================================================== */}

          <Section
            number="01"
            title="Verified facts"
            description="Information supported by recorded system data."
          >
            {report.verified_facts.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No verified facts were returned.
              </p>
            ) : (
              <div className="space-y-4">
                {report.verified_facts.map((item, index) => (
                  <div key={index} className="border-l-2 border-zinc-900 pl-4">
                    <p className="text-sm leading-7 text-zinc-800">
                      {item.fact}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="text-xs text-zinc-400">
                        Source: {item.source}
                      </span>

                      <ConfidenceBadge level={item.confidence} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ================================================== */}
          {/* HISTORICAL FINDINGS */}
          {/* ================================================== */}

          <Section
            number="02"
            title="Historical findings"
            description="Previous investigations and recorded inventory events."
          >
            {report.historical_findings.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No historical findings were returned.
              </p>
            ) : (
              <div className="space-y-4">
                {report.historical_findings.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-zinc-100 bg-zinc-50 p-5"
                  >
                    <p className="text-sm leading-7 text-zinc-800">
                      {item.finding}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-400">
                      <span>Source: {item.source}</span>

                      <span>Status: {item.status}</span>

                      {item.timestamp && (
                        <span>{formatDate(item.timestamp)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ================================================== */}
          {/* DISCREPANCIES */}
          {/* ================================================== */}

          <Section
            number="03"
            title="Identified discrepancies"
            description="Differences identified from available inventory records."
          >
            {report.discrepancies.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No discrepancies were returned.
              </p>
            ) : (
              <div className="space-y-4">
                {report.discrepancies.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-red-100 bg-red-50/50 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-bold text-zinc-900">
                        {item.description}
                      </h3>

                      <span className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-red-700">
                        {item.quantity_difference === null
                          ? "Quantity unknown"
                          : `${
                              item.quantity_difference > 0 ? "+" : ""
                            }${item.quantity_difference} units`}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-7 text-zinc-700">
                      {item.explanation}
                    </p>

                    <p className="mt-3 text-xs font-semibold uppercase text-zinc-400">
                      Status: {item.status}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ================================================== */}
          {/* POSSIBLE EXPLANATIONS */}
          {/* ================================================== */}

          <Section
            number="04"
            title="Possible explanations"
            description="Potential causes, not confirmed root causes."
          >
            {report.possible_explanations.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No possible explanations were returned.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {report.possible_explanations.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-zinc-200 p-5"
                  >
                    <div className="mb-4">
                      <ConfidenceBadge level={item.confidence} />
                    </div>

                    <h3 className="font-bold text-zinc-900">
                      {item.explanation}
                    </h3>

                    <p className="mt-3 text-sm leading-7 text-zinc-500">
                      {item.supporting_information}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ================================================== */}
          {/* MISSING INFORMATION */}
          {/* ================================================== */}

          <Section
            number="05"
            title="Missing information"
            description="Information needed to establish a more conclusive investigation."
          >
            {report.missing_information.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No missing information was identified.
              </p>
            ) : (
              <ul className="space-y-3">
                {report.missing_information.map((item, index) => (
                  <li
                    key={index}
                    className="flex gap-3 text-sm leading-7 text-zinc-700"
                  >
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-600" />

                    {item}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ================================================== */}
          {/* RISK ASSESSMENT */}
          {/* ================================================== */}

          <Section
            number="06"
            title="Risk assessment"
            description="Assessment of the potential inventory-control risk."
          >
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
              <div className="mb-4">
                <RiskBadge level={report.risk_assessment.level} />
              </div>

              <p className="text-sm leading-7 text-zinc-700">
                {report.risk_assessment.reason}
              </p>
            </div>
          </Section>

          {/* ================================================== */}
          {/* RECOMMENDED ACTIONS */}
          {/* ================================================== */}

          <Section
            number="07"
            title="Recommended actions"
            description="Suggested next steps for authorized personnel."
          >
            {report.recommended_actions.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No recommended actions were returned.
              </p>
            ) : (
              <div className="space-y-4">
                {report.recommended_actions.map((item, index) => (
                  <div
                    key={index}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-200 p-5 md:flex-row md:items-center"
                  >
                    <div>
                      <p className="text-sm leading-7 text-zinc-800">
                        {item.action}
                      </p>

                      <p className="mt-3 text-xs text-zinc-400">
                        {item.requires_human_approval
                          ? "Requires human approval"
                          : "No human approval flagged"}
                      </p>
                    </div>

                    <PriorityBadge priority={item.priority} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ================================================== */}
          {/* FINAL CONCLUSION */}
          {/* ================================================== */}

          <section className="rounded-2xl border border-red-200 bg-red-50/50 p-6 md:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
              Final conclusion
            </p>

            <p className="mt-5 text-base leading-8 text-zinc-800">
              {report.final_conclusion}
            </p>

            <div className="mt-6 border-t border-red-100 pt-5">
              <p className="text-sm font-bold text-zinc-900">
                {report.human_verification_required
                  ? "Human verification is required before taking inventory action."
                  : "Review the findings before taking any inventory action."}
              </p>
            </div>
          </section>
        </div>

        {/* ================================================== */}
        {/* FOOTER */}
        {/* ================================================== */}

        <footer className="mt-12 border-t border-zinc-200 pt-6">
          <p className="text-xs leading-6 text-zinc-400">
            Hsain Agent · Model: {data.model} · Report #{data.id}. AI-generated
            findings are decision-support information and do not independently
            authorize inventory adjustments.
          </p>
        </footer>
      </div>
    </main>
  );
}

// ============================================================
// PAGE EXPORT WITH SUSPENSE
// ============================================================

export default function InvestigationReportPage() {
  return (
    <Suspense fallback={<ReportLoading />}>
      <InvestigationReportContent />
    </Suspense>
  );
}
