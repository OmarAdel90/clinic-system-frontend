"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Clinic, Lead, SupplyLine, User, Visit } from "@/lib/types";
import { formatLocalDateTime, formatRelativeDateLabel, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { StatCard } from "@/components/stat-card";

type VisitForm = {
  lead_id: string;
  user_id: string;
  clinic_id: string;
  treatment_plan_id: string;
  conversation_id: string;
  visit_number: string;
  visit_date: string;
  status: string;
};

type SupplyForm = {
  sku: string;
  name: string;
  quantity: string;
  unit_price: string;
};

type CompleteForm = {
  diagnosis: string;
  treatment_notes: string;
  body: string;
  supplies_used: SupplyForm[];
};

const initialVisitForm: VisitForm = {
  lead_id: "",
  user_id: "",
  clinic_id: "",
  treatment_plan_id: "",
  conversation_id: "",
  visit_number: "",
  visit_date: "",
  status: "scheduled",
};

const initialSupplyForm: SupplyForm = {
  sku: "",
  name: "",
  quantity: "1",
  unit_price: "0",
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

function toDateTimeLocal(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function toVisitForm(visit?: Visit | null): VisitForm {
  if (!visit) {
    return initialVisitForm;
  }

  return {
    lead_id: String(visit.lead_id ?? ""),
    user_id: String(visit.user_id ?? ""),
    clinic_id: String(visit.clinic_id ?? ""),
    treatment_plan_id: String(visit.treatment_plan_id ?? visit.treatment_plan?.id ?? ""),
    conversation_id: String(visit.conversation_id ?? visit.conversation?.id ?? ""),
    visit_number: visit.visit_number || "",
    visit_date: toDateTimeLocal(visit.scheduled_date || visit.visit_date),
    status: visit.status || "scheduled",
  };
}

export function VisitsWorkspace() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [form, setForm] = useState<VisitForm>(initialVisitForm);
  const [editForm, setEditForm] = useState<VisitForm>(initialVisitForm);
  const [completeForms, setCompleteForms] = useState<Record<number, CompleteForm>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingVisit, setDeletingVisit] = useState<number | null>(null);
  const [activeVisit, setActiveVisit] = useState<number | null>(null);

  const filteredVisits = useMemo(() => {
    const term = search.trim().toLowerCase();

    return visits.filter((visit) => {
      const leadName = visit.lead?.name || visit.lead?.profile_name || "";
      const clinicName = visit.clinic?.name || "";
      const userName = visit.user?.name || "";
      const matchesSearch =
        !term ||
        [leadName, clinicName, userName, visit.visit_number, String(visit.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      const matchesStatus = statusFilter === "all" || visit.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, visits]);

  const selectedVisit = useMemo(
    () => filteredVisits.find((visit) => visit.id === selectedVisitId) ?? visits.find((visit) => visit.id === selectedVisitId) ?? filteredVisits[0] ?? visits[0] ?? null,
    [filteredVisits, selectedVisitId, visits],
  );

  const stats = useMemo(() => ({
    total: visits.length,
    scheduled: visits.filter((visit) => visit.status === "scheduled").length,
    confirmed: visits.filter((visit) => visit.status === "confirmed").length,
    completed: visits.filter((visit) => visit.status === "completed").length,
  }), [visits]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [visitRows, leadRows, userRows, clinicRows] = await Promise.all([
        fetchCollection<Visit>("/visits"),
        fetchCollection<Lead>("/leads"),
        fetchCollection<User>("/users"),
        fetchCollection<Clinic>("/clinics"),
      ]);

      setVisits(visitRows);
      setLeads(leadRows);
      setUsers(userRows);
      setClinics(clinicRows);
      setSelectedVisitId((current) => current ?? visitRows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load visits.");
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
    setEditForm(toVisitForm(selectedVisit));
  }, [selectedVisit]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/visits", "POST", {
        lead_id: Number(form.lead_id),
        user_id: Number(form.user_id),
        clinic_id: Number(form.clinic_id),
        treatment_plan_id: form.treatment_plan_id ? Number(form.treatment_plan_id) : null,
        conversation_id: form.conversation_id ? Number(form.conversation_id) : null,
        visit_number: form.visit_number || null,
        visit_date: form.visit_date,
        status: form.status,
      });
      setForm(initialVisitForm);
      setNotice("Visit scheduled successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create visit.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVisit) return;

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/visits/${selectedVisit.id}`, "PATCH", {
        lead_id: Number(editForm.lead_id),
        user_id: Number(editForm.user_id),
        clinic_id: Number(editForm.clinic_id),
        treatment_plan_id: editForm.treatment_plan_id ? Number(editForm.treatment_plan_id) : null,
        conversation_id: editForm.conversation_id ? Number(editForm.conversation_id) : null,
        visit_number: editForm.visit_number || null,
        visit_date: editForm.visit_date,
        status: editForm.status,
      });
      setNotice(`Visit #${selectedVisit.id} updated successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update visit.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteVisit(visitId: number) {
    setDeletingVisit(visitId);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/visits/${visitId}`);
      setNotice(`Visit #${visitId} deleted successfully.`);
      if (selectedVisitId === visitId) {
        setSelectedVisitId(null);
        setEditForm(initialVisitForm);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete visit.");
    } finally {
      setDeletingVisit(null);
    }
  }

  async function runAction(id: number, action: "confirm" | "cancel" | "miss") {
    setActiveVisit(id);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/visits/${id}/${action}`, "PATCH", {});
      setNotice(`Visit ${action}ed successfully.`);
      await load();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete visit.");
    } finally {
      setActiveVisit(null);
    }
  }

  function addSupplyRow(visitId: number) {
    const current = completeForms[visitId] ?? initialCompleteForm;
    setCompleteForms((state) => ({
      ...state,
      [visitId]: {
        ...current,
        supplies_used: [...current.supplies_used, initialSupplyForm],
      },
    }));
  }

  function updateSupplyRow(visitId: number, index: number, field: keyof SupplyForm, value: string) {
    const current = completeForms[visitId] ?? initialCompleteForm;
    const nextRows = current.supplies_used.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row));

    setCompleteForms((state) => ({
      ...state,
      [visitId]: {
        ...current,
        supplies_used: nextRows,
      },
    }));
  }

  function removeSupplyRow(visitId: number, index: number) {
    const current = completeForms[visitId] ?? initialCompleteForm;
    setCompleteForms((state) => ({
      ...state,
      [visitId]: {
        ...current,
        supplies_used: current.supplies_used.filter((_, rowIndex) => rowIndex !== index),
      },
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visits"
        description={`Schedule, confirm, complete, and recover visit flow in ${getBrowserTimeZone()} without bouncing between modules.`}
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Visits" value={stats.total} hint="All visit records returned by the API." />
        <StatCard label="Scheduled" value={stats.scheduled} hint="Visits waiting for confirmation." />
        <StatCard label="Confirmed" value={stats.confirmed} hint="Visits ready to be completed or marked missed." />
        <StatCard label="Completed" value={stats.completed} hint="Visits already turned into reports/invoices." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Visit Queue" description="Operational queue with scheduling context, lifecycle actions, and follow-through into completion.">
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <WorkflowInput label="Search" name="visit-search" value={search} onChange={setSearch} placeholder="Lead, clinic, user, visit number, or id" />
            <WorkflowSelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: "All statuses", value: "all" },
                { label: "Scheduled", value: "scheduled" },
                { label: "Confirmed", value: "confirmed" },
                { label: "Completed", value: "completed" },
                { label: "Cancelled", value: "cancelled" },
                { label: "Missed", value: "missed" },
              ]}
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading visits...</div>
          ) : (
            <div className="space-y-4">
              {filteredVisits.map((visit) => {
                const completeForm = completeForms[visit.id] ?? initialCompleteForm;
                const active = selectedVisit?.id === visit.id;
                const isScheduled = visit.status === "scheduled";
                const isConfirmed = visit.status === "confirmed";

                return (
                  <div key={visit.id} className={`rounded-xl border p-4 ${active ? "border-slate-900 bg-white" : "border-[var(--line)] bg-[var(--surface)]"}`}>
                    <button type="button" onClick={() => setSelectedVisitId(visit.id)} className="w-full text-left">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">
                            {visit.visit_number || `Visit #${visit.id}`} - {visit.lead?.name || visit.lead?.profile_name || `Lead #${visit.lead_id}`}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {visit.clinic?.name || `Clinic #${visit.clinic_id ?? "-"}`} | {visit.user?.name || `User #${visit.user_id ?? "-"}`}
                          </div>
                        </div>
                        <StatusBadge value={visit.status} />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                        <div>Scheduled: {formatLocalDateTime(visit.scheduled_date || visit.visit_date)}</div>
                        <div>Timing: {formatRelativeDateLabel(visit.scheduled_date || visit.visit_date)}</div>
                        <div>Total: {visit.total_cost != null ? `${visit.total_cost}` : "-"}</div>
                      </div>
                    </button>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void runAction(visit.id, "confirm")} disabled={activeVisit === visit.id || !isScheduled} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                        Confirm
                      </button>
                      <button type="button" onClick={() => void runAction(visit.id, "miss")} disabled={activeVisit === visit.id || !isConfirmed} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
                        Mark Missed
                      </button>
                      <button type="button" onClick={() => void runAction(visit.id, "cancel")} disabled={activeVisit === visit.id || ["completed", "cancelled", "missed"].includes(visit.status || "")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
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
                            <button type="button" onClick={() => addSupplyRow(visit.id)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">Add Supply</button>
                          </div>
                          {completeForm.supplies_used.map((row, index) => (
                            <div key={`${visit.id}-${index}`} className="grid gap-3 md:grid-cols-[1.2fr_1.2fr_0.7fr_0.8fr_auto]">
                              <WorkflowInput label="SKU" name={`sku-${visit.id}-${index}`} value={row.sku} onChange={(value) => updateSupplyRow(visit.id, index, "sku", value)} />
                              <WorkflowInput label="Name" name={`name-${visit.id}-${index}`} value={row.name} onChange={(value) => updateSupplyRow(visit.id, index, "name", value)} />
                              <WorkflowInput label="Qty" name={`qty-${visit.id}-${index}`} type="number" value={row.quantity} onChange={(value) => updateSupplyRow(visit.id, index, "quantity", value)} />
                              <WorkflowInput label="Unit Price" name={`price-${visit.id}-${index}`} type="number" value={row.unit_price} onChange={(value) => updateSupplyRow(visit.id, index, "unit_price", value)} />
                              <div className="flex items-end">
                                <button type="button" onClick={() => removeSupplyRow(visit.id, index)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">Remove</button>
                              </div>
                            </div>
                          ))}
                          {completeForm.supplies_used.length === 0 ? <div className="text-sm text-slate-500">If left empty, the backend will use the reserved supplies automatically.</div> : null}
                        </div>

                        <button type="button" onClick={() => void completeVisit(visit.id)} disabled={activeVisit === visit.id} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                          {activeVisit === visit.id ? "Working..." : "Complete Visit"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {filteredVisits.length === 0 ? <div className="text-sm text-slate-500">No visits match the current search.</div> : null}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Schedule Visit" description="Create a visit using the cleaned backend contract, with scheduling fields instead of report fields.">
            <form className="space-y-4" onSubmit={handleCreate}>
              <WorkflowSelect label="Lead" value={form.lead_id} onChange={(value) => setForm((current) => ({ ...current, lead_id: value }))} options={leads.map((lead) => ({ label: lead.name || lead.profile_name || `Lead #${lead.id}`, value: lead.id }))} required />
              <WorkflowSelect label="Assigned User" value={form.user_id} onChange={(value) => setForm((current) => ({ ...current, user_id: value }))} options={users.map((user) => ({ label: user.name, value: user.id }))} required />
              <WorkflowSelect label="Clinic" value={form.clinic_id} onChange={(value) => setForm((current) => ({ ...current, clinic_id: value }))} options={clinics.map((clinic) => ({ label: clinic.name, value: clinic.id }))} required />
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowInput label="Treatment Plan Id" name="treatment_plan_id" type="number" value={form.treatment_plan_id} onChange={(value) => setForm((current) => ({ ...current, treatment_plan_id: value }))} placeholder="Optional" />
                <WorkflowInput label="Conversation Id" name="conversation_id" type="number" value={form.conversation_id} onChange={(value) => setForm((current) => ({ ...current, conversation_id: value }))} placeholder="Optional" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowInput label="Visit Number" name="visit_number" value={form.visit_number} onChange={(value) => setForm((current) => ({ ...current, visit_number: value }))} placeholder="Optional reference" />
                <WorkflowSelect label="Initial Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[{ label: "Scheduled", value: "scheduled" }, { label: "Confirmed", value: "confirmed" }]} required />
              </div>
              <WorkflowInput label="Visit Date" name="visit_date" type="datetime-local" value={form.visit_date} onChange={(value) => setForm((current) => ({ ...current, visit_date: value }))} required />
              <button type="submit" disabled={saving} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {saving ? "Scheduling..." : "Schedule Visit"}
              </button>
            </form>
          </Panel>

          <Panel title="Visit Detail" description="Selected visit context including timestamps, rescheduling controls, reserved supplies, and any report/invoice generated after completion.">
            {selectedVisit ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{selectedVisit.visit_number || `Visit #${selectedVisit.id}`}</div>
                      <div className="mt-1 text-sm text-slate-600">{selectedVisit.lead?.name || selectedVisit.lead?.profile_name || `Lead #${selectedVisit.lead_id}`}</div>
                    </div>
                    <StatusBadge value={selectedVisit.status} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                    <div>Scheduled: {formatLocalDateTime(selectedVisit.scheduled_date || selectedVisit.visit_date)}</div>
                    <div>Confirmed: {formatLocalDateTime(selectedVisit.confirmed_at)}</div>
                    <div>Completed: {formatLocalDateTime(selectedVisit.actual_date)}</div>
                    <div>Clinic: {selectedVisit.clinic?.name || `Clinic #${selectedVisit.clinic_id ?? "-"}`}</div>
                    <div>User: {selectedVisit.user?.name || `User #${selectedVisit.user_id ?? "-"}`}</div>
                    <div>Treatment Plan: {selectedVisit.treatment_plan?.id || "-"}</div>
                  </div>
                </div>

                <form className="rounded-xl border border-[var(--line)] bg-white p-4 space-y-4" onSubmit={handleUpdate}>
                  <div className="text-sm font-semibold text-slate-950">Edit Visit</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <WorkflowSelect label="Lead" value={editForm.lead_id} onChange={(value) => setEditForm((current) => ({ ...current, lead_id: value }))} options={leads.map((lead) => ({ label: lead.name || lead.profile_name || `Lead #${lead.id}`, value: lead.id }))} required />
                    <WorkflowSelect label="Assigned User" value={editForm.user_id} onChange={(value) => setEditForm((current) => ({ ...current, user_id: value }))} options={users.map((user) => ({ label: user.name, value: user.id }))} required />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <WorkflowSelect label="Clinic" value={editForm.clinic_id} onChange={(value) => setEditForm((current) => ({ ...current, clinic_id: value }))} options={clinics.map((clinic) => ({ label: clinic.name, value: clinic.id }))} required />
                    <WorkflowSelect label="Status" value={editForm.status} onChange={(value) => setEditForm((current) => ({ ...current, status: value }))} options={[{ label: "Scheduled", value: "scheduled" }, { label: "Confirmed", value: "confirmed" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }, { label: "Missed", value: "missed" }]} required />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <WorkflowInput label="Treatment Plan Id" name="edit-treatment-plan-id" type="number" value={editForm.treatment_plan_id} onChange={(value) => setEditForm((current) => ({ ...current, treatment_plan_id: value }))} placeholder="Optional" />
                    <WorkflowInput label="Conversation Id" name="edit-conversation-id" type="number" value={editForm.conversation_id} onChange={(value) => setEditForm((current) => ({ ...current, conversation_id: value }))} placeholder="Optional" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <WorkflowInput label="Visit Number" name="edit-visit-number" value={editForm.visit_number} onChange={(value) => setEditForm((current) => ({ ...current, visit_number: value }))} />
                    <WorkflowInput label="Visit Date" name="edit-visit-date" type="datetime-local" value={editForm.visit_date} onChange={(value) => setEditForm((current) => ({ ...current, visit_date: value }))} required />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                      {savingEdit ? "Saving..." : "Save Visit Changes"}
                    </button>
                    <button type="button" onClick={() => void deleteVisit(selectedVisit.id)} disabled={deletingVisit === selectedVisit.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {deletingVisit === selectedVisit.id ? "Deleting..." : "Delete Visit"}
                    </button>
                  </div>
                </form>

                <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                  <div className="text-sm font-semibold text-slate-950">Reserved Supplies</div>
                  <div className="mt-3 space-y-2">
                    {(selectedVisit.supplies_reserved ?? []).map((item, index) => (
                      <div key={`${selectedVisit.id}-reserved-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-700">
                        <span>{item.name || item.sku}</span>
                        <span>{item.quantity}</span>
                      </div>
                    ))}
                    {(selectedVisit.supplies_reserved?.length ?? 0) === 0 ? <div className="text-sm text-slate-500">No reserved supplies on this visit.</div> : null}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                  <div className="text-sm font-semibold text-slate-950">Completion Output</div>
                  {selectedVisit.report ? (
                    <div className="mt-3 grid gap-3 text-sm text-slate-600">
                      <div>Diagnosis: {selectedVisit.report.diagnosis || "-"}</div>
                      <div>Treatment Notes: {selectedVisit.report.treatment_notes || "-"}</div>
                      <div>Summary: {selectedVisit.report.body || "-"}</div>
                      <div>Invoice Status: {selectedVisit.report.invoice?.status || "-"}</div>
                      <div>Total Cost: {selectedVisit.report.invoice?.total_cost ?? selectedVisit.total_cost ?? "-"}</div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-slate-500">No report has been generated for this visit yet.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a visit to inspect its details.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
