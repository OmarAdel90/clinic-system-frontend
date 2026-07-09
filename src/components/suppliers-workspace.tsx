"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Supplier } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { StatCard } from "@/components/stat-card";

type SupplierForm = {
  name: string;
  phone_number: string;
};

const initialForm: SupplierForm = {
  name: "",
  phone_number: "",
};

function toForm(supplier?: Supplier | null): SupplierForm {
  if (!supplier) {
    return initialForm;
  }

  return {
    name: supplier.name || "",
    phone_number: supplier.phone_number || "",
  };
}

export function SuppliersWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<SupplierForm>(initialForm);
  const [editForm, setEditForm] = useState<SupplierForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return suppliers.filter((supplier) => {
      if (!term) {
        return true;
      }

      return [supplier.name, supplier.phone_number, String(supplier.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [search, suppliers]);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === selectedId) ?? filteredSuppliers[0] ?? suppliers[0] ?? null,
    [filteredSuppliers, selectedId, suppliers],
  );

  const stats = useMemo(
    () => ({
      total: suppliers.length,
      withPhone: suppliers.filter((supplier) => Boolean(supplier.phone_number)).length,
      recent: suppliers.filter((supplier) => {
        const created = supplier.created_at ? new Date(supplier.created_at).getTime() : 0;
        return created >= Date.now() - 30 * 24 * 60 * 60 * 1000;
      }).length,
      initials: new Set(suppliers.map((supplier) => supplier.name.charAt(0).toUpperCase()).filter(Boolean)).size,
    }),
    [suppliers],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchCollection<Supplier>("/suppliers");
      setSuppliers(payload);
      setSelectedId((current) => current ?? payload[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load suppliers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  useEffect(() => {
    setEditForm(toForm(selectedSupplier));
  }, [selectedSupplier]);

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/suppliers", "POST", {
        name: createForm.name,
        phone_number: createForm.phone_number,
      });
      setCreateForm(initialForm);
      setNotice("Supplier created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create supplier.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSupplier) return;

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/suppliers/${selectedSupplier.id}`, "PATCH", {
        name: editForm.name,
        phone_number: editForm.phone_number,
      });
      setNotice(`Supplier "${editForm.name}" updated successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update supplier.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteSupplier(id: number) {
    setDeletingId(id);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/suppliers/${id}`);
      setNotice(`Supplier #${id} deleted successfully.`);
      if (selectedId === id) {
        setSelectedId(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete supplier.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Maintain the vendor directory used by warehouse intake and supplier-side purchasing flows."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Suppliers" value={stats.total} hint="Supplier records returned by the API." />
        <StatCard label="With Phone" value={stats.withPhone} hint="Suppliers with a reachable phone number." />
        <StatCard label="Recent Adds" value={stats.recent} hint="Suppliers created in the last 30 days." />
        <StatCard label="Initial Groups" value={stats.initials} hint="Distinct name initials for quick scanning." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Supplier Directory" description="Search and select a supplier to review or edit it.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="supplier-search" value={search} onChange={setSearch} placeholder="Name, phone, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading suppliers...</div>
          ) : (
            <div className="space-y-3">
              {filteredSuppliers.map((supplier) => {
                const active = selectedSupplier?.id === supplier.id;
                return (
                  <button
                    key={supplier.id}
                    type="button"
                    onClick={() => setSelectedId(supplier.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{supplier.name}</div>
                        <div className={`mt-1 text-sm ${active ? "text-slate-300" : "text-slate-600"}`}>{supplier.phone_number || "No phone number"}</div>
                      </div>
                      <div className="text-xs text-slate-500">#{supplier.id}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Supplier" description="Capture the vendor identity and contact number used during warehouse procurement.">
            <form className="space-y-4" onSubmit={createSupplier}>
              <WorkflowInput label="Name" name="create-supplier-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} required />
              <WorkflowInput label="Phone Number" name="create-supplier-phone" value={createForm.phone_number} onChange={(value) => setCreateForm((current) => ({ ...current, phone_number: value }))} required />
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create Supplier"}
              </button>
            </form>
          </Panel>

          <Panel title="Selected Supplier" description="Update the core supplier contact record.">
            {selectedSupplier ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">{selectedSupplier.name}</div>
                  <div className="mt-1 text-sm text-slate-600">{selectedSupplier.phone_number || "No phone number"}</div>
                  <div className="mt-2 text-xs text-slate-500">Created {formatLocalDateTime(selectedSupplier.created_at)}</div>
                </div>

                <form className="space-y-4" onSubmit={updateSupplier}>
                  <WorkflowInput label="Name" name="edit-supplier-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} required />
                  <WorkflowInput label="Phone Number" name="edit-supplier-phone" value={editForm.phone_number} onChange={(value) => setEditForm((current) => ({ ...current, phone_number: value }))} required />
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                      {savingEdit ? "Saving..." : "Save Changes"}
                    </button>
                    <button type="button" onClick={() => void deleteSupplier(selectedSupplier.id)} disabled={deletingId === selectedSupplier.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {deletingId === selectedSupplier.id ? "Deleting..." : "Delete Supplier"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a supplier to edit it.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
