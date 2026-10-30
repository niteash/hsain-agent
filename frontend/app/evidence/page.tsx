"use client";

import { useCallback, useEffect, useState, startTransition } from "react";

import Link from "next/link";

import {
  analyzeEvidence,
  extractEvidence,
  getEvidence,
  getEvidenceAnalysis,
  getReconciliationHistory,
  getEvidenceDownloadUrl,
  reconcileEvidence,
  uploadEvidence,
  type EvidenceFile,
  type EvidenceAnalysisResponse,
  type EvidenceExtraction,
  type ReconciliationResponse,
  type InventoryLineItem,
  type ReconciliationCheck,
  type LineItemReconciliation,
} from "@/lib/api";

// ============================================
// UI COMPONENTS
// ============================================

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-50 text-green-700",
    corroborated: "bg-green-50 text-green-700",
    not_relevant: "bg-neutral-100 text-neutral-700",
    needs_review: "bg-amber-50 text-amber-700",
    product_mismatch: "bg-red-50 text-red-700",
    relevant: "bg-green-50 text-green-700",
    matched: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
        styles[status] ?? "bg-neutral-100 text-neutral-600"
      }`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>

      {description && (
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl bg-neutral-50 p-5 text-center text-sm text-neutral-500">
      {message}
    </p>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-neutral-100 p-4">
      <p className="text-xs text-neutral-400">{label}</p>

      <p className="mt-1 break-words text-sm font-semibold text-neutral-900">
        {value === null || value === undefined || value === ""
          ? "Not identified"
          : String(value)}
      </p>
    </div>
  );
}

function getEvidenceId(file: EvidenceFile): number {
  const id = file.id ?? file.evidence_id;

  if (id === undefined || id === null) {
    throw new Error("The selected evidence does not have a valid ID.");
  }

  return id;
}

// ============================================
// LEGACY DATA NORMALIZATION
// ============================================

function getInventoryLineItems(
  analysis: EvidenceAnalysisResponse,
): InventoryLineItem[] {
  const inventory = analysis.analysis.inventory_data;

  if (inventory.line_items && inventory.line_items.length > 0) {
    return inventory.line_items;
  }

  // Older saved analysis may contain only one product.
  if (
    inventory.product_name ||
    (inventory.quantity !== null && inventory.quantity !== undefined)
  ) {
    return [
      {
        product_name: inventory.product_name ?? null,
        sku: null,
        quantity: inventory.quantity ?? null,
        quantity_unit: null,
        quantity_type: inventory.quantity_type ?? "unknown",
        unit_price: inventory.unit_price ?? null,
        total_price: null,
        currency: inventory.currency ?? null,
      },
    ];
  }

  return [];
}

// ============================================
// RECONCILIATION CHECKS
// ============================================

function ValidationChecks({ checks }: { checks: ReconciliationCheck[] }) {
  if (!checks.length) {
    return <EmptyState message="No validation checks were performed." />;
  }

  return (
    <div className="space-y-3">
      {checks.map((check, index) => (
        <div
          key={`${check.check ?? check.name ?? "check"}-${index}`}
          className="flex gap-3 rounded-xl border border-neutral-100 p-4"
        >
          <span
            className={
              check.passed
                ? "font-bold text-green-600"
                : "font-bold text-amber-600"
            }
          >
            {check.passed ? "✓" : "!"}
          </span>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">
              {(check.check ?? check.name ?? "Validation check").replaceAll(
                "_",
                " ",
              )}
            </p>

            <p className="mt-1 text-sm leading-6 text-neutral-500">
              {check.details ?? check.message ?? check.status ?? ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// MULTI-PRODUCT TABLE
// ============================================

function InventoryLineItemsTable({ items }: { items: InventoryLineItem[] }) {
  if (!items.length) {
    return (
      <EmptyState message="No product line items were identified in this document." />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">SKU</th>
            <th className="px-4 py-3">Quantity</th>
            <th className="px-4 py-3">Quantity type</th>
            <th className="px-4 py-3">Unit price</th>
            <th className="px-4 py-3">Total price</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-neutral-100">
          {items.map((item, index) => (
            <tr
              key={`${item.sku ?? item.product_name ?? "item"}-${index}`}
              className="hover:bg-neutral-50"
            >
              <td className="px-4 py-4 font-semibold text-neutral-900">
                {item.product_name ?? "Unknown product"}
              </td>

              <td className="px-4 py-4 text-neutral-600">{item.sku ?? "—"}</td>

              <td className="px-4 py-4 font-medium text-neutral-800">
                {item.quantity === null
                  ? "—"
                  : `${item.quantity} ${item.quantity_unit ?? ""}`}
              </td>

              <td className="px-4 py-4">
                <span className="rounded-lg bg-neutral-100 px-2 py-1 text-xs capitalize text-neutral-700">
                  {item.quantity_type.replaceAll("_", " ")}
                </span>
              </td>

              <td className="px-4 py-4 text-neutral-600">
                {item.unit_price === null
                  ? "—"
                  : `${item.currency ?? ""} ${item.unit_price}`}
              </td>

              <td className="px-4 py-4 font-medium text-neutral-800">
                {item.total_price === null
                  ? "—"
                  : `${item.currency ?? ""} ${item.total_price}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// LINE ITEM RECONCILIATION
// ============================================

function LineItemResults({ items }: { items: LineItemReconciliation[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <article
          key={item.line_item_index}
          className="rounded-xl border border-neutral-200 p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Line item {item.line_item_index + 1}
              </p>

              <h4 className="mt-2 font-semibold text-neutral-900">
                {item.product_name ?? "Unknown product"}
              </h4>

              {item.sku && (
                <p className="mt-1 text-xs text-neutral-500">SKU: {item.sku}</p>
              )}
            </div>

            <StatusBadge status={item.status} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <InfoCard
              label="Quantity"
              value={
                item.quantity === null
                  ? null
                  : `${item.quantity} ${item.quantity_unit ?? ""}`
              }
            />

            <InfoCard
              label="Quantity type"
              value={item.quantity_type.replaceAll("_", " ")}
            />

            <InfoCard
              label="Matched by"
              value={item.matched_by ?? "No exact match"}
            />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Product match
            </p>

            <p
              className={`text-sm font-medium ${
                item.product_match ? "text-green-700" : "text-red-700"
              }`}
            >
              {item.product_match
                ? "Matches the investigated product"
                : "Does not match the investigated product"}
            </p>
          </div>

          <div className="mt-4 rounded-lg bg-neutral-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Conclusion
            </p>

            <p className="mt-2 text-sm leading-6 text-neutral-700">
              {item.conclusion}
            </p>
          </div>

          {item.checks.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Checks
              </p>

              <ValidationChecks checks={item.checks} />
            </div>
          )}

          {item.limitations.length > 0 && (
            <div className="mt-4 space-y-2">
              {item.limitations.map((limitation, index) => (
                <p
                  key={index}
                  className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                >
                  {limitation}
                </p>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function EvidencePage() {
  const [investigationId, setInvestigationId] = useState("4");

  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<EvidenceFile | null>(null);

  const [extraction, setExtraction] = useState<EvidenceExtraction | null>(null);

  const [analysis, setAnalysis] = useState<EvidenceAnalysisResponse | null>(
    null,
  );

  const [reconciliation, setReconciliation] =
    useState<ReconciliationResponse | null>(null);

  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ============================================
  // LOAD EVIDENCE
  // ============================================

  const loadEvidence = useCallback(async (id: number) => {
    setLoadingFiles(true);

    try {
      const result = await getEvidence(id);

      setFiles(result.items ?? []);
      setError("");
    } catch (err) {
      setFiles([]);

      setError(err instanceof Error ? err.message : "Unable to load evidence.");
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    const id = Number(investigationId);

    if (!Number.isInteger(id) || id < 1) {
      return;
    }

    startTransition(() => {
      void loadEvidence(id);
    });
  }, [investigationId, loadEvidence]);

  // ============================================
  // UPLOAD
  // ============================================

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    const id = Number(investigationId);

    if (!Number.isInteger(id) || id < 1) {
      setError("Enter a valid investigation ID.");
      input.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Maximum upload size is 10 MB.");
      input.value = "";
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      await uploadEvidence(id, file);

      setSuccess("Evidence uploaded successfully.");

      setSelectedFile(null);
      setExtraction(null);
      setAnalysis(null);
      setReconciliation(null);

      await loadEvidence(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  // ============================================
  // SELECT EVIDENCE
  // ============================================

  async function selectEvidence(file: EvidenceFile) {
    setSelectedFile(file);
    setExtraction(null);
    setAnalysis(null);
    setReconciliation(null);
    setError("");
    setSuccess("");

    const evidenceId = getEvidenceId(file);

    try {
      const savedAnalysis = await getEvidenceAnalysis(evidenceId);

      setAnalysis(savedAnalysis);
    } catch {
      // No saved analysis yet.
    }

    try {
      const history = await getReconciliationHistory(evidenceId);

      if (history.items?.length > 0) {
        const latest = history.items[0];

        setReconciliation({
          reconciliation_id: latest.reconciliation_id,
          evidence_id: evidenceId,
          investigation_id: latest.investigation_id,
          status: latest.status,
          result: latest.result,
        });
      }
    } catch {
      // No reconciliation history yet.
    }
  }

  // ============================================
  // EXTRACT
  // ============================================

  async function handleExtract() {
    if (!selectedFile || processing) return;

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const result = await extractEvidence(getEvidenceId(selectedFile));

      setExtraction(result);

      setSuccess("Document text extracted successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setProcessing(false);
    }
  }

  // ============================================
  // ANALYZE
  // ============================================

  async function handleAnalyze() {
    if (!selectedFile || processing) return;

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const result = await analyzeEvidence(getEvidenceId(selectedFile));

      setAnalysis(result);
      setReconciliation(null);

      setSuccess("Muse Spark analysis completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setProcessing(false);
    }
  }

  // ============================================
  // RECONCILE
  // ============================================

  async function handleReconcile() {
    if (!selectedFile || !analysis || processing) return;

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const result = await reconcileEvidence(getEvidenceId(selectedFile));

      setReconciliation(result);

      setSuccess("Evidence reconciliation completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconciliation failed.");
    } finally {
      setProcessing(false);
    }
  }

  // ============================================
  // DERIVED DATA
  // ============================================

  const evidenceId = selectedFile ? getEvidenceId(selectedFile) : null;

  const inventoryItems = analysis ? getInventoryLineItems(analysis) : [];

  const reconciliationResult = reconciliation?.result;

  const isValidInvestigationId =
    Number.isInteger(Number(investigationId)) && Number(investigationId) > 0;

  // ============================================
  // RENDER
  // ============================================

  return (
    <main className="min-h-screen bg-[#f8f8f7] px-5 py-8 text-neutral-900 md:px-10">
      <div className="mx-auto max-w-7xl">
        {/* HEADER */}

        <header className="mb-9 flex flex-wrap items-center justify-between gap-5">
          <div>
            <Link
              href="/"
              className="mb-3 inline-flex text-sm text-neutral-500 hover:text-red-600"
            >
              ← Back to dashboard
            </Link>

            <h1 className="text-3xl font-bold tracking-tight">
              Evidence Review
            </h1>

            <p className="mt-2 text-sm text-neutral-500">
              Upload, extract, analyze and reconcile inventory evidence.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
            <label
              htmlFor="investigation-id"
              className="text-xs text-neutral-500"
            >
              Investigation ID
            </label>

            <input
              id="investigation-id"
              type="number"
              min="1"
              value={investigationId}
              onChange={(event) => {
                setInvestigationId(event.target.value);
                setFiles([]);
                setSelectedFile(null);
                setExtraction(null);
                setAnalysis(null);
                setReconciliation(null);
                setError("");
                setSuccess("");
              }}
              className="mt-1 block w-28 border-none bg-transparent text-lg font-semibold outline-none"
            />
          </div>
        </header>

        {/* ALERTS */}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"
          >
            {success}
          </div>
        )}

        {!isValidInvestigationId && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Enter a valid positive investigation ID to view or upload evidence.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* LEFT SIDEBAR */}

          <aside className="space-y-6">
            {/* UPLOAD */}

            <section className="rounded-2xl border border-neutral-200 bg-white p-5">
              <SectionTitle
                title="Upload evidence"
                description="PDF, JPEG, PNG or WebP. Maximum 10 MB."
              />

              <label
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-5 py-9 text-center transition ${
                  uploading || !isValidInvestigationId
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:border-red-400 hover:bg-red-50/30"
                }`}
              >
                <span className="mb-3 text-3xl">↑</span>

                <span className="text-sm font-semibold">
                  {uploading ? "Uploading..." : "Choose a document"}
                </span>

                <span className="mt-2 text-xs text-neutral-500">
                  Select a file from your device
                </span>

                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading || !isValidInvestigationId}
                  onChange={handleUpload}
                />
              </label>

              <p className="mt-3 text-xs leading-5 text-neutral-400">
                Documents are stored privately and analyzed only after you
                initiate processing.
              </p>
            </section>

            {/* EVIDENCE LIBRARY */}

            <section className="rounded-2xl border border-neutral-200 bg-white p-5">
              <SectionTitle
                title="Evidence library"
                description={`${files.length} document(s)`}
              />

              {loadingFiles ? (
                <EmptyState message="Loading evidence..." />
              ) : files.length === 0 ? (
                <EmptyState message="No evidence uploaded for this investigation." />
              ) : (
                <div className="space-y-2">
                  {files.map((file) => {
                    const id = getEvidenceId(file);

                    const selected =
                      selectedFile !== null &&
                      getEvidenceId(selectedFile) === id;

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void selectEvidence(file)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          selected
                            ? "border-red-300 bg-red-50"
                            : "border-neutral-100 hover:bg-neutral-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xl">
                            {file.content_type === "application/pdf"
                              ? "📄"
                              : "🖼️"}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {file.original_filename}
                            </p>

                            <p className="mt-1 text-xs text-neutral-400">
                              {(file.file_size / 1024).toFixed(1)} KB
                            </p>

                            <p className="mt-1 text-xs text-neutral-400">
                              {new Date(file.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>

          {/* MAIN CONTENT */}

          <section className="space-y-6">
            {!selectedFile ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-8 text-center">
                <span className="mb-4 text-5xl">📂</span>

                <h2 className="text-lg font-semibold">
                  Select an evidence document
                </h2>

                <p className="mt-2 max-w-sm text-sm text-neutral-500">
                  Select a document from the evidence library to extract its
                  contents and start AI analysis.
                </p>
              </div>
            ) : (
              <>
                {/* SELECTED DOCUMENT */}

                <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Selected document
                      </p>

                      <h2 className="mt-2 text-xl font-bold">
                        {selectedFile.original_filename}
                      </h2>

                      <p className="mt-1 text-xs text-neutral-500">
                        Evidence #{evidenceId}
                      </p>
                    </div>

                    {evidenceId !== null && (
                      <a
                        href={getEvidenceDownloadUrl(evidenceId)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
                      >
                        Download
                      </a>
                    )}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={handleExtract}
                      disabled={processing}
                      className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Extract text
                    </button>

                    <button
                      type="button"
                      onClick={handleAnalyze}
                      disabled={processing}
                      className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Analyze with AI
                    </button>

                    <button
                      type="button"
                      onClick={handleReconcile}
                      disabled={processing || !analysis}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      Reconcile evidence
                    </button>
                  </div>

                  {processing && (
                    <p className="mt-4 text-sm text-neutral-500">
                      Processing document. Please wait...
                    </p>
                  )}
                </section>

                {/* EXTRACTION */}

                {extraction && (
                  <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <SectionTitle
                      title="Text extraction"
                      description="Text extracted from the uploaded document."
                    />

                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-neutral-50 p-4">
                        <p className="text-xs text-neutral-500">Pages</p>

                        <p className="mt-1 text-2xl font-bold">
                          {extraction.page_count}
                        </p>
                      </div>

                      <div className="rounded-xl bg-neutral-50 p-4">
                        <p className="text-xs text-neutral-500">Characters</p>

                        <p className="mt-1 text-2xl font-bold">
                          {extraction.character_count}
                        </p>
                      </div>
                    </div>

                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-neutral-50 p-4 text-xs leading-6 text-neutral-700">
                      {extraction.extracted_text ??
                        "Extraction completed. Use the extraction endpoint to retrieve the extracted text."}
                    </pre>
                  </section>
                )}

                {/* AI ANALYSIS */}

                {analysis && (
                  <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <SectionTitle
                        title="Muse Spark analysis"
                        description={`Model: ${analysis.model}`}
                      />

                      <StatusBadge
                        status={
                          analysis.is_inventory_relevant
                            ? "relevant"
                            : "not_relevant"
                        }
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoCard
                        label="Document type"
                        value={analysis.document_type.replaceAll("_", " ")}
                      />

                      <InfoCard
                        label="Inventory relevance"
                        value={
                          analysis.is_inventory_relevant
                            ? "Relevant"
                            : "Not relevant"
                        }
                      />

                      <InfoCard
                        label="Invoice number"
                        value={analysis.analysis.inventory_data.invoice_number}
                      />

                      <InfoCard
                        label="Invoice date"
                        value={analysis.analysis.inventory_data.invoice_date}
                      />

                      <InfoCard
                        label="Currency"
                        value={analysis.analysis.inventory_data.currency}
                      />

                      <InfoCard
                        label="Products identified"
                        value={inventoryItems.length}
                      />
                    </div>

                    {/* PRODUCT TABLE */}

                    <div className="mt-7">
                      <SectionTitle
                        title="Extracted product line items"
                        description="Products and quantities identified in the document."
                      />

                      <InventoryLineItemsTable items={inventoryItems} />
                    </div>

                    {/* OBSERVATIONS */}

                    <div className="mt-7">
                      <h3 className="mb-3 text-sm font-semibold">
                        Observations
                      </h3>

                      {analysis.analysis.observations.length === 0 ? (
                        <EmptyState message="No observations were returned." />
                      ) : (
                        <ul className="space-y-2">
                          {analysis.analysis.observations.map((item, index) => (
                            <li
                              key={index}
                              className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* ANALYSIS LIMITATIONS */}

                    <div className="mt-7">
                      <h3 className="mb-3 text-sm font-semibold">
                        Analysis limitations
                      </h3>

                      {analysis.analysis.limitations.length === 0 ? (
                        <EmptyState message="No limitations were returned." />
                      ) : (
                        <ul className="space-y-2">
                          {analysis.analysis.limitations.map((item, index) => (
                            <li
                              key={index}
                              className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                )}

                {/* RECONCILIATION */}

                {reconciliation && reconciliationResult && (
                  <section className="rounded-2xl border border-neutral-200 bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <SectionTitle
                        title="Evidence reconciliation"
                        description={`Reconciliation #${reconciliation.reconciliation_id}`}
                      />

                      <StatusBadge status={reconciliation.status} />
                    </div>

                    {/* CONCLUSION */}

                    <div className="rounded-xl bg-neutral-50 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Overall conclusion
                      </p>

                      <p className="mt-2 text-sm leading-6 text-neutral-800">
                        {reconciliationResult.conclusion}
                      </p>
                    </div>

                    {/* MATCHED PRODUCTS */}

                    {reconciliationResult.matched_products &&
                      reconciliationResult.matched_products.length > 0 && (
                        <div className="mt-6">
                          <h3 className="mb-3 text-sm font-semibold">
                            Matched products
                          </h3>

                          <div className="space-y-2">
                            {reconciliationResult.matched_products.map(
                              (product) => (
                                <div
                                  key={product.line_item_index}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-100 bg-green-50/50 p-4"
                                >
                                  <div>
                                    <p className="text-sm font-semibold text-neutral-900">
                                      {product.product_name ??
                                        "Unknown product"}
                                    </p>

                                    {product.sku && (
                                      <p className="mt-1 text-xs text-neutral-500">
                                        SKU: {product.sku}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium">
                                      {product.quantity ?? "—"}
                                    </span>

                                    <StatusBadge status={product.status} />
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                    {/* PER-LINE-ITEM RESULTS */}

                    {reconciliationResult.line_item_results &&
                      reconciliationResult.line_item_results.length > 0 && (
                        <div className="mt-7">
                          <SectionTitle
                            title="Line-item reconciliation"
                            description="Each extracted product is checked independently against the investigation."
                          />

                          <LineItemResults
                            items={reconciliationResult.line_item_results}
                          />
                        </div>
                      )}

                    {/* OVERALL VALIDATION CHECKS */}

                    <div className="mt-7">
                      <h3 className="mb-3 text-sm font-semibold">
                        Overall validation checks
                      </h3>

                      <ValidationChecks checks={reconciliationResult.checks} />
                    </div>

                    {/* LIMITATIONS */}

                    {reconciliationResult.limitations.length > 0 && (
                      <div className="mt-7">
                        <h3 className="mb-3 text-sm font-semibold">
                          Reconciliation limitations
                        </h3>

                        <ul className="space-y-2">
                          {reconciliationResult.limitations.map(
                            (item, index) => (
                              <li
                                key={index}
                                className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
                              >
                                {item}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
