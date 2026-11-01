"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Package,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Settings2,
  ShoppingCart,
} from "lucide-react";

import {
  getStockReconciliation,
  getDiscrepancyAlerts,
  getStockLedger,
  getPendingMovements,
  getInventoryProducts,
  getInventoryRisk,
  type StockReconciliation,
  type StockDiscrepancyAlert,
  type StockLedgerItem,
  type InventoryRiskResponse,
  type InventoryRiskItem,
  type InventoryRiskLevel,
} from "@/lib/inventory";

import { getStockHealth } from "@/lib/products";

import type { Product, StockHealthStatus } from "@/types/product";

import {
  getInvestigations,
  getOrders,
  type InvestigationHistoryItem,
  type Order,
} from "@/lib/api";

// ============================================================
// TYPES
// ============================================================

type AnalyticsData = {
  reconciliation: StockReconciliation;
  openAlerts: StockDiscrepancyAlert[];
  resolvedAlerts: StockDiscrepancyAlert[];
  ledger: StockLedgerItem[];
  pendingMovements: number;
  products: Product[];
  investigations: InvestigationHistoryItem[];
  orders: Order[];
  risk: InventoryRiskResponse | null;
};

type DailyMovement = {
  date: string;
  receipts: number;
  sales: number;
  other: number;
};

type StockHealthSummary = {
  total: number;
  configured: number;
  unconfigured: number;
  notConfiguredStatus: number;
  outOfStock: number;
  critical: number;
  lowStock: number;
  healthy: number;
  overstocked: number;
  reorderRequired: Product[];
  criticalProducts: Product[];
  unconfiguredProducts: Product[];
};

// ============================================================
// FORMATTERS
// ============================================================

const numberFormatter = new Intl.NumberFormat("en-IN");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

// ============================================================
// STOCK HEALTH CONFIGURATION
// ============================================================

const stockStatusConfig: Record<
  StockHealthStatus,
  {
    label: string;
    color: string;
    background: string;
    border: string;
    bar: string;
  }
> = {
  out_of_stock: {
    label: "Out of Stock",
    color: "text-red-700",
    background: "bg-red-50",
    border: "border-red-200",
    bar: "bg-red-600",
  },
  critical: {
    label: "Critical",
    color: "text-red-700",
    background: "bg-red-50",
    border: "border-red-200",
    bar: "bg-red-500",
  },
  low_stock: {
    label: "Low Stock",
    color: "text-amber-700",
    background: "bg-amber-50",
    border: "border-amber-200",
    bar: "bg-amber-500",
  },
  healthy: {
    label: "Healthy",
    color: "text-emerald-700",
    background: "bg-emerald-50",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
  },
  overstocked: {
    label: "Overstocked",
    color: "text-orange-700",
    background: "bg-orange-50",
    border: "border-orange-200",
    bar: "bg-orange-500",
  },
  not_configured: {
    label: "Not Configured",
    color: "text-zinc-600",
    background: "bg-zinc-100",
    border: "border-zinc-200",
    bar: "bg-zinc-400",
  },
};

function getStockHealthSummary(products: Product[]): StockHealthSummary {
  const summary: StockHealthSummary = {
    total: products.length,
    configured: 0,
    unconfigured: 0,
    notConfiguredStatus: 0,
    outOfStock: 0,
    critical: 0,
    lowStock: 0,
    healthy: 0,
    overstocked: 0,
    reorderRequired: [],
    criticalProducts: [],
    unconfiguredProducts: [],
  };

  for (const product of products) {
    const health = getStockHealth(product);

    const configured =
      product.minimum_stock !== null ||
      product.reorder_point !== null ||
      product.maximum_stock !== null;

    if (configured) {
      summary.configured++;
    } else {
      summary.unconfigured++;
      summary.unconfiguredProducts.push(product);
    }

    switch (health.status) {
      case "out_of_stock":
        summary.outOfStock++;
        summary.criticalProducts.push(product);
        summary.reorderRequired.push(product);
        break;

      case "critical":
        summary.critical++;
        summary.criticalProducts.push(product);
        summary.reorderRequired.push(product);
        break;

      case "low_stock":
        summary.lowStock++;
        summary.reorderRequired.push(product);
        break;

      case "healthy":
        summary.healthy++;
        break;

      case "overstocked":
        summary.overstocked++;
        break;

      case "not_configured":
        summary.notConfiguredStatus++;
        break;
    }
  }

  return summary;
}

// ============================================================
// METRIC CARD
// ============================================================

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  accent = "neutral",
}: {
  label: string;
  value: string | number;
  description: string;
  icon: typeof Package;
  accent?: "neutral" | "red" | "green" | "amber";
}) {
  const accents = {
    neutral: "bg-zinc-100 text-zinc-700",
    red: "bg-red-50 text-red-600",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-zinc-950">
            {typeof value === "number" ? formatNumber(value) : value}
          </p>
          <p className="mt-2 text-xs text-zinc-400">{description}</p>
        </div>

        <div className={`rounded-xl p-3 ${accents[accent]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SECTION TITLE
// ============================================================

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
        {eyebrow}
      </p>

      <h2 className="mt-1 text-lg font-bold text-zinc-950">{title}</h2>

      {description && (
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      )}
    </div>
  );
}

// ============================================================
// PROGRESS BAR
// ============================================================

function ProgressBar({
  label,
  value,
  total,
  color = "bg-red-600",
}: {
  label: string;
  value: number;
  total: number;
  color?: string;
}) {
  const percentage =
    total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-zinc-600">{label}</span>
        <span className="font-bold text-zinc-900">{formatNumber(value)}</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-8 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}

// ============================================================
// STOCK STATUS BADGE
// ============================================================

function StockStatusBadge({ product }: { product: Product }) {
  const health = getStockHealth(product);
  const config = stockStatusConfig[health.status];

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${config.background} ${config.color} ${config.border}`}
    >
      {config.label}
    </span>
  );
}

// ============================================================
// DAILY MOVEMENTS
// ============================================================

function buildDailyMovements(movements: StockLedgerItem[]): DailyMovement[] {
  const grouped = new Map<string, DailyMovement>();

  for (let index = 6; index >= 0; index--) {
    const date = new Date();
    date.setDate(date.getDate() - index);

    const key = date.toLocaleDateString("en-CA");

    grouped.set(key, {
      date: key,
      receipts: 0,
      sales: 0,
      other: 0,
    });
  }

  for (const movement of movements) {
    const key = new Date(movement.created_at).toLocaleDateString("en-CA");
    const day = grouped.get(key);

    if (!day) continue;

    const quantity = Math.abs(movement.quantity_delta);

    if (movement.quantity_delta > 0) {
      day.receipts += quantity;
    } else if (movement.quantity_delta < 0) {
      day.sales += quantity;
    } else {
      day.other += quantity;
    }
  }

  return Array.from(grouped.values());
}

// ============================================================
// MOVEMENT CHART
// ============================================================

function MovementChart({ movements }: { movements: StockLedgerItem[] }) {
  const daily = useMemo(() => buildDailyMovements(movements), [movements]);

  const maxValue = Math.max(
    1,
    ...daily.map((item) => item.receipts + item.sales + item.other),
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-2 text-zinc-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Stock received
        </span>

        <span className="flex items-center gap-2 text-zinc-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
          Stock deducted
        </span>

        <span className="flex items-center gap-2 text-zinc-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-zinc-400" />
          Other inbound
        </span>
      </div>

      <div className="flex h-52 items-end justify-between gap-2 border-b border-zinc-200 pb-2">
        {daily.map((day) => {
          const total = day.receipts + day.sales + day.other;
          const height = (total / maxValue) * 100;

          const receiptHeight = total ? (day.receipts / total) * height : 0;
          const salesHeight = total ? (day.sales / total) * height : 0;
          const otherHeight = total ? (day.other / total) * height : 0;

          return (
            <div
              key={day.date}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              title={`${formatDate(day.date)}: ${total} units`}
            >
              <div className="flex h-full w-full items-end justify-center">
                <div
                  className="flex w-full max-w-9 flex-col justify-end overflow-hidden rounded-t-md"
                  style={{ height: `${height}%` }}
                >
                  {otherHeight > 0 && (
                    <div
                      className="w-full bg-zinc-400"
                      style={{ height: `${(otherHeight / height) * 100}%` }}
                    />
                  )}

                  {salesHeight > 0 && (
                    <div
                      className="w-full bg-red-500"
                      style={{ height: `${(salesHeight / height) * 100}%` }}
                    />
                  )}

                  {receiptHeight > 0 && (
                    <div
                      className="w-full bg-emerald-500"
                      style={{ height: `${(receiptHeight / height) * 100}%` }}
                    />
                  )}
                </div>
              </div>

              <span className="whitespace-nowrap text-[10px] text-zinc-400">
                {formatDate(day.date)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        Based on available ledger entries from the last seven days. The API
        currently returns up to 100 recent movements.
      </p>
    </div>
  );
}

// ============================================================
// STOCK HEALTH DISTRIBUTION
// ============================================================

function StockHealthDistribution({ summary }: { summary: StockHealthSummary }) {
  const categories = [
    {
      key: "healthy",
      label: "Healthy",
      value: summary.healthy,
      color: "bg-emerald-500",
    },
    {
      key: "low",
      label: "Low stock",
      value: summary.lowStock,
      color: "bg-amber-500",
    },
    {
      key: "critical",
      label: "Critical",
      value: summary.critical,
      color: "bg-red-500",
    },
    {
      key: "out",
      label: "Out of stock",
      value: summary.outOfStock,
      color: "bg-red-800",
    },
    {
      key: "over",
      label: "Overstocked",
      value: summary.overstocked,
      color: "bg-orange-500",
    },
    {
      key: "unknown",
      label: "Not configured",
      value: summary.notConfiguredStatus,
      color: "bg-zinc-400",
    },
  ];

  return (
    <div>
      <div className="mb-6 flex h-4 overflow-hidden rounded-full bg-zinc-100">
        {categories.map((category) => {
          const percentage =
            summary.total > 0 ? (category.value / summary.total) * 100 : 0;

          return (
            <div
              key={category.key}
              className={`${category.color} transition-all`}
              style={{ width: `${percentage}%` }}
              title={`${category.label}: ${category.value}`}
            />
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {categories.map((category) => (
          <div key={category.key} className="flex items-center gap-3">
            <span className={`h-3 w-3 shrink-0 rounded-sm ${category.color}`} />

            <div className="flex flex-1 items-center justify-between gap-2">
              <span className="text-sm text-zinc-600">{category.label}</span>
              <span className="text-sm font-bold text-zinc-950">
                {category.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// CRITICAL STOCK TABLE
// ============================================================

function StockRiskTable({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <EmptyState message="No products currently require immediate stock attention." />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left">
        <thead>
          <tr className="border-b border-zinc-100 text-xs text-zinc-400">
            <th className="pb-3 font-medium">Product</th>
            <th className="pb-3 font-medium">Current stock</th>
            <th className="pb-3 font-medium">Minimum</th>
            <th className="pb-3 font-medium">Reorder point</th>
            <th className="pb-3 font-medium">Status</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-zinc-100">
          {products.map((product) => (
            <tr key={product.id}>
              <td className="py-4">
                <Link
                  href={`/products/${product.id}`}
                  className="text-sm font-semibold hover:text-red-600"
                >
                  {product.name}
                </Link>

                <p className="mt-1 text-xs text-zinc-400">
                  {product.sku ?? "No SKU"}
                </p>
              </td>

              <td className="py-4 text-sm font-bold text-zinc-950">
                {formatNumber(product.current_stock)}
              </td>

              <td className="py-4 text-sm text-zinc-600">
                {product.minimum_stock ?? "—"}
              </td>

              <td className="py-4 text-sm text-zinc-600">
                {product.reorder_point ?? "—"}
              </td>

              <td className="py-4">
                <StockStatusBadge product={product} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// STOCK CAPACITY TABLE
// ============================================================

function StockCapacityTable({ products }: { products: Product[] }) {
  const configuredProducts = products.filter(
    (product) => product.maximum_stock !== null && product.maximum_stock > 0,
  );

  if (configuredProducts.length === 0) {
    return (
      <EmptyState message="Configure maximum stock levels to view stock capacity." />
    );
  }

  return (
    <div className="space-y-5">
      {configuredProducts.map((product) => {
        const maximum = product.maximum_stock ?? 0;

        const percentage =
          maximum > 0 ? Math.round((product.current_stock / maximum) * 100) : 0;

        const health = getStockHealth(product);
        const config = stockStatusConfig[health.status];

        return (
          <div key={product.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <Link
                href={`/products/${product.id}`}
                className="truncate text-sm font-semibold text-zinc-800 hover:text-red-600"
              >
                {product.name}
              </Link>

              <span className="shrink-0 text-xs font-bold text-zinc-600">
                {formatNumber(product.current_stock)} / {formatNumber(maximum)}
              </span>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all ${config.bar}`}
                style={{
                  width: `${Math.min(100, Math.max(0, percentage))}%`,
                }}
              />
            </div>

            <p className="mt-1 text-right text-[10px] text-zinc-400">
              {percentage}% of maximum capacity
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// INVENTORY RISK CONFIGURATION
// ============================================================

const riskConfig: Record<
  InventoryRiskLevel,
  {
    label: string;
    text: string;
    background: string;
    border: string;
    bar: string;
  }
> = {
  critical: {
    label: "Critical",
    text: "text-red-700",
    background: "bg-red-50",
    border: "border-red-200",
    bar: "bg-red-600",
  },
  high: {
    label: "High",
    text: "text-orange-700",
    background: "bg-orange-50",
    border: "border-orange-200",
    bar: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    text: "text-amber-700",
    background: "bg-amber-50",
    border: "border-amber-200",
    bar: "bg-amber-500",
  },
  low: {
    label: "Low",
    text: "text-emerald-700",
    background: "bg-emerald-50",
    border: "border-emerald-200",
    bar: "bg-emerald-500",
  },
};

// ============================================================
// RISK BADGE
// ============================================================

function RiskBadge({ level }: { level: InventoryRiskLevel }) {
  const config = riskConfig[level];

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${config.background} ${config.text} ${config.border}`}
    >
      {config.label}
    </span>
  );
}

// ============================================================
// RISK SCORE BAR
// ============================================================

function RiskScoreBar({
  score,
  level,
}: {
  score: number;
  level: InventoryRiskLevel;
}) {
  const config = riskConfig[level];

  return (
    <div className="min-w-[110px]">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-bold text-zinc-900">{score}/100</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${config.bar}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// RISK METRIC CARD
// ============================================================

function RiskMetricCard({
  label,
  value,
  description,
  level,
}: {
  label: string;
  value: number;
  description: string;
  level: InventoryRiskLevel;
}) {
  const config = riskConfig[level];

  return (
    <div className={`rounded-2xl border bg-white p-5 ${config.border}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-500">{label}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${config.bar}`} />
      </div>

      <p className={`mt-3 text-3xl font-bold ${config.text}`}>
        {formatNumber(value)}
      </p>

      <p className="mt-2 text-xs text-zinc-400">{description}</p>
    </div>
  );
}

// ============================================================
// PRODUCT RISK DETAILS
// ============================================================

function ProductRiskDetails({ item }: { item: InventoryRiskItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-zinc-100">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-xs font-semibold text-red-600 hover:text-red-700"
      >
        <span>{expanded ? "Hide risk analysis" : "View risk analysis"}</span>
        <span>{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="space-y-4 pb-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
              Risk factors
            </p>

            {item.factors.length === 0 ? (
              <p className="text-sm text-zinc-500">No risk factors reported.</p>
            ) : (
              <div className="space-y-2">
                {item.factors.map((factor, index) => (
                  <div
                    key={`${factor.type}-${index}`}
                    className="rounded-xl bg-zinc-50 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold capitalize text-zinc-800">
                        {factor.type.replaceAll("_", " ")}
                      </p>

                      <span className="text-xs font-bold text-zinc-500">
                        +{factor.points} points
                      </span>
                    </div>

                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {factor.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 p-3">
              <p className="text-xs text-zinc-400">30-day verified sales</p>

              <p className="mt-1 text-lg font-bold text-zinc-900">
                {formatNumber(item.sales_velocity.units_sold)} units
              </p>
            </div>

            <div className="rounded-xl border border-zinc-100 p-3">
              <p className="text-xs text-zinc-400">Average daily sales</p>

              <p className="mt-1 text-lg font-bold text-zinc-900">
                {item.sales_velocity.average_daily_sales.toFixed(2)}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
              Recommended actions
            </p>

            {item.recommendations.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No additional recommendations.
              </p>
            ) : (
              <ul className="space-y-2">
                {item.recommendations.map((recommendation, index) => (
                  <li
                    key={index}
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
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// INVENTORY RISK DASHBOARD
// ============================================================

function InventoryRiskDashboard({
  risk,
}: {
  risk: InventoryRiskResponse | null;
}) {
  const [selectedLevel, setSelectedLevel] = useState<
    InventoryRiskLevel | "all"
  >("all");

  if (!risk) {
    return (
      <section className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="font-bold text-amber-900">
          Inventory Risk Intelligence unavailable
        </h2>

        <p className="mt-2 text-sm text-amber-800">
          The rest of the analytics dashboard is available, but the inventory
          risk service could not be reached. Refresh to try again.
        </p>
      </section>
    );
  }

  const filteredItems =
    selectedLevel === "all"
      ? risk.items
      : risk.items.filter((item) => item.risk_level === selectedLevel);

  const confidenceCount = risk.items.filter(
    (item) => item.data_confidence === "high",
  ).length;

  const confidencePercentage =
    risk.total > 0 ? (confidenceCount / risk.total) * 100 : 0;

  return (
    <section className="mb-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
            Inventory monitoring
          </p>

          <h2 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950">
            Inventory Risk Intelligence
          </h2>

          <p className="mt-1 text-sm text-zinc-500">
            Rule-based risk scoring using stock thresholds, unresolved
            discrepancies, and approved sales movements.
          </p>
        </div>

        <span className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600">
          {risk.total} products analyzed
        </span>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <RiskMetricCard
          label="Critical risk"
          value={risk.summary.critical}
          description="Immediate attention required"
          level="critical"
        />

        <RiskMetricCard
          label="High risk"
          value={risk.summary.high}
          description="Priority investigation"
          level="high"
        />

        <RiskMetricCard
          label="Medium risk"
          value={risk.summary.medium}
          description="Requires monitoring"
          level="medium"
        />

        <RiskMetricCard
          label="Low risk"
          value={risk.summary.low}
          description="No significant rule-based risk detected"
          level="low"
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <SectionTitle
            eyebrow="Risk distribution"
            title="Portfolio risk profile"
            description="Distribution of products across calculated risk categories."
          />

          <div className="mb-5 flex h-4 overflow-hidden rounded-full bg-zinc-100">
            {(
              ["critical", "high", "medium", "low"] as InventoryRiskLevel[]
            ).map((level) => {
              const value = risk.summary[level];
              const percentage =
                risk.total > 0 ? (value / risk.total) * 100 : 0;

              return (
                <div
                  key={level}
                  className={riskConfig[level].bar}
                  style={{ width: `${percentage}%` }}
                  title={`${riskConfig[level].label}: ${value}`}
                />
              );
            })}
          </div>

          <div className="space-y-4">
            {(
              ["critical", "high", "medium", "low"] as InventoryRiskLevel[]
            ).map((level) => (
              <div
                key={level}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-3 w-3 rounded-sm ${riskConfig[level].bar}`}
                  />

                  <span className="text-sm text-zinc-600">
                    {riskConfig[level].label}
                  </span>
                </div>

                <span className="text-sm font-bold text-zinc-950">
                  {risk.summary[level]}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <SectionTitle
            eyebrow="Data reliability"
            title="Inventory confidence"
            description="Availability of opening-balance records for historical reconciliation."
          />

          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-bold tracking-tight text-zinc-950">
                {Math.round(confidencePercentage)}%
              </p>

              <p className="mt-2 text-sm text-zinc-500">
                Products with recorded opening balances
              </p>
            </div>

            <ShieldCheck size={38} className="text-red-600" />
          </div>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-red-600 transition-all"
              style={{ width: `${confidencePercentage}%` }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-xs">
            <span className="text-emerald-700">
              {confidenceCount} with opening balance
            </span>

            <span className="text-amber-700">
              {risk.total - confidenceCount} without opening balance
            </span>
          </div>

          <p className="mt-5 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-500">
            This is an opening-balance availability indicator, not a guarantee
            that all inventory records are accurate or independently verified.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            eyebrow="Product-level assessment"
            title="Ranked inventory risks"
            description="Products are ranked by risk score, highest first."
          />

          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
            {risk.items.length} assessed
          </span>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {(["all", "critical", "high", "medium", "low"] as const).map(
            (level) => {
              const active = selectedLevel === level;

              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSelectedLevel(level)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold capitalize transition ${
                    active
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-red-300 hover:text-red-600"
                  }`}
                >
                  {level === "all" ? "All products" : level}
                </button>
              );
            },
          )}
        </div>

        {filteredItems.length === 0 ? (
          <EmptyState message="No products match this risk category." />
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.product_id}
                className="rounded-xl border border-zinc-100 p-4 transition hover:border-zinc-300"
              >
                <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr_0.8fr_0.8fr] lg:items-center">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${item.product_id}`}
                      className="truncate text-sm font-bold text-zinc-900 hover:text-red-600"
                    >
                      {item.product_name}
                    </Link>

                    <p className="mt-1 text-xs text-zinc-400">
                      {item.sku ?? "No SKU"} · Product #{item.product_id}
                    </p>

                    <p className="mt-2 text-xs text-zinc-500">
                      Current stock:{" "}
                      <span className="font-bold text-zinc-900">
                        {formatNumber(item.current_stock)}
                      </span>
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-zinc-400">Risk score</p>

                    <RiskScoreBar
                      score={item.risk_score}
                      level={item.risk_level}
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-zinc-400">
                      Risk classification
                    </p>

                    <RiskBadge level={item.risk_level} />
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-zinc-400">
                      Data confidence
                    </p>

                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.data_confidence === "high"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {item.data_confidence === "high" ? "Higher" : "Limited"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Days of stock cover
                    </p>

                    <p className="mt-1 text-sm font-bold text-zinc-900">
                      {item.sales_velocity.days_of_cover !== null
                        ? `${item.sales_velocity.days_of_cover} days`
                        : "Unavailable"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                      30-day approved sales
                    </p>

                    <p className="mt-1 text-sm font-bold text-zinc-900">
                      {formatNumber(item.sales_velocity.units_sold)} units
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Risk factors
                    </p>

                    <p className="mt-1 text-sm font-bold text-zinc-900">
                      {
                        item.factors.filter((factor) => factor.points > 0)
                          .length
                      }
                    </p>
                  </div>
                </div>

                <ProductRiskDetails item={item} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-zinc-100 pt-4">
          <p className="text-xs leading-5 text-zinc-400">
            Risk scores are rule-based decision-support indicators, not
            statistically trained predictions. Sales velocity uses approved
            sales movements only. Missing data can limit assessment confidence.
            AI does not independently change stock.
          </p>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// MAIN ANALYTICS PAGE
// ============================================================

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ============================================================
  // LOAD ANALYTICS
  // ============================================================

  const loadAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      // Risk is intentionally loaded separately.
      // A risk endpoint failure should not break the complete dashboard.
      const [
        reconciliation,
        openAlerts,
        resolvedAlerts,
        ledger,
        pendingMovements,
        products,
        investigationHistory,
        orderHistory,
      ] = await Promise.all([
        getStockReconciliation(),
        getDiscrepancyAlerts("open", 100),
        getDiscrepancyAlerts("resolved", 100),
        getStockLedger({ limit: 100, offset: 0 }),
        getPendingMovements(),
        getInventoryProducts(),
        getInvestigations(),
        getOrders(),
      ]);

      let risk: InventoryRiskResponse | null = null;

      try {
        risk = await getInventoryRisk({ limit: 100, offset: 0 });
      } catch (riskError) {
        console.error("Inventory risk API failed:", riskError);
      }

      setData({
        reconciliation,
        openAlerts: openAlerts.items,
        resolvedAlerts: resolvedAlerts.items,
        ledger: ledger.items,
        pendingMovements: pendingMovements.total,
        products: products as Product[],
        investigations: investigationHistory.items,
        orders: orderHistory.items,
        risk,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load analytics data.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  // ============================================================
  // METRICS
  // ============================================================

  const metrics = useMemo(() => {
    if (!data) return null;

    const totalStock = data.products.reduce(
      (total, product) => total + (product.current_stock ?? 0),
      0,
    );

    const receivedUnits = data.ledger
      .filter((item) => item.quantity_delta > 0)
      .reduce((total, item) => total + item.quantity_delta, 0);

    const soldUnits = data.ledger
      .filter((item) => item.quantity_delta < 0)
      .reduce((total, item) => total + Math.abs(item.quantity_delta), 0);

    const shortageCount = data.investigations.filter(
      (item) => item.status === "shortage",
    ).length;

    const approvedOrders = data.orders.filter(
      (item) => item.status === "simulated_ordered",
    ).length;

    const pendingOrders = data.orders.filter(
      (item) => item.status === "pending_approval",
    ).length;

    return {
      totalStock,
      receivedUnits,
      soldUnits,
      shortageCount,
      approvedOrders,
      pendingOrders,
    };
  }, [data]);

  // ============================================================
  // STOCK HEALTH
  // ============================================================

  const stockHealth = useMemo(() => {
    if (!data) return null;
    return getStockHealthSummary(data.products);
  }, [data]);

  // ============================================================
  // TOP PRODUCTS
  // ============================================================

  const topProducts = useMemo(() => {
    if (!data) return [];

    const totals = new Map<
      number,
      {
        product_id: number;
        name: string;
        movements: number;
        netChange: number;
      }
    >();

    for (const movement of data.ledger) {
      const id = movement.product.id;

      const existing = totals.get(id) ?? {
        product_id: id,
        name: movement.product.name,
        movements: 0,
        netChange: 0,
      };

      existing.movements += Math.abs(movement.quantity_delta);
      existing.netChange += movement.quantity_delta;

      totals.set(id, existing);
    }

    return Array.from(totals.values())
      .sort((a, b) => b.movements - a.movements)
      .slice(0, 5);
  }, [data]);

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f8]">
        <div className="text-center">
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />

          <p className="mt-4 text-sm text-zinc-500">
            Preparing inventory analytics...
          </p>
        </div>
      </main>
    );
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-4 py-8 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        {/* HEADER */}

        <header className="mb-8">
          <Link
            href="/"
            className="mb-4 inline-flex text-sm font-medium text-zinc-500 hover:text-red-600"
          >
            ← Back to dashboard
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
                Business intelligence
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Inventory Analytics
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                Monitor inventory health, stock movements, reconciliation
                integrity, and operational risks.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadAnalytics(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh analytics
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <p className="font-semibold">Analytics could not be loaded.</p>

            <p className="mt-1">{error}</p>

            <button
              type="button"
              onClick={() => void loadAnalytics(true)}
              className="mt-3 font-bold underline"
            >
              Try again
            </button>
          </div>
        )}

        {!data || !metrics || !stockHealth ? (
          <EmptyState message="No analytics data is currently available." />
        ) : (
          <>
            {/* ================================================== */}
            {/* STOCK HEALTH DASHBOARD */}
            {/* ================================================== */}

            <section className="mb-8">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                    Inventory intelligence
                  </p>

                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950">
                    Stock Health Dashboard
                  </h2>

                  <p className="mt-1 text-sm text-zinc-500">
                    Inventory condition based on configured product thresholds.
                  </p>
                </div>

                <Link
                  href="/products"
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  <Settings2 size={16} />
                  Configure thresholds
                </Link>
              </div>

              {/* HEALTH METRICS */}

              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Healthy products"
                  value={stockHealth.healthy}
                  description="Within configured stock levels"
                  icon={CheckCircle2}
                  accent="green"
                />

                <MetricCard
                  label="Critical products"
                  value={stockHealth.critical + stockHealth.outOfStock}
                  description="At or below minimum stock, including zero"
                  icon={AlertTriangle}
                  accent="red"
                />

                <MetricCard
                  label="Low stock"
                  value={stockHealth.lowStock}
                  description="At or below reorder point"
                  icon={TrendingUp}
                  accent="amber"
                />

                <MetricCard
                  label="Overstocked"
                  value={stockHealth.overstocked}
                  description="Above configured maximum stock"
                  icon={Boxes}
                />
              </div>

              {/* DISTRIBUTION + CONFIGURATION */}

              <div className="mb-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                  <SectionTitle
                    eyebrow="Stock distribution"
                    title="Inventory health breakdown"
                    description="Classification of all products returned by the catalogue API."
                  />

                  <StockHealthDistribution summary={stockHealth} />

                  <div className="mt-6 border-t border-zinc-100 pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-zinc-800">
                          Configured thresholds
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          Products with at least one stock threshold
                        </p>
                      </div>

                      <p className="text-lg font-bold text-zinc-950">
                        {stockHealth.configured}/{stockHealth.total}
                      </p>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${
                            stockHealth.total > 0
                              ? (stockHealth.configured / stockHealth.total) *
                                100
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    <p className="mt-2 text-xs text-zinc-400">
                      {stockHealth.unconfigured} products still need threshold
                      configuration.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                  <SectionTitle
                    eyebrow="Capacity monitoring"
                    title="Stock versus maximum capacity"
                    description="Current stock compared with each configured maximum."
                  />

                  <StockCapacityTable products={data.products} />
                </div>
              </div>

              {/* CRITICAL STOCK */}

              <div className="mb-6 rounded-2xl border border-red-100 bg-white p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <SectionTitle
                    eyebrow="Immediate attention"
                    title="Critical stock products"
                    description="Products at or below their minimum stock level, including products with zero stock."
                  />

                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                    {stockHealth.criticalProducts.length} product(s)
                  </span>
                </div>

                <StockRiskTable products={stockHealth.criticalProducts} />

                <Link
                  href="/products"
                  className="mt-5 inline-flex text-sm font-bold text-red-600 hover:text-red-700"
                >
                  Review product inventory →
                </Link>
              </div>

              {/* REORDER RECOMMENDATIONS */}

              <div className="mb-6 rounded-2xl border border-amber-100 bg-white p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <SectionTitle
                    eyebrow="Replenishment planning"
                    title="Reorder recommendations"
                    description="Products at or below configured reorder points. These are recommendations, not automatic purchase orders."
                  />

                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                    {stockHealth.reorderRequired.length} product(s)
                  </span>
                </div>

                {stockHealth.reorderRequired.length === 0 ? (
                  <EmptyState message="No products currently meet their configured reorder conditions." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[650px] text-left">
                      <thead>
                        <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                          <th className="pb-3 font-medium">Product</th>
                          <th className="pb-3 font-medium">Available</th>
                          <th className="pb-3 font-medium">Reorder point</th>
                          <th className="pb-3 font-medium">Minimum</th>
                          <th className="pb-3 font-medium">Priority</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-zinc-100">
                        {stockHealth.reorderRequired.map((product) => (
                          <tr key={product.id}>
                            <td className="py-4">
                              <Link
                                href={`/products/${product.id}`}
                                className="text-sm font-semibold hover:text-red-600"
                              >
                                {product.name}
                              </Link>

                              <p className="mt-1 text-xs text-zinc-400">
                                {product.sku ?? "No SKU"}
                              </p>
                            </td>

                            <td className="py-4 text-sm font-bold">
                              {formatNumber(product.current_stock)}
                            </td>

                            <td className="py-4 text-sm text-zinc-600">
                              {product.reorder_point ?? "—"}
                            </td>

                            <td className="py-4 text-sm text-zinc-600">
                              {product.minimum_stock ?? "—"}
                            </td>

                            <td className="py-4">
                              <StockStatusBadge product={product} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <Link
                  href="/orders"
                  className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-red-600 hover:text-red-700"
                >
                  <ShoppingCart size={16} />
                  Review supplier order workflow →
                </Link>
              </div>

              {/* UNCONFIGURED PRODUCTS */}

              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <SectionTitle
                    eyebrow="Configuration coverage"
                    title="Products without stock thresholds"
                    description="These products cannot receive full stock-health classification until thresholds are configured."
                  />

                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">
                    {stockHealth.unconfiguredProducts.length} unconfigured
                  </span>
                </div>

                {stockHealth.unconfiguredProducts.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
                    <CheckCircle2 className="text-emerald-700" size={20} />

                    <p className="text-sm font-medium text-emerald-800">
                      All products have at least one configured stock threshold.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[550px] text-left">
                      <thead>
                        <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                          <th className="pb-3 font-medium">Product</th>
                          <th className="pb-3 font-medium">Current stock</th>
                          <th className="pb-3 font-medium">Configuration</th>
                          <th className="pb-3 font-medium">Action</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-zinc-100">
                        {stockHealth.unconfiguredProducts.map((product) => (
                          <tr key={product.id}>
                            <td className="py-4">
                              <p className="text-sm font-semibold">
                                {product.name}
                              </p>

                              <p className="mt-1 text-xs text-zinc-400">
                                {product.sku ?? "No SKU"}
                              </p>
                            </td>

                            <td className="py-4 text-sm font-bold">
                              {formatNumber(product.current_stock)}
                            </td>

                            <td className="py-4">
                              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                                Not configured
                              </span>
                            </td>

                            <td className="py-4">
                              <Link
                                href={`/products/${product.id}`}
                                className="text-xs font-bold text-red-600 hover:text-red-700"
                              >
                                Configure →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* ================================================== */}
            {/* INVENTORY RISK INTELLIGENCE */}
            {/* ================================================== */}

            <InventoryRiskDashboard risk={data.risk} />

            {/* ================================================== */}
            {/* INVENTORY OVERVIEW */}
            {/* ================================================== */}

            <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Products"
                value={data.products.length}
                description="Products returned by catalogue API"
                icon={Package}
              />

              <MetricCard
                label="Current stock"
                value={metrics.totalStock}
                description="Units across returned products"
                icon={Boxes}
                accent="red"
              />

              <MetricCard
                label="Stock discrepancies"
                value={data.openAlerts.length}
                description="Currently open discrepancy alerts"
                icon={AlertTriangle}
                accent={data.openAlerts.length ? "amber" : "green"}
              />

              <MetricCard
                label="Pending movements"
                value={data.pendingMovements}
                description="Awaiting human approval"
                icon={ClipboardCheck}
                accent="amber"
              />
            </section>

            {/* ================================================== */}
            {/* RECONCILIATION HEALTH */}
            {/* ================================================== */}

            <section className="mb-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <SectionTitle
                  eyebrow="Inventory integrity"
                  title="Reconciliation health"
                  description="Opening balance plus approved movements compared with current product stock."
                />

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-emerald-50 p-4">
                    <p className="text-xs font-medium text-emerald-700">
                      Reconciled
                    </p>

                    <p className="mt-2 text-3xl font-bold text-emerald-800">
                      {data.reconciliation.reconciled}
                    </p>
                  </div>

                  <div className="rounded-xl bg-red-50 p-4">
                    <p className="text-xs font-medium text-red-700">
                      Discrepancies
                    </p>

                    <p className="mt-2 text-3xl font-bold text-red-800">
                      {data.reconciliation.discrepancies}
                    </p>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-4">
                    <p className="text-xs font-medium text-amber-700">
                      Missing baseline
                    </p>

                    <p className="mt-2 text-3xl font-bold text-amber-800">
                      {data.reconciliation.missing_opening_balances}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  <ProgressBar
                    label="Reconciled products"
                    value={data.reconciliation.reconciled}
                    total={data.reconciliation.total_products}
                    color="bg-emerald-500"
                  />

                  <ProgressBar
                    label="Products with discrepancies"
                    value={data.reconciliation.discrepancies}
                    total={data.reconciliation.total_products}
                    color="bg-red-500"
                  />

                  <ProgressBar
                    label="Missing opening balances"
                    value={data.reconciliation.missing_opening_balances}
                    total={data.reconciliation.total_products}
                    color="bg-amber-500"
                  />
                </div>

                <Link
                  href="/inventory/reconciliation"
                  className="mt-6 inline-flex text-sm font-bold text-red-600 hover:text-red-700"
                >
                  Open reconciliation workspace →
                </Link>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <SectionTitle
                  eyebrow="Stock activity"
                  title="Movement summary"
                  description="Quantity totals from the latest available ledger entries."
                />

                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-white p-2 text-emerald-700">
                        <ArrowDownRight size={20} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-emerald-900">
                          Stock received
                        </p>

                        <p className="text-xs text-emerald-700">
                          Positive ledger movements
                        </p>
                      </div>
                    </div>

                    <p className="text-2xl font-bold text-emerald-800">
                      {formatNumber(metrics.receivedUnits)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-red-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-white p-2 text-red-700">
                        <ArrowUpRight size={20} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-red-900">
                          Stock deducted
                        </p>

                        <p className="text-xs text-red-700">
                          Negative ledger movements
                        </p>
                      </div>
                    </div>

                    <p className="text-2xl font-bold text-red-800">
                      {formatNumber(metrics.soldUnits)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-zinc-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-white p-2 text-zinc-700">
                        <Activity size={20} />
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          Ledger entries
                        </p>

                        <p className="text-xs text-zinc-500">
                          Returned in latest ledger page
                        </p>
                      </div>
                    </div>

                    <p className="text-2xl font-bold">
                      {formatNumber(data.ledger.length)}
                    </p>
                  </div>
                </div>

                <Link
                  href="/inventory/timeline"
                  className="mt-6 inline-flex text-sm font-bold text-red-600 hover:text-red-700"
                >
                  View inventory timeline →
                </Link>
              </div>
            </section>

            {/* ================================================== */}
            {/* MOVEMENT CHART */}
            {/* ================================================== */}

            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
              <SectionTitle
                eyebrow="Movement trends"
                title="Daily stock activity"
                description="A seven-day view of available ledger entries."
              />

              {data.ledger.length === 0 ? (
                <EmptyState message="No stock movements are available yet." />
              ) : (
                <MovementChart movements={data.ledger} />
              )}
            </section>

            {/* ================================================== */}
            {/* PRODUCT ACTIVITY + INVESTIGATIONS */}
            {/* ================================================== */}

            <section className="mb-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <SectionTitle
                  eyebrow="Product performance"
                  title="Most active products"
                  description="Ranked by total absolute quantity movement in returned ledger records."
                />

                {topProducts.length === 0 ? (
                  <EmptyState message="No product movement data is available." />
                ) : (
                  <div className="space-y-4">
                    {topProducts.map((product, index) => (
                      <div
                        key={product.product_id}
                        className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-4 last:border-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-600">
                            {index + 1}
                          </span>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {product.name}
                            </p>

                            <p className="mt-1 text-xs text-zinc-400">
                              Net change: {product.netChange > 0 ? "+" : ""}
                              {product.netChange} units
                            </p>
                          </div>
                        </div>

                        <p className="shrink-0 text-sm font-bold">
                          {formatNumber(product.movements)} units
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  href="/products"
                  className="mt-5 inline-flex text-sm font-bold text-red-600"
                >
                  Manage products →
                </Link>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <SectionTitle
                  eyebrow="Investigation activity"
                  title="Investigation overview"
                  description="Saved inventory investigations and their outcomes."
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <p className="text-xs text-zinc-500">
                      Total investigations
                    </p>

                    <p className="mt-2 text-2xl font-bold">
                      {data.investigations.length}
                    </p>
                  </div>

                  <div className="rounded-xl bg-red-50 p-4">
                    <p className="text-xs text-red-600">Shortages</p>

                    <p className="mt-2 text-2xl font-bold text-red-700">
                      {metrics.shortageCount}
                    </p>
                  </div>

                  <div className="rounded-xl bg-emerald-50 p-4">
                    <p className="text-xs text-emerald-700">
                      Simulated orders approved
                    </p>

                    <p className="mt-2 text-2xl font-bold text-emerald-800">
                      {metrics.approvedOrders}
                    </p>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-4">
                    <p className="text-xs text-amber-700">
                      Pending order approvals
                    </p>

                    <p className="mt-2 text-2xl font-bold text-amber-800">
                      {metrics.pendingOrders}
                    </p>
                  </div>
                </div>

                <Link
                  href="/investigations"
                  className="mt-5 inline-flex text-sm font-bold text-red-600"
                >
                  Open AI investigations →
                </Link>
              </div>
            </section>

            {/* ================================================== */}
            {/* DISCREPANCY ALERTS */}
            {/* ================================================== */}

            <section className="mb-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <SectionTitle
                  eyebrow="Risk monitoring"
                  title="Open discrepancy alerts"
                  description="Products requiring further human review."
                />

                {data.openAlerts.length === 0 ? (
                  <EmptyState message="No open discrepancy alerts." />
                ) : (
                  <div className="space-y-3">
                    {data.openAlerts.slice(0, 5).map((alert) => (
                      <div
                        key={alert.id}
                        className="rounded-xl border border-amber-100 bg-amber-50/50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-zinc-900">
                              {alert.product_name}
                            </p>

                            <p className="mt-1 text-xs text-zinc-500">
                              Alert #{alert.id} · {alert.occurrences}{" "}
                              occurrence(s)
                            </p>
                          </div>

                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                            Open
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-600">
                          <span>Calculated: {alert.calculated_stock}</span>
                          <span>Current: {alert.current_stock}</span>

                          <span className="font-bold text-red-600">
                            Difference: {alert.difference > 0 ? "+" : ""}
                            {alert.difference}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  href="/inventory/alerts"
                  className="mt-5 inline-flex text-sm font-bold text-red-600"
                >
                  Review all alerts →
                </Link>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6">
                <SectionTitle
                  eyebrow="Review history"
                  title="Recently resolved alerts"
                  description="Alerts with a recorded resolution."
                />

                {data.resolvedAlerts.length === 0 ? (
                  <EmptyState message="No resolved alerts are available." />
                ) : (
                  <div className="space-y-3">
                    {data.resolvedAlerts.slice(0, 5).map((alert) => (
                      <div
                        key={alert.id}
                        className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-zinc-900">
                              {alert.product_name}
                            </p>

                            <p className="mt-1 text-xs text-zinc-500">
                              Alert #{alert.id}
                            </p>
                          </div>

                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                            Resolved
                          </span>
                        </div>

                        <p className="mt-3 text-xs text-zinc-600">
                          {alert.resolved_by
                            ? `Reviewed by ${alert.resolved_by}`
                            : "Reviewer unavailable"}
                        </p>

                        {alert.resolved_at && (
                          <p className="mt-1 text-xs text-zinc-400">
                            {formatDateTime(alert.resolved_at)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  href="/inventory/alerts"
                  className="mt-5 inline-flex text-sm font-bold text-red-600"
                >
                  View alert history →
                </Link>
              </div>
            </section>

            {/* ================================================== */}
            {/* RECENT MOVEMENTS */}
            {/* ================================================== */}

            <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6">
              <SectionTitle
                eyebrow="Audit trail"
                title="Recent stock movements"
                description="Latest available approved movements from the stock ledger."
              />

              {data.ledger.length === 0 ? (
                <EmptyState message="No approved stock movements found." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left">
                    <thead>
                      <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                        <th className="pb-3 font-medium">Product</th>
                        <th className="pb-3 font-medium">Movement</th>
                        <th className="pb-3 font-medium">Quantity</th>
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium">Evidence</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-zinc-100">
                      {data.ledger.slice(0, 8).map((movement) => (
                        <tr key={movement.movement_id}>
                          <td className="py-4">
                            <Link
                              href={`/products/${movement.product.id}/history`}
                              className="text-sm font-semibold hover:text-red-600"
                            >
                              {movement.product.name}
                            </Link>

                            <p className="mt-1 text-xs text-zinc-400">
                              {movement.product.sku ?? "No SKU"}
                            </p>
                          </td>

                          <td className="py-4">
                            <span className="text-sm capitalize text-zinc-600">
                              {movement.movement_type.replaceAll("_", " ")}
                            </span>
                          </td>

                          <td className="py-4">
                            <span
                              className={`text-sm font-bold ${
                                movement.quantity_delta > 0
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {movement.quantity_delta > 0 ? "+" : ""}
                              {movement.quantity_delta}
                            </span>
                          </td>

                          <td className="py-4 text-xs text-zinc-500">
                            {formatDateTime(movement.created_at)}
                          </td>

                          <td className="py-4 text-xs text-zinc-500">
                            {movement.evidence_id
                              ? `#${movement.evidence_id}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Link
                href="/inventory/timeline"
                className="mt-5 inline-flex text-sm font-bold text-red-600"
              >
                Open complete inventory timeline →
              </Link>
            </section>

            {/* ================================================== */}
            {/* SYSTEM SAFETY */}
            {/* ================================================== */}

            <section className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 shrink-0 text-red-700"
                  size={21}
                />

                <div>
                  <h3 className="text-sm font-bold text-red-950">
                    Inventory integrity and reporting limitations
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-red-900/80">
                    Stock health classifications use configured product
                    thresholds. Products without thresholds are marked as not
                    configured, except products with zero stock, which are
                    marked out of stock. Reconciliation requires a verified
                    opening balance. Movement totals and activity charts use the
                    latest 100 ledger entries. AI findings do not change stock,
                    and discrepancy resolution does not itself adjust inventory.
                    Reorder recommendations are informational and do not
                    automatically create supplier orders.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
