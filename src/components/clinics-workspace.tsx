"use client";

import { FormEvent, type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { fetchCollection, fetchResource, mutateJson, removeResource } from "@/lib/api";
import type { Clinic, User, Warehouse } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { WorkflowTextarea } from "@/components/workflow-textarea";
import { StatCard } from "@/components/stat-card";
import { PaginationControls } from "@/components/pagination-controls";

type ServiceRow = {
  name: string;
  cost: string;
};

type ClinicForm = {
  name: string;
  arabic_name: string;
  phone_number: string;
  address: string;
  provides_medication: boolean;
  departments: string;
  services: ServiceRow[];
  doctors: number[];
  warehouse_id: string;
};

type PaginatedResponse<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

const initialForm: ClinicForm = {
  name: "",
  arabic_name: "",
  phone_number: "",
  address: "",
  provides_medication: true,
  departments: "",
  services: [{ name: "", cost: "0" }],
  doctors: [],
  warehouse_id: "",
};

const CLINICS_PAGE_SIZE = 10;
const CLINIC_PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;
const CLINIC_NAME_PATTERN = /^(?=.*[A-Za-z0-9])[A-Za-z0-9&().,'/\-\s]+$/;

function toList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toText(values?: string[] | null) {
  return (values || []).join("\n");
}

function normalizeServices(values?: unknown[] | null): ServiceRow[] {
  const normalized = (values || [])
    .map((service) => {
      if (typeof service === "string") {
        const name = service.trim();
        return name ? { name, cost: "0" } : null;
      }

      if (service && typeof service === "object") {
        const record = service as { name?: string; label?: string; title?: string; cost?: number | string };
        const name = (record.name || record.label || record.title || "").trim();
        if (!name) {
          return null;
        }

        return {
          name,
          cost: String(record.cost ?? 0),
        };
      }

      return null;
    })
    .filter((service): service is ServiceRow => Boolean(service));

  return normalized.length > 0 ? normalized : [{ name: "", cost: "0" }];
}

function toForm(clinic?: Clinic | null): ClinicForm {
  if (!clinic) {
    return initialForm;
  }

  return {
    name: clinic.name || "",
    arabic_name: clinic.arabic_name || "",
    phone_number: clinic.phone_number || "",
    address: clinic.address || "",
    provides_medication: clinic.provides_medication ?? true,
    departments: toText(clinic.departments),
    services: normalizeServices(clinic.services as unknown[] | null | undefined),
    doctors: clinic.doctors || [],
    warehouse_id: clinic.warehouse?.id ? String(clinic.warehouse.id) : "",
  };
}

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function buildClinicPayload(form: ClinicForm, includeWarehouse: boolean) {
  const payload: Record<string, string | boolean | number[] | string[] | { name: string; cost: number }[] | number | null> = {
    name: form.name,
    arabic_name: form.arabic_name,
    phone_number: form.phone_number,
    address: form.address,
    provides_medication: form.provides_medication,
    departments: toList(form.departments),
    services: form.services
      .map((service) => ({
        name: service.name.trim(),
        cost: Number(service.cost || 0),
      }))
      .filter((service) => service.name),
    doctors: form.doctors,
  };

  if (includeWarehouse) {
    payload.warehouse_id = form.warehouse_id ? Number(form.warehouse_id) : null;
  }

  return payload;
}

function validateClinicForm(form: ClinicForm) {
  const name = form.name.trim();
  const phone = form.phone_number.trim();

  if (name.length < 2) {
    return "Clinic name must be at least 2 characters.";
  }

  if (!CLINIC_NAME_PATTERN.test(name)) {
    return "Clinic name may only contain letters, numbers, spaces, and basic punctuation.";
  }

  if (!CLINIC_PHONE_PATTERN.test(phone)) {
    return "Phone number must contain only digits and standard phone symbols.";
  }

  return null;
}

function buildSearchPath(search: string) {
  const term = search.trim();
  return term ? `/clinics?search=${encodeURIComponent(term)}` : "/clinics";
}

export function ClinicsWorkspace() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<ClinicForm>(initialForm);
  const [editForm, setEditForm] = useState<ClinicForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const [clinicPage, setClinicPage] = useState(1);
  const [clinicTotalPages, setClinicTotalPages] = useState(1);
  const [clinicTotalItems, setClinicTotalItems] = useState(0);
  const skipSearchFetchRef = useRef(true);

  const selectedClinic = useMemo(() => clinics.find((clinic) => clinic.id === selectedId) ?? null, [clinics, selectedId]);
  const paginatedClinics = useMemo(() => clinics, [clinics]);

  const doctorOptions = useMemo(
    () => users.map((user) => ({ id: user.id, label: user.name || user.email })),
    [users],
  );

  const availableWarehouses = useMemo(
    () =>
      warehouses.filter(
        (warehouse) =>
          !warehouse.clinic?.id || warehouse.clinic.id === selectedClinic?.id,
      ),
    [selectedClinic?.id, warehouses],
  );

  const stats = useMemo(
    () => ({
      total: clinics.length,
      withMedication: clinics.filter((clinic) => clinic.provides_medication).length,
      linkedWarehouses: clinics.filter((clinic) => clinic.warehouse?.id).length,
      staffed: clinics.filter((clinic) => (clinic.doctors || []).length > 0).length,
    }),
    [clinics],
  );

  async function loadClinics(searchTerm = search, page = 1, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const separator = buildSearchPath(searchTerm).includes("?") ? "&" : "?";
      const clinicPayload = await fetchResource<PaginatedResponse<Clinic>>(`${buildSearchPath(searchTerm)}${separator}page=${page}&per_page=${CLINICS_PAGE_SIZE}`);
      setClinics(clinicPayload.data);
      setClinicPage(clinicPayload.current_page);
      setClinicTotalPages(Math.max(1, clinicPayload.last_page));
      setClinicTotalItems(clinicPayload.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load clinics.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  async function loadLookups() {
    try {
      const [userPayload, warehousePayload] = await Promise.all([
        fetchResource<PaginatedResponse<User>>(`/users?page=1&per_page=100`),
        fetchCollection<Warehouse>("/warehouses"),
      ]);
      setUsers(userPayload.data);
      setWarehouses(warehousePayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load clinics.");
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void Promise.all([loadClinics("", 1), loadLookups()]);
    });
  }, []);

  useEffect(() => {
    setEditForm(toForm(selectedClinic));
  }, [selectedClinic]);

  useEffect(() => {
    if (skipSearchFetchRef.current) {
      skipSearchFetchRef.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadClinics(search, 1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!createForm.provides_medication && createForm.warehouse_id) {
      setCreateForm((current) => ({ ...current, warehouse_id: "" }));
    }
  }, [createForm.provides_medication, createForm.warehouse_id]);

  useEffect(() => {
    if (!editForm.provides_medication && editForm.warehouse_id) {
      setEditForm((current) => ({ ...current, warehouse_id: "" }));
    }
  }, [editForm.provides_medication, editForm.warehouse_id]);

  async function createClinic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateClinicForm(createForm);
    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }

    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson<Clinic>("/clinics", "POST", buildClinicPayload(createForm, false));
      setCreateForm(initialForm);
      setNotice("Clinic created successfully.");
      await loadClinics(search, clinicPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create clinic.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateClinic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClinic) {
      return;
    }

    const validationError = validateClinicForm(editForm);
    if (validationError) {
      setDetailsError(validationError);
      setDetailsNotice(null);
      return;
    }

    setSavingEdit(true);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson<Clinic>(`/clinics/${selectedClinic.id}`, "PATCH", buildClinicPayload(editForm, true));
      setDetailsNotice(`Clinic "${editForm.name}" updated successfully.`);
      await loadClinics(search, clinicPage);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to update clinic.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteClinic(clinicId: number) {
    setDeletingId(clinicId);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await removeResource(`/clinics/${clinicId}`);
      setDetailsNotice(`Clinic #${clinicId} deleted successfully.`);
      if (selectedId === clinicId) {
        setSelectedId(null);
        setDetailsOpen(false);
      }
      await loadClinics(search, clinicPage);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to delete clinic.");
    } finally {
      setDeletingId(null);
    }
  }

  function renderDoctorPicker(form: ClinicForm, setForm: Dispatch<SetStateAction<ClinicForm>>) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-slate-700">Assigned Doctors</div>
        <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto">
          {doctorOptions.map((doctor) => {
            const active = form.doctors.includes(doctor.id);
            return (
              <button
                key={doctor.id}
                type="button"
                onClick={() => setForm((current) => ({ ...current, doctors: toggleId(current.doctors, doctor.id) }))}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {doctor.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderServiceEditor(form: ClinicForm, setForm: Dispatch<SetStateAction<ClinicForm>>) {
    function updateService(index: number, patch: Partial<ServiceRow>) {
      setForm((current) => ({
        ...current,
        services: current.services.map((service, serviceIndex) =>
          serviceIndex === index ? { ...service, ...patch } : service,
        ),
      }));
    }

    function addService() {
      setForm((current) => ({
        ...current,
        services: [...current.services, { name: "", cost: "0" }],
      }));
    }

    function removeService(index: number) {
      setForm((current) => ({
        ...current,
        services: current.services.filter((_, serviceIndex) => serviceIndex !== index).length > 0
          ? current.services.filter((_, serviceIndex) => serviceIndex !== index)
          : [{ name: "", cost: "0" }],
      }));
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-slate-700">Services</div>
          <button type="button" onClick={addService} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
            Add Service
          </button>
        </div>
        <div className="space-y-3">
          {form.services.map((service, index) => (
            <div key={`service-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                <WorkflowInput
                  label="Service Name"
                  name={`service-name-${index}`}
                  value={service.name}
                  onChange={(value) => updateService(index, { name: value })}
                  placeholder="Examination, cleaning, consultation..."
                />
                <WorkflowInput
                  label="Cost"
                  name={`service-cost-${index}`}
                  type="number"
                  value={service.cost}
                  onChange={(value) => updateService(index, { cost: value })}
                />
                <div className="flex items-end">
                  <button type="button" onClick={() => removeService(index)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 md:w-auto">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function openClinicDetails(id: number) {
    setSelectedId(id);
    setDetailsError(null);
    setDetailsNotice(null);
    setDetailsOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinics"
        description="Maintain clinic master data, services, staffing, and warehouse linkage so the rest of the workflow has a clean operational backbone."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Clinics" value={stats.total} hint="Clinic records returned by the API." />
        <StatCard label="Medication Ready" value={stats.withMedication} hint="Branches marked as providing medication." />
        <StatCard label="Linked Warehouses" value={stats.linkedWarehouses} hint="Clinics already attached to a warehouse." />
        <StatCard label="Staffed Clinics" value={stats.staffed} hint="Clinics with at least one assigned doctor user id." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Clinic List" description="Search branches, then open a focused popup to manage staffing, services, and warehouse linkage.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="clinic-search" value={search} onChange={setSearch} placeholder="Name, phone, address, service, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading clinics...</div>
          ) : (
            <div className="space-y-3">
              {paginatedClinics.map((clinic) => {
                const active = selectedClinic?.id === clinic.id;
                return (
                  <button
                    key={clinic.id}
                    type="button"
                    onClick={() => openClinicDetails(clinic.id)}
                    className={`w-full rounded-lg border p-4 text-left transition ${active ? "border-slate-300 bg-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300 hover:bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{clinic.name}</div>
                        <div className="mt-1 text-sm text-slate-600">{clinic.arabic_name || clinic.phone_number || clinic.address || "No contact details yet"}</div>
                      </div>
                      <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${clinic.provides_medication ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {clinic.provides_medication ? "Medication" : "Services Only"}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      {clinic.provides_medication ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                          Warehouse: {clinic.warehouse?.name || "Not linked"}
                        </span>
                      ) : null}
                      {normalizeServices(clinic.services as unknown[] | null | undefined).slice(0, 4).map((service) => (
                        <span key={`${clinic.id}-${service.name}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                          {service.name} {Number(service.cost) > 0 ? `(${service.cost})` : ""}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
              <PaginationControls
                page={clinicPage}
                totalPages={clinicTotalPages}
                totalItems={clinicTotalItems}
                pageSize={CLINICS_PAGE_SIZE}
                itemLabel="clinics"
                onPageChange={(page) => void loadClinics(search, page)}
              />
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Clinic" description="Set up branch details, departments, and available services.">
            <form className="space-y-4" onSubmit={createClinic}>
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowInput label="Name" name="create-clinic-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} placeholder="Clinic name" required />
                <WorkflowInput label="Arabic Name" name="create-clinic-arabic-name" value={createForm.arabic_name} onChange={(value) => setCreateForm((current) => ({ ...current, arabic_name: value }))} required />
                <WorkflowInput label="Phone" name="create-clinic-phone" value={createForm.phone_number} onChange={(value) => setCreateForm((current) => ({ ...current, phone_number: value }))} placeholder="+20 10..." required />
                <WorkflowSelect label="Medication Support" value={createForm.provides_medication ? "true" : "false"} onChange={(value) => setCreateForm((current) => ({ ...current, provides_medication: value === "true" }))} options={[{ label: "Provides medication", value: "true" }, { label: "Services only", value: "false" }]} required />
              </div>
              <WorkflowTextarea label="Address" value={createForm.address} onChange={(value) => setCreateForm((current) => ({ ...current, address: value }))} placeholder="Street, district, and any branch notes" />
              <WorkflowTextarea label="Departments" value={createForm.departments} onChange={(value) => setCreateForm((current) => ({ ...current, departments: value }))} placeholder="One per line or comma separated" />
              {renderServiceEditor(createForm, setCreateForm)}
              {renderDoctorPicker(createForm, setCreateForm)}
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create Clinic"}
              </button>
            </form>
          </Panel>
        </div>
      </div>

      {detailsOpen && selectedClinic ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{selectedClinic.name}</div>
                <div className="mt-1 text-sm text-slate-600">{selectedClinic.arabic_name || selectedClinic.address || "No address set"}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Warehouse: {selectedClinic.provides_medication ? selectedClinic.warehouse?.name || "Not linked" : "Not applicable for services-only clinics"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-5 py-5">
              {detailsError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{detailsError}</div> : null}
              {detailsNotice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{detailsNotice}</div> : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Doctors" value={selectedClinic.doctors?.length ?? 0} hint="Assigned doctor user ids." />
                <StatCard label="Departments" value={selectedClinic.departments?.length ?? 0} hint="Configured departments." />
                <StatCard label="Services" value={selectedClinic.services?.length ?? 0} hint="Configured services." />
                <StatCard label="Warehouse" value={selectedClinic.provides_medication ? selectedClinic.warehouse?.name || "None" : "N/A"} hint="Linked warehouse state." />
              </div>

              <div className="mt-5">
                <Panel title="Clinic Details" description="Adjust branch details, staffing, and warehouse linkage without leaving the list view.">
                  <form className="space-y-4" onSubmit={updateClinic}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <WorkflowInput label="Name" name="edit-clinic-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} placeholder="Clinic name" required />
                      <WorkflowInput label="Arabic Name" name="edit-clinic-arabic-name" value={editForm.arabic_name} onChange={(value) => setEditForm((current) => ({ ...current, arabic_name: value }))} required />
                      <WorkflowInput label="Phone" name="edit-clinic-phone" value={editForm.phone_number} onChange={(value) => setEditForm((current) => ({ ...current, phone_number: value }))} placeholder="+20 10..." required />
                      <WorkflowSelect label="Medication Support" value={editForm.provides_medication ? "true" : "false"} onChange={(value) => setEditForm((current) => ({ ...current, provides_medication: value === "true" }))} options={[{ label: "Provides medication", value: "true" }, { label: "Services only", value: "false" }]} required />
                      <WorkflowSelect label="Warehouse" value={editForm.warehouse_id} onChange={(value) => setEditForm((current) => ({ ...current, warehouse_id: value }))} options={availableWarehouses.map((warehouse) => ({ label: warehouse.name, value: String(warehouse.id) }))} emptyLabel="No warehouse" />
                    </div>
                    {!editForm.provides_medication ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Services-only clinics cannot keep a warehouse. Any linked warehouse will be removed when you save.
                      </div>
                    ) : null}
                    <WorkflowTextarea label="Address" value={editForm.address} onChange={(value) => setEditForm((current) => ({ ...current, address: value }))} />
                    <WorkflowTextarea label="Departments" value={editForm.departments} onChange={(value) => setEditForm((current) => ({ ...current, departments: value }))} placeholder="One per line or comma separated" />
                    {renderServiceEditor(editForm, setEditForm)}
                    {renderDoctorPicker(editForm, setEditForm)}
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingEdit ? "Saving..." : "Save Changes"}
                      </button>
                      <button type="button" onClick={() => void deleteClinic(selectedClinic.id)} disabled={deletingId === selectedClinic.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                        {deletingId === selectedClinic.id ? "Deleting..." : "Delete Clinic"}
                      </button>
                    </div>
                  </form>
                </Panel>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
