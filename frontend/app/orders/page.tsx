"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  X,
  XCircle,
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================

type OrderStatus = "pending_approval" | "simulated_ordered" | "rejected";

type Supplier = {
  id: number;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
};

type EligibleInvestigation = {
  investigation_id: number;
  product_id: number;
  product_name: string;
  sku: string | null;
  discrepancy: number;
  status: string;
  created_at: string;
  current_stock: number;
  preferred_supplier: {
    supplier_id: number;
    supplier_name: string;
    is_active: boolean;
  } | null;
};

type SupplierOrder = {
  order_id: number;
  investigation_id: number;
  product_id: number;
  product_name: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  quantity: number;
  reason: string;
  status: OrderStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

type OrderListResponse = {
  items: SupplierOrder[];
  total: number;
  limit: number;
  offset: number;
};

type VerifiedOrder = SupplierOrder & {
  verification: {
    record_exists: boolean;
    status_persisted: boolean;
    supplier_order_sent: boolean;
    message: string;
  };
};

type OrderFilter = "all" | OrderStatus;

// ============================================================
// API
// ============================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function apiRequest<T>(
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
    throw new Error("Unable to connect to the backend.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(body?.detail ?? `Request failed (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

function getOrders() {
  return apiRequest<OrderListResponse>("/api/orders?limit=100&offset=0");
}

function getSuppliers() {
  return apiRequest<Supplier[]>("/api/suppliers/?active_only=true");
}

function getEligibleInvestigations() {
  return apiRequest<EligibleInvestigation[]>(
    "/api/orders/eligible-investigations",
  );
}

function createOrderProposal(payload: {
  investigation_id: number;
  quantity: number;
  supplier_id: number;
}) {
  return apiRequest<SupplierOrder>("/api/orders/propose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function decideOrder(
  orderId: number,
  payload: {
    decision: "approve" | "reject";
    approved_by: string;
  },
) {
  return apiRequest<SupplierOrder>(`/api/orders/${orderId}/decision`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function verifyOrder(orderId: number) {
  return apiRequest<VerifiedOrder>(`/api/orders/${orderId}`);
}

// ============================================================
// HELPERS
// ============================================================

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatStatus(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    pending_approval: "Pending Approval",
    simulated_ordered: "Simulated Ordered",
    rejected: "Rejected",
  };

  return labels[status];
}

function statusStyle(status: OrderStatus) {
  const styles: Record<OrderStatus, string> = {
    pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
    simulated_ordered: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };

  return styles[status];
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const Icon =
    status === "pending_approval"
      ? Clock
      : status === "simulated_ordered"
        ? CheckCircle2
        : XCircle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle(status)}`}
    >
      <Icon size={13} />
      {formatStatus(status)}
    </span>
  );
}

// ============================================================
// SUMMARY CARD
// ============================================================

function SummaryCard({
  title,
  value,
  description,
  icon,
  iconClass,
}: {
  title: string;
  value: number;
  description: string;
  icon: ReactNode;
  iconClass: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>

          <h3 className="mt-2 text-3xl font-bold text-gray-950">{value}</h3>

          <p className="mt-1 text-xs text-gray-500">{description}</p>
        </div>

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CREATE PROPOSAL MODAL
// ============================================================

function CreateProposalModal({
  suppliers,
  onClose,
  onCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [investigations, setInvestigations] = useState<EligibleInvestigation[]>(
    [],
  );

  const [investigationId, setInvestigationId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedInvestigation = useMemo(
    () =>
      investigations.find(
        (item) => item.investigation_id === Number(investigationId),
      ) ?? null,
    [investigations, investigationId],
  );

  const selectedSupplier = useMemo(
    () =>
      suppliers.find((supplier) => supplier.id === Number(supplierId)) ?? null,
    [suppliers, supplierId],
  );

  useEffect(() => {
    let active = true;

    async function loadInvestigations() {
      try {
        const data = await getEligibleInvestigations();

        if (!active) return;

        setInvestigations(data);

        if (data.length > 0) {
          const first = data[0];

          setInvestigationId(String(first.investigation_id));

          const preferredId = first.preferred_supplier?.is_active
            ? first.preferred_supplier.supplier_id
            : null;

          setSupplierId(preferredId ? String(preferredId) : "");
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load investigations.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInvestigations();

    return () => {
      active = false;
    };
  }, []);

  const handleInvestigationChange = (value: string) => {
    setInvestigationId(value);
    setError("");

    const investigation = investigations.find(
      (item) => item.investigation_id === Number(value),
    );

    const preferredId = investigation?.preferred_supplier?.is_active
      ? investigation.preferred_supplier.supplier_id
      : null;

    setSupplierId(preferredId ? String(preferredId) : "");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const parsedQuantity = Number(quantity);
    const parsedInvestigationId = Number(investigationId);
    const parsedSupplierId = Number(supplierId);

    if (
      !Number.isInteger(parsedInvestigationId) ||
      parsedInvestigationId <= 0
    ) {
      setError("Select a valid investigation.");
      return;
    }

    if (!Number.isInteger(parsedSupplierId) || parsedSupplierId <= 0) {
      setError("Select an active supplier.");
      return;
    }

    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity <= 0 ||
      parsedQuantity > 10000
    ) {
      setError("Quantity must be between 1 and 10,000.");
      return;
    }

    if (!selectedSupplier?.is_active) {
      setError("The selected supplier is not active.");
      return;
    }

    setSubmitting(true);

    try {
      await createOrderProposal({
        investigation_id: parsedInvestigationId,
        quantity: parsedQuantity,
        supplier_id: parsedSupplierId,
      });

      await onCreated();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the proposal.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-gray-950">
              Create Order Proposal
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Select an eligible investigation and supplier.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 size={24} className="animate-spin text-red-600" />
              <span className="text-sm text-gray-500">
                Loading investigations...
              </span>
            </div>
          ) : investigations.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <AlertTriangle size={22} className="text-amber-700" />

              <h3 className="mt-3 font-bold text-amber-900">
                No eligible investigations
              </h3>

              <p className="mt-2 text-sm leading-6 text-amber-800">
                No investigations with an unproposed confirmed shortage are
                currently available.
              </p>
            </div>
          ) : (
            <>
              {/* INVESTIGATION */}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Investigation
                </label>

                <select
                  value={investigationId}
                  onChange={(event) =>
                    handleInvestigationChange(event.target.value)
                  }
                  required
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  {investigations.map((item) => (
                    <option
                      key={item.investigation_id}
                      value={item.investigation_id}
                    >
                      Investigation #{item.investigation_id} —{" "}
                      {item.product_name} (Shortage:{" "}
                      {Math.abs(item.discrepancy)})
                    </option>
                  ))}
                </select>
              </div>

              {/* PRODUCT INFORMATION */}

              {selectedInvestigation && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <Package size={18} className="text-gray-600" />

                    <h3 className="font-bold text-gray-900">
                      Product Information
                    </h3>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Product</p>

                      <p className="mt-1 text-sm font-semibold text-gray-950">
                        {selectedInvestigation.product_name}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Product ID</p>

                      <p className="mt-1 text-sm font-semibold text-gray-950">
                        #{selectedInvestigation.product_id}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Current Stock</p>

                      <p className="mt-1 text-sm font-semibold text-gray-950">
                        {selectedInvestigation.current_stock} units
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Recorded Shortage</p>

                      <p className="mt-1 text-sm font-bold text-red-600">
                        {Math.abs(selectedInvestigation.discrepancy)} units
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* SUPPLIER */}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Supplier
                </label>

                <select
                  value={supplierId}
                  onChange={(event) => setSupplierId(event.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  <option value="">Select a supplier</option>

                  {suppliers
                    .filter((supplier) => supplier.is_active)
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {selectedInvestigation?.preferred_supplier
                          ?.supplier_id === supplier.id
                          ? " (Preferred)"
                          : ""}
                      </option>
                    ))}
                </select>

                <p className="mt-1.5 text-xs text-gray-400">
                  Preferred supplier is automatically selected when available.
                </p>

                {selectedSupplier && (
                  <div className="mt-3 rounded-lg border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900">
                      {selectedSupplier.name}
                    </p>

                    <p className="mt-1 text-xs text-gray-500">
                      {selectedSupplier.contact_person || "No contact person"}
                    </p>

                    {selectedSupplier.email && (
                      <p className="mt-1 text-xs text-gray-500">
                        {selectedSupplier.email}
                      </p>
                    )}

                    {selectedSupplier.phone && (
                      <p className="mt-1 text-xs text-gray-500">
                        {selectedSupplier.phone}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* QUANTITY */}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Proposed Quantity
                </label>

                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="Enter proposed quantity"
                  required
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />

                <p className="mt-1.5 text-xs text-gray-400">
                  This quantity requires human review. It is not automatically
                  calculated from the shortage.
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck
                size={18}
                className="mt-0.5 shrink-0 text-amber-700"
              />

              <div>
                <p className="text-xs font-semibold text-amber-900">
                  Human approval required
                </p>

                <p className="mt-1 text-xs leading-5 text-amber-800">
                  This proposal does not modify inventory, place an external
                  order, or contact the supplier.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || submitting || investigations.length === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Create Proposal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// VERIFICATION MODAL
// ============================================================

function OrderDetailsModal({
  order,
  onClose,
}: {
  order: VerifiedOrder;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-gray-950">
              Order Verification
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Order #{order.order_id}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <StatusBadge status={order.status} />

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">Product</p>
              <p className="mt-1 text-sm font-bold text-gray-950">
                {order.product_name || `Product #${order.product_id}`}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">Quantity</p>
              <p className="mt-1 text-xl font-bold text-gray-950">
                {order.quantity}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">Supplier</p>
              <p className="mt-1 text-sm font-bold text-gray-950">
                {order.supplier_name || "Unassigned"}
              </p>
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs text-gray-500">Investigation</p>
              <p className="mt-1 text-xl font-bold text-gray-950">
                #{order.investigation_id}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Proposal Reason
            </p>

            <p className="mt-2 text-sm leading-6 text-gray-700">
              {order.reason}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileCheck2 size={18} />

              <h3 className="text-sm font-bold text-gray-900">Verification</h3>
            </div>

            <div className="space-y-3 text-sm">
              <VerificationRow
                label="Order record exists"
                value={order.verification.record_exists}
              />

              <VerificationRow
                label="Status persisted"
                value={order.verification.status_persisted}
              />

              <VerificationRow
                label="External supplier contacted"
                value={order.verification.supplier_order_sent}
                inverse
              />
            </div>

            <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600">
              {order.verification.message}
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function VerificationRow({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: boolean;
  inverse?: boolean;
}) {
  const positive = inverse ? !value : value;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-600">{label}</span>

      <span
        className={`flex items-center gap-1.5 text-xs font-semibold ${
          positive ? "text-green-700" : "text-gray-500"
        }`}
      >
        {positive ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}

        {value ? "Yes" : "No"}
      </span>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function OrdersPage() {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filter, setFilter] = useState<OrderFilter>("all");

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<VerifiedOrder | null>(
    null,
  );

  const [actionOrderId, setActionOrderId] = useState<number | null>(null);

  const [approverName, setApproverName] = useState("");

  // ----------------------------------------------------------
  // LOAD DATA
  // ----------------------------------------------------------

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError("");

    try {
      const [orderResponse, supplierResponse] = await Promise.all([
        getOrders(),
        getSuppliers(),
      ]);

      setOrders(orderResponse.items);
      setSuppliers(supplierResponse);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load supplier orders.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ----------------------------------------------------------
  // FILTERED ORDERS
  // ----------------------------------------------------------

  const filteredOrders = useMemo(() => {
    if (filter === "all") return orders;

    return orders.filter((order) => order.status === filter);
  }, [orders, filter]);

  const pendingCount = orders.filter(
    (order) => order.status === "pending_approval",
  ).length;

  const simulatedCount = orders.filter(
    (order) => order.status === "simulated_ordered",
  ).length;

  const rejectedCount = orders.filter(
    (order) => order.status === "rejected",
  ).length;

  // ----------------------------------------------------------
  // APPROVE / REJECT
  // ----------------------------------------------------------

  const handleDecision = async (
    orderId: number,
    decision: "approve" | "reject",
  ) => {
    const name = approverName.trim();

    if (!name) {
      setError("Enter the approver's name before proceeding.");
      return;
    }

    const confirmation =
      decision === "approve"
        ? "Approve this proposal as a simulated order? No supplier will be contacted and inventory will not change."
        : "Reject this supplier order proposal?";

    if (!window.confirm(confirmation)) return;

    setActionOrderId(orderId);
    setError("");
    setSuccess("");

    try {
      await decideOrder(orderId, {
        decision,
        approved_by: name,
      });

      setSuccess(
        decision === "approve"
          ? `Order #${orderId} approved as a simulated order.`
          : `Order #${orderId} rejected.`,
      );

      setApproverName("");

      await loadData(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update the order.",
      );
    } finally {
      setActionOrderId(null);
    }
  };

  // ----------------------------------------------------------
  // VERIFY
  // ----------------------------------------------------------

  const handleVerify = async (orderId: number) => {
    setActionOrderId(orderId);
    setError("");

    try {
      const result = await verifyOrder(orderId);
      setSelectedOrder(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not verify this order.",
      );
    } finally {
      setActionOrderId(null);
    }
  };

  // ----------------------------------------------------------
  // CREATE CALLBACK
  // ----------------------------------------------------------

  const handleCreated = async () => {
    await loadData(false);
    setFilter("all");
    setSuccess("Supplier order proposal created successfully.");
  };

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        {/* HEADER */}

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-600">
              <ShoppingCart size={16} />
              Inventory Management
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
              Supplier Orders
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Manage replenishment proposals, supplier assignments, approval
              decisions, and simulated orders.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void loadData(false)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Plus size={17} />
              Create Proposal
            </button>
          </div>
        </div>

        {/* SAFETY NOTICE */}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-amber-700" />

            <div>
              <h3 className="text-sm font-bold text-amber-900">
                Human-controlled ordering
              </h3>

              <p className="mt-1 text-sm leading-6 text-amber-800">
                Every proposal requires human approval. Approval records a
                simulated order only. No supplier is contacted and inventory is
                not automatically changed.
              </p>
            </div>
          </div>
        </div>

        {/* ALERTS */}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />

            <div className="flex-1 text-sm text-red-700">{error}</div>

            <button onClick={() => setError("")} className="text-red-500">
              <X size={17} />
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-green-600"
            />

            <div className="flex-1 text-sm text-green-700">{success}</div>

            <button onClick={() => setSuccess("")} className="text-green-500">
              <X size={17} />
            </button>
          </div>
        )}

        {/* SUMMARY */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Total Proposals"
            value={orders.length}
            description="Recorded supplier proposals"
            icon={<Package size={21} />}
            iconClass="bg-gray-100 text-gray-700"
          />

          <SummaryCard
            title="Pending Approval"
            value={pendingCount}
            description="Waiting for human decision"
            icon={<Clock size={21} />}
            iconClass="bg-amber-50 text-amber-700"
          />

          <SummaryCard
            title="Simulated Orders"
            value={simulatedCount}
            description="Approved, not sent to suppliers"
            icon={<CheckCircle2 size={21} />}
            iconClass="bg-green-50 text-green-700"
          />

          <SummaryCard
            title="Rejected"
            value={rejectedCount}
            description="Rejected proposals"
            icon={<XCircle size={21} />}
            iconClass="bg-red-50 text-red-600"
          />
        </div>

        {/* AUTHORIZATION */}

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Decision Authorization
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Enter the responsible person's name before approving or
                rejecting proposals.
              </p>
            </div>

            <input
              type="text"
              value={approverName}
              onChange={(event) => setApproverName(event.target.value)}
              maxLength={120}
              placeholder="Enter approver name"
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 sm:max-w-xs"
            />
          </div>
        </div>

        {/* FILTERS */}

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "All Orders"],
              ["pending_approval", "Pending"],
              ["simulated_ordered", "Simulated Ordered"],
              ["rejected", "Rejected"],
            ] as [OrderFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                filter === value
                  ? "bg-gray-950 text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ORDER TABLE */}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-gray-950">
                Supplier Order Proposals
              </h2>

              <p className="mt-1 text-xs text-gray-500">
                Review proposals, supplier assignments, and decisions.
              </p>
            </div>

            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              {filteredOrders.length} displayed
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3">
              <Loader2 size={28} className="animate-spin text-red-600" />

              <p className="text-sm text-gray-500">
                Loading supplier orders...
              </p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                <ShoppingCart size={26} />
              </div>

              <h3 className="mt-4 text-base font-bold text-gray-900">
                No supplier proposals found
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                No orders are available in this category. Create a proposal
                using an eligible investigation.
              </p>

              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Plus size={16} />
                Create Proposal
              </button>
            </div>
          ) : (
            <>
              {/* DESKTOP */}

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      {[
                        "Order",
                        "Product",
                        "Supplier",
                        "Quantity",
                        "Investigation",
                        "Status",
                        "Created",
                        "Actions",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="whitespace-nowrap px-5 py-4 text-xs font-semibold uppercase tracking-wide text-gray-500"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {filteredOrders.map((order) => (
                      <tr
                        key={order.order_id}
                        className="transition hover:bg-gray-50/70"
                      >
                        <td className="px-5 py-4">
                          <span className="font-bold text-gray-950">
                            #{order.order_id}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="text-sm font-semibold text-gray-800">
                            {order.product_name ||
                              `Product #${order.product_id}`}
                          </div>

                          <div className="mt-1 text-xs text-gray-400">
                            ID #{order.product_id}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span className="text-sm text-gray-700">
                            {order.supplier_name || "Unassigned"}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span className="text-sm font-bold text-gray-950">
                            {order.quantity} units
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <span className="text-sm text-gray-600">
                            #{order.investigation_id}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <StatusBadge status={order.status} />
                        </td>

                        <td className="whitespace-nowrap px-5 py-4">
                          <span className="text-xs text-gray-500">
                            {formatDate(order.created_at)}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => void handleVerify(order.order_id)}
                              disabled={actionOrderId === order.order_id}
                              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                            >
                              Verify
                            </button>

                            {order.status === "pending_approval" && (
                              <>
                                <button
                                  onClick={() =>
                                    void handleDecision(
                                      order.order_id,
                                      "approve",
                                    )
                                  }
                                  disabled={actionOrderId === order.order_id}
                                  className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  {actionOrderId === order.order_id
                                    ? "..."
                                    : "Approve"}
                                </button>

                                <button
                                  onClick={() =>
                                    void handleDecision(
                                      order.order_id,
                                      "reject",
                                    )
                                  }
                                  disabled={actionOrderId === order.order_id}
                                  className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE */}

              <div className="space-y-3 p-4 md:hidden">
                {filteredOrders.map((order) => (
                  <div
                    key={order.order_id}
                    className="rounded-xl border border-gray-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-gray-950">
                          Order #{order.order_id}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {order.product_name || `Product #${order.product_id}`}
                        </p>
                      </div>

                      <StatusBadge status={order.status} />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Supplier</p>

                        <p className="mt-1 text-sm font-semibold text-gray-950">
                          {order.supplier_name || "Unassigned"}
                        </p>
                      </div>

                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Quantity</p>

                        <p className="mt-1 font-bold text-gray-950">
                          {order.quantity} units
                        </p>
                      </div>

                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Investigation</p>

                        <p className="mt-1 font-bold text-gray-950">
                          #{order.investigation_id}
                        </p>
                      </div>

                      <div className="rounded-lg bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Product ID</p>

                        <p className="mt-1 font-bold text-gray-950">
                          #{order.product_id}
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-gray-400">
                      Created: {formatDate(order.created_at)}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => void handleVerify(order.order_id)}
                        disabled={actionOrderId === order.order_id}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Verify
                      </button>

                      {order.status === "pending_approval" && (
                        <>
                          <button
                            onClick={() =>
                              void handleDecision(order.order_id, "approve")
                            }
                            disabled={actionOrderId === order.order_id}
                            className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                          >
                            Approve
                          </button>

                          <button
                            onClick={() =>
                              void handleDecision(order.order_id, "reject")
                            }
                            disabled={actionOrderId === order.order_id}
                            className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* FOOTER */}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-green-600" />

              <h3 className="text-sm font-bold text-gray-900">
                Inventory Safety
              </h3>
            </div>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Supplier order approval does not update current stock. Stock
              changes must be recorded through the inventory movement workflow.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600" />

              <h3 className="text-sm font-bold text-gray-900">
                External Supplier Status
              </h3>
            </div>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Approved proposals are simulated orders only. No external purchase
              order is sent, and no incoming inventory is confirmed.
            </p>
          </div>
        </div>
      </div>

      {/* MODALS */}

      {showCreateModal && (
        <CreateProposalModal
          suppliers={suppliers}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}
