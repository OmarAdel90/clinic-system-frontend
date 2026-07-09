"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Clinic, Lead, PatientFeedback } from "@/lib/types";
import { formatLocalDateTime, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { WorkflowTextarea } from "@/components/workflow-textarea";
import { StatCard } from "@/components/stat-card";

type FeedbackForm = {
  lead_id: string;
  clinic_id: string;
  feedback_body: string;
};

const initialForm: FeedbackForm = {
  lead_id: "",
  clinic_id: "",
  feedback_body: "",
};

function toForm(feedback?: PatientFeedback | null): FeedbackForm {
  if (!feedback) {
    return initialForm;
  }

  return {
    lead_id: String(feedback.lead_id ?? ""),
    clinic_id: String(feedback.clinic_id ?? ""),
    feedback_body: feedback.feedback_body || "",
  };
}

export function PatientFeedbackWorkspace() {
  const [feedbackRows, setFeedbackRows] = useState<PatientFeedback[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [createForm, setCreateForm] = useState<FeedbackForm>(initialForm);
  const [editForm, setEditForm] = useState<FeedbackForm>(initialForm);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredFeedback = useMemo(() => {
    const term = search.trim().toLowerCase();

    return feedbackRows.filter((row) => {
      const leadName = row.lead?.name || row.lead?.profile_name || "";
      const clinicName = row.clinic?.name || "";
      return (
        !term ||
        [leadName, clinicName, row.feedback_body, String(row.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      );
    });
  }, [feedbackRows, search]);

  const selectedFeedback = useMemo(
    () => filteredFeedback.find((row) => row.id === selectedId) ?? feedbackRows.find((row) => row.id === selectedId) ?? filteredFeedback[0] ?? feedbackRows[0] ?? null,
    [feedbackRows, filteredFeedback, selectedId],
  );

  const selectedCreateLead = useMemo(
    () => leads.find((lead) => String(lead.id) === createForm.lead_id) ?? null,
    [createForm.lead_id, leads],
  );

  const selectedEditLead = useMemo(
    () => leads.find((lead) => String(lead.id) === editForm.lead_id) ?? null,
    [editForm.lead_id, leads],
  );

  const createClinicOptions = useMemo(() => {
    const clinicId = selectedCreateLead?.clinic_id;
    if (!clinicId) {
      return [];
    }

    return clinics
      .filter((clinic) => clinic.id === clinicId)
      .map((clinic) => ({ label: clinic.name, value: clinic.id }));
  }, [clinics, selectedCreateLead?.clinic_id]);

  const editClinicOptions = useMemo(() => {
    const clinicId = selectedEditLead?.clinic_id;
    if (!clinicId) {
      return [];
    }

    return clinics
      .filter((clinic) => clinic.id === clinicId)
      .map((clinic) => ({ label: clinic.name, value: clinic.id }));
  }, [clinics, selectedEditLead?.clinic_id]);

  const stats = useMemo(() => ({
    total: feedbackRows.length,
    distinctLeads: new Set(feedbackRows.map((row) => row.lead_id)).size,
    distinctClinics: new Set(feedbackRows.map((row) => row.clinic_id)).size,
    recent: feedbackRows.filter((row) => {
      const created = row.created_at ? new Date(row.created_at).getTime() : 0;
      return created >= Date.now() - 7 * 24 * 60 * 60 * 1000;
    }).length,
  }), [feedbackRows]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [feedbackPayload, leadPayload, clinicPayload] = await Promise.all([
        fetchCollection<PatientFeedback>("/patient/feedback"),
        fetchCollection<Lead>("/leads"),
        fetchCollection<Clinic>("/clinics"),
      ]);

      setFeedbackRows(feedbackPayload);
      setLeads(leadPayload);
      setClinics(clinicPayload);
      setSelectedId((current) => current ?? feedbackPayload[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load patient feedback.");
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
    setEditForm(toForm(selectedFeedback));
  }, [selectedFeedback]);

  useEffect(() => {
    if (selectedCreateLead?.clinic_id) {
      setCreateForm((current) => ({ ...current, clinic_id: String(selectedCreateLead.clinic_id) }));
    } else if (createForm.clinic_id) {
      setCreateForm((current) => ({ ...current, clinic_id: "" }));
    }
  }, [createForm.clinic_id, selectedCreateLead?.clinic_id]);

  useEffect(() => {
    if (selectedEditLead?.clinic_id) {
      setEditForm((current) => ({ ...current, clinic_id: String(selectedEditLead.clinic_id) }));
    }
  }, [selectedEditLead?.clinic_id]);

  async function createFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/patient/feedback", "POST", {
        lead_id: Number(createForm.lead_id),
        clinic_id: Number(createForm.clinic_id),
        feedback_body: createForm.feedback_body,
      });
      setCreateForm(initialForm);
      setNotice("Patient feedback created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create patient feedback.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFeedback) return;

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/patient/feedback/${selectedFeedback.id}`, "PATCH", {
        clinic_id: Number(editForm.clinic_id),
        feedback_body: editForm.feedback_body,
      });
      setNotice(`Feedback #${selectedFeedback.id} updated successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update patient feedback.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteFeedback(id: number) {
    setDeletingId(id);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/patient/feedback/${id}`);
      setNotice(`Feedback #${id} deleted successfully.`);
      if (selectedId === id) {
        setSelectedId(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete patient feedback.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patient Feedback"
        description={`Capture and review post-visit patient sentiment in ${getBrowserTimeZone()} with lead and clinic context attached.`}
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Feedback" value={stats.total} hint="Patient feedback records returned by the API." />
        <StatCard label="Distinct Leads" value={stats.distinctLeads} hint="How many patients/leads have feedback recorded." />
        <StatCard label="Distinct Clinics" value={stats.distinctClinics} hint="How many clinics are represented in the feedback stream." />
        <StatCard label="Last 7 Days" value={stats.recent} hint="Feedback created recently enough to affect current reporting." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Feedback Queue" description="Recent patient feedback with enough context to trace it back to the lead and clinic.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="feedback-search" value={search} onChange={setSearch} placeholder="Lead, clinic, feedback text, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading patient feedback...</div>
          ) : (
            <div className="space-y-4">
              {filteredFeedback.map((row) => (
                <div key={row.id} className={`rounded-xl border p-4 ${selectedFeedback?.id === row.id ? "border-slate-900 bg-white" : "border-[var(--line)] bg-[var(--surface)]"}`}>
                  <button type="button" onClick={() => setSelectedId(row.id)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{row.lead?.name || row.lead?.profile_name || `Lead #${row.lead_id}`}</div>
                        <div className="mt-1 text-sm text-slate-600">{row.clinic?.name || `Clinic #${row.clinic_id}`}</div>
                      </div>
                      <div className="text-xs text-slate-500">#{row.id}</div>
                    </div>
                    <div className="mt-3 text-sm text-slate-700 line-clamp-3">{row.feedback_body}</div>
                    <div className="mt-3 text-xs text-slate-500">Created {formatLocalDateTime(row.created_at)}</div>
                  </button>
                </div>
              ))}
              {filteredFeedback.length === 0 ? <div className="text-sm text-slate-500">No patient feedback matches the current search.</div> : null}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Feedback" description="Capture a new patient feedback note tied to a lead and clinic.">
            <form className="space-y-4" onSubmit={createFeedback}>
              <WorkflowSelect label="Lead" value={createForm.lead_id} onChange={(value) => setCreateForm((current) => ({ ...current, lead_id: value }))} options={leads.map((lead) => ({ label: lead.name || lead.profile_name || `Lead #${lead.id}`, value: lead.id }))} required />
              <WorkflowSelect label="Clinic" value={createForm.clinic_id} onChange={(value) => setCreateForm((current) => ({ ...current, clinic_id: value }))} options={createClinicOptions} required allowEmpty={false} />
              {createForm.lead_id && !selectedCreateLead?.clinic_id ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  The selected lead must be assigned to a clinic before patient feedback can be created.
                </div>
              ) : null}
              <WorkflowTextarea label="Feedback Body" value={createForm.feedback_body} onChange={(value) => setCreateForm((current) => ({ ...current, feedback_body: value }))} placeholder="Patient comments, satisfaction notes, concerns, or follow-up sentiment" />
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create Feedback"}
              </button>
            </form>
          </Panel>

          <Panel title="Selected Feedback" description="Review and update the selected patient feedback entry.">
            {selectedFeedback ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">{selectedFeedback.lead?.name || selectedFeedback.lead?.profile_name || `Lead #${selectedFeedback.lead_id}`}</div>
                  <div className="mt-1 text-sm text-slate-600">{selectedFeedback.clinic?.name || `Clinic #${selectedFeedback.clinic_id}`}</div>
                  <div className="mt-3 text-xs text-slate-500">Created {formatLocalDateTime(selectedFeedback.created_at)}</div>
                </div>

                <form className="space-y-4" onSubmit={updateFeedback}>
                  <WorkflowSelect label="Clinic" value={editForm.clinic_id} onChange={(value) => setEditForm((current) => ({ ...current, clinic_id: value }))} options={editClinicOptions} required allowEmpty={false} />
                  <WorkflowTextarea label="Feedback Body" value={editForm.feedback_body} onChange={(value) => setEditForm((current) => ({ ...current, feedback_body: value }))} />
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                      {savingEdit ? "Saving..." : "Save Changes"}
                    </button>
                    <button type="button" onClick={() => void deleteFeedback(selectedFeedback.id)} disabled={deletingId === selectedFeedback.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {deletingId === selectedFeedback.id ? "Deleting..." : "Delete Feedback"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a feedback item to review or edit it.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
