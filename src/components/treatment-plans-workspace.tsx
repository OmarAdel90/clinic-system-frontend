"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Clinic, Lead, Pharmaceutical, SupplyLine, TreatmentPlanRef, User, Visit, Warehouse, WarehouseInventory } from "@/lib/types";
import { formatLocalDateTime, formatRelativeDateLabel, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowTextarea } from "@/components/workflow-textarea";
import { WorkflowSelect } from "@/components/workflow-select";
import { StatCard } from "@/components/stat-card";
import { PaginationControls } from "@/components/pagination-controls";

type SupplyForm = {
  sku: string;
  name: string;
  quantity: string;
  unit_price: string;
};

type PlanVisitForm = {
  scheduled_date: string;
  service_name: string;
  service_cost: string;
  supplies_reserved: SupplyForm[];
};

type TreatmentPlanForm = {
  lead_id: string;
  user_id: string;
  clinic_id: string;
  diagnosis: string;
  notes: string;
  visits: PlanVisitForm[];
};

type VisitForm = {
  scheduled_date: string;
  status: string;
  visit_number: string;
  service_name: string;
  service_cost: string;
  supplies_reserved: SupplyForm[];
};

type PlanEditForm = {
  lead_id: string;
  user_id: string;
  clinic_id: string;
  diagnosis: string;
  notes: string;
};

type CompleteForm = {
  diagnosis: string;
  treatment_notes: string;
  body: string;
  supplies_used: SupplyForm[];
};

type SearchableOption = {
  label: string;
  value: string;
};

type TreatmentPlanView = "overview" | "visits" | "edit" | "add-visit" | "actions";
const TREATMENT_PLANS_PAGE_SIZE = 8;
const PLAN_VISITS_PAGE_SIZE = 4;

const initialSupplyForm: SupplyForm = {
  sku: "",
  name: "",
  quantity: "1",
  unit_price: "0",
};

const initialPlanVisitForm: PlanVisitForm = {
  scheduled_date: "",
  service_name: "",
  service_cost: "0",
  supplies_reserved: [],
};

const initialForm: TreatmentPlanForm = {
  lead_id: "",
  user_id: "",
  clinic_id: "",
  diagnosis: "",
  notes: "",
  visits: [initialPlanVisitForm],
};

const initialVisitForm: VisitForm = {
  scheduled_date: "",
  status: "scheduled",
  visit_number: "",
  service_name: "",
  service_cost: "0",
  supplies_reserved: [],
};

const initialPlanEditForm: PlanEditForm = {
  lead_id: "",
  user_id: "",
  clinic_id: "",
  diagnosis: "",
  notes: "",
};

const initialCompleteForm: CompleteForm = {
  diagnosis: "",
  treatment_notes: "",
  body: "",
  supplies_used: [],
};

function toSupplyLines(rows: SupplyForm[]): SupplyLine[] {
  return rows
    .filter((row) => row.sku.trim() && row.quantity.trim())
    .map((row) => ({
      sku: row.sku.trim(),
      name: row.name.trim() || row.sku.trim(),
      quantity: Number(row.quantity || 0),
      unit_price: Number(row.unit_price || 0),
    }));
}

function toVisitFormForPlan(plan?: TreatmentPlanRef | null): VisitForm {
  return {
    scheduled_date: "",
    status: "scheduled",
    visit_number: plan?.visits?.length ? `V${plan.visits.length + 1}` : "",
    service_name: "",
    service_cost: "0",
    supplies_reserved: [],
  };
}

function toVisitEditForm(visit?: Visit | null): VisitForm {
  return {
    scheduled_date: visit?.scheduled_date ? String(visit.scheduled_date).slice(0, 16) : "",
    status: visit?.status || "scheduled",
    visit_number: visit?.visit_number ? String(visit.visit_number) : "",
    service_name: String((visit as Visit & { service_name?: string | null }).service_name ?? ""),
    service_cost: String((visit as Visit & { service_cost?: number | null }).service_cost ?? visit?.services_cost ?? 0),
    supplies_reserved: (visit?.supplies_reserved ?? []).map((row) => ({
      sku: row.sku || "",
      name: row.name || "",
      quantity: String(row.quantity ?? 1),
      unit_price: String(row.unit_price ?? 0),
    })),
  };
}

function getVisitTotal(visit: Visit) {
  if (visit.total_cost != null) {
    return visit.total_cost;
  }

  const serviceCost = Number((visit as Visit & { service_cost?: number | null }).service_cost ?? visit.services_cost ?? 0);
  const reserved = visit.supplies_reserved ?? [];
  return reserved.reduce((sum, row) => sum + Number(row.quantity ?? 0) * Number(row.unit_price ?? 0), serviceCost);
}

type ClinicServiceOption = {
  name: string;
  cost: number;
};

function normalizeClinicServices(clinic?: Clinic | null): ClinicServiceOption[] {
  const rawServices = (clinic as Clinic & { services?: unknown[] | null })?.services;
  if (!Array.isArray(rawServices)) {
    return [];
  }

  return rawServices
    .map((item) => {
      if (typeof item === "string") {
        return {
          name: item,
          cost: 0,
        };
      }

      if (item && typeof item === "object") {
        const record = item as { name?: string; label?: string; title?: string; cost?: number | string };
        const name = record.name || record.label || record.title || "";
        if (!name) {
          return null;
        }

        return {
          name,
          cost: Number(record.cost ?? 0),
        };
      }

      return null;
    })
    .filter((item): item is ClinicServiceOption => Boolean(item?.name));
}

function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
}) {
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState(selectedOption?.label ?? value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selectedOption?.label ?? value);
  }, [selectedOption?.label, value]);

  const filteredOptions = options
    .filter((option) => {
      const term = query.trim().toLowerCase();
      if (!term) {
        return true;
      }

      return option.label.toLowerCase().includes(term) || option.value.toLowerCase().includes(term);
    })
    .slice(0, 10);

  function selectOption(option: SearchableOption) {
    setQuery(option.label);
    onChange(option.value);
    setOpen(false);
  }

  function syncTypedValue(nextValue: string) {
    setQuery(nextValue);
    setOpen(true);

    const exact = options.find(
      (option) =>
        option.value.toLowerCase() === nextValue.trim().toLowerCase() ||
        option.label.toLowerCase() === nextValue.trim().toLowerCase(),
    );

    if (exact) {
      onChange(exact.value);
      return;
    }

    if (!nextValue.trim()) {
      onChange("");
    }
  }

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input
          value={query}
          onChange={(event) => syncTypedValue(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false);
              if (!value) {
                return;
              }

              const selected = options.find((option) => option.value === value);
              if (selected) {
                setQuery(selected.label);
              }
            }, 120);
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-900 outline-none transition focus:border-slate-400"
        />
        {open && filteredOptions.length > 0 ? (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-slate-50"
              >
                <div className="break-words leading-5">{option.label}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function TreatmentPlansWorkspace() {
  const [plans, setPlans] = useState<TreatmentPlanRef[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [pharmaceuticals, setPharmaceuticals] = useState<Pharmaceutical[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [form, setForm] = useState<TreatmentPlanForm>(initialForm);
  const [planEditForm, setPlanEditForm] = useState<PlanEditForm>(initialPlanEditForm);
  const [visitForm, setVisitForm] = useState<VisitForm>(initialVisitForm);
  const [editVisitForms, setEditVisitForms] = useState<Record<number, VisitForm>>({});
  const [completeForms, setCompleteForms] = useState<Record<number, CompleteForm>>({});
  const [search, setSearch] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPlanView, setSelectedPlanView] = useState<TreatmentPlanView>("overview");
  const [saving, setSaving] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingVisit, setSavingVisit] = useState(false);
  const [savingExistingVisitId, setSavingExistingVisitId] = useState<number | null>(null);
  const [activeVisit, setActiveVisit] = useState<number | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createPlanError, setCreatePlanError] = useState<string | null>(null);
  const [planEditError, setPlanEditError] = useState<string | null>(null);
  const [addVisitError, setAddVisitError] = useState<string | null>(null);
  const [visitEditErrors, setVisitEditErrors] = useState<Record<number, string | null>>({});
  const [planPage, setPlanPage] = useState(1);
  const [planVisitPage, setPlanVisitPage] = useState(1);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);

  const filteredPlans = useMemo(() => {
    const term = search.trim().toLowerCase();

    return plans.filter((plan) => {
      const leadName = plan.lead?.name || plan.lead?.profile_name || "";
      const clinicName = plan.clinic?.name || "";
      const userName = plan.user?.name || "";
      return (
        !term ||
        [leadName, clinicName, userName, plan.diagnosis, plan.notes, String(plan.id), plan.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      );
    });
  }, [plans, search]);
  const planTotalPages = Math.max(1, Math.ceil(filteredPlans.length / TREATMENT_PLANS_PAGE_SIZE));
  const paginatedPlans = useMemo(
    () => filteredPlans.slice((planPage - 1) * TREATMENT_PLANS_PAGE_SIZE, planPage * TREATMENT_PLANS_PAGE_SIZE),
    [filteredPlans, planPage],
  );

  const selectedPlan = useMemo(
    () =>
      filteredPlans.find((plan) => plan.id === selectedPlanId) ??
      plans.find((plan) => plan.id === selectedPlanId) ??
      filteredPlans[0] ??
      plans[0] ??
      null,
    [filteredPlans, plans, selectedPlanId],
  );
  const planVisits = selectedPlan?.visits ?? [];
  const planVisitTotalPages = Math.max(1, Math.ceil(planVisits.length / PLAN_VISITS_PAGE_SIZE));
  const paginatedPlanVisits = useMemo(
    () => planVisits.slice((planVisitPage - 1) * PLAN_VISITS_PAGE_SIZE, planVisitPage * PLAN_VISITS_PAGE_SIZE),
    [planVisits, planVisitPage],
  );

  const stats = useMemo(
    () => ({
      total: plans.length,
      active: plans.filter((plan) => plan.status === "active").length,
      completed: plans.filter((plan) => plan.status === "completed").length,
      scheduledVisits: plans.reduce((sum, plan) => sum + (plan.visits?.length ?? 0), 0),
    }),
    [plans],
  );

  const pharmaceuticalOptions = useMemo(
    () =>
      pharmaceuticals.map((item) => ({
        label: `${item.name} (${item.SKU})`,
        value: item.SKU,
      })),
    [pharmaceuticals],
  );

  const pharmaceuticalLookup = useMemo(
    () => new Map(pharmaceuticals.map((item) => [item.SKU, item])),
    [pharmaceuticals],
  );

  const leadOptions = useMemo(
    () =>
      leads.map((lead) => ({
        label: `${lead.name || lead.profile_name || `Lead #${lead.id}`}${lead.phone ? ` (${lead.phone})` : ""}`,
        value: String(lead.id),
      })),
    [leads],
  );

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        label: user.name || user.email || `User #${user.id}`,
        value: String(user.id),
      })),
    [users],
  );

  const clinicOptions = useMemo(
    () =>
      clinics.map((clinic) => ({
        label: `${clinic.name}${clinic.address ? ` - ${clinic.address}` : ""}`,
        value: String(clinic.id),
      })),
    [clinics],
  );

  const selectedClinic = useMemo(
    () => clinics.find((clinic) => String(clinic.id) === form.clinic_id) ?? null,
    [clinics, form.clinic_id],
  );
  const selectedClinicSupportsMedication = Boolean(selectedClinic?.provides_medication);

  const selectedClinicWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.clinic_id === selectedClinic?.id) ?? null,
    [selectedClinic?.id, warehouses],
  );

  const selectedClinicWarehouseOptions = useMemo(() => {
    const inventories = (selectedClinicWarehouse?.inventories ?? []) as WarehouseInventory[];

    return inventories
      .map((row) => {
        const pharmaceutical = pharmaceuticalLookup.get(row.sku);
        const quantity = Number(row.quantity ?? 0);
        const reserved = Number(row.reserved_quantity ?? 0);
        const available = typeof row.available === "number" ? row.available : quantity - reserved;

        if (available <= 0) {
          return null;
        }

        return {
          label: `${pharmaceutical?.name || row.name || row.sku} (${row.sku}) - ${available} available`,
          value: row.sku,
        };
      })
      .filter((item): item is SearchableOption => Boolean(item));
  }, [pharmaceuticalLookup, selectedClinicWarehouse]);

  const selectedClinicServices = useMemo(
    () => normalizeClinicServices(selectedClinic),
    [selectedClinic],
  );

  const selectedClinicServiceOptions = useMemo(
    () =>
      selectedClinicServices.map((service) => ({
        label: service.name,
        value: service.name,
      })),
    [selectedClinicServices],
  );

  const selectedClinicServiceLookup = useMemo(
    () => new Map(selectedClinicServices.map((service) => [service.name, service])),
    [selectedClinicServices],
  );

  const popupClinicServices = useMemo(
    () => normalizeClinicServices(selectedPlan?.clinic ?? null),
    [selectedPlan?.clinic],
  );
  const popupClinicSupportsMedication = Boolean(selectedPlan?.clinic?.provides_medication);

  const popupClinicWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.clinic_id === selectedPlan?.clinic_id) ?? null,
    [selectedPlan?.clinic_id, warehouses],
  );

  const popupClinicWarehouseOptions = useMemo(() => {
    const inventories = (popupClinicWarehouse?.inventories ?? []) as WarehouseInventory[];

    return inventories
      .map((row) => {
        const pharmaceutical = pharmaceuticalLookup.get(row.sku);
        const quantity = Number(row.quantity ?? 0);
        const reserved = Number(row.reserved_quantity ?? 0);
        const available = typeof row.available === "number" ? row.available : quantity - reserved;

        if (available <= 0) {
          return null;
        }

        return {
          label: `${pharmaceutical?.name || row.name || row.sku} (${row.sku}) - ${available} available`,
          value: row.sku,
        };
      })
      .filter((item): item is SearchableOption => Boolean(item));
  }, [pharmaceuticalLookup, popupClinicWarehouse]);

  const popupClinicServiceOptions = useMemo(
    () =>
      popupClinicServices.map((service) => ({
        label: service.name,
        value: service.name,
      })),
    [popupClinicServices],
  );

  const popupClinicServiceLookup = useMemo(
    () => new Map(popupClinicServices.map((service) => [service.name, service])),
    [popupClinicServices],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [planRows, leadRows, userRows, clinicRows, pharmaceuticalRows, warehouseRows] = await Promise.all([
        fetchCollection<TreatmentPlanRef>("/treatment-plans"),
        fetchCollection<Lead>("/leads"),
        fetchCollection<User>("/users"),
        fetchCollection<Clinic>("/clinics"),
        fetchCollection<Pharmaceutical>("/pharmaceuticals"),
        fetchCollection<Warehouse>("/warehouses"),
      ]);

      setPlans(planRows);
      setLeads(leadRows);
      setUsers(userRows);
      setClinics(clinicRows);
      setPharmaceuticals(pharmaceuticalRows);
      setWarehouses(warehouseRows);
      setSelectedPlanId((current) => current ?? planRows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load treatment plans.");
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
    setPlanPage(1);
  }, [search]);

  useEffect(() => {
    if (planPage > planTotalPages) {
      setPlanPage(planTotalPages);
    }
  }, [planPage, planTotalPages]);

  useEffect(() => {
    if (selectedPlan) {
      setVisitForm(toVisitFormForPlan(selectedPlan));
      setPlanEditForm({
        lead_id: selectedPlan.lead_id ? String(selectedPlan.lead_id) : "",
        user_id: selectedPlan.user_id ? String(selectedPlan.user_id) : "",
        clinic_id: selectedPlan.clinic_id ? String(selectedPlan.clinic_id) : "",
        diagnosis: selectedPlan.diagnosis || "",
        notes: selectedPlan.notes || "",
      });
      setEditVisitForms(
        Object.fromEntries((selectedPlan.visits ?? []).map((visit) => [visit.id, toVisitEditForm(visit)])),
      );
      setDetailsError(null);
      setDetailsNotice(null);
    }
  }, [selectedPlan?.id]);

  useEffect(() => {
    setPlanVisitPage(1);
  }, [selectedPlan?.id]);

  useEffect(() => {
    if (planVisitPage > planVisitTotalPages) {
      setPlanVisitPage(planVisitTotalPages);
    }
  }, [planVisitPage, planVisitTotalPages]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    setCreatePlanError(null);

    try {
      await mutateJson("/treatment-plans", "POST", {
        lead_id: Number(form.lead_id),
        user_id: Number(form.user_id),
        clinic_id: Number(form.clinic_id),
        diagnosis: form.diagnosis || null,
        notes: form.notes || null,
        visits: form.visits.map((visit) => ({
          scheduled_date: visit.scheduled_date,
          service_name: visit.service_name || null,
          service_cost: Number(visit.service_cost || 0),
          supplies_reserved: toSupplyLines(visit.supplies_reserved),
        })),
      });
      setForm(initialForm);
      setNotice("Treatment plan created successfully.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create treatment plan.";
      setCreatePlanError(message);
    } finally {
      setSaving(false);
    }
  }

  async function createVisitForPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan) {
      return;
    }

    setSavingVisit(true);
    setError(null);
    setNotice(null);
    setAddVisitError(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson("/visits", "POST", {
        lead_id: Number(selectedPlan.lead_id),
        user_id: Number(selectedPlan.user_id),
        clinic_id: Number(selectedPlan.clinic_id),
        treatment_plan_id: Number(selectedPlan.id),
        visit_number: visitForm.visit_number || null,
        visit_date: visitForm.scheduled_date,
        status: visitForm.status,
        service_name: visitForm.service_name || null,
        service_cost: Number(visitForm.service_cost || 0),
        supplies_reserved: toSupplyLines(visitForm.supplies_reserved),
      });
      setVisitForm(toVisitFormForPlan(selectedPlan));
      setDetailsNotice(`Visit added to plan #${selectedPlan.id}.`);
      await load();
      setDetailsOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create visit for plan.";
      setAddVisitError(message);
    } finally {
      setSavingVisit(false);
    }
  }

  async function updateSelectedPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan) {
      return;
    }

    setSavingPlan(true);
    setError(null);
    setNotice(null);
    setPlanEditError(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson(`/treatment-plans/${selectedPlan.id}`, "PATCH", {
        lead_id: Number(planEditForm.lead_id),
        user_id: Number(planEditForm.user_id),
        clinic_id: Number(planEditForm.clinic_id),
        diagnosis: planEditForm.diagnosis || null,
        notes: planEditForm.notes || null,
      });
      setDetailsNotice(`Treatment plan #${selectedPlan.id} updated successfully.`);
      await load();
      setDetailsOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update treatment plan.";
      setPlanEditError(message);
    } finally {
      setSavingPlan(false);
    }
  }

  function addPlanVisit() {
    setForm((current) => ({
      ...current,
      visits: [...current.visits, initialPlanVisitForm],
    }));
  }

  function removePlanVisit(index: number) {
    setForm((current) => ({
      ...current,
      visits: current.visits.filter((_, visitIndex) => visitIndex !== index),
    }));
  }

  function updatePlanVisit(index: number, field: keyof PlanVisitForm, value: string | SupplyForm[]) {
    setForm((current) => ({
      ...current,
      visits: current.visits.map((visit, visitIndex) =>
        visitIndex === index ? { ...visit, [field]: value } : visit,
      ),
    }));
  }

  function selectClinic(clinicId: string) {
    const clinic = clinics.find((item) => String(item.id) === clinicId) ?? null;
    const allowedServices = new Set(normalizeClinicServices(clinic).map((service) => service.name));
    const supportsMedication = Boolean(clinic?.provides_medication);

    setForm((current) => ({
      ...current,
      clinic_id: clinicId,
      visits: current.visits.map((visit) =>
        visit.service_name && !allowedServices.has(visit.service_name)
          ? { ...visit, service_name: "", service_cost: "0", supplies_reserved: supportsMedication ? visit.supplies_reserved : [] }
          : { ...visit, supplies_reserved: supportsMedication ? visit.supplies_reserved : [] },
      ),
    }));
  }

  function selectPlanVisitService(visitIndex: number, serviceName: string) {
    const service = selectedClinicServiceLookup.get(serviceName);
    setForm((current) => ({
      ...current,
      visits: current.visits.map((visit, index) =>
        index === visitIndex
          ? {
              ...visit,
              service_name: serviceName,
              service_cost: String(service?.cost ?? 0),
            }
          : visit,
      ),
    }));
  }

  function addSupplyRow(visitIndex: number) {
    const visit = form.visits[visitIndex];
    updatePlanVisit(visitIndex, "supplies_reserved", [...visit.supplies_reserved, initialSupplyForm]);
  }

  function updateSupplyRow(visitIndex: number, rowIndex: number, field: keyof SupplyForm, value: string) {
    const visit = form.visits[visitIndex];
    const rows = visit.supplies_reserved.map((row, currentRowIndex) =>
      currentRowIndex === rowIndex ? { ...row, [field]: value } : row,
    );
    updatePlanVisit(visitIndex, "supplies_reserved", rows);
  }

  function selectSupplySku(visitIndex: number, rowIndex: number, sku: string) {
    const pharmaceutical = pharmaceuticalLookup.get(sku);
    const visit = form.visits[visitIndex];
    const rows = visit.supplies_reserved.map((row, currentRowIndex) =>
      currentRowIndex === rowIndex
        ? {
            ...row,
            sku,
            name: pharmaceutical?.name || row.name,
            unit_price: pharmaceutical?.sale_price != null ? String(pharmaceutical.sale_price) : row.unit_price,
          }
        : row,
    );
    updatePlanVisit(visitIndex, "supplies_reserved", rows);
  }

  function removeSupplyRow(visitIndex: number, rowIndex: number) {
    const visit = form.visits[visitIndex];
    updatePlanVisit(
      visitIndex,
      "supplies_reserved",
      visit.supplies_reserved.filter((_, currentRowIndex) => currentRowIndex !== rowIndex),
    );
  }

  function updatePopupSupplyRow(index: number, field: keyof SupplyForm, value: string) {
    setVisitForm((current) => ({
      ...current,
      supplies_reserved: current.supplies_reserved.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    }));
  }

  function selectPopupSupplySku(index: number, sku: string) {
    const pharmaceutical = pharmaceuticalLookup.get(sku);
    setVisitForm((current) => ({
      ...current,
      supplies_reserved: current.supplies_reserved.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              sku,
              name: pharmaceutical?.name || row.name,
              unit_price: pharmaceutical?.sale_price != null ? String(pharmaceutical.sale_price) : row.unit_price,
            }
          : row,
      ),
    }));
  }

  function selectPopupVisitService(serviceName: string) {
    const service = popupClinicServiceLookup.get(serviceName);
    setVisitForm((current) => ({
      ...current,
      service_name: serviceName,
      service_cost: String(service?.cost ?? 0),
    }));
  }

  function addPopupSupplyRow() {
    setVisitForm((current) => ({
      ...current,
      supplies_reserved: [...current.supplies_reserved, initialSupplyForm],
    }));
  }

  function removePopupSupplyRow(index: number) {
    setVisitForm((current) => ({
      ...current,
      supplies_reserved: current.supplies_reserved.filter((_, rowIndex) => rowIndex !== index),
    }));
  }

  function updateExistingVisitForm(visitId: number, patch: Partial<VisitForm>) {
    setEditVisitForms((state) => ({
      ...state,
      [visitId]: {
        ...(state[visitId] ?? initialVisitForm),
        ...patch,
      },
    }));
  }

  function updateExistingVisitSupplyRow(visitId: number, index: number, field: keyof SupplyForm, value: string) {
    const current = editVisitForms[visitId] ?? initialVisitForm;
    updateExistingVisitForm(visitId, {
      supplies_reserved: current.supplies_reserved.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    });
  }

  function selectExistingVisitSupplySku(visitId: number, index: number, sku: string) {
    const pharmaceutical = pharmaceuticalLookup.get(sku);
    const current = editVisitForms[visitId] ?? initialVisitForm;
    updateExistingVisitForm(visitId, {
      supplies_reserved: current.supplies_reserved.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              sku,
              name: pharmaceutical?.name || row.name,
              unit_price: pharmaceutical?.sale_price != null ? String(pharmaceutical.sale_price) : row.unit_price,
            }
          : row,
      ),
    });
  }

  function addExistingVisitSupplyRow(visitId: number) {
    const current = editVisitForms[visitId] ?? initialVisitForm;
    updateExistingVisitForm(visitId, {
      supplies_reserved: [...current.supplies_reserved, initialSupplyForm],
    });
  }

  function removeExistingVisitSupplyRow(visitId: number, index: number) {
    const current = editVisitForms[visitId] ?? initialVisitForm;
    updateExistingVisitForm(visitId, {
      supplies_reserved: current.supplies_reserved.filter((_, rowIndex) => rowIndex !== index),
    });
  }

  function selectExistingVisitService(visitId: number, serviceName: string) {
    const service = popupClinicServiceLookup.get(serviceName);
    updateExistingVisitForm(visitId, {
      service_name: serviceName,
      service_cost: String(service?.cost ?? 0),
    });
  }

  async function saveExistingVisit(visitId: number) {
    const current = editVisitForms[visitId];
    if (!current) {
      return;
    }

    setSavingExistingVisitId(visitId);
    setError(null);
    setNotice(null);
    setVisitEditErrors((state) => ({
      ...state,
      [visitId]: null,
    }));

    try {
      await mutateJson(`/visits/${visitId}`, "PATCH", {
        visit_number: current.visit_number || null,
        visit_date: current.scheduled_date,
        service_name: current.service_name || null,
        service_cost: Number(current.service_cost || 0),
        supplies_reserved: toSupplyLines(current.supplies_reserved),
      });
      setDetailsNotice("Visit updated successfully.");
      await load();
      setDetailsOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update visit.";
      setVisitEditErrors((state) => ({
        ...state,
        [visitId]: message,
      }));
    } finally {
      setSavingExistingVisitId(null);
    }
  }

  async function runVisitAction(id: number, action: "confirm" | "cancel" | "miss") {
    setActiveVisit(id);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/visits/${id}/${action}`, "PATCH", {});
      setNotice(`Visit ${action}ed successfully.`);
      await load();
      setDetailsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} visit.`);
    } finally {
      setActiveVisit(null);
    }
  }

  async function completeVisit(id: number) {
    const payload = completeForms[id] ?? initialCompleteForm;
    setActiveVisit(id);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/visits/${id}/complete`, "POST", {
        diagnosis: payload.diagnosis || null,
        treatment_notes: payload.treatment_notes || null,
        body: payload.body || null,
        supplies_used: toSupplyLines(payload.supplies_used),
      });
      setNotice("Visit completed successfully.");
      await load();
      setDetailsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete visit.");
    } finally {
      setActiveVisit(null);
    }
  }

  async function deleteSelectedPlan() {
    if (!selectedPlan) {
      return;
    }

    setDeletingPlanId(selectedPlan.id);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/treatment-plans/${selectedPlan.id}`);
      setNotice(`Treatment plan #${selectedPlan.id} deleted successfully.`);
      setDetailsOpen(false);
      setSelectedPlanId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete treatment plan.");
    } finally {
      setDeletingPlanId(null);
    }
  }

  function addCompletionSupplyRow(visitId: number) {
    const current = completeForms[visitId] ?? initialCompleteForm;
    setCompleteForms((state) => ({
      ...state,
      [visitId]: {
        ...current,
        supplies_used: [...current.supplies_used, initialSupplyForm],
      },
    }));
  }

  function updateCompletionSupplyRow(visitId: number, index: number, field: keyof SupplyForm, value: string) {
    const current = completeForms[visitId] ?? initialCompleteForm;
    setCompleteForms((state) => ({
      ...state,
      [visitId]: {
        ...current,
        supplies_used: current.supplies_used.map((row, rowIndex) =>
          rowIndex === index ? { ...row, [field]: value } : row,
        ),
      },
    }));
  }

  function removeCompletionSupplyRow(visitId: number, index: number) {
    const current = completeForms[visitId] ?? initialCompleteForm;
    setCompleteForms((state) => ({
      ...state,
      [visitId]: {
        ...current,
        supplies_used: current.supplies_used.filter((_, rowIndex) => rowIndex !== index),
      },
    }));
  }

  function openPlanDetails(planId: number) {
    setSelectedPlanId(planId);
    setSelectedPlanView("overview");
    setDetailsOpen(true);
  }

  function getFriendlyVisitLabel(visit: Visit, index: number) {
    const raw = String(visit.visit_number ?? "").trim();
    const numeric = Number(raw);

    if (Number.isFinite(numeric) && raw !== "") {
      return `Visit ${numeric}`;
    }

    return `Visit ${index + 1}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatment Plans"
        description={`Build care plans, generate scheduled visits, and work the case timeline in ${getBrowserTimeZone()}.`}
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Plans" value={stats.total} hint="Treatment plans currently returned by the API." />
        <StatCard label="Active Plans" value={stats.active} hint="Plans still progressing through scheduled and completed visits." />
        <StatCard label="Completed Plans" value={stats.completed} hint="Plans whose visit count has been fulfilled." />
        <StatCard label="Planned Visits" value={stats.scheduledVisits} hint="Visits generated from all treatment plans combined." />
      </div>

      <div className="space-y-6">
        <Panel title="Create Treatment Plan" description="Create a plan and define the visit schedule that should be generated immediately.">
          <form className="space-y-4" onSubmit={handleCreate}>
            {createPlanError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {createPlanError}
              </div>
            ) : null}
            <SearchableSelect
              label="Lead"
              value={form.lead_id}
              onChange={(value) => setForm((current) => ({ ...current, lead_id: value }))}
              options={leadOptions}
              placeholder="Search lead by name or phone"
            />
            <SearchableSelect
              label="Assigned User"
              value={form.user_id}
              onChange={(value) => setForm((current) => ({ ...current, user_id: value }))}
              options={userOptions}
              placeholder="Search user"
            />
            <SearchableSelect
              label="Clinic"
              value={form.clinic_id}
              onChange={selectClinic}
              options={clinicOptions}
              placeholder="Search clinic"
            />
            <WorkflowTextarea label="Diagnosis" value={form.diagnosis} onChange={(value) => setForm((current) => ({ ...current, diagnosis: value }))} />
            <WorkflowTextarea label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />

            <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-950">Planned Visits</div>
                <button type="button" onClick={addPlanVisit} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                  Add Visit
                </button>
              </div>

              {form.visits.map((visit, visitIndex) => (
                <div key={`plan-visit-${visitIndex}`} className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">Visit {visitIndex + 1}</div>
                    {form.visits.length > 1 ? (
                      <button type="button" onClick={() => removePlanVisit(visitIndex)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                        Remove Visit
                      </button>
                    ) : null}
                  </div>
                  <WorkflowInput
                    label="Scheduled Date"
                    name={`scheduled-date-${visitIndex}`}
                    type="datetime-local"
                    value={visit.scheduled_date}
                    onChange={(value) => updatePlanVisit(visitIndex, "scheduled_date", value)}
                    required
                  />
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_180px]">
                    <SearchableSelect
                      label="Clinic Service"
                      value={visit.service_name}
                      onChange={(value) => selectPlanVisitService(visitIndex, value)}
                      options={selectedClinicServiceOptions}
                      placeholder={form.clinic_id ? "Search available clinic services" : "Select a clinic first"}
                    />
                    <WorkflowInput
                      label="Service Cost"
                      name={`service-cost-${visitIndex}`}
                      type="number"
                      value={visit.service_cost}
                      onChange={(value) => updatePlanVisit(visitIndex, "service_cost", value)}
                    />
                  </div>

                  {selectedClinicSupportsMedication ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">Reserved Supplies</div>
                        <button type="button" onClick={() => addSupplyRow(visitIndex)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                          Add Supply
                        </button>
                      </div>

                      {visit.supplies_reserved.map((row, rowIndex) => (
                        <div key={`supply-${visitIndex}-${rowIndex}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <div className="grid gap-3 lg:grid-cols-2">
                            <SearchableSelect
                              label="SKU"
                              value={row.sku}
                              onChange={(value) => selectSupplySku(visitIndex, rowIndex, value)}
                              options={form.clinic_id ? selectedClinicWarehouseOptions : pharmaceuticalOptions}
                              placeholder={form.clinic_id ? "Search clinic warehouse inventory" : "Select a clinic first"}
                            />
                            <WorkflowInput label="Name" name={`name-${visitIndex}-${rowIndex}`} value={row.name} onChange={(value) => updateSupplyRow(visitIndex, rowIndex, "name", value)} />
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-[140px_160px_auto]">
                            <WorkflowInput label="Qty" name={`qty-${visitIndex}-${rowIndex}`} type="number" value={row.quantity} onChange={(value) => updateSupplyRow(visitIndex, rowIndex, "quantity", value)} />
                            <WorkflowInput label="Unit Price" name={`price-${visitIndex}-${rowIndex}`} type="number" value={row.unit_price} onChange={(value) => updateSupplyRow(visitIndex, rowIndex, "unit_price", value)} />
                            <div className="flex items-end">
                              <button type="button" onClick={() => removeSupplyRow(visitIndex, rowIndex)} className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 sm:w-auto">
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      This clinic is services-only, so treatment plans here do not reserve medication supplies.
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button type="submit" disabled={saving} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
              {saving ? "Creating..." : "Create Treatment Plan"}
            </button>
          </form>
        </Panel>

        <Panel title="Plan Queue" description="Existing treatment plans now act as the main case workspace. Open one to work its visits.">
          <div className="mb-4">
            <WorkflowInput
              label="Search"
              name="plan-search"
              value={search}
              onChange={setSearch}
              placeholder="Lead, clinic, user, diagnosis, note, plan id, or status"
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading treatment plans...</div>
          ) : (
            <div className="space-y-4">
              {paginatedPlans.map((plan) => {
                const active = selectedPlan?.id === plan.id;
                const completedVisits = (plan.visits ?? []).filter((visit) => visit.status === "completed").length;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => openPlanDetails(plan.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      active ? "border-slate-900 bg-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-950">
                          Plan #{plan.id} - {plan.lead?.name || plan.lead?.profile_name || `Lead #${plan.lead_id ?? "-"}`}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {plan.clinic?.name || `Clinic #${plan.clinic_id ?? "-"}`} | {plan.user?.name || `User #${plan.user_id ?? "-"}`}
                        </div>
                      </div>
                      <StatusBadge value={plan.status} />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                      <div>Total Visits: {plan.total_visits ?? 0}</div>
                      <div>Completed: {completedVisits}</div>
                      <div>Diagnosis: {plan.diagnosis || "-"}</div>
                      <div>Notes: {plan.notes || "-"}</div>
                    </div>
                  </button>
                );
              })}
              {filteredPlans.length === 0 ? <div className="text-sm text-slate-500">No treatment plans match the current search.</div> : null}
              <PaginationControls page={planPage} totalPages={planTotalPages} totalItems={filteredPlans.length} pageSize={TREATMENT_PLANS_PAGE_SIZE} itemLabel="plans" onPageChange={setPlanPage} />
            </div>
          )}
        </Panel>
      </div>

      {detailsOpen && selectedPlan ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold text-slate-950">
                  Plan #{selectedPlan.id} - {selectedPlan.lead?.name || selectedPlan.lead?.profile_name || `Lead #${selectedPlan.lead_id ?? "-"}`}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span>{selectedPlan.clinic?.name || `Clinic #${selectedPlan.clinic_id ?? "-"}`}</span>
                  <span>{selectedPlan.user?.name || `User #${selectedPlan.user_id ?? "-"}`}</span>
                  <span>{selectedPlan.status || "active"}</span>
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

            <div className="border-b border-[var(--line)] px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "overview", label: "Overview" },
                  { key: "visits", label: "Visits" },
                  { key: "edit", label: "Edit Plan" },
                  { key: "add-visit", label: "Add Visit" },
                  { key: "actions", label: "Actions" },
                ].map((tab) => {
                  const active = selectedPlanView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedPlanView(tab.key as TreatmentPlanView)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active ? "bg-slate-900 text-white" : "border border-[var(--line)] bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[calc(92vh-132px)] overflow-y-auto px-5 py-5">
              {detailsError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{detailsError}</div> : null}
              {detailsNotice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{detailsNotice}</div> : null}
              {selectedPlanView === "overview" ? (
                <div className="space-y-5">
                  <Panel title="Plan Summary" description="Keep the case context and timeline visible while you work the visit flow.">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <StatCard label="Lead" value={selectedPlan.lead?.name || selectedPlan.lead?.profile_name || `Lead #${selectedPlan.lead_id ?? "-"}`} hint="Lead attached to this treatment plan." />
                      <StatCard label="Clinic" value={selectedPlan.clinic?.name || `Clinic #${selectedPlan.clinic_id ?? "-"}`} hint="Clinic currently responsible for this plan." />
                      <StatCard label="Assigned User" value={selectedPlan.user?.name || `User #${selectedPlan.user_id ?? "-"}`} hint="Current owner of the plan." />
                      <StatCard label="Status" value={selectedPlan.status || "-"} hint="Overall plan status." />
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                      <div>Diagnosis: {selectedPlan.diagnosis || "-"}</div>
                      <div>Notes: {selectedPlan.notes || "-"}</div>
                      <div>Total Visits: {selectedPlan.total_visits ?? 0}</div>
                      <div>Completed Visits: {(selectedPlan.visits ?? []).filter((visit) => visit.status === "completed").length}</div>
                    </div>
                  </Panel>
                </div>
              ) : null}

              {selectedPlanView === "visits" ? (
                <div className="space-y-5">
                  <Panel title="Plan Visits" description="Visits now live inside the treatment plan workspace instead of being a separate detail flow.">
                    <div className="space-y-4">
                      {paginatedPlanVisits.map((visit, indexOnPage) => {
                        const visitIndex = (planVisitPage - 1) * PLAN_VISITS_PAGE_SIZE + indexOnPage;
                        const completeForm = completeForms[visit.id] ?? initialCompleteForm;
                        const editVisitForm = editVisitForms[visit.id] ?? toVisitEditForm(visit);
                        const isScheduled = visit.status === "scheduled";
                        const isConfirmed = visit.status === "confirmed";

                        return (
                          <div key={visit.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="text-sm font-semibold text-slate-950">{getFriendlyVisitLabel(visit, visitIndex)}</div>
                                {visit.visit_number ? <div className="mt-1 text-xs text-slate-500">Reference: {visit.visit_number}</div> : null}
                                <div className="mt-1 text-sm text-slate-600">
                                  Scheduled {formatLocalDateTime(visit.scheduled_date || visit.visit_date)} | {formatRelativeDateLabel(visit.scheduled_date || visit.visit_date)}
                                </div>
                              </div>
                              <StatusBadge value={visit.status} />
                            </div>

                            <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                              <div>Total: {getVisitTotal(visit) || "-"}</div>
                              <div>Confirmed: {formatLocalDateTime(visit.confirmed_at)}</div>
                              <div>Completed: {formatLocalDateTime(visit.actual_date)}</div>
                              <div>Supplies Reserved: {visit.supplies_reserved?.length ?? 0}</div>
                            </div>

                            {(visit as Visit & { service_name?: string | null; service_cost?: number | null }).service_name ? (
                              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                                Service: {(visit as Visit & { service_name?: string | null }).service_name}{" "}
                                {(visit as Visit & { service_cost?: number | null }).service_cost != null
                                  ? `| Cost: ${(visit as Visit & { service_cost?: number | null }).service_cost}`
                                  : ""}
                              </div>
                            ) : null}

                            {(visit.supplies_reserved?.length ?? 0) > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(visit.supplies_reserved ?? []).map((item, index) => (
                                  <span key={`${visit.id}-reserved-${index}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
                                    {item.name || item.sku} x{item.quantity}
                                  </span>
                                ))}
                              </div>
                            ) : null}

                            <div className="mt-4 space-y-4 rounded-xl border border-[var(--line)] bg-white p-4">
                              <div className="text-sm font-semibold text-slate-950">Edit Visit</div>
                              {visitEditErrors[visit.id] ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                  {visitEditErrors[visit.id]}
                                </div>
                              ) : null}
                              <div className="grid gap-3 md:grid-cols-2">
                                <WorkflowInput
                                  label="Scheduled Date"
                                  name={`edit-scheduled-${visit.id}`}
                                  type="datetime-local"
                                  value={editVisitForm.scheduled_date}
                                  onChange={(value) => updateExistingVisitForm(visit.id, { scheduled_date: value })}
                                />
                                <WorkflowInput
                                  label="Visit Reference"
                                  name={`edit-visit-number-${visit.id}`}
                                  value={editVisitForm.visit_number}
                                  onChange={(value) => updateExistingVisitForm(visit.id, { visit_number: value })}
                                />
                              </div>
                              <div className="grid gap-3 md:grid-cols-[1.4fr_180px]">
                                <SearchableSelect
                                  label="Clinic Service"
                                  value={editVisitForm.service_name}
                                  onChange={(value) => selectExistingVisitService(visit.id, value)}
                                  options={popupClinicServiceOptions}
                                  placeholder="Search clinic service"
                                />
                                <WorkflowInput
                                  label="Service Cost"
                                  name={`edit-service-cost-${visit.id}`}
                                  type="number"
                                  value={editVisitForm.service_cost}
                                  onChange={(value) => updateExistingVisitForm(visit.id, { service_cost: value })}
                                />
                              </div>

                              {popupClinicSupportsMedication ? (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-slate-900">Reserved Supplies</div>
                                    <button type="button" onClick={() => addExistingVisitSupplyRow(visit.id)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                                      Add Supply
                                    </button>
                                  </div>
                                  {editVisitForm.supplies_reserved.map((row, index) => (
                                    <div key={`${visit.id}-edit-supply-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                      <div className="grid gap-3 lg:grid-cols-2">
                                        <SearchableSelect
                                          label="SKU"
                                          value={row.sku}
                                          onChange={(value) => selectExistingVisitSupplySku(visit.id, index, value)}
                                          options={popupClinicWarehouseOptions}
                                          placeholder="Search clinic warehouse inventory"
                                        />
                                        <WorkflowInput
                                          label="Name"
                                          name={`edit-name-${visit.id}-${index}`}
                                          value={row.name}
                                          onChange={(value) => updateExistingVisitSupplyRow(visit.id, index, "name", value)}
                                        />
                                      </div>
                                      <div className="mt-3 grid gap-3 sm:grid-cols-[140px_160px_auto]">
                                        <WorkflowInput
                                          label="Qty"
                                          name={`edit-qty-${visit.id}-${index}`}
                                          type="number"
                                          value={row.quantity}
                                          onChange={(value) => updateExistingVisitSupplyRow(visit.id, index, "quantity", value)}
                                        />
                                        <WorkflowInput
                                          label="Unit Price"
                                          name={`edit-price-${visit.id}-${index}`}
                                          type="number"
                                          value={row.unit_price}
                                          onChange={(value) => updateExistingVisitSupplyRow(visit.id, index, "unit_price", value)}
                                        />
                                        <div className="flex items-end">
                                          <button type="button" onClick={() => removeExistingVisitSupplyRow(visit.id, index)} className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 sm:w-auto">
                                            Remove
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                  This clinic is services-only, so this visit does not reserve medication supplies.
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => void saveExistingVisit(visit.id)}
                                disabled={savingExistingVisitId === visit.id}
                                className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                              >
                                {savingExistingVisitId === visit.id ? "Saving..." : "Save Visit Changes"}
                              </button>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void runVisitAction(visit.id, "confirm")}
                                disabled={activeVisit === visit.id || !isScheduled}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => void runVisitAction(visit.id, "miss")}
                                disabled={activeVisit === visit.id || !isConfirmed}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Mark Missed
                              </button>
                              <button
                                type="button"
                                onClick={() => void runVisitAction(visit.id, "cancel")}
                                disabled={activeVisit === visit.id || ["completed", "cancelled", "missed"].includes(visit.status || "")}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>

                            {isConfirmed ? (
                              <div className="mt-4 space-y-4 rounded-xl border border-[var(--line)] bg-white p-4">
                                <div className="grid gap-3 md:grid-cols-3">
                                  <WorkflowInput label="Diagnosis" name={`diagnosis-${visit.id}`} value={completeForm.diagnosis} onChange={(value) => setCompleteForms((state) => ({ ...state, [visit.id]: { ...completeForm, diagnosis: value } }))} />
                                  <WorkflowInput label="Treatment Notes" name={`notes-${visit.id}`} value={completeForm.treatment_notes} onChange={(value) => setCompleteForms((state) => ({ ...state, [visit.id]: { ...completeForm, treatment_notes: value } }))} />
                                  <WorkflowInput label="Summary" name={`body-${visit.id}`} value={completeForm.body} onChange={(value) => setCompleteForms((state) => ({ ...state, [visit.id]: { ...completeForm, body: value } }))} />
                                </div>

                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-slate-900">Supplies Used</div>
                                    <button type="button" onClick={() => addCompletionSupplyRow(visit.id)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                                      Add Supply
                                    </button>
                                  </div>
                                  {completeForm.supplies_used.map((row, index) => (
                                    <div
                                      key={`${visit.id}-complete-${index}`}
                                      className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.15fr)_110px_140px_auto]"
                                    >
                                      <WorkflowInput label="SKU" name={`sku-${visit.id}-${index}`} value={row.sku} onChange={(value) => updateCompletionSupplyRow(visit.id, index, "sku", value)} />
                                      <WorkflowInput label="Name" name={`name-${visit.id}-${index}`} value={row.name} onChange={(value) => updateCompletionSupplyRow(visit.id, index, "name", value)} />
                                      <WorkflowInput label="Qty" name={`qty-${visit.id}-${index}`} type="number" value={row.quantity} onChange={(value) => updateCompletionSupplyRow(visit.id, index, "quantity", value)} />
                                      <WorkflowInput label="Unit Price" name={`price-${visit.id}-${index}`} type="number" value={row.unit_price} onChange={(value) => updateCompletionSupplyRow(visit.id, index, "unit_price", value)} />
                                      <div className="flex items-end">
                                        <button type="button" onClick={() => removeCompletionSupplyRow(visit.id, index)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                  {completeForm.supplies_used.length === 0 ? <div className="text-sm text-slate-500">If left empty, the backend will use reserved supplies automatically.</div> : null}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => void completeVisit(visit.id)}
                                  disabled={activeVisit === visit.id}
                                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                                >
                                  {activeVisit === visit.id ? "Working..." : "Complete Visit"}
                                </button>
                              </div>
                            ) : null}

                            {visit.report ? (
                              <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4">
                                <div className="text-sm font-semibold text-slate-950">Completion Output</div>
                                <div className="mt-3 grid gap-3 text-sm text-slate-600">
                                  <div>Diagnosis: {visit.report.diagnosis || "-"}</div>
                                  <div>Treatment Notes: {visit.report.treatment_notes || "-"}</div>
                                  <div>Summary: {visit.report.body || "-"}</div>
                                  <div>Invoice Status: {visit.report.invoice?.status || "-"}</div>
                                  <div>Total Cost: {visit.report.invoice?.total_cost ?? visit.total_cost ?? "-"}</div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {(selectedPlan.visits?.length ?? 0) === 0 ? <div className="text-sm text-slate-500">No visits generated for this plan yet.</div> : null}
                      <PaginationControls page={planVisitPage} totalPages={planVisitTotalPages} totalItems={planVisits.length} pageSize={PLAN_VISITS_PAGE_SIZE} itemLabel="visits" onPageChange={setPlanVisitPage} />
                    </div>
                  </Panel>
                </div>
              ) : null}

              {selectedPlanView === "edit" ? (
                <div className="space-y-5">
                  <Panel title="Edit Plan" description="Reassign the plan owner, lead, clinic, and notes without leaving the case workspace.">
                    <form className="space-y-4" onSubmit={updateSelectedPlan}>
                      {planEditError ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                          {planEditError}
                        </div>
                      ) : null}
                      <SearchableSelect
                        label="Lead"
                        value={planEditForm.lead_id}
                        onChange={(value) => setPlanEditForm((current) => ({ ...current, lead_id: value }))}
                        options={leadOptions}
                        placeholder="Search lead by name or phone"
                      />
                      <SearchableSelect
                        label="Assigned User"
                        value={planEditForm.user_id}
                        onChange={(value) => setPlanEditForm((current) => ({ ...current, user_id: value }))}
                        options={userOptions}
                        placeholder="Search user"
                      />
                      <SearchableSelect
                        label="Clinic"
                        value={planEditForm.clinic_id}
                        onChange={(value) => setPlanEditForm((current) => ({ ...current, clinic_id: value }))}
                        options={clinicOptions}
                        placeholder="Search clinic"
                      />
                      <WorkflowTextarea
                        label="Diagnosis"
                        value={planEditForm.diagnosis}
                        onChange={(value) => setPlanEditForm((current) => ({ ...current, diagnosis: value }))}
                      />
                      <WorkflowTextarea
                        label="Notes"
                        value={planEditForm.notes}
                        onChange={(value) => setPlanEditForm((current) => ({ ...current, notes: value }))}
                      />
                      <button type="submit" disabled={savingPlan} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingPlan ? "Saving..." : "Save Plan Changes"}
                      </button>
                    </form>
                  </Panel>
                </div>
              ) : null}

              {selectedPlanView === "add-visit" ? (
                <div className="space-y-5">
                  <Panel title="Add Visit To Plan" description="Schedule a new visit directly inside the selected treatment plan.">
                    <form className="space-y-4" onSubmit={createVisitForPlan}>
                      {addVisitError ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                          {addVisitError}
                        </div>
                      ) : null}
                      <WorkflowInput
                        label="Scheduled Date"
                        name="plan-popup-visit-date"
                        type="datetime-local"
                        value={visitForm.scheduled_date}
                        onChange={(value) => setVisitForm((current) => ({ ...current, scheduled_date: value }))}
                        required
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <WorkflowInput
                          label="Visit Number"
                          name="plan-popup-visit-number"
                          value={visitForm.visit_number}
                          onChange={(value) => setVisitForm((current) => ({ ...current, visit_number: value }))}
                          placeholder="Optional visit reference"
                        />
                        <WorkflowSelect
                          label="Status"
                          value={visitForm.status}
                          onChange={(value) => setVisitForm((current) => ({ ...current, status: value }))}
                          options={[
                            { label: "Scheduled", value: "scheduled" },
                            { label: "Confirmed", value: "confirmed" },
                          ]}
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr]">
                        <SearchableSelect
                          label="Clinic Service"
                          value={visitForm.service_name}
                          onChange={selectPopupVisitService}
                          options={popupClinicServiceOptions}
                          placeholder="Search available clinic services"
                        />
                        <WorkflowInput
                          label="Service Cost"
                          name="plan-popup-service-cost"
                          type="number"
                          value={visitForm.service_cost}
                          onChange={(value) => setVisitForm((current) => ({ ...current, service_cost: value }))}
                        />
                      </div>

                      {popupClinicSupportsMedication ? (
                        <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-slate-900">Reserved Supplies</div>
                            <button type="button" onClick={addPopupSupplyRow} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                              Add Supply
                            </button>
                          </div>

                          {visitForm.supplies_reserved.map((row, index) => (
                            <div
                              key={`popup-supply-${index}`}
                              className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.15fr)_110px_140px_auto]"
                            >
                              <SearchableSelect
                                label="SKU"
                                value={row.sku}
                                onChange={(value) => selectPopupSupplySku(index, value)}
                                options={popupClinicWarehouseOptions}
                                placeholder="Search clinic warehouse inventory"
                              />
                              <WorkflowInput label="Name" name={`popup-name-${index}`} value={row.name} onChange={(value) => updatePopupSupplyRow(index, "name", value)} />
                              <WorkflowInput label="Qty" name={`popup-qty-${index}`} type="number" value={row.quantity} onChange={(value) => updatePopupSupplyRow(index, "quantity", value)} />
                              <WorkflowInput label="Unit Price" name={`popup-price-${index}`} type="number" value={row.unit_price} onChange={(value) => updatePopupSupplyRow(index, "unit_price", value)} />
                              <div className="flex items-end">
                                <button type="button" onClick={() => removePopupSupplyRow(index)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}

                          {visitForm.supplies_reserved.length === 0 ? <div className="text-sm text-slate-500">You can leave this empty and reserve supplies later if needed.</div> : null}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          This clinic is services-only, so additional visits under this plan do not reserve medication supplies.
                        </div>
                      )}

                      <button type="submit" disabled={savingVisit} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                        {savingVisit ? "Scheduling..." : "Add Visit To Plan"}
                      </button>
                    </form>
                  </Panel>
                </div>
              ) : null}

              {selectedPlanView === "actions" ? (
                <div className="space-y-5">
                  <Panel title="Plan Actions" description="Use destructive actions here so they stay separate from day-to-day visit work.">
                    <button
                      type="button"
                      onClick={() => void deleteSelectedPlan()}
                      disabled={deletingPlanId === selectedPlan.id}
                      className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingPlanId === selectedPlan.id ? "Deleting..." : "Delete Treatment Plan"}
                    </button>
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
