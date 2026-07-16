"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Campaign, Clinic, Conversation, Lead, LeadStatus, User } from "@/lib/types";
import { formatLocalDateTime, formatRelativeDateLabel } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { StatCard } from "@/components/stat-card";

type LeadForm = {
  campaign_id: string;
  platform: string;
  phone: string;
  name: string;
  lead_status_id: string;
};

const initialForm: LeadForm = {
  campaign_id: "",
  platform: "whatsapp",
  phone: "",
  name: "",
  lead_status_id: "",
};

type LeadDetailsView = "overview" | "conversations" | "actions";
const NEXT_QUEUE_OPTION = "__next_queue__";

function getLeadDisplayName(lead?: Lead | (Lead & { arabic_name?: string | null }) | null) {
  if (!lead) return "Unknown lead";
  return lead.name || (lead as Lead & { arabic_name?: string | null }).arabic_name || lead.profile_name || `Lead #${lead.id}`;
}

function getLeadStatusDisplay(lead: Lead) {
  return lead.lead_status?.label || lead.lead_status?.key || String(lead.lead_status_id ?? "new");
}

function getLeadStatusColor(lead: Lead) {
  return lead.lead_status?.color || null;
}

export function LeadsWorkspaceV2() {
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("lead");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLeadView, setSelectedLeadView] = useState<LeadDetailsView>("overview");
  const [assignments, setAssignments] = useState<Record<number, { clinicId: string; userId: string; leadStatusId: string }>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("all");
  const [clinicAssignedStatusFilter, setClinicAssignedStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<LeadForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<number | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();

    return leads.filter((lead) => {
      const leadStatus = lead.lead_status?.key || String(lead.lead_status_id ?? "new");
      const matchesSearch =
        term.length === 0 ||
        [lead.name, lead.profile_name, lead.phone, lead.platform, String(lead.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      const matchesStatus = statusFilter === "all" || leadStatus === statusFilter;
      const matchesAssignmentStatus =
        assignmentStatusFilter === "all" ||
        (assignmentStatusFilter === "assigned" && Boolean(lead.assignment_state?.user_id)) ||
        (assignmentStatusFilter === "unassigned" && !lead.assignment_state?.user_id);
      const matchesClinicAssignedStatus =
        clinicAssignedStatusFilter === "all" ||
        (clinicAssignedStatusFilter === "assigned" && Boolean(lead.clinic_id)) ||
        (clinicAssignedStatusFilter === "unassigned" && !lead.clinic_id);

      return matchesSearch && matchesStatus && matchesAssignmentStatus && matchesClinicAssignedStatus;
    });
  }, [assignmentStatusFilter, clinicAssignedStatusFilter, leads, search, statusFilter]);

  const selectedLead = useMemo(
    () => filteredLeads.find((lead) => lead.id === selectedLeadId) ?? leads.find((lead) => lead.id === selectedLeadId) ?? filteredLeads[0] ?? leads[0] ?? null,
    [filteredLeads, leads, selectedLeadId],
  );

  useEffect(() => {
    if (!selectedLead) {
      return;
    }

    setAssignments((current) => ({
      ...current,
      [selectedLead.id]: {
        clinicId: current[selectedLead.id]?.clinicId ?? (selectedLead.clinic_id ? String(selectedLead.clinic_id) : ""),
        userId: current[selectedLead.id]?.userId ?? (selectedLead.assignment_state?.user_id ? String(selectedLead.assignment_state.user_id) : ""),
        leadStatusId: current[selectedLead.id]?.leadStatusId ?? (selectedLead.lead_status_id ? String(selectedLead.lead_status_id) : ""),
      },
    }));
  }, [selectedLead]);

  const stats = useMemo(() => {
    const assignedCount = leads.filter((lead) => Boolean(lead.assignment_state?.user_id)).length;
    const clinicCount = leads.filter((lead) => Boolean(lead.clinic_id)).length;
    const conversationCount = leads.reduce((sum, lead) => sum + (lead.conversations?.length ?? 0), 0);
    const medicalRecordLeadCount = leads.filter((lead) => (lead.medical_records_count ?? 0) > 0).length;

    return {
      total: leads.length,
      assignedCount,
      clinicCount,
      conversationCount,
      medicalRecordLeadCount,
    };
  }, [leads]);

  async function load(options?: { silent?: boolean }) {
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

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
      setSelectedLeadId((current) => {
        if (leadFromQuery) {
          const requestedId = Number(leadFromQuery);
          if (!Number.isNaN(requestedId) && leadRows.some((lead) => lead.id === requestedId)) {
            return requestedId;
          }
        }

        if (current && leadRows.some((lead) => lead.id === current)) {
          return current;
        }

        return leadRows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leads.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [leadFromQuery]);

  useEffect(() => {
    if (leadFromQuery && selectedLeadId) {
      setDetailsOpen(true);
    }
  }, [leadFromQuery, selectedLeadId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    setCreateError(null);
    setCreateNotice(null);

    try {
      await mutateJson<Lead>("/leads", "POST", {
        campaign_id: form.campaign_id ? Number(form.campaign_id) : null,
        platform: form.platform,
        phone: form.phone,
        name: form.name || null,
        lead_status_id: form.lead_status_id ? Number(form.lead_status_id) : null,
      });
      setForm(initialForm);
      setCreateNotice("Lead created successfully.");
      await load({ silent: true });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Unable to create lead.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLeadActions(leadId: number) {
    const lead = leads.find((row) => row.id === leadId);
    if (!lead) return;
    const assignment = assignments[leadId] ?? { clinicId: "", userId: "", leadStatusId: "" };
    const currentStatusId = lead.lead_status_id ? String(lead.lead_status_id) : "";
    const currentClinicId = lead.clinic_id ? String(lead.clinic_id) : "";
    const currentUserId = lead.assignment_state?.user_id ? String(lead.assignment_state.user_id) : "";
    const nextStatusId = assignment.leadStatusId || "";
    const nextClinicId = assignment.clinicId || "";
    const nextUserId = assignment.userId || "";
    const statusChanged = nextStatusId !== currentStatusId;
    const clinicChanged = nextClinicId !== currentClinicId;
    const userChanged = nextUserId !== currentUserId;

    if (!statusChanged && !clinicChanged && !userChanged) {
      setDetailsNotice("No changes to save.");
      setDetailsError(null);
      return;
    }

    setUpdatingLeadId(leadId);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      if (statusChanged && nextStatusId) {
        await mutateJson(`/leads/${leadId}`, "PATCH", {
          lead_status_id: Number(nextStatusId),
        });
      }

      if (clinicChanged && nextClinicId) {
        await mutateJson(`/leads/${leadId}/assign-clinic`, "PATCH", {
          clinic_id: Number(nextClinicId),
        });
      }

      if (userChanged) {
        if (nextUserId === NEXT_QUEUE_OPTION) {
          await mutateJson(`/call-center/leads/${leadId}/assign-next`, "POST", {});
        } else if (nextUserId) {
          await mutateJson("/call-center/leads/assign", "POST", {
            lead_id: leadId,
            user_id: Number(nextUserId),
          });
        }
      }

      await load({ silent: true });
      setDetailsNotice("Lead actions saved successfully.");
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to save lead actions.");
    } finally {
      setUpdatingLeadId(null);
    }
  }

  async function deleteLead(leadId: number) {
    setDeletingLeadId(leadId);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await removeResource(`/leads/${leadId}`);
      setNotice(`Lead #${leadId} deleted successfully.`);
      if (selectedLeadId === leadId) {
        setSelectedLeadId(null);
        setDetailsOpen(false);
      }
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete lead.");
    } finally {
      setDeletingLeadId(null);
    }
  }

  function openLeadDetails(leadId: number) {
    setSelectedLeadId(leadId);
    setSelectedLeadView("overview");
    setDetailsError(null);
    setDetailsNotice(null);
    setDetailsOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Handle intake, routing, clinic handoff, and assignment context from one CRM workspace."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              New Lead
            </button>
            <button
              type="button"
              onClick={() => void load({ silent: true })}
              className="rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Leads" value={stats.total} hint="Pipeline records currently visible to your role." />
        <StatCard label="Assigned Leads" value={stats.assignedCount} hint="Leads already routed to a specific user." />
        <StatCard label="Clinic Handoffs" value={stats.clinicCount} hint="Leads already linked to a clinic for treatment ownership." />
        <StatCard label="Linked Conversations" value={stats.conversationCount} hint="CRM conversations currently attached to the loaded leads." />
        <StatCard label="Leads With Records" value={stats.medicalRecordLeadCount} hint="Leads that already have at least one medical record on file." />
      </div>

      <Panel title="Lead Queue" description="Recent pipeline entries with assignment state, clinic handoff, lifecycle status, and record visibility.">
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <WorkflowInput label="Search" name="search" value={search} onChange={setSearch} placeholder="Name, phone, platform, or lead id" />
          <WorkflowSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ label: "All statuses", value: "all" }, ...statuses.map((status) => ({ label: status.label, value: status.key || String(status.id) }))]}
          />
          <WorkflowSelect
            label="Assignment Status"
            value={assignmentStatusFilter}
            onChange={setAssignmentStatusFilter}
            options={[
              { label: "All leads", value: "all" },
              { label: "Assigned", value: "assigned" },
              { label: "Unassigned", value: "unassigned" },
            ]}
          />
          <WorkflowSelect
            label="Clinic Assigned Status"
            value={clinicAssignedStatusFilter}
            onChange={setClinicAssignedStatusFilter}
            options={[
              { label: "All leads", value: "all" },
              { label: "Assigned", value: "assigned" },
              { label: "Unassigned", value: "unassigned" },
            ]}
          />
        </div>

        {loading ? <div className="text-sm text-slate-500">Loading leads...</div> : null}

        {!loading ? (
          <div className="space-y-3">
            {filteredLeads.map((lead) => {
              const assignedUserName =
                lead.assignment_state?.user?.name ||
                users.find((user) => user.id === lead.assignment_state?.user_id)?.name;
              const active = selectedLead?.id === lead.id;
              const medicalRecordCount = lead.medical_records_count ?? 0;

              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => openLeadDetails(lead.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300"}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="text-sm font-semibold">{getLeadDisplayName(lead)}</div>
                      <div className={`mt-1 text-sm ${active ? "text-slate-200" : "text-slate-600"}`}>
                        {lead.phone || "No phone"} | {lead.platform || "Unknown channel"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {medicalRecordCount > 0 ? (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-700"}`}>
                          {medicalRecordCount} record{medicalRecordCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      <StatusBadge value={getLeadStatusDisplay(lead)} color={getLeadStatusColor(lead)} />
                      <span className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>#{lead.id}</span>
                    </div>
                  </div>
                  <div className={`mt-3 grid gap-2 text-xs md:grid-cols-4 ${active ? "text-slate-300" : "text-slate-500"}`}>
                    <div>Agent: {assignedUserName || "Unassigned"}</div>
                    <div>Clinic: {lead.clinic?.name || "Not linked"}</div>
                    <div>Records: {medicalRecordCount}</div>
                    <div>Created: {formatLocalDateTime(lead.created_at)}</div>
                  </div>
                </button>
              );
            })}
            {filteredLeads.length === 0 ? <div className="text-sm text-slate-500">No leads match the current filters.</div> : null}
          </div>
        ) : null}
      </Panel>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-950">Create Lead</div>
                <div className="mt-1 text-sm text-slate-600">Manual intake for phone, channel, optional campaign, and starting pipeline status.</div>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-5 py-5">
              {createError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{createError}</div> : null}
              {createNotice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{createNotice}</div> : null}
              <form className="space-y-4" onSubmit={handleSubmit}>
                <WorkflowSelect
                  label="Campaign"
                  value={form.campaign_id}
                  onChange={(value) => setForm((current) => ({ ...current, campaign_id: value }))}
                  options={campaigns.map((campaign) => ({ label: campaign.name, value: String(campaign.id) }))}
                  emptyLabel="No campaign"
                />
                <WorkflowSelect
                  label="Platform"
                  value={form.platform}
                  onChange={(value) => setForm((current) => ({ ...current, platform: value }))}
                  options={[
                    { label: "WhatsApp", value: "whatsapp" },
                    { label: "Facebook", value: "facebook" },
                    { label: "Instagram", value: "instagram" },
                    { label: "TikTok", value: "tiktok" },
                    { label: "Snapchat", value: "snapchat" },
                    { label: "Twitter", value: "twitter" },
                    { label: "YouTube", value: "youtube" },
                    { label: "Cold Call", value: "cold_call" },
                  ]}
                  required
                />
                <WorkflowInput label="Phone" name="phone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} placeholder="2010..." required />
                <WorkflowInput label="Name" name="name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="Patient name" required />
                {statuses.length > 0 ? (
                  <WorkflowSelect
                    label="Lead Status"
                    value={form.lead_status_id}
                    onChange={(value) => setForm((current) => ({ ...current, lead_status_id: value }))}
                    options={statuses.map((status) => ({ label: status.label, value: String(status.id) }))}
                    emptyLabel="No status"
                  />
                ) : null}
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {saving ? "Creating..." : "Create Lead"}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {detailsOpen && selectedLead ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold text-slate-950">{getLeadDisplayName(selectedLead)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span>{selectedLead.phone || "No phone"}</span>
                  <span>{selectedLead.platform || "Unknown channel"}</span>
                  {selectedLead.clinic?.name ? <span>{selectedLead.clinic.name}</span> : null}
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
                  { key: "conversations", label: "Conversation" },
                  { key: "actions", label: "Actions" },
                ].map((tab) => {
                  const active = selectedLeadView === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedLeadView(tab.key as LeadDetailsView)}
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
              {selectedLeadView === "overview" ? (
                <div className="space-y-5">
                  <Panel title="Profile" description="Current lead state, handoff timing, and record access.">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{getLeadDisplayName(selectedLead)}</div>
                        <div className="mt-1 text-sm text-slate-600">{selectedLead.phone || "No phone"} {selectedLead.platform ? `• ${selectedLead.platform}` : ""}</div>
                      </div>
                      <StatusBadge value={getLeadStatusDisplay(selectedLead)} color={getLeadStatusColor(selectedLead)} />
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                      <div>Created: {formatLocalDateTime(selectedLead.created_at)}</div>
                      <div>Clinic handoff: {formatLocalDateTime(selectedLead.clinic_assigned_at)}</div>
                      <div>Assigned clinic: {selectedLead.clinic?.name || "Not linked yet"}</div>
                      <div>Linked conversations: {selectedLead.conversations?.length ?? 0}</div>
                      <div>Medical records: {selectedLead.medical_records_count ?? 0}</div>
                    </div>

                    <div className="mt-4">
                      <Link
                        href={`/medical-records?lead=${selectedLead.id}`}
                        className="inline-flex rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Open Medical Records
                      </Link>
                    </div>
                  </Panel>
                </div>
              ) : null}

              {selectedLeadView === "conversations" ? (
                <div className="space-y-5">
                  <Panel title="Linked Threads" description="Conversation history currently attached to this lead.">
                    <div className="space-y-3">
                      {(selectedLead.conversations ?? []).map((conversation: Conversation) => (
                        <Link key={conversation.id} href={`/agent?conversation=${conversation.id}`} className="block rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 transition hover:border-slate-300 hover:bg-white">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-slate-900">Conversation #{conversation.id}</div>
                            <StatusBadge value={conversation.lead_status || conversation.status || "active"} />
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                            <div>First touch: {formatLocalDateTime(conversation.first_message_time)}</div>
                            <div>Last touch: {formatLocalDateTime(conversation.last_message_time)}</div>
                            <div>Converted: {formatLocalDateTime(conversation.converted_at)}</div>
                            <div>{formatRelativeDateLabel(conversation.last_message_time)}</div>
                          </div>
                        </Link>
                      ))}
                      {(selectedLead.conversations?.length ?? 0) === 0 ? <div className="text-sm text-slate-500">No conversations linked to this lead yet.</div> : null}
                    </div>
                  </Panel>
                </div>
              ) : null}

              {selectedLeadView === "actions" ? (
                <div className="space-y-5">
                  <Panel title="Actions" description="Review current ownership and handoff values, change what you need, then save once.">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                      <WorkflowSelect
                        label="Assigned User"
                        value={assignments[selectedLead.id]?.userId ?? (selectedLead.assignment_state?.user_id ? String(selectedLead.assignment_state.user_id) : "")}
                        onChange={(value) =>
                          setAssignments((current) => ({
                            ...current,
                            [selectedLead.id]: {
                              clinicId: current[selectedLead.id]?.clinicId ?? "",
                              userId: value,
                              leadStatusId: current[selectedLead.id]?.leadStatusId ?? "",
                            },
                          }))
                        }
                        options={[
                          { label: "Next in queue", value: NEXT_QUEUE_OPTION },
                          ...users.map((user) => ({ label: user.name, value: String(user.id) })),
                        ]}
                        emptyLabel="Unassigned"
                      />
                      <WorkflowSelect
                        label="Assigned Clinic"
                        value={assignments[selectedLead.id]?.clinicId ?? (selectedLead.clinic_id ? String(selectedLead.clinic_id) : "")}
                        onChange={(value) =>
                          setAssignments((current) => ({
                            ...current,
                            [selectedLead.id]: {
                              clinicId: value,
                              userId: current[selectedLead.id]?.userId ?? "",
                              leadStatusId: current[selectedLead.id]?.leadStatusId ?? "",
                            },
                          }))
                        }
                        options={clinics.map((clinic) => ({ label: clinic.name, value: String(clinic.id) }))}
                        emptyLabel="Unassigned"
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] xl:grid-cols-1 xl:items-end">
                      <WorkflowSelect
                        label="Lead Status"
                        value={assignments[selectedLead.id]?.leadStatusId ?? String(selectedLead.lead_status_id ?? "")}
                        onChange={(value) =>
                          setAssignments((current) => ({
                            ...current,
                            [selectedLead.id]: {
                              clinicId: current[selectedLead.id]?.clinicId ?? "",
                              userId: current[selectedLead.id]?.userId ?? "",
                              leadStatusId: value,
                            },
                          }))
                        }
                        options={statuses.map((status) => ({ label: status.label, value: String(status.id) }))}
                      />
                      <button
                        type="button"
                        onClick={() => void saveLeadActions(selectedLead.id)}
                        disabled={updatingLeadId === selectedLead.id || statuses.length === 0}
                        className="rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingLeadId === selectedLead.id ? "Saving..." : "Save Changes"}
                      </button>
                    </div>

                    <div className="mt-5 border-t border-[var(--line)] pt-4">
                      <button
                        type="button"
                        onClick={() => void deleteLead(selectedLead.id)}
                        disabled={deletingLeadId === selectedLead.id}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingLeadId === selectedLead.id ? "Deleting..." : "Delete Lead"}
                      </button>
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
