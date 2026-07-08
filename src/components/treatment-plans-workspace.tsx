"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson } from "@/lib/api";
import type { Clinic, Lead, SupplyLine, TreatmentPlanRef, User } from "@/lib/types";
import { formatLocalDateTime, formatRelativeDateLabel, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowTextarea } from "@/components/workflow-textarea";
import { WorkflowSelect } from "@/components/workflow-select";
import { StatCard } from "@/components/stat-card";

type SupplyForm = {
  sku: string;
  name: string;
  quantity: string;
  unit_price: string;
};

type PlanVisitForm = {
  scheduled_date: string;
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

const initialSupplyForm: SupplyForm = {
  sku: "",
  name: "",
  quantity: "1",
  unit_price: "0",
};

const initialPlanVisitForm: PlanVisitForm = {
  scheduled_date: "",
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

export function TreatmentPlansWorkspace() {
  const [plans, setPlans] = useState<TreatmentPlanRef[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [form, setForm] = useState<TreatmentPlanForm>(initialForm);
  const [search, setSearch] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredPlans = useMemo(() => {
    const term = search.trim().toLowerCase();

    return plans.filter((plan) => {
      const leadName = plan.lead?.name || plan.lead?.profile_name || "";
      const clinicName = plan.clinic?.name || "";
      const userName = plan.user?.name || "";
      return (
        !term ||
        [leadName, clinicName, userName, plan.diagnosis, plan.notes, String(plan.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      );
    });
  }, [plans, search]);

  const selectedPlan = useMemo(
    () => filteredPlans.find((plan) => plan.id === selectedPlanId) ?? plans.find((plan) => plan.id === selectedPlanId) ?? filteredPlans[0] ?? plans[0] ?? null,
    [filteredPlans, plans, selectedPlanId],
  );

  const stats = useMemo(() => ({
    total: plans.length,
    active: plans.filter((plan) => plan.status === "active").length,
    completed: plans.filter((plan) => plan.status === "completed").length,
    scheduledVisits: plans.reduce((sum, plan) => sum + (plan.visits?.length ?? 0), 0),
  }), [plans]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [planRows, leadRows, userRows, clinicRows] = await Promise.all([
        fetchCollection<TreatmentPlanRef>("/treatment-plans"),
        fetchCollection<Lead>("/leads"),
        fetchCollection<User>("/users"),
        fetchCollection<Clinic>("/clinics"),
      ]);

      setPlans(planRows);
      setLeads(leadRows);
      setUsers(userRows);
      setClinics(clinicRows);
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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/treatment-plans", "POST", {
        lead_id: Number(form.lead_id),
        user_id: Number(form.user_id),
        clinic_id: Number(form.clinic_id),
        diagnosis: form.diagnosis || null,
        notes: form.notes || null,
        visits: form.visits.map((visit) => ({
          scheduled_date: visit.scheduled_date,
          supplies_reserved: toSupplyLines(visit.supplies_reserved),
        })),
      });
      setForm(initialForm);
      setNotice("Treatment plan created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create treatment plan.");
    } finally {
      setSaving(false);
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

  function removeSupplyRow(visitIndex: number, rowIndex: number) {
    const visit = form.visits[visitIndex];
    updatePlanVisit(visitIndex, "supplies_reserved", visit.supplies_reserved.filter((_, currentRowIndex) => currentRowIndex !== rowIndex));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatment Plans"
        description={`Build care plans, generate scheduled visits, and track plan progress in ${getBrowserTimeZone()}.`}
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Plans" value={stats.total} hint="Treatment plans currently returned by the API." />
        <StatCard label="Active Plans" value={stats.active} hint="Plans still progressing through scheduled/completed visits." />
        <StatCard label="Completed Plans" value={stats.completed} hint="Plans whose visit count has been fulfilled." />
        <StatCard label="Planned Visits" value={stats.scheduledVisits} hint="Visits generated from all treatment plans combined." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Plan Queue" description="Existing treatment plans with their generated visit schedules.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="plan-search" value={search} onChange={setSearch} placeholder="Lead, clinic, user, diagnosis, note, or plan id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading treatment plans...</div>
          ) : (
            <div className="space-y-4">
              {filteredPlans.map((plan) => {
                const active = selectedPlan?.id === plan.id;
                return (
                  <button key={plan.id} type="button" onClick={() => setSelectedPlanId(plan.id)} className={`w-full rounded-xl border p-4 text-left ${active ? "border-slate-900 bg-white" : "border-[var(--line)] bg-[var(--surface)]"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">Plan #{plan.id} - {plan.lead?.name || plan.lead?.profile_name || `Lead #${plan.lead_id ?? "-"}`}</div>
                        <div className="mt-1 text-sm text-slate-600">{plan.clinic?.name || `Clinic #${plan.clinic_id ?? "-"}`} | {plan.user?.name || `User #${plan.user_id ?? "-"}`}</div>
                      </div>
                      <StatusBadge value={plan.status} />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                      <div>Total Visits: {plan.total_visits ?? 0}</div>
                      <div>Diagnosis: {plan.diagnosis || "-"}</div>
                      <div>Notes: {plan.notes || "-"}</div>
                    </div>
                  </button>
                );
              })}
              {filteredPlans.length === 0 ? <div className="text-sm text-slate-500">No treatment plans match the current search.</div> : null}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Treatment Plan" description="Create a plan and define the visit schedule that should be generated immediately.">
            <form className="space-y-4" onSubmit={handleCreate}>
              <WorkflowSelect label="Lead" value={form.lead_id} onChange={(value) => setForm((current) => ({ ...current, lead_id: value }))} options={leads.map((lead) => ({ label: lead.name || lead.profile_name || `Lead #${lead.id}`, value: lead.id }))} required />
              <WorkflowSelect label="Assigned User" value={form.user_id} onChange={(value) => setForm((current) => ({ ...current, user_id: value }))} options={users.map((user) => ({ label: user.name, value: user.id }))} required />
              <WorkflowSelect label="Clinic" value={form.clinic_id} onChange={(value) => setForm((current) => ({ ...current, clinic_id: value }))} options={clinics.map((clinic) => ({ label: clinic.name, value: clinic.id }))} required />
              <WorkflowTextarea label="Diagnosis" value={form.diagnosis} onChange={(value) => setForm((current) => ({ ...current, diagnosis: value }))} />
              <WorkflowTextarea label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />

              <div className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-950">Planned Visits</div>
                  <button type="button" onClick={addPlanVisit} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">Add Visit</button>
                </div>

                {form.visits.map((visit, visitIndex) => (
                  <div key={`plan-visit-${visitIndex}`} className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-900">Visit {visitIndex + 1}</div>
                      {form.visits.length > 1 ? (
                        <button type="button" onClick={() => removePlanVisit(visitIndex)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">Remove Visit</button>
                      ) : null}
                    </div>
                    <WorkflowInput label="Scheduled Date" name={`scheduled-date-${visitIndex}`} type="datetime-local" value={visit.scheduled_date} onChange={(value) => updatePlanVisit(visitIndex, "scheduled_date", value)} required />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">Reserved Supplies</div>
                        <button type="button" onClick={() => addSupplyRow(visitIndex)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">Add Supply</button>
                      </div>

                      {visit.supplies_reserved.map((row, rowIndex) => (
                        <div key={`supply-${visitIndex}-${rowIndex}`} className="grid gap-3 md:grid-cols-[1.2fr_1.2fr_0.7fr_0.8fr_auto]">
                          <WorkflowInput label="SKU" name={`sku-${visitIndex}-${rowIndex}`} value={row.sku} onChange={(value) => updateSupplyRow(visitIndex, rowIndex, "sku", value)} />
                          <WorkflowInput label="Name" name={`name-${visitIndex}-${rowIndex}`} value={row.name} onChange={(value) => updateSupplyRow(visitIndex, rowIndex, "name", value)} />
                          <WorkflowInput label="Qty" name={`qty-${visitIndex}-${rowIndex}`} type="number" value={row.quantity} onChange={(value) => updateSupplyRow(visitIndex, rowIndex, "quantity", value)} />
                          <WorkflowInput label="Unit Price" name={`price-${visitIndex}-${rowIndex}`} type="number" value={row.unit_price} onChange={(value) => updateSupplyRow(visitIndex, rowIndex, "unit_price", value)} />
                          <div className="flex items-end">
                            <button type="button" onClick={() => removeSupplyRow(visitIndex, rowIndex)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button type="submit" disabled={saving} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {saving ? "Creating..." : "Create Treatment Plan"}
              </button>
            </form>
          </Panel>

          <Panel title="Selected Plan Detail" description="Generated visits and overall plan state for the selected treatment plan.">
            {selectedPlan ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">Plan #{selectedPlan.id}</div>
                      <div className="mt-1 text-sm text-slate-600">{selectedPlan.lead?.name || selectedPlan.lead?.profile_name || `Lead #${selectedPlan.lead_id ?? "-"}`}</div>
                    </div>
                    <StatusBadge value={selectedPlan.status} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <div>Diagnosis: {selectedPlan.diagnosis || "-"}</div>
                    <div>Notes: {selectedPlan.notes || "-"}</div>
                    <div>Total Visits: {selectedPlan.total_visits ?? 0}</div>
                    <div>Clinic: {selectedPlan.clinic?.name || `Clinic #${selectedPlan.clinic_id ?? "-"}`}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                  <div className="text-sm font-semibold text-slate-950">Generated Visits</div>
                  <div className="mt-3 space-y-3">
                    {(selectedPlan.visits ?? []).map((visit) => (
                      <div key={visit.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">{visit.visit_number || `Visit #${visit.id}`}</div>
                          <StatusBadge value={visit.status} />
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                          <div>Scheduled: {formatLocalDateTime(visit.scheduled_date || visit.visit_date)}</div>
                          <div>{formatRelativeDateLabel(visit.scheduled_date || visit.visit_date)}</div>
                          <div>Total: {visit.total_cost ?? "-"}</div>
                        </div>
                      </div>
                    ))}
                    {(selectedPlan.visits?.length ?? 0) === 0 ? <div className="text-sm text-slate-500">No visits generated for this plan yet.</div> : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a treatment plan to inspect its generated visits.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
