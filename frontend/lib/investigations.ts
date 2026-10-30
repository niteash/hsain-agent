import type {
  AIInvestigationReport,
  AIInvestigationReportListItem,
} from "@/types/investigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function investigationRequest<T>(
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

/**
 * Generate a new AI investigation report using Meta Muse Spark.
 *
 * This operation consumes an AI API request and persists the report.
 */
export function generateAIInvestigation(productId: number) {
  return investigationRequest<AIInvestigationReport>(
    `/api/investigations/products/${productId}/generate`,
    {
      method: "POST",
    },
  );
}

/**
 * Retrieve a previously generated AI investigation report.
 */
export function getAIInvestigationReport(reportId: number) {
  return investigationRequest<AIInvestigationReport>(
    `/api/investigations/reports/${reportId}`,
  );
}

/**
 * Retrieve AI investigation history for a product.
 */
export function getProductAIInvestigationReports(
  productId: number,
  options?: {
    skip?: number;
    limit?: number;
  },
) {
  const params = new URLSearchParams({
    skip: String(options?.skip ?? 0),
    limit: String(options?.limit ?? 20),
  });

  return investigationRequest<AIInvestigationReportListItem[]>(
    `/api/investigations/products/${productId}/reports?${params.toString()}`,
  );
}
