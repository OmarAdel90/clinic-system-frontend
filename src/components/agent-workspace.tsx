"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { WorkflowInput } from "@/components/workflow-input";
import { WorkflowSelect } from "@/components/workflow-select";

function getLeadStatusDisplay(lead: Lead) {
  return lead.lead_status?.label || lead.lead_status?.key || String(lead.lead_status_id ?? "new");
}

function getLeadStatusColor(lead: Lead) {
  return lead.lead_status?.color || null;
}

function getConversationTitle(conversation: Conversation) {
  return conversation.lead?.name || conversation.lead?.profile_name || `Lead #${conversation.lead_id ?? conversation.id}`;
}

function getMessagePreview(rows: MessageRecord[]) {
  const latest = rows[rows.length - 1];
  if (!latest) return "No messages loaded yet.";
  return latest.body || latest.media_caption || latest.type || "Message";
}

function getPlatformLabel(platform?: string | null) {
  if (!platform) return "Unknown channel";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export function AgentWorkspace() {
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<Record<number, MessageRecord[]>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [composerBody, setComposerBody] = useState("");
  const [followupSearch, setFollowupSearch] = useState("");
  const [followupTiming, setFollowupTiming] = useState("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationPlatform, setConversationPlatform] = useState("all");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [completingFollowupId, setCompletingFollowupId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [threadRefreshing, setThreadRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const threadViewportRef = useRef<HTMLDivElement | null>(null);

  const filteredFollowups = useMemo(() => {
    const term = followupSearch.trim().toLowerCase();
    const now = new Date();

    return followups.filter((followup) => {
      const dueDate = followup.due_at ? new Date(followup.due_at) : null;
      const relative = formatRelativeDateLabel(followup.due_at).toLowerCase();
      const leadName = followup.conversation?.lead?.name || followup.conversation?.lead?.profile_name || "";
      const matchesSearch =
        term.length === 0 ||
        [leadName, followup.body, String(followup.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      const matchesTiming =
        followupTiming === "all" ||
        (followupTiming === "overdue" && dueDate && dueDate.getTime() < now.getTime()) ||
        (followupTiming === "today" && relative === "today") ||
        (followupTiming === "upcoming" && dueDate && dueDate.getTime() >= now.getTime() && relative !== "today");

      return matchesSearch && matchesTiming;
    });
  }, [followupSearch, followupTiming, followups]);

  const filteredConversations = useMemo(() => {
    const term = conversationSearch.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const leadName = conversation.lead?.name || conversation.lead?.profile_name || "";
      const preview = getMessagePreview(messages[conversation.id] ?? []);
      const matchesSearch =
        term.length === 0 ||
        [leadName, conversation.platform, String(conversation.id), conversation.lead?.phone, preview]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      const matchesPlatform = conversationPlatform === "all" || conversation.platform === conversationPlatform;

      return matchesSearch && matchesPlatform;
    });
  }, [conversationPlatform, conversationSearch, conversations, messages]);

  const selectedConversation = useMemo(
    () =>
      filteredConversations.find((conversation) => conversation.id === selectedConversationId) ??
      conversations.find((conversation) => conversation.id === selectedConversationId) ??
      filteredConversations[0] ??
      conversations[0] ??
      null,
    [conversations, filteredConversations, selectedConversationId],
  );

  const selectedLead = leads.find((lead) => lead.id === selectedConversation?.lead_id);
  const selectedMessages = selectedConversation ? messages[selectedConversation.id] ?? [] : [];
  const platformOptions = Array.from(new Set(conversations.map((conversation) => conversation.platform).filter(Boolean))) as string[];
  const unreadConversations = conversations.filter((conversation) => (conversation.unread_amount ?? 0) > 0).length;

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    if (!messages[selectedConversation.id]) {
      void loadMessages(selectedConversation.id);
    }
  }, [selectedConversation, messages]);

  useEffect(() => {
    const viewport = threadViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [selectedConversation?.id, selectedMessages.length]);

  useEffect(() => {
    const workspaceInterval = window.setInterval(() => {
      void loadWorkspace({ silent: true });
    }, 30000);

    return () => window.clearInterval(workspaceInterval);
  }, []);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    const threadInterval = window.setInterval(() => {
      void loadMessages(selectedConversation.id, { force: true, silent: true });
    }, 12000);

    return () => window.clearInterval(threadInterval);
  }, [selectedConversation?.id]);

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

  async function loadMessages(conversationId: number, options?: { force?: boolean; silent?: boolean }) {
    if (options?.force) {
      setThreadRefreshing(true);
    } else if (!options?.silent) {
      setLoadingMessages(true);
    }
    if (!options?.silent) {
      setError(null);
    }

    try {
      const rows = await fetchCollection<MessageRecord>(`/agent/conversations/${conversationId}/messages`);
      setMessages((current) => ({ ...current, [conversationId]: rows }));
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : "Unable to load conversation messages.");
      }
    } finally {
      setLoadingMessages(false);
      setThreadRefreshing(false);
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
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <WorkflowInput label="Search" name="followup-search" value={followupSearch} onChange={setFollowupSearch} placeholder="Lead name, note, or follow-up id" />
            <WorkflowSelect
              label="Timing"
              value={followupTiming}
              onChange={setFollowupTiming}
              options={[
                { label: "All follow-ups", value: "all" },
                { label: "Overdue", value: "overdue" },
                { label: "Today", value: "today" },
                { label: "Upcoming", value: "upcoming" },
              ]}
            />
          </div>

          <div className="space-y-3">
            {filteredFollowups.map((followup) => (
              <div key={followup.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-950">{followup.conversation?.lead?.name || `Lead #${followup.conversation?.lead_id ?? "-"}`}</div>
                    <p className="mt-2 text-sm text-slate-600">{followup.body || "No follow-up body provided."}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {followup.conversation?.id ? (
                      <button
                        type="button"
                        onClick={() => setSelectedConversationId(followup.conversation?.id ?? null)}
                        className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Open Thread
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void completeFollowup(followup.id)}
                      disabled={completingFollowupId === followup.id}
                      className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {completingFollowupId === followup.id ? "Completing..." : "Complete"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Due {formatLocalDateTime(followup.due_at)}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-slate-600">{formatRelativeDateLabel(followup.due_at)}</span>
                </div>
              </div>
            ))}
            {filteredFollowups.length === 0 ? <div className="text-sm text-slate-500">No pending follow-ups match the current filters.</div> : null}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Conversation Desk" description="Assigned conversations with a proper inbox layout, local timestamps, and quick replies.">
            <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <WorkflowInput label="Search" name="conversation-search" value={conversationSearch} onChange={setConversationSearch} placeholder="Lead name, phone, platform, message preview, or conversation id" />
                  <WorkflowSelect
                    label="Platform"
                    value={conversationPlatform}
                    onChange={setConversationPlatform}
                    options={[{ label: "All platforms", value: "all" }, ...platformOptions.map((platform) => ({ label: platform, value: platform }))]}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Visible Threads</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{filteredConversations.length}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Unread Threads</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{unreadConversations}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Active Channel</div>
                    <div className="mt-2 text-base font-semibold text-slate-950">{selectedConversation ? getPlatformLabel(selectedConversation.platform) : "No selection"}</div>
                  </div>
                </div>

                <div className="max-h-[780px] space-y-3 overflow-y-auto pr-1">
                  {filteredConversations.map((conversation) => {
                    const active = selectedConversation?.id === conversation.id;
                    const cachedMessages = messages[conversation.id] ?? [];
                    const preview = getMessagePreview(cachedMessages);
                    const unread = conversation.unread_amount ?? 0;

                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => setSelectedConversationId(conversation.id)}
                        className={`w-full rounded-xl border p-4 text-left transition ${active ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-[var(--line)] bg-[var(--surface)] hover:border-slate-300 hover:bg-white"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">
                              {getConversationTitle(conversation)}
                            </div>
                            <div className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
                              <span>{getPlatformLabel(conversation.platform)}</span>
                              <span>{conversation.lead?.phone || "No phone"}</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <StatusBadge value={conversation.lead_status || conversation.status || "active"} />
                            {unread > 0 ? <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${active ? "bg-white/15 text-white" : "bg-slate-900 text-white"}`}>{unread} unread</span> : null}
                          </div>
                        </div>
                        <div className={`mt-3 line-clamp-2 text-sm ${active ? "text-slate-200" : "text-slate-600"}`}>{preview}</div>
                        <div className={`mt-3 flex items-center justify-between text-[11px] ${active ? "text-slate-300" : "text-slate-500"}`}>
                          <span>Last touch {formatLocalDateTime(conversation.last_message_time)}</span>
                          <span>{formatRelativeDateLabel(conversation.last_message_time)}</span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredConversations.length === 0 ? <div className="text-sm text-slate-500">No assigned conversations match the current filters.</div> : null}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-xl border border-[var(--line)] bg-white">
                  {selectedConversation ? (
                    <div className="flex h-full min-h-[780px] flex-col">
                      <div className="border-b border-[var(--line)] px-5 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-base font-semibold text-slate-950">{getConversationTitle(selectedConversation)}</div>
                            <div className="mt-1 text-sm text-slate-600">{selectedLead?.phone || "No phone"} | {getPlatformLabel(selectedConversation.platform)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge value={selectedConversation.lead_status || selectedConversation.status || "active"} />
                            <button
                              type="button"
                              onClick={() => void loadMessages(selectedConversation.id, { force: true })}
                              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              {threadRefreshing ? "Refreshing..." : "Refresh Thread"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                          <div>First touch: {formatLocalDateTime(selectedConversation.first_message_time)}</div>
                          <div>Last touch: {formatLocalDateTime(selectedConversation.last_message_time)}</div>
                          <div>Converted: {formatLocalDateTime(selectedConversation.converted_at)}</div>
                          <div>{formatRelativeDateLabel(selectedConversation.last_message_time)}</div>
                        </div>
                      </div>

                      <div ref={threadViewportRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 px-5 py-5">
                        {loadingMessages ? <div className="text-sm text-slate-500">Loading messages...</div> : null}
                        {!loadingMessages && selectedMessages.length === 0 ? <div className="text-sm text-slate-500">No messages returned for this conversation yet.</div> : null}
                        {selectedMessages.map((message) => {
                          const outbound = message.direction === "outbound";
                          const stamp = message.sent_at || message.created_at;

                          return (
                            <div key={message.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[88%] rounded-2xl border px-4 py-3 shadow-sm ${outbound ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
                                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] opacity-80">
                                  <span>{outbound ? message.user?.name || "You" : "Lead"}</span>
                                  <span>{message.type || "message"}</span>
                                  {message.status ? <span>{message.status}</span> : null}
                                </div>
                                <div className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body || message.media_caption || message.type || "Message"}</div>
                                {message.media_url ? (
                                  <a href={message.media_url} target="_blank" rel="noreferrer" className={`mt-3 inline-flex text-xs font-medium underline ${outbound ? "text-slate-200" : "text-slate-600"}`}>
                                    Open media
                                  </a>
                                ) : null}
                                <div className={`mt-3 text-[11px] ${outbound ? "text-slate-300" : "text-slate-500"}`}>{formatLocalDateTime(stamp)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <form className="border-t border-[var(--line)] bg-white px-5 py-4" onSubmit={handleSendMessage}>
                        <div className="space-y-3">
                          <textarea
                            value={composerBody}
                            onChange={(event) => setComposerBody(event.target.value)}
                            rows={4}
                            placeholder="Type a reply to the selected conversation"
                            className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                          />
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="text-xs text-slate-500">Replies are sent through the backend messaging service for this conversation. The thread refreshes automatically while this desk is open.</div>
                            <button
                              type="submit"
                              disabled={sending || !composerBody.trim()}
                              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              {sending ? "Sending..." : "Send Message"}
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="flex min-h-[780px] items-center justify-center px-6 text-sm text-slate-500">Select a conversation to work the thread.</div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Selected Lead</div>
                    <div className="mt-2 text-base font-semibold text-slate-950">{selectedLead ? getConversationTitle({ ...selectedConversation, lead: selectedLead } as Conversation) : "No lead selected"}</div>
                    <div className="mt-2 space-y-2 text-sm text-slate-600">
                      <div>Phone: {selectedLead?.phone || "No phone"}</div>
                      <div>Platform: {selectedLead?.platform || selectedConversation?.platform || "Unknown"}</div>
                      <div>Created: {formatLocalDateTime(selectedLead?.created_at)}</div>
                      <div>Clinic: {selectedLead?.clinic?.name || "Not assigned"}</div>
                    </div>
                    {selectedLead ? (
                      <div className="mt-3 flex items-center gap-2">
                        <StatusBadge value={getLeadStatusDisplay(selectedLead)} color={getLeadStatusColor(selectedLead)} />
                        <span className="text-xs text-slate-500">Lead #{selectedLead.id}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Thread Health</div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <span>Loaded messages</span>
                        <span className="font-semibold text-slate-950">{selectedMessages.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Unread count</span>
                        <span className="font-semibold text-slate-950">{selectedConversation?.unread_amount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Last update</span>
                        <span className="font-semibold text-slate-950">{formatRelativeDateLabel(selectedConversation?.last_message_time)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                    <div className="text-xs uppercase tracking-[0.08em] text-slate-500">Assigned Lead Snapshot</div>
                    <div className="mt-3 space-y-3">
                      {leads.slice(0, 6).map((lead) => (
                        <div key={lead.id} className="rounded-lg border border-white/80 bg-white px-3 py-3">
                          <div className="text-sm font-semibold text-slate-950">{lead.name || lead.profile_name || `Lead #${lead.id}`}</div>
                          <div className="mt-1 text-xs text-slate-500">{lead.phone || "No phone"} | {lead.platform || "Unknown channel"}</div>
                        </div>
                      ))}
                      {leads.length === 0 ? <div className="text-sm text-slate-500">No assigned leads yet.</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
