"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchCollection, mutateJson } from "@/lib/api";
import type { Clinic, Lead, User, Visit } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { WorkflowTextarea } from "@/components/workflow-textarea";

type VisitForm = {
  lead_id: string;
  user_id: string;
  clinic_id: string;
  visit_date: string;
  diagnosis: string;
  body: string;
};

type CompleteForm = {
  diagnosis: string;
  treatment_notes: string;
  body: string;
};

const initialVisitForm: VisitForm = {
  lead_id: "",
  user_id: "",
  clinic_id: "",
  visit_date: "",
  diagnosis: "",
  body: "",
};

const initialCompleteForm: CompleteForm = {
  diagnosis: "",
  treatment_notes: "",
  body: "",
};

export function VisitsWorkspace() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [form, setForm] = useState<VisitForm>(initialVisitForm);
  const [completeForms, setCompleteForms] = useState<Record<number, CompleteForm>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeVisit, setActiveVisit] = useState<number | null>(null);

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
        visit_date: form.visit_date,
        diagnosis: form.diagnosis || null,
        body: form.body || null,
      });
      setForm(initialVisitForm);
      setNotice("Visit created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create visit.");
    } finally {
      setSaving(false);
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
      });
      setNotice("Visit completed successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete visit.");
    } finally {
      setActiveVisit(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visits"
        description="Schedule visits, move them through their lifecycle, and create reports from the same workspace."
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="Visit Lifecycle"
          description="Confirm, cancel, miss, or complete visits directly against the backend flow endpoints."
        >
          {loading ? (
            <div className="text-sm text-slate-500">Loading visits...</div>
          ) : (
            <div className="space-y-4">
              {visits.map((visit) => {
                const formState = completeForms[visit.id] ?? initialCompleteForm;

                return (
                  <div key={visit.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">
                          Visit #{visit.id} • Lead #{visit.lead_id}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Clinic #{visit.clinic_id ?? "—"} • {visit.visit_date || visit.scheduled_date || "No date"}
                        </div>
                      </div>
                      <StatusBadge value={visit.status} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runAction(visit.id, "confirm")}
                        disabled={activeVisit === visit.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => runAction(visit.id, "miss")}
                        disabled={activeVisit === visit.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                      >
                        Mark Missed
                      </button>
                      <button
                        type="button"
                        onClick={() => runAction(visit.id, "cancel")}
                        disabled={activeVisit === visit.id}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <WorkflowInput
                        label="Diagnosis"
                        name={`diagnosis-${visit.id}`}
                        value={formState.diagnosis}
                        onChange={(value) =>
                          setCompleteForms((current) => ({
                            ...current,
                            [visit.id]: { ...formState, diagnosis: value },
                          }))
                        }
                      />
                      <WorkflowInput
                        label="Treatment Notes"
                        name={`treatment_notes-${visit.id}`}
                        value={formState.treatment_notes}
                        onChange={(value) =>
                          setCompleteForms((current) => ({
                            ...current,
                            [visit.id]: { ...formState, treatment_notes: value },
                          }))
                        }
                      />
                      <WorkflowInput
                        label="Body"
                        name={`body-${visit.id}`}
                        value={formState.body}
                        onChange={(value) =>
                          setCompleteForms((current) => ({
                            ...current,
                            [visit.id]: { ...formState, body: value },
                          }))
                        }
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => completeVisit(visit.id)}
                      disabled={activeVisit === visit.id}
                      className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                    >
                      {activeVisit === visit.id ? "Working..." : "Complete Visit"}
                    </button>
                  </div>
                );
              })}
              {visits.length === 0 ? <div className="text-sm text-slate-500">No visits yet.</div> : null}
            </div>
          )}
        </Panel>

        <Panel
          title="Schedule Visit"
          description="Create a new visit using the required lead, user, clinic, and date fields."
        >
          <form className="space-y-4" onSubmit={handleCreate}>
            <WorkflowSelect
              label="Lead"
              value={form.lead_id}
              onChange={(value) => setForm((current) => ({ ...current, lead_id: value }))}
              options={leads.map((lead) => ({
                label: `${lead.name || lead.profile_name || `Lead #${lead.id}`}`,
                value: lead.id,
              }))}
              required
            />
            <WorkflowSelect
              label="Assigned User"
              value={form.user_id}
              onChange={(value) => setForm((current) => ({ ...current, user_id: value }))}
              options={users.map((user) => ({ label: user.name, value: user.id }))}
              required
            />
            <WorkflowSelect
              label="Clinic"
              value={form.clinic_id}
              onChange={(value) => setForm((current) => ({ ...current, clinic_id: value }))}
              options={clinics.map((clinic) => ({ label: clinic.name, value: clinic.id }))}
              required
            />
            <WorkflowInput
              label="Visit Date"
              name="visit_date"
              type="datetime-local"
              value={form.visit_date}
              onChange={(value) => setForm((current) => ({ ...current, visit_date: value }))}
              required
            />
            <WorkflowTextarea
              label="Diagnosis"
              value={form.diagnosis}
              onChange={(value) => setForm((current) => ({ ...current, diagnosis: value }))}
            />
            <WorkflowTextarea
              label="Notes"
              value={form.body}
              onChange={(value) => setForm((current) => ({ ...current, body: value }))}
            />
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {saving ? "Creating..." : "Create Visit"}
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
