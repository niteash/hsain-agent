"use client";

import { useCallback, useEffect, useState } from "react";

import {
  analyzeEvidenceImage,
  completeVisualVerification,
  getVisualAnalysis,
  getVisualAudit,
  getVisualDetections,
  getVisualVerification,
  updateVisualDetection,
  type VisualAnalysisResponse,
  type VisualAuditResponse,
  type VisualDetection,
  type VisualDetectionsResponse,
  type VisualReviewStatus,
  type VisualVerificationResponse,
} from "@/lib/api";

type Props = {
  evidenceId: number;
  contentType: string;
  filename: string;
};

const REVIEW_ACTIONS: {
  status: VisualReviewStatus;
  label: string;
  className: string;
}[] = [
  {
    status: "accepted",
    label: "Accept observation",
    className: "border-green-200 bg-green-50 text-green-800",
  },
  {
    status: "rejected",
    label: "Reject observation",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  {
    status: "needs_review",
    label: "Needs review",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
];

function PanelTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h3 className="text-base font-bold text-neutral-900">{title}</h3>

      {description && (
        <p className="mt-1 text-sm leading-6 text-neutral-500">{description}</p>
      )}
    </div>
  );
}

function Badge({ value }: { value?: string | null }) {
  const normalizedValue = value?.trim() || "unknown";

  const styles: Record<string, string> = {
    accepted: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    needs_review: "bg-orange-50 text-orange-700 border-orange-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    partial_success: "bg-amber-50 text-amber-700 border-amber-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    unknown: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        styles[normalizedValue] || styles.unknown
      }`}
    >
      {normalizedValue.replaceAll("_", " ")}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-4">
      <p className="text-xs text-neutral-400">{label}</p>

      <p className="mt-2 break-words text-xl font-bold text-neutral-900">
        {value}
      </p>
    </div>
  );
}

function getCoordinates(detection: VisualDetection) {
  return detection.bounding_box?.coordinates ?? null;
}

function DetectionCard({
  detection,
  disabled,
  onReview,
}: {
  detection: VisualDetection;
  disabled: boolean;
  onReview: (detection: VisualDetection, status: VisualReviewStatus) => void;
}) {
  const coordinates = getCoordinates(detection);

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Detection
          </p>

          <h4 className="mt-2 font-bold text-neutral-900">
            Object {detection.object_id}
          </h4>
        </div>

        <Badge value={detection.status ?? "pending"} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric
          label="Bounding box"
          value={detection.has_bounding_box ? "Available" : "Unavailable"}
        />

        <Metric
          label="Segmentation mask"
          value={detection.has_segmentation_mask ? "Available" : "Unavailable"}
        />
      </div>

      {coordinates && (
        <div className="mt-4 rounded-lg bg-neutral-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Bounding box coordinates
          </p>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <p>Left: {coordinates.left}</p>
            <p>Top: {coordinates.top}</p>
            <p>Right: {coordinates.right}</p>
            <p>Bottom: {coordinates.bottom}</p>
          </div>

          <p className="mt-3 text-xs text-neutral-500">
            Coordinates are presented in the source image coordinate system.
            They do not represent a verified physical count.
          </p>
        </div>
      )}

      {detection.note && (
        <p className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
          {detection.note}
        </p>
      )}

      <div className="mt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Human review
        </p>

        <div className="flex flex-wrap gap-2">
          {REVIEW_ACTIONS.map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={disabled || detection.status === action.status}
              onClick={() => onReview(detection, action.status)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 ${action.className}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function AuditSection({ audit }: { audit: VisualAuditResponse | null }) {
  if (!audit) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6">
      <PanelTitle
        title="Verification audit history"
        description="Recorded review actions and verification events."
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Metric
          label="Analysis revision"
          value={audit.current_analysis_revision ?? "—"}
        />

        <Metric label="Review records" value={audit.reviews?.length ?? 0} />
      </div>

      <div className="mt-6 space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-800">
            Verification history
          </p>

          {audit.verification_history?.length ? (
            <pre className="overflow-auto rounded-xl bg-neutral-50 p-4 text-xs leading-6 text-neutral-700">
              {JSON.stringify(audit.verification_history, null, 2)}
            </pre>
          ) : (
            <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">
              No completed verification records.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-800">
            Review events
          </p>

          {audit.events?.length ? (
            <pre className="overflow-auto rounded-xl bg-neutral-50 p-4 text-xs leading-6 text-neutral-700">
              {JSON.stringify(audit.events, null, 2)}
            </pre>
          ) : (
            <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">
              No review events recorded.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-800">
            Verification events
          </p>

          {audit.verification_events?.length ? (
            <pre className="overflow-auto rounded-xl bg-neutral-50 p-4 text-xs leading-6 text-neutral-700">
              {JSON.stringify(audit.verification_events, null, 2)}
            </pre>
          ) : (
            <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">
              No verification events recorded.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function VisualInspectionPanel({
  evidenceId,
  contentType,
  filename,
}: Props) {
  const isImage = contentType.startsWith("image/");

  const [analysis, setAnalysis] = useState<VisualAnalysisResponse | null>(null);

  const [detections, setDetections] = useState<VisualDetectionsResponse | null>(
    null,
  );

  const [verification, setVerification] =
    useState<VisualVerificationResponse | null>(null);

  const [audit, setAudit] = useState<VisualAuditResponse | null>(null);

  const [objectPrompt, setObjectPrompt] = useState("");
  const [actor, setActor] = useState("inventory_reviewer");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadVisualData = useCallback(async () => {
    if (!isImage) return;

    setLoading(true);
    setError("");

    try {
      const result = await getVisualAnalysis(evidenceId);

      setAnalysis(result);

      const [detectionResult, verificationResult, auditResult] =
        await Promise.all([
          getVisualDetections(evidenceId),
          getVisualVerification(evidenceId),
          getVisualAudit(evidenceId),
        ]);

      setDetections(detectionResult);
      setVerification(verificationResult);
      setAudit(auditResult);
    } catch {
      setAnalysis(null);
      setDetections(null);
      setVerification(null);
      setAudit(null);
    } finally {
      setLoading(false);
    }
  }, [evidenceId, isImage]);

  useEffect(() => {
    void loadVisualData();
  }, [loadVisualData]);

  if (!isImage) return null;

  const findings = analysis?.analysis.spark_analysis?.findings;

  const segmentation = analysis?.analysis.segmentation;

  const summary = detections?.verification ?? verification?.summary;

  const candidateCount = detections?.candidate_count ?? 0;

  async function handleAnalyze() {
    if (loading || !isImage) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await analyzeEvidenceImage(
        evidenceId,
        objectPrompt.trim() || undefined,
      );

      setAnalysis(result);

      const [detectionResult, verificationResult, auditResult] =
        await Promise.all([
          getVisualDetections(evidenceId),
          getVisualVerification(evidenceId),
          getVisualAudit(evidenceId),
        ]);

      setDetections(detectionResult);
      setVerification(verificationResult);
      setAudit(auditResult);

      setSuccess("Multimodal image analysis completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(
    detection: VisualDetection,
    status: VisualReviewStatus,
  ) {
    if (reviewing) return;

    setReviewing(true);
    setError("");
    setSuccess("");

    try {
      await updateVisualDetection(evidenceId, detection.object_id, {
        status,
        actor: actor.trim() || "inventory_reviewer",
        note: note.trim() || undefined,
      });

      const [detectionResult, verificationResult, auditResult] =
        await Promise.all([
          getVisualDetections(evidenceId),
          getVisualVerification(evidenceId),
          getVisualAudit(evidenceId),
        ]);

      setDetections(detectionResult);
      setVerification(verificationResult);
      setAudit(auditResult);

      setNote("");

      setSuccess(`Object ${detection.object_id} marked as ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed.");
    } finally {
      setReviewing(false);
    }
  }

  async function handleCompleteVerification() {
    if (
      !verification?.summary.can_complete ||
      candidateCount === 0 ||
      reviewing
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Complete human verification for this analysis revision?",
    );

    if (!confirmed) return;

    setReviewing(true);
    setError("");
    setSuccess("");

    try {
      await completeVisualVerification(evidenceId, {
        actor: actor.trim() || "inventory_reviewer",
      });

      const [verificationResult, detectionResult, auditResult] =
        await Promise.all([
          getVisualVerification(evidenceId),
          getVisualDetections(evidenceId),
          getVisualAudit(evidenceId),
        ]);

      setVerification(verificationResult);
      setDetections(detectionResult);
      setAudit(auditResult);

      setSuccess("Human verification completed.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete verification.",
      );
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PanelTitle
            title="Multimodal visual inspection"
            description="Inspect inventory images using Muse Spark and SAM."
          />

          <Badge value={verification?.verification_status ?? "pending"} />
        </div>

        <div className="mt-5 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
          <p className="text-xs text-neutral-400">Selected image</p>

          <p className="mt-1 break-all text-sm font-semibold text-neutral-900">
            {filename}
          </p>

          <p className="mt-1 text-xs text-neutral-500">
            Evidence #{evidenceId}
          </p>
        </div>

        <div className="mt-5">
          <label
            htmlFor={`visual-prompt-${evidenceId}`}
            className="mb-2 block text-sm font-semibold text-neutral-800"
          >
            Object detection prompt
          </label>

          <input
            id={`visual-prompt-${evidenceId}`}
            value={objectPrompt}
            onChange={(event) => setObjectPrompt(event.target.value)}
            placeholder="e.g. Biscuit packs"
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-red-400"
          />

          <p className="mt-2 text-xs text-neutral-400">
            Specify the product or object to inspect. Use a product-specific
            prompt to avoid confusing unrelated inventory.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={loading}
          className="mt-5 w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Analyzing image..." : "Analyze image with AI"}
        </button>

        {loading && (
          <p className="mt-3 text-center text-xs text-neutral-500">
            Running multimodal inspection. Please wait...
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700"
          >
            {success}
          </p>
        )}
      </section>

      {/* ANALYSIS RESULTS */}

      {analysis && (
        <>
          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PanelTitle
                title="AI scene understanding"
                description={`Model: ${analysis.model}`}
              />

              <Badge
                value={
                  analysis.analysis.evidence_classification?.classification ??
                  "unknown"
                }
              />
            </div>

            <div className="mt-5 rounded-xl bg-neutral-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Scene description
              </p>

              <p className="mt-2 text-sm leading-7 text-neutral-700">
                {findings?.scene_description ??
                  "No scene description was returned."}
              </p>
            </div>

            {analysis.analysis.product && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Investigated product"
                  value={analysis.analysis.product.name}
                />

                <Metric
                  label="Analysis revision"
                  value={analysis.analysis_revision}
                />
              </div>
            )}

            {findings?.detected_products &&
              findings.detected_products.length > 0 && (
                <div className="mt-7">
                  <PanelTitle
                    title="Products identified by Muse Spark"
                    description="These are AI observations, not verified physical counts."
                  />

                  <div className="mt-4 space-y-3">
                    {findings.detected_products.map((product, index) => (
                      <article
                        key={`${product.product_description}-${index}`}
                        className="rounded-xl border border-neutral-100 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-neutral-900">
                              {product.product_description}
                            </p>

                            <p className="mt-1 text-xs text-neutral-500">
                              {product.brand ?? "Brand unidentified"}
                            </p>
                          </div>

                          {product.confidence && (
                            <Badge value={product.confidence} />
                          )}
                        </div>

                        <p className="mt-3 text-sm text-neutral-600">
                          {product.location_description}
                        </p>

                        {product.visible_label && (
                          <p className="mt-2 text-xs text-neutral-500">
                            Visible label: {product.visible_label}
                          </p>
                        )}

                        {product.observations?.map(
                          (observation, observationIndex) => (
                            <p
                              key={observationIndex}
                              className="mt-2 text-xs leading-5 text-neutral-500"
                            >
                              • {observation}
                            </p>
                          ),
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}

            {findings?.shelf_conditions &&
              findings.shelf_conditions.length > 0 && (
                <div className="mt-7">
                  <PanelTitle title="Shelf conditions" />

                  <div className="mt-3 space-y-2">
                    {findings.shelf_conditions.map((item, index) => (
                      <p
                        key={index}
                        className="rounded-lg bg-neutral-50 p-3 text-sm leading-6 text-neutral-700"
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}

            {findings?.potential_anomalies &&
              findings.potential_anomalies.length > 0 && (
                <div className="mt-7">
                  <PanelTitle title="Potential anomalies" />

                  <div className="mt-3 space-y-2">
                    {findings.potential_anomalies.map((item, index) => (
                      <p
                        key={index}
                        className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-800"
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}

            {findings?.limitations && findings.limitations.length > 0 && (
              <div className="mt-7">
                <PanelTitle title="Analysis limitations" />

                <div className="mt-3 space-y-2">
                  {findings.limitations.map((item, index) => (
                    <p
                      key={index}
                      className="rounded-lg bg-neutral-50 p-3 text-sm leading-6 text-neutral-600"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* SAM SEGMENTATION */}

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PanelTitle
                title="SAM segmentation"
                description="Object detection and segmentation candidates."
              />

              <Badge value={segmentation?.status ?? "unknown"} />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric
                label="Candidate objects"
                value={
                  segmentation?.processed_results?.candidate_instance_count ?? 0
                }
              />

              <Metric
                label="Bounding boxes"
                value={
                  segmentation?.processed_results?.quality
                    ?.objects_with_bounding_boxes ?? 0
                }
              />

              <Metric
                label="Segmented objects"
                value={
                  segmentation?.processed_results?.quality
                    ?.fully_segmented_objects ?? 0
                }
              />
            </div>

            <div className="mt-5 rounded-xl bg-neutral-50 p-4">
              <p className="text-xs text-neutral-400">Detection prompt</p>

              <p className="mt-1 text-sm font-semibold text-neutral-900">
                {segmentation?.object_prompt ?? "Not available"}
              </p>
            </div>

            {candidateCount === 0 ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
                <p className="font-semibold text-amber-900">
                  No objects detected
                </p>

                <p className="mt-2 text-sm leading-6 text-amber-800">
                  SAM did not return recognizable bounding boxes or masks for
                  the requested object. This does not establish that physical
                  inventory is zero.
                </p>

                <p className="mt-3 text-xs leading-5 text-amber-800">
                  Try a clearer image or a more appropriate product-specific
                  prompt. Human verification remains required.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <PanelTitle
                  title="Detection review"
                  description="Each candidate must be reviewed by a human."
                />

                <div className="mt-4 space-y-4">
                  {detections?.detections.map((detection) => (
                    <DetectionCard
                      key={detection.object_id}
                      detection={detection}
                      disabled={reviewing}
                      onReview={handleReview}
                    />
                  ))}
                </div>
              </div>
            )}

            {segmentation?.processed_results?.warnings?.map(
              (warning, index) => (
                <p
                  key={index}
                  className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                >
                  {warning}
                </p>
              ),
            )}
          </section>

          {/* HUMAN VERIFICATION */}

          <section className="rounded-2xl border border-neutral-200 bg-white p-6">
            <PanelTitle
              title="Human verification"
              description="Review SAM candidates before completing verification."
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Metric
                label="Candidates"
                value={summary?.total_candidates ?? 0}
              />

              <Metric label="Accepted" value={summary?.accepted ?? 0} />

              <Metric label="Rejected" value={summary?.rejected ?? 0} />

              <Metric label="Needs review" value={summary?.needs_review ?? 0} />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-medium text-neutral-600">
                  Review resolution
                </span>

                <span className="font-semibold text-neutral-900">
                  {summary?.total_candidates
                    ? `${summary.resolved}/${summary.total_candidates}`
                    : "No candidates"}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-red-600 transition-all"
                  style={{
                    width: `${
                      summary?.total_candidates
                        ? Math.min(
                            100,
                            (summary.resolved / summary.total_candidates) * 100,
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                {candidateCount === 0
                  ? "Verification cannot be completed without reviewable candidates."
                  : "Human review is required before verification."}
              </p>

              <p className="mt-2 text-xs leading-5 text-amber-800">
                A zero-candidate result is not a verified zero-stock result. AI
                detection acceptance confirms an observation, not a physical
                inventory quantity.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`reviewer-${evidenceId}`}
                  className="mb-2 block text-xs font-semibold text-neutral-600"
                >
                  Reviewer identifier
                </label>

                <input
                  id={`reviewer-${evidenceId}`}
                  value={actor}
                  onChange={(event) => setActor(event.target.value)}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none focus:border-red-400"
                />
              </div>

              <div>
                <label
                  htmlFor={`review-note-${evidenceId}`}
                  className="mb-2 block text-xs font-semibold text-neutral-600"
                >
                  Review note
                </label>

                <input
                  id={`review-note-${evidenceId}`}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional observation note"
                  className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none focus:border-red-400"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleCompleteVerification()}
              disabled={
                reviewing ||
                !verification?.summary.can_complete ||
                candidateCount === 0
              }
              className="mt-5 w-full rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {reviewing ? "Processing..." : "Complete human verification"}
            </button>

            {verification?.verification_status === "verified" && (
              <p className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                This analysis revision has been human-verified.
              </p>
            )}
          </section>

          {/* AUDIT HISTORY */}

          <AuditSection audit={audit} />
        </>
      )}

      {!analysis && !loading && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <PanelTitle
            title="No visual analysis yet"
            description="Start an image inspection to see AI findings and segmentation results."
          />
        </section>
      )}

      {/* INVENTORY SAFETY */}

      <section className="rounded-2xl border border-red-100 bg-red-50/50 p-5">
        <p className="text-sm font-bold text-neutral-900">
          Inventory integrity protection
        </p>

        <ul className="mt-3 space-y-2 text-xs leading-5 text-neutral-600">
          <li>
            • AI detection results are candidate observations, not physical
            counts.
          </li>

          <li>• Human acceptance does not automatically establish quantity.</li>

          <li>• Visual analysis cannot directly modify inventory.</li>

          <li>
            • Only the authorized inventory movement workflow can change stock.
          </li>

          <li>
            • Supplier proposals and visual detections are not delivery
            confirmation.
          </li>
        </ul>

        <p className="mt-4 text-xs font-semibold text-red-700">
          Inventory mutation performed: No
        </p>
      </section>
    </div>
  );
}
