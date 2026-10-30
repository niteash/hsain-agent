export type ConfidenceLevel = "high" | "medium" | "low";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PriorityLevel = "low" | "medium" | "high" | "critical";

export type CurrentInventoryPosition = {
  current_stock: number | null;
  opening_balance: number | null;
  ledger_movement_count: number;
  assessment: string;
};

export type VerifiedFact = {
  fact: string;
  source: string;
  confidence: ConfidenceLevel;
};

export type HistoricalFinding = {
  finding: string;
  source: string;
  timestamp: string | null;
  status: string;
};

export type DiscrepancyFinding = {
  description: string;
  quantity_difference: number | null;
  status: string;
  explanation: string;
};

export type PossibleExplanation = {
  explanation: string;
  supporting_information: string;
  confidence: ConfidenceLevel;
};

export type RiskAssessment = {
  level: RiskLevel;
  reason: string;
};

export type RecommendedAction = {
  action: string;
  priority: PriorityLevel;
  requires_human_approval: boolean;
};

export type InvestigationReport = {
  report_title: string;
  executive_summary: string;

  current_inventory_position: CurrentInventoryPosition;

  verified_facts: VerifiedFact[];
  historical_findings: HistoricalFinding[];
  discrepancies: DiscrepancyFinding[];
  possible_explanations: PossibleExplanation[];

  missing_information: string[];

  risk_assessment: RiskAssessment;

  recommended_actions: RecommendedAction[];

  final_conclusion: string;

  root_cause_identified: boolean;
  human_verification_required: boolean;
};

export type AIInvestigationReport = {
  id: number;
  product_id: number;
  product_name: string;
  model: string;
  status: string;
  report: InvestigationReport;
  created_at: string;
};

export type AIInvestigationReportListItem = {
  id: number;
  product_id: number;
  product_name: string;
  model: string;
  status: string;
  created_at: string;
};
