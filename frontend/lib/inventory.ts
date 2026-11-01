import type { Product } from "@/types/product";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function inventoryRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to connect to the inventory backend.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      body?.detail ?? `Request failed with status ${response.status}.`,
    );
  }

  return response.json() as Promise<T>;
}

// ============================================================
// STOCK RECONCILIATION
// ============================================================

export type ReconciliationStatus =
  | "reconciled"
  | "discrepancy"
  | "missing_opening_balance";

export type StockReconciliationItem = {
  product_id: number;
  product_name: string;
  sku: string | null;
  status: ReconciliationStatus;
  opening_balance: number | null;
  effective_at?: string;
  movement_count: number | null;
  movement_total: number | null;
  calculated_stock: number | null;
  current_stock: number;
  difference: number | null;
};

export type StockReconciliation = {
  total_products: number;
  reconciled: number;
  discrepancies: number;
  missing_opening_balances: number;
  items: StockReconciliationItem[];
};

export function getStockReconciliation() {
  return inventoryRequest<StockReconciliation>("/api/reconciliation/stock");
}

export function getProductStockReconciliation(productId: number) {
  return inventoryRequest<StockReconciliationItem>(
    `/api/reconciliation/stock/products/${productId}`,
  );
}

// ============================================================
// AUTOMATED DISCREPANCY DETECTION
// ============================================================

export type DiscrepancyDetectionResult = {
  total_products?: number;
  detected?: number;
  created?: number;
  updated?: number;
  resolved?: number;
  items?: unknown[];
  [key: string]: unknown;
};

export function detectStockDiscrepancies() {
  return inventoryRequest<DiscrepancyDetectionResult>(
    "/api/reconciliation/stock/detect",
    {
      method: "POST",
    },
  );
}

// ============================================================
// DISCREPANCY ALERTS
// ============================================================

export type StockDiscrepancyAlert = {
  id: number;
  product_id: number;
  product_name: string;
  opening_balance: number;
  calculated_stock: number;
  current_stock: number;
  difference: number;
  status: "open" | "resolved";
  occurrences: number;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
};

export type DiscrepancyAlertList = {
  total: number;
  limit: number;
  offset: number;
  items: StockDiscrepancyAlert[];
};

export type ResolveDiscrepancyPayload = {
  resolved_by: string;
  resolution_notes: string;
};

export function getDiscrepancyAlerts(
  status?: "open" | "resolved",
  limit = 10,
  offset = 0,
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (status) {
    params.set("status", status);
  }

  return inventoryRequest<DiscrepancyAlertList>(
    `/api/reconciliation/stock/alerts?${params.toString()}`,
  );
}

export function resolveDiscrepancyAlert(
  alertId: number,
  payload: ResolveDiscrepancyPayload,
) {
  return inventoryRequest<{
    message: string;
    alert_id: number;
    product_id: number;
    status: string;
    resolved_by: string;
    resolved_at: string;
  }>(`/api/reconciliation/stock/alerts/${alertId}/resolve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ============================================================
// DISCREPANCY AUDIT HISTORY
// ============================================================

export type DiscrepancyAuditAction =
  | "detected"
  | "recurrence"
  | "auto_resolved"
  | "resolved";

export interface DiscrepancyAuditItem {
  id: number;
  alert_id?: number;
  product_id: number;
  action: DiscrepancyAuditAction | string;
  actor: string;
  previous_status: string | null;
  new_status: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface DiscrepancyAuditResponse {
  alert_id: number;
  product_id: number;
  product_name: string;
  total: number;
  limit: number;
  offset: number;
  items: DiscrepancyAuditItem[];
}

export function getDiscrepancyAlertAudit(
  alertId: number,
  limit = 100,
  offset = 0,
) {
  return inventoryRequest<DiscrepancyAuditResponse>(
    `/api/reconciliation/stock/alerts/${alertId}/audit?limit=${limit}&offset=${offset}`,
  );
}

// ============================================================
// INVENTORY LEDGER
// ============================================================

export type StockLedgerItem = {
  movement_id: number;
  product: {
    id: number;
    name: string;
    sku: string | null;
  };
  quantity_delta: number;
  movement_type: string;
  reason: string;
  notes: string | null;
  proposal_id: number | null;
  evidence_id: number | null;
  investigation_id: number | null;
  created_at: string;
  current_stock: number;
};

export type StockLedgerResponse = {
  total_returned: number;
  limit: number;
  offset: number;
  items: StockLedgerItem[];
};

export function getStockLedger(params?: {
  product_id?: number;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();

  if (params?.product_id !== undefined) {
    query.set("product_id", String(params.product_id));
  }

  query.set("limit", String(params?.limit ?? 10));
  query.set("offset", String(params?.offset ?? 0));

  return inventoryRequest<StockLedgerResponse>(
    `/api/inventory-movements/ledger?${query.toString()}`,
  );
}

// ============================================================
// PENDING MOVEMENTS
// ============================================================

export type PendingMovementList = {
  total: number;
  items: Array<{
    id: number;
    product_id: number;
    product_name: string | null;
    movement_type: string;
    quantity: number;
    quantity_delta: number;
    status: string;
    created_at: string;
  }>;
};

export function getPendingMovements() {
  return inventoryRequest<PendingMovementList>(
    "/api/inventory-movements/?status=pending_approval",
  );
}

// ============================================================
// PRODUCTS
// ============================================================

export function getInventoryProducts() {
  return inventoryRequest<Product[]>("/api/products/?limit=100");
}

// ============================================================
// INVENTORY RISK SCORING
// ============================================================

export type InventoryRiskLevel = "critical" | "high" | "medium" | "low";

export type InventoryRiskFactor = {
  type: string;
  severity: string;
  points: number;
  description: string;

  alert_id?: number;
  difference?: number;
  occurrences?: number;

  units_sold_30_days?: number;
  average_daily_sales?: number;
  days_of_cover?: number;
};

export type InventoryRiskItem = {
  product_id: number;
  product_name: string;
  sku: string | null;
  current_stock: number;

  thresholds: {
    minimum_stock: number | null;
    reorder_point: number | null;
    maximum_stock: number | null;
  };

  risk_score: number;
  risk_level: InventoryRiskLevel;
  data_confidence: "high" | "low";

  sales_velocity: {
    period_days: number;
    units_sold: number;
    average_daily_sales: number;
    days_of_cover: number | null;
  };

  factors: InventoryRiskFactor[];
  recommendations: string[];
};

export type InventoryRiskResponse = {
  total: number;
  limit: number;
  offset: number;

  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  items: InventoryRiskItem[];
};

export function getInventoryRisk(params?: {
  risk_level?: InventoryRiskLevel;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();

  if (params?.risk_level) {
    query.set("risk_level", params.risk_level);
  }

  query.set("limit", String(params?.limit ?? 100));
  query.set("offset", String(params?.offset ?? 0));

  return inventoryRequest<InventoryRiskResponse>(
    `/api/inventory-risk/?${query.toString()}`,
  );
}

export function getProductInventoryRisk(productId: number) {
  return inventoryRequest<InventoryRiskItem>(
    `/api/inventory-risk/products/${productId}`,
  );
}

// ============================================================
// INVENTORY REORDER INTELLIGENCE
// ============================================================

export type ReorderUrgency =
  | "critical"
  | "high"
  | "medium"
  | "normal"
  | "undetermined";

export type ReorderExistingOrder = {
  order_id: number;
  quantity: number;
  status: string;
  created_at: string;
  confirmed_incoming_stock: boolean;
};

export type ReorderInvestigation = {
  investigation_id: number;
  discrepancy?: number;
  status?: string;
};

// ============================================================
// REORDER QUANTITY CALCULATION
// ============================================================

export type ReorderQuantityCalculation = {
  formula: string;
  target_stock: number;
  current_stock: number;

  // Mathematical replenishment gap.
  calculated_quantity: number;

  // Original mathematical result.
  result: number;

  average_daily_sales_exact?: number;
  target_cover_days?: number;

  reorder_required?: boolean;
};

// ============================================================
// FINAL QUANTITY DECISION
// ============================================================

export type FinalQuantityReason =
  | "replenishment_required"
  | "stock_above_reorder_point"
  | "reorder_point_unavailable";

export type FinalQuantityCalculation = {
  calculated_quantity: number | null;
  recommended_quantity: number | null;
  reorder_required: boolean;
  reason: FinalQuantityReason;
};

// ============================================================
// REORDER POINT CALCULATION
// ============================================================

export type ReorderPointCalculation = {
  formula: string;
  average_daily_sales_exact: number;
  lead_time_days: number;
  safety_buffer_days: number;
  result: number | null;
  available: boolean;
};

// ============================================================
// REORDER INTELLIGENCE ITEM
// ============================================================

export type ReorderIntelligenceItem = {
  product_id: number;
  product_name: string;
  sku: string | null;
  current_stock: number;

  sales: {
    period_days: number;
    units_sold: number;
    average_daily_sales: number;
    average_daily_sales_exact: number;
    days_of_cover: number | null;
    verified_sales_available: boolean;
  };

  reorder_calculation: {
    lead_time_days: number;
    safety_buffer_days: number;
    target_cover_days: number;

    lead_time_source: "product_configuration" | "api_default";

    safety_buffer_source: "product_configuration" | "api_default";

    configured_lead_time_days: number | null;
    configured_safety_buffer_days: number | null;

    reorder_period_days: number;

    configured_reorder_point: number | null;
    calculated_reorder_point: number | null;
    effective_reorder_point: number | null;

    reorder_point_source:
      | "configured"
      | "calculated_from_verified_sales"
      | "unavailable";

    reorder_point_calculation: ReorderPointCalculation;

    maximum_stock: number | null;
    target_stock: number | null;

    // Mathematical quantity calculation.
    quantity_calculation: ReorderQuantityCalculation | null;

    // Final business decision.
    final_quantity_calculation: FinalQuantityCalculation;
  };

  decision: {
    urgency: ReorderUrgency;
    reorder_required: boolean;
    recommended_quantity: number | null;
    quantity_source: string;
    existing_order_quantity: number;
    remaining_recommended_quantity: number | null;
  };

  existing_orders: ReorderExistingOrder[];

  related_investigation: ReorderInvestigation | null;

  risk: {
    risk_score: number;
    risk_level: InventoryRiskLevel;
    data_confidence: "high" | "medium" | "low";
  };

  recommendations: string[];

  requires_human_approval: boolean;
  automatically_ordered: boolean;
  inventory_modified: boolean;
};

// ============================================================
// REORDER INTELLIGENCE RESPONSE
// ============================================================

export type ReorderIntelligenceResponse = {
  planning_parameters: {
    lead_time_days: number;
    safety_buffer_days: number;
    target_cover_days: number;
    note: string;
  };

  summary: {
    total_products: number;
    reorder_required: number;
    critical: number;
    high: number;
    medium: number;
    normal: number;
    undetermined: number;
  };

  total: number;
  limit: number;
  offset: number;

  items: ReorderIntelligenceItem[];
};

// ============================================================
// GET ALL REORDER RECOMMENDATIONS
// ============================================================

export function getReorderIntelligence(params?: {
  lead_time_days?: number;
  safety_buffer_days?: number;
  target_cover_days?: number;
  urgency?: ReorderUrgency;
  limit?: number;
  offset?: number;
}) {
  const query = new URLSearchParams();

  query.set("lead_time_days", String(params?.lead_time_days ?? 7));
  query.set("safety_buffer_days", String(params?.safety_buffer_days ?? 3));
  query.set("target_cover_days", String(params?.target_cover_days ?? 30));
  query.set("limit", String(params?.limit ?? 100));
  query.set("offset", String(params?.offset ?? 0));

  if (params?.urgency) {
    query.set("urgency", params.urgency);
  }

  return inventoryRequest<ReorderIntelligenceResponse>(
    `/api/reorder-intelligence/?${query.toString()}`,
  );
}

// ============================================================
// GET PRODUCT REORDER RECOMMENDATION
// ============================================================

export function getProductReorderIntelligence(
  productId: number,
  params?: {
    lead_time_days?: number;
    safety_buffer_days?: number;
    target_cover_days?: number;
  },
) {
  const query = new URLSearchParams();

  query.set("lead_time_days", String(params?.lead_time_days ?? 7));
  query.set("safety_buffer_days", String(params?.safety_buffer_days ?? 3));
  query.set("target_cover_days", String(params?.target_cover_days ?? 30));

  return inventoryRequest<ReorderIntelligenceItem>(
    `/api/reorder-intelligence/products/${productId}?${query.toString()}`,
  );
}
