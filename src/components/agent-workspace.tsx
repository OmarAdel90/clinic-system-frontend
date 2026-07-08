"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchCollection, fetchResource, mutateJson } from "@/lib/api";
import type {
  AgentMetrics,
  Conversation,
  FollowUp,
  Lead,
  MessageRecord,
} from "@/lib/types";
import { formatLocalDateTime, formatRelativeDateLabel, getBrowserTimeZone } from "@/lib/time";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";

export function AgentWorkspace() {
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<Record<number, MessageRecord[]>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [composerBody, setComposerBody] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [completingFollowupId, setCompletingFollowupId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0] ?? null,
    [conversations, selectedConversationId],
  );

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    if (messages[selectedConversation.id]) {
      return;
    }

    void loadMessages(selectedConversation.id);
  }, [selectedConversation, messages]);

  async function loadWorkspace(options?: { silent?: boolean }) {
    if (options?.silent) {
      setRefreshing(true);
    }

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
      setSelectedConversationId((current) => {
        if (current && conversationRows.some((conversation) => conversation.id === current)) {
          return current;
        }

        return conversationRows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load agent workspace.");
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMessages(conversationId: number) {
    setLoadingMessages(true);
    setError(null);

    try {
      const rows = await fetchCollection<MessageRecord>(`/agent/conversations/${conversationId}/messages`);
      setMessages((current) => ({ ...current, [conversationId]: rows }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load conversation messages.");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversation || !composerBody.trim()) {
      return;
    }

    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await mutateJson<{ messages: MessageRecord[] }>("/agent/messages/send", "POST", {
        conversation_id: selectedConversation.id,
        body: composerBody.trim(),
      });

      setMessages((current) => ({
        ...current,
        [selectedConversation.id]: response.messages,
      }));
      setComposerBody("");
      setNotice(`Message sent in conversation #${selectedConversation.id}.`);
      await loadWorkspace({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  async function completeFollowup(followupId: number) {
    setCompletingFollowupId(followupId);
    setError(null);
    setNotice(null);

    try {
      await mutateJson<FollowUp>(`/agent/followups/${followupId}/complete`, "PATCH", {});
      setFollowups((current) => current.filter((followup) => followup.id !== followupId));
      setMetrics((current) =>
        current
          ? {
              ...current,
              completed_reminders: current.completed_reminders + 1,
              pending_reminders: Math.max(current.pending_reminders - 1, 0),
            }
          : current,
      );
      setNotice(`Follow-up #${followupId} marked complete.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete follow-up.");
    } finally {
      setCompletingFollowupId(null);
    }
  }

  const selectedLead = leads.find((lead) => lead.id === selectedConversation?.lead_id);
  const selectedMessages = selectedConversation ? messages[selectedConversation.id] ?? [] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Workspace"
        description={`Follow-ups, active conversations, and live performance metrics rendered in ${getBrowserTimeZone()}.`}
        actions={
          <button
            type="button"
            onClick={() => void loadWorkspace({ silent: true })}
            className="rounded-lg border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{notice}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assigned Leads" value={metrics?.total_number_of_leads ?? 0} hint="Distinct leads currently tied to your conversations." />
        <StatCard label="Converted Leads" value={metrics?.total_converted_leads ?? 0} hint="Leads pushed through to clinical conversion." />
        <StatCard label="Pending Follow-Ups" value={metrics?.pending_reminders ?? followups.length} hint="Tasks still open in your action queue." />
        <StatCard label="Avg Response" value={metrics?.average_response_time ? `${metrics.average_response_time} min` : "-"} hint="Average first response time from inbound to outbound reply." />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <Panel title="Follow-Up Queue" description="Actionable reminders generated from reminders, missed visits, cancellations, and completed reports.">
          <div className="space-y-3">
            {followups.map((followup) => (
              <div key={followup.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{followup.conversation?.lead?.name || `Lead #${followup.conversation?.lead_id ?? "-"}`}</div>
                    <p className="mt-2 text-sm text-slate-600">{followup.body || "No follow-up body provided."}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void completeFollowup(followup.id)}
                    disabled={completingFollowupId === followup.id}
                    className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {completingFollowupId === followup.id ? "Completing..." : "Complete"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Due {formatLocalDateTime(followup.due_at)}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-slate-600">{formatRelativeDateLabel(followup.due_at)}</span>
                </div>
              </div>
            ))}
            {followups.length === 0 ? <div className="text-sm text-slate-500">No pending follow-ups.</div> : null}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Conversation Desk" description="Recent assigned conversations with a live thread, local timestamps, and quick outbound replies.">
            <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
              <div className="space-y-3">
                {conversations.map((conversation) => {
                  const active = selectedConversation?.id === conversation.id;

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            {conversation.lead?.name || conversation.lead?.profile_name || `Lead #${conversation.lead_id ?? conversation.id}`}
                          </div>
                          <div className={`mt-1 text-sm ${active ? "text-slate-200" : "text-slate-600"}`}>
                            {conversation.platform || "Unknown channel"}
                          </div>
                        </div>
                        <StatusBadge value={conversation.lead_status || conversation.status || "active"} />
                      </div>
                      <div className={`mt-3 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                        Last touch {formatLocalDateTime(conversation.last_message_time)}
                      </div>
                    </button>
                  );
                })}
                {conversations.length === 0 ? <div className="text-sm text-slate-500">No assigned conversations yet.</div> : null}
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-white p-4">
                {selectedConversation ? (
                  <div className="space-y-4">
                    <div className="border-b border-[var(--line)] pb-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-base font-semibold text-slate-950">
                            {selectedConversation.lead?.name || selectedConversation.lead?.profile_name || `Lead #${selectedConversation.lead_id}`}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {selectedLead?.phone || "No phone"} | {selectedConversation.platform || "Unknown channel"}
                          </div>
                        </div>
                        <StatusBadge value={selectedConversation.lead_status || selectedConversation.status || "active"} />
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                        <div>First touch: {formatLocalDateTime(selectedConversation.first_message_time)}</div>
                        <div>Last touch: {formatLocalDateTime(selectedConversation.last_message_time)}</div>
                        <div>Converted: {formatLocalDateTime(selectedConversation.converted_at)}</div>
                        <div>{formatRelativeDateLabel(selectedConversation.last_message_time)}</div>
                      </div>
                    </div>

                    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {loadingMessages ? <div className="text-sm text-slate-500">Loading messages...</div> : null}
                      {!loadingMessages && selectedMessages.length === 0 ? <div className="text-sm text-slate-500">No messages returned for this conversation yet.</div> : null}
                      {selectedMessages.map((message) => {
                        const outbound = message.direction === "outbound";
                        const stamp = message.sent_at || message.created_at;

                        return (
                          <div key={message.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${outbound ? "bg-slate-900 text-white" : "bg-[var(--surface)] text-slate-900"}`}>
                              <div className="text-sm leading-6">{message.body || message.media_caption || message.type || "Message"}</div>
                              <div className={`mt-2 text-[11px] ${outbound ? "text-slate-300" : "text-slate-500"}`}>
                                {outbound ? message.user?.name || "You" : "Lead"} | {formatLocalDateTime(stamp)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form className="space-y-3 border-t border-[var(--line)] pt-4" onSubmit={handleSendMessage}>
                      <textarea
                        value={composerBody}
                        onChange={(event) => setComposerBody(event.target.value)}
                        rows={4}
                        placeholder="Type a reply to the selected conversation"
                        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">Replies are sent through the backend messaging service for this conversation.</div>
                        <button
                          type="submit"
                          disabled={sending || !composerBody.trim()}
                          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {sending ? "Sending..." : "Send Message"}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Select a conversation to work the thread.</div>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Assigned Lead Snapshot" description="A quick read on the leads currently attached to your conversation queue.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {leads.map((lead) => (
                <div key={lead.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-sm font-semibold text-slate-950">{lead.name || lead.profile_name || `Lead #${lead.id}`}</div>
                  <div className="mt-2 text-sm text-slate-600">{lead.phone || "No phone"} | {lead.platform || "Unknown channel"}</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <StatusBadge value={lead.lead_status?.key || String(lead.lead_status_id ?? "new")} />
                    <span className="text-xs text-slate-500">Created {formatLocalDateTime(lead.created_at)}</span>
                  </div>
                </div>
              ))}
              {leads.length === 0 ? <div className="text-sm text-slate-500">No assigned leads yet.</div> : null}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
