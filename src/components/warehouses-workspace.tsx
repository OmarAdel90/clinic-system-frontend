"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Clinic, TreatmentPlanRef, Visit, Warehouse, WarehouseInventory } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { StatCard } from "@/components/stat-card";

type WarehouseDetailsView = "overview" | "inventory" | "demand" | "settings";
import { formatLocalDateTime } from "@/lib/time";

type InventoryPressure = {
  sku: string;
  name: string;
  quantity: number;
  reserved: number;
  available: number;
  pressure: "healthy" | "watch" | "critical";
};

type WarehouseForm = {
  name: string;
  clinic_id: string;
};

const initialForm: WarehouseForm = {
  name: "",
  clinic_id: "",
};

function getPressure(available: number, quantity: number) {
  if (available < 25) {
    return "critical";
  }

  if (quantity <= 0 || available / quantity > 0.5) {
    return "healthy";
  }

  if (available <= 0 || available / quantity <= 0.15) {
    return "critical";
  }

  return "watch";
}

export function WarehousesWorkspace() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [plans, setPlans] = useState<TreatmentPlanRef[]>([]);
  const [createForm, setCreateForm] = useState<WarehouseForm>(initialForm);
  const [editForm, setEditForm] = useState<WarehouseForm>(initialForm);
  const [search, setSearch] = useState("");
  const [clinicFilter, setClinicFilter] = useState("all");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedWarehouseView, setSelectedWarehouseView] = useState<WarehouseDetailsView>("overview");
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);

  const filteredWarehouses = useMemo(() => {
    const term = search.trim().toLowerCase();

    return warehouses.filter((warehouse) => {
      const clinicName = warehouse.clinic?.name || "";
      const matchesSearch =
        !term ||
        [warehouse.name, clinicName, String(warehouse.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      const matchesClinic = clinicFilter === "all" || String(warehouse.clinic_id ?? "") === clinicFilter;
      return matchesSearch && matchesClinic;
    });
  }, [clinicFilter, search, warehouses]);

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ?? null,
    [selectedWarehouseId, warehouses],
  );

  const eligibleCreateClinics = useMemo(
    () =>
      clinics.filter(
        (clinic) =>
          clinic.provides_medication &&
          !warehouses.some((warehouse) => warehouse.clinic_id === clinic.id),
      ),
    [clinics, warehouses],
  );

  const eligibleEditClinics = useMemo(
    () =>
      clinics.filter(
        (clinic) =>
          clinic.provides_medication &&
          (!warehouses.some((warehouse) => warehouse.clinic_id === clinic.id && warehouse.id !== selectedWarehouse?.id) ||
            clinic.id === selectedWarehouse?.clinic_id),
      ),
    [clinics, selectedWarehouse?.clinic_id, selectedWarehouse?.id, warehouses],
  );

  const pressureRows = useMemo<InventoryPressure[]>(() => {
    const inventories = selectedWarehouse?.inventories ?? [];
    return inventories.map((row: WarehouseInventory) => {
      const quantity = Number(row.quantity ?? 0);
      const reserved = Number(row.reserved_quantity ?? 0);
      const available = typeof row.available === "number" ? row.available : quantity - reserved;
      return {
        sku: row.sku,
        name: row.name || row.sku,
        quantity,
        reserved,
        available,
        pressure: getPressure(available, quantity),
      };
    });
  }, [selectedWarehouse]);

  const relatedVisits = useMemo(() => visits.filter((visit) => visit.clinic_id === selectedWarehouse?.clinic_id), [selectedWarehouse, visits]);
  const relatedPlans = useMemo(() => plans.filter((plan) => plan.clinic_id === selectedWarehouse?.clinic_id), [plans, selectedWarehouse]);

  const stats = useMemo(() => ({
    totalWarehouses: warehouses.length,
    totalSkus: warehouses.reduce((sum, warehouse) => sum + (warehouse.inventories?.length ?? 0), 0),
    reservedUnits: warehouses.reduce(
      (sum, warehouse) => sum + (warehouse.inventories ?? []).reduce((inner, item) => inner + Number(item.reserved_quantity ?? 0), 0),
      0,
    ),
    criticalSkus: warehouses.reduce(
      (sum, warehouse) =>
        sum +
        (warehouse.inventories ?? []).filter((item) => {
          const quantity = Number(item.quantity ?? 0);
          const reserved = Number(item.reserved_quantity ?? 0);
          const available = typeof item.available === "number" ? item.available : quantity - reserved;
          return getPressure(available, quantity) === "critical";
        }).length,
      0,
    ),
    lowStockSkus: warehouses.reduce(
      (sum, warehouse) =>
        sum +
        (warehouse.inventories ?? []).filter((item) => {
          const quantity = Number(item.quantity ?? 0);
          const reserved = Number(item.reserved_quantity ?? 0);
          const available = typeof item.available === "number" ? item.available : quantity - reserved;
          return available < 25;
        }).length,
      0,
    ),
  }), [warehouses]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [warehouseRows, clinicRows, visitRows, planRows] = await Promise.all([
        fetchCollection<Warehouse>("/warehouses"),
        fetchCollection<Clinic>("/clinics"),
        fetchCollection<Visit>("/visits"),
        fetchCollection<TreatmentPlanRef>("/treatment-plans"),
      ]);

      setWarehouses(warehouseRows);
      setClinics(clinicRows);
      setVisits(visitRows);
      setPlans(planRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load warehouses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  useEffect(() => {
    if (!selectedWarehouse) {
      setEditForm(initialForm);
      return;
    }

    setEditForm({
      name: selectedWarehouse.name || "",
      clinic_id: selectedWarehouse.clinic_id ? String(selectedWarehouse.clinic_id) : "",
    });
  }, [selectedWarehouse]);

  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/warehouses", "POST", {
        name: createForm.name,
        clinic_id: Number(createForm.clinic_id),
      });
      setCreateForm(initialForm);
      setNotice("Warehouse created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create warehouse.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWarehouse) return;

    setSavingEdit(true);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson(`/warehouses/${selectedWarehouse.id}`, "PATCH", {
        name: editForm.name,
        clinic_id: Number(editForm.clinic_id),
      });
      setDetailsNotice(`Warehouse "${editForm.name}" updated successfully.`);
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to update warehouse.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteWarehouse(id: number) {
    setDeletingId(id);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await removeResource(`/warehouses/${id}`);
      setDetailsNotice(`Warehouse #${id} deleted successfully.`);
      if (selectedWarehouseId === id) {
        setSelectedWarehouseId(null);
        setDetailsOpen(false);
      }
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to delete warehouse.");
    } finally {
      setDeletingId(null);
    }
  }

  function openWarehouseDetails(id: number) {
    setSelectedWarehouseId(id);
    setSelectedWarehouseView("overview");
    setDetailsError(null);
    setDetailsNotice(null);
    setDetailsOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouses"
        description="Track available versus reserved stock by clinic and see how treatment plans and visit flow are consuming supply capacity."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Warehouses" value={stats.totalWarehouses} hint="Warehouse records currently returned by the API." />
        <StatCard label="Tracked SKUs" value={stats.totalSkus} hint="Inventory lines across all loaded warehouses." />
        <StatCard label="Reserved Units" value={stats.reservedUnits} hint="Units currently reserved by planned or scheduled care." />
        <StatCard label="Critical SKUs" value={stats.criticalSkus} hint="Inventory rows with very low or exhausted available stock." />
        <StatCard label="Below 25 Units" value={stats.lowStockSkus} hint="Inventory rows with fewer than 25 available units." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Warehouse Directory" description="Warehouse records tied to clinics with immediate stock pressure context.">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <WorkflowInput label="Search" name="warehouse-search" value={search} onChange={setSearch} placeholder="Warehouse, clinic, or id" />
            <WorkflowSelect
              label="Clinic"
              value={clinicFilter}
              onChange={setClinicFilter}
              options={[{ label: "All clinics", value: "all" }, ...warehouses.map((warehouse) => ({ label: warehouse.clinic?.name || warehouse.name, value: String(warehouse.clinic_id ?? "") }))]}
              allowEmpty={false}
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading warehouses...</div>
          ) : (
            <div className="space-y-4">
              {filteredWarehouses.map((warehouse) => {
                const inventoryCount = warehouse.inventories?.length ?? 0;
                const reservedUnits = (warehouse.inventories ?? []).reduce((sum, item) => sum + Number(item.reserved_quantity ?? 0), 0);
                return (
                  <button key={warehouse.id} type="button" onClick={() => openWarehouseDetails(warehouse.id)} className={`w-full rounded-lg border p-4 text-left transition ${selectedWarehouse?.id === warehouse.id ? "border-slate-300 bg-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300 hover:bg-white"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{warehouse.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{warehouse.clinic?.name || `Clinic #${warehouse.clinic_id ?? "-"}`}</div>
                      </div>
                      <div className="text-xs text-slate-500">#{warehouse.id}</div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                      <div>Inventory Lines: {inventoryCount}</div>
                      <div>Reserved Units: {reservedUnits}</div>
                    </div>
                  </button>
                );
              })}
              {filteredWarehouses.length === 0 ? <div className="text-sm text-slate-500">No warehouses match the current filters.</div> : null}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Warehouse" description="Only medication-enabled clinics without a warehouse are available here.">
            <form className="space-y-4" onSubmit={createWarehouse}>
              <WorkflowInput label="Warehouse Name" name="create-warehouse-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} required />
              <WorkflowSelect label="Clinic" value={createForm.clinic_id} onChange={(value) => setCreateForm((current) => ({ ...current, clinic_id: value }))} options={eligibleCreateClinics.map((clinic) => ({ label: clinic.name, value: String(clinic.id) }))} required emptyLabel="Select clinic" />
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create Warehouse"}
              </button>
            </form>
          </Panel>

        </div>
      </div>

      {detailsOpen && selectedWarehouse ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{selectedWarehouse.name}</div>
                <div className="mt-1 text-sm text-slate-600">{selectedWarehouse.clinic?.name || "No clinic linked"}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="border-b border-[var(--line)] px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "overview", label: "Overview" },
                  { key: "inventory", label: "Stock" },
                  { key: "demand", label: "Links" },
                  { key: "settings", label: "Settings" },
                ].map((tab) => {
                  const active = selectedWarehouseView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedWarehouseView(tab.key as WarehouseDetailsView)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-slate-900 text-white" : "border border-[var(--line)] bg-white text-slate-700 hover:bg-slate-50"}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[calc(90vh-132px)] overflow-y-auto px-5 py-5">
              {detailsError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{detailsError}</div> : null}
              {detailsNotice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{detailsNotice}</div> : null}
              {selectedWarehouseView === "overview" ? (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Inventory Lines" value={selectedWarehouse.inventories?.length ?? 0} hint="Tracked SKUs on this warehouse." />
                    <StatCard label="Reserved Units" value={(selectedWarehouse.inventories ?? []).reduce((sum, item) => sum + Number(item.reserved_quantity ?? 0), 0)} hint="Units already reserved." />
                    <StatCard label="Related Visits" value={relatedVisits.length} hint="Visits tied to this clinic." />
                    <StatCard label="Treatment Plans" value={relatedPlans.length} hint="Plans tied to this clinic." />
                  </div>
                  <Panel title="Warehouse Profile" description="Quick reference for the linked clinic and current warehouse role.">
                    <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                      <div>Name: {selectedWarehouse.name}</div>
                      <div>Clinic: {selectedWarehouse.clinic?.name || "Not linked"}</div>
                      <div>Inventory rows: {selectedWarehouse.inventories?.length ?? 0}</div>
                      <div>Low-stock threshold: 25 units</div>
                    </div>
                  </Panel>
                </div>
              ) : null}

              {selectedWarehouseView === "settings" ? (
                <div className="space-y-5">
                <Panel title="Warehouse Settings" description="Rename the warehouse or move it between eligible clinics.">
                  <form className="space-y-4" onSubmit={updateWarehouse}>
                    <WorkflowInput label="Warehouse Name" name="edit-warehouse-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} required />
                    <WorkflowSelect label="Clinic" value={editForm.clinic_id} onChange={(value) => setEditForm((current) => ({ ...current, clinic_id: value }))} options={eligibleEditClinics.map((clinic) => ({ label: clinic.name, value: String(clinic.id) }))} required emptyLabel="Select clinic" />
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingEdit ? "Saving..." : "Save Changes"}
                      </button>
                      <button type="button" onClick={() => void deleteWarehouse(selectedWarehouse.id)} disabled={deletingId === selectedWarehouse.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                        {deletingId === selectedWarehouse.id ? "Deleting..." : "Delete Warehouse"}
                      </button>
                    </div>
                  </form>
                </Panel>
                </div>
              ) : null}

              {selectedWarehouseView === "inventory" ? (
                <div className="space-y-5">
                <Panel title="Stock Health" description="Available versus reserved stock for the selected warehouse.">
                  <div className="space-y-3">
                    {pressureRows.map((row) => (
                      <div key={row.sku} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-950">{row.name}</div>
                            <div className="mt-1 text-xs text-slate-500">{row.sku}</div>
                          </div>
                          <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.pressure === "critical" ? "bg-rose-100 text-rose-700" : row.pressure === "watch" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {row.pressure}
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                          <div>Total: {row.quantity}</div>
                          <div>Reserved: {row.reserved}</div>
                          <div>Available: {row.available}</div>
                        </div>
                        {row.available < 25 ? (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                            Warning: available stock dropped below 25 units.
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {pressureRows.length === 0 ? <div className="text-sm text-slate-500">No inventory rows on this warehouse yet.</div> : null}
                  </div>
                </Panel>
                </div>
              ) : null}

              {selectedWarehouseView === "demand" ? (
                <div className="space-y-5">
                <Panel title="Linked Work" description="Visits and treatment plans currently drawing against this warehouse.">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                      <div className="text-sm font-semibold text-slate-950">Related Visits</div>
                      <div className="mt-3 space-y-3">
                        {relatedVisits.slice(0, 6).map((visit) => (
                          <div key={visit.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-slate-900">{visit.lead?.name || visit.lead?.profile_name || `Lead #${visit.lead_id}`}</div>
                              <div className="text-xs text-slate-500">{visit.status || "-"}</div>
                            </div>
                            <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                              <div>{visit.visit_number || `Visit #${visit.id}`}</div>
                              <div>{formatLocalDateTime(visit.scheduled_date || visit.visit_date)}</div>
                            </div>
                          </div>
                        ))}
                        {relatedVisits.length === 0 ? <div className="text-sm text-slate-500">No visits currently tied to this clinic warehouse.</div> : null}
                      </div>
                    </div>

                    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                      <div className="text-sm font-semibold text-slate-950">Related Treatment Plans</div>
                      <div className="mt-3 space-y-3">
                        {relatedPlans.slice(0, 6).map((plan) => (
                          <div key={plan.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-slate-900">{plan.lead?.name || plan.lead?.profile_name || `Lead #${plan.lead_id}`}</div>
                              <div className="text-xs text-slate-500">{plan.status || "-"}</div>
                            </div>
                            <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                              <div>Plan #{plan.id}</div>
                              <div>{plan.total_visits ?? 0} planned visits</div>
                            </div>
                          </div>
                        ))}
                        {relatedPlans.length === 0 ? <div className="text-sm text-slate-500">No treatment plans currently tied to this clinic warehouse.</div> : null}
                      </div>
                    </div>
                  </div>
                </Panel>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
