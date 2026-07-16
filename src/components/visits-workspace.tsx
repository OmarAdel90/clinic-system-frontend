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

type VisitDetailsView = "overview" | "edit" | "supplies" | "complete";

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

function visitTotal(visit: Visit) {
  if (visit.total_cost != null) {
    return visit.total_cost;
  }

  const reserved = visit.supplies_reserved ?? [];
  return reserved.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0), 0);
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
  const [clinicFilter, setClinicFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedVisitView, setSelectedVisitView] = useState<VisitDetailsView>("overview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
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
      const matchesClinic = clinicFilter === "all" || String(visit.clinic_id ?? "") === clinicFilter;
      const matchesUser = userFilter === "all" || String(visit.user_id ?? "") === userFilter;

      return matchesSearch && matchesStatus && matchesClinic && matchesUser;
    });
  }, [search, statusFilter, clinicFilter, userFilter, visits]);

  const selectedVisit = useMemo(
    () =>
      filteredVisits.find((visit) => visit.id === selectedVisitId) ??
      visits.find((visit) => visit.id === selectedVisitId) ??
      filteredVisits[0] ??
      visits[0] ??
      null,
    [filteredVisits, selectedVisitId, visits],
  );

  const stats = useMemo(
    () => ({
      total: visits.length,
      scheduled: visits.filter((visit) => visit.status === "scheduled").length,
      confirmed: visits.filter((visit) => visit.status === "confirmed").length,
      completed: visits.filter((visit) => visit.status === "completed").length,
    }),
    [visits],
  );

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
    setDetailsError(null);
    setDetailsNotice(null);

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
      setDetailsNotice(`Visit #${selectedVisit.id} updated successfully.`);
      await load();
      setDetailsOpen(true);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to update visit.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteVisit(visitId: number) {
    setDeletingVisit(visitId);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await removeResource(`/visits/${visitId}`);
      setDetailsNotice(`Visit #${visitId} deleted successfully.`);
      if (selectedVisitId === visitId) {
        setSelectedVisitId(null);
        setEditForm(initialVisitForm);
        setDetailsOpen(false);
      }
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to delete visit.");
    } finally {
      setDeletingVisit(null);
    }
  }

  async function runAction(id: number, action: "confirm" | "cancel" | "miss") {
    setActiveVisit(id);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson(`/visits/${id}/${action}`, "PATCH", {});
      setDetailsNotice(`Visit ${action}ed successfully.`);
      await load();
      setDetailsOpen(true);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : `Unable to ${action} visit.`);
    } finally {
      setActiveVisit(null);
    }
  }

  async function completeVisit(id: number) {
    const payload = completeForms[id] ?? initialCompleteForm;
    setActiveVisit(id);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson(`/visits/${id}/complete`, "POST", {
        diagnosis: payload.diagnosis || null,
        treatment_notes: payload.treatment_notes || null,
        body: payload.body || null,
        supplies_used: toSupplyLines(payload.supplies_used),
      });
      setDetailsNotice("Visit completed successfully.");
      await load();
      setDetailsOpen(true);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to complete visit.");
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

  function openVisitDetails(visitId: number) {
    setSelectedVisitId(visitId);
    setSelectedVisitView("overview");
    setDetailsError(null);
    setDetailsNotice(null);
    setDetailsOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visits"
        description={`Use visits as the operations board for scheduling, confirmations, completions, and exception handling in ${getBrowserTimeZone()}.`}
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Visits" value={stats.total} hint="All visit records returned by the API." />
        <StatCard label="Scheduled" value={stats.scheduled} hint="Visits waiting for confirmation." />
        <StatCard label="Confirmed" value={stats.confirmed} hint="Visits ready to be completed or marked missed." />
        <StatCard label="Completed" value={stats.completed} hint="Visits already turned into reports and invoices." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Visit Queue" description="Cross-plan operations board for clinic teams. Open a visit popup to work the details.">
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            <WorkflowSelect
              label="Clinic"
              value={clinicFilter}
              onChange={setClinicFilter}
              options={[{ label: "All clinics", value: "all" }, ...clinics.map((clinic) => ({ label: clinic.name, value: String(clinic.id) }))]}
            />
            <WorkflowSelect
              label="Assigned User"
              value={userFilter}
              onChange={setUserFilter}
              options={[{ label: "All users", value: "all" }, ...users.map((user) => ({ label: user.name, value: String(user.id) }))]}
            />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading visits...</div>
          ) : (
            <div className="space-y-4">
              {filteredVisits.map((visit) => {
                const active = selectedVisit?.id === visit.id;

                return (
                  <button
                    key={visit.id}
                    type="button"
                    onClick={() => openVisitDetails(visit.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      active ? "border-slate-900 bg-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-950">
                          {visit.visit_number || `Visit #${visit.id}`} - {visit.lead?.name || visit.lead?.profile_name || `Lead #${visit.lead_id}`}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {visit.clinic?.name || `Clinic #${visit.clinic_id ?? "-"}`} | {visit.user?.name || `User #${visit.user_id ?? "-"}`}
                        </div>
                      </div>
                      <StatusBadge value={visit.status} />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                      <div>Scheduled: {formatLocalDateTime(visit.scheduled_date || visit.visit_date)}</div>
                      <div>{formatRelativeDateLabel(visit.scheduled_date || visit.visit_date)}</div>
                      <div>Plan: {visit.treatment_plan?.id || visit.treatment_plan_id || "-"}</div>
                      <div>Total: {visitTotal(visit) || "-"}</div>
                    </div>
                  </button>
                );
              })}
              {filteredVisits.length === 0 ? <div className="text-sm text-slate-500">No visits match the current filters.</div> : null}
            </div>
          )}
        </Panel>

        <Panel title="Schedule Visit" description="Create a visit using the cleaned backend contract.">
          <form className="space-y-4" onSubmit={handleCreate}>
            <WorkflowSelect
              label="Lead"
              value={form.lead_id}
              onChange={(value) => setForm((current) => ({ ...current, lead_id: value }))}
              options={leads.map((lead) => ({ label: lead.name || lead.profile_name || `Lead #${lead.id}`, value: String(lead.id) }))}
              required
            />
            <WorkflowSelect
              label="Assigned User"
              value={form.user_id}
              onChange={(value) => setForm((current) => ({ ...current, user_id: value }))}
              options={users.map((user) => ({ label: user.name, value: String(user.id) }))}
              required
            />
            <WorkflowSelect
              label="Clinic"
              value={form.clinic_id}
              onChange={(value) => setForm((current) => ({ ...current, clinic_id: value }))}
              options={clinics.map((clinic) => ({ label: clinic.name, value: String(clinic.id) }))}
              required
            />
            <div className="grid gap-4 md:grid-cols-2">
              <WorkflowInput label="Treatment Plan Id" name="treatment_plan_id" type="number" value={form.treatment_plan_id} onChange={(value) => setForm((current) => ({ ...current, treatment_plan_id: value }))} placeholder="Optional" />
              <WorkflowInput label="Conversation Id" name="conversation_id" type="number" value={form.conversation_id} onChange={(value) => setForm((current) => ({ ...current, conversation_id: value }))} placeholder="Optional" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <WorkflowInput label="Visit Number" name="visit_number" value={form.visit_number} onChange={(value) => setForm((current) => ({ ...current, visit_number: value }))} placeholder="Optional reference" />
              <WorkflowSelect
                label="Initial Status"
                value={form.status}
                onChange={(value) => setForm((current) => ({ ...current, status: value }))}
                options={[
                  { label: "Scheduled", value: "scheduled" },
                  { label: "Confirmed", value: "confirmed" },
                ]}
                required
              />
            </div>
            <WorkflowInput label="Visit Date" name="visit_date" type="datetime-local" value={form.visit_date} onChange={(value) => setForm((current) => ({ ...current, visit_date: value }))} required />
            <button type="submit" disabled={saving} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
              {saving ? "Scheduling..." : "Schedule Visit"}
            </button>
          </form>
        </Panel>
      </div>

      {detailsOpen && selectedVisit ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold text-slate-950">
                  {selectedVisit.visit_number || `Visit #${selectedVisit.id}`} - {selectedVisit.lead?.name || selectedVisit.lead?.profile_name || `Lead #${selectedVisit.lead_id}`}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span>{selectedVisit.clinic?.name || `Clinic #${selectedVisit.clinic_id ?? "-"}`}</span>
                  <span>{selectedVisit.user?.name || `User #${selectedVisit.user_id ?? "-"}`}</span>
                  <span>Plan {selectedVisit.treatment_plan?.id || selectedVisit.treatment_plan_id || "-"}</span>
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
                  { key: "edit", label: "Edit" },
                  { key: "supplies", label: "Supplies" },
                  { key: "complete", label: "Complete" },
                ].map((tab) => {
                  const active = selectedVisitView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedVisitView(tab.key as VisitDetailsView)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-slate-900 text-white" : "border border-[var(--line)] bg-white text-slate-700 hover:bg-slate-50"}`}
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
              {selectedVisitView === "overview" ? (
                <div className="space-y-5">
                  <Panel title="Visit Summary" description="Core schedule, ownership, and status information.">
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

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void runAction(selectedVisit.id, "confirm")}
                        disabled={activeVisit === selectedVisit.id || selectedVisit.status !== "scheduled"}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction(selectedVisit.id, "miss")}
                        disabled={activeVisit === selectedVisit.id || selectedVisit.status !== "confirmed"}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Mark Missed
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction(selectedVisit.id, "cancel")}
                        disabled={activeVisit === selectedVisit.id || ["completed", "cancelled", "missed"].includes(selectedVisit.status || "")}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </Panel>

                  <Panel title="Completion Output" description="Report and invoice context generated after visit completion.">
                    {selectedVisit.report ? (
                      <div className="grid gap-3 text-sm text-slate-600">
                        <div>Diagnosis: {selectedVisit.report.diagnosis || "-"}</div>
                        <div>Treatment Notes: {selectedVisit.report.treatment_notes || "-"}</div>
                        <div>Summary: {selectedVisit.report.body || "-"}</div>
                        <div>Invoice Status: {selectedVisit.report.invoice?.status || "-"}</div>
                        <div>Total Cost: {selectedVisit.report.invoice?.total_cost ?? selectedVisit.total_cost ?? "-"}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">No report has been generated for this visit yet.</div>
                    )}
                  </Panel>
                </div>
              ) : null}

              {selectedVisitView === "edit" ? (
                <div className="space-y-5">
                  <Panel title="Visit Settings" description="Update the selected visit without leaving the operations board.">
                    <form className="space-y-4" onSubmit={handleUpdate}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <WorkflowSelect label="Lead" value={editForm.lead_id} onChange={(value) => setEditForm((current) => ({ ...current, lead_id: value }))} options={leads.map((lead) => ({ label: lead.name || lead.profile_name || `Lead #${lead.id}`, value: String(lead.id) }))} required />
                        <WorkflowSelect label="Assigned User" value={editForm.user_id} onChange={(value) => setEditForm((current) => ({ ...current, user_id: value }))} options={users.map((user) => ({ label: user.name, value: String(user.id) }))} required />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <WorkflowSelect label="Clinic" value={editForm.clinic_id} onChange={(value) => setEditForm((current) => ({ ...current, clinic_id: value }))} options={clinics.map((clinic) => ({ label: clinic.name, value: String(clinic.id) }))} required />
                        <WorkflowSelect
                          label="Status"
                          value={editForm.status}
                          onChange={(value) => setEditForm((current) => ({ ...current, status: value }))}
                          options={[
                            { label: "Scheduled", value: "scheduled" },
                            { label: "Confirmed", value: "confirmed" },
                            { label: "Completed", value: "completed" },
                            { label: "Cancelled", value: "cancelled" },
                            { label: "Missed", value: "missed" },
                          ]}
                          required
                        />
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
                  </Panel>
                </div>
              ) : null}

              {selectedVisitView === "supplies" ? (
                <div className="space-y-5">
                  <Panel title="Reserved Supplies" description="Supplies currently held for this visit.">
                    <div className="space-y-2">
                      {(selectedVisit.supplies_reserved ?? []).map((item, index) => (
                        <div key={`${selectedVisit.id}-reserved-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-700">
                          <span>{item.name || item.sku}</span>
                          <span>{item.quantity}</span>
                        </div>
                      ))}
                      {(selectedVisit.supplies_reserved?.length ?? 0) === 0 ? <div className="text-sm text-slate-500">No reserved supplies on this visit.</div> : null}
                    </div>
                  </Panel>
                </div>
              ) : null}

              {selectedVisitView === "complete" ? (
                <div className="space-y-5">
                  {selectedVisit.status === "confirmed" ? (
                    <Panel title="Complete Visit" description="Finish a confirmed visit and hand it into report and invoice generation.">
                      {(() => {
                        const completeForm = completeForms[selectedVisit.id] ?? initialCompleteForm;
                        return (
                          <div className="space-y-4">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              <WorkflowInput label="Diagnosis" name={`diagnosis-${selectedVisit.id}`} value={completeForm.diagnosis} onChange={(value) => setCompleteForms((state) => ({ ...state, [selectedVisit.id]: { ...completeForm, diagnosis: value } }))} />
                              <WorkflowInput label="Treatment Notes" name={`notes-${selectedVisit.id}`} value={completeForm.treatment_notes} onChange={(value) => setCompleteForms((state) => ({ ...state, [selectedVisit.id]: { ...completeForm, treatment_notes: value } }))} />
                              <WorkflowInput label="Summary" name={`body-${selectedVisit.id}`} value={completeForm.body} onChange={(value) => setCompleteForms((state) => ({ ...state, [selectedVisit.id]: { ...completeForm, body: value } }))} />
                            </div>

                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium text-slate-900">Supplies Used</div>
                                <button type="button" onClick={() => addSupplyRow(selectedVisit.id)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                                  Add Supply
                                </button>
                              </div>
                              {completeForm.supplies_used.map((row, index) => (
                                <div key={`${selectedVisit.id}-${index}`} className="grid gap-3 md:grid-cols-[1.2fr_1.2fr_0.7fr_0.8fr_auto]">
                                  <WorkflowInput label="SKU" name={`sku-${selectedVisit.id}-${index}`} value={row.sku} onChange={(value) => updateSupplyRow(selectedVisit.id, index, "sku", value)} />
                                  <WorkflowInput label="Name" name={`name-${selectedVisit.id}-${index}`} value={row.name} onChange={(value) => updateSupplyRow(selectedVisit.id, index, "name", value)} />
                                  <WorkflowInput label="Qty" name={`qty-${selectedVisit.id}-${index}`} type="number" value={row.quantity} onChange={(value) => updateSupplyRow(selectedVisit.id, index, "quantity", value)} />
                                  <WorkflowInput label="Unit Price" name={`price-${selectedVisit.id}-${index}`} type="number" value={row.unit_price} onChange={(value) => updateSupplyRow(selectedVisit.id, index, "unit_price", value)} />
                                  <div className="flex items-end">
                                    <button type="button" onClick={() => removeSupplyRow(selectedVisit.id, index)} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700">
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {completeForm.supplies_used.length === 0 ? <div className="text-sm text-slate-500">If left empty, the backend will use the reserved supplies automatically.</div> : null}
                            </div>

                            <button type="button" onClick={() => void completeVisit(selectedVisit.id)} disabled={activeVisit === selectedVisit.id} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                              {activeVisit === selectedVisit.id ? "Working..." : "Complete Visit"}
                            </button>
                          </div>
                        );
                      })()}
                    </Panel>
                  ) : (
                    <Panel title="Complete Visit" description="Finish a confirmed visit and hand it into report and invoice generation.">
                      <div className="text-sm text-slate-500">Only confirmed visits can be completed.</div>
                    </Panel>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
