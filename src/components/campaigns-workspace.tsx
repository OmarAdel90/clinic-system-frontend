"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, mutateJson, removeResource } from "@/lib/api";
import type { Campaign, MetaAvailableCampaign } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";
import { WorkflowTextarea } from "@/components/workflow-textarea";
import { StatCard } from "@/components/stat-card";
import { PaginationControls } from "@/components/pagination-controls";

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

const platformOptions = [
  { label: "Facebook", value: "facebook" },
  { label: "Instagram", value: "instagram" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Google", value: "google" },
  { label: "Other", value: "other" },
];

const statusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
];
const CAMPAIGNS_PAGE_SIZE = 10;
const META_CAMPAIGNS_PAGE_SIZE = 8;

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatMetric(value?: number | null, options?: Intl.NumberFormatOptions) {
  if (value == null || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", options).format(value);
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
    meta_source: "manual",
    platform: form.platform,
    description: form.description || null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    budget: form.budget ? Number(form.budget) : null,
    currency: form.currency ? form.currency.toUpperCase() : null,
    status: form.status || null,
  };
}

export function CampaignsWorkspace() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [availableMetaCampaigns, setAvailableMetaCampaigns] = useState<MetaAvailableCampaign[]>([]);
  const [selectedMetaCampaignIds, setSelectedMetaCampaignIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [metaSearch, setMetaSearch] = useState("");
  const [createForm, setCreateForm] = useState<CampaignForm>(initialForm);
  const [editForm, setEditForm] = useState<CampaignForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [refreshingImported, setRefreshingImported] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [importingMeta, setImportingMeta] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsNotice, setDetailsNotice] = useState<string | null>(null);
  const [campaignPage, setCampaignPage] = useState(1);
  const [metaCampaignPage, setMetaCampaignPage] = useState(1);

  const filteredCampaigns = useMemo(() => {
    const term = search.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      if (!term) {
        return true;
      }

      return [
        campaign.name,
        campaign.objective,
        campaign.ad_account_id,
        campaign.meta_source,
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

  const campaignTotalPages = Math.max(1, Math.ceil(filteredCampaigns.length / CAMPAIGNS_PAGE_SIZE));
  const paginatedCampaigns = useMemo(
    () => filteredCampaigns.slice((campaignPage - 1) * CAMPAIGNS_PAGE_SIZE, campaignPage * CAMPAIGNS_PAGE_SIZE),
    [campaignPage, filteredCampaigns],
  );

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedId) ?? null,
    [campaigns, selectedId],
  );

  const filteredMetaCampaigns = useMemo(() => {
    const term = metaSearch.trim().toLowerCase();

    return availableMetaCampaigns.filter((campaign) => {
      if (campaign.imported) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.objective,
        campaign.ad_account_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [availableMetaCampaigns, metaSearch]);

  const metaCampaignTotalPages = Math.max(1, Math.ceil(filteredMetaCampaigns.length / META_CAMPAIGNS_PAGE_SIZE));
  const paginatedMetaCampaigns = useMemo(
    () => filteredMetaCampaigns.slice((metaCampaignPage - 1) * META_CAMPAIGNS_PAGE_SIZE, metaCampaignPage * META_CAMPAIGNS_PAGE_SIZE),
    [filteredMetaCampaigns, metaCampaignPage],
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load campaigns.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshImportedCampaigns() {
    setRefreshingImported(true);
    setError(null);

    try {
      await load();
    } finally {
      setRefreshingImported(false);
    }
  }

  async function loadMetaCampaigns() {
    setLoadingMeta(true);
    setMetaError(null);

    try {
      const payload = await fetchCollection<MetaAvailableCampaign>("/campaigns/meta/available");
      setAvailableMetaCampaigns(payload);
    } catch (err) {
      setAvailableMetaCampaigns([]);
      setMetaError(err instanceof Error ? err.message : "Unable to load Meta campaigns.");
    } finally {
      setLoadingMeta(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void loadMetaCampaigns();
    });
  }, []);

  useEffect(() => {
    setEditForm(toForm(selectedCampaign));
  }, [selectedCampaign]);

  useEffect(() => {
    setCampaignPage(1);
  }, [search]);

  useEffect(() => {
    setMetaCampaignPage(1);
  }, [metaSearch]);

  useEffect(() => {
    if (campaignPage > campaignTotalPages) {
      setCampaignPage(campaignTotalPages);
    }
  }, [campaignPage, campaignTotalPages]);

  useEffect(() => {
    if (metaCampaignPage > metaCampaignTotalPages) {
      setMetaCampaignPage(metaCampaignTotalPages);
    }
  }, [metaCampaignPage, metaCampaignTotalPages]);

  function openCampaign(id: string | number) {
    setSelectedId(id);
    setDetailsError(null);
    setDetailsNotice(null);
    setDetailsOpen(true);
  }

  function toggleMetaCampaign(id: string) {
    setSelectedMetaCampaignIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

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
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await mutateJson(`/campaigns/${selectedCampaign.id}`, "PATCH", buildPayload(editForm));
      setDetailsNotice(`Campaign "${editForm.name}" updated successfully.`);
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to update campaign.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteCampaign(id: string | number) {
    setDeletingId(id);
    setError(null);
    setNotice(null);
    setDetailsError(null);
    setDetailsNotice(null);

    try {
      await removeResource(`/campaigns/${id}`);
      setDetailsNotice(`Campaign #${id} deleted successfully.`);
      if (selectedId === id) {
        setSelectedId(null);
        setDetailsOpen(false);
      }
      await load();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Unable to delete campaign.");
    } finally {
      setDeletingId(null);
    }
  }

  async function importSelectedMetaCampaigns() {
    if (selectedMetaCampaignIds.length === 0) {
      setError("Select at least one Meta campaign to import.");
      return;
    }

    setImportingMeta(true);
    setError(null);
    setMetaError(null);
    setNotice(null);

    try {
      await mutateJson("/campaigns/meta/import", "POST", { campaign_ids: selectedMetaCampaignIds });
      setNotice("Selected Meta campaigns imported successfully.");
      setSelectedMetaCampaignIds([]);
      await Promise.all([load(), loadMetaCampaigns()]);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : "Unable to import Meta campaigns.");
    } finally {
      setImportingMeta(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Keep lead acquisition sources readable: campaign setup stays on the page, and each record opens in a focused popup instead of a permanent second pane."
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Campaigns" value={stats.total} hint="Campaign records returned by the API." />
        <StatCard label="Active" value={stats.active} hint="Campaigns explicitly marked active." />
        <StatCard label="With Budget" value={stats.budgeted} hint="Campaigns carrying a budget value." />
        <StatCard label="Platforms" value={stats.platforms} hint="Distinct marketing platforms currently in use." />
        <StatCard label="Meta Imports" value={campaigns.filter((campaign) => campaign.meta_source === "meta_ads").length} hint="Campaigns imported from the selected Meta ad account." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel
          title="Campaign List"
          description="Search the imported/local campaign list, then open a campaign popup to inspect or update it."
          actions={
            <button
              type="button"
              onClick={() => void refreshImportedCampaigns()}
              disabled={refreshingImported || loading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshingImported ? "Refreshing..." : "Refresh Imported"}
            </button>
          }
        >
          <div className="mb-4">
            <WorkflowInput label="Search" name="campaign-search" value={search} onChange={setSearch} placeholder="Name, platform, status, or id" />
          </div>

          {loading ? (
            <div className="text-sm text-slate-500">Loading campaigns...</div>
          ) : (
            <div className="space-y-3">
              {paginatedCampaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => openCampaign(campaign.id)}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-950">{campaign.name}</div>
                      <div className="mt-1 text-sm text-slate-600">{campaign.platform || "No platform"}</div>
                    </div>
                    <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">{campaign.status || "Draft"}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    {campaign.currency && campaign.budget != null ? <span>{campaign.budget} {campaign.currency}</span> : null}
                    {campaign.start_date ? <span>Starts {formatLocalDateTime(campaign.start_date, { year: "numeric", month: "short", day: "numeric" })}</span> : null}
                  </div>
                </button>
              ))}
              <PaginationControls page={campaignPage} totalPages={campaignTotalPages} totalItems={filteredCampaigns.length} pageSize={CAMPAIGNS_PAGE_SIZE} itemLabel="campaigns" onPageChange={setCampaignPage} />
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Import From Selected Meta Ad Account" description="The ad account is chosen in Settings. Pull its campaigns here, then import only the ones you want visible in the system.">
            <div className="space-y-4">
              {metaError ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{metaError}</div> : null}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1">
                  <WorkflowInput
                    label="Search Meta Campaigns"
                    name="meta-campaign-search"
                    value={metaSearch}
                    onChange={setMetaSearch}
                    placeholder="Campaign name, objective, ad account, or Meta id"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void loadMetaCampaigns()}
                    disabled={loadingMeta}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingMeta ? "Refreshing..." : "Refresh Meta Campaigns"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void importSelectedMetaCampaigns()}
                    disabled={importingMeta || selectedMetaCampaignIds.length === 0}
                    className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
                  >
                    {importingMeta ? "Importing..." : `Import Selected (${selectedMetaCampaignIds.length})`}
                  </button>
                </div>
              </div>

              {loadingMeta ? (
                <div className="text-sm text-slate-500">Loading campaigns from the selected Meta ad account...</div>
              ) : filteredMetaCampaigns.length > 0 ? (
                <div className="space-y-3">
                  {paginatedMetaCampaigns.map((campaign) => {
                    const selected = selectedMetaCampaignIds.includes(campaign.id);

                    return (
                      <label
                        key={campaign.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                          selected ? "border-slate-900 bg-slate-50" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleMetaCampaign(campaign.id)}
                          disabled={campaign.imported}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-950">{campaign.name}</div>
                              <div className="mt-1 break-all text-xs text-slate-500">Meta ID {campaign.id}</div>
                            </div>
                            <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                              {campaign.imported ? "Already imported" : campaign.status || "No status"}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                            {campaign.objective ? <span>{campaign.objective}</span> : null}
                            {campaign.ad_account_name ? <span>{campaign.ad_account_name}</span> : campaign.ad_account_id ? <span>Account {campaign.ad_account_id}</span> : null}
                            {campaign.currency && campaign.budget != null ? <span>{campaign.budget} {campaign.currency}</span> : null}
                            {campaign.spend != null ? <span>Spend {formatMetric(campaign.spend, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP</span> : null}
                            {campaign.impressions != null ? <span>Impressions {formatMetric(campaign.impressions)}</span> : null}
                            {campaign.clicks != null ? <span>Clicks {formatMetric(campaign.clicks)}</span> : null}
                            {campaign.ctr != null ? <span>CTR {formatMetric(campaign.ctr, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span> : null}
                            {campaign.cpc != null ? <span>CPC {formatMetric(campaign.cpc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP</span> : null}
                            {campaign.results != null ? <span>{campaign.result_label || "Results"} {formatMetric(campaign.results, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span> : null}
                            {campaign.ad_sets?.length ? <span>Ad Sets {campaign.ad_sets.length}</span> : null}
                            {campaign.start_date ? <span>Starts {formatLocalDateTime(campaign.start_date, { year: "numeric", month: "short", day: "numeric" })}</span> : null}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  <PaginationControls page={metaCampaignPage} totalPages={metaCampaignTotalPages} totalItems={filteredMetaCampaigns.length} pageSize={META_CAMPAIGNS_PAGE_SIZE} itemLabel="meta campaigns" onPageChange={setMetaCampaignPage} />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  No unimported campaigns were returned. Make sure the Meta ads access token is valid, an ad account is selected in Settings, or that there are still campaigns left to import.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Create Campaign" description="Manual campaigns still work for non-Meta sources or internal tracking. Imported Meta campaigns automatically keep Meta's own campaign id.">
            <form className="space-y-4" onSubmit={createCampaign}>
              <div className="grid gap-4 md:grid-cols-2">
                <WorkflowInput label="Name" name="create-campaign-name" value={createForm.name} onChange={(value) => setCreateForm((current) => ({ ...current, name: value }))} required />
                <WorkflowSelect label="Platform" value={createForm.platform} onChange={(value) => setCreateForm((current) => ({ ...current, platform: value }))} options={platformOptions} required allowEmpty={false} />
                <WorkflowInput label="Start Date" name="create-campaign-start" type="date" value={createForm.start_date} onChange={(value) => setCreateForm((current) => ({ ...current, start_date: value }))} />
                <WorkflowInput label="End Date" name="create-campaign-end" type="date" value={createForm.end_date} onChange={(value) => setCreateForm((current) => ({ ...current, end_date: value }))} />
                <WorkflowInput label="Budget" name="create-campaign-budget" type="number" value={createForm.budget} onChange={(value) => setCreateForm((current) => ({ ...current, budget: value }))} />
                <WorkflowInput label="Currency" name="create-campaign-currency" value={createForm.currency} onChange={(value) => setCreateForm((current) => ({ ...current, currency: value.toUpperCase() }))} placeholder="EGP" />
                <WorkflowSelect label="Status" value={createForm.status} onChange={(value) => setCreateForm((current) => ({ ...current, status: value }))} options={statusOptions} emptyLabel="No status" />
              </div>
              <WorkflowTextarea label="Description" value={createForm.description} onChange={(value) => setCreateForm((current) => ({ ...current, description: value }))} placeholder="Acquisition goal, targeting notes, or messaging context" />
              <button type="submit" disabled={savingCreate} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">
                {savingCreate ? "Saving..." : "Create Campaign"}
              </button>
            </form>
          </Panel>
        </div>
      </div>

      {detailsOpen && selectedCampaign ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-slate-950">{selectedCampaign.name}</div>
                <div className="mt-1 text-sm text-slate-600">{selectedCampaign.platform || "No platform"}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(90vh-76px)] overflow-y-auto px-5 py-5">
              {detailsError ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{detailsError}</div> : null}
              {detailsNotice ? <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{detailsNotice}</div> : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Status" value={selectedCampaign.status || "Draft"} hint="Current operating status." />
                <StatCard label="Budget" value={selectedCampaign.budget != null ? `${selectedCampaign.budget}` : "0"} hint={selectedCampaign.currency || "No currency"} />
                <StatCard label="Starts" value={selectedCampaign.start_date ? toDateInput(selectedCampaign.start_date) : "-"} hint="Campaign start date." />
                <StatCard label="Ends" value={selectedCampaign.end_date ? toDateInput(selectedCampaign.end_date) : "-"} hint="Campaign end date." />
              </div>

              <div className="mt-5">
                <Panel title="Campaign Details" description="Update campaign naming, timing, budget, and context without leaving the list view.">
                  <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Campaign ID {selectedCampaign.id}</span>
                    {selectedCampaign.ad_account_name ? <span>{selectedCampaign.ad_account_name}</span> : selectedCampaign.ad_account_id ? <span>Ad Account {selectedCampaign.ad_account_id}</span> : null}
                    {selectedCampaign.objective ? <span>{selectedCampaign.objective}</span> : null}
                    {selectedCampaign.meta_source ? <span>Source {selectedCampaign.meta_source}</span> : null}
                  </div>
                  <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Spend (EGP)" value={formatMetric(selectedCampaign.spend, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hint="Lifetime spend from Meta insights." />
                    <StatCard label="Impressions" value={formatMetric(selectedCampaign.impressions)} hint="Imported from Meta insights." />
                    <StatCard label="Clicks" value={formatMetric(selectedCampaign.clicks)} hint="Imported from Meta insights." />
                    <StatCard label="CTR" value={selectedCampaign.ctr != null ? `${formatMetric(selectedCampaign.ctr, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "-"} hint="Click-through rate." />
                    <StatCard label="CPC (EGP)" value={formatMetric(selectedCampaign.cpc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hint="Cost per click." />
                    <StatCard label={selectedCampaign.result_label || "Results"} value={formatMetric(selectedCampaign.results, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} hint="Primary imported result metric." />
                    <StatCard label="Ad Sets" value={selectedCampaign.ad_sets?.length ?? 0} hint="Ad sets currently nested under this campaign." />
                    <StatCard label="Metrics Synced" value={selectedCampaign.metrics_synced_at ? toDateInput(selectedCampaign.metrics_synced_at) : "-"} hint="Last import/sync date." />
                  </div>
                  <form className="space-y-4" onSubmit={updateCampaign}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <WorkflowInput label="Name" name="edit-campaign-name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} required />
                      <WorkflowSelect label="Platform" value={editForm.platform} onChange={(value) => setEditForm((current) => ({ ...current, platform: value }))} options={platformOptions} required allowEmpty={false} />
                      <WorkflowInput label="Start Date" name="edit-campaign-start" type="date" value={editForm.start_date} onChange={(value) => setEditForm((current) => ({ ...current, start_date: value }))} />
                      <WorkflowInput label="End Date" name="edit-campaign-end" type="date" value={editForm.end_date} onChange={(value) => setEditForm((current) => ({ ...current, end_date: value }))} />
                      <WorkflowInput label="Budget" name="edit-campaign-budget" type="number" value={editForm.budget} onChange={(value) => setEditForm((current) => ({ ...current, budget: value }))} />
                      <WorkflowInput label="Currency" name="edit-campaign-currency" value={editForm.currency} onChange={(value) => setEditForm((current) => ({ ...current, currency: value.toUpperCase() }))} />
                      <WorkflowSelect label="Status" value={editForm.status} onChange={(value) => setEditForm((current) => ({ ...current, status: value }))} options={statusOptions} emptyLabel="No status" />
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
                </Panel>
              </div>

              <div className="mt-5">
                <Panel title="Ad Sets" description="Imported ad sets nested under this campaign from the selected Meta ad account.">
                  {selectedCampaign.ad_sets?.length ? (
                    <div className="space-y-3">
                      {selectedCampaign.ad_sets.map((adSet) => (
                        <div key={adSet.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-950">{adSet.name}</div>
                              <div className="mt-1 break-all text-xs text-slate-500">Ad Set ID {adSet.id}</div>
                            </div>
                            <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">{adSet.status || "No status"}</div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                            {adSet.optimization_goal ? <span>{adSet.optimization_goal}</span> : null}
                            {adSet.budget != null ? <span>Budget {formatMetric(adSet.budget, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                      No ad sets were returned for this campaign at import time.
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
