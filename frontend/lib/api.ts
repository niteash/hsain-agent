const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    throw new Error(
      "Unable to connect to Hsain Agent backend. Check whether the backend server is running.",
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      body?.detail ?? `Request failed with status ${response.status}.`,
    );
  }

  return response.json() as Promise<T>;
}

// ============================================
// CORE TYPES
// ============================================

export type Confidence = "low" | "medium" | "high";

export type InventoryStatus = "matched" | "shortage" | "surplus";

export type OrderStatus = "pending_approval" | "simulated_ordered" | "rejected";

export type Investigation = {
  investigation_id: number;
  product_id: number;
  product_name: string;
  expected_stock: number;
  physical_stock: number;
  units_sold: number;
  expected_remaining_stock: number;
  discrepancy: number;
  status: InventoryStatus;
  investigation: string;
  recommended_action: string;
  model?: string;
  possible_causes?: string[];
  missing_evidence?: string[];
  confidence?: Confidence;
};

export type InvestigationHistoryItem = Investigation & {
  evidence_notes: string;
  created_at: string;
};

export type Order = {
  order_id: number;
  investigation_id: number;
  product_id: number;
  quantity: number;
  reason: string;
  status: OrderStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type OrderList = {
  items: Order[];
  total: number;
  limit: number;
  offset: number;
};

export type InvestigationList = {
  items: InvestigationHistoryItem[];
  limit: number;
  offset: number;
};

// ============================================
// CORE API
// ============================================

export function getInvestigations() {
  return request<InvestigationList>("/api/investigations?limit=50&offset=0");
}

export function getOrders(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";

  return request<OrderList>(`/api/orders${query}`);
}

export function investigateInventory(input: {
  product_name: string;
  expected_stock: number;
  physical_stock: number;
  units_sold: number;
  evidence_notes: string;
}) {
  return request<Investigation>("/api/inventory/investigate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function proposeOrder(input: {
  investigation_id: number;
  quantity: number;
}) {
  return request<Order>("/api/orders/propose", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function decideOrder(
  orderId: number,
  input: {
    decision: "approve" | "reject";
    approved_by: string;
  },
) {
  return request<Order>(`/api/orders/${orderId}/decision`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ============================================
// EVIDENCE TYPES
// ============================================

export type EvidenceFile = {
  id: number;
  evidence_id?: number;
  investigation_id: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  created_at: string;
};

export type EvidenceList = {
  investigation_id: number;
  total: number;
  items: EvidenceFile[];
};

export type EvidenceExtraction = {
  evidence_id: number;
  status: string;
  page_count: number;
  character_count: number;
  extracted_text?: string;
};

// ============================================
// MULTI-PRODUCT ANALYSIS TYPES
// ============================================

export type QuantityType =
  | "opening_stock"
  | "quantity_delivered"
  | "quantity_sold"
  | "physical_count"
  | "closing_stock"
  | "unknown";

export type InventoryLineItem = {
  product_name: string | null;
  sku: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  quantity_type: QuantityType;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
};

export type InventoryData = {
  line_items?: InventoryLineItem[];

  // Legacy compatibility fields
  product_name?: string | null;
  quantity?: number | null;
  quantity_type?: QuantityType;
  unit_price?: number | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  currency?: string | null;
};

export type EvidenceAnalysisResult = {
  document_type: string;
  is_inventory_relevant: boolean;
  detected_entities: string[];
  inventory_data: InventoryData;
  observations: string[];
  limitations: string[];
};

export type EvidenceAnalysisResponse = {
  analysis_id: number;
  evidence_id: number;
  document_type: string;
  is_inventory_relevant: boolean;
  model: string;
  analysis: EvidenceAnalysisResult;
};

// ============================================
// RECONCILIATION TYPES
// ============================================

export type ReconciliationCheck = {
  check?: string;
  name?: string;
  passed?: boolean;
  status?: string;
  details?: string;
  message?: string;
};

export type MatchedProduct = {
  line_item_index: number;
  product_name: string | null;
  sku: string | null;
  quantity: number | null;
  quantity_type: QuantityType;
  status: string;
};

export type LineItemReconciliation = {
  line_item_index: number;
  product_name: string | null;
  sku: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  quantity_type: QuantityType;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  product_match: boolean;
  matched_by: "sku" | "product_name" | null;
  status: string;
  checks: ReconciliationCheck[];
  limitations: string[];
  conclusion: string;
};

export type ReconciliationResult = {
  status: string;
  product_match?: boolean;

  // Legacy fields
  quantity_type?: string;
  reported_quantity?: number | null;

  // Multi-product fields
  matched_products?: MatchedProduct[];
  line_item_results?: LineItemReconciliation[];

  checks: ReconciliationCheck[];
  conclusion: string;
  limitations: string[];
};

export type ReconciliationResponse = {
  reconciliation_id: number;
  evidence_id: number;
  investigation_id: number;
  status: string;
  result: ReconciliationResult;
};

export type ReconciliationHistory = {
  evidence_id: number;
  total: number;
  items: Array<{
    reconciliation_id: number;
    investigation_id: number;
    status: string;
    created_at: string;
    result: ReconciliationResult;
  }>;
};

// ============================================
// EVIDENCE REQUEST HELPER
// ============================================

async function evidenceRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      cache: "no-store",
    });
  } catch {
    throw new Error("Unable to connect to Hsain Agent backend.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      body?.detail ?? `Request failed with status ${response.status}.`,
    );
  }

  return response.json() as Promise<T>;
}

// ============================================
// UPLOAD EVIDENCE
// ============================================

export async function uploadEvidence(investigationId: number, file: File) {
  const formData = new FormData();

  formData.append("file", file);

  return evidenceRequest<EvidenceFile>(`/api/evidence/${investigationId}`, {
    method: "POST",
    body: formData,
  });
}

// ============================================
// GET EVIDENCE FILES
// ============================================

export function getEvidence(investigationId: number) {
  return evidenceRequest<EvidenceList>(`/api/evidence/${investigationId}`);
}

// ============================================
// EXTRACT DOCUMENT TEXT
// ============================================

export function extractEvidence(evidenceId: number) {
  return evidenceRequest<EvidenceExtraction>(
    `/api/document-analysis/${evidenceId}/extract`,
    {
      method: "POST",
    },
  );
}

// ============================================
// GET EXTRACTION
// ============================================

export function getEvidenceExtraction(evidenceId: number) {
  return evidenceRequest<EvidenceExtraction>(
    `/api/document-analysis/${evidenceId}/extraction`,
  );
}

// ============================================
// ANALYZE DOCUMENT WITH MUSE SPARK
// ============================================

export function analyzeEvidence(evidenceId: number) {
  return evidenceRequest<EvidenceAnalysisResponse>(
    `/api/document-analysis/${evidenceId}/analyze`,
    {
      method: "POST",
    },
  );
}

// ============================================
// GET SAVED ANALYSIS
// ============================================

export function getEvidenceAnalysis(evidenceId: number) {
  return evidenceRequest<EvidenceAnalysisResponse>(
    `/api/document-analysis/${evidenceId}/analysis`,
  );
}

// ============================================
// RECONCILE EVIDENCE
// ============================================

export function reconcileEvidence(evidenceId: number) {
  return evidenceRequest<ReconciliationResponse>(
    `/api/reconciliation/${evidenceId}`,
    {
      method: "POST",
    },
  );
}

// ============================================
// GET RECONCILIATION HISTORY
// ============================================

export function getReconciliationHistory(evidenceId: number) {
  return evidenceRequest<ReconciliationHistory>(
    `/api/reconciliation/${evidenceId}`,
  );
}

// ============================================
// DOWNLOAD EVIDENCE
// ============================================

export function getEvidenceDownloadUrl(evidenceId: number) {
  return `${API_BASE_URL}/api/evidence/file/${evidenceId}/download`;
}

// ============================================
// INVENTORY MOVEMENT APPROVAL
// ============================================

export type MovementType = "receipt" | "sale" | "adjustment";

export type MovementStatus = "pending_approval" | "approved" | "rejected";

export type MovementProposal = {
  id: number;
  investigation_id: number;
  evidence_id: number;
  product_id: number;

  product_name: string | null;
  product_sku: string | null;
  current_stock: number | null;
  evidence_filename: string | null;

  movement_type: MovementType;
  quantity: number;
  quantity_delta: number;

  source_line_item_index: number | null;

  reason: string;
  status: MovementStatus;

  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;

  stock_movement_id: number | null;
  created_at: string;

  updated_stock?: number;
};

export type MovementProposalList = {
  total: number;
  items: MovementProposal[];
};

export type MovementDecisionInput = {
  decision: "approve" | "reject";
  approved_by: string;
  rejection_reason?: string;
};

export function getMovementProposals(filters?: {
  investigation_id?: number;
  status?: MovementStatus;
}) {
  const params = new URLSearchParams();

  if (filters?.investigation_id !== undefined) {
    params.set("investigation_id", String(filters.investigation_id));
  }

  if (filters?.status) {
    params.set("status", filters.status);
  }

  const query = params.toString();

  return evidenceRequest<MovementProposalList>(
    `/api/inventory-movements/${query ? `?${query}` : ""}`,
  );
}

export function createMovementProposal(input: {
  investigation_id: number;
  evidence_id: number;
  movement_type: MovementType;
  quantity: number;
  source_line_item_index?: number;
  reason: string;
}) {
  const params = new URLSearchParams({
    investigation_id: String(input.investigation_id),
    evidence_id: String(input.evidence_id),
  });

  return evidenceRequest<MovementProposal>(
    `/api/inventory-movements/propose?${params.toString()}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        movement_type: input.movement_type,
        quantity: input.quantity,
        source_line_item_index: input.source_line_item_index ?? null,
        reason: input.reason,
      }),
    },
  );
}

export function decideMovementProposal(
  proposalId: number,
  input: MovementDecisionInput,
) {
  return evidenceRequest<MovementProposal>(
    `/api/inventory-movements/${proposalId}/decision`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}
