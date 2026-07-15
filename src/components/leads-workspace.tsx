"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchCollection, mutateJson } from "@/lib/api";
import type { Campaign, Lead, LeadStatus } from "@/lib/types";
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

export function LeadsWorkspace() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [form, setForm] = useState<LeadForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [leadRows, campaignRows, statusRows] = await Promise.all([
        fetchCollection<Lead>("/leads"),
        fetchCollection<Campaign>("/campaigns"),
        fetchCollection<LeadStatus>("/lead-statuses").catch(() => []),
      ]);

      setLeads(leadRows);
      setCampaigns(campaignRows);
      setStatuses(statusRows);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Create and review CRM opportunities, then hand them off into clinic operations."
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
          title="Lead Queue"
          description="Recent leads visible to your role. Use this as the first stop for call center and agent workflows."
        >
          {loading ? (
            <div className="text-sm text-slate-500">Loading leads...</div>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      {lead.name || lead.profile_name || `Lead #${lead.id}`}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {lead.phone || "No phone"} • {lead.platform || "Unknown channel"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge value={String(lead.lead_status_id ?? "new")} />
                    <span className="text-xs text-slate-500">#{lead.id}</span>
                  </div>
                </div>
              ))}
              {leads.length === 0 ? <div className="text-sm text-slate-500">No leads yet.</div> : null}
            </div>
          )}
        </Panel>

        <Panel
          title="Create Lead"
          description="Fast intake form matching the Laravel lead creation contract."
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <WorkflowSelect
              label="Campaign"
              value={form.campaign_id}
              onChange={(value) => setForm((current) => ({ ...current, campaign_id: value }))}
              options={campaigns.map((campaign) => ({ label: campaign.name, value: String(campaign.id) }))}
              required
            />
            <WorkflowSelect
              label="Platform"
              value={form.platform}
              onChange={(value) => setForm((current) => ({ ...current, platform: value }))}
              options={[
                { label: "WhatsApp", value: "whatsapp" },
                { label: "Facebook", value: "facebook" },
                { label: "Instagram", value: "instagram" },
              ]}
              required
            />
            <WorkflowInput
              label="Phone"
              name="phone"
              value={form.phone}
              onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
              placeholder="2010..."
              required
            />
            <WorkflowInput
              label="Name"
              name="name"
              value={form.name}
              onChange={(value) => setForm((current) => ({ ...current, name: value }))}
              placeholder="Patient name"
            />
            <WorkflowInput
              label="Profile Name"
              name="profile_name"
              value={form.profile_name}
              onChange={(value) => setForm((current) => ({ ...current, profile_name: value }))}
              placeholder="Social profile name"
            />
            <WorkflowInput
              label="WhatsApp ID"
              name="whatsapp_id"
              value={form.whatsapp_id}
              onChange={(value) => setForm((current) => ({ ...current, whatsapp_id: value }))}
              placeholder="Optional platform identifier"
            />
            {statuses.length > 0 ? (
              <WorkflowSelect
                label="Lead Status"
                value={form.lead_status_id}
                onChange={(value) => setForm((current) => ({ ...current, lead_status_id: value }))}
                options={statuses.map((status) => ({ label: status.label, value: String(status.id) }))}
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
        </Panel>
      </div>
    </div>
  );
}
