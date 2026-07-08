"use client";

import { useEffect, useState } from "react";
import { fetchCollection, fetchResource } from "@/lib/api";
import { formatLocalDateTime, getBrowserTimeZone } from "@/lib/time";
import type { AgentMetrics, ApiRecord, FollowUp } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";

type DashboardState = {
  leads: ApiRecord[];
  visits: ApiRecord[];
  invoices: ApiRecord[];
  clinics: ApiRecord[];
  followups: FollowUp[];
  metrics: AgentMetrics | null;
};

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    leads: [],
    visits: [],
    invoices: [],
    clinics: [],
    followups: [],
    metrics: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [leads, visits, invoices, clinics, followups, metrics] = await Promise.all([
          fetchCollection<ApiRecord>("/leads"),
          fetchCollection<ApiRecord>("/visits"),
          fetchCollection<ApiRecord>("/invoices"),
          fetchCollection<ApiRecord>("/clinics"),
          fetchCollection<FollowUp>("/agent/followups").catch(() => []),
          fetchResource<AgentMetrics>("/agent/metrics").catch(() => null),
        ]);

        setState({ leads, visits, invoices, clinics, followups, metrics });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load dashboard.");
      }
    }

    void load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        description={`A fast read on pipeline volume, clinic activity, reminders, and billing rendered in ${getBrowserTimeZone()}.`}
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Leads" value={state.leads.length} hint="Current CRM records visible to your role." />
        <StatCard label="Scheduled Visits" value={state.visits.length} hint="Appointments and visit lifecycle entries." />
        <StatCard label="Pending Follow-Ups" value={state.followups.length} hint="Tasks currently waiting in the agent action queue." />
        <StatCard label="Converted Leads" value={state.metrics?.total_converted_leads ?? 0} hint="Agent-side conversion outcome pulled from the metrics endpoint." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DataTable
          title="Recent Leads"
          description="Lead pipeline entries coming from the CRM module."
          rows={state.leads.slice(0, 6)}
          preferredKeys={["id", "name", "phone", "platform", "lead_status_id", "created_at"]}
        />
        <DataTable
          title="Recent Visits"
          description="Operational scheduling and visit outcomes."
          rows={state.visits.slice(0, 6)}
          preferredKeys={["id", "lead_id", "clinic_id", "scheduled_date", "status", "total_cost"]}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Reminder Queue</h3>
            <p className="mt-1 text-sm text-slate-600">Upcoming follow-ups generated from visit and report workflows.</p>
          </div>
          <div className="space-y-3 px-5 py-5">
            {state.followups.slice(0, 5).map((followup) => (
              <div key={followup.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="text-sm font-semibold text-slate-950">{followup.conversation?.lead?.name || `Lead #${followup.conversation?.lead_id ?? "-"}`}</div>
                <div className="mt-2 text-sm text-slate-600">{followup.body || "No follow-up body provided."}</div>
                <div className="mt-3 text-xs text-slate-500">Due {formatLocalDateTime(followup.due_at)}</div>
              </div>
            ))}
            {state.followups.length === 0 ? <div className="text-sm text-slate-500">No follow-ups in the queue.</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h3 className="text-base font-semibold text-slate-950">Personal Performance Snapshot</h3>
            <p className="mt-1 text-sm text-slate-600">Live operational metrics for the authenticated user.</p>
          </div>
          <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
            <StatCard label="Average Response" value={state.metrics?.average_response_time ? `${state.metrics.average_response_time} min` : "-"} hint="Average first response time from inbound to outbound reply." />
            <StatCard label="Attendance" value={state.metrics?.total_customer_attendance ?? 0} hint="Completed patient visits linked to the current operator." />
          </div>
        </section>
      </div>
    </div>
  );
}
