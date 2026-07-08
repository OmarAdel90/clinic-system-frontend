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
  treatmentPlans: TreatmentPlanRef[];
  warehouses: Warehouse[];
};

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    leads: [],
    visits: [],
    invoices: [],
    clinics: [],
    followups: [],
    metrics: null,
    treatmentPlans: [],
    warehouses: [],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [leads, visits, invoices, clinics, followups, metrics, treatmentPlans, warehouses] = await Promise.all([
          fetchCollection<Lead>("/leads"),
          fetchCollection<Visit>("/visits"),
          fetchCollection<Invoice>("/invoices"),
          fetchCollection<Clinic>("/clinics"),
          fetchCollection<FollowUp>("/agent/followups").catch(() => []),
          fetchResource<AgentMetrics>("/agent/metrics").catch(() => null),
          fetchCollection<TreatmentPlanRef>("/treatment-plans").catch(() => []),
          fetchCollection<Warehouse>("/warehouses").catch(() => []),
        ]);

        setState({ leads, visits, invoices, clinics, followups, metrics, treatmentPlans, warehouses });
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
        description={`Manager reporting for lead conversion, visit execution, billing recovery, and stock pressure rendered in ${getBrowserTimeZone()}.`}
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Leads" value={state.leads.length} hint="CRM pipeline records currently visible to your role." />
        <StatCard label="Qualified Leads" value={derived.qualifiedLeads} hint="Leads currently sitting in qualified-type statuses." />
        <StatCard label="Converted Leads" value={derived.convertedLeads} hint="Leads already pushed into converted status." />
        <StatCard label="Pending Follow-Ups" value={state.followups.length} hint="Outstanding follow-up tasks still active in the queue." />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scheduled Visits" value={derived.scheduledVisits} hint="Visits waiting on confirmation." />
        <StatCard label="Confirmed Visits" value={derived.confirmedVisits} hint="Visits ready to complete or miss." />
        <StatCard label="Completed Visits" value={derived.completedVisits} hint="Visits already converted into reports and billing impact." />
        <StatCard label="Missed/Cancelled" value={`${derived.missedVisits + derived.cancelledVisits}`} hint="Visit loss or reschedule pressure across the operation." />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Revenue" value={derived.totalRevenue} hint="Total invoice value across the loaded billing set." />
        <StatCard label="Collected" value={derived.collectedRevenue} hint="Payments actually collected so far." />
        <StatCard label="Outstanding" value={derived.outstandingRevenue} hint="Remaining balance still open across invoices." />
        <StatCard label="Critical Stock" value={derived.criticalStock} hint="Inventory rows where available stock is very tight or exhausted." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Clinic Load & Revenue</h3>
            <p className="mt-1 text-sm text-slate-600">Clinic-by-clinic activity snapshot based on visits, plans, and billing volume.</p>
          </div>
          <div className="space-y-3 px-5 py-5">
            {derived.clinicBreakdown.slice(0, 6).map((clinic) => (
              <div key={clinic.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-950">{clinic.name}</div>
                  <div className="text-xs text-slate-500">Visits {clinic.visits}</div>
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                  <div>Plans: {clinic.plans}</div>
                  <div>Revenue: {clinic.revenue}</div>
                </div>
              </div>
            ))}
            {derived.clinicBreakdown.length === 0 ? <div className="text-sm text-slate-500">No clinic reporting data yet.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Billing Recovery</h3>
            <p className="mt-1 text-sm text-slate-600">Quick read on payment collection progress and invoice health.</p>
          </div>
          <div className="grid gap-4 px-5 py-5 md:grid-cols-3">
            <StatCard label="Unpaid" value={derived.unpaidInvoices} hint="Invoices with no payment yet." />
            <StatCard label="Partial" value={derived.partialInvoices} hint="Invoices that still have an open balance." />
            <StatCard label="Paid" value={derived.paidInvoices} hint="Invoices that are fully settled." />
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Recent Visits</h3>
            <p className="mt-1 text-sm text-slate-600">Latest operational movement across scheduled, confirmed, and completed visits.</p>
          </div>
          <div className="space-y-3 px-5 py-5">
            {derived.recentVisits.map((visit) => (
              <div key={visit.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
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

        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Recent Invoices</h3>
            <p className="mt-1 text-sm text-slate-600">Latest billing output tied to completed care.</p>
          </div>
          <div className="space-y-3 px-5 py-5">
            {derived.recentInvoices.map((invoice) => (
              <div key={invoice.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{invoice.invoice_number || `Invoice #${invoice.id}`}</div>
                    <div className="mt-1 text-sm text-slate-600">{invoice.lead?.name || invoice.lead?.profile_name || `Lead #${invoice.lead_id ?? "-"}`}</div>
                  </div>
                  <StatusBadge value={invoice.status} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                  <div>Total {invoice.total_cost ?? 0}</div>
                  <div>Paid {invoice.amount_paid ?? 0}</div>
                  <div>{formatLocalDateTime(invoice.issued_at)}</div>
                </div>
              </div>
            ))}
            {derived.recentInvoices.length === 0 ? <div className="text-sm text-slate-500">No invoice activity returned yet.</div> : null}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Treatment Plan Progress</h3>
            <p className="mt-1 text-sm text-slate-600">How many plans are still in flight versus fully completed.</p>
          </div>
          <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
            <StatCard label="Active Plans" value={derived.activePlans} hint="Plans still driving scheduled/completed visits." />
            <StatCard label="Completed Plans" value={derived.completedPlans} hint="Plans whose required visit count has been fulfilled." />
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Personal Performance Snapshot</h3>
            <p className="mt-1 text-sm text-slate-600">Authenticated-user metrics still visible inside the broader manager dashboard.</p>
          </div>
          <div className="grid gap-4 px-5 py-5 md:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Average Response" value={state.metrics?.average_response_time ? `${state.metrics.average_response_time} min` : "-"} hint="Average first response time from inbound to outbound reply." />
            <StatCard label="Attendance" value={state.metrics?.total_customer_attendance ?? 0} hint="Completed patient visits linked to the current operator." />
            <StatCard label="Completed Reminders" value={state.metrics?.completed_reminders ?? 0} hint="Follow-ups already closed by the authenticated user." />
          </div>
        </section>
      </div>
    </div>
  );
}
