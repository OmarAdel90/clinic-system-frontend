"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCollection, fetchResource } from "@/lib/api";
import { formatLocalDateTime, getBrowserTimeZone } from "@/lib/time";
import type {
  AgentMetrics,
  Clinic,
  FollowUp,
  Invoice,
  Lead,
  TreatmentPlanRef,
  Visit,
  Warehouse,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";

type DashboardState = {
  leads: Lead[];
  visits: Visit[];
  invoices: Invoice[];
  clinics: Clinic[];
  followups: FollowUp[];
  metrics: AgentMetrics | null;
  teamMetrics: AgentMetrics[];
  treatmentPlans: TreatmentPlanRef[];
  warehouses: Warehouse[];
};

type PaginatedResponse<T> = {
  data: T[];
};

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-EG", {
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "clinical" | "finance" | "performance">("overview");
  const [state, setState] = useState<DashboardState>({
    leads: [],
    visits: [],
    invoices: [],
    clinics: [],
    followups: [],
    metrics: null,
    teamMetrics: [],
    treatmentPlans: [],
    warehouses: [],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [leads, visits, invoices, clinics, followups, metrics, teamMetrics, treatmentPlans, warehouses] = await Promise.all([
          fetchResource<PaginatedResponse<Lead>>("/leads?page=1&per_page=100").then((response) => response.data).catch(() => []),
          fetchCollection<Visit>("/visits").catch(() => []),
          fetchCollection<Invoice>("/invoices").catch(() => []),
          fetchResource<PaginatedResponse<Clinic>>("/clinics?page=1&per_page=100").then((response) => response.data).catch(() => []),
          fetchCollection<FollowUp>("/agent/followups").catch(() => []),
          fetchResource<AgentMetrics>("/agent/metrics").catch(() => null),
          fetchCollection<AgentMetrics>("/agent/metrics/team").catch(() => []),
          fetchCollection<TreatmentPlanRef>("/treatment-plans").catch(() => []),
          fetchCollection<Warehouse>("/warehouses").catch(() => []),
        ]);

        setState({ leads, visits, invoices, clinics, followups, metrics, teamMetrics, treatmentPlans, warehouses });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load dashboard.");
      }
    }

    void load();
  }, []);

  const derived = useMemo(() => {
    const scheduledVisits = state.visits.filter((visit) => visit.status === "scheduled").length;
    const confirmedVisits = state.visits.filter((visit) => visit.status === "confirmed").length;
    const completedVisits = state.visits.filter((visit) => visit.status === "completed").length;
    const missedVisits = state.visits.filter((visit) => visit.status === "missed").length;
    const cancelledVisits = state.visits.filter((visit) => visit.status === "cancelled").length;

    const totalRevenue = state.invoices.reduce((sum, invoice) => sum + Number(invoice.total_cost ?? 0), 0);
    const collectedRevenue = state.invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid ?? 0), 0);
    const outstandingRevenue = Math.max(totalRevenue - collectedRevenue, 0);

    const unpaidInvoices = state.invoices.filter((invoice) => invoice.status === "unpaid").length;
    const partialInvoices = state.invoices.filter((invoice) => invoice.status === "partial").length;
    const paidInvoices = state.invoices.filter((invoice) => invoice.status === "paid").length;

    const convertedLeads = state.leads.filter((lead) => lead.lead_status?.key === "converted" || lead.lead_status?.label?.toLowerCase() === "converted").length;
    const qualifiedLeads = state.leads.filter((lead) => Boolean(lead.lead_status?.is_qualified)).length;

    const activePlans = state.treatmentPlans.filter((plan) => plan.status === "active").length;
    const completedPlans = state.treatmentPlans.filter((plan) => plan.status === "completed").length;

    const criticalStock = state.warehouses.flatMap((warehouse) => warehouse.inventories ?? []).filter((item) => {
      const quantity = Number(item.quantity ?? 0);
      const reserved = Number(item.reserved_quantity ?? 0);
      const available = typeof item.available === "number" ? item.available : quantity - reserved;
      return quantity > 0 && available / quantity <= 0.15;
    }).length;

    const clinicBreakdown = state.clinics.map((clinic) => ({
      id: clinic.id,
      name: clinic.name,
      visits: state.visits.filter((visit) => visit.clinic_id === clinic.id).length,
      revenue: state.invoices
        .filter((invoice) => invoice.clinic_id === clinic.id)
        .reduce((sum, invoice) => sum + Number(invoice.total_cost ?? 0), 0),
      plans: state.treatmentPlans.filter((plan) => plan.clinic_id === clinic.id).length,
    })).sort((a, b) => b.visits - a.visits || b.revenue - a.revenue);

    const recentVisits = [...state.visits]
      .sort((a, b) => new Date(b.scheduled_date || b.visit_date || 0).getTime() - new Date(a.scheduled_date || a.visit_date || 0).getTime())
      .slice(0, 5);

    const recentInvoices = [...state.invoices]
      .sort((a, b) => new Date(b.issued_at || 0).getTime() - new Date(a.issued_at || 0).getTime())
      .slice(0, 5);

    return {
      scheduledVisits,
      confirmedVisits,
      completedVisits,
      missedVisits,
      cancelledVisits,
      totalRevenue,
      collectedRevenue,
      outstandingRevenue,
      unpaidInvoices,
      partialInvoices,
      paidInvoices,
      convertedLeads,
      qualifiedLeads,
      activePlans,
      completedPlans,
      criticalStock,
      clinicBreakdown,
      recentVisits,
      recentInvoices,
    };
  }, [state]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        description={`High-level CRM and clinic operations summary rendered in ${getBrowserTimeZone()}.`}
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <section className="rounded-2xl border border-[var(--line)] bg-white px-5 py-5 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Today&apos;s overview</div>
              <h2 className="text-2xl font-semibold text-slate-950">Keep the pipeline, visits, and cashflow in one glance.</h2>
              <p className="max-w-3xl text-sm text-slate-600">
                This board is trimmed down to the numbers that matter most while you are running the operation.
              </p>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[420px]">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-700">Collected</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-950">{formatAmount(derived.collectedRevenue)}</div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">Outstanding</div>
                <div className="mt-2 text-2xl font-semibold text-amber-950">{formatAmount(derived.outstandingRevenue)}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-white px-5 py-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Alerts</div>
              <h3 className="mt-2 text-base font-semibold text-slate-950">Operational pressure</h3>
            </div>
            <StatusBadge value={derived.criticalStock > 0 ? "attention" : "healthy"} />
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600">
            <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <span>Pending follow-ups</span>
              <span className="font-semibold text-slate-950">{state.followups.length}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <span>Missed or cancelled visits</span>
              <span className="font-semibold text-slate-950">{derived.missedVisits + derived.cancelledVisits}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <span>Critical stock rows</span>
              <span className="font-semibold text-slate-950">{derived.criticalStock}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Leads" value={state.leads.length} hint="Pipeline records loaded into the CRM." />
        <StatCard label="Qualified" value={derived.qualifiedLeads} hint="Leads currently in qualified-style statuses." />
        <StatCard label="Converted" value={derived.convertedLeads} hint="Leads already moved into converted status." />
        <StatCard label="Active Plans" value={derived.activePlans} hint="Treatment plans that are still in progress." />
      </div>

      <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "overview", label: "Overview" },
              { key: "clinical", label: "Clinical" },
              { key: "finance", label: "Finance" },
              { key: "performance", label: "Performance" },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active ? "bg-slate-900 text-white" : "border border-[var(--line)] bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-5">
          {activeTab === "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                  <div className="border-b border-[var(--line)] px-5 py-4">
                    <h3 className="text-base font-semibold text-slate-950">Visit Pipeline</h3>
                    <p className="mt-1 text-sm text-slate-600">Current flow from booking through completion.</p>
                  </div>
                  <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-4">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Scheduled</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{derived.scheduledVisits}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-4">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Confirmed</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{derived.confirmedVisits}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-4">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Completed</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{derived.completedVisits}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-4">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Loss</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{derived.missedVisits + derived.cancelledVisits}</div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                  <div className="border-b border-[var(--line)] px-5 py-4">
                    <h3 className="text-base font-semibold text-slate-950">Treatment Plan Progress</h3>
                    <p className="mt-1 text-sm text-slate-600">How many plans are still in flight versus fully completed.</p>
                  </div>
                  <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
                    <StatCard label="Active Plans" value={derived.activePlans} hint="Plans still driving scheduled/completed visits." />
                    <StatCard label="Completed Plans" value={derived.completedPlans} hint="Plans whose required visit count has been fulfilled." />
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                <div className="border-b border-[var(--line)] px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-950">Recent Visits</h3>
                  <p className="mt-1 text-sm text-slate-600">Latest operational movement across the booking flow.</p>
                </div>
                <div className="space-y-3 px-5 py-5">
                  {derived.recentVisits.map((visit) => (
                    <div key={visit.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-950">{visit.visit_number || `Visit #${visit.id}`}</div>
                          <div className="mt-1 text-sm text-slate-600">{visit.lead?.name || visit.lead?.profile_name || `Lead #${visit.lead_id}`}</div>
                        </div>
                        <StatusBadge value={visit.status} />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                        <div>{visit.clinic?.name || `Clinic #${visit.clinic_id ?? "-"}`}</div>
                        <div>{formatLocalDateTime(visit.scheduled_date || visit.visit_date)}</div>
                      </div>
                    </div>
                  ))}
                  {derived.recentVisits.length === 0 ? <div className="text-sm text-slate-500">No visit activity returned yet.</div> : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "clinical" ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                <div className="border-b border-[var(--line)] px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-950">Clinic Load & Revenue</h3>
                  <p className="mt-1 text-sm text-slate-600">Top clinics by activity, plan volume, and billing.</p>
                </div>
                <div className="space-y-2 px-5 py-4">
                  {derived.clinicBreakdown.slice(0, 6).map((clinic) => (
                    <div key={clinic.id} className="grid gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-4 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,0.7fr))] md:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">{clinic.name}</div>
                      </div>
                      <div className="text-sm text-slate-600">Visits <span className="font-semibold text-slate-950">{clinic.visits}</span></div>
                      <div className="text-sm text-slate-600">Plans <span className="font-semibold text-slate-950">{clinic.plans}</span></div>
                      <div className="text-sm text-slate-600">Revenue <span className="font-semibold text-slate-950">{formatAmount(clinic.revenue)}</span></div>
                    </div>
                  ))}
                  {derived.clinicBreakdown.length === 0 ? <div className="text-sm text-slate-500">No clinic reporting data yet.</div> : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "finance" ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                <div className="border-b border-[var(--line)] px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-950">Billing Recovery</h3>
                  <p className="mt-1 text-sm text-slate-600">A tighter view of revenue and collection health.</p>
                </div>
                <div className="grid gap-3 px-5 py-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-4">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Total Revenue</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{formatAmount(derived.totalRevenue)}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-4">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Collected</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{formatAmount(derived.collectedRevenue)}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-4">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Outstanding</div>
                      <div className="mt-2 text-2xl font-semibold text-slate-950">{formatAmount(derived.outstandingRevenue)}</div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <StatCard label="Unpaid" value={derived.unpaidInvoices} hint="Invoices with no payment yet." />
                    <StatCard label="Partial" value={derived.partialInvoices} hint="Invoices that still have an open balance." />
                    <StatCard label="Paid" value={derived.paidInvoices} hint="Invoices that are fully settled." />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                <div className="border-b border-[var(--line)] px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-950">Recent Invoices</h3>
                  <p className="mt-1 text-sm text-slate-600">Latest billing output tied to completed care.</p>
                </div>
                <div className="space-y-3 px-5 py-5">
                  {derived.recentInvoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">{invoice.invoice_number || `Invoice #${invoice.id}`}</div>
                          <div className="mt-1 truncate text-sm text-slate-600">{invoice.lead?.name || invoice.lead?.profile_name || `Lead #${invoice.lead_id ?? "-"}`}</div>
                        </div>
                        <StatusBadge value={invoice.status} />
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                        <div>Total {formatAmount(Number(invoice.total_cost ?? 0))}</div>
                        <div>Paid {formatAmount(Number(invoice.amount_paid ?? 0))}</div>
                        <div>{formatLocalDateTime(invoice.issued_at)}</div>
                      </div>
                    </div>
                  ))}
                  {derived.recentInvoices.length === 0 ? <div className="text-sm text-slate-500">No invoice activity returned yet.</div> : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "performance" ? (
            <div className="space-y-6">
              <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                <div className="border-b border-[var(--line)] px-5 py-4">
                  <h3 className="text-base font-semibold text-slate-950">Personal Performance Snapshot</h3>
                  <p className="mt-1 text-sm text-slate-600">Authenticated-user metrics still visible inside the broader manager dashboard.</p>
                </div>
                <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
                  <StatCard label="Average Response" value={state.metrics?.average_response_time ? `${state.metrics.average_response_time} min` : "-"} hint="Average response time across recent conversations." />
                  <StatCard label="Attendance" value={state.metrics?.total_customer_attendance ?? 0} hint="Completed patient visits linked to the current operator." />
                  <StatCard label="Completed Reminders" value={state.metrics?.completed_reminders ?? 0} hint="Follow-ups already closed by the authenticated user." />
                </div>
              </section>

              {state.teamMetrics.length > 0 ? (
                <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                  <div className="border-b border-[var(--line)] px-5 py-4">
                    <h3 className="text-base font-semibold text-slate-950">Team Metrics</h3>
                    <p className="mt-1 text-sm text-slate-600">Supervisor view across active agents and their recent performance.</p>
                  </div>
                  <div className="space-y-2 px-5 py-5">
                    {state.teamMetrics.map((metric) => (
                      <div key={metric.user_id} className="grid gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.7fr))] md:items-center">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">{metric.user_name}</div>
                        </div>
                        <div className="text-sm text-slate-600">Response <span className="font-semibold text-slate-950">{metric.average_response_time ? `${metric.average_response_time} min` : "-"}</span></div>
                        <div className="text-sm text-slate-600">Leads <span className="font-semibold text-slate-950">{metric.total_number_of_leads}</span></div>
                        <div className="text-sm text-slate-600">Converted <span className="font-semibold text-slate-950">{metric.total_converted_leads}</span></div>
                        <div className="text-sm text-slate-600">Attendance <span className="font-semibold text-slate-950">{metric.total_customer_attendance}</span></div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
