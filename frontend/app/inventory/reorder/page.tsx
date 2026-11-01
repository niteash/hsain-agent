"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Package,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";

import {
  getReorderIntelligence,
  type ReorderIntelligenceItem,
  type ReorderIntelligenceResponse,
  type ReorderUrgency,
} from "@/lib/inventory";

// ============================================================
// FORMATTERS
// ============================================================

const numberFormatter = new Intl.NumberFormat("en-IN");

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return numberFormatter.format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUrgency(value: string): string {
  return value.replaceAll("_", " ");
}

function formatQuantityReason(reason: string): string {
  switch (reason) {
    case "replenishment_required":
      return "Replenishment is required";

    case "stock_above_reorder_point":
      return "Stock is above the reorder point";

    case "reorder_point_unavailable":
      return "Reorder point is unavailable";

    default:
      return formatUrgency(reason);
  }
}

// ============================================================
// URGENCY CONFIGURATION
// ============================================================

const urgencyConfig: Record<
  ReorderUrgency,
  {
    label: string;
    text: string;
    background: string;
    border: string;
    dot: string;
  }
> = {
  critical: {
    label: "Critical",
    text: "text-red-700",
    background: "bg-red-50",
    border: "border-red-200",
    dot: "bg-red-600",
  },
  high: {
    label: "High",
    text: "text-orange-700",
    background: "bg-orange-50",
    border: "border-orange-200",
    dot: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    text: "text-amber-700",
    background: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  normal: {
    label: "Normal",
    text: "text-emerald-700",
    background: "bg-emerald-50",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  undetermined: {
    label: "Undetermined",
    text: "text-zinc-600",
    background: "bg-zinc-100",
    border: "border-zinc-200",
    dot: "bg-zinc-400",
  },
};

const urgencyFilters: Array<{
  label: string;
  value: ReorderUrgency | "all";
}> = [
  { label: "All products", value: "all" },
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Normal", value: "normal" },
  { label: "Undetermined", value: "undetermined" },
];

function getUrgency(value: string | undefined): ReorderUrgency {
  if (value && value in urgencyConfig) {
    return value as ReorderUrgency;
  }

  return "undetermined";
}

// ============================================================
// SMALL COMPONENTS
// ============================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-8 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const config = urgencyConfig[getUrgency(urgency)];

  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold ${config.background} ${config.text} ${config.border}`}
    >
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  description: string;
  icon: typeof Package;
  accent: "red" | "orange" | "amber" | "zinc";
}) {
  const styles = {
    red: "bg-red-50 text-red-700",
    orange: "bg-orange-50 text-orange-700",
    amber: "bg-amber-50 text-amber-700",
    zinc: "bg-zinc-100 text-zinc-700",
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">{label}</p>

          <p className="mt-3 text-3xl font-bold tracking-tight text-zinc-950">
            {formatNumber(value)}
          </p>

          <p className="mt-2 text-xs text-zinc-400">{description}</p>
        </div>

        <div className={`rounded-xl p-3 ${styles[accent]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
        {eyebrow}
      </p>

      <h2 className="mt-1 text-lg font-bold text-zinc-950">{title}</h2>

      <p className="mt-1 text-sm text-zinc-500">{description}</p>
    </div>
  );
}

// ============================================================
// PLANNING CONTROLS
// ============================================================

function PlanningControls({
  leadTime,
  safetyBuffer,
  targetCover,
  onLeadTimeChange,
  onSafetyBufferChange,
  onTargetCoverChange,
}: {
  leadTime: number;
  safetyBuffer: number;
  targetCover: number;
  onLeadTimeChange: (value: number) => void;
  onSafetyBufferChange: (value: number) => void;
  onTargetCoverChange: (value: number) => void;
}) {
  const controls = [
    {
      id: "lead-time",
      label: "Supplier lead time",
      description: "Estimated delivery period",
      value: leadTime,
      min: 1,
      max: 365,
      suffix: "days",
      onChange: onLeadTimeChange,
    },
    {
      id: "safety-buffer",
      label: "Safety buffer",
      description: "Additional stock protection",
      value: safetyBuffer,
      min: 0,
      max: 365,
      suffix: "days",
      onChange: onSafetyBufferChange,
    },
    {
      id: "target-cover",
      label: "Target coverage",
      description: "Desired inventory coverage",
      value: targetCover,
      min: 1,
      max: 365,
      suffix: "days",
      onChange: onTargetCoverChange,
    },
  ];

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {controls.map((control) => (
        <div key={control.id}>
          <label
            htmlFor={control.id}
            className="text-sm font-semibold text-zinc-800"
          >
            {control.label}
          </label>

          <p className="mt-1 text-xs text-zinc-400">{control.description}</p>

          <div className="mt-3 flex items-center gap-3">
            <input
              id={control.id}
              type="number"
              min={control.min}
              max={control.max}
              step={1}
              value={control.value}
              onChange={(event) => {
                const rawValue = event.target.value;

                if (rawValue === "") return;

                const value = Number(rawValue);

                if (!Number.isFinite(value)) return;

                control.onChange(
                  Math.min(
                    control.max,
                    Math.max(control.min, Math.floor(value)),
                  ),
                );
              }}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />

            <span className="text-xs text-zinc-400">{control.suffix}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// EXISTING ORDER PROPOSALS
// ============================================================

function ExistingOrders({
  orders,
}: {
  orders: ReorderIntelligenceItem["existing_orders"];
}) {
  if (!orders || orders.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        No existing supplier order proposals.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const simulated = order.status === "simulated_ordered";
        const pending = order.status === "pending_approval";

        return (
          <div
            key={order.order_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2"
          >
            <div>
              <p className="text-xs font-bold text-zinc-800">
                Order proposal #{order.order_id}
              </p>

              <p className="mt-1 text-[10px] text-zinc-400">
                {formatDate(order.created_at)} · {formatNumber(order.quantity)}{" "}
                units
              </p>
            </div>

            <div className="text-right">
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                  simulated
                    ? "bg-amber-100 text-amber-800"
                    : pending
                      ? "bg-orange-100 text-orange-800"
                      : "bg-zinc-200 text-zinc-700"
                }`}
              >
                {formatUrgency(order.status)}
              </span>

              <p className="mt-1 text-[10px] font-semibold text-red-600">
                Not confirmed incoming
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// PRODUCT REORDER CARD
// ============================================================

function ReorderProductCard({ item }: { item: ReorderIntelligenceItem }) {
  const decision = item.decision;
  const calculation = item.reorder_calculation;
  const sales = item.sales;

  const urgency = getUrgency(decision?.urgency);

  const daysOfCover = sales?.days_of_cover;
  const averageDailySales = sales?.average_daily_sales_exact;
  const unitsSold = sales?.units_sold;

  const recommendedQuantity =
    calculation.final_quantity_calculation?.recommended_quantity ??
    decision?.recommended_quantity;

  const reorderPoint = calculation?.effective_reorder_point;

  const orders = item.existing_orders ?? [];
  const recommendations = item.recommendations ?? [];

  const pointCalculation = calculation?.reorder_point_calculation;
  const quantityCalculation = calculation?.quantity_calculation;
  const finalCalculation = calculation?.final_quantity_calculation;

  const salesAvailable = sales?.verified_sales_available ?? false;
  const confidence = item.risk?.data_confidence ?? "low";

  const sourceLabel = (source: string) => {
    return source === "product_configuration"
      ? "Product configuration"
      : "API default";
  };

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300">
      {/* PRODUCT OVERVIEW */}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.8fr_0.8fr_0.9fr] xl:items-center">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-zinc-100 p-3 text-zinc-700">
              <Package size={19} />
            </div>

            <div className="min-w-0">
              <Link
                href={`/products/${item.product_id}`}
                className="block truncate text-sm font-bold text-zinc-950 hover:text-red-600"
              >
                {item.product_name}
              </Link>

              <p className="mt-1 text-xs text-zinc-400">
                {item.sku ?? "No SKU"} · #{item.product_id}
              </p>

              <div className="mt-3">
                <UrgencyBadge urgency={urgency} />
              </div>
            </div>
          </div>
        </div>

        {/* CURRENT STOCK */}

        <div>
          <p className="text-xs text-zinc-400">Current stock</p>

          <p
            className={`mt-2 text-2xl font-bold ${
              item.current_stock <= 0 ? "text-red-600" : "text-zinc-950"
            }`}
          >
            {formatNumber(item.current_stock)}
          </p>

          <p className="mt-1 text-xs text-zinc-400">
            Reorder point: {formatNumber(reorderPoint)}
          </p>
        </div>

        {/* SALES COVERAGE */}

        <div>
          <p className="text-xs text-zinc-400">Stock coverage</p>

          <p className="mt-2 text-xl font-bold text-zinc-950">
            {daysOfCover !== null && daysOfCover !== undefined
              ? `${Number(daysOfCover).toFixed(1)} days`
              : "Unavailable"}
          </p>

          <p className="mt-1 text-xs text-zinc-400">
            {salesAvailable
              ? `${formatNumber(unitsSold)} verified units sold`
              : "No approved sales records"}
          </p>

          {salesAvailable && averageDailySales !== undefined && (
            <p className="mt-1 text-xs text-zinc-400">
              {Number(averageDailySales).toFixed(4)} units/day
            </p>
          )}
        </div>

        {/* FINAL RECOMMENDED QUANTITY */}

        <div>
          <p className="text-xs text-zinc-400">Final recommended quantity</p>

          <p className="mt-2 text-2xl font-bold text-red-600">
            {recommendedQuantity === null || recommendedQuantity === undefined
              ? "—"
              : formatNumber(recommendedQuantity)}
          </p>

          <p className="mt-1 text-xs text-zinc-400">
            {finalCalculation?.reason
              ? formatQuantityReason(finalCalculation.reason)
              : "Planning recommendation only"}
          </p>
        </div>
      </div>

      {/* CALCULATION BREAKDOWN */}

      <div className="mt-6 border-t border-zinc-100 pt-5">
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">
            Calculation transparency
          </p>

          <h3 className="mt-1 text-sm font-bold text-zinc-950">
            Why this recommendation?
          </h3>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* SALES VELOCITY */}

          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs font-semibold text-zinc-500">
              01 · Sales velocity
            </p>

            <p className="mt-3 text-xl font-bold text-zinc-950">
              {salesAvailable && averageDailySales !== undefined
                ? Number(averageDailySales).toFixed(4)
                : "—"}
            </p>

            <p className="mt-1 text-xs text-zinc-400">Units per day</p>

            <div className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
              <p>
                Verified sales:{" "}
                <strong className="text-zinc-800">
                  {formatNumber(unitsSold)}
                </strong>
              </p>

              <p className="mt-1">Analysis period: {sales.period_days} days</p>

              <p className="mt-1">
                Data confidence:{" "}
                <strong className="capitalize text-zinc-800">
                  {confidence}
                </strong>
              </p>
            </div>
          </div>

          {/* REORDER POINT */}

          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs font-semibold text-zinc-500">
              02 · Reorder point
            </p>

            <p className="mt-3 text-xl font-bold text-zinc-950">
              {formatNumber(reorderPoint)}
            </p>

            <p className="mt-1 text-xs text-zinc-400">Effective threshold</p>

            <div className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
              <p>
                Lead time:{" "}
                <strong className="text-zinc-800">
                  {calculation.lead_time_days} days
                </strong>
              </p>

              <p className="mt-1">
                Source: {sourceLabel(calculation.lead_time_source)}
              </p>

              <p className="mt-2">
                Safety buffer:{" "}
                <strong className="text-zinc-800">
                  {calculation.safety_buffer_days} days
                </strong>
              </p>

              <p className="mt-1">
                Source: {sourceLabel(calculation.safety_buffer_source)}
              </p>
            </div>
          </div>

          {/* TARGET STOCK */}

          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs font-semibold text-zinc-500">
              03 · Target stock
            </p>

            <p className="mt-3 text-xl font-bold text-zinc-950">
              {formatNumber(calculation.target_stock)}
            </p>

            <p className="mt-1 text-xs text-zinc-400">
              Desired inventory level
            </p>

            <div className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
              <p>
                Target coverage:{" "}
                <strong className="text-zinc-800">
                  {calculation.target_cover_days} days
                </strong>
              </p>

              <p className="mt-1">
                Maximum stock:{" "}
                <strong className="text-zinc-800">
                  {formatNumber(calculation.maximum_stock)}
                </strong>
              </p>

              <p className="mt-2">
                Quantity method:{" "}
                <strong className="text-zinc-800">
                  {decision.quantity_source.replaceAll("_", " ")}
                </strong>
              </p>
            </div>
          </div>

          {/* QUANTITY CALCULATION AND FINAL DECISION */}

          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-xs font-semibold text-red-700">
              04 · Replenishment quantities
            </p>

            <div className="mt-3">
              <p className="text-xs text-red-600">Calculated target gap</p>

              <p className="mt-1 text-xl font-bold text-zinc-950">
                {formatNumber(
                  quantityCalculation?.calculated_quantity ??
                    quantityCalculation?.result,
                )}
              </p>
            </div>

            <div className="mt-3 border-t border-red-200 pt-3">
              <p className="text-xs text-red-600">Final recommended quantity</p>

              <p className="mt-1 text-2xl font-bold text-red-700">
                {recommendedQuantity === null ||
                recommendedQuantity === undefined
                  ? "—"
                  : formatNumber(recommendedQuantity)}
              </p>

              <p className="mt-2 text-xs leading-5 text-red-800">
                {finalCalculation?.reason
                  ? formatQuantityReason(finalCalculation.reason)
                  : "Review replenishment decision"}
              </p>
            </div>

            <p className="mt-3 border-t border-red-200 pt-3 text-xs font-semibold text-red-800">
              Requires human approval
            </p>
          </div>
        </div>

        {/* FORMULA EXPLANATION */}

        <div className="mt-4 rounded-xl border border-zinc-200 p-4">
          <p className="text-xs font-bold text-zinc-800">
            Reorder point calculation
          </p>

          {calculation.reorder_point_source === "configured" ? (
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              A manually configured reorder point of{" "}
              <strong className="text-zinc-800">
                {formatNumber(calculation.configured_reorder_point)}
              </strong>{" "}
              is being used instead of the sales-based calculation.
            </p>
          ) : pointCalculation?.available ? (
            <p className="mt-2 break-words text-xs leading-5 text-zinc-500">
              Formula:{" "}
              <strong className="text-zinc-800">
                {pointCalculation.formula}
              </strong>
              <br />
              {pointCalculation.average_daily_sales_exact.toFixed(4)} × (
              {pointCalculation.lead_time_days} +{" "}
              {pointCalculation.safety_buffer_days}) ={" "}
              <strong className="text-zinc-800">
                {formatNumber(pointCalculation.result)}
              </strong>
            </p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-amber-700">
              A sales-based reorder point cannot be calculated because verified
              sales data is unavailable. Configure a reorder point manually or
              verify the sales records.
            </p>
          )}

          <div className="mt-4 border-t border-zinc-100 pt-4">
            <p className="text-xs font-bold text-zinc-800">
              Mathematical replenishment calculation
            </p>

            {quantityCalculation ? (
              <p className="mt-2 break-words text-xs leading-5 text-zinc-500">
                Formula:{" "}
                <strong className="text-zinc-800">
                  {quantityCalculation.formula}
                </strong>
                <br />
                Target stock ({formatNumber(quantityCalculation.target_stock)})
                − Current stock (
                {formatNumber(quantityCalculation.current_stock)}) ={" "}
                <strong className="text-zinc-800">
                  {formatNumber(
                    quantityCalculation.calculated_quantity ??
                      quantityCalculation.result,
                  )}
                </strong>
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-700">
                Insufficient data to calculate a mathematical replenishment
                quantity.
              </p>
            )}

            <div className="mt-4 border-t border-zinc-100 pt-4">
              <p className="text-xs font-bold text-zinc-800">
                Final replenishment decision
              </p>

              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Calculated target gap:{" "}
                <strong className="text-zinc-800">
                  {formatNumber(finalCalculation?.calculated_quantity)}
                </strong>
                <br />
                Final recommended quantity:{" "}
                <strong className="text-red-700">
                  {formatNumber(recommendedQuantity)}
                </strong>
                <br />
                Decision:{" "}
                <strong className="text-zinc-800">
                  {finalCalculation?.reason
                    ? formatQuantityReason(finalCalculation.reason)
                    : "Unavailable"}
                </strong>
              </p>
            </div>
          </div>
        </div>

        {!salesAvailable && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle
              size={15}
              className="mt-0.5 shrink-0 text-amber-700"
            />

            <p className="text-xs leading-5 text-amber-800">
              No approved sales movement records are available for this analysis
              period. This does not establish that actual sales were zero.
              Verify the sales history before relying on sales-based estimates.
            </p>
          </div>
        )}
      </div>

      {/* ADDITIONAL INFORMATION */}

      <div className="mt-5 grid gap-5 border-t border-zinc-100 pt-5 lg:grid-cols-2">
        {/* EXISTING ORDERS */}

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Existing order proposals
          </p>

          <ExistingOrders orders={orders} />

          {orders.length > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              Proposed quantity:{" "}
              <strong className="text-zinc-800">
                {formatNumber(decision?.existing_order_quantity)}
              </strong>
              . These orders are not treated as confirmed incoming stock.
            </p>
          )}
        </div>

        {/* DECISION SUPPORT */}

        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Decision support
          </p>

          {recommendations.length === 0 ? (
            <p className="text-xs text-zinc-400">
              No additional recommendations.
            </p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <li
                  key={`${item.product_id}-${index}`}
                  className="flex gap-2 text-xs leading-5 text-zinc-600"
                >
                  <CheckCircle2
                    size={14}
                    className="mt-0.5 shrink-0 text-red-600"
                  />
                  {recommendation}
                </li>
              ))}
            </ul>
          )}

          {item.related_investigation && (
            <Link
              href="/investigations"
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"
            >
              Related investigation #
              {item.related_investigation.investigation_id}
              <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </div>

      {/* SAFETY INDICATORS */}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1">
          <ShieldCheck size={13} />
          Human approval required
        </span>

        <span>Automatic ordering: disabled</span>

        <span>Inventory modified: no</span>
      </div>
    </article>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function ReorderIntelligencePage() {
  const [data, setData] = useState<ReorderIntelligenceResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Planning parameters
  const [leadTime, setLeadTime] = useState(7);
  const [safetyBuffer, setSafetyBuffer] = useState(3);
  const [targetCover, setTargetCover] = useState(30);

  // Filter
  const [selectedUrgency, setSelectedUrgency] = useState<
    ReorderUrgency | "all"
  >("all");

  // ============================================================
  // LOAD DATA
  // ============================================================

  const loadData = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const result = await getReorderIntelligence({
          lead_time_days: leadTime,
          safety_buffer_days: safetyBuffer,
          target_cover_days: targetCover,
          urgency: selectedUrgency === "all" ? undefined : selectedUrgency,
          limit: 100,
          offset: 0,
        });

        setData(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load reorder intelligence.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [leadTime, safetyBuffer, targetCover, selectedUrgency],
  );

  // Initial load and urgency-filter changes.
  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ============================================================
  // SUMMARY
  // ============================================================

  const summary = data?.summary;

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-8 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        {/* HEADER */}

        <header className="mb-8">
          <div className="mb-4 text-sm text-zinc-500">
            <Link href="/" className="hover:text-red-600">
              Dashboard
            </Link>
            {" / "}
            <Link href="/inventory" className="hover:text-red-600">
              Inventory
            </Link>
            {" / "}
            <span className="text-zinc-900">Reorder Intelligence</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
                Inventory planning
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Reorder Intelligence
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                Identify replenishment requirements using configured stock
                thresholds, approved sales movements, and planning assumptions.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </header>

        {/* ERROR */}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <p className="font-semibold">Reorder intelligence unavailable.</p>

            <p className="mt-1">{error}</p>

            <button
              type="button"
              onClick={() => void loadData(true)}
              className="mt-3 font-bold underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* INITIAL LOADING */}

        {loading && !data ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-16 text-center">
            <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />

            <p className="mt-4 text-sm text-zinc-500">
              Calculating replenishment requirements...
            </p>
          </div>
        ) : data ? (
          <>
            {/* SUMMARY */}

            <section className="mb-8">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                    Replenishment overview
                  </p>

                  <h2 className="mt-1 text-xl font-bold text-zinc-950">
                    Inventory decisions
                  </h2>
                </div>

                <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600">
                  {summary?.total_products ?? data.total} products analyzed
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Reorder required"
                  value={summary?.reorder_required ?? 0}
                  description="Products meeting reorder conditions"
                  icon={ShoppingCart}
                  accent="red"
                />

                <MetricCard
                  label="Critical urgency"
                  value={summary?.critical ?? 0}
                  description="Immediate replenishment attention"
                  icon={AlertTriangle}
                  accent="red"
                />

                <MetricCard
                  label="High urgency"
                  value={summary?.high ?? 0}
                  description="Priority replenishment"
                  icon={TrendingDown}
                  accent="orange"
                />

                <MetricCard
                  label="Undetermined"
                  value={summary?.undetermined ?? 0}
                  description="Insufficient data for classification"
                  icon={Clock3}
                  accent="zinc"
                />
              </div>
            </section>

            {/* PLANNING PARAMETERS */}

            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="mb-6 flex items-start gap-3">
                <div className="rounded-xl bg-red-50 p-3 text-red-600">
                  <Settings2 size={20} />
                </div>

                <div>
                  <SectionTitle
                    eyebrow="Planning assumptions"
                    title="Replenishment parameters"
                    description="Adjust these assumptions and recalculate the reorder recommendations."
                  />
                </div>
              </div>

              <PlanningControls
                leadTime={leadTime}
                safetyBuffer={safetyBuffer}
                targetCover={targetCover}
                onLeadTimeChange={setLeadTime}
                onSafetyBufferChange={setSafetyBuffer}
                onTargetCoverChange={setTargetCover}
              />

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-5">
                <p className="max-w-2xl text-xs leading-5 text-zinc-400">
                  Lead time, safety buffer, and target coverage are planning
                  assumptions. They are not verified supplier commitments.
                </p>

                <button
                  type="button"
                  onClick={() => void loadData(true)}
                  disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <RefreshCw
                    size={15}
                    className={refreshing ? "animate-spin" : ""}
                  />
                  Recalculate
                </button>
              </div>
            </section>

            {/* FILTERS AND PRODUCT LIST */}

            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <SectionTitle
                  eyebrow="Product-level recommendations"
                  title="Replenishment queue"
                  description="Review stock positions, sales coverage, recommended quantities, and existing order proposals."
                />

                <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">
                  {data.total} result(s)
                </span>
              </div>

              <div className="mb-6 flex flex-wrap gap-2">
                {urgencyFilters.map((filter) => {
                  const active = selectedUrgency === filter.value;

                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setSelectedUrgency(filter.value)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-zinc-200 bg-white text-zinc-600 hover:border-red-300 hover:text-red-600"
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>

              {refreshing && (
                <div className="mb-4 flex items-center gap-2 text-xs text-zinc-400">
                  <RefreshCw size={13} className="animate-spin" />
                  Updating recommendations...
                </div>
              )}

              {data.items.length === 0 ? (
                <EmptyState message="No products match this urgency filter." />
              ) : (
                <div className="space-y-4">
                  {data.items.map((item) => (
                    <ReorderProductCard key={item.product_id} item={item} />
                  ))}
                </div>
              )}
            </section>

            {/* ORDER WORKFLOW */}

            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-zinc-950 p-3 text-white">
                    <ShoppingCart size={21} />
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                      Human-controlled workflow
                    </p>

                    <h2 className="mt-1 text-lg font-bold text-zinc-950">
                      Supplier order approvals
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                      Review existing simulated supplier orders and pending
                      proposals. Reorder recommendations do not automatically
                      create orders or contact suppliers.
                    </p>
                  </div>
                </div>

                <Link
                  href="/orders"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700"
                >
                  Open order workflow
                  <ArrowRight size={16} />
                </Link>
              </div>
            </section>

            {/* SAFETY */}

            <section className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  size={21}
                  className="mt-0.5 shrink-0 text-red-700"
                />

                <div>
                  <h3 className="text-sm font-bold text-red-950">
                    Inventory and purchasing safeguards
                  </h3>

                  <div className="mt-2 space-y-2 text-xs leading-5 text-red-900/80">
                    <p>
                      Sales velocity is calculated from approved sales movements
                      only. Unverified documents and pending proposals are not
                      treated as completed stock movements.
                    </p>

                    <p>
                      Existing pending or simulated orders are displayed for
                      awareness, but are not considered confirmed incoming
                      inventory.
                    </p>

                    <p>
                      Recommended quantities are decision-support estimates. No
                      supplier is contacted, no order is automatically placed,
                      and no product stock is modified by this page. Human
                      review remains necessary.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : (
          <EmptyState message="No reorder intelligence data is available." />
        )}
      </div>
    </main>
  );
}
