"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { createSupplier, getSuppliers, updateSupplier } from "@/lib/products";

import type { Supplier, SupplierCreateInput } from "@/types/product";

type SupplierFormState = {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
};

const EMPTY_FORM: SupplierFormState = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getSuppliers({
        active_only: false,
      });

      setSuppliers(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load suppliers.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return suppliers;

    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.contact_person,
        supplier.email,
        supplier.phone,
      ].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [suppliers, search]);

  const activeCount = suppliers.filter((supplier) => supplier.is_active).length;

  const inactiveCount = suppliers.length - activeCount;

  function openCreateForm() {
    setEditingSupplier(null);
    setForm(EMPTY_FORM);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function openEditForm(supplier: Supplier) {
    setEditingSupplier(supplier);

    setForm({
      name: supplier.name,
      contact_person: supplier.contact_person ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function closeForm() {
    if (submitting) return;

    setShowForm(false);
    setEditingSupplier(null);
    setForm(EMPTY_FORM);
  }

  function updateForm(field: keyof SupplierFormState, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const name = form.name.trim();

    if (!name) {
      setError("Supplier name is required.");
      return;
    }

    const payload: SupplierCreateInput = {
      name,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    };

    setSubmitting(true);

    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload);
        setSuccess("Supplier updated successfully.");
      } else {
        await createSupplier(payload);
        setSuccess("Supplier created successfully.");
      }

      setShowForm(false);
      setEditingSupplier(null);
      setForm(EMPTY_FORM);

      await loadSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save supplier.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(supplier: Supplier) {
    const action = supplier.is_active ? "deactivate" : "activate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} ${supplier.name}?`,
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      await updateSupplier(supplier.id, {
        is_active: !supplier.is_active,
      });

      setSuccess(`${supplier.name} has been ${action}d successfully.`);

      await loadSuppliers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update supplier status.",
      );
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        {/* Header */}
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
              <Link href="/" className="hover:text-red-600">
                Dashboard
              </Link>

              <span>/</span>

              <span className="text-zinc-900">Suppliers</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-zinc-950">
              Supplier Management
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              Manage supplier information and preferred supplier relationships.
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            + Add supplier
          </button>
        </div>

        {/* Notifications */}
        {error && !showForm && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>{error}</span>

            <button
              onClick={() => void loadSuppliers()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {success && (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {/* Statistics */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Total suppliers"
            value={suppliers.length}
            description="Registered suppliers"
          />

          <StatCard
            label="Active suppliers"
            value={activeCount}
            description="Available for product assignment"
          />

          <StatCard
            label="Inactive suppliers"
            value={inactiveCount}
            description="Currently unavailable"
            highlight={inactiveCount > 0}
          />
        </div>

        {/* Supplier table */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-zinc-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-zinc-900">All suppliers</h2>

              <p className="mt-1 text-xs text-zinc-500">
                {filteredSuppliers.length} suppliers found
              </p>
            </div>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search suppliers..."
              className="form-input w-full sm:max-w-xs"
            />
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-zinc-500">
              Loading suppliers...
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
                🏢
              </div>

              <h3 className="font-semibold text-zinc-900">
                No suppliers found
              </h3>

              <p className="mt-2 text-sm text-zinc-500">
                {search
                  ? "Try another search term."
                  : "Add your first supplier to get started."}
              </p>

              {!search && (
                <button
                  onClick={openCreateForm}
                  className="mt-5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Add supplier
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Supplier</th>

                    <th className="px-5 py-4 font-semibold">Contact</th>

                    <th className="px-5 py-4 font-semibold">Phone</th>

                    <th className="px-5 py-4 font-semibold">Status</th>

                    <th className="px-5 py-4 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100">
                  {filteredSuppliers.map((supplier) => (
                    <tr
                      key={supplier.id}
                      className="transition hover:bg-zinc-50"
                    >
                      <td className="px-5 py-4">
                        <div className="font-semibold text-zinc-900">
                          {supplier.name}
                        </div>

                        <div className="mt-1 text-xs text-zinc-400">
                          ID: #{supplier.id}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-zinc-700">
                          {supplier.contact_person || "—"}
                        </div>

                        <div className="mt-1 text-xs text-zinc-400">
                          {supplier.email || "No email"}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-zinc-500">
                        {supplier.phone || "—"}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge active={supplier.is_active} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => openEditForm(supplier)}
                            className="font-semibold text-red-600 hover:text-red-700"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => void handleToggleStatus(supplier)}
                            className={`font-semibold ${
                              supplier.is_active
                                ? "text-zinc-500 hover:text-red-600"
                                : "text-emerald-600 hover:text-emerald-700"
                            }`}
                          >
                            {supplier.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Information */}
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4">
          <span className="text-red-600">ⓘ</span>

          <p className="text-xs leading-5 text-red-800">
            Suppliers cannot be permanently deleted through this interface.
            Deactivation preserves existing product relationships and historical
            information. Inactive suppliers cannot be assigned to products.
          </p>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-zinc-950">
                  {editingSupplier ? "Edit supplier" : "Create supplier"}
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {editingSupplier
                    ? "Update supplier contact information."
                    : "Add a supplier to your business directory."}
                </p>
              </div>

              <button
                onClick={closeForm}
                disabled={submitting}
                aria-label="Close form"
                className="rounded-lg px-3 py-1 text-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Supplier name" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="e.g. ABC Distributors"
                  maxLength={150}
                  required
                  className="form-input"
                />
              </FormField>

              <FormField label="Contact person">
                <input
                  type="text"
                  value={form.contact_person}
                  onChange={(event) =>
                    updateForm("contact_person", event.target.value)
                  }
                  placeholder="Contact person's name"
                  maxLength={120}
                  className="form-input"
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateForm("email", event.target.value)
                    }
                    placeholder="supplier@example.com"
                    maxLength={255}
                    className="form-input"
                  />
                </FormField>

                <FormField label="Phone">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) =>
                      updateForm("phone", event.target.value)
                    }
                    placeholder="+91..."
                    maxLength={40}
                    className="form-input"
                  />
                </FormField>
              </div>

              <FormField label="Address">
                <textarea
                  value={form.address}
                  onChange={(event) =>
                    updateForm("address", event.target.value)
                  }
                  placeholder="Supplier address..."
                  rows={3}
                  className="form-input resize-none"
                />
              </FormField>

              <div className="flex justify-end gap-3 border-t border-zinc-100 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={submitting}
                  className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting
                    ? "Saving..."
                    : editingSupplier
                      ? "Save changes"
                      : "Create supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  description,
  highlight = false,
}: {
  label: string;
  value: number;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>

      <p
        className={`mt-3 text-3xl font-bold ${
          highlight ? "text-red-600" : "text-zinc-950"
        }`}
      >
        {value.toLocaleString()}
      </p>

      <p className="mt-2 text-xs text-zinc-400">{description}</p>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      Active
    </span>
  ) : (
    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500">
      Inactive
    </span>
  );
}

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-700">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </span>

      {children}
    </label>
  );
}
