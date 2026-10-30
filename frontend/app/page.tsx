"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  decideOrder,
  getInvestigations,
  getOrders,
  investigateInventory,
  proposeOrder,
  type Investigation,
  type InvestigationList,
  type Order,
} from "@/lib/api";

type Tab = "overview" | "investigate" | "orders";

const initialForm = {
  product_name: "",
  expected_stock: "30",
  physical_stock: "22",
  units_sold: "3",
  evidence_notes: "",
};

const routeNavigation = [
  {
    href: "/investigations",
    label: "AI Investigations",
    icon: "✳",
  },
  {
    href: "/evidence",
    label: "Evidence Review",
    icon: "▤",
  },
  {
    href: "/timeline",
    label: "Inventory Timeline",
    icon: "◷",
  },
  {
    href: "/movements",
    label: "Movement Approvals",
    icon: "↔",
  },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    matched: "bg-emerald-50 text-emerald-700",
    shortage: "bg-red-50 text-red-700",
    surplus: "bg-amber-50 text-amber-700",
    pending_approval: "bg-amber-50 text-amber-700",
    simulated_ordered: "bg-emerald-50 text-emerald-700",
    rejected: "bg-zinc-100 text-zinc-600",
  };

  const label: Record<string, string> = {
    pending_approval: "Pending approval",
    simulated_ordered: "Approved · simulated",
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-zinc-100 text-zinc-600"
      }`}
    >
      {label[status] ?? status}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
        {eyebrow}
      </p>

      <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">
        {title}
      </h1>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function RouteLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <>
      {routeNavigation.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          className={
            mobile
              ? "flex items-center justify-center gap-1 rounded-lg bg-zinc-100 px-2 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-red-50 hover:text-red-700"
              : "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-zinc-500 transition hover:bg-red-50 hover:text-red-700"
          }
        >
          <span className="w-5 text-center text-lg">{icon}</span>
          <span>{label}</span>
        </Link>
      ))}
    </>
  );
}

function AIInvestigationFeature() {
  const workflow = [
    ["01", "Select a product"],
    ["02", "Analyze inventory history"],
    ["03", "Review AI findings"],
    ["04", "Verify before action"],
  ];

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-red-200 bg-white">
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
            Powered by Meta Muse Spark
          </p>

          <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-950">
            Investigate beyond the numbers.
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
            Generate structured AI investigation reports using inventory
            records, approved stock movements, historical discrepancies, and
            supporting evidence. Review verified facts, possible explanations,
            missing information, and recommended actions.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/investigations"
              className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700"
            >
              Open AI Investigations →
            </Link>

            <Link
              href="/evidence"
              className="rounded-xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Review Evidence
            </Link>
          </div>

          <p className="mt-4 text-xs leading-5 text-zinc-400">
            AI findings are decision-support information. Inventory changes
            require authorized human approval.
          </p>
        </div>

        <div className="rounded-2xl bg-zinc-950 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-red-400">
            Investigation workflow
          </p>

          <div className="mt-5 space-y-4">
            {workflow.map(([number, label]) => (
              <div key={number} className="flex items-center gap-3">
                <span className="text-sm font-bold text-red-400">{number}</span>
                <span className="text-sm font-medium text-zinc-200">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("overview");

  const [investigations, setInvestigations] = useState<
    InvestigationList["items"]
  >([]);

  const [orders, setOrders] = useState<Order[]>([]);

  const [latest, setLatest] = useState<Investigation | null>(null);

  const [form, setForm] = useState(initialForm);

  const [orderQuantity, setOrderQuantity] = useState("12");

  const [ownerName, setOwnerName] = useState("Demo Shop Owner");

  const [orderFilter, setOrderFilter] = useState("");

  const [investigationLoading, setInvestigationLoading] = useState(false);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [submittingInvestigation, setSubmittingInvestigation] = useState(false);
  const [submittingProposal, setSubmittingProposal] = useState(false);

  const refresh = useCallback(async () => {
    const [history, orderHistory] = await Promise.all([
      getInvestigations(),
      getOrders(orderFilter || undefined),
    ]);

    setInvestigations(history.items);
    setOrders(orderHistory.items);
  }, [orderFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setDashboardLoading(true);
      setError("");

      try {
        const [history, orderHistory] = await Promise.all([
          getInvestigations(),
          getOrders(orderFilter || undefined),
        ]);

        if (cancelled) return;

        setInvestigations(history.items);
        setOrders(orderHistory.items);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not connect to the backend.",
          );
        }
      } finally {
        if (!cancelled) {
          setDashboardLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [orderFilter]);

  const pendingCount = orders.filter(
    (order) => order.status === "pending_approval",
  ).length;

  async function submitInvestigation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingInvestigation || submittingProposal) return;

    const expected = Number(form.expected_stock);
    const physical = Number(form.physical_stock);
    const sold = Number(form.units_sold);

    if (!form.product_name.trim()) {
      setError("Enter a product name.");
      return;
    }

    if (
      !Number.isInteger(expected) ||
      !Number.isInteger(physical) ||
      !Number.isInteger(sold) ||
      expected < 0 ||
      physical < 0 ||
      sold < 0
    ) {
      setError("Enter valid non-negative whole numbers for stock values.");
      return;
    }

    if (sold > expected) {
      setError("Units sold cannot exceed starting stock.");
      return;
    }

    setSubmittingInvestigation(true);
    setInvestigationLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await investigateInventory({
        product_name: form.product_name.trim(),
        expected_stock: expected,
        physical_stock: physical,
        units_sold: sold,
        evidence_notes: form.evidence_notes.trim(),
      });

      setLatest(result);

      setNotice(
        `Investigation #${result.investigation_id} saved successfully.`,
      );

      setTab("investigate");

      try {
        await refresh();
      } catch {
        setNotice(
          `Investigation #${result.investigation_id} saved, but history could not refresh.`,
        );
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Investigation failed. Please try again.",
      );
    } finally {
      setSubmittingInvestigation(false);
      setInvestigationLoading(false);
    }
  }

  async function createProposal() {
    if (!latest || submittingProposal || submittingInvestigation) return;

    const quantity = Number(orderQuantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      setError("Enter a valid reorder quantity between 1 and 10,000.");
      return;
    }

    setSubmittingProposal(true);
    setProposalLoading(true);
    setError("");
    setNotice("");

    try {
      const order = await proposeOrder({
        investigation_id: latest.investigation_id,
        quantity,
      });

      setNotice(`Order proposal #${order.order_id} is awaiting approval.`);
      setTab("orders");

      try {
        await refresh();
      } catch {
        setError("Proposal was created, but order history could not refresh.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Proposal creation failed.";

      setError(message);

      try {
        await refresh();
      } catch {
        // Preserve the original error.
      }
    } finally {
      setSubmittingProposal(false);
      setProposalLoading(false);
    }
  }

  async function handleDecision(
    orderId: number,
    decision: "approve" | "reject",
  ) {
    if (busyOrder !== null) return;

    const name = ownerName.trim();

    if (!name) {
      setError("Enter the approver label before making a decision.");
      return;
    }

    const confirmation =
      decision === "approve"
        ? "Approve this proposal as a simulated order? No supplier will be contacted."
        : "Reject this order proposal?";

    if (!window.confirm(confirmation)) return;

    setBusyOrder(orderId);
    setError("");
    setNotice("");

    try {
      const result = await decideOrder(orderId, {
        decision,
        approved_by: name,
      });

      setNotice(
        `Order #${result.order_id} updated: ${result.status.replaceAll("_", " ")}.`,
      );

      try {
        await refresh();
      } catch {
        setError("Decision was saved, but order history could not refresh.");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update the order. Please try again.",
      );
    } finally {
      setBusyOrder(null);
    }
  }

  const stats = [
    {
      label: "Investigations",
      value: investigations.length,
      detail: "Saved inventory checks",
    },
    {
      label: "Shortages",
      value: investigations.filter((item) => item.status === "shortage").length,
      detail: "Require review",
    },
    {
      label: "Pending orders",
      value: pendingCount,
      detail: "Awaiting owner approval",
    },
    {
      label: "Order proposals",
      value: orders.length,
      detail: "Current order view",
    },
  ];

  const navigation: {
    key: Tab;
    label: string;
    icon: string;
  }[] = [
    { key: "overview", label: "Overview", icon: "▦" },
    { key: "investigate", label: "Investigations", icon: "⌕" },
    { key: "orders", label: "Order approvals", icon: "↗" },
  ];

  return (
    <main className="min-h-screen bg-[#f7f7f8] text-zinc-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-zinc-100 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-lg font-black text-white">
            H
          </div>

          <div>
            <p className="font-bold tracking-tight">Hsain Agent</p>
            <p className="text-xs text-zinc-500">Retail operations</p>
          </div>
        </div>

        <div className="px-4 pt-7">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
            Workspace
          </p>

          <nav className="mt-3 space-y-1">
            {navigation.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${
                  tab === key
                    ? "bg-red-50 text-red-700"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                <span className="w-5 text-center text-lg">{icon}</span>
                {label}

                {key === "orders" && pendingCount > 0 && (
                  <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}

            <div className="my-4 border-t border-zinc-100" />

            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
              Evidence & inventory
            </p>

            <RouteLinks />
          </nav>
        </div>

        <div className="mt-auto border-t border-zinc-100 p-5">
          <div className="rounded-2xl bg-zinc-950 p-4 text-white">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold">
                Human approval enabled
              </span>
            </div>

            <p className="mt-3 text-xs leading-5 text-zinc-400">
              AI investigates discrepancies. You decide what happens next.
            </p>
          </div>

          <p className="mt-4 text-xs text-zinc-400">Hsain Agent · Prototype</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur sm:px-8">
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              Retail control center
            </p>

            <p className="hidden text-xs text-zinc-500 sm:block">
              Inventory intelligence · Human-led decisions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/investigations"
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 sm:px-4 sm:text-sm"
            >
              <span>✳</span>
              <span className="hidden sm:inline">AI Investigations</span>
              <span className="sm:hidden">AI</span>
              <span>→</span>
            </Link>

            <Link
              href="/evidence"
              className="hidden items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 sm:inline-flex sm:px-4 sm:text-sm"
            >
              <span>▤</span>
              Evidence Review
            </Link>

            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex">
              Demo environment
            </span>

            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700">
              O
            </span>
          </div>
        </header>

        <div className="border-b border-zinc-200 bg-white px-3 py-2 lg:hidden">
          <div className="grid grid-cols-3 gap-2">
            {navigation.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-2 py-2 text-xs font-semibold ${
                  tab === key
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {key === "investigate" ? "Investigate" : label}
              </button>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <RouteLinks mobile />
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
          {dashboardLoading && (
            <div
              role="status"
              className="mb-5 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600"
            >
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              Loading your retail operations data…
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ✕
              </button>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
            >
              <span>{notice}</span>
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss message"
              >
                ✕
              </button>
            </div>
          )}

          {tab === "overview" && (
            <>
              <SectionHeading
                eyebrow="Your operations"
                title="Good decisions start with good evidence."
                description="Investigate stock discrepancies, understand what remains uncertain, and keep every reorder decision under human control."
              />

              <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat, index) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-zinc-200 bg-white p-5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-500">
                        {stat.label}
                      </p>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          index === 1 ? "bg-red-500" : "bg-zinc-300"
                        }`}
                      />
                    </div>

                    <p className="mt-4 text-3xl font-bold tracking-tight">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">{stat.detail}</p>
                  </div>
                ))}
              </div>

              <AIInvestigationFeature />

              <div className="mb-8 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  <div className="flex items-center justify-between border-b border-zinc-100 p-5">
                    <div>
                      <h2 className="font-bold">Recent investigations</h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        Latest saved inventory checks
                      </p>
                    </div>

                    <button
                      onClick={() => setTab("investigate")}
                      className="text-xs font-bold text-red-600 hover:text-red-700"
                    >
                      New investigation ↗
                    </button>
                  </div>

                  {investigations.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="font-semibold">No investigations yet</p>
                      <p className="mt-2 text-sm text-zinc-500">
                        Start with a product and its physical stock count.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {investigations.slice(0, 6).map((item) => (
                        <button
                          key={item.investigation_id}
                          onClick={() => {
                            setLatest({
                              ...item,
                              status: item.status as
                                | "matched"
                                | "shortage"
                                | "surplus",
                              model: item.model ?? "Unavailable",
                              possible_causes: item.possible_causes ?? [],
                              missing_evidence: item.missing_evidence ?? [],
                              confidence: item.confidence ?? "low",
                            });

                            setTab("investigate");
                          }}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-zinc-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {item.product_name}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              Expected {item.expected_remaining_stock} · Counted{" "}
                              {item.physical_stock}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p
                              className={`text-sm font-bold ${
                                item.discrepancy < 0
                                  ? "text-red-600"
                                  : "text-zinc-800"
                              }`}
                            >
                              {item.discrepancy > 0 ? "+" : ""}
                              {item.discrepancy}
                            </p>

                            <div className="mt-1">
                              <StatusBadge status={item.status} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-zinc-950 p-6 text-white sm:p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">
                    How it works
                  </p>

                  <h2 className="mt-3 text-2xl font-bold leading-tight">
                    Intelligence without losing control.
                  </h2>

                  <div className="mt-7 space-y-5">
                    {[
                      [
                        "01",
                        "Calculate",
                        "Verify stock quantities using deterministic arithmetic.",
                      ],
                      [
                        "02",
                        "Investigate",
                        "Use Muse Spark to identify hypotheses and missing evidence.",
                      ],
                      [
                        "03",
                        "Review",
                        "Examine a proposed reorder before making a decision.",
                      ],
                      [
                        "04",
                        "Verify",
                        "Confirm the decision was persisted in the database.",
                      ],
                    ].map(([number, title, description]) => (
                      <div key={number} className="flex gap-4">
                        <span className="text-sm font-bold text-red-400">
                          {number}
                        </span>

                        <div>
                          <p className="text-sm font-semibold">{title}</p>
                          <p className="mt-1 text-xs leading-5 text-zinc-400">
                            {description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setTab("investigate")}
                    className="mt-8 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500"
                  >
                    Investigate inventory →
                  </button>

                  <Link
                    href="/evidence"
                    className="mt-3 flex w-full items-center justify-center rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                  >
                    Open Evidence Review →
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-red-100 bg-red-50/70 p-5">
                <p className="text-sm font-bold text-red-900">
                  Safety by design
                </p>
                <p className="mt-1 text-sm leading-6 text-red-800/80">
                  AI-generated causes are hypotheses, not proof. Reorder
                  approvals are recorded as simulated orders; no external
                  supplier is contacted. AI investigation reports never
                  authorize inventory adjustments.
                </p>
              </div>
            </>
          )}

          {tab === "investigate" && (
            <>
              <SectionHeading
                eyebrow="Inventory intelligence"
                title="Investigate a discrepancy."
                description="Enter the starting stock, recorded sales, physical count, and any evidence you have. Muse Spark will help identify possible explanations and the next evidence to collect."
              />

              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-900">
                  Looking for a full AI investigation report?
                </p>
                <p className="mt-1 text-sm text-red-800">
                  The AI Investigation workspace analyzes product history,
                  approved movements, historical discrepancies, and supporting
                  evidence.
                </p>
                <Link
                  href="/investigations"
                  className="mt-3 inline-flex text-sm font-bold text-red-700 hover:text-red-900"
                >
                  Open AI Investigations →
                </Link>
              </div>

              <div className="grid items-start gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <form
                  onSubmit={submitInvestigation}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7"
                >
                  <h2 className="font-bold">Inventory record</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Required information for a stock investigation.
                  </p>

                  <div className="mt-6 space-y-5">
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold">
                        Product name
                      </span>
                      <input
                        required
                        maxLength={120}
                        value={form.product_name}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            product_name: event.target.value,
                          })
                        }
                        placeholder="e.g. Biscuit Pack 200g"
                        className="form-input"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-3">
                      {[
                        ["expected_stock", "Starting stock"],
                        ["units_sold", "Units sold"],
                        ["physical_stock", "Physical count"],
                      ].map(([key, label]) => (
                        <label key={key} className="block">
                          <span className="mb-2 block text-xs font-semibold text-zinc-600">
                            {label}
                          </span>
                          <input
                            required
                            type="number"
                            min={0}
                            step={1}
                            value={form[key as keyof typeof form]}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                [key]: event.target.value,
                              })
                            }
                            className="form-input"
                          />
                        </label>
                      ))}
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold">
                        Evidence and observations
                      </span>
                      <textarea
                        maxLength={2000}
                        rows={4}
                        value={form.evidence_notes}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            evidence_notes: event.target.value,
                          })
                        }
                        placeholder="When was the count taken? Were damaged items found? What records have you checked?"
                        className="form-input resize-y"
                      />
                      <span className="mt-1 block text-xs text-zinc-400">
                        Do not include passwords or sensitive customer
                        information.
                      </span>
                    </label>

                    <div className="rounded-xl bg-zinc-50 p-4">
                      <p className="text-xs font-semibold text-zinc-500">
                        Expected remaining stock
                      </p>
                      <p className="mt-1 text-2xl font-bold">
                        {Number.isFinite(Number(form.expected_stock)) &&
                        Number.isFinite(Number(form.units_sold))
                          ? Math.max(
                              0,
                              Number(form.expected_stock) -
                                Number(form.units_sold),
                            )
                          : 0}
                        <span className="ml-2 text-sm font-normal text-zinc-400">
                          units
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Physical count minus expected stock determines the
                        discrepancy.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        investigationLoading ||
                        proposalLoading ||
                        dashboardLoading
                      }
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {investigationLoading && (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      )}
                      {investigationLoading
                        ? "Analyzing inventory…"
                        : "Run AI investigation →"}
                    </button>
                  </div>
                </form>

                <div className="space-y-5">
                  {!latest ? (
                    <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600">
                        ✳
                      </div>
                      <h2 className="mt-4 font-bold">
                        Your findings will appear here
                      </h2>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                        Submit an inventory record to calculate the discrepancy
                        and request evidence-aware analysis from Muse Spark.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.15em] text-red-600">
                              Investigation #{latest.investigation_id}
                            </p>
                            <h2 className="mt-2 text-xl font-bold">
                              {latest.product_name}
                            </h2>
                          </div>
                          <StatusBadge status={latest.status} />
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-3">
                          {[
                            ["Expected", latest.expected_remaining_stock],
                            ["Counted", latest.physical_stock],
                            ["Difference", latest.discrepancy],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="rounded-xl bg-zinc-50 p-3"
                            >
                              <p className="text-xs text-zinc-500">{label}</p>
                              <p
                                className={`mt-2 text-xl font-bold ${
                                  label === "Difference" && Number(value) < 0
                                    ? "text-red-600"
                                    : ""
                                }`}
                              >
                                {Number(value) > 0 && label === "Difference"
                                  ? "+"
                                  : ""}
                                {value}
                              </p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6">
                          <h3 className="text-sm font-bold">
                            Investigation summary
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-zinc-600">
                            {latest.investigation}
                          </p>
                        </div>

                        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4">
                          <div>
                            <p className="text-sm font-semibold">
                              AI confidence
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              Confidence in the available explanation, not the
                              arithmetic.
                            </p>
                          </div>
                          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase text-amber-700">
                            {latest.confidence}
                          </span>
                        </div>

                        <div className="mt-5">
                          <h3 className="text-sm font-bold">Possible causes</h3>
                          {(latest.possible_causes ?? []).length > 0 ? (
                            <ul className="mt-3 space-y-2">
                              {(latest.possible_causes ?? []).map(
                                (cause, index) => (
                                  <li
                                    key={index}
                                    className="flex gap-2 text-sm leading-5 text-zinc-600"
                                  >
                                    <span className="text-amber-600">•</span>
                                    {cause}
                                  </li>
                                ),
                              )}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-zinc-500">
                              Structured cause data is unavailable for this
                              investigation.
                            </p>
                          )}
                        </div>

                        <div className="mt-5">
                          <h3 className="text-sm font-bold">
                            Missing evidence
                          </h3>
                          {(latest.missing_evidence ?? []).length > 0 ? (
                            <ul className="mt-3 space-y-2">
                              {(latest.missing_evidence ?? []).map(
                                (item, index) => (
                                  <li
                                    key={index}
                                    className="flex gap-2 text-sm leading-5 text-zinc-600"
                                  >
                                    <span className="text-red-600">→</span>
                                    {item}
                                  </li>
                                ),
                              )}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-zinc-500">
                              Review the summary and collect supporting records.
                            </p>
                          )}
                        </div>

                        <div className="mt-5 rounded-xl bg-red-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-red-700">
                            Recommended next step
                          </p>
                          <p className="mt-2 text-sm leading-6 text-red-950">
                            {latest.recommended_action}
                          </p>
                        </div>

                        <p className="mt-4 text-xs text-zinc-400">
                          Analysis model: {latest.model}
                        </p>

                        <Link
                          href="/evidence"
                          className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100"
                        >
                          <span>▤</span>
                          Review supporting evidence →
                        </Link>
                      </div>

                      {latest.status === "shortage" && (
                        <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-7">
                          <h2 className="font-bold">Propose a reorder</h2>
                          <p className="mt-1 text-sm leading-6 text-zinc-500">
                            This creates a proposal for human review. It does
                            not place an actual supplier order.
                          </p>

                          <label className="mt-5 block">
                            <span className="mb-2 block text-sm font-semibold">
                              Proposed quantity
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={10000}
                              value={orderQuantity}
                              onChange={(event) =>
                                setOrderQuantity(event.target.value)
                              }
                              className="form-input"
                            />
                          </label>

                          <button
                            onClick={createProposal}
                            disabled={
                              proposalLoading ||
                              investigationLoading ||
                              !Number.isInteger(Number(orderQuantity)) ||
                              Number(orderQuantity) < 1 ||
                              Number(orderQuantity) > 10000
                            }
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {proposalLoading && (
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                            )}
                            {proposalLoading
                              ? "Creating proposal…"
                              : "Create approval proposal →"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {tab === "orders" && (
            <>
              <SectionHeading
                eyebrow="Human-in-the-loop"
                title="Order approvals."
                description="Review proposed quantities, record an approval or rejection, and verify that the result has been saved."
              />

              <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5">
                <label className="block max-w-md">
                  <span className="mb-2 block text-sm font-semibold">
                    Approver label
                  </span>
                  <input
                    value={ownerName}
                    maxLength={120}
                    onChange={(event) => setOwnerName(event.target.value)}
                    className="form-input"
                    placeholder="Enter approver name"
                  />
                  <span className="mt-1 block text-xs text-zinc-400">
                    Prototype only; this is not authenticated identity.
                  </span>
                </label>

                <label className="mt-4 block max-w-md">
                  <span className="mb-2 block text-sm font-semibold">
                    Filter orders
                  </span>
                  <select
                    value={orderFilter}
                    onChange={(event) => setOrderFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="">All orders</option>
                    <option value="pending_approval">Pending approval</option>
                    <option value="simulated_ordered">
                      Approved · simulated
                    </option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
              </div>

              {dashboardLoading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
                  <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                  <p className="mt-4 text-sm text-zinc-500">Loading orders…</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center">
                  <h2 className="font-bold">No orders in this view</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Create a proposal from a shortage investigation.
                  </p>
                  <button
                    onClick={() => setTab("investigate")}
                    className="mt-5 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700"
                  >
                    Start investigation
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.order_id}
                      className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-zinc-400">
                            ORDER #{order.order_id} · INVESTIGATION #
                            {order.investigation_id}
                          </p>
                          <h2 className="mt-2 text-lg font-bold">
                            {order.quantity} units proposed
                          </h2>
                        </div>
                        <StatusBadge status={order.status} />
                      </div>

                      <p className="mt-3 text-sm leading-6 text-zinc-600">
                        {order.reason}
                      </p>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-100 pt-4">
                        <div className="text-xs leading-5 text-zinc-500">
                          <p>
                            Created{" "}
                            {new Date(order.created_at).toLocaleString()}
                          </p>
                          {order.approved_by && (
                            <p>Decision recorded by {order.approved_by}</p>
                          )}
                        </div>

                        {order.status === "pending_approval" && (
                          <div className="flex gap-2">
                            <button
                              disabled={busyOrder !== null}
                              onClick={() =>
                                handleDecision(order.order_id, "reject")
                              }
                              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busyOrder === order.order_id
                                ? "Saving…"
                                : "Reject"}
                            </button>

                            <button
                              disabled={busyOrder !== null}
                              onClick={() =>
                                handleDecision(order.order_id, "approve")
                              }
                              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busyOrder === order.order_id
                                ? "Saving…"
                                : "Approve simulation"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <strong>Simulation notice:</strong> An approved order is
                recorded locally as <code>simulated_ordered</code>. No supplier
                is contacted, and no purchase or payment occurs.
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
