"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson } from "@/lib/api";
import type { Campaign, Clinic, Lead, LeadStatus, User } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";

type LeadForm = {
  campaign_id: string;
  platform: string;
  phone: string;
  name: string;
  profile_name: string;
  whatsapp_id: string;
  lead_status_id: string;
};

const initialForm: LeadForm = {
  campaign_id: "",
  platform: "whatsapp",
  phone: "",
  name: "",
  profile_name: "",
  whatsapp_id: "",
  lead_status_id: "",
};

export function LeadsWorkspaceV2() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<Record<number, { clinicId: string; userId: string }>>({});
  const [form, setForm] = useState<LeadForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? leads[0] ?? null,
    [leads, selectedLeadId],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [leadRows, campaignRows, statusRows, clinicRows, userRows] = await Promise.all([
        fetchCollection<Lead>("/leads"),
        fetchCollection<Campaign>("/campaigns"),
        fetchCollection<LeadStatus>("/lead-statuses").catch(() => []),
        fetchCollection<Clinic>("/clinics"),
        fetchCollection<User>("/users"),
      ]);

      setLeads(leadRows);
      setCampaigns(campaignRows);
      setStatuses(statusRows);
      setClinics(clinicRows);
      setUsers(userRows);
      setSelectedLeadId((current) => current ?? leadRows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leads.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson<Lead>("/leads", "POST", {
        campaign_id: Number(form.campaign_id),
        platform: form.platform,
        phone: form.phone,
        name: form.name || null,
        profile_name: form.profile_name || null,
        whatsapp_id: form.whatsapp_id || null,
        lead_status_id: form.lead_status_id ? Number(form.lead_status_id) : null,
      });
      setForm(initialForm);
      setNotice("Lead created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create lead.");
    } finally {
      setSaving(false);
    }
  }

  async function assignClinic(leadId: number) {
    const clinicId = assignments[leadId]?.clinicId;
    if (!clinicId) return;

    setError(null);
    setNotice(null);
    try {
      await mutateJson(`/leads/${leadId}/assign-clinic`, "PATCH", {
        clinic_id: Number(clinicId),
      });
      setNotice(`Lead #${leadId} assigned to clinic successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign clinic.");
    }
  }

  async function assignAgent(leadId: number) {
    const userId = assignments[leadId]?.userId;
    if (!userId) return;

    setError(null);
    setNotice(null);
    try {
      await mutateJson("/call-center/leads/assign", "POST", {
        lead_id: leadId,
        user_id: Number(userId),
      });
      setNotice(`Lead #${leadId} assigned to user successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign user.");
    }
  }

  async function assignNext(leadId: number) {
    setError(null);
    setNotice(null);
    try {
      await mutateJson(`/call-center/leads/${leadId}/assign-next`, "POST", {});
      setNotice(`Lead #${leadId} assigned to the next user in queue.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign next user.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Handle intake, assignment, and clinic handoff from one CRM workspace."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Lead Queue" description="Recent pipeline entries with assignment state, clinic handoff, and lifecycle status.">
          {loading ? (
            <div className="text-sm text-slate-500">Loading leads...</div>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => {
                const assignedUserName = users.find((user) => user.id === lead.assignment_state?.user_id)?.name;
                const active = selectedLead?.id === lead.id;

                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300"}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold">{lead.name || lead.profile_name || `Lead #${lead.id}`}</div>
                        <div className={`mt-1 text-sm ${active ? "text-slate-200" : "text-slate-600"}`}>
                          {lead.phone || "No phone"} | {lead.platform || "Unknown channel"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge value={lead.lead_status?.key || String(lead.lead_status_id ?? "new")} />
                        <span className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>#{lead.id}</span>
                      </div>
                    </div>
                    <div className={`mt-3 grid gap-2 text-xs md:grid-cols-3 ${active ? "text-slate-300" : "text-slate-500"}`}>
                      <div>Agent: {assignedUserName || "Unassigned"}</div>
                      <div>Clinic: {lead.clinic?.name || "Not linked"}</div>
                      <div>Created: {formatLocalDateTime(lead.created_at)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Lead Actions" description="Assign the selected lead to an agent, or route it to the clinic that will own treatment.">
            {selectedLead ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">{selectedLead.name || selectedLead.profile_name || `Lead #${selectedLead.id}`}</div>
                  <div className="mt-2 grid gap-2 text-sm text-slate-600">
                    <div>Phone: {selectedLead.phone || "—"}</div>
                    <div>Channel: {selectedLead.platform || "—"}</div>
                    <div>Assigned clinic: {selectedLead.clinic?.name || "Not linked yet"}</div>
                    <div>Clinic handoff: {formatLocalDateTime(selectedLead.clinic_assigned_at)}</div>
                  </div>
                </div>

                <WorkflowSelect
                  label="Assign To User"
                  value={assignments[selectedLead.id]?.userId ?? ""}
                  onChange={(value) =>
                    setAssignments((current) => ({
                      ...current,
                      [selectedLead.id]: { clinicId: current[selectedLead.id]?.clinicId ?? "", userId: value },
                    }))
                  }
                  options={users.map((user) => ({ label: user.name, value: user.id }))}
                />
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void assignAgent(selectedLead.id)} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
                    Assign User
                  </button>
                  <button type="button" onClick={() => void assignNext(selectedLead.id)} className="rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700">
                    Assign Next In Queue
                  </button>
                </div>

                <WorkflowSelect
                  label="Assign To Clinic"
                  value={assignments[selectedLead.id]?.clinicId ?? ""}
                  onChange={(value) =>
                    setAssignments((current) => ({
                      ...current,
                      [selectedLead.id]: { clinicId: value, userId: current[selectedLead.id]?.userId ?? "" },
                    }))
                  }
                  options={clinics.map((clinic) => ({ label: clinic.name, value: clinic.id }))}
                />
                <button type="button" onClick={() => void assignClinic(selectedLead.id)} className="rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700">
                  Assign Clinic
                </button>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a lead to manage assignments.</div>
            )}
          </Panel>

          <Panel title="Create Lead" description="Fast intake form matching the backend lead creation contract.">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <WorkflowSelect label="Campaign" value={form.campaign_id} onChange={(value) => setForm((current) => ({ ...current, campaign_id: value }))} options={campaigns.map((campaign) => ({ label: campaign.name, value: campaign.id }))} required />
              <WorkflowSelect label="Platform" value={form.platform} onChange={(value) => setForm((current) => ({ ...current, platform: value }))} options={[{ label: "WhatsApp", value: "whatsapp" }, { label: "Facebook", value: "facebook" }, { label: "Instagram", value: "instagram" }]} required />
              <WorkflowInput label="Phone" name="phone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} placeholder="2010..." required />
              <WorkflowInput label="Name" name="name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Patient name" />
              <WorkflowInput label="Profile Name" name="profile_name" value={form.profile_name} onChange={(value) => setForm((current) => ({ ...current, profile_name: value }))} placeholder="Social profile name" />
              <WorkflowInput label="WhatsApp ID" name="whatsapp_id" value={form.whatsapp_id} onChange={(value) => setForm((current) => ({ ...current, whatsapp_id: value }))} placeholder="Optional platform identifier" />
              {statuses.length > 0 ? (
                <WorkflowSelect label="Lead Status" value={form.lead_status_id} onChange={(value) => setForm((current) => ({ ...current, lead_status_id: value }))} options={statuses.map((status) => ({ label: status.label, value: status.id }))} />
              ) : null}
              <button type="submit" disabled={saving} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {saving ? "Creating..." : "Create Lead"}
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
