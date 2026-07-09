"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Campaign } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { WorkflowTextarea } from "@/components/workflow-textarea";
import { StatCard } from "@/components/stat-card";

type CampaignForm = {
  name: string;
  platform: string;
  description: string;
  start_date: string;
  end_date: string;
  budget: string;
  currency: string;
  status: string;
};

const initialForm: CampaignForm = {
  name: "",
  platform: "facebook",
  description: "",
  start_date: "",
  end_date: "",
  budget: "",
  currency: "",
  status: "",
};

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toForm(campaign?: Campaign | null): CampaignForm {
  if (!campaign) {
    return initialForm;
  }

  return {
    name: campaign.name || "",
    platform: campaign.platform || "facebook",
    description: campaign.description || "",
    start_date: toDateInput(campaign.start_date),
    end_date: toDateInput(campaign.end_date),
    budget: campaign.budget != null ? String(campaign.budget) : "",
    currency: campaign.currency || "",
    status: campaign.status || "",
  };
}

function buildPayload(form: CampaignForm) {
  return {
    name: form.name,
    platform: form.platform,
    description: form.description || null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    budget: form.budget ? Number(form.budget) : null,
    currency: form.currency || null,
    status: form.status || null,
  };
}

export function CampaignsWorkspace() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState<CampaignForm>(initialForm);
  const [editForm, setEditForm] = useState<CampaignForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      if (!term) {
        return true;
      }

      return [
        campaign.name,
        campaign.platform,
        campaign.status,
        campaign.currency,
        campaign.description,
        String(campaign.id),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [campaigns, search]);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedId) ?? filteredCampaigns[0] ?? campaigns[0] ?? null,
    [campaigns, filteredCampaigns, selectedId],
  );

  const stats = useMemo(
    () => ({
      total: campaigns.length,
      active: campaigns.filter((campaign) => (campaign.status || "").toLowerCase() === "active").length,
      budgeted: campaigns.filter((campaign) => Number(campaign.budget || 0) > 0).length,
      platforms: new Set(campaigns.map((campaign) => campaign.platform).filter(Boolean)).size,
    }),
    [campaigns],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchCollection<Campaign>("/campaigns");
      setCampaigns(payload);
      setSelectedId((current) => current ?? payload[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load campaigns.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  useEffect(() => {
    setEditForm(toForm(selectedCampaign));
  }, [selectedCampaign]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCreate(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson("/campaigns", "POST", buildPayload(createForm));
      setCreateForm(initialForm);
      setNotice("Campaign created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create campaign.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function updateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCampaign) return;

    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      await mutateJson(`/campaigns/${selectedCampaign.id}`, "PATCH", buildPayload(editForm));
      setNotice(`Campaign "${editForm.name}" updated successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update campaign.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteCampaign(id: number) {
    setDeletingId(id);
    setError(null);
    setNotice(null);

    try {
      await removeResource(`/campaigns/${id}`);
      setNotice(`Campaign #${id} deleted successfully.`);
      if (selectedId === id) {
        setSelectedId(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete campaign.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Set up acquisition campaigns with platform, timing, budget, and status context so lead sources stay understandable."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Campaigns" value={stats.total} hint="Campaign records returned by the API." />
        <StatCard label="Active" value={stats.active} hint="Campaigns explicitly marked active." />
        <StatCard label="With Budget" value={stats.budgeted} hint="Campaigns carrying a budget value." />
        <StatCard label="Platforms" value={stats.platforms} hint="Distinct marketing platforms currently in use." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Campaign List" description="Search and select a campaign to review or edit it.">
          <div className="mb-4">
            <WorkflowInput label="Search" name="campaign-search" value={search} onChange={setSearch} placeholder="Name, platform, status, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading campaigns...</div>
          ) : (
            <div className="space-y-3">
              {filteredCampaigns.map((campaign) => {
                const active = selectedCampaign?.id === campaign.id;
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => setSelectedId(campaign.id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{campaign.name}</div>
                        <div className={`mt-1 text-sm ${active ? "text-slate-300" : "text-slate-600"}`}>{campaign.platform || "No platform"}</div>
                      </div>
                      <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
                        {campaign.status || "Draft"}
                      </div>
                    </div>
                    <div className={`mt-3 flex flex-wrap gap-2 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                      {campaign.currency && campaign.budget != null ? <span>{campaign.budget} {campaign.currency}</span> : null}
                      {campaign.start_date ? <span>Starts {formatLocalDateTime(campaign.start_date, { year: "numeric", month: "short", day: "numeric" })}</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Create Campaign" description="Capture enough context that downstream lead reporting stays readable.">
            <form className="space-y-4" onSubmit={createCampaign}>
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowInput label="Name" name="create-campaign-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} required />
                <WorkflowSelect label="Platform" value={createForm.platform} onChange={(value) => setCreateForm((current) => ({ ...current, platform: value }))} options={[{ label: "Facebook", value: "facebook" }, { label: "Instagram", value: "instagram" }, { label: "WhatsApp", value: "whatsapp" }, { label: "Google", value: "google" }, { label: "Other", value: "other" }]} required allowEmpty={false} />
                <WorkflowInput label="Start Date" name="create-campaign-start" type="date" value={createForm.start_date} onChange={(value) => setCreateForm((current) => ({ ...current, start_date: value }))} />
                <WorkflowInput label="End Date" name="create-campaign-end" type="date" value={createForm.end_date} onChange={(value) => setCreateForm((current) => ({ ...current, end_date: value }))} />
                <WorkflowInput label="Budget" name="create-campaign-budget" type="number" value={createForm.budget} onChange={(value) => setCreateForm((current) => ({ ...current, budget: value }))} />
                <WorkflowInput label="Currency" name="create-campaign-currency" value={createForm.currency} onChange={(value) => setCreateForm((current) => ({ ...current, currency: value }))} placeholder="EGP" />
                <WorkflowInput label="Status" name="create-campaign-status" value={createForm.status} onChange={(value) => setCreateForm((current) => ({ ...current, status: value }))} placeholder="active, paused, draft" />
              </div>
              <WorkflowTextarea label="Description" value={createForm.description} onChange={(value) => setCreateForm((current) => ({ ...current, description: value }))} placeholder="Acquisition goal, targeting notes, or messaging context" />
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create Campaign"}
              </button>
            </form>
          </Panel>

          <Panel title="Selected Campaign" description="Keep campaign naming, timing, and budget clean over time.">
            {selectedCampaign ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">{selectedCampaign.name}</div>
                  <div className="mt-1 text-sm text-slate-600">{selectedCampaign.platform || "No platform"}</div>
                </div>

                <form className="space-y-4" onSubmit={updateCampaign}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <WorkflowInput label="Name" name="edit-campaign-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} required />
                    <WorkflowSelect label="Platform" value={editForm.platform} onChange={(value) => setEditForm((current) => ({ ...current, platform: value }))} options={[{ label: "Facebook", value: "facebook" }, { label: "Instagram", value: "instagram" }, { label: "WhatsApp", value: "whatsapp" }, { label: "Google", value: "google" }, { label: "Other", value: "other" }]} required allowEmpty={false} />
                    <WorkflowInput label="Start Date" name="edit-campaign-start" type="date" value={editForm.start_date} onChange={(value) => setEditForm((current) => ({ ...current, start_date: value }))} />
                    <WorkflowInput label="End Date" name="edit-campaign-end" type="date" value={editForm.end_date} onChange={(value) => setEditForm((current) => ({ ...current, end_date: value }))} />
                    <WorkflowInput label="Budget" name="edit-campaign-budget" type="number" value={editForm.budget} onChange={(value) => setEditForm((current) => ({ ...current, budget: value }))} />
                    <WorkflowInput label="Currency" name="edit-campaign-currency" value={editForm.currency} onChange={(value) => setEditForm((current) => ({ ...current, currency: value }))} />
                    <WorkflowInput label="Status" name="edit-campaign-status" value={editForm.status} onChange={(value) => setEditForm((current) => ({ ...current, status: value }))} />
                  </div>
                  <WorkflowTextarea label="Description" value={editForm.description} onChange={(value) => setEditForm((current) => ({ ...current, description: value }))} />
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={savingEdit} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                      {savingEdit ? "Saving..." : "Save Changes"}
                    </button>
                    <button type="button" onClick={() => void deleteCampaign(selectedCampaign.id)} disabled={deletingId === selectedCampaign.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                      {deletingId === selectedCampaign.id ? "Deleting..." : "Delete Campaign"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a campaign to edit it.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
