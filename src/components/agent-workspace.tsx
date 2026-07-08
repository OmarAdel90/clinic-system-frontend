"use client";

import { useEffect, useState } from "react";
import { fetchCollection, fetchResource } from "@/lib/api";
import type { AgentMetrics, Conversation, FollowUp, Lead } from "@/lib/types";
import { formatLocalDateTime, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";

export function AgentWorkspace() {
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setError(null);
      try {
        const [metricsRow, followupRows, conversationRows, leadRows] = await Promise.all([
          fetchResource<AgentMetrics>("/agent/metrics"),
          fetchCollection<FollowUp>("/agent/followups"),
          fetchCollection<Conversation>("/agent/conversations"),
          fetchCollection<Lead>("/agent/leads"),
        ]);

        setMetrics(metricsRow);
        setFollowups(followupRows);
        setConversations(conversationRows);
        setLeads(leadRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load agent workspace.");
      }
    }

    void load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Workspace"
        description={`Follow-ups, active conversations, and live performance metrics rendered in ${getBrowserTimeZone()}.`}
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned Leads" value={metrics?.total_number_of_leads ?? 0} hint="Distinct leads currently tied to your conversations." />
        <StatCard label="Converted Leads" value={metrics?.total_converted_leads ?? 0} hint="Leads pushed through to clinical conversion." />
        <StatCard label="Pending Follow-Ups" value={metrics?.pending_reminders ?? 0} hint="Tasks still open in your action queue." />
        <StatCard label="Avg Response" value={metrics?.average_response_time ? `${metrics.average_response_time} min` : "—"} hint="Average first response time from inbound to outbound reply." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Follow-Up Queue" description="Tasks created from reminders, missed visits, cancellations, and completed reports.">
          <div className="space-y-3">
            {followups.map((followup) => (
              <div key={followup.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="text-sm font-semibold text-slate-950">{followup.conversation?.lead?.name || `Lead #${followup.conversation?.lead_id ?? "—"}`}</div>
                <p className="mt-2 text-sm text-slate-600">{followup.body || "No follow-up body provided."}</p>
                <div className="mt-3 text-xs text-slate-500">Due: {formatLocalDateTime(followup.due_at)}</div>
              </div>
            ))}
            {followups.length === 0 ? <div className="text-sm text-slate-500">No pending follow-ups.</div> : null}
          </div>
        </Panel>

        <Panel title="Active Conversations" description="Recent assigned conversations with local timestamps and lifecycle visibility.">
          <div className="space-y-3">
            {conversations.map((conversation) => (
              <div key={conversation.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      {conversation.lead?.name || conversation.lead?.profile_name || `Lead #${conversation.lead_id ?? conversation.id}`}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {conversation.platform || "Unknown channel"} | Last touch {formatLocalDateTime(conversation.last_message_time)}
                    </div>
                  </div>
                  <StatusBadge value={conversation.lead_status || "active"} />
                </div>
              </div>
            ))}
            {conversations.length === 0 ? <div className="text-sm text-slate-500">No assigned conversations yet.</div> : null}
          </div>
        </Panel>
      </div>

      <Panel title="Assigned Lead Snapshot" description="A quick read on the leads currently attached to your conversation queue.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {leads.map((lead) => (
            <div key={lead.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="text-sm font-semibold text-slate-950">{lead.name || lead.profile_name || `Lead #${lead.id}`}</div>
              <div className="mt-2 text-sm text-slate-600">{lead.phone || "No phone"} | {lead.platform || "Unknown channel"}</div>
              <div className="mt-3 flex items-center justify-between">
                <StatusBadge value={lead.lead_status?.key || String(lead.lead_status_id ?? "new")} />
                <span className="text-xs text-slate-500">Created {formatLocalDateTime(lead.created_at)}</span>
              </div>
            </div>
          ))}
          {leads.length === 0 ? <div className="text-sm text-slate-500">No assigned leads yet.</div> : null}
        </div>
      </Panel>
    </div>
  );
}
